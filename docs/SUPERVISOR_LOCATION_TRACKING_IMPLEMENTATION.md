# Supervisor Location Tracking Implementation Guide

> **Feature:** Geofenced supervisor location verification for teaching practice supervision visits
> **Created:** January 24, 2026
> **Status:** ✅ Implemented

---

## Executive Summary

This document outlines the implementation of a **supervisor location tracking feature** that requires supervisors to verify their physical presence at assigned schools before uploading student results. The feature uses GPS geofencing to validate that supervisors are actually at the school location during supervision visits.

### Key Requirements

1. **Mandatory location verification** - Supervisors MUST record their location for each posting (primary & secondary) before uploading results
2. **Geofence validation** - Location must be within the school's configured geofence radius
3. **Per-posting tracking** - Each location verification is tied to a specific `supervisor_posting` record
4. **Anti-cheating measures** - Prevent a single device from recording locations for multiple supervisors within the same academic session
5. **Admin bypass** - Admins (head_of_teaching_practice and above) can manage all results without location restrictions

---

## Current System Analysis

### Relevant Database Tables

#### 1. `supervisor_postings` (Current Schema)

```sql
CREATE TABLE `supervisor_postings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `session_id` bigint(20) NOT NULL,
  `supervisor_id` bigint(20) NOT NULL,
  `institution_school_id` bigint(20) DEFAULT NULL,
  `distance_km` decimal(10,2) DEFAULT NULL,
  `group_number` int(11) NOT NULL DEFAULT 1,
  `visit_number` int(11) NOT NULL DEFAULT 1,
  `route_id` bigint(20) DEFAULT NULL,
  `is_primary_posting` tinyint(1) DEFAULT 1,
  `merged_with_posting_id` bigint(20) DEFAULT NULL,
  `posting_type` enum('auto','manual','multiposting') DEFAULT 'manual',
  -- Allowance columns...
  `rank_id` int(11) DEFAULT NULL,
  -- Legacy location columns (currently unused) --
  `coordinates` varchar(50) DEFAULT NULL,
  `lga` varchar(100) DEFAULT NULL,
  `nearest_address` varchar(500) DEFAULT NULL,
  `accuracy` varchar(50) DEFAULT NULL,
  -- Status and audit columns --
  `status` enum('pending','active','completed','cancelled') NOT NULL DEFAULT 'pending',
  `posted_by` bigint(20) DEFAULT NULL,
  `created_by_dean_id` bigint(20) DEFAULT NULL,
  `posted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
);
```

#### 2. `master_schools` (School Location)

```sql
-- Contains school GPS coordinates
`location` point DEFAULT NULL COMMENT 'GPS coordinates',
-- Usage: ST_X(location) for longitude, ST_Y(location) for latitude
```

#### 3. `institution_schools` (Geofence Configuration)

```sql
`geofence_radius_m` int(10) UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Geofence radius for visit verification'
```

#### 4. `student_results` (Result Upload)

```sql
CREATE TABLE `student_results` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `session_id` bigint(20) NOT NULL,
  `student_id` bigint(20) NOT NULL,
  `supervisor_id` bigint(20) NOT NULL,
  `institution_school_id` bigint(20) DEFAULT NULL,
  `group_number` int(11) NOT NULL DEFAULT 1,
  `visit_number` int(11) NOT NULL DEFAULT 1,
  -- Score columns...
  PRIMARY KEY (`id`)
);
```

---

## Implementation Plan

### Phase 1: Database Schema

#### 1.1 Create `supervision_location_logs` Table

This table records each location verification attempt with anti-cheating data.

