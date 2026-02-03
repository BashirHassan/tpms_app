-- Migration: 035_supervisor_location_tracking.sql
-- Description: Add supervisor location tracking for geofenced visit verification
-- Created: January 24, 2026

-- =====================================================
-- Create supervision_location_logs table
-- =====================================================
-- This table records successful location verifications only.
-- Failed attempts (outside geofence) are not logged to reduce clutter.

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
  `is_within_geofence` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Always TRUE - we only log successful verifications',
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
  
  -- Anti-cheating: Photo evidence (optional future use)
  `selfie_url` varchar(500) DEFAULT NULL COMMENT 'Optional selfie photo for verification',
  `environment_photo_url` varchar(500) DEFAULT NULL COMMENT 'Optional photo of school environment',
  
  -- Audit
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX `idx_sll_posting` (`supervisor_posting_id`),
  INDEX `idx_sll_supervisor` (`supervisor_id`),
  INDEX `idx_sll_session` (`session_id`),
  INDEX `idx_sll_school_visit` (`institution_school_id`, `visit_number`),
  INDEX `idx_sll_device` (`device_id`, `session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tracks supervisor GPS location verification for each posting/visit';

-- =====================================================
-- Add location verification columns to supervisor_postings
-- =====================================================

-- Check if column exists before adding
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'supervisor_postings' 
    AND COLUMN_NAME = 'location_verified'
);

SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE `supervisor_postings`
    ADD COLUMN `location_verified` tinyint(1) NOT NULL DEFAULT 0 
      COMMENT ''TRUE if supervisor has verified location for this posting'' AFTER `accuracy`,
    ADD COLUMN `location_verified_at` timestamp NULL DEFAULT NULL 
      COMMENT ''When location was verified'' AFTER `location_verified`,
    ADD COLUMN `location_log_id` bigint(20) UNSIGNED DEFAULT NULL 
      COMMENT ''Reference to the accepted location log'' AFTER `location_verified_at`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for location verification queries (if not exists)
SET @index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'supervisor_postings' 
    AND INDEX_NAME = 'idx_sp_location_verified'
);

SET @sql = IF(@index_exists = 0, 
  'ALTER TABLE `supervisor_postings` ADD INDEX `idx_sp_location_verified` (`supervisor_id`, `session_id`, `location_verified`)',
  'SELECT ''Index already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Add feature toggle for supervisor location tracking
-- =====================================================

INSERT INTO `feature_toggles` 
  (`feature_key`, `name`, `description`, `is_enabled`, `is_premium`, `default_enabled`, `scope`, `module`, `created_at`)
SELECT 
  'supervisor_location_tracking', 
  'Supervisor Location Tracking', 
  'Require supervisors to verify their GPS location at school before uploading results. Uses geofencing to validate physical presence.',
  1, 0, 0, 'institution', 'supervision', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `feature_toggles` WHERE `feature_key` = 'supervisor_location_tracking'
);

-- =====================================================
-- Migration complete
-- =====================================================
