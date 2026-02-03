/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Simplified middleware using only roles for authorization.
 * Follows MedeePay pattern: Institution ID in URL, single middleware layer.
 * 
 * Subdomain-Aligned Access:
 *   - Super admin on 'admin' subdomain = Global context (no institution)
 *   - Super admin on institution subdomain = Institution context (like regular admin)
 *   - Regular users = Always institution context from their subdomain
 * 
 * Usage:
 *   router.get('/:institutionId/students', authenticate, requireInstitutionAccess(), staffOnly, handler);
 *   router.post('/:institutionId/students', authenticate, requireInstitutionAccess(), isHeadOfTP, handler);
 */

const { query } = require('../db/database');

/**
 * Role definitions
 */
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HEAD_OF_TEACHING_PRACTICE: 'head_of_teaching_practice',
  SUPERVISOR: 'supervisor',
  FIELD_MONITOR: 'field_monitor',
  STUDENT: 'student',
};

/**
 * Role hierarchy - higher index means more access
 */
const ROLE_HIERARCHY = {
  [ROLES.STUDENT]: 10,
  [ROLES.FIELD_MONITOR]: 20,
  [ROLES.SUPERVISOR]: 30,
  [ROLES.HEAD_OF_TEACHING_PRACTICE]: 40,
  [ROLES.SUPER_ADMIN]: 99,
};

/**
 * Cache for institution lookups (5 minute TTL)
 */
const institutionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get institution by ID with caching
 * @param {number} institutionId 
 * @returns {Promise<Object|null>}
 */
async function getInstitutionById(institutionId) {
  if (!institutionId) return null;

  const cacheKey = `inst:${institutionId}`;
  const cached = institutionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const rows = await query(
      'SELECT id, name, code, subdomain, status FROM institutions WHERE id = ? AND status = ?',
      [institutionId, 'active']
    );

    const institution = rows[0] || null;
    institutionCache.set(cacheKey, { data: institution, timestamp: Date.now() });
    return institution;
  } catch (error) {
    console.error('Failed to lookup institution by ID:', error);
    return null;
  }
}

/**
 * Clear institution cache
 * @param {number} [institutionId] - Clear specific institution, or all if not provided
 */
function clearInstitutionCache(institutionId = null) {
  if (institutionId) {
    institutionCache.delete(`inst:${institutionId}`);
  } else {
    institutionCache.clear();
  }
}

/**
 * Check if user has access to an institution
 * @param {Object} user - User object from auth middleware
 * @param {number} institutionId - Target institution ID
 * @returns {boolean}
 */
function hasInstitutionAccess(user, institutionId) {
  if (!user) return false;
  
  // Super admin can access all institutions
  if (user.role === ROLES.SUPER_ADMIN) {
    return true;
  }
  
  // Regular users can only access their own institution
  return user.institution_id === parseInt(institutionId);
}

/**
 * Check if user's role meets minimum required level
 * @param {Object} user - User object
 * @param {string} minRole - Minimum role required
 * @returns {boolean}
 */
function hasMinimumRole(user, minRole) {
  if (!user) return false;
  
  const userLevel = ROLE_HIERARCHY[user.role] || 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
  
  return userLevel >= requiredLevel;
}

/**
 * Log security events for audit trail
 * @param {Object} data - Security event data
 */
async function logSecurityEvent(data) {
  try {
    await query(
      `INSERT INTO audit_logs 
       (institution_id, user_id, user_type, action, resource_type, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, 'security', ?, ?, ?, NOW())`,
      [
        data.institutionId || null,
        data.userId || null,
        data.userType || 'unknown',
        data.action,
        JSON.stringify(data.details || {}),
        data.ipAddress || null,
        data.userAgent || null,
      ]
    );
  } catch (error) {
    // Don't let logging failures break the request
    console.error('[SECURITY] Failed to log security event:', error.message);
  }
}

/**
 * Institution access middleware
 * 
 * Extracts institutionId from req.params.institutionId
 * Validates user has access to that institution
 * 
 * 🔒 SECURITY: Subdomain-Aligned Access
 * - Super admin on 'admin' subdomain can access any institution via URL
 * - Super admin on institution subdomain can ONLY access that subdomain's institution
 * - Regular users can only access their own institution
 * 
 * @returns {Function} Express middleware
 */
