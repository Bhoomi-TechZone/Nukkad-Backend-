const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const Otp = require('../models/Otp');

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendOtpSchema,
  verifyOtpSchema,
  registerSchema,
  loginSchema,
} = require('../validators/authValidator');

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const VERIFIED_WINDOW_MS = 15 * 60 * 1000; // 15 minutes to complete login flow
const MAX_OTP_ATTEMPTS = 5;

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

function resolveTarget(data) {
  const method = data.method || (data.phone || data.mobile ? 'phone' : 'email');
  const target =
    method === 'phone'
      ? (data.phone || data.mobile).trim()
      : data.email.trim().toLowerCase();
  return { method, target };
}

function findUserByMethod(method, target) {
  return method === 'phone'
    ? User.findOne({ phone: target })
    : User.findOne({ email: target });
}

function assertUserCanLogin(user) {
  if (!user) {
    throw new ApiError(404, 'Account does not exist. Please register first.');
  }
  if (user.status === 'pending') {
    throw new ApiError(403, 'Account pending admin approval');
  }
  if (user.status === 'rejected') {
    throw new ApiError(403, 'Account rejected. Contact support.');
  }
  if (user.status === 'blocked') {
    throw new ApiError(403, 'Account blocked');
  }
}

async function assertUniqueUser({ email, phone }) {
  if (await User.findOne({ email: email.toLowerCase() })) {
    throw new ApiError(409, 'Email already registered');
  }
  if (await User.findOne({ phone })) {
    throw new ApiError(409, 'Phone already registered');
  }
}

async function validateShopCategory(categoryId) {
  const category = await Category.findById(categoryId);
  if (!category || !category.isActive) {
    throw new ApiError(400, 'Invalid or inactive category');
  }
  if (category.parent !== null) {
    throw new ApiError(
      400,
      'Shop category must be a top-level category, not a subcategory'
    );
  }
}

async function issueOtp({ target, method, purpose, pendingData = null, cleanupFilter }) {
  const otp =
    process.env.STATIC_OTP || crypto.randomInt(100000, 1000000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  await Otp.deleteMany(cleanupFilter || { target, purpose, method });
  await Otp.create({
    target,
    method,
    purpose,
    otpHash,
    verified: false,
    attempts: 0,
    pendingData,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  return {
    purpose,
    method,
    target,
    expiresInSeconds: OTP_EXPIRY_MS / 1000,
    ...(process.env.NODE_ENV === 'development' && { otp }),
  };
}

async function verifyActiveOtpRecord(otpRecord, candidateOtp) {
  if (!otpRecord) {
    throw new ApiError(400, 'OTP expired or not requested');
  }
  if (otpRecord.verified) {
    throw new ApiError(400, 'OTP already verified');
  }
  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(
      429,
      'Too many invalid OTP attempts. Please request a new OTP.'
    );
  }

  const isMatch = await bcrypt.compare(candidateOtp, otpRecord.otpHash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new ApiError(400, 'Invalid OTP');
  }
}

function formatUserPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    pincode: user.pincode,
    role: user.role,
    status: user.status,
  };
}

// ================= SEND OTP =================
// POST /api/auth/send-otp
exports.sendOtp = asyncHandler(async (req, res) => {
  const data = sendOtpSchema.parse(req.body);
  const { method, target } = resolveTarget(data);
  const existingUser = await findUserByMethod(method, target);

  let pendingData = null;

  if (data.purpose === 'register') {
    if (existingUser) {
      throw new ApiError(
        409,
        method === 'phone' ? 'Phone already registered' : 'Email already registered'
      );
    }

    // Preserve pending registration details when resending OTP
    const existingPending = await Otp.findOne({
      purpose: 'register',
      expiresAt: { $gt: new Date() },
      $or: [
        { target },
        { 'pendingData.email': target },
        { 'pendingData.phone': target },
        { 'pendingData.mobile': target },
      ],
    }).sort({ createdAt: -1 });

    if (!existingPending?.pendingData) {
      throw new ApiError(
        400,
        'Please submit registration details first before requesting OTP'
      );
    }

    pendingData = existingPending.pendingData;
  }

  if (data.purpose === 'login') {
    assertUserCanLogin(existingUser);
  }

  const otpPayload = await issueOtp({
    target,
    method,
    purpose: data.purpose,
    pendingData,
  });

  res.json({
    success: true,
    message: 'OTP sent successfully',
    data: otpPayload,
  });
});

