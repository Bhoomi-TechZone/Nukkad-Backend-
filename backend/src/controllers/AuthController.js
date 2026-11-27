// src/controllers/AuthController.js
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
} = require('../validators/authValidator');

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const VERIFIED_WINDOW_MS = 15 * 60 * 1000; // 15 minutes to complete login flow
const MAX_OTP_ATTEMPTS = 5;

// ------------------------------------------------------------------
// Helper functions
// ------------------------------------------------------------------
const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

function formatUserPayload(user) {
  return {
    id: user._id,
    name: user.name,
    // email is no longer stored, so we omit it
    phone: user.phone,
    city: user.city,
    pincode: user.pincode,
    role: user.role,
    status: user.status,
  };
}

// Ensure a phone number is unique (no email checks any more)
async function assertUniqueUser({ phone }) {
  if (phone && (await User.findOne({ phone }))) {
    throw new ApiError(409, 'Phone already registered');
  }
}

// Ensure a user can log in (status check)
function assertUserCanLogin(user) {
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (user.status !== 'active') {
    throw new ApiError(403, `User cannot login, status: ${user.status}`);
  }
}

// Verify that a shop category exists and is a top‑level active category
async function validateShopCategory(categoryId) {
  const category = await Category.findById(categoryId);
  if (!category || !category.isActive) {
    throw new ApiError(400, 'Invalid or inactive category');
  }
  if (category.parent !== null) {
    throw new ApiError(400, 'Shop category must be a top‑level category, not a subcategory');
  }
}

// Create an OTP record (clears any previous OTPs for the same target/purpose)
async function issueOtp({ target, method, purpose, pendingData = null, cleanupFilter }) {
  const otp = process.env.STATIC_OTP || crypto.randomInt(100000, 1000000).toString();
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
    ...(process.env.NODE_ENV === 'development' && { otp }), // dev only
  };
}

// Verify OTP record is still valid and matches the supplied code
async function verifyActiveOtpRecord(otpRecord, candidateOtp) {
  if (!otpRecord) {
    throw new ApiError(400, 'OTP expired or not requested');
  }
  if (otpRecord.verified) {
    throw new ApiError(400, 'OTP already verified');
  }
  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(429, 'Too many invalid OTP attempts. Please request a new OTP.');
  }

  const isMatch = await bcrypt.compare(candidateOtp, otpRecord.otpHash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new ApiError(400, 'Invalid OTP');
  }
}

// ------------------------------------------------------------------
// SEND OTP (phone‑only)
// ------------------------------------------------------------------
exports.sendOtp = asyncHandler(async (req, res) => {
  const { phone } = sendOtpSchema.parse(req.body);

  const existingUser = await User.findOne({ phone });
  const purpose = existingUser ? 'login' : 'register';

  await issueOtp({
    target: phone,
    method: 'phone',
    purpose,
    pendingData: null,
  });

  res.json({
    success: true,
    message: 'OTP sent successfully',
    data: { target: phone },
  });
});

// ------------------------------------------------------------------
// REGISTER (after OTP verification)
// ------------------------------------------------------------------
exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const phone = data.phone || data.mobile;

  // Must have a verified OTP for this phone before we create the account
  const otpRecord = await Otp.findOne({
    target: phone,
    method: 'phone',
    purpose: 'register',
    verified: true,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new ApiError(400, 'Please verify OTP before registering');
  }

  // Ensure phone is still unique (defensive)
  await assertUniqueUser({ phone });

  // Shopkeeper specific validation
  if (data.role === 'shopkeeper') {
    await validateShopCategory(data.shopCategory);
  }

  // Create the user (and shop if needed)
  const payload = data.role === 'consumer'
    ? await registerConsumerFlow({ ...data })
    : await registerShopkeeperFlow({ ...data });

  // Clean up all OTP records for this phone (both login & register)
  await Otp.deleteMany({ target: phone, method: 'phone' });

  return res.status(201).json({
    success: true,
    message: payload.message,
    data: payload.data,
  });
});

// ------------------------------------------------------------------
// VERIFY OTP (both login and registration)
// ------------------------------------------------------------------
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = verifyOtpSchema.parse(req.body);

  const otpRecord = await Otp.findOne({
    target: phone,
    method: 'phone',
    purpose: { $in: ['login', 'register'] },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  await verifyActiveOtpRecord(otpRecord, otp);

  if (otpRecord.purpose === 'login') {
    // ------- Login flow -------
    const user = await User.findOne({ phone });
    assertUserCanLogin(user);
    await Otp.deleteMany({ target: phone, method: 'phone', purpose: 'login' });

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: signToken(user._id, user.role),
        user: formatUserPayload(user),
      },
    });
  }

  // ------- Register flow -------
  otpRecord.verified = true;
  await otpRecord.save();

  return res.json({
    success: true,
    message: 'OTP verified, you may now complete registration',
    data: { verified: true },
  });
});

// ------------------------------------------------------------------
// Consumer registration helper
// ------------------------------------------------------------------
async function registerConsumerFlow(data) {
  // At this point the OTP has already been verified, so we only need to ensure
  // the phone is still unique (defensive)
  await assertUniqueUser({ phone: data.phone });

  const user = await User.create({
    name: data.name,
    // email is omitted – phone‑only flow
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

// ------------------------------------------------------------------
// Shopkeeper registration helper
// ------------------------------------------------------------------
async function registerShopkeeperFlow(data) {
  // Defensive uniqueness check for phone
  await assertUniqueUser({ phone: data.phone });

  // Category validation already performed in register route
  const user = await User.create({
    name: data.ownerName,
    // email omitted
    phone: data.phone,
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
    // Roll back user creation if shop creation fails
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

// ------------------------------------------------------------------
// ME – protected route (unchanged)
// ------------------------------------------------------------------
exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });

  module.exports = { sendOtp, verifyOtp, register, login, me };
});