function requireInstitutionAccess() {
  return async (req, res, next) => {
    try {
      // Must be authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          errorCode: 'NOT_AUTHENTICATED',
        });
      }

      // Get institution ID from route params
      const institutionId = parseInt(req.params.institutionId);
      
      if (!institutionId || isNaN(institutionId)) {
        return res.status(400).json({
          success: false,
          message: 'Institution ID is required in URL',
          errorCode: 'INSTITUTION_ID_REQUIRED',
        });
      }

      // Verify institution exists and is active
      const institution = await getInstitutionById(institutionId);
      if (!institution) {
        return res.status(404).json({
          success: false,
          message: 'Institution not found or inactive',
          errorCode: 'INSTITUTION_NOT_FOUND',
        });
      }

      // 🔒 SECURITY: Subdomain-aligned access check
      const isSuperAdmin = req.user.role === ROLES.SUPER_ADMIN;
      const isGlobalContext = req.isGlobalContext === true; // From subdomainResolver
      const subdomainInstitution = req.subdomainInstitution;
      
      if (isSuperAdmin) {
        // Super admin on global admin portal can access any institution
        if (isGlobalContext) {
          // ✅ Full access from admin.* subdomain
          req.institutionId = institutionId;
          req.institution = institution;
          return next();
        }
        
        // Super admin on institution subdomain must match that institution
        if (subdomainInstitution && subdomainInstitution.id !== institutionId) {
          console.warn(
            `[SECURITY] Super admin subdomain mismatch: User ${req.user.id} ` +
            `on subdomain ${subdomainInstitution.subdomain} (${subdomainInstitution.id}) ` +
            `tried to access institution ${institutionId}. Path: ${req.method} ${req.originalUrl}`
          );
          
          await logSecurityEvent({
            institutionId: subdomainInstitution.id,
            userId: req.user.id,
            userType: 'staff',
            action: 'subdomain_institution_mismatch',
            details: {
              subdomain: subdomainInstitution.subdomain,
              subdomain_institution: subdomainInstitution.id,
              attempted_institution: institutionId,
              path: req.originalUrl,
              method: req.method,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });

          return res.status(403).json({
            success: false,
            message: 'Access denied. Institution does not match current subdomain.',
            errorCode: 'SUBDOMAIN_INSTITUTION_MISMATCH',
          });
        }
      } else {
        // Regular users - check standard institution access
        if (!hasInstitutionAccess(req.user, institutionId)) {
          console.warn(
            `[SECURITY] Cross-institution access attempt: User ${req.user.id} (institution: ${req.user.institution_id}) ` +
            `tried to access institution ${institutionId}. Path: ${req.method} ${req.originalUrl}`
          );
          
          await logSecurityEvent({
            institutionId: req.user.institution_id,
            userId: req.user.id,
            userType: req.authType || 'staff',
            action: 'cross_institution_access_denied',
            details: {
              attempted_institution: institutionId,
              user_institution: req.user.institution_id,
              path: req.originalUrl,
              method: req.method,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });

          return res.status(403).json({
            success: false,
            message: 'Access denied to this institution',
            errorCode: 'INSTITUTION_ACCESS_DENIED',
          });
        }
      }

      // Attach institution context to request
      req.institutionId = institutionId;
      req.institution = institution;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware for global routes (super_admin only, admin.* subdomain only)
 * 
 * 🔒 SECURITY: Global routes require:
 * 1. Authenticated user
 * 2. super_admin role
 * 3. Access via 'admin' subdomain (global context)
 */
function requireGlobalAccess() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        errorCode: 'NOT_AUTHENTICATED',
      });
    }

    if (req.user.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Super admin access required',
        errorCode: 'SUPER_ADMIN_REQUIRED',
      });
    }

    // 🔒 SECURITY: Global routes require 'admin' subdomain
    if (req.isGlobalContext !== true) {
      console.warn(
        `[SECURITY] Global route access from non-admin subdomain: User ${req.user.id} ` +
        `on subdomain '${req.subdomain || 'none'}' tried to access global route. ` +
        `Path: ${req.method} ${req.originalUrl}`
      );
      
      return res.status(403).json({
        success: false,
        message: 'Global routes require access via admin subdomain',
        errorCode: 'ADMIN_SUBDOMAIN_REQUIRED',
      });
    }

    next();
  };
}

/**
 * Middleware to ensure user is staff (not student)
 */
function staffOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      errorCode: 'NOT_AUTHENTICATED',
    });
  }

  if (req.user.role === ROLES.STUDENT) {
    return res.status(403).json({
      success: false,
      message: 'This resource is only accessible to staff',
      errorCode: 'STAFF_ONLY',
    });
  }

  next();
}

/**
 * Middleware to ensure user is student
 */
function studentOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      errorCode: 'NOT_AUTHENTICATED',
    });
  }

  if (req.user.role !== ROLES.STUDENT) {
    return res.status(403).json({
      success: false,
      message: 'This resource is only accessible to students',
      errorCode: 'STUDENT_ONLY',
    });
  }

  req.student = req.user;
  next();
}

/**
 * Middleware factory for role-based authorization
 * @param {...string} allowedRoles - Roles allowed to access
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        errorCode: 'NOT_AUTHENTICATED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
        errorCode: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
}

// Pre-configured authorization middlewares
const isSuperAdmin = authorize(ROLES.SUPER_ADMIN);
const isHeadOfTP = authorize(ROLES.SUPER_ADMIN, ROLES.HEAD_OF_TEACHING_PRACTICE);
const isSupervisor = authorize(ROLES.SUPER_ADMIN, ROLES.HEAD_OF_TEACHING_PRACTICE, ROLES.SUPERVISOR);
const isFieldMonitor = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.HEAD_OF_TEACHING_PRACTICE,
  ROLES.SUPERVISOR,
  ROLES.FIELD_MONITOR
);
const isStaff = authorize(
  ROLES.SUPER_ADMIN,
  ROLES.HEAD_OF_TEACHING_PRACTICE,
  ROLES.SUPERVISOR,
  ROLES.FIELD_MONITOR
);

module.exports = {
  // Roles
  ROLES,
  ROLE_HIERARCHY,
  
  // Main middleware
  requireInstitutionAccess,
  requireGlobalAccess,
  staffOnly,
  studentOnly,
  authorize,
  
  // Pre-configured authorization
  isSuperAdmin,
  isHeadOfTP,
  isSupervisor,
  isFieldMonitor,
  isStaff,
  
  // Utility functions
  hasInstitutionAccess,
  hasMinimumRole,
  getInstitutionById,
  clearInstitutionCache,
  logSecurityEvent,
};
