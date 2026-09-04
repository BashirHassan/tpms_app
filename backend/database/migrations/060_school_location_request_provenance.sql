-- Migration: 060_school_location_request_provenance.sql
-- Description: Enrich student-submitted school GPS location update requests so the
--              student portal can show a meaningful location status:
--                * student_id      - who submitted it (so a student can tell their own
--                                    submission apart from a coursemate's)
--                * accuracy_meters - the GPS accuracy reported by the device at capture
--                                    time (NULL = accuracy was never recorded)
--                * student_note    - optional reason, required when re-requesting a
--                                    change to an already-approved location
--                * proposed_ward / proposed_address - optional corrections submitted
--                                    alongside the coordinates
--              Also adds the unique guard on the existing generated pending_unique_key
--              column so two students cannot race a duplicate pending request through.
--              Ported from siwesms' 098_establishment_location_request_provenance.sql.
-- Created: September 4, 2026

-- =====================================================
-- New provenance columns
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND COLUMN_NAME = 'student_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD COLUMN `student_id` BIGINT NULL
      COMMENT ''Student who submitted the request (NULL for legacy/public submissions)'' AFTER `institution_school_id`,
    ADD COLUMN `proposed_ward` VARCHAR(100) NULL
      COMMENT ''Optional ward correction submitted with the coordinates'' AFTER `proposed_longitude`,
    ADD COLUMN `proposed_address` TEXT NULL
      COMMENT ''Optional street address correction submitted with the coordinates'' AFTER `proposed_ward`,
    ADD COLUMN `accuracy_meters` DECIMAL(8,2) NULL
      COMMENT ''GPS accuracy in metres reported by the device; NULL means it was never recorded'' AFTER `proposed_address`,
    ADD COLUMN `student_note` VARCHAR(500) NULL
      COMMENT ''Optional student explanation; required when correcting an already-approved location'' AFTER `accuracy_meters`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Index for student_id lookups
-- =====================================================

SET @index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND INDEX_NAME = 'idx_location_requests_student'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD KEY `idx_location_requests_student` (`student_id`)',
  'SELECT ''Index already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- One pending request per school per session
-- Applied only when the existing data has no duplicates.
-- =====================================================

SET @index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND INDEX_NAME = 'uq_location_requests_pending'
);

SET @pending_key_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND COLUMN_NAME = 'pending_unique_key'
);

-- Counted through a prepared statement so the column reference is never parsed
-- on a database where pending_unique_key was never created.
SET @sql = IF(@pending_key_exists = 1,
  'SELECT COUNT(*) INTO @duplicate_count FROM (
     SELECT `pending_unique_key`
     FROM `school_location_update_requests`
     WHERE `pending_unique_key` IS NOT NULL
     GROUP BY `pending_unique_key`
     HAVING COUNT(*) > 1
   ) AS dupes',
  'SELECT 1 INTO @duplicate_count'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@index_exists = 0 AND @pending_key_exists = 1 AND @duplicate_count = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD UNIQUE KEY `uq_location_requests_pending` (`pending_unique_key`)',
  'SELECT ''Unique key skipped (already present or duplicate pending rows exist)'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
