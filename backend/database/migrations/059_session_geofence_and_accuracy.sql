-- Migration: 059_session_geofence_and_accuracy.sql
-- Description: Centralize the supervisor check-in geofence radius and GPS
--              accuracy threshold from per-school (institution_schools) to
--              per-session (academic_sessions) settings - one radius/threshold
--              for the whole session instead of per-school customization.
--
--              supervisor_gps_accuracy_m is a NEW, distinctly-named column -
--              NOT a reuse of the existing academic_sessions.max_gps_accuracy_meters
--              (migration 049), which is a separate, advisory-only setting for
--              the unrelated student "propose corrected school GPS" flow.
--
--              institution_schools.geofence_radius_m is dropped - confirmed
--              unused outside the supervisor check-in flow and its own CRUD/UI.
-- Created: September 3, 2026

-- =====================================================
-- New session-level settings
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'academic_sessions'
    AND COLUMN_NAME = 'geofence_radius_m'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `academic_sessions`
    ADD COLUMN `geofence_radius_m` INT UNSIGNED NOT NULL DEFAULT 100
      COMMENT ''Session-wide geofence radius (metres) for supervisor location check-in, replacing the old per-school institution_schools.geofence_radius_m'' AFTER `max_supervision_visits`,
    ADD COLUMN `supervisor_gps_accuracy_m` INT UNSIGNED NOT NULL DEFAULT 100
      COMMENT ''Max acceptable GPS accuracy (metres) for supervisor location check-in - hard-fail threshold. Distinct from max_gps_accuracy_meters, which is advisory-only for the student propose-location flow.'' AFTER `geofence_radius_m`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Retire the per-school geofence radius
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'institution_schools'
    AND COLUMN_NAME = 'geofence_radius_m'
);

SET @sql = IF(@column_exists > 0,
  'ALTER TABLE `institution_schools` DROP COLUMN `geofence_radius_m`',
  'SELECT ''Column already dropped'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
