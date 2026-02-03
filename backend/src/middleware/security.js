/**
 * Security Middleware
 * Request sanitization, size limits, path traversal prevention
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Add unique request ID for tracing
 */
const addRequestId = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

/**
 * Sanitize request body, query, and params
 * Removes common XSS patterns
 */
const sanitizeRequest = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Remove script tags and event handlers
        sanitized[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .replace(/javascript:/gi, '');
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'string' ? sanitize({ val: item }).val : sanitize(item)
        );
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  next();
};

/**
 * Request size limit enforcement
 */
const requestSizeLimit = (options = {}) => {
  const maxBodySize = options.maxBodySize || 50 * 1024 * 1024; // 50MB default
  const maxJsonSize = options.maxJsonSize || 5 * 1024 * 1024; // 5MB default

  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json') && contentLength > maxJsonSize) {
      return res.status(413).json({
        success: false,
        message: 'Request body too large for JSON content',
        errorCode: 'PAYLOAD_TOO_LARGE',
      });
    }

    if (contentLength > maxBodySize) {
      return res.status(413).json({
        success: false,
        message: 'Request body too large',
        errorCode: 'PAYLOAD_TOO_LARGE',
      });
    }

    next();
  };
};

/**
 * Prevent path traversal attacks
 */
const preventPathTraversal = (req, res, next) => {
  const suspiciousPatterns = [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e/i,
    /%252e%252e/i,
    /\.\.%2f/i,
    /\.\.%5c/i,
  ];

  const fullPath = req.path + (req.url.includes('?') ? req.url.split('?')[1] : '');

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(fullPath)) {
      console.warn(`Path traversal attempt blocked: ${req.path} from ${req.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid request path',
        errorCode: 'INVALID_PATH',
      });
    }
  }

  next();
};

/**
 * Security headers
 */
const securityHeaders = (options = {}) => {
  return (req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HSTS (only in production)
    if (options.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content Security Policy
    if (options.contentSecurityPolicy) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; object-src 'none'"
      );
    }

    next();
  };
};

/**
 * Block suspicious user agents
 */
const blockSuspiciousUserAgents = (options = {}) => {
  const blockedAgents = options.blockedAgents || [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /masscan/i,
    /dirbuster/i,
    /gobuster/i,
  ];

  return (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';

    // Block empty user agents if configured
    if (options.blockEmpty && !userAgent) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        errorCode: 'BLOCKED_REQUEST',
      });
    }

    for (const pattern of blockedAgents) {
      if (pattern.test(userAgent)) {
        console.warn(`Blocked suspicious user agent: ${userAgent} from ${req.ip}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied',
          errorCode: 'BLOCKED_REQUEST',
        });
      }
    }

    next();
  };
};

module.exports = {
  addRequestId,
  sanitizeRequest,
  requestSizeLimit,
  preventPathTraversal,
  securityHeaders,
  blockSuspiciousUserAgents,
};
