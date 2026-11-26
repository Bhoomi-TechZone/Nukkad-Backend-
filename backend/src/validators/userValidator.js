const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const updateUserSchema = z.object({
  // ---- User fields ----
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits').optional(),
  city: z.string().min(2).max(50).optional(),
  status: z.enum(['active', 'pending', 'rejected', 'blocked']).optional(),

  // ---- Shop fields (only used if target is shopkeeper) ----
  shopName: z.string().min(2).max(100).optional(),
  shopCategory: z.string().regex(objectIdRegex, 'Invalid category id').optional(),
  aboutShop: z.string().max(500).optional(),
  openingHours: z
    .object({
      open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h'),
      close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h'),
      days: z.array(z.enum(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])).min(1),
    })
    .refine((v) => v.open < v.close, {
      message: 'openingHours.close must be after open',
      path: ['close'],
    })
    .optional(),
  address: z
    .object({
      area: z.string().min(2).max(100).optional(),
      city: z.string().min(2).max(50).optional(),
      pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional(),
      state: z.string().min(2).max(50).optional(),
    })
    .optional(),
  shopStatus: z.enum(['pending', 'active', 'rejected']).optional(),
});

module.exports = { updateUserSchema };