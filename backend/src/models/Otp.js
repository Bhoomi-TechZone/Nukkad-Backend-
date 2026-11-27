const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    target: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['phone', 'email'],
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Automatically delete expired OTP records
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);

