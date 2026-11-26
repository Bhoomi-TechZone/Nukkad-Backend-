const mongoose = require('mongoose');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const {
  createCategorySchema,
  updateCategorySchema,
} = require('../validators/categoryValidator');

// ---------- helper: validate parent exists & is a top-level category ----------
async function validateParent(parentId) {
  if (!parentId) return null;
  const parent = await Category.findById(parentId);
  if (!parent || !parent.isActive) {
    throw new ApiError(400, 'Parent category not found or inactive');
  }
  if (parent.parent) {
    throw new ApiError(400, 'Parent must be a top-level category (2 levels only)');
  }
  return parent;
}

// ================= CREATE =================
// POST /api/categories  (admin only)
exports.createCategory = asyncHandler(async (req, res) => {
  const data = createCategorySchema.parse(req.body);

  // Validate parent if provided
  if (data.parent !== undefined && data.parent !== null) {
    await validateParent(data.parent);
  }

  // Uniqueness within same parent
  const exists = await Category.findOne({
    name: data.name,
    parent: data.parent || null,
  });
  if (exists) {
    throw new ApiError(409, 'Category with this name already exists under this parent');
  }

  const category = await Category.create({
    name: data.name,
    description: data.description,
    parent: data.parent || null,
  });

  res.status(201).json({
    success: true,
    message: 'Category created',
    data: { category },
  });
});

// ================= LIST =================
// GET /api/categories?parent=&tree=&includeInactive=
exports.getCategories = asyncHandler(async (req, res) => {
  const { parent, tree, includeInactive } = req.query;

  const filter = {};
  if (includeInactive !== 'true') filter.isActive = true;

  // Nested tree view
  if (tree === 'true') {
    const all = await Category.find(filter).sort('name').lean();
    const parents = all.filter((c) => c.parent === null);
    const byParent = {};
    all.forEach((c) => {
      if (c.parent) {
        const key = c.parent.toString();
        if (!byParent[key]) byParent[key] = [];
        byParent[key].push(c);
      }
    });
    const treeData = parents.map((p) => ({
      ...p,
      children: byParent[p._id.toString()] || [],
    }));
    return res.json({ success: true, data: { categories: treeData } });
  }

  // Flat list
  if (parent !== undefined) {
    if (parent === 'null' || parent === '') {
      filter.parent = null;
    } else {
      filter.parent = parent;
    }
  }

  const categories = await Category.find(filter)
    .populate('parent', 'name')
    .sort('name');

  res.json({ success: true, data: { categories } });
});

// ================= GET ONE =================
// GET /api/categories/:id  → includes children if parent
exports.getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id).populate(
    'parent',
    'name'
  );
  if (!category) throw new ApiError(404, 'Category not found');

  const children = await Category.find({
    parent: category._id,
    isActive: true,
  }).sort('name');

  res.json({
    success: true,
    data: { category: { ...category.toObject(), children } },
  });
});

// ================= UPDATE =================
// PUT /api/categories/:id  (admin only)
exports.updateCategory = asyncHandler(async (req, res) => {
  const data = updateCategorySchema.parse(req.body);

  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  // --- Parent change validation ---
  let newParent = category.parent;
  if (data.parent !== undefined) {
    if (data.parent === null) {
      newParent = null;
    } else {
      // Can't be own parent
      if (data.parent === category._id.toString()) {
        throw new ApiError(400, 'Category cannot be its own parent');
      }
      // Can't have children AND become a child (2 levels only)
      if (category.parent === null) {
        const childCount = await Category.countDocuments({
          parent: category._id,
          isActive: true,
        });
        if (childCount > 0 && data.parent !== null) {
          throw new ApiError(
            400,
            'Cannot assign a parent to a category that has subcategories'
          );
        }
      }
      await validateParent(data.parent);
      newParent = data.parent;
    }
  }

  // --- Uniqueness check on name within target parent ---
  const finalName = data.name ?? category.name;
  const finalParent = newParent ?? null;
  if (
    (data.name && data.name !== category.name) ||
    (data.parent !== undefined && data.parent !== category.parent?.toString())
  ) {
    const exists = await Category.findOne({
      _id: { $ne: category._id },
      name: finalName,
      parent: finalParent,
    });
    if (exists) {
      throw new ApiError(
        409,
        'Category with this name already exists under this parent'
      );
    }
  }

  if (data.name !== undefined) category.name = data.name;
  if (data.description !== undefined) category.description = data.description;
  if (data.parent !== undefined) category.parent = newParent;
  if (data.isActive !== undefined) category.isActive = data.isActive;

  await category.save();

  res.json({
    success: true,
    message: 'Category updated',
    data: { category },
  });
});

// ================= DELETE (soft) =================
// DELETE /api/categories/:id  (admin only)
exports.deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  // Block if it has active children
  const childCount = await Category.countDocuments({
    parent: category._id,
    isActive: true,
  });
  if (childCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete: category has ${childCount} active subcategories`
    );
  }

  category.isActive = false;
  await category.save();

  // If it's a child, nothing cascades.
  // If it's a parent with already-inactive children, they stay inactive.

  res.json({ success: true, message: 'Category deleted' });
});