/**
 * SSO Controller
 *
 * Handles SSO authentication for partner systems.
 * Validates signed tokens and creates user sessions.
 * 
 * Flow:
 * 1. Partner system generates signed token with user identifier
 * 2. User is redirected to /sso/student or /sso/staff with token
 * 3. DigitalTP validates token signature and looks up user
 * 4. Creates internal SSO token and redirects to dashboard with sso_token
 * 5. Frontend exchanges sso_token for JWT via /auth/sso/exchange
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');
const { ValidationError, AuthenticationError, NotFoundError } = require('../utils/errors');

// Import the SSO token store from authController
// This is used for internal SSO token exchange
const { getSsoTokenStore } = require('./authController');

const SSO_INTERNAL_TOKEN_EXPIRES_SECONDS = 30;

// ============================================================================
// SSO ERROR CODES
// ============================================================================

const SSO_ERRORS = {
  INVALID_TOKEN: { code: 'SSO_INVALID_TOKEN', status: 401, message: 'Invalid token signature' },
  TOKEN_EXPIRED: { code: 'SSO_TOKEN_EXPIRED', status: 401, message: 'Token has expired' },
  INVALID_PARTNER: { code: 'SSO_INVALID_PARTNER', status: 401, message: 'Invalid partner credentials' },
  INSTITUTION_MISMATCH: { code: 'SSO_INSTITUTION_MISMATCH', status: 403, message: 'Institution not authorized for partner' },
  USER_NOT_FOUND: { code: 'SSO_USER_NOT_FOUND', status: 404, message: 'User not found in DigitalTP' },
  USER_INACTIVE: { code: 'SSO_USER_INACTIVE', status: 403, message: 'User account is inactive' },
  SSO_DISABLED: { code: 'SSO_DISABLED', status: 403, message: 'SSO is disabled for this institution' },
  INVALID_USER_TYPE: { code: 'SSO_INVALID_USER_TYPE', status: 400, message: 'Invalid user type. Use "student" or "staff"' },
  MALFORMED_TOKEN: { code: 'SSO_MALFORMED_TOKEN', status: 400, message: 'Malformed token format' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Log SSO attempt
 */
