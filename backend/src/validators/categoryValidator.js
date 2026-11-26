const { z } = require('zod');

const createCategorySchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
});

module.exports = { createCategorySchema, updateCategorySchema };