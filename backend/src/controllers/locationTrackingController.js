/**
 * Location Tracking Controller
 *
 * Handles supervisor location verification for postings.
 * Supervisors must verify their GPS location at a school before uploading results.
 *
 * Key Rules:
 * 1. Location must be within school's geofence radius (with an accuracy buffer) to validate
 * 2. Every attempt is logged - validated, pending (soft-fail, needs admin review), or rejected (hard-fail)
 * 3. Device/session reuse across supervisors, and JWT-session/device mismatches, route to 'pending' instead of silently passing
 * 4. Admins bypass location restrictions for result management
 *
 * MedeePay Pattern: Direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const { isFeatureEnabled } = require('../middleware/featureToggle');

// Tunable thresholds. Not yet institution-configurable - revisit after real-world usage data.
const MAX_ACCEPTABLE_ACCURACY_M = 100;
const MAX_TIME_DRIFT_SECONDS = 120;

// Validation schemas
const schemas = {
  verifyLocation: z.object({
    body: z.object({
      posting_id: z.number().int().positive('Posting ID is required'),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy_meters: z.number().min(0).max(50000).nullish(),
      altitude_meters: z.number().nullish(),
      timestamp_client: z.string().nullish(),
      device_info: z
        .object({
          device_id: z.string().optional(),
          model: z.string().optional(),
          os: z.string().optional(),
          browser: z.string().optional(),
        })
        .optional(),
      biometric_token: z.string().nullish(),
    }),
  }),
  overrideLocation: z.object({
    body: z.object({
      approve: z.boolean(),
      reason: z.string().min(10, 'Reason must be at least 10 characters'),
    }),
    params: z.object({
      institutionId: z.string(),
      logId: z.string(),
    }),
  }),
};

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate device fingerprint hash for anti-cheating
 * @param {Object} req - Express request object
 * @param {Object} deviceInfo - Device info from client
 * @returns {string} Device hash (32 chars)
 */
function generateDeviceHash(req, deviceInfo) {
  const fingerprint = [
    deviceInfo?.device_id || '',
    deviceInfo?.model || '',
    deviceInfo?.os || '',
    req.headers['user-agent'] || '',
  ].join('|');

  return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 32);
}

/**
 * Verify supervisor location for a posting
 * POST /:institutionId/location/verify
 */
