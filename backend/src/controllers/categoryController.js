const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const {
  createCategorySchema,
  updateCategorySchema,
} = require('../validators/categoryValidator');

// POST /api/categories  (admin only)
exports.createCategory = asyncHandler(async (req, res) => {
  const data = createCategorySchema.parse(req.body);

  const exists = await Category.findOne({ name: data.name });
  if (exists) throw new ApiError(409, 'Category already exists');

  const category = await Category.create(data);

  res.status(201).json({
    success: true,
    message: 'Category created',
    data: { category },
  });
});

// GET /api/categories  (any logged-in user)
exports.getCategories = asyncHandler(async (req, res) => {
  const { includeInactive } = req.query;

  const filter = {};
  if (includeInactive !== 'true') filter.isActive = true;

  const categories = await Category.find(filter).sort('name');

  res.json({
    success: true,
    data: { categories },
  });
});

// GET /api/categories/:id
exports.getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  res.json({ success: true, data: { category } });
});

// PUT /api/categories/:id  (admin only)
exports.updateCategory = asyncHandler(async (req, res) => {
  const data = updateCategorySchema.parse(req.body);

  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  // Uniqueness check if name changes
  if (data.name && data.name !== category.name) {
    const exists = await Category.findOne({ name: data.name });
    if (exists) throw new ApiError(409, 'Category name already exists');
  }

  ['name', 'description', 'isActive'].forEach((f) => {
    if (data[f] !== undefined) category[f] = data[f];
  });

  await category.save();

  res.json({
    success: true,
    message: 'Category updated',
    data: { category },
  });
});

// DELETE /api/categories/:id  (admin only — soft delete)
exports.deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  category.isActive = false;
  await category.save();

  res.json({ success: true, message: 'Category deleted' });
});