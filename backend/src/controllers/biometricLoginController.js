/**
 * Biometric Login Controller
 *
 * Lets a staff member enroll their device's platform authenticator
 * (fingerprint/face) as an ADDITIONAL way to log in - alongside, never
 * replacing, email + password. One credential per staff user, stored
 * directly on `users` (migration 056) rather than a devices table - this
 * is a lightweight self-service convenience, unlike the multi-device,
 * admin-policed supervisor check-in feature (biometricController.js).
 *
 * Login-time endpoints are PUBLIC (no session yet) - the frontend already
 * knows the caller's email from a local per-device hint, so the user never
 * types it, but the account is still resolved and verified by email
 * server-side. All failure cases (no such account, wrong subdomain, not
 * enrolled) return the same generic response to avoid account enumeration,
 * mirroring how staffLogin returns a generic "Invalid email or password".
 *
 * MedeePay Pattern: Direct SQL, no institutionId in the URL for the public
 * endpoints (institution is resolved from subdomain, same as staffLogin).
 */

const { z } = require('zod');
const { query } = require('../db/database');
const { ValidationError, NotFoundError } = require('../utils/errors');
const webauthnService = require('../services/webauthnService');
const {
  ROLES,
  AUTH_TYPES,
  generateToken,
  createSession,
  logAuthEvent,
} = require('./authController');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BIOMETRIC_UNAVAILABLE = {
  success: false,
  message: 'Fingerprint login is not available. Please log in with your password.',
  errorCode: 'BIOMETRIC_LOGIN_UNAVAILABLE',
};

const schemas = {
  verifyEnrollment: z.object({
    body: z.object({
      response: z.record(z.string(), z.any()),
      device_label: z.string().max(255).nullish(),
    }),
  }),
  getLoginOptions: z.object({
    body: z.object({
      email: z.string().email('Invalid email format'),
    }),
  }),
  verifyLogin: z.object({
    body: z.object({
      email: z.string().email('Invalid email format'),
      response: z.record(z.string(), z.any()),
    }),
  }),
};

async function storeChallenge(userId, challenge, challengeType) {
  await query(
    `INSERT INTO webauthn_challenges (user_id, challenge, challenge_type, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, challenge, challengeType, new Date(Date.now() + CHALLENGE_TTL_MS)]
  );
}

async function consumeChallenge(userId, challengeType) {
  const [row] = await query(
    `SELECT challenge FROM webauthn_challenges
     WHERE user_id = ? AND challenge_type = ? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, challengeType]
  );

  await query(`DELETE FROM webauthn_challenges WHERE user_id = ? AND challenge_type = ?`, [
    userId,
    challengeType,
  ]);

  return row ? row.challenge : null;
}

/**
 * Resolve a staff account for the PUBLIC login-time endpoints, applying the
 * exact same subdomain/status checks as staffLogin (authController.js) but
 * never throwing a distinguishable error - callers get null on any failure
 * and must respond with the generic BIOMETRIC_UNAVAILABLE shape.
 */
async function resolveStaffForBiometricLogin(req, email) {
  const [user] = await query(
    `SELECT u.*, i.status as institution_status, i.subdomain as institution_subdomain
     FROM users u
     LEFT JOIN institutions i ON u.institution_id = i.id
     WHERE u.email = ?`,
    [email.toLowerCase()]
  );

  if (!user) return null;
  if (user.status !== 'active') return null;
  if (!user.biometric_login_credential_id) return null;

  const resolvedInstitution = req.subdomainInstitution;

  if (user.role !== ROLES.SUPER_ADMIN) {
    if (user.role !== ROLES.SUPER_ADMIN && user.institution_status !== 'active') return null;
    if (!resolvedInstitution || user.institution_id !== resolvedInstitution.id) return null;
  }

  return user;
}

/**
 * POST /auth/biometric/enroll-options
 * Authenticated, staff only.
 */
const getEnrollmentOptions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const excludeCredentials = [];
    if (req.user.biometric_login_credential_id) {
      excludeCredentials.push({
        credential_id: req.user.biometric_login_credential_id,
        transports: req.user.biometric_login_transports
          ? JSON.parse(req.user.biometric_login_transports)
          : undefined,
      });
    }

    const options = await webauthnService.buildRegistrationOptions(req, {
      userId,
      userName: req.user.email,
      excludeCredentials,
    });

    await storeChallenge(userId, options.challenge, 'registration');

    res.json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/biometric/enroll-verify
 * Authenticated, staff only. Overwrites any previously enrolled device.
 */