const verifyLocation = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const supervisorId = req.user.id;
    const {
      posting_id,
      latitude,
      longitude,
      accuracy_meters,
      altitude_meters,
      timestamp_client,
      device_info,
      biometric_token,
    } = req.body;

    // 1. Verify posting belongs to this supervisor and get school coordinates
    const [posting] = await query(
      `SELECT sp.*, 
              ms.name as school_name,
              ST_X(ms.location) as school_longitude,
              ST_Y(ms.location) as school_latitude,
              isv.geofence_radius_m
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sp.id = ? AND sp.institution_id = ? AND sp.supervisor_id = ?`,
      [posting_id, parseInt(institutionId), supervisorId]
    );

    if (!posting) {
      throw new NotFoundError('Posting not found or does not belong to you');
    }

    if (posting.status !== 'active') {
      throw new ValidationError('Cannot verify location for inactive posting');
    }

    // 2. Check if school has GPS coordinates
    if (!posting.school_latitude || !posting.school_longitude) {
      throw new ValidationError(
        `School "${posting.school_name}" does not have GPS coordinates configured. Please contact the TP office.`
      );
    }

    // 3. Calculate distance from school, buffered by reported GPS accuracy in the
    // supervisor's favor (a wide-uncertainty fix shouldn't be penalized for landing
    // just outside the radius), while a hard-fail on distance still applies beyond that.
    const distanceFromSchool = calculateDistance(
      latitude,
      longitude,
      posting.school_latitude,
      posting.school_longitude
    );

    const geofenceRadius = posting.geofence_radius_m || 100;
    const effectiveDistance = Math.max(0, distanceFromSchool - (accuracy_meters || 0));
    const isWithinGeofence = effectiveDistance <= geofenceRadius;
    const isLowAccuracy = (accuracy_meters || 0) > MAX_ACCEPTABLE_ACCURACY_M;

    // 4. Check for an existing finalized (validated/overridden) verification for this posting
    const [existingVerified] = await query(
      `SELECT id FROM supervision_location_logs
       WHERE supervisor_posting_id = ? AND validation_status IN ('validated', 'overridden')`,
      [posting_id]
    );

    if (existingVerified) {
      return res.json({
        success: true,
        message: 'Location already verified for this posting',
        data: {
          already_verified: true,
          verified_at: posting.location_verified_at,
          reason_code: 'ALREADY_VERIFIED',
        },
      });
    }

    // 5. Anti-cheating checks - each adds a reason to flagReasons instead of silently passing
    const flagReasons = [];
    const deviceHash = generateDeviceHash(req, device_info);

    // 5a. Same device fingerprint used by a different supervisor in the same academic session
    const deviceUsedByOthers = await query(
      `SELECT DISTINCT sll.supervisor_id, u.name as supervisor_name
       FROM supervision_location_logs sll
       JOIN users u ON sll.supervisor_id = u.id
       WHERE sll.device_id = ?
         AND sll.supervisor_id != ?
         AND sll.session_id = ?
       LIMIT 5`,
      [deviceHash, supervisorId, posting.session_id]
    );

    if (deviceUsedByOthers.length > 0) {
      flagReasons.push('shared_device');
    }

    // 5b. Device fingerprint bound to this JWT session (req.sessionId) doesn't match -
    // catches the token being used for the verify call from a different device/browser
    // than it was issued to. Skip gracefully for legacy tokens without a sessionId.
    if (req.sessionId) {
      const [userSession] = await query(
        `SELECT device_fingerprint FROM user_sessions WHERE session_id = ?`,
        [req.sessionId]
      );

      if (userSession) {
        if (!userSession.device_fingerprint) {
          await query(
            `UPDATE user_sessions SET device_fingerprint = ? WHERE session_id = ? AND device_fingerprint IS NULL`,
            [deviceHash, req.sessionId]
          );
        } else if (userSession.device_fingerprint !== deviceHash) {
          flagReasons.push('session_device_mismatch');
        }
      }
    }

    // 5c. Biometric (WebAuthn platform authenticator) assertion - opt-in per institution.
    // A device fingerprint alone can't distinguish the supervisor from a colleague holding
    // the supervisor's own already-logged-in phone; a fresh, per-check-in fingerprint/face
    // assertion (see biometricController.verifyAuthentication) can. Hard-fail, not a soft
    // flag, when the institution requires it - the whole point is a proxy submitter must
    // not be able to get even a "pending review" pass. Supervisors without a WebAuthn-capable
    // device are exempted individually by a Head of TP+ admin (users.biometric_exempt) rather
    // than weakening the check for everyone.
    let biometricVerified = false;
    let biometricCredentialId = null;
    const biometricRequired =
      !req.user.biometric_exempt &&
      (await isFeatureEnabled('supervisor_biometric_verification', institutionId));

    if (biometricRequired) {
      if (!biometric_token) {
        flagReasons.push('biometric_missing');
      } else {
        try {
          const decoded = jwt.verify(biometric_token, config.jwt.secret);
          if (decoded.purpose !== 'biometric_checkin' || decoded.supervisorId !== supervisorId) {
            flagReasons.push('biometric_invalid');
          } else {
            biometricVerified = true;
            biometricCredentialId = decoded.credentialId;
          }
        } catch {
          flagReasons.push('biometric_invalid');
        }
      }
    }

    // 5d. Time drift between client-reported and server timestamp
    let timeDriftSeconds = null;
    if (timestamp_client) {
      try {
        const clientTime = new Date(timestamp_client);
        const serverTime = new Date();
        timeDriftSeconds = Math.round((serverTime - clientTime) / 1000);
        if (Math.abs(timeDriftSeconds) > MAX_TIME_DRIFT_SECONDS) {
          flagReasons.push('time_drift');
        }
      } catch {
        // Ignore invalid timestamp
      }
    }

    // 5e. Hard-fail reasons
    if (!isWithinGeofence) flagReasons.push('outside_geofence');
    if (isLowAccuracy) flagReasons.push('low_accuracy');
    const biometricFailed = biometricRequired && !biometricVerified;

    // 6. Determine final validation status
    const hasHardFail = !isWithinGeofence || isLowAccuracy || biometricFailed;
    const validationStatus = hasHardFail ? 'rejected' : flagReasons.length > 0 ? 'pending' : 'validated';

    let validationMessage = `Distance from school: ${Math.round(distanceFromSchool)}m`;
    if (deviceUsedByOthers.length > 0) {
      const otherNames = deviceUsedByOthers.map((s) => s.supervisor_name).join(', ');
      validationMessage += ` (Note: Device also used by ${otherNames} this session)`;
    }

    let reasonCode = 'VALIDATED';
    let responseMessage = 'Location verified successfully.';
    if (validationStatus === 'rejected') {
      reasonCode = !isWithinGeofence ? 'OUTSIDE_GEOFENCE' : isLowAccuracy ? 'LOW_ACCURACY' : 'BIOMETRIC_REQUIRED';
      responseMessage = !isWithinGeofence
        ? `You are not within the school's geofence area. Please move closer to the school and try again.`
        : isLowAccuracy
          ? `Your GPS accuracy (±${Math.round(accuracy_meters)}m) is too imprecise to verify. Move to an open area and try again.`
          : 'Please confirm with your fingerprint before verifying location.';
    } else if (validationStatus === 'pending') {
      reasonCode = 'PENDING_REVIEW';
      responseMessage = 'Location recorded but flagged for review. An administrator will verify this shortly.';
    }

    // 7. Always log the attempt - validated, pending, or rejected. Only 'validated'
    // marks the posting as verified; 'pending'/'rejected' leave it unverified until
    // a retry succeeds or an admin overrides.
    let locationLogId = null;
    await transaction(async (conn) => {
      const [logResult] = await conn.execute(
        `INSERT INTO supervision_location_logs (
          institution_id, supervisor_posting_id, supervisor_id, session_id,
          institution_school_id, visit_number,
          latitude, longitude, accuracy_meters, altitude_meters,
          distance_from_school_m, geofence_radius_m, is_within_geofence,
          validation_message, validation_status, flag_reasons,
          biometric_verified, biometric_credential_id,
          device_id, device_info, ip_address, user_agent,
          session_token_hash, jwt_session_id, timestamp_client, time_drift_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(institutionId),
          posting_id,
          supervisorId,
          posting.session_id,
          posting.institution_school_id,
          posting.visit_number,
          latitude,
          longitude,
          accuracy_meters || null,
          altitude_meters || null,
          distanceFromSchool,
          geofenceRadius,
          isWithinGeofence ? 1 : 0,
          validationMessage,
          validationStatus,
          flagReasons.length > 0 ? JSON.stringify(flagReasons) : null,
          biometricVerified ? 1 : 0,
          biometricCredentialId,
          deviceHash,
          device_info ? JSON.stringify(device_info) : null,
          req.ip || req.connection?.remoteAddress || null,
          req.headers['user-agent'] || null,
          crypto
            .createHash('sha256')
            .update(req.headers.authorization || '')
            .digest('hex')
            .substring(0, 64),
          req.sessionId || null,
          timestamp_client || null,
          timeDriftSeconds,
        ]
      );

      locationLogId = logResult.insertId;

      if (validationStatus === 'validated') {
        await conn.execute(
          `UPDATE supervisor_postings
           SET location_verified = 1,
               location_verified_at = NOW(),
               location_log_id = ?
           WHERE id = ?`,
          [locationLogId, posting_id]
        );
      }
    });

    const statusCode = validationStatus === 'rejected' ? 400 : 200;

    res.status(statusCode).json({
      success: validationStatus !== 'rejected',
      message: responseMessage,
      data: {
        is_within_geofence: isWithinGeofence,
        distance_from_school_m: Math.round(distanceFromSchool),
        geofence_radius_m: geofenceRadius,
        school_name: posting.school_name,
        device_shared: deviceUsedByOthers.length > 0,
        validation_status: validationStatus,
        flag_reasons: flagReasons,
        reason_code: reasonCode,
        biometric_required: biometricRequired,
        biometric_verified: biometricVerified,
        hint:
          validationStatus === 'rejected' && !isWithinGeofence
            ? `You need to be within ${geofenceRadius}m of the school. Current distance: ${Math.round(distanceFromSchool)}m`
            : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Approve or reject a pending/rejected location log
 * PATCH /:institutionId/location/admin/logs/:logId/override
 */
const overrideLocationValidation = async (req, res, next) => {
  try {
    const { institutionId, logId } = req.params;
    const { approve, reason } = req.body;
    const adminId = req.user.id;

    const [log] = await query(
      `SELECT * FROM supervision_location_logs WHERE id = ? AND institution_id = ?`,
      [parseInt(logId), parseInt(institutionId)]
    );

    if (!log) {
      throw new NotFoundError('Location log not found');
    }

    if (!['pending', 'rejected'].includes(log.validation_status)) {
      throw new ConflictError(
        `Cannot override a log with status '${log.validation_status}'. Only pending or rejected logs can be reviewed.`
      );
    }

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE supervision_location_logs
         SET validation_status = 'overridden',
             overridden_by = ?,
             overridden_at = NOW(),
             override_reason = ?
         WHERE id = ?`,
        [adminId, reason, log.id]
      );

      if (approve) {
        await conn.execute(
          `UPDATE supervisor_postings
           SET location_verified = 1,
               location_verified_at = NOW(),
               location_log_id = ?
           WHERE id = ? AND location_verified = 0`,
          [log.id, log.supervisor_posting_id]
        );
      }
    });

    res.json({
      success: true,
      message: approve ? 'Location verification approved.' : 'Location verification rejected.',
      data: { log_id: log.id, approved: approve },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location verification status for supervisor's postings
 * GET /:institutionId/location/my-postings
 */
const getMyPostingsLocationStatus = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const supervisorId = req.user.id;
    const { session_id } = req.query;

    let sessionFilter = '';
    const params = [parseInt(institutionId), supervisorId];

    if (session_id) {
      sessionFilter = ' AND sp.session_id = ?';
      params.push(parseInt(session_id));
    }

    const postings = await query(
      `SELECT 
         sp.id as posting_id,
         sp.institution_school_id,
         sp.group_number,
         sp.visit_number,
         sp.is_primary_posting,
         sp.location_verified,
         sp.location_verified_at,
         ms.name as school_name,
         ms.official_code as school_code,
         ST_Y(ms.location) as school_latitude,
         ST_X(ms.location) as school_longitude,
         isv.distance_km,
         isv.geofence_radius_m,
         CASE WHEN ms.location IS NULL THEN 0 ELSE 1 END as has_coordinates
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sp.institution_id = ? 
         AND sp.supervisor_id = ?
         AND sp.status = 'active'
         ${sessionFilter}
       ORDER BY ms.name, sp.group_number, sp.visit_number`,
      params
    );

    res.json({
      success: true,
      data: postings.map((p) => ({
        ...p,
        location_verified: p.location_verified === 1,
        has_coordinates: p.has_coordinates === 1,
        can_verify_location: p.has_coordinates === 1 && p.location_verified !== 1,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if location is verified for a specific posting
 * GET /:institutionId/location/check/:postingId
 */
const checkLocationVerification = async (req, res, next) => {
  try {
    const { institutionId, postingId } = req.params;
    const supervisorId = req.user.id;

    const [posting] = await query(
      `SELECT sp.location_verified, sp.location_verified_at, ms.name as school_name,
              (SELECT sll.validation_status FROM supervision_location_logs sll
               WHERE sll.supervisor_posting_id = sp.id
               ORDER BY sll.created_at DESC LIMIT 1) as latest_validation_status
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sp.id = ? AND sp.institution_id = ? AND sp.supervisor_id = ?`,
      [parseInt(postingId), parseInt(institutionId), supervisorId]
    );

    if (!posting) {
      throw new NotFoundError('Posting not found');
    }

    res.json({
      success: true,
      data: {
        posting_id: parseInt(postingId),
        location_verified: posting.location_verified === 1,
        location_verified_at: posting.location_verified_at,
        school_name: posting.school_name,
        can_upload_results: posting.location_verified === 1,
        latest_validation_status: posting.latest_validation_status || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get all location logs for review
 * GET /:institutionId/location/admin/logs
 */
const getLocationLogs = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const {
      session_id,
      supervisor_id,
      school_id,
      device_shared,
      status,
      suspicious_only,
      page = 1,
      limit = 50,
    } = req.query;

    let sql = `
      SELECT sll.*,
             u.name as supervisor_name,
             u.email as supervisor_email,
             ms.name as school_name,
             sess.name as session_name
      FROM supervision_location_logs sll
      JOIN users u ON sll.supervisor_id = u.id
      JOIN institution_schools isv ON sll.institution_school_id = isv.id
      JOIN master_schools ms ON isv.master_school_id = ms.id
      JOIN academic_sessions sess ON sll.session_id = sess.id
      WHERE sll.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sll.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (supervisor_id) {
      sql += ' AND sll.supervisor_id = ?';
      params.push(parseInt(supervisor_id));
    }
    if (school_id) {
      sql += ' AND sll.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (device_shared === 'true') {
      sql += " AND JSON_CONTAINS(sll.flag_reasons, '\"shared_device\"')";
    }
    if (status) {
      sql += ' AND sll.validation_status = ?';
      params.push(status);
    }
    if (suspicious_only === 'true') {
      sql += " AND sll.validation_status IN ('pending', 'rejected')";
    }

    // Count total
    const countSql = sql.replace(/SELECT sll\.\*,[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;

    // Paginate
    sql += ' ORDER BY sll.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const logs = await query(sql, params);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get location statistics summary
 * GET /:institutionId/location/admin/stats
 */
const getLocationStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sessionFilter = '';
    const params = [parseInt(institutionId)];

    if (session_id) {
      sessionFilter = ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    // Get total verifications, broken down by status
    const [stats] = await query(
      `SELECT
         COUNT(*) as total_logs,
         COUNT(CASE WHEN validation_status IN ('validated', 'overridden') THEN 1 END) as validated_count,
         COUNT(CASE WHEN validation_status = 'pending' THEN 1 END) as pending_count,
         COUNT(CASE WHEN validation_status = 'rejected' THEN 1 END) as rejected_count,
         COUNT(DISTINCT supervisor_id) as unique_supervisors,
         COUNT(DISTINCT institution_school_id) as unique_schools,
         COUNT(DISTINCT device_id) as unique_devices,
         AVG(distance_from_school_m) as avg_distance_m
       FROM supervision_location_logs
       WHERE institution_id = ? ${sessionFilter}`,
      params
    );

    // Get shared device count
    const [sharedDevices] = await query(
      `SELECT COUNT(*) as count
       FROM supervision_location_logs
       WHERE institution_id = ? ${sessionFilter}
         AND JSON_CONTAINS(flag_reasons, '"shared_device"')`,
      params
    );

    const pendingCount = stats?.pending_count || 0;
    const rejectedCount = stats?.rejected_count || 0;

    res.json({
      success: true,
      data: {
        total_logs: stats?.total_logs || 0,
        total_verifications: stats?.total_logs || 0,
        validated_count: stats?.validated_count || 0,
        pending_count: pendingCount,
        rejected_count: rejectedCount,
        suspicious_count: pendingCount + rejectedCount,
        unique_supervisors: stats?.unique_supervisors || 0,
        unique_schools: stats?.unique_schools || 0,
        unique_devices: stats?.unique_devices || 0,
        avg_distance_m: Math.round(stats?.avg_distance_m || 0),
        shared_device_entries: sharedDevices?.count || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  verifyLocation,
  overrideLocationValidation,
  getMyPostingsLocationStatus,
  checkLocationVerification,
  getLocationLogs,
  getLocationStats,
};
