/**
 * Custom Error Classes
 * 
 * Standardized error types for consistent error handling.
 * All errors extend AppError and are caught by errorHandler middleware.
 */

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error - 400 Bad Request
 * Use when input validation fails
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Not found error - 404 Not Found
 * Use when a resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Authorization error - 403 Forbidden
 * Use when user lacks permission for an action
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Authentication error - 401 Unauthorized
 * Use when user is not authenticated
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Conflict error - 409 Conflict
 * Use for duplicate entries or version conflicts
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT');
    this.details = details;
  }
}

/**
 * Rate limit error - 429 Too Many Requests
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal server error - 500
 * Use for unexpected errors
 */
class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * Service unavailable - 503
 * Use when a dependent service is down
 */
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
};
