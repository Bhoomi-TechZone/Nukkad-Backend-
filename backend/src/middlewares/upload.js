const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// 1. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Configure Multer Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nukkad_products',
    format: async (req, file) => 'png',
    public_id: (req, file) => Date.now() + '-' + file.originalname.split('.')[0], // Optional: unique filename
  },
});

const upload = multer({ storage: storage });

// 3. Configure Multer Storage for Reels (Video)
const reelStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nukkad_reels',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mov', 'webm', 'mkv'],
    public_id: (req, file) => Date.now() + '-' + file.originalname.split('.')[0],
  },
});

const uploadReel = multer({
  storage: reelStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max video size
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('video/')) {
      const err = new Error('Only video files are allowed');
      err.statusCode = 400;
      return cb(err, false);
    }
    cb(null, true);
  },
});

upload.uploadReel = uploadReel;

module.exports = upload;