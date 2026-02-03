/**
 * Location Tracking Controller
 *
 * Handles supervisor location verification for postings.
 * Supervisors must verify their GPS location at a school before uploading results.
 *
 * Key Rules:
 * 1. Location must be within school's geofence radius to be accepted
 * 2. Only successful verifications are logged (reduces database clutter)
 * 3. One device per supervisor per session (anti-cheating)
 * 4. Admins bypass location restrictions for result management
 *
 * MedeePay Pattern: Direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const crypto = require('crypto');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

// Validation schemas
const schemas = {
  verifyLocation: z.object({
    body: z.object({
      posting_id: z.number().int().positive('Posting ID is required'),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy_meters: z.number().min(0).nullish(),
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

    // 3. Calculate distance from school
    const distanceFromSchool = calculateDistance(
      latitude,
      longitude,
      posting.school_latitude,
      posting.school_longitude
    );

    const geofenceRadius = posting.geofence_radius_m || 100;
    const isWithinGeofence = distanceFromSchool <= geofenceRadius;

    // 4. If NOT within geofence, return error immediately WITHOUT logging
    if (!isWithinGeofence) {
      return res.status(400).json({
        success: false,
        message: `You are not within the school's geofence area. Please move closer to the school and try again.`,
        data: {
          is_within_geofence: false,
          distance_from_school_m: Math.round(distanceFromSchool),
          geofence_radius_m: geofenceRadius,
          school_name: posting.school_name,
          hint: `You need to be within ${geofenceRadius}m of the school. Current distance: ${Math.round(distanceFromSchool)}m`,
        },
      });
    }

    // 5. Check for existing verified location for this posting
    const [existingVerified] = await query(
      `SELECT id FROM supervision_location_logs 
       WHERE supervisor_posting_id = ?`,
      [posting_id]
    );

    if (existingVerified) {
      return res.json({
        success: true,
        message: 'Location already verified for this posting',
        data: {
          already_verified: true,
          verified_at: posting.location_verified_at,
        },
      });
    }

    // 6. Anti-cheating: Check if device was used by another supervisor in same session
    const deviceHash = generateDeviceHash(req, device_info);

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

    let validationMessage = `Location verified. Distance from school: ${distanceFromSchool.toFixed(0)}m`;

    // Log if device shared but still allow (for audit purposes)
    if (deviceUsedByOthers.length > 0) {
      const otherNames = deviceUsedByOthers.map((s) => s.supervisor_name).join(', ');
      validationMessage += ` (Note: Device also used by ${otherNames} this session)`;
    }

    // 7. Calculate time drift for audit
    let timeDriftSeconds = null;
    if (timestamp_client) {
      try {
        const clientTime = new Date(timestamp_client);
        const serverTime = new Date();
        timeDriftSeconds = Math.round((serverTime - clientTime) / 1000);
      } catch {
        // Ignore invalid timestamp
      }
    }

    // 8. Create location log entry and update posting
    await transaction(async (conn) => {
      const [logResult] = await conn.execute(
        `INSERT INTO supervision_location_logs (
          institution_id, supervisor_posting_id, supervisor_id, session_id,
          institution_school_id, visit_number,
          latitude, longitude, accuracy_meters, altitude_meters,
          distance_from_school_m, geofence_radius_m, is_within_geofence,
          validation_message,
          device_id, device_info, ip_address, user_agent,
          session_token_hash, timestamp_client, time_drift_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          1, // is_within_geofence always true (we only log successes)
          validationMessage,
          deviceHash,
          device_info ? JSON.stringify(device_info) : null,
          req.ip || req.connection?.remoteAddress || null,
          req.headers['user-agent'] || null,
          crypto
            .createHash('sha256')
            .update(req.headers.authorization || '')
            .digest('hex')
            .substring(0, 64),
          timestamp_client || null,
          timeDriftSeconds,
        ]
      );

      const locationLogId = logResult.insertId;

      // Update posting to mark as verified
      await conn.execute(
        `UPDATE supervisor_postings 
         SET location_verified = 1, 
             location_verified_at = NOW(),
             location_log_id = ?
         WHERE id = ?`,
        [locationLogId, posting_id]
      );
    });

    res.json({
      success: true,
      message: validationMessage,
      data: {
        is_within_geofence: true,
        distance_from_school_m: Math.round(distanceFromSchool),
        geofence_radius_m: geofenceRadius,
        school_name: posting.school_name,
        device_shared: deviceUsedByOthers.length > 0,
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
      `SELECT sp.location_verified, sp.location_verified_at, ms.name as school_name
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
      sql += " AND sll.validation_message LIKE '%also used by%'";
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

    // Get total verifications
    const [stats] = await query(
      `SELECT 
         COUNT(*) as total_verifications,
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
         AND validation_message LIKE '%also used by%'`,
      params
    );

    res.json({
      success: true,
      data: {
        total_verifications: stats?.total_verifications || 0,
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
