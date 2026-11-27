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
const VERIFIED_WINDOW_MS = 15 * 60 * 1000; // 15 minutes to complete registration
const MAX_OTP_ATTEMPTS = 5;

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const signVerificationToken = (otpId, target, targetType) =>
  jwt.sign(
    { purpose: 'register-otp', otpId, target, targetType },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

function resolveOtpTarget(data) {
  const phone = data.phone || data.mobile;
  if (phone) {
    return { target: phone.trim(), targetType: 'phone' };
  }
  return { target: data.email.trim().toLowerCase(), targetType: 'email' };
}

async function assertUniqueUser({ email, phone }) {
  if (await User.findOne({ email: email.toLowerCase() })) {
    throw new ApiError(409, 'Email already registered');
  }
  if (await User.findOne({ phone })) {
    throw new ApiError(409, 'Phone already registered');
  }
}

async function assertOtpVerifiedForRegistration(data) {
  const phone = data.phone || data.mobile;
  const targets = [data.email?.toLowerCase(), phone].filter(Boolean);

  if (data.verificationToken) {
    let decoded;
    try {
      decoded = jwt.verify(data.verificationToken, process.env.JWT_SECRET);
    } catch {
      throw new ApiError(400, 'Invalid or expired verification token');
    }

    if (
      decoded.purpose !== 'register-otp' ||
      !targets.includes(decoded.target)
    ) {
      throw new ApiError(400, 'Verification token does not match profile');
    }

    const otpRecord = await Otp.findOne({
      _id: decoded.otpId,
      target: decoded.target,
      verified: true,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      throw new ApiError(400, 'OTP verification expired or already used');
    }

    return targets;
  }

  const otpRecord = await Otp.findOne({
    target: { $in: targets },
    verified: true,
    expiresAt: { $gt: new Date() },
  }).sort({ updatedAt: -1 });

  if (!otpRecord) {
    throw new ApiError(400, 'Please verify OTP before registering');
  }

  return targets;
}

// ================= SEND OTP =================
// POST /api/auth/send-otp
exports.sendOtp = asyncHandler(async (req, res) => {
  const data = sendOtpSchema.parse(req.body);
  const { target, targetType } = resolveOtpTarget(data);

  const existingQuery =
    targetType === 'phone' ? { phone: target } : { email: target };
  if (await User.findOne(existingQuery)) {
    throw new ApiError(
      409,
      targetType === 'phone'
        ? 'Phone already registered'
        : 'Email already registered'
    );
  }

  const otp =
    process.env.STATIC_OTP || crypto.randomInt(100000, 1000000).toString();
  const otpHash = await bcrypt.hash(otp, 10);

  await Otp.deleteMany({ target });
  await Otp.create({
    target,
    targetType,
    otpHash,
    verified: false,
    attempts: 0,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  res.json({
    success: true,
    message: 'OTP sent successfully',
    data: {
      target,
      targetType,
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
      ...(process.env.NODE_ENV === 'development' && { otp }),
    },
  });
});

// ================= VERIFY OTP =================
// POST /api/auth/verify-otp
exports.verifyOtp = asyncHandler(async (req, res) => {
  const data = verifyOtpSchema.parse(req.body);
  const { target, targetType } = resolveOtpTarget(data);

  const otpRecord = await Otp.findOne({
    target,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new ApiError(400, 'OTP expired or not requested');
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(
      429,
      'Too many invalid OTP attempts. Please request a new OTP.'
    );
  }

  const isMatch = await bcrypt.compare(data.otp, otpRecord.otpHash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new ApiError(400, 'Invalid OTP');
  }

  otpRecord.verified = true;
  otpRecord.expiresAt = new Date(Date.now() + VERIFIED_WINDOW_MS);
  await otpRecord.save();

  const verificationToken = signVerificationToken(
    otpRecord._id,
    target,
    targetType
  );

  res.json({
    success: true,
    message: 'OTP verified successfully',
    data: {
      verified: true,
      target,
      targetType,
      verificationToken,
    },
  });
});

// ================= REGISTER (role-based) =================
// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const verifiedTargets = await assertOtpVerifiedForRegistration(data);

  let payload;
  if (data.role === 'consumer') {
    payload = await registerConsumerFlow(data);
  } else if (data.role === 'shopkeeper') {
    payload = await registerShopkeeperFlow(data);
  } else if (data.role === 'admin') {
    payload = await registerAdminFlow(data);
  } else {
    throw new ApiError(400, 'Invalid role');
  }

  await Otp.deleteMany({ target: { $in: verifiedTargets } });

  return res.status(201).json({
    success: true,
    message: payload.message,
    data: payload.data,
  });
});

// ---------- Consumer ----------
async function registerConsumerFlow(data) {
  await assertUniqueUser({ email: data.email, phone: data.phone });

  const user = await User.create({
    name: data.name,
    email: data.email,
    password: data.password,
    phone: data.phone,
    city: data.city,
    role: 'consumer',
    status: 'active',
  });

  const token = signToken(user._id, user.role);

  return {
    message: 'Registration successful',
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        role: user.role,
        status: user.status,
      },
    },
  };
}

// ---------- Shopkeeper ----------
async function registerShopkeeperFlow(data) {
  await assertUniqueUser({ email: data.email, phone: data.mobile });

  // Validate category exists and is active
  const category = await Category.findById(data.shopCategory);
  if (!category || !category.isActive) {
    throw new ApiError(400, 'Invalid or inactive category');
  }
  if (category.parent !== null) {
    throw new ApiError(
      400,
      'Shop category must be a top-level category, not a subcategory'
    );
  }

  const user = await User.create({
    name: data.ownerName,
    email: data.email,
    password: data.password,
    phone: data.mobile,
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
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

// ---------- Admin ----------
async function registerAdminFlow(data) {
  await assertUniqueUser({ email: data.email, phone: data.phone });

  const user = await User.create({
    name: data.name,
    email: data.email,
    password: data.password,
    phone: data.phone,
    role: 'admin',
    status: 'active',
  });

  const token = signToken(user._id, user.role);

  return {
    message: 'Registration successful',
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    },
  };
}

// ================= LOGIN =================
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (user.status === 'pending')
    throw new ApiError(403, 'Account pending admin approval');
  if (user.status === 'rejected')
    throw new ApiError(403, 'Account rejected. Contact support.');
  if (user.status === 'blocked')
    throw new ApiError(403, 'Account blocked');

  const token = signToken(user._id, user.role);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    },
  });
});

// ================= ME =================
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});
