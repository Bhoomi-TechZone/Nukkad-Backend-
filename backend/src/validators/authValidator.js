const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// ---------- Consumer ----------
const consumerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  city: z.string().min(2).max(50),
  otp: z.string(),
});

// ---------- Shopkeeper ----------
const shopkeeperSchema = z.object({
  ownerName: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  mobile: z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits'),
  otp: z.string(),

  shopName: z.string().min(2).max(100),
  shopCategory: z.string().regex(objectIdRegex, 'Invalid category id'),
  aboutShop: z.string().max(500).optional(),
  openingHours: z
    .object({
      open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h'),
      close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h'),
      days: z
        .array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']))
        .min(1),
    })
    .refine((v) => v.open < v.close, {
      message: 'openingHours.close must be after open',
      path: ['close'],
    }),
  address: z.object({
    area: z.string().min(2).max(100),
    city: z.string().min(2).max(50),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    state: z.string().min(2).max(50),
  }),
});

// ---------- Admin ----------
const adminSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  otp: z.string(),
});

// ---------- Role-discriminated register ----------
const registerSchema = z.discriminatedUnion('role', [
  consumerSchema.extend({ role: z.literal('consumer') }),
  shopkeeperSchema.extend({ role: z.literal('shopkeeper') }),
  adminSchema.extend({ role: z.literal('admin') }),
]);

// ---------- Login ----------
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

module.exports = { registerSchema, loginSchema };