// ================= REGISTER (submit details -> send OTP) =================
// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const phone = data.phone || data.mobile;
  const email = data.email.trim().toLowerCase();

  await assertUniqueUser({ email, phone });

  if (data.role === 'shopkeeper') {
    await validateShopCategory(data.shopCategory);
  }

  const method = data.method || 'phone';
  const target = method === 'email' ? email : phone;

  const otpPayload = await issueOtp({
    target,
    method,
    purpose: 'register',
    pendingData: { ...data, email },
    cleanupFilter: {
      purpose: 'register',
      $or: [
        { target: { $in: [email, phone] } },
        { 'pendingData.email': email },
        { 'pendingData.phone': phone },
        { 'pendingData.mobile': phone },
      ],
    },
  });

  res.status(200).json({
    success: true,
    message: 'OTP sent successfully. Verify OTP to complete registration.',
    data: otpPayload,
  });
});

// ================= VERIFY OTP =================
// POST /api/auth/verify-otp
exports.verifyOtp = asyncHandler(async (req, res) => {
  const data = verifyOtpSchema.parse(req.body);
  const { method, target } = resolveTarget(data);

  const otpRecord = await Otp.findOne({
    target,
    method,
    purpose: data.purpose,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  await verifyActiveOtpRecord(otpRecord, data.otp);

  if (data.purpose === 'register') {
    const pendingData = otpRecord.pendingData;
    if (!pendingData) {
      throw new ApiError(
        400,
        'Registration details not found. Please submit registration form first.'
      );
    }

    const payload =
      pendingData.role === 'consumer'
        ? await registerConsumerFlow(pendingData)
        : await registerShopkeeperFlow(pendingData);

    await Otp.deleteMany({ _id: otpRecord._id });

    return res.status(201).json({
      success: true,
      message: payload.message,
      data: payload.data,
    });
  }

  // purpose === 'login'
  otpRecord.verified = true;
  otpRecord.expiresAt = new Date(Date.now() + VERIFIED_WINDOW_MS);
  await otpRecord.save();

  const user = await findUserByMethod(method, target);
  assertUserCanLogin(user);

  return res.json({
    success: true,
    message: 'OTP verified successfully',
    data: {
      verified: true,
      purpose: 'login',
      method,
      target,
      token: signToken(user._id, user.role),
      user: formatUserPayload(user),
    },
  });
});

// ---------- Consumer ----------
async function registerConsumerFlow(data) {
  await assertUniqueUser({ email: data.email, phone: data.phone });

  const user = await User.create({
    name: data.name,
    email: data.email,
    phone: data.phone,
    city: data.city,
    pincode: data.pincode,
    role: 'consumer',
    status: 'active',
  });

  const token = signToken(user._id, user.role);

  return {
    message: 'Registration successful',
    data: {
      token,
      user: formatUserPayload(user),
    },
  };
}

// ---------- Shopkeeper ----------
async function registerShopkeeperFlow(data) {
  await assertUniqueUser({ email: data.email, phone: data.mobile });
  await validateShopCategory(data.shopCategory);

  const user = await User.create({
    name: data.ownerName,
    email: data.email,
    phone: data.mobile,
    pincode: data.pincode || data.address.pincode,
    role: 'shopkeeper',
    status: 'pending',
  });

  let shop;
  try {
    shop = await Shop.create({
      owner: user._id,
      name: data.shopName,
      category: data.shopCategory,
      description: data.aboutShop,
      openingHours: data.openingHours,
      address: data.address,
      status: 'pending',
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw err;
  }

  return {
    message: 'Shop registration successful. Pending admin approval.',
    data: {
      user: formatUserPayload(user),
      shop: {
        id: shop._id,
        name: shop.name,
        category: shop.category,
        address: shop.address,
        status: shop.status,
      },
    },
  };
}

// ================= OTP LOGIN =================
// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const { method, target } = resolveTarget(data);

  const user = await findUserByMethod(method, target);
  assertUserCanLogin(user);

  if (data.otp) {
    const otpRecord = await Otp.findOne({
      target,
      method,
      purpose: 'login',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    await verifyActiveOtpRecord(otpRecord, data.otp);
  } else {
    const verifiedOtp = await Otp.findOne({
      target,
      method,
      purpose: 'login',
      verified: true,
      expiresAt: { $gt: new Date() },
    }).sort({ updatedAt: -1 });

    if (!verifiedOtp) {
      throw new ApiError(400, 'Please verify OTP before logging in');
    }
  }

  await Otp.deleteMany({ target, method, purpose: 'login' });

  const token = signToken(user._id, user.role);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: formatUserPayload(user),
    },
  });
});

// ================= ME =================
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});
