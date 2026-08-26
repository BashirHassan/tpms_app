-- Migration: 053_location_tracking_hardening.sql
-- Description: Harden supervisor location tracking - log failed/pending attempts,
--              add structured validation status, and support admin override workflow.
-- Created: August 25, 2026

-- =====================================================
-- Add validation_status and related columns to supervision_location_logs
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervision_location_logs'
    AND COLUMN_NAME = 'validation_status'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `supervision_location_logs`
    ADD COLUMN `validation_status` ENUM(''validated'',''pending'',''rejected'',''overridden'') NOT NULL DEFAULT ''validated''
      COMMENT ''validated=passed all checks, pending=soft-fail awaiting admin review, rejected=hard-fail, overridden=admin reviewed'' AFTER `validation_message`,
    ADD COLUMN `flag_reasons` JSON DEFAULT NULL
      COMMENT ''Structured list of reasons, e.g. ["shared_device","time_drift","low_accuracy","outside_geofence","session_device_mismatch"]'' AFTER `validation_status`,
    ADD COLUMN `jwt_session_id` VARCHAR(64) DEFAULT NULL
      COMMENT ''req.sessionId from the JWT - distinct from session_id (academic session FK)'' AFTER `session_token_hash`,
    ADD COLUMN `overridden_by` BIGINT(20) DEFAULT NULL
      COMMENT ''users.id of the admin who reviewed a pending/rejected log'' AFTER `environment_photo_url`,
    ADD COLUMN `overridden_at` TIMESTAMP NULL DEFAULT NULL AFTER `overridden_by`,
    ADD COLUMN `override_reason` VARCHAR(500) DEFAULT NULL AFTER `overridden_at`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill: existing rows were only ever written on success, so they are all 'validated'.
-- (Column default already covers this; explicit UPDATE is a no-op safety net if the default
-- above didn't apply for some reason on an older MySQL version.)
UPDATE `supervision_location_logs` SET `validation_status` = 'validated' WHERE `validation_status` IS NULL;

-- Foreign key for overridden_by (best-effort; skip if it already exists)
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervision_location_logs'
    AND CONSTRAINT_NAME = 'fk_sll_overridden_by'
);

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `supervision_location_logs`
    ADD CONSTRAINT `fk_sll_overridden_by` FOREIGN KEY (`overridden_by`) REFERENCES `users`(`id`) ON DELETE SET NULL',
  'SELECT ''FK already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Indexes
-- =====================================================

SET @index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervision_location_logs'
    AND INDEX_NAME = 'idx_sll_status'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE `supervision_location_logs` ADD INDEX `idx_sll_status` (`validation_status`)',
  'SELECT ''Index already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervision_location_logs'
    AND INDEX_NAME = 'idx_sll_device_jwt'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE `supervision_location_logs` ADD INDEX `idx_sll_device_jwt` (`device_id`, `jwt_session_id`)',
  'SELECT ''Index already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update the stale "always true" comment on is_within_geofence now that failed
-- attempts are logged too (comment-only change, safe to run unconditionally).
ALTER TABLE `supervision_location_logs`
  MODIFY COLUMN `is_within_geofence` tinyint(1) NOT NULL DEFAULT 1
    COMMENT 'Real computed value - failed/rejected attempts are now logged too';

-- =====================================================
-- Migration complete
-- =====================================================
