const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Category = require('../models/Category');

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { registerSchema, loginSchema } = require('../validators/authValidator');

const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

// ================= REGISTER (role-based) =================
exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);

  // Static OTP check first
  if (data.otp !== process.env.STATIC_OTP) {
    throw new ApiError(400, 'Invalid OTP');
  }

  if (data.role === 'consumer')   return registerConsumerFlow(data, res);
  if (data.role === 'shopkeeper') return registerShopkeeperFlow(data, res);
  if (data.role === 'admin')      return registerAdminFlow(data, res);

  throw new ApiError(400, 'Invalid role');
});

// ---------- Consumer ----------
async function registerConsumerFlow(data, res) {
  if (await User.findOne({ email: data.email }))
    throw new ApiError(409, 'Email already registered');
  if (await User.findOne({ phone: data.phone }))
    throw new ApiError(409, 'Phone already registered');

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

  return res.status(201).json({
    success: true,
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
  });
}

async function registerShopkeeperFlow(data, res) {
  if (await User.findOne({ email: data.email }))
    throw new ApiError(409, 'Email already registered');
  if (await User.findOne({ phone: data.mobile }))
    throw new ApiError(409, 'Mobile number already registered');

  // Validate category exists and is active
const category = await Category.findById(data.shopCategory);
if (!category || !category.isActive) {
  throw new ApiError(400, 'Invalid or inactive category');
}
if (category.parent !== null) {
  throw new ApiError(400, 'Shop category must be a top-level category, not a subcategory');
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

  return res.status(201).json({
    success: true,
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
  });
}

// ---------- Admin ----------
async function registerAdminFlow(data, res) {
  if (await User.findOne({ email: data.email }))
    throw new ApiError(409, 'Email already registered');
  if (await User.findOne({ phone: data.phone }))
    throw new ApiError(409, 'Phone already registered');

  const user = await User.create({
    name: data.name,
    email: data.email,
    password: data.password,
    phone: data.phone,
    role: 'admin',
    status: 'active',
  });

  const token = signToken(user._id, user.role);

  return res.status(201).json({
    success: true,
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
  });
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