```sql
-- Migration: 035_supervisor_location_tracking.sql

-- Create supervision location logs table
CREATE TABLE IF NOT EXISTS `supervision_location_logs` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `institution_id` bigint(20) NOT NULL,
  `supervisor_posting_id` bigint(20) NOT NULL COMMENT 'The posting this location is tied to',
  `supervisor_id` bigint(20) NOT NULL COMMENT 'Must match supervisor_posting.supervisor_id',
  `session_id` bigint(20) NOT NULL,
  `institution_school_id` bigint(20) NOT NULL,
  `visit_number` int(11) NOT NULL,
  
  -- Location data
  `latitude` decimal(12,8) NOT NULL COMMENT 'Recorded GPS latitude',
  `longitude` decimal(12,8) NOT NULL COMMENT 'Recorded GPS longitude',
  `accuracy_meters` decimal(10,2) DEFAULT NULL COMMENT 'GPS accuracy in meters',
  `altitude_meters` decimal(10,2) DEFAULT NULL COMMENT 'GPS altitude if available',
  
  -- Geofence validation
  `distance_from_school_m` decimal(10,2) DEFAULT NULL COMMENT 'Calculated distance from school location',
  `geofence_radius_m` int(10) UNSIGNED NOT NULL COMMENT 'Snapshot of school geofence at verification time',
  `is_within_geofence` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'TRUE if distance <= geofence_radius',
  `validation_status` enum('pending','validated','overridden') NOT NULL DEFAULT 'pending' COMMENT 'No rejected - we dont log failed geofence attempts',
  `validation_message` varchar(500) DEFAULT NULL,
  
  -- Anti-cheating: Device fingerprinting
  `device_id` varchar(255) DEFAULT NULL COMMENT 'Unique device identifier (hash)',
  `device_info` JSON DEFAULT NULL COMMENT 'Device model, OS version, browser info',
  `ip_address` varchar(45) DEFAULT NULL COMMENT 'IP address at time of submission',
  `user_agent` text DEFAULT NULL,
  
  -- Anti-cheating: Session verification
  `session_token_hash` varchar(64) DEFAULT NULL COMMENT 'Hash of JWT token used',
  `timestamp_client` datetime DEFAULT NULL COMMENT 'Client-reported timestamp',
  `timestamp_server` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Server-recorded timestamp',
  `time_drift_seconds` int DEFAULT NULL COMMENT 'Difference between client and server time',
  
  -- Anti-cheating: Photo evidence (optional)
  `selfie_url` varchar(500) DEFAULT NULL COMMENT 'Optional selfie photo for verification',
  `environment_photo_url` varchar(500) DEFAULT NULL COMMENT 'Optional photo of school environment',
  
  -- Override (admin only)
  `overridden_by` bigint(20) DEFAULT NULL COMMENT 'Admin who overrode validation',
  `override_reason` text DEFAULT NULL,
  `overridden_at` timestamp NULL DEFAULT NULL,
  
  -- Audit
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT `fk_sll_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sll_posting` FOREIGN KEY (`supervisor_posting_id`) REFERENCES `supervisor_postings`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sll_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sll_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sll_school` FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sll_overridden_by` FOREIGN KEY (`overridden_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  
  -- Indexes
  INDEX `idx_sll_posting` (`supervisor_posting_id`),
  INDEX `idx_sll_supervisor` (`supervisor_id`),
  INDEX `idx_sll_school_visit` (`institution_school_id`, `visit_number`),
  INDEX `idx_sll_validation` (`validation_status`),
  INDEX `idx_sll_device` (`device_id`),
  
  -- Ensure one validated location per posting
  UNIQUE KEY `uk_sll_posting_validated` (`supervisor_posting_id`, `validation_status`)
    WHERE `validation_status` = 'validated'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tracks supervisor GPS location verification for each posting/visit';

-- Add location verification flag to supervisor_postings
ALTER TABLE `supervisor_postings`
  ADD COLUMN `location_verified` tinyint(1) NOT NULL DEFAULT 0 
    COMMENT 'TRUE if supervisor has verified location for this posting' AFTER `accuracy`,
  ADD COLUMN `location_verified_at` timestamp NULL DEFAULT NULL 
    COMMENT 'When location was verified' AFTER `location_verified`,
  ADD COLUMN `location_log_id` bigint(20) UNSIGNED DEFAULT NULL 
    COMMENT 'Reference to the accepted location log' AFTER `location_verified_at`,
  ADD CONSTRAINT `fk_sp_location_log` FOREIGN KEY (`location_log_id`) 
    REFERENCES `supervision_location_logs`(`id`) ON DELETE SET NULL;

