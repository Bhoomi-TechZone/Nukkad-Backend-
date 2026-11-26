const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createCategorySchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  parent: z
    .string()
    .regex(objectIdRegex, 'Invalid parent id')
    .nullable()
    .optional(),               // omit = top-level
});

const updateCategorySchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional(),
  parent: z
    .string()
    .regex(objectIdRegex, 'Invalid parent id')
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

module.exports = { createCategorySchema, updateCategorySchema };