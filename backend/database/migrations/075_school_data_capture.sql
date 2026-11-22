-- Migration: 075_school_data_capture.sql
-- Description: Supervisor school data capture. The Head of TP bulk-assigns
--              supervisors to schools that are missing a verified GPS location
--              or principal details; each supervisor records them in the field
--              and the submissions land in the existing School Update Requests
--              queue as pending requests for approval.
--                * school_capture_batches     - one row per auto-assign run (history + rollback)
--                * school_capture_assignments - one live capturer per school per session
--                * submitted_by_user_id / capture_assignment_id on both request tables
--                * capture_method on location requests ('gps' | 'manual')
--                * school_data_capture feature toggle (OFF by default - opt-in per institution)
-- Created: November 22, 2026

-- =====================================================
-- Batches
-- =====================================================

CREATE TABLE IF NOT EXISTS `school_capture_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `institution_id` bigint NOT NULL,
  `session_id` bigint NOT NULL,
  `mode` enum('lga','random','manual') NOT NULL DEFAULT 'lga',
  `scope` enum('missing_any','missing_location','missing_principal','all') NOT NULL DEFAULT 'missing_any',
  `filters` json DEFAULT NULL COMMENT 'Request-time scope filters (supervisors, states, LGAs, cap) kept for audit only',
  `school_count` int NOT NULL DEFAULT 0,
  `supervisor_count` int NOT NULL DEFAULT 0,
  `status` enum('completed','rolled_back') NOT NULL DEFAULT 'completed',
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_capture_batches_inst_session` (`institution_id`, `session_id`),
  KEY `idx_capture_batches_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Auto/manual bulk runs that assigned supervisors to capture school data';

-- =====================================================
-- Assignments
-- =====================================================

CREATE TABLE IF NOT EXISTS `school_capture_assignments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `institution_id` bigint NOT NULL,
  `session_id` bigint NOT NULL,
  `supervisor_id` bigint NOT NULL COMMENT 'users.id of the supervisor who must capture this school',
  `institution_school_id` bigint NOT NULL,
  `batch_id` bigint DEFAULT NULL COMMENT 'NULL for one-off manual assignments made outside a batch',
  `needs_location` tinyint(1) NOT NULL DEFAULT 1,
  `needs_principal` tinyint(1) NOT NULL DEFAULT 1,
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `assigned_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- NULL unless the assignment is live, so this UNIQUE index allows exactly one
  -- active capturer per school per session while cancelled rows stay as history.
  `active_unique_key` varchar(60) GENERATED ALWAYS AS (
    CASE WHEN `status` = 'active' THEN CONCAT(`institution_school_id`, '-', `session_id`) ELSE NULL END
  ) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_capture_assignments_active` (`active_unique_key`),
  KEY `idx_capture_assignments_supervisor` (`institution_id`, `session_id`, `supervisor_id`),
  KEY `idx_capture_assignments_school` (`institution_school_id`),
  KEY `idx_capture_assignments_batch` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Supervisor-to-school assignments for capturing GPS location and principal details';

-- =====================================================
-- Provenance on the existing request tables
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND COLUMN_NAME = 'submitted_by_user_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD COLUMN `submitted_by_user_id` BIGINT NULL
      COMMENT ''Supervisor (users.id) who captured this in the field; NULL for student/public submissions'' AFTER `student_id`,
    ADD COLUMN `capture_assignment_id` BIGINT NULL
      COMMENT ''school_capture_assignments.id this submission fulfils'' AFTER `submitted_by_user_id`,
    ADD COLUMN `capture_method` ENUM(''gps'',''manual'') NULL
      COMMENT ''How a supervisor obtained the coordinates; NULL for older/student rows'' AFTER `accuracy_meters`,
    ADD KEY `idx_location_requests_submitter` (`submitted_by_user_id`),
    ADD KEY `idx_location_requests_capture_assignment` (`capture_assignment_id`)',
  'SELECT ''Location request columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_principal_update_requests'
    AND COLUMN_NAME = 'submitted_by_user_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_principal_update_requests`
    ADD COLUMN `submitted_by_user_id` BIGINT NULL
      COMMENT ''Supervisor (users.id) who captured this in the field; NULL for student/public submissions'' AFTER `institution_school_id`,
    ADD COLUMN `capture_assignment_id` BIGINT NULL
      COMMENT ''school_capture_assignments.id this submission fulfils'' AFTER `submitted_by_user_id`,
    ADD KEY `idx_principal_requests_submitter` (`submitted_by_user_id`),
    ADD KEY `idx_principal_requests_capture_assignment` (`capture_assignment_id`)',
  'SELECT ''Principal request columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Feature toggle - off by default; each institution opts in
-- =====================================================

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'school_data_capture',
  'Supervisor School Data Capture',
  'Bulk-assign supervisors to capture school GPS locations and principal details in the field. Submissions go to School Update Requests for approval. Requires school_management to also be enabled.',
  0, 0, 0, 'institution', 'core', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'school_data_capture'
);

-- =====================================================
-- Migration complete
-- =====================================================
