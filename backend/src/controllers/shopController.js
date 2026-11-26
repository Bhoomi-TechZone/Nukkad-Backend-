const Shop = require('../models/Shop');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// ================= LIST =================
// GET /api/shops?category=&search=&city=&page=&limit=
exports.getShops = asyncHandler(async (req, res) => {
  const { category, search, city, page = 1, limit = 20 } = req.query;

  const filter = { status: 'active' };

  if (category) filter.category = category;
  if (city) filter['address.city'] = { $regex: city, $options: 'i' };
  if (search) filter.name = { $regex: search, $options: 'i' };

  const [shops, total] = await Promise.all([
    Shop.find(filter)
      .populate('category', 'name')
      .populate('owner', 'name email phone')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    Shop.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      shops,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// ================= GET ONE =================
// GET /api/shops/:id
exports.getShop = asyncHandler(async (req, res) => {
  const shop = await Shop.findById(req.params.id)
    .populate('category', 'name')
    .populate('owner', 'name email phone');

  if (!shop) throw new ApiError(404, 'Shop not found');

  res.json({ success: true, data: { shop } });
});