const verifyEnrollment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { response, device_label } = req.body;

    const expectedChallenge = await consumeChallenge(userId, 'registration');
    if (!expectedChallenge) {
      throw new ValidationError('Registration challenge expired or not found. Please try again.');
    }

    const verification = await webauthnService.verifyRegistration(req, {
      response,
      expectedChallenge,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new ValidationError('Could not verify biometric registration.');
    }

    const { credential } = verification.registrationInfo;

    await query(
      `UPDATE users SET
        biometric_login_credential_id = ?,
        biometric_login_public_key = ?,
        biometric_login_counter = ?,
        biometric_login_transports = ?,
        biometric_login_device_label = ?,
        biometric_login_enrolled_at = NOW(),
        biometric_login_last_used_at = NULL
       WHERE id = ?`,
      [
        credential.id,
        Buffer.from(credential.publicKey).toString('base64'),
        credential.counter,
        credential.transports ? JSON.stringify(credential.transports) : null,
        device_label || null,
        userId,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Biometric login enabled on this device.',
      data: { device_label: device_label || null, enrolled_at: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /auth/biometric/disable
 * Authenticated, staff only. Self-service.
 */
const disableBiometricLogin = async (req, res, next) => {
  try {
    await query(
      `UPDATE users SET
        biometric_login_credential_id = NULL,
        biometric_login_public_key = NULL,
        biometric_login_counter = NULL,
        biometric_login_transports = NULL,
        biometric_login_device_label = NULL,
        biometric_login_enrolled_at = NULL,
        biometric_login_last_used_at = NULL
       WHERE id = ?`,
      [req.user.id]
    );

    res.json({ success: true, message: 'Biometric login disabled.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/biometric/login-options
 * Public.
 */
const getLoginOptions = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await resolveStaffForBiometricLogin(req, email);
    if (!user) {
      return res.status(400).json(BIOMETRIC_UNAVAILABLE);
    }

    const options = await webauthnService.buildAuthenticationOptions(req, {
      allowCredentials: [
        {
          credential_id: user.biometric_login_credential_id,
          transports: user.biometric_login_transports
            ? JSON.parse(user.biometric_login_transports)
            : undefined,
        },
      ],
    });

    await storeChallenge(user.id, options.challenge, 'authentication');

    res.json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/biometric/login-verify
 * Public. Mints the same session/token shape as staffLogin.
 */
const verifyLogin = async (req, res, next) => {
  try {
    const { email, response } = req.body;

    const user = await resolveStaffForBiometricLogin(req, email);
    if (!user) {
      return res.status(400).json(BIOMETRIC_UNAVAILABLE);
    }

    const expectedChallenge = await consumeChallenge(user.id, 'authentication');
    if (!expectedChallenge) {
      return res.status(400).json(BIOMETRIC_UNAVAILABLE);
    }

    // response.id must match the enrolled credential - a stale/foreign assertion is rejected
    if (response.id !== user.biometric_login_credential_id) {
      return res.status(400).json(BIOMETRIC_UNAVAILABLE);
    }

    const verification = await webauthnService.verifyAuthentication(req, {
      response,
      expectedChallenge,
      credential: {
        credential_id: user.biometric_login_credential_id,
        public_key: user.biometric_login_public_key,
        counter: user.biometric_login_counter,
        transports: user.biometric_login_transports
          ? JSON.parse(user.biometric_login_transports)
          : undefined,
      },
    });

    if (!verification.verified) {
      return res.status(400).json(BIOMETRIC_UNAVAILABLE);
    }

    await query(
      `UPDATE users SET biometric_login_counter = ?, biometric_login_last_used_at = NOW() WHERE id = ?`,
      [verification.authenticationInfo.newCounter, user.id]
    );

    const sessionId = await createSession({
      userId: user.id,
      institutionId: user.institution_id,
      userType: AUTH_TYPES.STAFF,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const token = generateToken(user, AUTH_TYPES.STAFF, sessionId);

    await logAuthEvent({
      institution_id: user.institution_id,
      user_id: user.id,
      user_type: 'staff',
      action: 'login_success',
      details: { session_id: sessionId, method: 'biometric' },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    const isGlobalContext = req.isGlobalContext === true;
    const subdomainInstitution = req.subdomainInstitution;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        sessionId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          institution: subdomainInstitution
            ? {
                id: subdomainInstitution.public_id,
                name: subdomainInstitution.name,
                subdomain: subdomainInstitution.subdomain,
              }
            : null,
        },
        isGlobalContext,
        subdomain: req.subdomain,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: POST /:institutionId/users/:id/clear-biometric-login
 * Head of TP+ only - lost/compromised device incident response.
 */
const adminClearBiometricLogin = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const result = await query(
      `UPDATE users SET
        biometric_login_credential_id = NULL,
        biometric_login_public_key = NULL,
        biometric_login_counter = NULL,
        biometric_login_transports = NULL,
        biometric_login_device_label = NULL,
        biometric_login_enrolled_at = NULL,
        biometric_login_last_used_at = NULL
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('User not found');
    }

    await logAuthEvent({
      institution_id: parseInt(institutionId),
      user_id: req.user.id,
      user_type: 'staff',
      action: 'biometric_login_cleared',
      details: { cleared_user_id: parseInt(id) },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Biometric login cleared for this user.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getEnrollmentOptions,
  verifyEnrollment,
  disableBiometricLogin,
  getLoginOptions,
  verifyLogin,
  adminClearBiometricLogin,
};
