const { z } = require('zod');

const phoneRegex = /^\d{10}$/;
const pincodeRegex = /^\d{6}$/;
const objectIdRegex = /^[0-9a-fA-F]{24}$/; // <-- added

// ---------- OTP (phone only) ----------
const sendOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Phone must be 10 digits'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Phone must be 10 digits'),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

// ---------- Consumer ----------
const consumerSchema = z.object({
  role: z.literal('consumer'),
  name: z.string().min(2).max(50),
  phone: z.string().regex(phoneRegex, 'Phone must be 10 digits'),
  city: z.string().min(2).max(50),
  pincode: z.string().regex(pincodeRegex, 'Pincode must be 6 digits'),
});

// ---------- Shopkeeper ----------
const shopkeeperSchema = z.object({
  role: z.literal('shopkeeper'),
  ownerName: z.string().min(2).max(50),
  phone: z.string().regex(phoneRegex, 'Phone must be 10 digits'),
  pincode: z.string().regex(pincodeRegex, 'Pincode must be 6 digits').optional(),
  shopName: z.string().min(2).max(100),
  shopCategory: z.string().regex(objectIdRegex, 'Invalid category id'),
  aboutShop: z.string().max(500).optional(),
  openingHours: z
    .object({
      open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h'),
      close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h'),
      days: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).min(1),
    })
    .refine(v => v.open < v.close, {
      message: 'openingHours.close must be after open',
      path: ['close'],
    }),
  address: z.object({
    area: z.string().min(2).max(100),
    city: z.string().min(2).max(50),
    pincode: z.string().regex(pincodeRegex, 'Pincode must be 6 digits'),
    state: z.string().min(2).max(50),
  }),
});

const registerSchema = z.discriminatedUnion('role', [consumerSchema, shopkeeperSchema]);

module.exports = { sendOtpSchema, verifyOtpSchema, registerSchema };