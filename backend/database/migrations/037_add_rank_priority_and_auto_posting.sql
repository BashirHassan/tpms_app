-- ============================================================================
-- Migration: 037_add_rank_priority_and_auto_posting.sql
-- Description: Add priority_number to ranks for auto-posting ordering
--              Create auto_posting_batches table for audit trail
-- Author: System
-- Date: 2026-02-03
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add priority_number column to ranks table (if not exists)
-- Lower number = higher priority (1 = highest priority)
-- Supervisors with higher priority get posted first and assigned longest distances
-- ----------------------------------------------------------------------------

-- Check and add priority_number only if it doesn't exist
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS 
               WHERE TABLE_SCHEMA = DATABASE() 
               AND TABLE_NAME = 'ranks' 
               AND COLUMN_NAME = 'priority_number');

SET @sqlstmt := IF(@exist = 0, 
  'ALTER TABLE `ranks` ADD COLUMN `priority_number` int(11) NOT NULL DEFAULT 99 COMMENT ''Priority for auto-posting: 1=highest, larger=lower priority'' AFTER `tetfund`',
  'SELECT ''Column priority_number already exists''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update existing ranks with default priorities based on typical hierarchy
-- Chief Lecturer = 1 (highest), Principal Lecturer = 2, etc.
UPDATE ranks SET priority_number = 1 WHERE code = 'CL' AND priority_number = 99;
UPDATE ranks SET priority_number = 2 WHERE code = 'PL' AND priority_number = 99;
UPDATE ranks SET priority_number = 3 WHERE code = 'SL' AND priority_number = 99;
UPDATE ranks SET priority_number = 4 WHERE code = 'LI' AND priority_number = 99;
UPDATE ranks SET priority_number = 5 WHERE code = 'LII' AND priority_number = 99;
UPDATE ranks SET priority_number = 6 WHERE code = 'LIII' AND priority_number = 99;
UPDATE ranks SET priority_number = 7 WHERE code = 'AL' AND priority_number = 99;
UPDATE ranks SET priority_number = 8 WHERE code = 'GA' AND priority_number = 99;
UPDATE ranks SET priority_number = 9 WHERE code = 'CA' AND priority_number = 99;

-- ----------------------------------------------------------------------------
-- 2. Create auto_posting_batches table for audit purposes
-- Track auto-posting batches with criteria and results
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `auto_posting_batches` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `session_id` bigint(20) NOT NULL,
  `initiated_by` bigint(20) NULL COMMENT 'User who initiated the auto-posting',
  `criteria` longtext NOT NULL COMMENT 'JSON: posting criteria used (number_of_postings, posting_type, priority_enabled, faculty_id)',
  `total_postings_created` int(11) DEFAULT 0,
  `total_supervisors_posted` int(11) DEFAULT 0,
  `status` enum('pending', 'processing', 'completed', 'failed', 'rolled_back') DEFAULT 'pending',
  `error_message` text DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_institution_session` (`institution_id`, `session_id`),
  KEY `idx_status` (`status`),
  KEY `idx_initiated_by` (`initiated_by`),
  CONSTRAINT `fk_apb_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_apb_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_apb_initiated_by` FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Add auto_posting_batch_id to supervisor_postings for tracking
-- ----------------------------------------------------------------------------

-- Check and add auto_posting_batch_id only if it doesn't exist
SET @exist_batch := (SELECT COUNT(*) FROM information_schema.COLUMNS 
               WHERE TABLE_SCHEMA = DATABASE() 
               AND TABLE_NAME = 'supervisor_postings' 
               AND COLUMN_NAME = 'auto_posting_batch_id');

SET @sqlstmt2 := IF(@exist_batch = 0, 
  'ALTER TABLE `supervisor_postings` ADD COLUMN `auto_posting_batch_id` bigint(20) NULL DEFAULT NULL COMMENT ''Reference to auto_posting_batches if created via auto-posting'' AFTER `posted_by`',
  'SELECT ''Column auto_posting_batch_id already exists''');
PREPARE stmt2 FROM @sqlstmt2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Add foreign key constraint if column exists and constraint doesn't exist
SET @fk_exist := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                  WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'supervisor_postings' 
                  AND CONSTRAINT_NAME = 'fk_sp_auto_batch');

SET @sqlstmt3 := IF(@fk_exist = 0 AND @exist_batch >= 0, 
  'ALTER TABLE `supervisor_postings` ADD CONSTRAINT `fk_sp_auto_batch` FOREIGN KEY (`auto_posting_batch_id`) REFERENCES `auto_posting_batches`(`id`) ON DELETE SET NULL',
  'SELECT ''Foreign key fk_sp_auto_batch already exists or column missing''');
PREPARE stmt3 FROM @sqlstmt3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
