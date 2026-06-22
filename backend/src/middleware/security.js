/**
 * Security Middleware
 * Request sanitization, size limits, path traversal prevention
 */

const { v4: uuidv4 } = require('uuid');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const purify = createDOMPurify(new JSDOM('').window);

// Default: strip all HTML (used for every field that isn't explicitly trusted HTML).
const STRIP_ALL_OPTS = { ALLOWED_TAGS: [], ALLOWED_ATTR: [] };

// Used for fields that intentionally store rich HTML (e.g. document template content).
// Still removes <script>, event handlers, and other XSS vectors; only safe formatting
// tags and style/href attributes are allowed through.
const SAFE_HTML_OPTS = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    'span', 'div', 'hr', 'sub', 'sup',
  ],
  ALLOWED_ATTR: [
    'style', 'class', 'id',
    'href', 'target', 'rel',
    'src', 'alt', 'title', 'width', 'height',
    'colspan', 'rowspan', 'align',
  ],
  ALLOW_DATA_ATTR: false,
};

/**
 * Add unique request ID for tracing
 */
const addRequestId = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

/**
 * Sanitize request body and query params using DOMPurify.
 *
 * Options:
 *   htmlFields {string[]} - field names whose values are trusted rich HTML and should
 *                           be sanitised with SAFE_HTML_OPTS (preserves formatting tags)
 *                           rather than STRIP_ALL_OPTS (removes all tags).
 *
 * All other string fields continue to have every HTML tag stripped.
 */
const sanitizeRequest = (options = {}) => {
  const htmlFields = new Set(options.htmlFields || []);

  return (req, res, next) => {
    const sanitizeValue = (key, value) => {
      const opts = htmlFields.has(key) ? SAFE_HTML_OPTS : STRIP_ALL_OPTS;
      return purify.sanitize(value, opts);
    };

    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitized[key] = sanitizeValue(key, value);
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map((item) =>
            typeof item === 'string' ? sanitizeValue(key, item) : sanitize(item)
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
