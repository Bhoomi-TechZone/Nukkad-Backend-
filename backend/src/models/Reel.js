const mongoose = require('mongoose');

const reelSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    videoUrl: {
      type: String, // Cloudinary video URL
      required: [true, 'Reel video is required'],
    },
    publicId: {
      type: String,
      trim: true,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

reelSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Reel', reelSchema);

