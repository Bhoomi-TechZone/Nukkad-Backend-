const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    // email field removed – phone‑only flow
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, 'Phone must be 10 digits'],
    },
    city: {
      type: String,
      trim: true,
      // Only required for consumers — enforced in validator/controller
    },
    pincode: {
      type: String,
      trim: true,
      match: [/^\d{6}$/, 'Pincode must be 6 digits'],
    },
    role: {
      type: String,
      enum: ['consumer', 'shopkeeper', 'admin'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'rejected', 'blocked'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);