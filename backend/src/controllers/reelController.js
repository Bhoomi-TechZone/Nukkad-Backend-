const Reel = require('../models/Reel');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Look up the shop owned by the authenticated shopkeeper.
 */
async function getMyShop(userId) {
  const shop = await Shop.findOne({ owner: userId });
  if (!shop) throw new ApiError(403, 'You do not have a shop');
  return shop;
}

/**
 * Verify an optional tagged product exists, is active, and belongs to the shop.
 */
async function validateTaggedProduct(productId, shopId) {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Tagged product not found');
  }
  if (product.shop.toString() !== shopId.toString()) {
    throw new ApiError(403, 'Forbidden: tagged product does not belong to your shop');
  }
  return product;
}

/**
 * Verify the current user owns the reel's shop or is an admin.
 */
async function assertReelOwnerOrAdmin(reel, user) {
  if (user.role === 'admin') return;
  const shop = await getMyShop(user._id);
  if (reel.shop.toString() !== shop._id.toString()) {
    throw new ApiError(403, 'Forbidden: not your reel');
  }
}

/**
 * Format a reel document with derived engagement fields for API responses.
 */
function formatReel(reel, userId) {
  const obj = reel.toObject();
  const likes = Array.isArray(obj.likes) ? obj.likes : [];
  obj.likesCount = likes.length;
  obj.isLiked = userId
    ? likes.some((id) => id.toString() === userId.toString())
    : false;
  delete obj.likes;
  return obj;
}

// ================= UPLOAD / CREATE REEL =================
// POST /api/reels
exports.createReel = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Reel video is required');

  const shop = await getMyShop(req.user._id);
  if (shop.status !== 'active') {
    throw new ApiError(403, 'Your shop is not approved yet');
  }

  const { caption, product } = req.body || {};

  if (product) {
    await validateTaggedProduct(product, shop._id);
  }

  const reel = await Reel.create({
    shop: shop._id,
    createdBy: req.user._id,
    videoUrl: req.file.path,
    publicId: req.file.filename,
    caption,
    product: product || undefined,
  });

  await reel.populate([
    { path: 'shop', select: 'name address.city' },
    { path: 'product', select: 'name image sellingPrice mrp isActive' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Reel uploaded successfully',
    data: { reel: formatReel(reel, req.user._id) },
  });
});

/**
 * Fetch a paginated list of active reels matching a filter.
 */
async function listPaginatedReels(filter, { page = 1, limit = 10 }, userId) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 10));

  const [reels, total] = await Promise.all([
    Reel.find(filter)
      .populate('shop', 'name address.city')
      .populate('product', 'name image sellingPrice mrp isActive')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Reel.countDocuments(filter),
  ]);

  return {
    reels: reels.map((r) => formatReel(r, userId)),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
}

// ================= LIST REELS (CONSUMER FEED) =================
// GET /api/reels
exports.getReels = asyncHandler(async (req, res) => {
  const { shop, product, page, limit } = req.query;

  const filter = { isActive: true };
  if (shop) filter.shop = shop;
  if (product) filter.product = product;

  const data = await listPaginatedReels(filter, { page, limit }, req.user._id);
  res.json({ success: true, data });
});

// ================= GET SHOPKEEPER'S OWN REELS =================
// GET /api/reels/my
exports.getMyReels = asyncHandler(async (req, res) => {
  const shop = await getMyShop(req.user._id);
  const { page, limit } = req.query;

  const data = await listPaginatedReels(
    { shop: shop._id, isActive: true },
    { page, limit },
    req.user._id
  );
  res.json({ success: true, data });
});

// ================= GET SINGLE REEL =================
// GET /api/reels/:id
exports.getReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { $inc: { views: 1 } },
    { new: true }
  )
    .populate('shop', 'name address.city')
    .populate('product', 'name image sellingPrice mrp isActive')
    .populate('createdBy', 'name');

  if (!reel) throw new ApiError(404, 'Reel not found');

  res.json({
    success: true,
    data: { reel: formatReel(reel, req.user._id) },
  });
});

// ================= TOGGLE LIKE ON REEL =================
// POST /api/reels/:id/like
exports.toggleLikeReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findOne({ _id: req.params.id, isActive: true });
  if (!reel) throw new ApiError(404, 'Reel not found');

  const alreadyLiked = reel.likes.some(
    (id) => id.toString() === req.user._id.toString()
  );

  const update = alreadyLiked
    ? { $pull: { likes: req.user._id } }
    : { $addToSet: { likes: req.user._id } };

  const updated = await Reel.findByIdAndUpdate(reel._id, update, { new: true });

  res.json({
    success: true,
    message: alreadyLiked ? 'Reel unliked' : 'Reel liked',
    data: {
      liked: !alreadyLiked,
      likesCount: updated.likes.length,
    },
  });
});

// ================= UPDATE REEL =================
// PUT /api/reels/:id
exports.updateReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findOne({ _id: req.params.id, isActive: true });
  if (!reel) throw new ApiError(404, 'Reel not found');

  await assertReelOwnerOrAdmin(reel, req.user);

  const { caption, product } = req.body || {};

  if (caption !== undefined) reel.caption = caption;

  if (product !== undefined) {
    if (product === '' || product === null) {
      reel.product = undefined;
    } else {
      await validateTaggedProduct(product, reel.shop);
      reel.product = product;
    }
  }

  await reel.save();
  await reel.populate([
    { path: 'shop', select: 'name address.city' },
    { path: 'product', select: 'name image sellingPrice mrp isActive' },
  ]);

  res.json({
    success: true,
    message: 'Reel updated',
    data: { reel: formatReel(reel, req.user._id) },
  });
});

// ================= DELETE REEL =================
// DELETE /api/reels/:id
exports.deleteReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findOne({ _id: req.params.id, isActive: true });
  if (!reel) throw new ApiError(404, 'Reel not found');

  await assertReelOwnerOrAdmin(reel, req.user);

  reel.isActive = false;
  await reel.save();

  res.json({ success: true, message: 'Reel deleted' });
});
