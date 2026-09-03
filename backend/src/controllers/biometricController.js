/**
 * Biometric (WebAuthn) Controller
 *
 * Lets a supervisor enroll their device's platform authenticator (Android/
 * Windows/Mac built-in fingerprint or face) and produce a fresh signed
 * assertion at check-in time. The assertion is exchanged for a short-lived
 * `biometric_token` that locationTrackingController.verifyLocation requires
 * when the 'supervisor_biometric_verification' feature is enabled - this is
 * what stops a colleague holding the supervisor's own already-logged-in
 * phone from checking in on their behalf.
 *
 * Device management (viewing/revoking OTHER supervisors' enrolled devices)
 * is centralized with Head of TP+ admins, not self-service - see
 * adminListCredentials/adminRevokeCredential.
 *
 * MedeePay Pattern: Direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/database');
const { ValidationError, NotFoundError } = require('../utils/errors');
const webauthnService = require('../services/webauthnService');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BIOMETRIC_TOKEN_TTL = '2m';
const BIOMETRIC_TOKEN_PURPOSE = 'biometric_checkin';

const schemas = {
  verifyRegistration: z.object({
    body: z.object({
      response: z.record(z.string(), z.any()),
      device_label: z.string().max(255).nullish(),
      device_id: z.string().max(64).nullish(),
    }),
  }),
  verifyAuthentication: z.object({
    body: z.object({
      response: z.record(z.string(), z.any()),
    }),
  }),
  adminListCredentials: z.object({
    query: z.object({
      supervisor_id: z.string().optional(),
      include_revoked: z.string().optional(),
    }),
  }),
  adminRevokeCredential: z.object({
    params: z.object({
      institutionId: z.string(),
      credentialId: z.string(),
    }),
  }),
  adminSetExemption: z.object({
    params: z.object({
      institutionId: z.string(),
      supervisorId: z.string(),
    }),
    body: z.object({
      exempt: z.boolean(),
      reason: z.string().min(10, 'Reason must be at least 10 characters').nullish(),
    }).refine((data) => !data.exempt || !!data.reason, {
      message: 'A reason is required when granting an exemption',
      path: ['reason'],
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

/**
 * Load the most recent non-expired challenge of a type for a user, and
 * delete it (and any other stale rows for that user/type) so it can't be
 * replayed.
 */
async function consumeChallenge(userId, challengeType) {
  const [row] = await query(
    `SELECT id, challenge FROM webauthn_challenges
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
 * POST /:institutionId/biometric/register/options
 */
const getRegistrationOptions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const existingCredentials = await query(
      `SELECT credential_id, transports FROM supervisor_biometric_credentials
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId]
    );

    const options = await webauthnService.buildRegistrationOptions(req, {
      userId,
      userName: req.user.email || req.user.name || `user-${userId}`,
      excludeCredentials: existingCredentials.map((c) => ({
        credential_id: c.credential_id,
        transports: c.transports || undefined,
      })),
    });

    await storeChallenge(userId, options.challenge, 'registration');

    res.json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:institutionId/biometric/register/verify
 */
const verifyRegistration = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const userId = req.user.id;
    const { response, device_label, device_id } = req.body;

    const expectedChallenge = await consumeChallenge(userId, 'registration');
    if (!expectedChallenge) {
      throw new ValidationError('Registration challenge expired or not found. Please try again.');
    }

    // A device id already actively enrolled to a different supervisor means this
    // physical device would become the "fingerprint" for more than one account -
    // exactly the mechanism a proxy check-in would rely on. Block it; an admin
    // must revoke the conflicting credential first (adminRevokeCredential) if the
    // device has genuinely changed hands.
    if (device_id) {
      const [conflict] = await query(
        `SELECT sbc.user_id, u.name as supervisor_name
         FROM supervisor_biometric_credentials sbc
         JOIN users u ON sbc.user_id = u.id
         WHERE sbc.device_id = ? AND sbc.institution_id = ?
           AND sbc.revoked_at IS NULL AND sbc.user_id != ?
         LIMIT 1`,
        [device_id, parseInt(institutionId), userId]
      );

      if (conflict) {
        throw new ValidationError(
          `This device is already enrolled as ${conflict.supervisor_name}'s biometric device. Ask a Head of TP admin to revoke that enrollment first if this device has changed hands.`
        );
      }
    }

    const verification = await webauthnService.verifyRegistration(req, {
      response,
      expectedChallenge,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new ValidationError('Could not verify biometric registration.');
    }

    const { credential } = verification.registrationInfo;

    const result = await query(
      `INSERT INTO supervisor_biometric_credentials
        (institution_id, user_id, credential_id, public_key, counter, device_label, device_id, transports)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(institutionId),
        userId,
        credential.id,
        Buffer.from(credential.publicKey).toString('base64'),
        credential.counter,
        device_label || null,
        device_id || null,
        credential.transports ? JSON.stringify(credential.transports) : null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Biometric device enrolled successfully.',
      data: {
        id: result.insertId,
        device_label: device_label || null,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:institutionId/biometric/auth/options
 */
const getAuthenticationOptions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const credentials = await query(
      `SELECT credential_id, transports FROM supervisor_biometric_credentials
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId]
    );

    if (credentials.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No biometric device enrolled yet. Please enroll first.',
        data: { reason_code: 'NOT_ENROLLED' },
      });
    }

    const options = await webauthnService.buildAuthenticationOptions(req, {
      allowCredentials: credentials.map((c) => ({
        credential_id: c.credential_id,
        transports: c.transports || undefined,
      })),
    });

    await storeChallenge(userId, options.challenge, 'authentication');

    res.json({ success: true, data: options });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:institutionId/biometric/auth/verify
 * Returns a short-lived biometric_token that verifyLocation requires.
 */
