const Product = require('../models/Product');
const Shop = require('../models/Shop');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/stats
exports.getStats = asyncHandler(async (req, res) => {
  let productFilter = { isActive: true };
  let inquiryFilter = {};

  // 1. Apply role-based filters
  if (req.user.role === 'shopkeeper') {
    // Find the shopkeeper's shop
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) {
      throw new ApiError(403, 'You do not have a shop');
    }
    
    // Filter stats by this specific shop
    productFilter.shop = shop._id;
    inquiryFilter.shop = shop._id;
    
  } else if (req.user.role !== 'admin') {
    // Only admins and shopkeepers can access stats
    throw new ApiError(403, 'Forbidden: insufficient role');
  }

  // 2. Run all database count queries in parallel for speed
  const [
    liveProducts,
    totalInquiries,
    newInquiries,
    convertedInquiries,
  ] = await Promise.all([
    Product.countDocuments(productFilter),
    Inquiry.countDocuments(inquiryFilter),
    Inquiry.countDocuments({ ...inquiryFilter, status: 'new' }),
    Inquiry.countDocuments({ ...inquiryFilter, status: 'converted' }),
  ]);

  // 3. Return the response
  res.json({
    success: true,
    data: {
      stats: {
        liveProducts,
        newInquiries,
        totalInquiries,
        convertedInquiries,
      },
    },
  });
});