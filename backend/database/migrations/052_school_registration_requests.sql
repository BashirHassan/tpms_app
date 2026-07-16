-- Migration: School Registration Requests
-- Description: Allows students to request a new school be added to the central
-- registry and linked to their institution during acceptance-form submission.
-- Super admin reviews; approval auto-creates/reuses a master_schools row and
-- links it via institution_schools.

CREATE TABLE IF NOT EXISTS `school_registration_requests` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `session_id` bigint(20) NOT NULL,
  `student_id` bigint(20) NOT NULL,

  -- Proposed school details (student-submitted)
  `name` varchar(200) NOT NULL,
  `official_code` varchar(50) DEFAULT NULL,
  `school_type` enum('primary','junior','senior','both') NOT NULL,
  `category` enum('public','private','others') NOT NULL,
  `state` varchar(100) NOT NULL,
  `lga` varchar(100) NOT NULL,
  `ward` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,

  -- Review lifecycle
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` text DEFAULT NULL,
  `reviewed_by` bigint(20) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,

  -- Outcome linkage (populated on approval)
  `created_master_school_id` bigint(20) DEFAULT NULL,
  `created_institution_school_id` bigint(20) DEFAULT NULL,

  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),

  -- NULL unless status is pending/approved, so a UNIQUE index on it blocks a
  -- student from having more than one live (pending or approved) request per
  -- session, while placing no restriction on rejected/historical rows.
  `pending_unique_key` varchar(50) GENERATED ALWAYS AS (
    CASE WHEN `status` IN ('pending','approved') THEN CONCAT(`student_id`, '-', `session_id`) ELSE NULL END
  ) STORED,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_srr_pending_per_session` (`pending_unique_key`),
  KEY `idx_institution_status` (`institution_id`, `status`),
  KEY `idx_student_session` (`student_id`, `session_id`),
  KEY `idx_session` (`session_id`),
  KEY `idx_status` (`status`),
  KEY `idx_srr_reviewed_by` (`reviewed_by`),
  KEY `idx_srr_master_school` (`created_master_school_id`),
  KEY `idx_srr_institution_school` (`created_institution_school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Student-submitted requests to add a new school to the central registry';

-- Foreign keys added individually via guarded dynamic SQL (rather than inline
-- on CREATE TABLE, or a plain ALTER-per-FK list) so this file is safe to
-- re-run from scratch at any point: each block checks information_schema
-- first and skips the ADD CONSTRAINT if that FK already exists on this table.
-- Plain MySQL doesn't support "ADD CONSTRAINT IF NOT EXISTS" or
-- "DROP FOREIGN KEY IF EXISTS" (those are MariaDB-only extensions), so this
-- check-then-execute pattern is the portable equivalent.

SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND CONSTRAINT_NAME = 'fk_srr_institution'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `school_registration_requests` ADD CONSTRAINT `fk_srr_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- session_id and student_id use ON DELETE RESTRICT, not CASCADE: both are
-- base columns of the stored generated column `pending_unique_key` above,
-- and InnoDB forbids ON DELETE/UPDATE CASCADE or SET NULL on a foreign key
-- whose child column feeds a stored generated column (error 1215).
SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND CONSTRAINT_NAME = 'fk_srr_session'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `school_registration_requests` ADD CONSTRAINT `fk_srr_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions`(`id`) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND CONSTRAINT_NAME = 'fk_srr_student'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `school_registration_requests` ADD CONSTRAINT `fk_srr_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND CONSTRAINT_NAME = 'fk_srr_reviewed_by'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `school_registration_requests` ADD CONSTRAINT `fk_srr_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND CONSTRAINT_NAME = 'fk_srr_master_school'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `school_registration_requests` ADD CONSTRAINT `fk_srr_master_school` FOREIGN KEY (`created_master_school_id`) REFERENCES `master_schools`(`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @c := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_registration_requests'
    AND CONSTRAINT_NAME = 'fk_srr_institution_school'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `school_registration_requests` ADD CONSTRAINT `fk_srr_institution_school` FOREIGN KEY (`created_institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
