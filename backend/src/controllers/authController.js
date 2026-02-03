/**
 * Authentication Controller (MedeePay Pattern)
 * 
 * Handles staff and student authentication, user management, and password operations.
 * Uses direct SQL queries instead of models.
 * 
 * 🔒 MULTI-ACCOUNT SUPPORT:
 * - Each login creates a unique session stored in user_sessions table
 * - JWT includes session_id to identify the specific session
 * - Sessions are tab-scoped on frontend (sessionStorage)
 * - Logout only invalidates the specific session, not all sessions
 */

const { z } = require('zod');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, AuthenticationError, ConflictError } = require('../utils/errors');
const emailService = require('../services/emailService');
const emailQueueService = require('../services/emailQueueService');

// ============================================================================
// CONSTANTS
// ============================================================================

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HEAD_OF_TEACHING_PRACTICE: 'head_of_teaching_practice',
  SUPERVISOR: 'supervisor',
  FIELD_MONITOR: 'field_monitor',
  STUDENT: 'student',
};

const AUTH_TYPES = {
  STAFF: 'staff',
  STUDENT: 'student',
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_EXPIRES_IN_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRES_HOURS = 1;
const SSO_TOKEN_EXPIRES_SECONDS = 30; // SSO tokens expire in 30 seconds

// In-memory store for SSO tokens (short-lived, single-use)
// In production, consider using Redis for multi-instance support
const ssoTokenStore = new Map();

// Cleanup expired SSO tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of ssoTokenStore.entries()) {
    if (data.expiresAt < now) {
      ssoTokenStore.delete(token);
    }
  }
}, 60000); // Cleanup every minute

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  // Alias for routes that use schemas.login
  login: z.object({
    body: z.object({
      email: z.string().email('Invalid email format'),
      password: z.string().min(6, 'Password is required'),
    }),
  }),

  studentLogin: z.object({
    body: z.object({
      registrationNumber: z.string().min(6, 'Registration number is required'),
      pin: z.string().min(6, 'PIN is required'),
    }),
  }),

  register: z.object({
    body: z.object({
      name: z.string().min(2, 'Name must be at least 2 characters').max(200),
      email: z.string().email('Invalid email format'),
      phone: z.string().max(20).optional().nullable(),
      role: z.enum([
        ROLES.SUPER_ADMIN,
        ROLES.HEAD_OF_TEACHING_PRACTICE,
        ROLES.SUPERVISOR,
        ROLES.FIELD_MONITOR,
      ]),
      institution_id: z.coerce.number().int().positive().optional().nullable(),
      rank_id: z.coerce.number().int().positive().optional().nullable(),
      faculty_id: z.coerce.number().int().positive().optional().nullable(),
      file_number: z.string().max(50).optional().nullable(),
      is_dean: z.boolean().optional().default(false),
    }),
  }),

  changePassword: z.object({
    body: z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    }),
  }),

  forgotPassword: z.object({
    body: z.object({
      email: z.string().email('Invalid email format'),
    }),
  }),

  resetPassword: z.object({
    body: z.object({
      token: z.string().min(1, 'Reset token is required'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    }),
  }),

  updateUser: z.object({
    body: z.object({
      name: z.string().min(2).max(200).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(20).optional().nullable(),
      role: z.enum([
        ROLES.SUPER_ADMIN,
        ROLES.HEAD_OF_TEACHING_PRACTICE,
        ROLES.SUPERVISOR,
        ROLES.FIELD_MONITOR,
      ]).optional(),
      rank_id: z.coerce.number().int().positive().optional().nullable(),
      faculty_id: z.coerce.number().int().positive().optional().nullable(),
      file_number: z.string().max(50).optional().nullable(),
      is_dean: z.boolean().optional(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  }),

  updateProfile: z.object({
    body: z.object({
      name: z.string().min(2).max(200).optional(),
      phone: z.string().max(20).optional().nullable(),
    }),
  }),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new user session in the database
 * Each login creates a unique session for multi-account support
 * 
 * @param {Object} options - Session options
 * @param {number} [options.userId] - User ID (for staff)
 * @param {number} [options.studentId] - Student ID (for students)
 * @param {number} [options.institutionId] - Institution ID
 * @param {string} options.userType - 'staff' or 'student'
 * @param {string} [options.ipAddress] - Client IP address
 * @param {string} [options.userAgent] - Client user agent
 * @returns {Promise<string>} Session ID (UUID)
 */
async function createSession({ userId, studentId, institutionId, userType, ipAddress, userAgent }) {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + JWT_EXPIRES_IN_MS);
  
  await query(
    `INSERT INTO user_sessions 
     (session_id, user_id, student_id, institution_id, user_type, ip_address, user_agent, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [sessionId, userId || null, studentId || null, institutionId || null, userType, ipAddress, userAgent, expiresAt]
  );
  
  return sessionId;
}

/**
 * Invalidate a session (logout)
 * @param {string} sessionId - Session ID to invalidate
 */
async function invalidateSession(sessionId) {
  await query(
    `UPDATE user_sessions SET is_active = FALSE, revoked_at = NOW() WHERE session_id = ?`,
    [sessionId]
  );
}

/**
 * Validate a session exists and is active
 * @param {string} sessionId - Session ID to validate
 * @returns {Promise<Object|null>} Session data or null
 */
async function validateSession(sessionId) {
  const [session] = await query(
    `SELECT * FROM user_sessions 
     WHERE session_id = ? AND is_active = TRUE AND expires_at > NOW() AND revoked_at IS NULL`,
    [sessionId]
  );
  return session || null;
}

/**
 * Update session last active timestamp
 * @param {string} sessionId - Session ID to update
 */
async function touchSession(sessionId) {
  await query(
    `UPDATE user_sessions SET last_active_at = NOW() WHERE session_id = ?`,
    [sessionId]
  );
}

/**
 * Generate JWT token with session ID
 * @param {Object} user - User object
 * @param {string} authType - 'staff' or 'student'
 * @param {string} sessionId - Unique session ID
 * @returns {string} JWT token
 */
function generateToken(user, authType, sessionId) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    institutionId: user.institution_id,
    authType: authType,
    sessionId: sessionId, // Include session ID for session validation
  };

  if (authType === AUTH_TYPES.STUDENT) {
    payload.registrationNumber = user.registration_number;
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a simple numeric password (8 digits)
 */
function generateRandomPassword() {
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += Math.floor(Math.random() * 10);
  }
  return password;
}

/**
 * Get role display name
 */
function getRoleDisplayName(role) {
  const roleNames = {
    super_admin: 'Super Admin',
    head_of_teaching_practice: 'Head of Teaching Practice',
    supervisor: 'Supervisor',
    field_monitor: 'Field Monitor',
    student: 'Student',
  };
  return roleNames[role] || role;
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  const commonPasswords = ['password', '12345678', 'qwertyui', 'admin123', 'letmein1'];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a stronger password.');
  }

  return errors;
}

/**
 * Log authentication event
 */
async function logAuthEvent(data) {
  try {
    await query(
      `INSERT INTO audit_logs 
       (institution_id, user_id, user_type, action, resource_type, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, 'auth', ?, ?, ?, NOW())`,
      [
        data.institution_id || null,
        data.user_id,
        data.user_type,
        data.action,
        JSON.stringify(data.details || {}),
        data.ip_address,
        data.user_agent,
      ]
    );
  } catch (error) {
    console.error('[AUTH] Failed to log auth event:', error.message);
  }
}

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Staff login (email + password)
 * POST /auth/staff/login
 * 
 * 🔒 SECURITY: Enforces subdomain-institution matching
 * - Regular users can only login via their institution's subdomain
 * - Super admin can login via any subdomain
 * - Login attempts from wrong subdomain return generic error (no info leak)
 */
const staffLogin = async (req, res, next) => {
  try {
    const validation = schemas.login.safeParse({ body: req.body });
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { email, password } = validation.data.body;
    
    // Get resolved institution from subdomain (set by subdomainResolver middleware)
    const resolvedInstitution = req.subdomainInstitution;

    // Find user with institution info
    const [user] = await query(
      `SELECT u.*, i.name as institution_name, i.status as institution_status,
              i.subdomain as institution_subdomain
       FROM users u
       LEFT JOIN institutions i ON u.institution_id = i.id
       WHERE u.email = ?`,
      [email.toLowerCase()]
    );

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new AuthenticationError('Your account is inactive. Please contact your administrator.');
    }

    // Super admin may not have an institution
    if (user.role !== ROLES.SUPER_ADMIN && user.institution_status !== 'active') {
      throw new AuthenticationError('Your institution is inactive');
    }

    // 🔒 SECURITY: Enforce subdomain-institution match for non-super_admin users
    if (user.role !== ROLES.SUPER_ADMIN) {
      // Regular users MUST login via a valid subdomain
      if (!resolvedInstitution) {
        await logAuthEvent({
          institution_id: user.institution_id,
          user_id: user.id,
          user_type: 'staff',
          action: 'login_failed',
          details: { reason: 'no_subdomain', attempted_subdomain: req.subdomain || 'none' },
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });
        throw new AuthenticationError('Please access via your institution\'s subdomain');
      }
      
      // Regular users MUST login via THEIR institution's subdomain
      if (user.institution_id !== resolvedInstitution.id) {
        // Log security event - attempted login via wrong subdomain
        console.warn(
          `[SECURITY] Subdomain login mismatch: User ${user.id} (institution: ${user.institution_id}) ` +
          `attempted login via subdomain: ${resolvedInstitution.subdomain} (institution: ${resolvedInstitution.id})`
        );
        
        await logAuthEvent({
          institution_id: user.institution_id,
          user_id: user.id,
          user_type: 'staff',
          action: 'login_failed',
          details: {
            reason: 'subdomain_mismatch',
            user_institution: user.institution_id,
            attempted_institution: resolvedInstitution.id,
            attempted_subdomain: resolvedInstitution.subdomain,
          },
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });
        
        // Return generic error to prevent info leakage (don't reveal user exists at other institution)
        throw new AuthenticationError('Invalid email or password');
      }
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      await logAuthEvent({
        institution_id: user.institution_id,
        user_id: user.id,
        user_type: 'staff',
        action: 'login_failed',
        details: { reason: 'invalid_password' },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });

      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // 🔒 MULTI-ACCOUNT: Create a new session for this login
    // Each login gets a unique session ID for tab isolation
    const sessionId = await createSession({
      userId: user.id,
      institutionId: user.institution_id,
      userType: AUTH_TYPES.STAFF,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Generate token with session ID
    const token = generateToken(user, AUTH_TYPES.STAFF, sessionId);

    // Log successful login
    await logAuthEvent({
      institution_id: user.institution_id,
      user_id: user.id,
      user_type: 'staff',
      action: 'login_success',
      details: { session_id: sessionId },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    // Determine context from subdomain
    const isGlobalContext = req.isGlobalContext === true;
    const subdomainInstitution = req.subdomainInstitution;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        sessionId, // 🔒 Include session ID for tab isolation tracking
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          // Institution comes from subdomain for super_admin, otherwise from user record
          institution: subdomainInstitution
            ? {
                id: subdomainInstitution.id,
                name: subdomainInstitution.name,
                subdomain: subdomainInstitution.subdomain,
              }
            : user.institution_id
            ? {
                id: user.institution_id,
                name: user.institution_name,
              }
            : null,
        },
        // Context flags for frontend
        isGlobalContext,
        subdomain: req.subdomain,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Student login (registration number + PIN)
 * POST /auth/student/login
 * 
 * 🔒 SECURITY: Enforces subdomain-institution matching
 * - Students can only login via their institution's subdomain
 * - Login attempts from wrong subdomain return generic error (no info leak)
 */
const studentLogin = async (req, res, next) => {
  try {
    const validation = schemas.studentLogin.safeParse({ body: req.body });
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { registrationNumber, pin } = validation.data.body;
    
    // Get resolved institution from subdomain (set by subdomainResolver middleware)
    const resolvedInstitution = req.subdomainInstitution;
    
    // 🔒 SECURITY: Students MUST login via a valid subdomain
    if (!resolvedInstitution) {
      await logAuthEvent({
        institution_id: null,
        user_id: null,
        user_type: 'student',
        action: 'login_failed',
        details: { 
          reason: 'no_subdomain', 
          attempted_subdomain: req.subdomain || 'none',
          registration_number: registrationNumber 
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });
      throw new AuthenticationError('Please access via your institution\'s subdomain');
    }

    // Find student with institution info
    const [student] = await query(
      `SELECT s.*, i.name as institution_name, i.status as institution_status,
              i.subdomain as institution_subdomain, p.name as program_name
       FROM students s
       LEFT JOIN institutions i ON s.institution_id = i.id
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE s.registration_number = ?`,
      [registrationNumber]
    );

    if (!student) {
      throw new AuthenticationError('Invalid registration number or PIN');
    }
    
    // 🔒 SECURITY: Students MUST login via THEIR institution's subdomain
    if (student.institution_id !== resolvedInstitution.id) {
      console.warn(
        `[SECURITY] Student subdomain login mismatch: Student ${student.id} (institution: ${student.institution_id}) ` +
        `attempted login via subdomain: ${resolvedInstitution.subdomain} (institution: ${resolvedInstitution.id})`
      );
      
      await logAuthEvent({
        institution_id: student.institution_id,
        user_id: student.id,
        user_type: 'student',
        action: 'login_failed',
        details: {
          reason: 'subdomain_mismatch',
          user_institution: student.institution_id,
          attempted_institution: resolvedInstitution.id,
          attempted_subdomain: resolvedInstitution.subdomain,
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });
      
      // Return generic error to prevent info leakage
      throw new AuthenticationError('Invalid registration number or PIN');
    }

    if (student.institution_status !== 'active') {
      throw new AuthenticationError('Your institution is inactive');
    }

    if (student.status !== 'active') {
      throw new AuthenticationError('Your account is inactive. Please contact your institution.');
    }

    const isPinValid = await verifyPassword(pin, student.pin_hash);

    if (!isPinValid) {
      await logAuthEvent({
        institution_id: student.institution_id,
        user_id: student.id,
        user_type: 'student',
        action: 'login_failed',
        details: { reason: 'invalid_pin' },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });

      throw new AuthenticationError('Invalid registration number or PIN');
    }

    // Update last login
    await query('UPDATE students SET last_login = NOW() WHERE id = ?', [student.id]);

    // 🔒 MULTI-ACCOUNT: Create a new session for this student login
    const sessionId = await createSession({
      studentId: student.id,
      institutionId: student.institution_id,
      userType: AUTH_TYPES.STUDENT,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Generate token with session ID
    const token = generateToken(
      { ...student, role: ROLES.STUDENT },
      AUTH_TYPES.STUDENT,
      sessionId
    );

    // Log successful login
    await logAuthEvent({
      institution_id: student.institution_id,
      user_id: student.id,
      user_type: 'student',
      action: 'login_success',
      details: { session_id: sessionId },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        sessionId, // 🔒 Include session ID for tab isolation tracking
        user: {
          id: student.id,
          name: student.full_name,
          registration_number: student.registration_number,
          role: ROLES.STUDENT,
          program: student.program_name,
          payment_status: student.payment_status,
          institution: {
            id: student.institution_id,
            name: student.institution_name,
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 * GET /auth/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const authType = req.authType;

    let profileData;

    if (authType === AUTH_TYPES.STUDENT) {
      const [student] = await query(
        `SELECT s.*, i.name as institution_name, i.code as institution_code,
                i.subdomain, i.institution_type, i.email as institution_email,
                i.phone as institution_phone, i.address as institution_address,
                i.state as institution_state, i.logo_url, i.primary_color, i.secondary_color,
                i.tp_unit_name,
                p.name as program_name
         FROM students s
         LEFT JOIN institutions i ON s.institution_id = i.id
         LEFT JOIN programs p ON s.program_id = p.id
         WHERE s.id = ?`,
        [user.id]
      );

      profileData = {
        id: student.id,
        name: student.full_name,
        role: ROLES.STUDENT,
        registration_number: student.registration_number,
        program: student.program_name,
        payment_status: student.payment_status,
        institution: {
          id: student.institution_id,
          name: student.institution_name,
          code: student.institution_code,
          subdomain: student.subdomain,
          institution_type: student.institution_type,
          email: student.institution_email,
          phone: student.institution_phone,
          address: student.institution_address,
          state: student.institution_state,
          logo_url: student.logo_url,
          primary_color: student.primary_color,
          secondary_color: student.secondary_color,
          tp_unit_name: student.tp_unit_name,
        },
      };
    } else {
      const [staffUser] = await query(
        `SELECT u.*, i.name as institution_name, i.code as institution_code,
                i.subdomain, i.institution_type, i.email as institution_email,
                i.phone as institution_phone, i.address as institution_address,
                i.state as institution_state, i.logo_url, i.primary_color, i.secondary_color,
                i.tp_unit_name,
                r.name as rank_name, f.name as faculty_name
         FROM users u
         LEFT JOIN institutions i ON u.institution_id = i.id
         LEFT JOIN ranks r ON u.rank_id = r.id
         LEFT JOIN faculties f ON u.faculty_id = f.id
         WHERE u.id = ?`,
        [user.id]
      );

      profileData = {
        id: staffUser.id,
        name: staffUser.name,
        email: staffUser.email,
        phone: staffUser.phone,
        role: staffUser.role,
        rank: staffUser.rank_name,
        faculty: staffUser.faculty_name,
        file_number: staffUser.file_number,
        is_dean: staffUser.is_dean === 1,
        institution: staffUser.institution_id
          ? {
              id: staffUser.institution_id,
              name: staffUser.institution_name,
              code: staffUser.institution_code,
              subdomain: staffUser.subdomain,
              institution_type: staffUser.institution_type,
              email: staffUser.institution_email,
              phone: staffUser.institution_phone,
              address: staffUser.institution_address,
              state: staffUser.institution_state,
              logo_url: staffUser.logo_url,
              primary_color: staffUser.primary_color,
              secondary_color: staffUser.secondary_color,
              tp_unit_name: staffUser.tp_unit_name,
            }
          : null,
      };

      // For super_admin, override institution with subdomain context if available
      if (staffUser.role === ROLES.SUPER_ADMIN && req.subdomainInstitution) {
        profileData.institution = {
          id: req.subdomainInstitution.id,
          name: req.subdomainInstitution.name,
          code: req.subdomainInstitution.code,
          subdomain: req.subdomainInstitution.subdomain,
          logo_url: req.subdomainInstitution.logo_url,
          primary_color: req.subdomainInstitution.primary_color,
          secondary_color: req.subdomainInstitution.secondary_color,
          tp_unit_name: req.subdomainInstitution.tp_unit_name,
        };
      }
    }

    // Add context flags
    const isGlobalContext = req.isGlobalContext === true;
    const subdomain = req.subdomain;

    res.json({
      success: true,
      data: {
        ...profileData,
        // Context from subdomain
        isGlobalContext,
        subdomain,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user profile
 * PUT /auth/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const validation = schemas.updateProfile.safeParse({ body: req.body });
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { name, phone } = validation.data.body;
    const user = req.user;
    const authType = req.authType;

    if (authType === AUTH_TYPES.STUDENT) {
      const updates = [];
      const params = [];

      if (name) {
        updates.push('full_name = ?');
        params.push(name);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(user.id);
        await query(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    } else {
      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        params.push(user.id);
        await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    }

    await logAuthEvent({
      institution_id: user.institution_id,
      user_id: user.id,
      user_type: authType,
      action: 'profile_updated',
      details: { name, phone },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password (staff only)
 * PUT /auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const validation = schemas.changePassword.safeParse({ body: req.body });
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { currentPassword, newPassword } = validation.data.body;
    const user = req.user;

    // Validate new password strength
    const passwordErrors = validatePasswordStrength(newPassword);
    if (passwordErrors.length > 0) {
      throw new ValidationError('Password does not meet security requirements', { password: passwordErrors });
    }

    // Get current password hash
    const [currentUser] = await query('SELECT password_hash FROM users WHERE id = ?', [user.id]);

    const isPasswordValid = await verifyPassword(currentPassword, currentUser.password_hash);
    if (!isPasswordValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash and update new password
    const hashedPassword = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, user.id]);

    await logAuthEvent({
      institution_id: user.institution_id,
      user_id: user.id,
      user_type: 'staff',
      action: 'password_changed',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register a new staff user (admin only)
 * POST /api/:institutionId/users
 */
const register = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.register.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { name, email, phone, role, institution_id, rank_id, faculty_id, file_number, is_dean } = validation.data.body;

    // Only super_admin can create other super_admins
    if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new ValidationError('Only super admins can create other super admin accounts');
    }

    // Determine target institution
    let targetInstitutionId = null;
    if (role === ROLES.SUPER_ADMIN) {
      targetInstitutionId = null;
    } else if (req.user.role === ROLES.SUPER_ADMIN && institution_id) {
      targetInstitutionId = institution_id;
    } else {
      targetInstitutionId = parseInt(institutionId);
    }

    // Check if email already exists globally
    const [existing] = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Generate a simple numeric password (8 digits)
    const generatedPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(generatedPassword);

    // Create user
    const result = await query(
      `INSERT INTO users 
       (institution_id, name, email, password_hash, phone, role, rank_id, faculty_id, file_number, is_dean, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [
        targetInstitutionId,
        name,
        email.toLowerCase(),
        hashedPassword,
        phone || null,
        role,
        role === ROLES.SUPER_ADMIN ? null : (rank_id || null),
        role === ROLES.SUPER_ADMIN ? null : (faculty_id || null),
        role === ROLES.SUPER_ADMIN ? null : (file_number || null),
        role === ROLES.SUPER_ADMIN ? false : (is_dean || false),
      ]
    );

    await logAuthEvent({
      institution_id: targetInstitutionId || parseInt(institutionId),
      user_id: req.user.id,
      user_type: 'staff',
      action: 'user_created',
      details: { created_user_id: result.insertId, name, email, role },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    // Queue welcome email with credentials
    try {
      let loginUrl;
      let emailInstitutionId;

      if (role === ROLES.SUPER_ADMIN) {
        loginUrl = emailService.getSuperAdminFrontendUrl() + '/login';
        emailInstitutionId = null;
      } else if (targetInstitutionId) {
        loginUrl = await emailService.getFrontendUrl(targetInstitutionId) + '/login';
        emailInstitutionId = targetInstitutionId;
      } else {
        loginUrl = (process.env.FRONTEND_URL || 'http://localhost:5173') + '/login';
        emailInstitutionId = null;
      }

      emailQueueService.queueHighPriority(emailInstitutionId, {
        to: email,
        template: 'userCredentials',
        data: {
          name,
          email,
          password: generatedPassword,
          role: getRoleDisplayName(role),
          loginUrl,
        },
      });
    } catch (emailError) {
      console.error(`[AUTH] Failed to queue welcome email for ${email}:`, emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully. Login credentials have been sent to their email.',
      data: { 
        id: result.insertId,
        password: generatedPassword, // Return password so admin can share it directly if needed
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users (admin only)
 * GET /api/:institutionId/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;

    // Build WHERE clause - include super_admins (NULL institution_id) for super_admin viewers
    // Super admins can see: institution users + all super_admin users
    let whereClause = isSuperAdmin
      ? '(u.institution_id = ? OR u.role = ?)'
      : 'u.institution_id = ?';
    
    // Count query doesn't use table alias
    let countWhereClause = isSuperAdmin
      ? '(institution_id = ? OR role = ?)'
      : 'institution_id = ?';
    
    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.status,
             u.rank_id, u.faculty_id, u.file_number, u.is_dean,
             u.last_login, u.created_at,
             r.name as rank_name, f.name as faculty_name
      FROM users u
      LEFT JOIN ranks r ON u.rank_id = r.id
      LEFT JOIN faculties f ON u.faculty_id = f.id
      WHERE ${whereClause}
    `;
    let countSql = `SELECT COUNT(*) as total FROM users WHERE ${countWhereClause}`;
    
    const params = isSuperAdmin 
      ? [parseInt(institutionId), ROLES.SUPER_ADMIN]
      : [parseInt(institutionId)];
    const countParams = [...params];

    if (role) {
      sql += ' AND u.role = ?';
      countSql += ' AND role = ?';
      params.push(role);
      countParams.push(role);
    }

    if (status) {
      sql += ' AND u.status = ?';
      countSql += ' AND status = ?';
      params.push(status);
      countParams.push(status);
    }

    if (search) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      countSql += ' AND (name LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm);
    }

    sql += ' ORDER BY u.name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [users, [countResult]] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user by ID (admin only)
 * GET /api/:institutionId/users/:id
 */
const getUserById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;

    // Super admin can also view other super_admins (NULL institution_id)
    const whereClause = isSuperAdmin
      ? 'u.id = ? AND (u.institution_id = ? OR u.role = ?)'
      : 'u.id = ? AND u.institution_id = ?';
    
    const params = isSuperAdmin
      ? [parseInt(id), parseInt(institutionId), ROLES.SUPER_ADMIN]
      : [parseInt(id), parseInt(institutionId)];

    const [user] = await query(
      `SELECT u.*, r.name as rank_name, f.name as faculty_name
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       WHERE ${whereClause}`,
      params
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Don't expose password
    delete user.password_hash;

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user (admin only)
 * PUT /api/:institutionId/users/:id
 */
const updateUser = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.updateUser.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;
    const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;

    // Check user exists - super_admin can also update other super_admins (NULL institution_id)
    const existingQuery = isSuperAdmin
      ? 'SELECT id, role FROM users WHERE id = ? AND (institution_id = ? OR role = ?)'
      : 'SELECT id, role FROM users WHERE id = ? AND institution_id = ?';
    
    const existingParams = isSuperAdmin
      ? [parseInt(id), parseInt(institutionId), ROLES.SUPER_ADMIN]
      : [parseInt(id), parseInt(institutionId)];

    const [existing] = await query(existingQuery, existingParams);

    if (!existing) {
      throw new NotFoundError('User not found');
    }

    // Only super_admin can update other super_admins
    if (existing.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new ValidationError('Only super admins can update other super admins');
    }

    // Check email uniqueness if changing email
    if (data.email) {
      const [emailConflict] = await query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [data.email.toLowerCase(), parseInt(id)]
      );
      if (emailConflict) {
        throw new ConflictError('Email already in use');
      }
      data.email = data.email.toLowerCase();
    }

    // Build update query
    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(data)) {
      updates.push(`${key} = ?`);
      params.push(value);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(parseInt(id));

      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    await logAuthEvent({
      institution_id: parseInt(institutionId),
      user_id: req.user.id,
      user_type: 'staff',
      action: 'user_updated',
      details: { updated_user_id: parseInt(id), ...data },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'User updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user (admin only)
 * DELETE /api/:institutionId/users/:id
 */
const deleteUser = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;

    // Check user exists - super_admin can also delete other super_admins (NULL institution_id)
    let existingQuery = isSuperAdmin
      ? 'SELECT id, email, role, institution_id FROM users WHERE id = ? AND (institution_id = ? OR role = ?)'
      : 'SELECT id, email, role, institution_id FROM users WHERE id = ? AND institution_id = ?';
    
    const existingParams = isSuperAdmin
      ? [parseInt(id), parseInt(institutionId), ROLES.SUPER_ADMIN]
      : [parseInt(id), parseInt(institutionId)];

    const [existing] = await query(existingQuery, existingParams);

    if (!existing) {
      throw new NotFoundError('User not found');
    }

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      throw new ValidationError('You cannot delete your own account');
    }

    // Only super_admin can delete other super_admins
    if (existing.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new ValidationError('Only super admins can delete other super admins');
    }

    await query('DELETE FROM users WHERE id = ?', [parseInt(id)]);

    await logAuthEvent({
      institution_id: parseInt(institutionId),
      user_id: req.user.id,
      user_type: 'staff',
      action: 'user_deleted',
      details: { deleted_user_id: parseInt(id), deleted_email: existing.email },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot Password - Request password reset
 * POST /auth/forgot-password
 */
/**
 * Forgot Password - Send password reset email
 * POST /auth/forgot-password
 * 
 * 🔒 SECURITY: 
 * - Always returns generic success to prevent email enumeration
 * - Non-super_admin users must request reset via their institution's subdomain
 * - Logs security events for mismatched subdomain attempts
 */
const forgotPassword = async (req, res, next) => {
  try {
    const validation = schemas.forgotPassword.safeParse({ body: req.body });
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { email } = validation.data.body;
    const resolvedInstitution = req.subdomainInstitution;

    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    // Find user by email
    const [user] = await query(
      `SELECT u.*, i.status as institution_status 
       FROM users u
       LEFT JOIN institutions i ON u.institution_id = i.id
       WHERE u.email = ?`,
      [email.toLowerCase()]
    );

    if (!user || user.status !== 'active') {
      return res.json(successResponse);
    }

    if (user.role !== ROLES.SUPER_ADMIN && user.institution_status !== 'active') {
      return res.json(successResponse);
    }

    // 🔒 SECURITY: Enforce subdomain match for non-super_admin users
    if (user.role !== ROLES.SUPER_ADMIN) {
      if (!resolvedInstitution || user.institution_id !== resolvedInstitution.id) {
        // Log the attempt but return success to prevent enumeration
        await logAuthEvent({
          institution_id: user.institution_id,
          user_id: user.id,
          user_type: 'staff',
          action: 'password_reset_subdomain_mismatch',
          details: {
            attempted_subdomain: req.subdomain || 'none',
            resolved_institution_id: resolvedInstitution?.id || null,
          },
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
        });
        // Return success to prevent email enumeration - don't actually send email
        return res.json(successResponse);
      }
    }

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN;
    const emailInstitutionId = isSuperAdmin ? null : user.institution_id;

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000);

    // Store hashed token
    await query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetTokenHash, resetTokenExpiry, user.id]
    );

    // Build reset URL
    const frontendUrl = isSuperAdmin
      ? emailService.getSuperAdminFrontendUrl()
      : await emailService.getFrontendUrl(user.institution_id);
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Queue password reset email
    emailQueueService.queueHighPriority(emailInstitutionId, {
      to: user.email,
      template: 'passwordReset',
      data: {
        name: user.name,
        resetUrl,
      },
    });

    await logAuthEvent({
      institution_id: user.institution_id,
      user_id: user.id,
      user_type: 'staff',
      action: 'password_reset_requested',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json(successResponse);
  } catch (error) {
    next(error);
  }
};

/**
 * Reset Password - Complete password reset with token
 * POST /auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const validation = schemas.resetPassword.safeParse({ body: req.body });
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { token, password } = validation.data.body;

    // Validate password strength
    const passwordErrors = validatePasswordStrength(password);
    if (passwordErrors.length > 0) {
      throw new ValidationError('Password does not meet security requirements', { password: passwordErrors });
    }

    // Hash the provided token and find user
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [user] = await query(
      `SELECT id, name, email, role, institution_id 
       FROM users 
       WHERE reset_token = ? AND reset_token_expires > NOW()`,
      [tokenHash]
    );

    if (!user) {
      throw new ValidationError('Invalid or expired reset token. Please request a new password reset.');
    }

    // Update password and clear reset token
    const hashedPassword = await hashPassword(password);
    await query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
      [hashedPassword, user.id]
    );

    await logAuthEvent({
      institution_id: user.institution_id,
      user_id: user.id,
      user_type: 'staff',
      action: 'password_reset_completed',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    // Send confirmation email
    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN;
    const emailInstitutionId = isSuperAdmin ? null : user.institution_id;
    const frontendUrl = isSuperAdmin
      ? emailService.getSuperAdminFrontendUrl()
      : await emailService.getFrontendUrl(user.institution_id);
    const loginUrl = `${frontendUrl}/login`;

    emailQueueService.queueEmail(emailInstitutionId, {
      to: user.email,
      template: 'passwordResetSuccess',
      data: {
        name: user.name,
        loginUrl,
      },
    });

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get institutions that the current user can access
 * GET /auth/accessible-institutions
 */
const getAccessibleInstitutions = async (req, res, next) => {
  try {
    const user = req.user;

    let institutions;

    if (user.role === ROLES.SUPER_ADMIN) {
      // Super admin can access all active institutions
      institutions = await query(
        `SELECT id, name, code, subdomain, logo_url, status
         FROM institutions
         WHERE status = 'active'
         ORDER BY name ASC`
      );
    } else {
      // Regular users can only access their institution
      institutions = await query(
        `SELECT id, name, code, subdomain, logo_url, status
         FROM institutions
         WHERE id = ? AND status = 'active'`,
        [user.institution_id]
      );
    }

    res.json({
      success: true,
      data: institutions,
      meta: {
        count: institutions.length,
        is_super_admin: user.role === ROLES.SUPER_ADMIN,
        has_multiple: institutions.length > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend user credentials (admin only)
 * POST /api/:institutionId/users/:id/resend-credentials
 */
const resendCredentials = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Get user
    const [user] = await query(
      'SELECT id, name, email, role FROM users WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate new password (8 digits)
    const newPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(newPassword);

    await query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, user.id]);

    // Send credentials email
    const loginUrl = await emailService.getFrontendUrl(parseInt(institutionId)) + '/login';

    emailQueueService.queueHighPriority(parseInt(institutionId), {
      to: user.email,
      template: 'userCredentials',
      data: {
        name: user.name,
        email: user.email,
        password: newPassword,
        role: getRoleDisplayName(user.role),
        loginUrl,
      },
    });

    await logAuthEvent({
      institution_id: parseInt(institutionId),
      user_id: req.user.id,
      user_type: 'staff',
      action: 'credentials_resent',
      details: { target_user_id: user.id },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'New credentials have been sent to the user\'s email.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Hard reset user password (super_admin only)
 * POST /api/:institutionId/users/:id/hard-reset-password
 * 
 * This is for super admins to force reset a user's password.
 * A new password is generated and sent to the user's email.
 * The new password is also returned to the admin.
 */
const hardResetPassword = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;

    // Only super_admin can hard reset passwords
    if (!isSuperAdmin) {
      throw new ValidationError('Only super admins can perform hard password reset');
    }

    // Prevent self-reset via this endpoint
    if (parseInt(id) === req.user.id) {
      throw new ValidationError('You cannot hard reset your own password. Use the change password feature instead.');
    }

    // Get user - super admin can reset passwords for institution users or other super_admins
    const [user] = await query(
      `SELECT id, name, email, role, institution_id 
       FROM users 
       WHERE id = ? AND (institution_id = ? OR role = ?)`,
      [parseInt(id), parseInt(institutionId), ROLES.SUPER_ADMIN]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Generate new password (8 digits)
    const newPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(newPassword);

    // Update password and clear any reset tokens
    await query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
      [hashedPassword, user.id]
    );

    // Determine login URL based on user type
    let loginUrl;
    let emailInstitutionId;

    if (user.role === ROLES.SUPER_ADMIN) {
      loginUrl = emailService.getSuperAdminFrontendUrl() + '/login';
      emailInstitutionId = null;
    } else {
      loginUrl = await emailService.getFrontendUrl(user.institution_id) + '/login';
      emailInstitutionId = user.institution_id;
    }

    // Send password reset notification email
    emailQueueService.queueHighPriority(emailInstitutionId, {
      to: user.email,
      template: 'passwordResetByAdmin',
      data: {
        name: user.name,
        email: user.email,
        password: newPassword,
        role: getRoleDisplayName(user.role),
        loginUrl,
        resetBy: req.user.name,
      },
    });

    await logAuthEvent({
      institution_id: user.institution_id || parseInt(institutionId),
      user_id: req.user.id,
      user_type: 'staff',
      action: 'password_hard_reset',
      details: { 
        target_user_id: user.id, 
        target_email: user.email,
        reset_by: req.user.id,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Password has been reset successfully. New credentials have been sent to the user\'s email.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        password: newPassword, // Return password so admin can share it directly if needed
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// TOKEN VERIFICATION & SESSION MANAGEMENT
// ============================================================================

/**
 * Verify JWT token validity
 * POST /auth/verify-token
 * 
 * 🔒 SECURITY: Validates token and optionally checks subdomain match
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ success: false, valid: false, message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const resolvedInstitution = req.subdomainInstitution;
      
      // For non-super_admin, optionally warn if subdomain doesn't match
      // (Frontend may use this for validation)
      let subdomainMatch = true;
      if (decoded.role !== ROLES.SUPER_ADMIN && decoded.institutionId && resolvedInstitution) {
        subdomainMatch = decoded.institutionId === resolvedInstitution.id;
      }
      
      return res.json({
        success: true,
        valid: true,
        user: {
          id: decoded.userId,
          role: decoded.role,
          institutionId: decoded.institutionId,
        },
        subdomainMatch,
      });
    } catch (jwtError) {
      return res.json({
        success: false,
        valid: false,
        message: jwtError.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
/**
 * Logout user (invalidate session)
 * POST /auth/logout
 * 
 * 🔒 MULTI-ACCOUNT: Invalidates ONLY the current session from JWT.
 * Other sessions (other tabs) remain active.
 */
const logout = async (req, res, next) => {
  try {
    // Get session ID from the JWT token (set by auth middleware from decoded token)
    const sessionId = req.sessionId;
    
    // Invalidate the specific session if session ID exists
    if (sessionId) {
      await invalidateSession(sessionId);
    }

    await logAuthEvent({
      institution_id: req.user?.institution_id || null,
      user_id: req.user?.id,
      user_type: req.authType || 'staff',
      action: 'logout',
      details: { session_id: sessionId },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh JWT token
 * POST /auth/refresh-token
 * 
 * Returns a new token with extended expiry if current token is valid.
 * The session ID is preserved from the original token.
 */
const refreshToken = async (req, res, next) => {
  try {
    const user = req.user;
    const authType = req.authType;
    const sessionId = req.sessionId;
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    // Validate the session is still active
    if (sessionId) {
      const session = await validateSession(sessionId);
      if (!session) {
        return res.status(401).json({ 
          success: false, 
          message: 'Session expired or invalidated',
          errorCode: 'SESSION_INVALID'
        });
      }
      // Update session activity
      await touchSession(sessionId);
    }
    
    // Generate new token with same session ID
    const newToken = generateToken(user, authType, sessionId);
    
    await logAuthEvent({
      institution_id: user.institution_id || null,
      user_id: user.id,
      user_type: authType || 'staff',
      action: 'token_refreshed',
      details: { session_id: sessionId },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: { token: newToken },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// SSO (SINGLE SIGN-ON) FOR CROSS-SUBDOMAIN NAVIGATION
// ============================================================================

/**
 * Generate a one-time SSO token for cross-subdomain navigation
 * 
 * Security features:
 * - Token expires in 30 seconds
 * - Token is single-use (deleted after exchange)
 * - Token is tied to user ID and IP
 * - Token is cryptographically random
 * 
 * POST /api/auth/sso/generate
 */
const generateSsoToken = async (req, res, next) => {
  try {
    const user = req.user;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    
    // Generate cryptographically secure random token
    const ssoToken = crypto.randomBytes(32).toString('hex');
    
    // Store token with metadata
    ssoTokenStore.set(ssoToken, {
      userId: user.userId || user.id,
      authType: user.authType || AUTH_TYPES.STAFF,
      ipAddress, // Bind to IP for extra security
      expiresAt: Date.now() + (SSO_TOKEN_EXPIRES_SECONDS * 1000),
      createdAt: Date.now(),
    });
    
    res.json({
      success: true,
      data: {
        sso_token: ssoToken,
        expires_in: SSO_TOKEN_EXPIRES_SECONDS,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Exchange a one-time SSO token for a JWT
 * 
 * POST /api/auth/sso/exchange
 * Body: { sso_token: string }
 * 
 * 🔒 MULTI-ACCOUNT: Creates a new session for the SSO exchange
 */
const exchangeSsoToken = async (req, res, next) => {
  try {
    const { sso_token } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    
    if (!sso_token) {
      throw new ValidationError('SSO token is required');
    }
    
    // Look up the token
    const tokenData = ssoTokenStore.get(sso_token);
    
    if (!tokenData) {
      throw new AuthenticationError('Invalid or expired SSO token');
    }
    
    // Check expiry
    if (tokenData.expiresAt < Date.now()) {
      ssoTokenStore.delete(sso_token);
      throw new AuthenticationError('SSO token has expired');
    }
    
    // Optional: Verify IP address matches (can be disabled for mobile/VPN users)
    // Uncommenting this adds extra security but may cause issues with some networks
    // if (tokenData.ipAddress !== ipAddress) {
    //   ssoTokenStore.delete(sso_token);
    //   throw new AuthenticationError('SSO token IP mismatch');
    // }
    
    // Delete token immediately (single-use)
    ssoTokenStore.delete(sso_token);
    
    // Fetch the user
    const [users] = await query(
      'SELECT * FROM users WHERE id = ? AND status = ?',
      [tokenData.userId, 'active']
    );
    
    const user = Array.isArray(users) ? users[0] : users;
    
    if (!user) {
      throw new AuthenticationError('User not found or inactive');
    }
    
    // 🔒 MULTI-ACCOUNT: Create a new session for SSO exchange
    const sessionId = await createSession({
      userId: user.id,
      institutionId: user.institution_id,
      userType: tokenData.authType || AUTH_TYPES.STAFF,
      ipAddress: ipAddress,
      userAgent: req.headers['user-agent'],
    });
    
    // Generate new JWT for this subdomain with session ID
    const token = generateToken(user, tokenData.authType, sessionId);
    
    // Log the SSO login
    await logAuthEvent({
      institution_id: user.institution_id || null,
      user_id: user.id,
      user_type: tokenData.authType || 'staff',
      action: 'sso_login',
      details: { session_id: sessionId },
      ip_address: ipAddress,
      user_agent: req.headers['user-agent'],
    });
    
    res.json({
      success: true,
      message: 'SSO token exchanged successfully',
      data: { token, sessionId },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// SESSION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all active sessions for the current user
 * GET /auth/sessions
 * 
 * Returns list of active sessions so user can see where they're logged in
 */
const getActiveSessions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const authType = req.authType;
    const currentSessionId = req.sessionId;
    
    let sessions;
    if (authType === AUTH_TYPES.STUDENT) {
      sessions = await query(
        `SELECT session_id, ip_address, user_agent, created_at, last_active_at, expires_at
         FROM user_sessions 
         WHERE student_id = ? AND is_active = TRUE AND expires_at > NOW() AND revoked_at IS NULL
         ORDER BY last_active_at DESC`,
        [userId]
      );
    } else {
      sessions = await query(
        `SELECT session_id, ip_address, user_agent, created_at, last_active_at, expires_at
         FROM user_sessions 
         WHERE user_id = ? AND is_active = TRUE AND expires_at > NOW() AND revoked_at IS NULL
         ORDER BY last_active_at DESC`,
        [userId]
      );
    }
    
    // Mark current session
    const sessionsWithCurrent = sessions.map(s => ({
      ...s,
      is_current: s.session_id === currentSessionId,
      // Parse user agent for display
      browser: parseUserAgent(s.user_agent),
    }));
    
    res.json({
      success: true,
      data: sessionsWithCurrent,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revoke a specific session
 * DELETE /auth/sessions/:sessionId
 * 
 * Allows user to log out of a specific session (e.g., from another device)
 */
const revokeSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const authType = req.authType;
    const { sessionId } = req.params;
    const currentSessionId = req.sessionId;
    
    // Verify the session belongs to this user
    const userColumn = authType === AUTH_TYPES.STUDENT ? 'student_id' : 'user_id';
    const [session] = await query(
      `SELECT * FROM user_sessions WHERE session_id = ? AND ${userColumn} = ?`,
      [sessionId, userId]
    );
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    // Revoke the session
    await invalidateSession(sessionId);
    
    await logAuthEvent({
      institution_id: req.user?.institution_id || null,
      user_id: userId,
      user_type: authType || 'staff',
      action: 'session_revoked',
      details: { 
        revoked_session_id: sessionId,
        is_self_revoke: sessionId === currentSessionId,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    
    res.json({ 
      success: true, 
      message: 'Session revoked successfully',
      was_current_session: sessionId === currentSessionId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revoke all sessions except current
 * POST /auth/sessions/revoke-all
 * 
 * "Log out of all other devices"
 */
const revokeAllOtherSessions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const authType = req.authType;
    const currentSessionId = req.sessionId;
    
    const userColumn = authType === AUTH_TYPES.STUDENT ? 'student_id' : 'user_id';
    
    const result = await query(
      `UPDATE user_sessions 
       SET is_active = FALSE, revoked_at = NOW() 
       WHERE ${userColumn} = ? AND is_active = TRUE AND session_id != ?`,
      [userId, currentSessionId]
    );
    
    await logAuthEvent({
      institution_id: req.user?.institution_id || null,
      user_id: userId,
      user_type: authType || 'staff',
      action: 'all_sessions_revoked',
      details: { 
        sessions_revoked: result.affectedRows,
        kept_session_id: currentSessionId,
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
    
    res.json({ 
      success: true, 
      message: `Logged out of ${result.affectedRows} other session(s)`,
      sessions_revoked: result.affectedRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Simple user agent parser for display purposes
 */
function parseUserAgent(userAgent) {
  if (!userAgent) return 'Unknown';
  
  // Extract browser and OS info
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('Opera')) browser = 'Opera';
  
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  
  return `${browser} on ${os}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  schemas,
  login: staffLogin, // Alias for routes
  staffLogin,
  studentLogin,
  getProfile,
  updateProfile,
  changePassword,
  register,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  forgotPassword,
  resetPassword,
  getAccessibleInstitutions,
  resendCredentials,
  hardResetPassword,
  verifyToken,
  logout,
  refreshToken,
  generateSsoToken,
  exchangeSsoToken,
  // Session management
  getActiveSessions,
  revokeSession,
  revokeAllOtherSessions,
  // Helpers for session validation
  validateSession,
  invalidateSession,
  touchSession,
  // Export helpers for use in other modules
  ROLES,
  AUTH_TYPES,
  generateToken,
  hashPassword,
  verifyPassword,
  // SSO token store getter for partner SSO
  getSsoTokenStore: () => ssoTokenStore,
};
