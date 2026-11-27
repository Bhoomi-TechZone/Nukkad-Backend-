const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// ================= GET WISHLIST =================
// GET /api/wishlist
exports.getWishlist = asyncHandler(async (req, res) => {
    const wishlist = await Wishlist.find({ user: req.user._id })
        .populate('product', 'name image sellingPrice mrp isActive')
        .sort('-createdAt');

    // Filter out products that have been deleted/inactive
    const validWishlist = wishlist.filter((item) => item.product && item.product.isActive);

    res.json({ success: true, data: { wishlist: validWishlist } });
});

// ================= ADD TO WISHLIST =================
// POST /api/wishlist/:productId
exports.addToWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
        throw new ApiError(404, 'Product not found');
    }

    // Check if already in wishlist (ignore duplicate error)
    const exists = await Wishlist.findOne({ user: req.user._id, product: productId });
    if (exists) {
        return res.json({ success: true, message: 'Already in wishlist' });
    }

    const wishlistItem = await Wishlist.create({
        user: req.user._id,
        product: productId,
    });

    res.status(201).json({
        success: true,
        message: 'Added to wishlist',
        data: { wishlistItem },
    });
});

// ================= REMOVE FROM WISHLIST =================
// DELETE /api/wishlist/:productId
exports.removeFromWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    await Wishlist.findOneAndDelete({ user: req.user._id, product: productId });

    res.json({ success: true, message: 'Removed from wishlist' });
});

// ================= SYNC GUEST WISHLIST =================
// POST /api/wishlist/sync
exports.syncWishlist = asyncHandler(async (req, res) => {
    const { productIds } = req.body; // Array of IDs from Local Storage

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.json({ success: true, message: 'Nothing to sync' });
    }

    // Find which products actually exist and are active
    const validProducts = await Product.find({
        _id: { $in: productIds },
        isActive: true,
    }).select('_id');

    const validIds = validProducts.map((p) => p._id);

    // Use bulkWrite to insert without throwing errors on duplicates
    const operations = validIds.map((id) => ({
        updateOne: {
            filter: { user: req.user._id, product: id },
            update: { $setOnInsert: { user: req.user._id, product: id } },
            upsert: true, // Create if doesn't exist, ignore if it does
        },
    }));

    if (operations.length > 0) {
        await Wishlist.bulkWrite(operations);
    }

    res.json({ success: true, message: 'Wishlist synced successfully' });
});