const verifyAuthentication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { response } = req.body;

    const expectedChallenge = await consumeChallenge(userId, 'authentication');
    if (!expectedChallenge) {
      throw new ValidationError('Authentication challenge expired or not found. Please try again.');
    }

    const [credential] = await query(
      `SELECT * FROM supervisor_biometric_credentials
       WHERE user_id = ? AND credential_id = ? AND revoked_at IS NULL`,
      [userId, response.id]
    );

    if (!credential) {
      throw new NotFoundError('Biometric credential not found or has been revoked.');
    }

    const verification = await webauthnService.verifyAuthentication(req, {
      response,
      expectedChallenge,
      credential: {
        credential_id: credential.credential_id,
        public_key: credential.public_key,
        counter: credential.counter,
        transports: credential.transports || undefined,
      },
    });

    if (!verification.verified) {
      throw new ValidationError('Could not verify biometric assertion.');
    }

    await query(
      `UPDATE supervisor_biometric_credentials SET counter = ?, last_used_at = NOW() WHERE id = ?`,
      [verification.authenticationInfo.newCounter, credential.id]
    );

    const biometricToken = jwt.sign(
      {
        supervisorId: userId,
        credentialId: credential.credential_id,
        purpose: BIOMETRIC_TOKEN_PURPOSE,
      },
      config.jwt.secret,
      { expiresIn: BIOMETRIC_TOKEN_TTL }
    );

    res.json({ success: true, data: { biometric_token: biometricToken } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /:institutionId/biometric/credentials
 * Self-only: whether the caller has an enrolled device, used to gate the
 * check-in UI. Viewing/revoking OTHER supervisors' devices is admin-only -
 * see adminListCredentials/adminRevokeCredential below.
 */
const listCredentials = async (req, res, next) => {
  try {
    const credentials = await query(
      `SELECT id, device_label, created_at, last_used_at
       FROM supervisor_biometric_credentials
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, data: credentials });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: GET /:institutionId/biometric/admin/credentials
 * List enrolled biometric devices across all supervisors in the institution.
 * Head of TP+ only - device management is centralized, not self-service.
 */
const adminListCredentials = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { supervisor_id, include_revoked } = req.query;

    let sql = `
      SELECT sbc.id, sbc.user_id, u.name as supervisor_name, u.email as supervisor_email,
             sbc.device_label, sbc.created_at, sbc.last_used_at,
             sbc.revoked_at, sbc.revoked_by, revoker.name as revoked_by_name
      FROM supervisor_biometric_credentials sbc
      JOIN users u ON sbc.user_id = u.id
      LEFT JOIN users revoker ON sbc.revoked_by = revoker.id
      WHERE sbc.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (supervisor_id) {
      sql += ' AND sbc.user_id = ?';
      params.push(parseInt(supervisor_id));
    }

    if (include_revoked !== 'true') {
      sql += ' AND sbc.revoked_at IS NULL';
    }

    sql += ' ORDER BY sbc.created_at DESC';

    const credentials = await query(sql, params);

    res.json({ success: true, data: credentials });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: DELETE /:institutionId/biometric/admin/credentials/:credentialId
 * Revoke any supervisor's enrolled device (lost/compromised phone, offboarding,
 * etc). The supervisor must re-enroll (a fresh live fingerprint) before their
 * next check-in - self-revocation is intentionally not exposed to supervisors.
 */
const adminRevokeCredential = async (req, res, next) => {
  try {
    const { institutionId, credentialId } = req.params;

    const result = await query(
      `UPDATE supervisor_biometric_credentials
       SET revoked_at = NOW(), revoked_by = ?
       WHERE id = ? AND institution_id = ? AND revoked_at IS NULL`,
      [req.user.id, parseInt(credentialId), parseInt(institutionId)]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('Biometric credential not found.');
    }

    res.json({ success: true, message: 'Biometric device revoked.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: GET /:institutionId/biometric/admin/exemptions
 * List supervisors in the institution with their biometric exemption status,
 * for supervisors who have no WebAuthn-capable device.
 */
const adminListExemptions = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const supervisors = await query(
      `SELECT u.id as supervisor_id, u.name as supervisor_name, u.email as supervisor_email,
              u.biometric_exempt, u.biometric_exempt_reason,
              u.biometric_exempt_set_at, setter.name as biometric_exempt_set_by_name
       FROM users u
       LEFT JOIN users setter ON u.biometric_exempt_set_by = setter.id
       WHERE u.institution_id = ? AND u.role = 'supervisor'
       ORDER BY u.name`,
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: supervisors.map((s) => ({ ...s, biometric_exempt: s.biometric_exempt === 1 })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: PATCH /:institutionId/biometric/admin/exemptions/:supervisorId
 * Grant or revoke a supervisor's exemption from the biometric check-in gate.
 * Everything else about their check-in (geofence, device fingerprint) still applies.
 */
const adminSetExemption = async (req, res, next) => {
  try {
    const { institutionId, supervisorId } = req.params;
    const { exempt, reason } = req.body;

    const result = await query(
      `UPDATE users
       SET biometric_exempt = ?,
           biometric_exempt_reason = ?,
           biometric_exempt_set_by = ?,
           biometric_exempt_set_at = NOW()
       WHERE id = ? AND institution_id = ? AND role = 'supervisor'`,
      [exempt ? 1 : 0, reason || null, req.user.id, parseInt(supervisorId), parseInt(institutionId)]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('Supervisor not found.');
    }

    res.json({
      success: true,
      message: exempt ? 'Supervisor exempted from biometric verification.' : 'Exemption removed.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listCredentials,
  adminListCredentials,
  adminRevokeCredential,
  adminListExemptions,
  adminSetExemption,
};
