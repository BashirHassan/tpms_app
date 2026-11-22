-- Migration: 077_school_capture_master_schools.sql
-- Description: Let school data capture work on MASTER schools, not only on the
--              schools an institution has linked.
--
--              A location/principal captured for a master school is shared by every
--              institution, so the Head of TP can assign supervisors to ANY school in
--              the master registry - including ones not linked to the institution yet.
--              Once approved, the school never needs capturing again, even after it is
--              linked later.
--
--                * school_capture_assignments: keyed by master_school_id (institution
--                  link is looked up live and may not exist); one live capturer per
--                  master school per session
--                * location / principal requests: carry master_school_id so a request
--                  can exist, and be approved, without an institution link; one pending
--                  request per master school per session
-- Created: November 22, 2026

-- =====================================================
-- Assignments -> master school
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_capture_assignments'
    AND COLUMN_NAME = 'master_school_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_capture_assignments`
    ADD COLUMN `master_school_id` BIGINT NULL
      COMMENT ''master_schools.id - the school being captured; the institution link (if any) is resolved live'' AFTER `supervisor_id`,
    MODIFY COLUMN `institution_school_id` BIGINT NULL
      COMMENT ''Legacy: institution link at assignment time. Not authoritative - use master_school_id''',
  'SELECT ''Assignment master_school_id already exists''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `school_capture_assignments` a
JOIN `institution_schools` isv ON isv.id = a.institution_school_id
SET a.master_school_id = isv.master_school_id
WHERE a.master_school_id IS NULL;

-- Rebuild the one-live-capturer-per-school key on the master school
SET @needs_rekey = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_capture_assignments'
    AND COLUMN_NAME = 'active_unique_key'
    AND GENERATION_EXPRESSION NOT LIKE '%master_school_id%'
);

SET @sql = IF(@needs_rekey > 0,
  'ALTER TABLE `school_capture_assignments`
    DROP INDEX `uq_capture_assignments_active`,
    DROP COLUMN `active_unique_key`,
    MODIFY COLUMN `master_school_id` BIGINT NOT NULL
      COMMENT ''master_schools.id - the school being captured; the institution link (if any) is resolved live'',
    ADD COLUMN `active_unique_key` VARCHAR(60) GENERATED ALWAYS AS (
      CASE WHEN `status` = ''active'' THEN CONCAT(`master_school_id`, ''-'', `session_id`) ELSE NULL END
    ) STORED,
    ADD UNIQUE KEY `uq_capture_assignments_active` (`active_unique_key`),
    ADD KEY `idx_capture_assignments_master` (`master_school_id`)',
  'SELECT ''Assignment unique key already on master_school_id''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Requests -> master school
-- =====================================================

-- Location requests
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND COLUMN_NAME = 'master_school_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD COLUMN `master_school_id` BIGINT NULL
      COMMENT ''master_schools.id this request is about; set even when the institution has no link to the school'' AFTER `institution_school_id`,
    ADD KEY `idx_location_requests_master` (`master_school_id`)',
  'SELECT ''Location request master_school_id already exists''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `school_location_update_requests` r
JOIN `institution_schools` isv ON isv.id = r.institution_school_id
SET r.master_school_id = isv.master_school_id
WHERE r.master_school_id IS NULL;

SET @key_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND INDEX_NAME = 'uq_location_requests_pending_master'
);

SET @sql = IF(@key_exists = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD COLUMN `pending_master_key` VARCHAR(60) GENERATED ALWAYS AS (
      CASE WHEN `status` = ''pending'' AND `master_school_id` IS NOT NULL
           THEN CONCAT(`master_school_id`, ''-'', `session_id`) ELSE NULL END
    ) STORED,
    ADD UNIQUE KEY `uq_location_requests_pending_master` (`pending_master_key`)',
  'SELECT ''Location pending master key already exists''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Principal requests
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_principal_update_requests'
    AND COLUMN_NAME = 'master_school_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_principal_update_requests`
    ADD COLUMN `master_school_id` BIGINT NULL
      COMMENT ''master_schools.id this request is about; set even when the institution has no link to the school'' AFTER `institution_school_id`,
    ADD KEY `idx_principal_requests_master` (`master_school_id`)',
  'SELECT ''Principal request master_school_id already exists''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `school_principal_update_requests` r
JOIN `institution_schools` isv ON isv.id = r.institution_school_id
SET r.master_school_id = isv.master_school_id
WHERE r.master_school_id IS NULL;

SET @key_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_principal_update_requests'
    AND INDEX_NAME = 'uq_principal_requests_pending_master'
);

SET @sql = IF(@key_exists = 0,
  'ALTER TABLE `school_principal_update_requests`
    ADD COLUMN `pending_master_key` VARCHAR(60) GENERATED ALWAYS AS (
      CASE WHEN `status` = ''pending'' AND `master_school_id` IS NOT NULL
           THEN CONCAT(`master_school_id`, ''-'', `session_id`) ELSE NULL END
    ) STORED,
    ADD UNIQUE KEY `uq_principal_requests_pending_master` (`pending_master_key`)',
  'SELECT ''Principal pending master key already exists''');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
