const User = require('../models/User');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { updateUserSchema } = require('../validators/userValidator');

// ================= GET ONE =================
// GET /api/users/:id   (admin or self)
exports.getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user._id.toString() === id;

  if (!isAdmin && !isSelf) {
    throw new ApiError(403, 'Forbidden: you can only view your own profile');
  }

  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');

  const response = { user };

  if (user.role === 'shopkeeper') {
    const shop = await Shop.findOne({ owner: user._id }).populate(
      'category',
      'name'
    );
    if (shop) response.shop = shop;
  }

  res.json({ success: true, data: response });
});

// ================= UPDATE =================
// PUT /api/users/:id   (admin or self)
exports.updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const isAdmin = req.user.role === 'admin';
  const isSelf = req.user._id.toString() === id;

  if (!isAdmin && !isSelf) {
    throw new ApiError(403, 'Forbidden: you can only edit your own profile');
  }

  const data = updateUserSchema.parse(req.body);

  if (data.status !== undefined && !isAdmin) {
    throw new ApiError(403, 'Only admin can change account status');
  }
  if (data.shopStatus !== undefined && !isAdmin) {
    throw new ApiError(403, 'Only admin can change shop status');
  }

  const targetUser = await User.findById(id);
  if (!targetUser) throw new ApiError(404, 'User not found');

  if (targetUser.role === 'shopkeeper' && data.city !== undefined) {
    throw new ApiError(
      400,
      'city is not a user field for shopkeepers; update Shop.address.city instead'
    );
  }

  if (data.email && data.email !== targetUser.email) {
    const exists = await User.findOne({ email: data.email, _id: { $ne: id } });
    if (exists) throw new ApiError(409, 'Email already registered');
  }
  if (data.phone && data.phone !== targetUser.phone) {
    const exists = await User.findOne({ phone: data.phone, _id: { $ne: id } });
    if (exists) throw new ApiError(409, 'Phone already registered');
  }

  const userFields = ['name', 'email', 'phone', 'city', 'status'];
  userFields.forEach((field) => {
    if (data[field] !== undefined) targetUser[field] = data[field];
  });

  await targetUser.save();

  if (targetUser.role === 'shopkeeper' && data.status !== undefined) {
    const shopStatusMap = {
      active: 'active',
      rejected: 'rejected',
      blocked: 'rejected',
      pending: 'pending',
    };
    const shopStatus = shopStatusMap[data.status];
    if (shopStatus) {
      await Shop.updateOne({ owner: targetUser._id }, { status: shopStatus });
    }
  }

  let shop = null;
  if (targetUser.role === 'shopkeeper') {
    shop = await Shop.findOne({ owner: targetUser._id });

    if (!shop) {
      const shopFieldSent =
        data.shopName !== undefined ||
        data.shopCategory !== undefined ||
        data.aboutShop !== undefined ||
        data.openingHours !== undefined ||
        data.address !== undefined ||
        data.shopStatus !== undefined;

      if (shopFieldSent) {
        throw new ApiError(404, 'No shop found for this shopkeeper');
      }
    } else {
     if (data.shopCategory !== undefined) {
  const cat = await Category.findById(data.shopCategory);
  if (!cat || !cat.isActive) {
    throw new ApiError(400, 'Invalid or inactive category');
  }
  if (cat.parent !== null) {
    throw new ApiError(400, 'Shop category must be a top-level category, not a subcategory');
  }
  shop.category = data.shopCategory;
}

      if (data.shopName !== undefined) shop.name = data.shopName;
      if (data.aboutShop !== undefined) shop.description = data.aboutShop;
      if (data.openingHours !== undefined) shop.openingHours = data.openingHours;
      if (data.address !== undefined) {
        shop.address = { ...shop.address.toObject(), ...data.address };
      }
      if (data.shopStatus !== undefined) shop.status = data.shopStatus;

      await shop.save();
      await shop.populate('category', 'name');
    }
  }

  const response = {
    user: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      phone: targetUser.phone,
      city: targetUser.city,
      role: targetUser.role,
      status: targetUser.status,
    },
  };

  if (shop) response.shop = shop;

  res.status(200).json({
    success: true,
    message: 'User updated',
    data: response,
  });
});