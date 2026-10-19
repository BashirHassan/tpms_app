-- Migration: 074_school_request_resubmission.sql
-- Description: Let students correct a school registration request that is
--              pending or was rejected, instead of filing a brand-new one.
--                * resubmitted_at            - when the student last edited/resubmitted
--                * resubmit_count            - how many times it has been edited
--                * previous_rejection_reason - the most recent rejection reason, kept so
--                                              the reviewer can see what was flagged
-- Created: October 18, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND COLUMN_NAME = 'resubmitted_at'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_registration_requests`
    ADD COLUMN `resubmitted_at` TIMESTAMP NULL DEFAULT NULL
      COMMENT ''When the student last edited and resubmitted the request'' AFTER `reviewed_at`,
    ADD COLUMN `resubmit_count` INT NOT NULL DEFAULT 0
      COMMENT ''Number of times the student edited the request after submitting'' AFTER `resubmitted_at`,
    ADD COLUMN `previous_rejection_reason` TEXT NULL
      COMMENT ''Most recent rejection reason, kept after the student corrects and resubmits'' AFTER `resubmit_count`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
