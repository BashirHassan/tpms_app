/**
 * Middleware Index - MedeePay Pattern
 * Central export for all middleware
 * 
 * ARCHITECTURE (MedeePay Pattern):
 * - Authentication: JWT validation, user loading
 * - Authorization: RBAC with requireInstitutionAccess middleware
 * - Security: Rate limiting, sanitization, headers
 * - Features: Feature flag enforcement
 * 
 * KEY CHANGE:
 * - OLD: resolveTenantContext + requireTenantContext + attachRepositories
 * - NEW: requireInstitutionAccess(PERMISSION) - single middleware for access + RBAC
 * 
 * 🔒 MULTI-ACCOUNT SUPPORT:
 * - requireValidSession: Validates session is active in DB (for high-security endpoints)
 */

const {
  authenticate,
  requireValidSession,
  generateToken,
  AUTH_TYPES,
} = require('./auth');

const validate = require('./validate');
const { errorHandler, AppError, asyncHandler } = require('./errorHandler');
const { requireFeature, requireAllFeatures, requireAnyFeature } = require('./featureToggle');

const {
  addRequestId,
  sanitizeRequest,
  requestSizeLimit,
  preventPathTraversal,
  securityHeaders,
  blockSuspiciousUserAgents,
} = require('./security');

const {
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  publicRateLimiter,
  uploadRateLimiter,
  sensitiveRateLimiter,
} = require('./rateLimiter');

// NEW: MedeePay-style RBAC
const {
  requireInstitutionAccess,
  requireGlobalAccess,
  ROLE_HIERARCHY,
  ROLES,
  hasInstitutionAccess,
  hasMinimumRole,
  staffOnly,
  studentOnly,
  isSuperAdmin,
  isHeadOfTP,
  isSupervisor,
  isFieldMonitor,
  isStaff,
  authorize,
} = require('./rbac');

// Keep subdomain resolver for branding lookup
const {
  resolveSubdomain,
  requireSubdomain,
  extractSubdomain,
  getInstitutionBySubdomain,
  clearInstitutionCache,
  isSuperAdminPortal,
} = require('./subdomainResolver');

module.exports = {
  // Authentication
  authenticate,
  requireValidSession,
  generateToken,
  AUTH_TYPES,

  // Authorization (MedeePay Pattern)
  requireInstitutionAccess,
  requireGlobalAccess,
  ROLES,
  ROLE_HIERARCHY,
  hasInstitutionAccess,
  hasMinimumRole,
  authorize,
  
  // Role checks
  staffOnly,
  studentOnly,
  isSuperAdmin,
  isHeadOfTP,
  isSupervisor,
  isFieldMonitor,
  isStaff,

  // Validation
  validate,

  // Error Handling
  errorHandler,
  AppError,
  asyncHandler,

  // Feature Toggles
  requireFeature,
  requireAllFeatures,
  requireAnyFeature,

  // Security
  addRequestId,
  sanitizeRequest,
  requestSizeLimit,
  preventPathTraversal,
  securityHeaders,
  blockSuspiciousUserAgents,

  // Rate Limiting
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  publicRateLimiter,
  uploadRateLimiter,
  sensitiveRateLimiter,
  
  // Subdomain Resolution (for branding lookup only)
  resolveSubdomain,
  requireSubdomain,
  extractSubdomain,
  getInstitutionBySubdomain,
  clearInstitutionCache,
  isSuperAdminPortal,
};
