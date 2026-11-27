const Inquiry = require('../models/Inquiry');
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { createInquirySchema, updateStatusSchema } = require('../validators/inquiryValidator');

// ================= CREATE =================
// POST /api/inquiries (Consumer only)
exports.createInquiry = asyncHandler(async (req, res) => {
  const data = createInquirySchema.parse(req.body);

  // Check if product exists
  const product = await Product.findById(data.productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Product not found');
  }

  const inquiry = await Inquiry.create({
    product: product._id,
    shop: product.shop, // Automatically linked to the shop that owns the product
    consumer: req.user._id,
    name: data.name,
    phone: data.phone,
    city: data.city,
    date: data.date || Date.now(),
    message: data.message,
  });

  res.status(201).json({
    success: true,
    message: 'Inquiry sent successfully',
    data: { inquiry },
  });
});

// ================= GET INQUIRIES =================
// GET /api/inquiries
exports.getInquiries = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === 'consumer') {
    // Consumers only see their own inquiries
    filter.consumer = req.user._id;
  } else if (req.user.role === 'shopkeeper') {
    // Shopkeepers only see inquiries for their shop
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop) throw new ApiError(403, 'You do not have a shop');
    filter.shop = shop._id;
  }
  // Admins have no filter, so they see everything

  // Optional query to filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const inquiries = await Inquiry.find(filter)
    .populate('product', 'name image sellingPrice')
    .populate('shop', 'name')
    .populate('consumer', 'name email phone')
    .sort('-createdAt');

  res.json({ success: true, data: { inquiries } });
});

// ================= UPDATE STATUS =================
// PUT /api/inquiries/:id/status (Shopkeeper or Admin)
exports.updateInquiryStatus = asyncHandler(async (req, res) => {
  const { status } = updateStatusSchema.parse(req.body);

  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new ApiError(404, 'Inquiry not found');

  // Authorization check for shopkeepers
  if (req.user.role === 'shopkeeper') {
    const shop = await Shop.findOne({ owner: req.user._id });
    if (!shop || inquiry.shop.toString() !== shop._id.toString()) {
      throw new ApiError(403, 'Forbidden: this inquiry is not for your shop');
    }
  }

  inquiry.status = status;
  await inquiry.save();

  res.json({
    success: true,
    message: 'Inquiry status updated',
    data: { inquiry },
  });
});