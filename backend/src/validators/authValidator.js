const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const phoneRegex = /^\d{10}$/;
const pincodeRegex = /^\d{6}$/;

// ---------- OTP ----------
const otpBaseFields = {
  purpose: z.enum(['register', 'login']),
  method: z.enum(['email', 'phone']),
  email: z.string().email().optional(),
  phone: z.string().regex(phoneRegex, 'Phone must be 10 digits').optional(),
  mobile: z.string().regex(phoneRegex, 'Mobile must be 10 digits').optional(),
};

function validateMethodTarget(data, ctx) {
  if (data.method === 'email' && !data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email is required when method is email',
      path: ['email'],
    });
  }
  if (data.method === 'phone' && !(data.phone || data.mobile)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phone is required when method is phone',
      path: ['phone'],
    });
  }
}

const sendOtpSchema = z.object(otpBaseFields).superRefine(validateMethodTarget);

const verifyOtpSchema = z
  .object({
    ...otpBaseFields,
    otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  })
  .superRefine(validateMethodTarget);

// ---------- Consumer ----------
const consumerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  phone: z.string().regex(phoneRegex, 'Phone must be 10 digits'),
  city: z.string().min(2).max(50),
  pincode: z.string().regex(pincodeRegex, 'Pincode must be 6 digits'),
  method: z.enum(['email', 'phone']).optional(),
});

// ---------- Shopkeeper ----------
const shopkeeperSchema = z.object({
  ownerName: z.string().min(2).max(50),
  email: z.string().email(),
  mobile: z.string().regex(phoneRegex, 'Mobile must be 10 digits'),
  pincode: z.string().regex(pincodeRegex, 'Pincode must be 6 digits').optional(),
  method: z.enum(['email', 'phone']).optional(),

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
    pincode: z.string().regex(pincodeRegex, 'Pincode must be 6 digits'),
    state: z.string().min(2).max(50),
  }),
});

// ---------- Role-discriminated public register (consumer & shopkeeper only) ----------
const registerSchema = z.discriminatedUnion('role', [
  consumerSchema.extend({ role: z.literal('consumer') }),
  shopkeeperSchema.extend({ role: z.literal('shopkeeper') }),
]);

// ---------- OTP Login (email or phone, no role required) ----------
const loginSchema = z
  .object({
    method: z.enum(['email', 'phone']).optional(),
    email: z.string().email().optional(),
    phone: z.string().regex(phoneRegex, 'Phone must be 10 digits').optional(),
    mobile: z.string().regex(phoneRegex, 'Mobile must be 10 digits').optional(),
    otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.method) {
      validateMethodTarget(data, ctx);
      return;
    }
    if (!(data.email || data.phone || data.mobile)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either email or phone',
        path: ['email'],
      });
    }
  });

module.exports = { sendOtpSchema, verifyOtpSchema, registerSchema, loginSchema };