async function logSSOAttempt(data) {
  try {
    await query(
      `INSERT INTO sso_logs 
       (institution_id, partner_id, user_type, identifier, status, error_code, error_message, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.institutionId || 0,
        data.partnerId || 'unknown',
        data.userType || 'unknown',
        data.identifier || 'unknown',
        data.status,
        data.errorCode || null,
        data.errorMessage || null,
        data.ipAddress || null,
        data.userAgent || null,
      ]
    );
  } catch (error) {
    console.error('Failed to log SSO attempt:', error);
  }
}

/**
 * Decode and validate SSO token
 */
function decodeToken(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') {
    throw { ...SSO_ERRORS.MALFORMED_TOKEN };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    throw { ...SSO_ERRORS.MALFORMED_TOKEN };
  }

  const [payloadBase64, signatureBase64] = parts;

  try {
    // Base64url decode
    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    return { payload, payloadBase64, signatureBase64 };
  } catch (error) {
    throw { ...SSO_ERRORS.MALFORMED_TOKEN };
  }
}

/**
 * Verify token signature using partner's secret key
 */
function verifySignature(payloadBase64, signatureBase64, secretKey) {
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadBase64)
    .digest('base64url');

  // Use timing-safe comparison
  const sigBuffer = Buffer.from(signatureBase64);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Create an internal SSO token for the frontend to exchange
 */
function createInternalSsoToken(userId, authType, ipAddress) {
  const token = uuidv4();
  const ssoTokenStore = getSsoTokenStore();
  
  ssoTokenStore.set(token, {
    userId,
    authType,
    ipAddress,
    expiresAt: Date.now() + (SSO_INTERNAL_TOKEN_EXPIRES_SECONDS * 1000),
  });
  
  return token;
}

// ============================================================================
// SSO HANDLERS
// ============================================================================

/**
 * Handle student SSO authentication
 * GET /sso/student?token=...
 */
const handleStudentSSO = async (req, res, next) => {
  const { token } = req.query;
  const ipAddress = req.ip || req.connection?.remoteAddress;
  const userAgent = req.get('User-Agent');

  let decoded;
  let partner;
  let institution;

  try {
    // 1. Decode token
    decoded = decodeToken(token);
    const { payload, payloadBase64, signatureBase64 } = decoded;

    // 2. Validate required fields
    if (!payload.partner_id || !payload.identifier || !payload.institution_code) {
      throw { ...SSO_ERRORS.MALFORMED_TOKEN };
    }

    if (payload.user_type !== 'student') {
      throw { ...SSO_ERRORS.INVALID_USER_TYPE };
    }

    // 3. Look up partner
    const [partnerRow] = await query(
      `SELECT sp.*, i.id as inst_id, i.code as inst_code, i.sso_enabled
       FROM sso_partners sp
       JOIN institutions i ON sp.institution_id = i.id
       WHERE sp.partner_id = ? AND sp.is_enabled = 1`,
      [payload.partner_id]
    );

    if (!partnerRow) {
      throw { ...SSO_ERRORS.INVALID_PARTNER };
    }

    partner = partnerRow;
    institution = { id: partnerRow.inst_id, code: partnerRow.inst_code };

    // 4. Check if SSO is enabled for institution
    if (!partnerRow.sso_enabled) {
      throw { ...SSO_ERRORS.SSO_DISABLED };
    }

    // 5. Verify institution code matches
    if (payload.institution_code.toUpperCase() !== partnerRow.inst_code.toUpperCase()) {
      throw { ...SSO_ERRORS.INSTITUTION_MISMATCH };
    }

    // 6. Verify signature
    const isValidSignature = verifySignature(payloadBase64, signatureBase64, partnerRow.secret_key_hash);
    if (!isValidSignature) {
      throw { ...SSO_ERRORS.INVALID_TOKEN };
    }

    // 7. Check token expiry
    if (payload.expires && payload.expires < Date.now()) {
      throw { ...SSO_ERRORS.TOKEN_EXPIRED };
    }

    // 8. Look up student
    const [student] = await query(
      `SELECT s.*, p.name as program_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE s.institution_id = ? AND s.registration_number = ?`,
      [institution.id, payload.identifier]
    );

    if (!student) {
      throw { ...SSO_ERRORS.USER_NOT_FOUND };
    }

    if (student.status !== 'active') {
      throw { ...SSO_ERRORS.USER_INACTIVE };
    }

    // 9. Create internal SSO token for exchange
    const internalToken = createInternalSsoToken(student.id, 'student', ipAddress);

    // 10. Log success
    await logSSOAttempt({
      institutionId: institution.id,
      partnerId: payload.partner_id,
      userType: 'student',
      identifier: payload.identifier,
      status: 'success',
      ipAddress,
      userAgent,
    });

    // 11. Redirect to student portal with internal SSO token
    // The frontend will exchange this for a real JWT
    const redirectUrl = `/student/dashboard?sso_token=${encodeURIComponent(internalToken)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    // Log failure
    await logSSOAttempt({
      institutionId: institution?.id || 0,
      partnerId: decoded?.payload?.partner_id || 'unknown',
      userType: 'student',
      identifier: decoded?.payload?.identifier || 'unknown',
      status: 'failed',
      errorCode: error.code || 'UNKNOWN_ERROR',
      errorMessage: error.message || 'Unknown error',
      ipAddress,
      userAgent,
    });

    // For SSO errors, redirect to error page or return JSON
    if (error.code && error.code.startsWith('SSO_')) {
      return res.status(error.status || 400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    next(error);
  }
};

/**
 * Handle staff SSO authentication
 * GET /sso/staff?token=...
 */
const handleStaffSSO = async (req, res, next) => {
  const { token } = req.query;
  const ipAddress = req.ip || req.connection?.remoteAddress;
  const userAgent = req.get('User-Agent');

  let decoded;
  let partner;
  let institution;

  try {
    // 1. Decode token
    decoded = decodeToken(token);
    const { payload, payloadBase64, signatureBase64 } = decoded;

    // 2. Validate required fields
    if (!payload.partner_id || !payload.identifier || !payload.institution_code) {
      throw { ...SSO_ERRORS.MALFORMED_TOKEN };
    }

    if (payload.user_type !== 'staff') {
      throw { ...SSO_ERRORS.INVALID_USER_TYPE };
    }

    // 3. Look up partner
    const [partnerRow] = await query(
      `SELECT sp.*, i.id as inst_id, i.code as inst_code, i.sso_enabled
       FROM sso_partners sp
       JOIN institutions i ON sp.institution_id = i.id
       WHERE sp.partner_id = ? AND sp.is_enabled = 1`,
      [payload.partner_id]
    );

    if (!partnerRow) {
      throw { ...SSO_ERRORS.INVALID_PARTNER };
    }

    partner = partnerRow;
    institution = { id: partnerRow.inst_id, code: partnerRow.inst_code };

    // 4. Check if SSO is enabled for institution
    if (!partnerRow.sso_enabled) {
      throw { ...SSO_ERRORS.SSO_DISABLED };
    }

    // 5. Verify institution code matches
    if (payload.institution_code.toUpperCase() !== partnerRow.inst_code.toUpperCase()) {
      throw { ...SSO_ERRORS.INSTITUTION_MISMATCH };
    }

    // 6. Verify signature
    const isValidSignature = verifySignature(payloadBase64, signatureBase64, partnerRow.secret_key_hash);
    if (!isValidSignature) {
      throw { ...SSO_ERRORS.INVALID_TOKEN };
    }

    // 7. Check token expiry
    if (payload.expires && payload.expires < Date.now()) {
      throw { ...SSO_ERRORS.TOKEN_EXPIRED };
    }

    // 8. Look up staff user
    const [user] = await query(
      `SELECT u.*, r.name as rank_name
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       WHERE u.institution_id = ? AND u.email = ? AND u.role != 'student'`,
      [institution.id, payload.identifier.toLowerCase()]
    );

    if (!user) {
      throw { ...SSO_ERRORS.USER_NOT_FOUND };
    }

    if (user.status !== 'active') {
      throw { ...SSO_ERRORS.USER_INACTIVE };
    }

    // 9. Create internal SSO token for exchange
    const internalToken = createInternalSsoToken(user.id, 'staff', ipAddress);

    // 10. Log success
    await logSSOAttempt({
      institutionId: institution.id,
      partnerId: payload.partner_id,
      userType: 'staff',
      identifier: payload.identifier,
      status: 'success',
      ipAddress,
      userAgent,
    });

    // 11. Redirect to admin dashboard with internal SSO token
    // The frontend will exchange this for a real JWT
    const redirectUrl = `/admin/dashboard?sso_token=${encodeURIComponent(internalToken)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    // Log failure
    await logSSOAttempt({
      institutionId: institution?.id || 0,
      partnerId: decoded?.payload?.partner_id || 'unknown',
      userType: 'staff',
      identifier: decoded?.payload?.identifier || 'unknown',
      status: 'failed',
      errorCode: error.code || 'UNKNOWN_ERROR',
      errorMessage: error.message || 'Unknown error',
      ipAddress,
      userAgent,
    });

    // For SSO errors, redirect to error page or return JSON
    if (error.code && error.code.startsWith('SSO_')) {
      return res.status(error.status || 400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    next(error);
  }
};

module.exports = {
  handleStudentSSO,
  handleStaffSSO,
  SSO_ERRORS,
};
