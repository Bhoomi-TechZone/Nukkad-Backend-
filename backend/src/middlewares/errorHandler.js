const errorHandler = (err, req, res, next) => {
  // Zod validation errors
  if (err.name === 'ZodError' && Array.isArray(err.errors)) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.errors.map((e) => ({
        field: Array.isArray(e.path) ? e.path.join('.') : String(e.path),
        message: e.message,
      })),
    });
  }

  // Mongoose validation errors (err.errors is an OBJECT, not array)
  if (err.name === 'ValidationError' && err.errors) {
    return res.status(400).json({
      success: false,
      message: Object.values(err.errors)
        .map((e) => e.message)
        .join(', '),
    });
  }

  // Duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already registered`,
    });
  }

  // Invalid ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  // Multer upload errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error',
    });
  }

  // Fallback
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };