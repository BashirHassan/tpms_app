/**
 * Authentication & Authorization Middleware
 * 
 * REFACTORED: Clean separation of concerns
 * - authenticate: Validates JWT and loads user (NO institution logic)
 * - authorize: Role-based access control
 * - requireValidSession: Optional session validation for high-security endpoints
 * - Tenant context handled separately by tenantContext.js
 * 
 * DESIGN PRINCIPLES:
 * 1. Auth middleware ONLY handles authentication
 * 2. Institution/tenant context is resolved AFTER auth by tenantContext middleware
 * 3. No magic defaults or implicit institution creation
 * 4. Fail-fast behavior for invalid states
 * 
 * 🔒 MULTI-ACCOUNT SUPPORT:
 * - Extracts sessionId from JWT for tab-level session isolation
 * - Each browser tab has a unique session that can be independently managed
 * - Logout invalidates only the specific session, not all sessions
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const pool = require('../db/connection');

/**
 * Find student by ID (for authentication)
 * Direct SQL query since Student model was removed in migration
 */
async function findStudentById(id) {
  const [rows] = await pool.query(
    `SELECT s.id, s.institution_id, s.full_name as name, s.registration_number, 
            s.status, s.program_id, s.session_id,
            i.name as institution_name, i.code as institution_code, i.subdomain
     FROM students s
     LEFT JOIN institutions i ON s.institution_id = i.id
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Role definitions for DigitalTP
 * Based on PRD requirements
 */
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HEAD_OF_TEACHING_PRACTICE: 'head_of_teaching_practice',
  SUPERVISOR: 'supervisor',
  FIELD_MONITOR: 'field_monitor',
  STUDENT: 'student',
};

/**
 * Role hierarchy for permission inheritance
 * Higher index = more permissions
 */
const ROLE_HIERARCHY = [
  ROLES.STUDENT,
  ROLES.FIELD_MONITOR,
  ROLES.SUPERVISOR,
  ROLES.HEAD_OF_TEACHING_PRACTICE,
  ROLES.SUPER_ADMIN,
];

/**
 * Authentication Types
 */
const AUTH_TYPES = {
  STAFF: 'staff', // Email + Password
  STUDENT: 'student', // Registration Number + PIN
};

/**
 * JWT Authentication Middleware
 * 
 * RESPONSIBILITIES (and nothing more):
 * - Validate JWT token
 * - Load user from database
 * - Verify user is active
 * - Attach user to request
 * - Extract session ID from token for logout/session management
 * 
 * DOES NOT:
 * - Resolve institution/tenant context
 * - Create fake institution objects
 * - Handle institution switching
 * 
 * 🔒 MULTI-ACCOUNT: Extracts sessionId from JWT for session-aware operations
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        errorCode: 'NO_TOKEN',
      });
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.',
          errorCode: 'INVALID_TOKEN',
        });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired.',
          errorCode: 'TOKEN_EXPIRED',
        });
      }
      throw jwtError;
    }

    // Lazy load User model only (Student uses direct SQL via findStudentById)
    const { User } = require('../models');

    let user = null;
    const authType = decoded.authType || AUTH_TYPES.STAFF;

    // Fetch user based on auth type
    if (authType === AUTH_TYPES.STUDENT) {
      user = await findStudentById(decoded.userId);
      if (user) {
        user.role = ROLES.STUDENT;
        user.authType = AUTH_TYPES.STUDENT;
      }
    } else {
      user = await User.findById(decoded.userId);
      if (user) {
        user.authType = AUTH_TYPES.STAFF;
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive.',
        errorCode: 'ACCOUNT_INACTIVE',
      });
    }

    // Validate institution for non-super_admin users
    // NOTE: We don't load institution here - that's the tenant context middleware's job
    // We only verify that non-super_admin users have an institution assigned
    if (user.role !== ROLES.SUPER_ADMIN && !user.institution_id) {
      return res.status(401).json({
        success: false,
        message: 'User has no institution assigned.',
        errorCode: 'NO_INSTITUTION',
      });
    }

    // Attach user to request
    req.user = user;
    req.authType = authType;
    
    // 🔒 MULTI-ACCOUNT: Extract session ID from token for session management
    // This allows logout to invalidate only the specific session
    if (decoded.sessionId) {
      req.sessionId = decoded.sessionId;
    }

    // LEGACY COMPATIBILITY: Attach institution object for routes not yet migrated
    // TODO: Remove after full migration to tenant context
    if (user.institution_id) {
      const { Institution } = require('../models');
      const institution = await Institution.findById(user.institution_id);
      if (institution && institution.status === 'active') {
        req.institution = institution;
      } else if (user.role !== ROLES.SUPER_ADMIN) {
        return res.status(401).json({
          success: false,
          message: 'Institution is inactive or not found.',
          errorCode: 'INSTITUTION_INACTIVE',
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-Based Authorization Middleware
 * @param {...string} allowedRoles - Roles allowed to access the resource
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated.',
        errorCode: 'NOT_AUTHENTICATED',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
};

/**
 * Institution Scope Enforcement
 * Ensures user can only access their own institution's data
 */
const enforceInstitutionScope = (req, res, next) => {
  if (!req.user || !req.institution) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated.',
      errorCode: 'NOT_AUTHENTICATED',
    });
  }

  // Super admin can access all institutions
  if (req.user.role === ROLES.SUPER_ADMIN && req.query.institution_id) {
    req.scopedInstitutionId = req.query.institution_id;
  } else {
    req.scopedInstitutionId = req.institution.id;
  }

  next();
};

/**
 * Staff-only middleware
 * Blocks student access
 */
const staffOnly = (req, res, next) => {
  if (req.authType === AUTH_TYPES.STUDENT || req.user?.role === ROLES.STUDENT) {
    return res.status(403).json({
      success: false,
      message: 'This resource is only accessible to staff.',
      errorCode: 'STAFF_ONLY',
    });
  }
  next();
};

/**
 * Student-only middleware
 * Blocks staff access and sets student context
 */
const studentOnly = (req, res, next) => {
  if (req.authType !== AUTH_TYPES.STUDENT && req.user?.role !== ROLES.STUDENT) {
    return res.status(403).json({
      success: false,
      message: 'This resource is only accessible to students.',
      errorCode: 'STUDENT_ONLY',
    });
  }
  // Set student reference for easier access in controllers
  req.student = req.user;
  next();
};

/**
 * Validate Session Middleware (Optional)
 * 
 * For high-security endpoints, this middleware ensures the session
 * is still active in the database (not just valid JWT).
 * 
 * Use for: password changes, account deletion, sensitive operations
 * 
 * 🔒 MULTI-ACCOUNT: Validates the specific session from JWT
 */
const requireValidSession = async (req, res, next) => {
  try {
    const sessionId = req.sessionId;
    
    if (!sessionId) {
      // Legacy tokens without sessionId - allow for backward compatibility
      // Remove this block after all tokens have rotated
      return next();
    }
    
    // Check if session exists and is active
    const [session] = await pool.query(
      `SELECT * FROM user_sessions 
       WHERE session_id = ? AND is_active = TRUE AND expires_at > NOW() AND revoked_at IS NULL`,
      [sessionId]
    );
    
    if (!session || session.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Session expired or invalidated. Please log in again.',
        errorCode: 'SESSION_INVALID',
      });
    }
    
    // Update last active timestamp
    await pool.query(
      `UPDATE user_sessions SET last_active_at = NOW() WHERE session_id = ?`,
      [sessionId]
    );
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Generate JWT Token
 * @param {Object} user - User object
 * @param {string} authType - Authentication type (staff/student)
 * @param {string} [sessionId] - Optional session ID for multi-account support
 * @returns {string} JWT token
 */
const generateToken = (user, authType = AUTH_TYPES.STAFF, sessionId = null) => {
  const payload = {
    userId: user.id,
    institutionId: user.institution_id,
    role: user.role,
    authType,
  };
  
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
};

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
const isAnyRole = authorize(...Object.values(ROLES));

module.exports = {
  authenticate,
  authorize,
  enforceInstitutionScope,
  staffOnly,
  studentOnly,
  requireValidSession,
  generateToken,
  isSuperAdmin,
  isHeadOfTP,
  isSupervisor,
  isFieldMonitor,
  isStaff,
  isAnyRole,
  ROLES,
  ROLE_HIERARCHY,
  AUTH_TYPES,
};
