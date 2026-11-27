const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createInquirySchema = z.object({
  productId: z.string().regex(objectIdRegex, 'Invalid product id'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  city: z.string().min(2, 'City is required'),
  message: z.string().max(500).optional(),
  // Optional date string if you want the consumer to specify a date, 
  // otherwise it defaults to the current server time.
  date: z.string().optional().transform((val) => val ? new Date(val) : undefined),
});

const updateStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'converted']),
});

module.exports = { createInquirySchema, updateStatusSchema };