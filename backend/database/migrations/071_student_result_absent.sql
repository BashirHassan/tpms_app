-- Migration: 071_student_result_absent.sql
-- Description: Lets a supervisor record that a student was ABSENT for a visit.
--              An absent row is stored like a result (one row per student/session/visit)
--              with total_score = 0, but is_absent = 1 so every score aggregate
--              (average, min/max, pass rate) can exclude it instead of treating the
--              placeholder 0 as a real score. Existing rows default to present.
-- Created: September 30, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'student_results'
    AND COLUMN_NAME = 'is_absent'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `student_results`
    ADD COLUMN `is_absent` TINYINT(1) NOT NULL DEFAULT 0
      COMMENT ''1 = student was absent for this visit; total_score is a placeholder 0 and must be excluded from score statistics''
      AFTER `total_score`',
  'SELECT ''Column already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
