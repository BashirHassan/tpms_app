/**
 * Location Tracking Controller
 *
 * Handles supervisor location verification for postings.
 * Supervisors must verify their GPS location at a school before uploading results.
 *
 * Key Rules:
 * 1. Geofence radius and GPS accuracy threshold are session-level settings
 *    (academic_sessions.geofence_radius_m / supervisor_gps_accuracy_m), not
 *    per-school - centralized rather than customizable per school.
 * 2. Every attempt is logged - validated or rejected. There is no 'pending'/admin-
 *    review path: a supervisor whose check-in fails any check must genuinely
 *    correct the issue and retry. Nobody, including a Head of TP, can approve or
 *    vouch for a questionable check-in on a supervisor's behalf.
 * 3. Device/session reuse across supervisors, and JWT-session/device mismatches,
 *    hard-reject for the same reason - there is no soft/reviewable outcome.
 * 4. A coordinate-genuineness signal (identical GPS samples across a capture)
 *    also hard-rejects. Still a web app trusting navigator.geolocation, not a
 *    native app with OS-level mock-location attestation.
 * 5. Admins bypass location restrictions for result management.
 *
 * MedeePay Pattern: Direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { isFeatureEnabled } = require('../middleware/featureToggle');

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
      gps_samples: z
        .array(
          z.object({
            latitude: z.number(),
            longitude: z.number(),
            accuracy_meters: z.number().nullish(),
            timestamp: z.string().nullish(),
          })
        )
        .max(20)
        .optional(),
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
 * Flag GPS captures where every sample is bit-for-bit identical. Real GPS
 * chips jitter slightly between readings even when stationary; several
 * mock-location tools return the exact same coordinate every time. A minimum
 * sample count is required so a single throttled duplicate-reading burst some
 * browsers produce doesn't false-positive.
 * @param {Array<{latitude: number, longitude: number}>} samples
 * @returns {boolean}
 */
