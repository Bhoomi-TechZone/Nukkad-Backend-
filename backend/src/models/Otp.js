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
    method: {
      type: String,
      enum: ['email', 'phone'],
      required: true,
    },
    purpose: {
      type: String,
      enum: ['register', 'login'],
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
    pendingData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

otpSchema.index({ target: 1, purpose: 1, method: 1 });
// Automatically delete expired OTP records
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