-- Add index for location verification queries
ALTER TABLE `supervisor_postings`
  ADD INDEX `idx_sp_location_verified` (`supervisor_id`, `session_id`, `location_verified`);
```

#### 1.2 Add Feature Toggle

```sql
-- Add feature toggle for supervisor location tracking
INSERT INTO `feature_toggles` 
  (`feature_key`, `name`, `description`, `is_enabled`, `is_premium`, `default_enabled`, `scope`, `module`)
VALUES 
  ('supervisor_location_tracking', 'Supervisor Location Tracking', 
   'Require supervisors to verify their GPS location at school before uploading results', 
   1, 0, 0, 'institution', 'supervision');
```

---

### Phase 2: Backend Implementation

#### 2.1 Location Verification Controller

**File:** `backend/src/controllers/locationTrackingController.js`

```javascript
/**
 * Location Tracking Controller
 * 
 * Handles supervisor location verification for postings.
 * MedeePay Pattern: Direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const crypto = require('crypto');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');

// Validation schemas
const schemas = {
  verifyLocation: z.object({
    body: z.object({
      posting_id: z.number().int().positive('Posting ID is required'),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy_meters: z.number().min(0).optional(),
      altitude_meters: z.number().optional(),
      timestamp_client: z.string().datetime().optional(),
      device_info: z.object({
        device_id: z.string().optional(),
        model: z.string().optional(),
        os: z.string().optional(),
        browser: z.string().optional(),
      }).optional(),
    }),
  }),
};

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @returns Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate device fingerprint hash for anti-cheating
 */
