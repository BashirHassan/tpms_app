/**
 * Rate Limiter Middleware
 * Token bucket rate limiting for API protection
 */

const config = require('../config');

// In-memory store for rate limiting
// In production, use Redis for distributed rate limiting
const rateLimitStore = new Map();

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limit configuration
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const maxRequests = options.maxRequests || config.rateLimit.maxRequests;
  const keyGenerator = options.keyGenerator || ((req) => req.ip);
  const skipSuccessfulRequests = options.skipSuccessfulRequests || false;
  const message = options.message || 'Too many requests, please try again later.';

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || entry.windowStart < windowStart) {
      entry = {
        windowStart: now,
        count: 0,
        blocked: false,
      };
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      cleanupOldEntries(windowMs);
    }

    // Check if blocked
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);

      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(entry.windowStart + windowMs).toISOString());

      return res.status(429).json({
        success: false,
        message,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', new Date(entry.windowStart + windowMs).toISOString());

    // Skip counting successful requests if configured
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function (body) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          entry.count--;
          rateLimitStore.set(key, entry);
        }
        return originalSend.call(this, body);
      };
    }

    next();
  };
};

/**
 * Clean up old rate limit entries
 */
const cleanupOldEntries = (windowMs) => {
  const now = Date.now();
  const windowStart = now - windowMs;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart < windowStart) {
      rateLimitStore.delete(key);
    }
  }
};

// Pre-configured rate limiters
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  keyGenerator: (req) => `auth:${req.ip}`,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyGenerator: (req) => `api:${req.ip}:${req.user?.id || 'anon'}`,
});

const publicRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  keyGenerator: (req) => `public:${req.ip}`,
});

const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,
  keyGenerator: (req) => `upload:${req.ip}:${req.user?.id || 'anon'}`,
  message: 'Upload limit exceeded. Please try again later.',
});

const sensitiveRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  keyGenerator: (req) => `sensitive:${req.ip}:${req.user?.id || 'anon'}`,
  message: 'Rate limit exceeded for sensitive operations.',
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  publicRateLimiter,
  uploadRateLimiter,
  sensitiveRateLimiter,
};
