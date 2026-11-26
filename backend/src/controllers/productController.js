const Product = require('../models/Product');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

async function getMyShop(userId) {
  const shop = await Shop.findOne({ owner: userId });
  if (!shop) throw new ApiError(403, 'You do not have a shop');
  return shop;
}

// ================= CREATE =================
exports.createProduct = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Product image is required');

  const { name, category, sellingPrice, mrp, description, specifications } = req.body;

  if (!name || !category || !sellingPrice) {
    throw new ApiError(400, 'Name, category, and sellingPrice are required');
  }

  const cat = await Category.findById(category);
  if (!cat || !cat.isActive) throw new ApiError(400, 'Invalid or inactive category');
  if (cat.parent === null) throw new ApiError(400, 'Products must belong to a subcategory');

  const shop = await getMyShop(req.user._id);
  if (shop.status !== 'active') throw new ApiError(403, 'Your shop is not approved yet');

  let parsedSpecs = {};
  if (specifications) {
    try {
      parsedSpecs = JSON.parse(specifications);
    } catch (e) {
      throw new ApiError(400, 'Specifications must be a valid JSON string');
    }
  }

  const product = await Product.create({
    name,
    image: req.file.path, // Cloudinary URL
    category,
    sellingPrice: Number(sellingPrice),
    mrp: mrp ? Number(mrp) : undefined,
    description,
    specifications: parsedSpecs,
    shop: shop._id,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Product created',
    data: { product },
  });
});

// ================= LIST =================
exports.getProducts = asyncHandler(async (req, res) => {
  const { shop, category, search, page = 1, limit = 20, sort = 'newest' } = req.query;

  const filter = { isActive: true };
  if (shop) filter.shop = shop;
  if (category) filter.category = category;
  if (search) filter.$text = { $search: search };

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { sellingPrice: 1 },
    price_desc: { sellingPrice: -1 },
  };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('shop', 'name address.city')
      .populate('category', 'name')
      .sort(sortMap[sort] || sortMap.newest)
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      products,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    },
  });
});

// ================= GET ONE =================
exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('shop', 'name address.city')
    .populate('category', 'name parent')
    .populate('createdBy', 'name');

  if (!product || !product.isActive) throw new ApiError(404, 'Product not found');

  res.json({ success: true, data: { product } });
});

// ================= UPDATE =================
exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin) {
    const shop = await getMyShop(req.user._id);
    if (product.shop.toString() !== shop._id.toString()) {
      throw new ApiError(403, 'Forbidden: not your product');
    }
  }

  const { name, category, sellingPrice, mrp, description, specifications, isActive } = req.body;

  if (category) {
    const cat = await Category.findById(category);
    if (!cat || !cat.isActive) throw new ApiError(400, 'Invalid or inactive category');
    if (cat.parent === null) throw new ApiError(400, 'Products must belong to a subcategory');
    product.category = category;
  }

  if (name) product.name = name;
  if (sellingPrice) product.sellingPrice = Number(sellingPrice);
  if (mrp !== undefined) product.mrp = mrp ? Number(mrp) : undefined;
  if (description !== undefined) product.description = description;
  if (isActive !== undefined) product.isActive = isActive === 'true';

  if (specifications) {
    try {
      product.specifications = JSON.parse(specifications);
    } catch (e) {
      throw new ApiError(400, 'Specifications must be a valid JSON string');
    }
  }

  if (req.file) {
    product.image = req.file.path; // Update Cloudinary URL if new image provided
  }

  await product.save();
  res.json({ success: true, message: 'Product updated', data: { product } });
});

// ================= DELETE =================
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found');

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin) {
    const shop = await getMyShop(req.user._id);
    if (product.shop.toString() !== shop._id.toString()) {
      throw new ApiError(403, 'Forbidden: not your product');
    }
  }

  product.isActive = false;
  await product.save();

  res.json({ success: true, message: 'Product deleted' });
});