function detectZeroJitter(samples) {
  if (!Array.isArray(samples) || samples.length < 4) return false;
  const first = samples[0];
  return samples.every((s) => s.latitude === first.latitude && s.longitude === first.longitude);
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
      gps_samples,
    } = req.body;

    // 1. Verify posting belongs to this supervisor and get school coordinates.
    // geofence_radius_m/supervisor_gps_accuracy_m are session-level settings
    // (centralized off the old per-school institution_schools.geofence_radius_m).
    const [posting] = await query(
      `SELECT sp.*,
              ms.name as school_name,
              ST_X(ms.location) as school_longitude,
              ST_Y(ms.location) as school_latitude,
              sess.geofence_radius_m,
              sess.supervisor_gps_accuracy_m
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       JOIN academic_sessions sess ON sp.session_id = sess.id
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

    const geofenceRadius = posting.geofence_radius_m;
    const maxAccuracy = posting.supervisor_gps_accuracy_m;
    const effectiveDistance = Math.max(0, distanceFromSchool - (accuracy_meters || 0));
    const isWithinGeofence = effectiveDistance <= geofenceRadius;
    const isLowAccuracy = (accuracy_meters || 0) > maxAccuracy;

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

    // 5a. Same device fingerprint used by a different supervisor in the same academic
    // session. Hard-fail, not a soft flag - there is no admin review path to fall back
    // on, and a shared device is exactly the "manipulate the record for another person"
    // scenario this whole feature exists to prevent. Use your own device and retry.
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

    const sharedDevice = deviceUsedByOthers.length > 0;
    if (sharedDevice) {
      flagReasons.push('shared_device');
    }

    // 5b. Device fingerprint bound to this JWT session (req.sessionId) doesn't match -
    // catches the token being used for the verify call from a different device/browser
    // than it was issued to. Hard-fail for the same reason as 5a. Skip gracefully for
    // legacy tokens without a sessionId. First use of a session binds the fingerprint
    // (TOFU) rather than failing - a legitimate fresh login on a new device.
    let sessionDeviceMismatch = false;
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
          sessionDeviceMismatch = true;
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

    // 5d. Time drift between client-reported and server timestamp. Informational only,
    // not a hard-fail - clock skew is a device-configuration/environmental signal, not
    // an identity/spoofing one, so it's recorded for audit but doesn't block validation.
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

    // 5e. Genuine-coordinate signal. Still a web app trusting navigator.geolocation,
    // not a native app with OS-level mock-location attestation - this catches common/
    // careless spoofing tools, not a sophisticated attacker replaying pre-recorded
    // jittered coordinates. Hard-fail, consistent with there being no more admin
    // review path to fall back on for a suspicious reading.
    const suspiciousZeroJitter = detectZeroJitter(gps_samples);
    if (suspiciousZeroJitter) flagReasons.push('suspicious_zero_jitter');

    // 5f. Hard-fail reasons
    if (!isWithinGeofence) flagReasons.push('outside_geofence');
    if (isLowAccuracy) flagReasons.push('low_accuracy');
    const biometricFailed = biometricRequired && !biometricVerified;

    // 6. Determine final validation status. Binary - validated or rejected - because
    // nothing can resolve a "pending" status anymore (no admin override). A rejected
    // check-in requires the supervisor to genuinely correct the underlying issue and
    // retry; there is no in-between state to leave for later review.
    const hasHardFail =
      !isWithinGeofence ||
      isLowAccuracy ||
      biometricFailed ||
      sharedDevice ||
      sessionDeviceMismatch ||
      suspiciousZeroJitter;
    const validationStatus = hasHardFail ? 'rejected' : 'validated';

    let validationMessage = `Distance from school: ${Math.round(distanceFromSchool)}m`;
    if (sharedDevice) {
      const otherNames = deviceUsedByOthers.map((s) => s.supervisor_name).join(', ');
      validationMessage += ` (Note: Device also used by ${otherNames} this session)`;
    }

    let reasonCode = 'VALIDATED';
    let responseMessage = 'Location verified successfully.';
    if (validationStatus === 'rejected') {
      if (!isWithinGeofence) {
        reasonCode = 'OUTSIDE_GEOFENCE';
        responseMessage = `You are not within the school's geofence area. Please move closer to the school and try again.`;
      } else if (isLowAccuracy) {
        reasonCode = 'LOW_ACCURACY';
        responseMessage = `Your GPS accuracy (±${Math.round(accuracy_meters)}m) is too imprecise to verify. Move to an open area and try again.`;
      } else if (biometricFailed) {
        reasonCode = 'BIOMETRIC_REQUIRED';
        responseMessage = 'Please confirm with your fingerprint before verifying location.';
      } else if (sharedDevice || sessionDeviceMismatch) {
        reasonCode = 'SHARED_DEVICE';
        responseMessage =
          'This device is already associated with another supervisor, or with a different login session, this session. Please use your own device, or log in fresh on this device, and try again.';
      } else {
        reasonCode = 'SUSPICIOUS_LOCATION';
        responseMessage =
          "Your location reading looks artificial - make sure you're using your device's real GPS, not a location-spoofing app or emulator, and try again outdoors.";
      }
    }

    // 7. Always log the attempt - validated or rejected. Only 'validated' marks the
    // posting as verified; 'rejected' leaves it unverified until a retry succeeds -
    // there is no admin override path.
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
          device_id, device_info, gps_samples, ip_address, user_agent,
          session_token_hash, jwt_session_id, timestamp_client, time_drift_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          gps_samples && gps_samples.length > 0 ? JSON.stringify(gps_samples) : null,
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
        supervisor_gps_accuracy_m: maxAccuracy,
        school_name: posting.school_name,
        device_shared: sharedDevice,
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
         sess.geofence_radius_m,
         sess.supervisor_gps_accuracy_m,
         CASE WHEN ms.location IS NULL THEN 0 ELSE 1 END as has_coordinates
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       JOIN academic_sessions sess ON sp.session_id = sess.id
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
  getMyPostingsLocationStatus,
  checkLocationVerification,
  getLocationLogs,
  getLocationStats,
};