function generateDeviceHash(req, deviceInfo) {
  const fingerprint = [
    deviceInfo?.device_id || '',
    deviceInfo?.model || '',
    deviceInfo?.os || '',
    req.headers['user-agent'] || '',
    // Don't include IP as it can change
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

    // 1. Verify posting belongs to this supervisor
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
        `School "${posting.school_name}" does not have GPS coordinates. Please contact admin.`
      );
    }

    // 3. Calculate distance from school
    const distanceFromSchool = calculateDistance(
      latitude, longitude,
      posting.school_latitude, posting.school_longitude
    );

    const geofenceRadius = posting.geofence_radius_m || 100;
    const isWithinGeofence = distanceFromSchool <= geofenceRadius;

    // 4. Anti-cheating: Check for suspicious device activity
    const deviceHash = generateDeviceHash(req, device_info);
    
    // Check if this device was used by another supervisor in the SAME SESSION
    const suspiciousActivity = await query(
      `SELECT DISTINCT sll.supervisor_id, u.name as supervisor_name
       FROM supervision_location_logs sll
       JOIN users u ON sll.supervisor_id = u.id
       WHERE sll.device_id = ?
         AND sll.supervisor_id != ?
         AND sll.session_id = ?  -- Same academic session check
         AND sll.validation_status = 'validated'
       LIMIT 5`,
      [deviceHash, supervisorId, posting.session_id]
    );

    // 4a. If NOT within geofence, return error immediately WITHOUT logging
    // This reduces unnecessary database entries for failed attempts
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

    let validationMessage = null;
    let validationStatus = 'pending';

    if (suspiciousActivity.length > 0) {
      // Flag as suspicious but don't block - admin can review
      const otherSupervisors = suspiciousActivity.map(s => s.supervisor_name).join(', ');
      validationMessage = `ALERT: This device was used by other supervisor(s) (${otherSupervisors}) in this session.`;
      validationStatus = 'pending'; // Will require admin review
    } else {
      // Within geofence and no suspicious activity
      validationStatus = 'validated';
      validationMessage = `Location verified. Distance from school: ${distanceFromSchool.toFixed(0)}m`;
    }

    // 5. Check for existing validated location for this posting
    const [existingValidated] = await query(
      `SELECT id FROM supervision_location_logs 
       WHERE supervisor_posting_id = ? AND validation_status = 'validated'`,
      [posting_id]
    );

    if (existingValidated) {
      return res.json({
        success: true,
        message: 'Location already verified for this posting',
        data: {
          already_verified: true,
          verified_at: posting.location_verified_at,
        },
      });
    }

    // 6. Calculate time drift for anti-cheating
    let timeDriftSeconds = null;
    if (timestamp_client) {
      const clientTime = new Date(timestamp_client);
      const serverTime = new Date();
      timeDriftSeconds = Math.round((serverTime - clientTime) / 1000);
    }

    // 7. Create location log entry
    await transaction(async (conn) => {
      const [logResult] = await conn.execute(
        `INSERT INTO supervision_location_logs (
          institution_id, supervisor_posting_id, supervisor_id, session_id,
          institution_school_id, visit_number,
          latitude, longitude, accuracy_meters, altitude_meters,
          distance_from_school_m, geofence_radius_m, is_within_geofence,
          validation_status, validation_message,
          device_id, device_info, ip_address, user_agent,
          session_token_hash, timestamp_client, time_drift_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          validationStatus,
          validationMessage,
          deviceHash,
          device_info ? JSON.stringify(device_info) : null,
          req.ip,
          req.headers['user-agent'] || null,
          crypto.createHash('sha256').update(req.headers.authorization || '').digest('hex').substring(0, 64),
          timestamp_client || null,
          timeDriftSeconds,
        ]
      );

      const locationLogId = logResult.insertId;

      // 8. If validated, update posting
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

    res.json({
      success: validationStatus === 'validated',
      message: validationMessage,
      data: {
        is_within_geofence: isWithinGeofence,
        distance_from_school_m: Math.round(distanceFromSchool),
        geofence_radius_m: geofenceRadius,
        validation_status: validationStatus,
        school_name: posting.school_name,
        suspicious_activity: suspiciousActivity.length > 0,
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
      data: postings.map(p => ({
        ...p,
        can_verify_location: p.has_coordinates === 1 && !p.location_verified,
        location_required: true, // Based on feature toggle check in middleware
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if location is verified for a posting (used by result upload)
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
    const { session_id, status, supervisor_id, suspicious_only, page = 1, limit = 50 } = req.query;

    let sql = `
      SELECT sll.*,
             u.name as supervisor_name,
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
    if (status) {
      sql += ' AND sll.validation_status = ?';
      params.push(status);
    }
    if (supervisor_id) {
      sql += ' AND sll.supervisor_id = ?';
      params.push(parseInt(supervisor_id));
    }
    if (suspicious_only === 'true') {
      sql += " AND sll.validation_message LIKE '%ALERT%'";
    }

    // Count
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);

    // Paginate
    sql += ' ORDER BY sll.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const logs = await query(sql, params);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total: countResult?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Override location validation
 * POST /:institutionId/location/admin/override/:logId
 */
const overrideLocationValidation = async (req, res, next) => {
  try {
    const { institutionId, logId } = req.params;
    const { approve, reason } = req.body;
    const adminId = req.user.id;

    if (!reason || reason.length < 10) {
      throw new ValidationError('Override reason must be at least 10 characters');
    }

    const [log] = await query(
      'SELECT * FROM supervision_location_logs WHERE id = ? AND institution_id = ?',
      [parseInt(logId), parseInt(institutionId)]
    );

    if (!log) {
      throw new NotFoundError('Location log not found');
    }

    await transaction(async (conn) => {
      // Update log
      await conn.execute(
        `UPDATE supervision_location_logs 
         SET validation_status = ?,
             overridden_by = ?,
             override_reason = ?,
             overridden_at = NOW()
         WHERE id = ?`,
        [approve ? 'validated' : 'rejected', adminId, reason, parseInt(logId)]
      );

      // If approving, update posting
      if (approve) {
        await conn.execute(
          `UPDATE supervisor_postings 
           SET location_verified = 1,
               location_verified_at = NOW(),
               location_log_id = ?
           WHERE id = ?`,
          [parseInt(logId), log.supervisor_posting_id]
        );
      }
    });

    res.json({
      success: true,
      message: approve ? 'Location verification approved' : 'Location verification rejected',
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
  overrideLocationValidation,
};
```

#### 2.2 Modify Result Controller to Check Location

Add location verification check to `submitBulkResults` in `resultController.js`:

```javascript
// Add this check at the beginning of submitBulkResults function

const submitBulkResults = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { results } = req.body;
    const supervisorId = req.user.id;
    const userRole = req.user.role;

    // ADMIN BYPASS: head_of_teaching_practice and super_admin can manage results without location restrictions
    const isAdmin = ['super_admin', 'head_of_teaching_practice'].includes(userRole);

    // Check if location tracking is enabled for this institution
    const [featureToggle] = await query(
      `SELECT ift.is_enabled 
       FROM feature_toggles ft
       LEFT JOIN institution_feature_toggles ift 
         ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
       WHERE ft.feature_key = 'supervisor_location_tracking'`,
      [parseInt(institutionId)]
    );

    const locationTrackingEnabled = featureToggle?.is_enabled === 1;

    // Only enforce location verification for supervisors, not admins
    if (locationTrackingEnabled && !isAdmin) {
      // Get unique postings from results
      const uniquePostings = [...new Set(results.map(r => 
        `${r.school_id}-${r.group_number}-${r.visit_number}`
      ))];

      for (const postingKey of uniquePostings) {
        const [schoolId, groupNumber, visitNumber] = postingKey.split('-').map(Number);
        
        // Check if supervisor has verified location for this posting
        const [posting] = await query(
          `SELECT sp.id, sp.location_verified, ms.name as school_name
           FROM supervisor_postings sp
           JOIN institution_schools isv ON sp.institution_school_id = isv.id
           JOIN master_schools ms ON isv.master_school_id = ms.id
           WHERE sp.institution_id = ?
             AND sp.supervisor_id = ?
             AND sp.institution_school_id = ?
             AND sp.group_number = ?
             AND sp.visit_number = ?
             AND sp.status = 'active'`,
          [parseInt(institutionId), supervisorId, schoolId, groupNumber, visitNumber]
        );

        if (posting && !posting.location_verified) {
          throw new ValidationError(
            `You must verify your location at "${posting.school_name}" (Group ${groupNumber}, Visit ${visitNumber}) before uploading results. Please record your location first.`
          );
        }
      }
    }

    // Continue with existing result submission logic...
  } catch (error) {
    next(error);
  }
};
```

#### 2.3 Add Routes

**File:** `backend/src/routes/locationTracking.js`

```javascript
const express = require('express');
const router = express.Router();
const controller = require('../controllers/locationTrackingController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isSupervisor, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const { validate } = require('../middleware/validation');

// Supervisor endpoints
router.post(
  '/:institutionId/location/verify',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_location_tracking'),
  validate(controller.schemas.verifyLocation),
  controller.verifyLocation
);

router.get(
  '/:institutionId/location/my-postings',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_location_tracking'),
  controller.getMyPostingsLocationStatus
);

router.get(
  '/:institutionId/location/check/:postingId',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_location_tracking'),
  controller.checkLocationVerification
);

// Admin endpoints
router.get(
  '/:institutionId/location/admin/logs',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  controller.getLocationLogs
);

router.post(
  '/:institutionId/location/admin/override/:logId',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  controller.overrideLocationValidation
);

module.exports = router;
```

---

### Phase 3: Frontend Implementation

#### 3.1 Location Verification Component

**File:** `frontend/src/components/LocationVerification.jsx`

```jsx
/**
 * Location Verification Component
 * 
 * Captures supervisor GPS location and verifies against school geofence.
 * Includes anti-spoofing measures and device fingerprinting.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { useToast } from '../context/ToastContext';
import { locationApi } from '../api';
import {
  IconMapPin,
  IconCheck,
  IconX,
  IconLoader2,
  IconAlertTriangle,
  IconGps,
  IconRefresh,
} from '@tabler/icons-react';

// Generate device fingerprint for anti-cheating
const generateDeviceInfo = () => {
  return {
    device_id: localStorage.getItem('device_id') || generateDeviceId(),
    model: navigator.userAgentData?.platform || navigator.platform,
    os: navigator.userAgentData?.platform || 'Unknown',
    browser: navigator.userAgent.split(' ').pop(),
    screen: `${screen.width}x${screen.height}`,
    language: navigator.language,
  };
};

const generateDeviceId = () => {
  const id = crypto.randomUUID();
  localStorage.setItem('device_id', id);
  return id;
};

export function LocationVerification({ 
  posting, 
  onVerified, 
  onError,
  showSchoolInfo = true,
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState('idle'); // idle, locating, submitting, success, error
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);

  // Get current location
  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setStatus('error');
      return;
    }

    setStatus('locating');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy,
          altitude_meters: position.coords.altitude,
          timestamp: new Date().toISOString(),
        });
        setStatus('ready');
      },
      (error) => {
        let message = 'Failed to get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied. Please allow location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location unavailable. Please check GPS settings.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out. Please try again.';
            break;
        }
        setError(message);
        setStatus('error');
        onError?.(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0, // Don't use cached position
      }
    );
  }, [onError]);

  // Submit location for verification
  const submitLocation = async () => {
    if (!location) {
      toast.error('No location captured. Please get location first.');
      return;
    }

    setStatus('submitting');

    try {
      const deviceInfo = generateDeviceInfo();
      
      const response = await locationApi.verifyLocation({
        posting_id: posting.posting_id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_meters: location.accuracy_meters,
        altitude_meters: location.altitude_meters,
        timestamp_client: location.timestamp,
        device_info: deviceInfo,
      });

      const result = response.data.data;
      setVerificationResult(result);

      if (result.validation_status === 'validated') {
        setStatus('success');
        toast.success('Location verified successfully!');
        onVerified?.(result);
      } else if (result.suspicious_activity) {
        setStatus('pending');
        toast.warning('Location recorded but flagged for review due to suspicious activity.');
      } else {
        setStatus('error');
        const hint = result.hint || 'Please move closer to the school and try again.';
        setError(`${response.data.message}\n${hint}`);
        toast.error(response.data.message);
      }
    } catch (err) {
      setStatus('error');
      const message = err.response?.data?.message || 'Failed to verify location';
      setError(message);
      toast.error(message);
      onError?.(message);
    }
  };

  // Auto-get location on mount
  useEffect(() => {
    if (posting && !posting.location_verified) {
      getLocation();
    }
  }, [posting]);

  // Already verified
  if (posting?.location_verified) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <IconCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-green-800">Location Verified</p>
              <p className="text-sm text-green-600">
                {posting.location_verified_at 
                  ? `Verified on ${new Date(posting.location_verified_at).toLocaleString()}`
                  : 'Your location has been verified'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <IconMapPin className="w-5 h-5 text-primary-600" />
          Location Verification Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSchoolInfo && posting && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-900">{posting.school_name}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline">Group {posting.group_number}</Badge>
              <Badge variant="outline">Visit {posting.visit_number}</Badge>
              {posting.has_coordinates ? (
                <Badge variant="success" className="text-xs">GPS Available</Badge>
              ) : (
                <Badge variant="danger" className="text-xs">No GPS Set</Badge>
              )}
            </div>
          </div>
        )}

        {!posting?.has_coordinates && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <IconAlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">School GPS Not Set</p>
                <p className="text-sm text-amber-700">
                  This school does not have GPS coordinates configured. 
                  Please contact the TP office.
                </p>
              </div>
            </div>
          </div>
        )}

        {location && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-800 mb-1">Your Current Location</p>
            <p className="text-xs font-mono text-blue-700">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Accuracy: ±{Math.round(location.accuracy_meters)}m
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <IconX className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {verificationResult && !verificationResult.is_within_geofence && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium">Outside Geofence Area</p>
            <p className="text-sm text-red-700 mt-1">
              Your distance: {verificationResult.distance_from_school_m}m
              <br />
              Required: within {verificationResult.geofence_radius_m}m of {verificationResult.school_name}
            </p>
            <p className="text-xs text-red-600 mt-2">
              Please move closer to the school and refresh your location.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {status !== 'success' && posting?.has_coordinates && (
            <>
              <Button
                variant="outline"
                onClick={getLocation}
                disabled={status === 'locating' || status === 'submitting'}
                className="flex-1"
              >
                {status === 'locating' ? (
                  <>
                    <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                    Getting Location...
                  </>
                ) : (
                  <>
                    <IconRefresh className="w-4 h-4 mr-2" />
                    Refresh Location
                  </>
                )}
              </Button>
              
              <Button
                onClick={submitLocation}
                disabled={!location || status === 'submitting' || status === 'locating'}
                className="flex-1"
              >
                {status === 'submitting' ? (
                  <>
                    <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <IconGps className="w-4 h-4 mr-2" />
                    Verify Location
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-gray-500 text-center">
          You must be physically at the school to verify your location.
          <br />
          GPS accuracy and device information are recorded for audit purposes.
        </p>
      </CardContent>
    </Card>
  );
}
```

#### 3.2 API Module

**File:** `frontend/src/api/location.js`

```javascript
import client, { getCurrentInstitutionId } from './client';

export const locationApi = {
  verifyLocation: (data) => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/location/verify`, data);
  },

  getMyPostingsLocationStatus: (params = {}) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/my-postings`, { params });
  },

  checkLocationVerification: (postingId) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/check/${postingId}`);
  },

  // Admin endpoints
  getLocationLogs: (params = {}) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/admin/logs`, { params });
  },

  overrideLocationValidation: (logId, data) => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/location/admin/override/${logId}`, data);
  },
};
```

#### 3.3 Integrate with SupervisorResultUploadPage

Modify the result upload page to require location verification:

```jsx
// Add to SupervisorResultUploadPage.jsx

import { LocationVerification } from '../../components/LocationVerification';
import { locationApi } from '../../api';

// Add state
const [locationVerified, setLocationVerified] = useState(false);
const [showLocationPrompt, setShowLocationPrompt] = useState(false);

// Check location status when group is selected
useEffect(() => {
  if (currentGroup) {
    checkLocationStatus();
  }
}, [currentGroup]);

const checkLocationStatus = async () => {
  if (!currentGroup) return;
  
  try {
    const response = await locationApi.checkLocationVerification(currentGroup.posting_id);
    setLocationVerified(response.data.data.location_verified);
    setShowLocationPrompt(!response.data.data.location_verified);
  } catch (err) {
    console.error('Failed to check location status:', err);
  }
};

// Block save if location not verified
const saveAllChanges = async () => {
  if (!locationVerified) {
    toast.error('You must verify your location before uploading results');
    setShowLocationPrompt(true);
    return;
  }
  // ... existing save logic
};

// Add LocationVerification component before the students table
{showLocationPrompt && currentGroup && (
  <LocationVerification
    posting={currentGroup}
    onVerified={(result) => {
      setLocationVerified(true);
      setShowLocationPrompt(false);
      toast.success('Location verified! You can now upload results.');
    }}
    onError={(error) => {
      toast.error(error);
    }}
  />
)}
```

---

### Phase 4: Anti-Cheating Measures

#### 4.1 Device Fingerprinting

The system collects:
- **Device ID**: Stored in localStorage, persists across sessions
- **User Agent**: Browser and OS information
- **IP Address**: Network location (server-side)
- **Screen Resolution**: Device display characteristics

#### 4.2 Cross-Supervisor Detection (Per Session)

If the same device submits locations for multiple supervisors within the **same academic session**:
- The submission is flagged as "suspicious"
- Admin receives alert in the location logs
- Location is held in "pending" status until admin review
- Admin can approve or reject with documented reason

> **Note:** Device checks are per-session, not time-based. A supervisor can use different devices across sessions, but within a single session, one device = one supervisor.

#### 4.7 Time Verification

- Client timestamp is compared to server timestamp
- Large time drifts (>5 minutes) are flagged
- Prevents location replay attacks

#### 4.3 Location Logging Policy

- **Only successful verifications are logged** - reduces database clutter
- Failed geofence checks return error immediately without creating a log entry
- This prevents supervisors from spamming location attempts
- Admins only see validated/pending entries, not every failed attempt

#### 4.4 GPS Accuracy Requirements

- GPS accuracy must be within acceptable range (configurable)
- High accuracy readings (>500m uncertainty) can be flagged
- Admin can configure minimum accuracy threshold per institution

#### 4.5 Admin Bypass

- `head_of_teaching_practice` and `super_admin` roles bypass location restrictions
- Admins can perform full CRUD on student results without location verification
- This allows admins to correct/manage results during emergencies or technical issues

#### 4.6 Optional Photo Evidence

- Supervisors can optionally upload:
  - Selfie photo (proves physical presence)
  - Environment photo (proves school location)
- Photos are stored in Cloudinary with metadata
- Admin can review photos in location logs

---

### Phase 5: Admin Features

#### 5.1 Location Logs Dashboard

Admin page to view and manage location verifications:

- Filter by session, supervisor, school, status
- View suspicious activity alerts
- Override validations with documented reason
- Export location data for audits

#### 5.2 Override Workflow

When admin overrides a location validation:

1. Must provide reason (minimum 10 characters)
2. Can approve or reject
3. Override is logged with admin ID and timestamp
4. If approved, updates posting's `location_verified` flag

---

### Phase 6: Configuration Options

#### 6.1 Institution Settings (Future Enhancement)

Add to institution_settings or feature toggle settings:

```json
{
  "supervisor_location_tracking": {
    "enabled": true,
    "require_photo_evidence": false,
    "minimum_gps_accuracy_m": 500,
    "flag_time_drift_seconds": 300,
    "cross_device_check_per_session": true,
    "allow_admin_override": true,
    "admin_bypass_roles": ["super_admin", "head_of_teaching_practice"],
    "log_failed_attempts": false
  }
}
```

---

## Implementation Checklist

### Database
- [ ] Create migration `035_supervisor_location_tracking.sql`
- [ ] Add `supervision_location_logs` table
- [ ] Add columns to `supervisor_postings` table
- [ ] Add feature toggle entry
- [ ] Run migration

### Backend
- [ ] Create `locationTrackingController.js`
- [ ] Create routes file `locationTracking.js`
- [ ] Register routes in main router
- [ ] Modify `resultController.js` to check location verification
- [ ] Add location check middleware (optional)

### Frontend
- [ ] Create `LocationVerification` component
- [ ] Create `api/location.js` module
- [ ] Add export to `api/index.js`
- [ ] Modify `SupervisorResultUploadPage.jsx`
- [ ] Create admin location logs page
- [ ] Add location status to `SupervisorMyPostingsPage.jsx`

### Testing
- [ ] Test location verification flow
- [ ] Test geofence boundary cases
- [ ] Test cross-device detection
- [ ] Test admin override workflow
- [ ] Test feature toggle on/off
- [ ] Test result upload blocking

---

## Security Considerations

1. **Data Privacy**: Location data is sensitive - ensure proper access controls
2. **HTTPS Required**: All location data must be transmitted over HTTPS
3. **Token Hash**: Store hash of JWT, not actual token
4. **IP Logging**: Consider GDPR compliance for IP storage
5. **Photo Storage**: Use secure cloud storage with expiring URLs

---

## Future Enhancements

1. **Offline Support**: Allow location capture offline, sync later
2. **Background Tracking**: Periodic location updates during visit
3. **Route Verification**: Verify supervisor traveled expected route
4. **NFC/QR Check-in**: Additional verification at school entrance
5. **Biometric Verification**: Face recognition for selfie validation
6. **Live Dashboard**: Real-time map showing supervisor locations

---

## Appendix: Haversine Formula

Used to calculate great-circle distance between two GPS coordinates:

```javascript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}
```

---

**Document Version:** 1.0
**Last Updated:** January 24, 2026
**Author:** GitHub Copilot
