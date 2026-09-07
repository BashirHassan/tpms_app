/**
 * Rate Limiter Middleware
 * Token bucket rate limiting for API protection
 */

const crypto = require('crypto');
const config = require('../config');

/**
 * Real client IP.
 *
 * Prefers Cloudflare's header because the edge overwrites it, so it cannot be
 * forged by the caller the way X-Forwarded-For can. Falls back to Express's
 * req.ip (meaningful now that server.js sets `trust proxy`), then the raw
 * socket.
 *
 * Before this existed every key was built from a bare req.ip, which without
 * `trust proxy` was the nginx address on every request - collapsing each
 * IP-keyed limiter into one global bucket for the whole platform.
 */
function getClientIP(req) {
  const ip =
    req.headers?.['cf-connecting-ip'] ||
    req.headers?.['x-forwarded-for']?.split(',')[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown';

  return String(ip).replace(/^::ffff:/, '');
}

/**
 * Identify the caller for bucketing.
 *
 * Limiters mounted before `authenticate` have no req.user, so fall back to a
 * fingerprint of the bearer token: enough to tell two logged-in students
 * apart behind one carrier NAT, and never trusted for authorisation. Callers
 * rotating fake tokens to mint fresh buckets are caught by
 * ipCeilingRateLimiter.
 */
function getRequestIdentity(req) {
  const userId = req.user?.id || req.student?.id;
  if (userId) return `u${userId}`;

  const header = req.headers?.authorization || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) {
      return `t${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
    }
  }

  return 'anon';
}

// In-memory store for rate limiting
// In production, use Redis for distributed rate limiting
const rateLimitStore = new Map();

/**
 * Create a rate limiter middleware
 * @param {Object} options - Rate limit configuration
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs ?? config.rateLimit.windowMs;
  const maxRequests = options.maxRequests ?? config.rateLimit.maxRequests;
  const keyGenerator = options.keyGenerator || ((req) => getClientIP(req));
  const skipSuccessfulRequests = options.skipSuccessfulRequests || false;
  const message = options.message || 'Too many requests, please try again later.';
  const skip = options.skip || (() => false);

  return (req, res, next) => {
    if (skip(req)) return next();

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

      console.warn(
        `[rate-limit] key=${key} ip=${getClientIP(req)} path=${req.path} count=${entry.count}`
      );

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
  // Key per account, not just per IP: many students may share one campus NAT/IP
  // (TRUST_PROXY=true), so IP-only keying would lock them all out together. Each
  // account (email / registration number) gets its own budget; brute-forcing a
  // single account is still limited to 10 attempts / 15 min.
  keyGenerator: (req) => {
    // Field names match the auth Zod schemas: staff login = `email`,
    // student login = `registrationNumber`.
    const raw = req.body?.email || req.body?.registrationNumber || '';
    const identifier = raw.toString().toLowerCase().trim();
    return `auth:${getClientIP(req)}:${identifier}`;
  },
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyGenerator: (req) => `api:${getClientIP(req)}:${getRequestIdentity(req)}`,

  // Only for requests we can attribute to a logged-in session. Anonymous
  // traffic from one IP is NOT lumped into a single 60/min bucket: campuses
  // and Nigerian carriers NAT heavily, so during a login rush that would lock
  // out everyone behind the address - the same failure this keying was
  // introduced to prevent. Unauthenticated traffic is bounded instead by
  // ipCeilingRateLimiter (600/min per IP) plus the per-route publicRateLimiter
  // and authRateLimiter, which key on the account being targeted.
  skip: (req) => getRequestIdentity(req) === 'anon',
});

/**
 * Per-IP ceiling
 *
 * apiRateLimiter buckets per logged-in session, so this is what bounds a
 * single IP overall - high enough for a shared campus or carrier NAT, low
 * enough to stop a runaway client (one student once made 9,023 requests to a
 * single endpoint in a day, unthrottled because apiRateLimiter was never
 * mounted).
 */
const ipCeilingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 600,
  keyGenerator: (req) => `ipmax:${getClientIP(req)}`,
  message: 'This network is sending too many requests. Please wait a moment and try again.',
});

const publicRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  keyGenerator: (req) => `public:${getClientIP(req)}`,
});

const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,
  keyGenerator: (req) => `upload:${getClientIP(req)}:${getRequestIdentity(req)}`,
  message: 'Upload limit exceeded. Please try again later.',
});

const sensitiveRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  keyGenerator: (req) => `sensitive:${getClientIP(req)}:${getRequestIdentity(req)}`,
  message: 'Rate limit exceeded for sensitive operations.',
});

module.exports = {
  createRateLimiter,
  getClientIP,
  ipCeilingRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  publicRateLimiter,
  uploadRateLimiter,
  sensitiveRateLimiter,
};
