/**
 * Global Error Handler Middleware
 * Handles all errors thrown in the application
 */

const config = require('../config');

const errorHandler = (err, req, res, next) => {
  // Log error with request context
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    institutionId: req.institution?.id,
    userId: req.user?.id,
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errorCode = err.errorCode || 'INTERNAL_ERROR';

  // MySQL specific errors
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Duplicate entry. This record already exists.';
    errorCode = 'DUPLICATE_ENTRY';
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    statusCode = 400;
    message = 'Invalid reference. The related record does not exist.';
    errorCode = 'INVALID_REFERENCE';
  }

  if (err.code === 'ER_DATA_TOO_LONG') {
    statusCode = 400;
    message = 'Data too long for the field.';
    errorCode = 'DATA_TOO_LONG';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
    errorCode = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired.';
    errorCode = 'TOKEN_EXPIRED';
  }

  // Don't leak error details in production
  if (config.isProduction && statusCode === 500) {
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorCode,
    ...(config.isDevelopment && { stack: err.stack }),
    ...(req.requestId && { requestId: req.requestId }),
  });
};

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler,
};
