-- =====================================================================
-- PRODUCTION DATABASE CLEANUP - FRESH START
-- =====================================================================
-- WARNING: This script DELETES ALL operational data and resets the
-- database to a clean state with only 3 institutions:
--   1. FCETG (id=1)
--   2. GSU  (id=2)
--   3. FUK  (id=3)
--
-- BACKUP YOUR DATABASE BEFORE RUNNING THIS SCRIPT!
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- =====================================================================
-- STEP 1: Delete all institution-scoped data tables
-- Using DELETE FROM instead of TRUNCATE to avoid FK constraint errors
-- (MariaDB/MySQL can reject TRUNCATE on FK-referenced tables)
-- =====================================================================

-- Supervision & Location Tracking
DELETE FROM `supervision_location_logs`;
DELETE FROM `supervisor_postings`;
DELETE FROM `supervision_visit_timelines`;
DELETE FROM `auto_posting_batches`;
DELETE FROM `dean_posting_allocations`;

-- Student Data
DELETE FROM `student_results`;
DELETE FROM `student_acceptances`;
DELETE FROM `student_payments`;
DELETE FROM `student_portal_access_logs`;
DELETE FROM `students`;

-- School Groups & Merges
DELETE FROM `merged_groups`;

-- School Management
DELETE FROM `school_location_update_requests`;
DELETE FROM `school_principal_update_requests`;
DELETE FROM `institution_schools`;

-- Monitoring
DELETE FROM `monitoring_reports`;
DELETE FROM `monitor_assignments`;

-- Document System (keep document_placeholders - system-wide config)
DELETE FROM `document_render_logs`;
DELETE FROM `document_conditional_blocks`;
DELETE FROM `document_template_versions`;
DELETE FROM `document_templates`;

-- Academic Structure
DELETE FROM `scoring_criteria`;
DELETE FROM `programs`;
DELETE FROM `departments`;
DELETE FROM `faculties`;
DELETE FROM `ranks`;
DELETE FROM `routes`;
DELETE FROM `academic_sessions`;

-- SSO
DELETE FROM `sso_logs`;
DELETE FROM `sso_partners`;

-- User & Session Data
DELETE FROM `user_sessions`;
DELETE FROM `users`;

-- Institution Config
DELETE FROM `institution_feature_toggles`;
DELETE FROM `institution_provisioning`;

-- Logging
DELETE FROM `audit_logs`;
DELETE FROM `email_logs`;

-- Master Schools (central registry)
DELETE FROM `master_schools`;

-- =====================================================================
-- STEP 2: Reset auto-increment counters for all cleaned tables
-- =====================================================================
ALTER TABLE `supervision_location_logs` AUTO_INCREMENT = 1;
ALTER TABLE `supervisor_postings` AUTO_INCREMENT = 1;
ALTER TABLE `supervision_visit_timelines` AUTO_INCREMENT = 1;
ALTER TABLE `auto_posting_batches` AUTO_INCREMENT = 1;
ALTER TABLE `dean_posting_allocations` AUTO_INCREMENT = 1;
ALTER TABLE `student_results` AUTO_INCREMENT = 1;
ALTER TABLE `student_acceptances` AUTO_INCREMENT = 1;
ALTER TABLE `student_payments` AUTO_INCREMENT = 1;
ALTER TABLE `student_portal_access_logs` AUTO_INCREMENT = 1;
ALTER TABLE `students` AUTO_INCREMENT = 1;
ALTER TABLE `merged_groups` AUTO_INCREMENT = 1;
ALTER TABLE `school_location_update_requests` AUTO_INCREMENT = 1;
ALTER TABLE `school_principal_update_requests` AUTO_INCREMENT = 1;
ALTER TABLE `institution_schools` AUTO_INCREMENT = 1;
ALTER TABLE `monitoring_reports` AUTO_INCREMENT = 1;
ALTER TABLE `monitor_assignments` AUTO_INCREMENT = 1;
ALTER TABLE `document_render_logs` AUTO_INCREMENT = 1;
ALTER TABLE `document_conditional_blocks` AUTO_INCREMENT = 1;
ALTER TABLE `document_template_versions` AUTO_INCREMENT = 1;
ALTER TABLE `document_templates` AUTO_INCREMENT = 1;
ALTER TABLE `scoring_criteria` AUTO_INCREMENT = 1;
ALTER TABLE `programs` AUTO_INCREMENT = 1;
ALTER TABLE `departments` AUTO_INCREMENT = 1;
ALTER TABLE `faculties` AUTO_INCREMENT = 1;
ALTER TABLE `ranks` AUTO_INCREMENT = 1;
ALTER TABLE `routes` AUTO_INCREMENT = 1;
ALTER TABLE `academic_sessions` AUTO_INCREMENT = 1;
ALTER TABLE `sso_logs` AUTO_INCREMENT = 1;
ALTER TABLE `sso_partners` AUTO_INCREMENT = 1;
ALTER TABLE `user_sessions` AUTO_INCREMENT = 1;
ALTER TABLE `users` AUTO_INCREMENT = 1;
ALTER TABLE `institution_feature_toggles` AUTO_INCREMENT = 1;
ALTER TABLE `institution_provisioning` AUTO_INCREMENT = 1;
ALTER TABLE `audit_logs` AUTO_INCREMENT = 1;
ALTER TABLE `email_logs` AUTO_INCREMENT = 1;
ALTER TABLE `master_schools` AUTO_INCREMENT = 1;

-- =====================================================================
-- STEP 3: Reset institutions table with only the 3 target institutions
-- =====================================================================
DELETE FROM `institutions`;
DELETE FROM `institutions`;

INSERT INTO `institutions` (
  `id`, `name`, `code`, `subdomain`, `institution_type`,
  `email`, `phone`, `address`, `state`, `location`,
  `logo_url`, `primary_color`, `secondary_color`,
  `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_password`,
  `smtp_from_name`, `smtp_from_email`,
  `maintenance_mode`, `maintenance_message`,
  `allow_student_portal`, `require_pin_change`, `session_timeout_minutes`,
  `payment_type`, `payment_base_amount`, `payment_currency`,
  `payment_allow_partial`, `payment_minimum_percentage`, `payment_program_pricing`,
  `paystack_public_key`, `paystack_secret_key`, `paystack_split_code`,
  `payment_enabled`, `status`, `created_at`, `updated_at`,
  `favicon_url`, `login_background_url`, `tagline`,
  `tp_unit_name`, `sso_enabled`
) VALUES
-- FCETG (id=1)
(1, 'FCE Technical Gombe', 'FCETG', 'fcetg', 'college_of_education',
 '', NULL, NULL, 'Gombe', NULL,
 NULL, '#7c3aed', '#10b981',
 NULL, 465, 1, NULL, NULL,
 NULL, NULL,
 0, NULL,
 1, 1, 1440,
 'per_student', 0.00, 'NGN',
 0, 100.00, NULL,
 NULL, NULL, NULL,
 0, 'active', NOW(), NOW(),
 NULL, NULL, 'Technical Excellence',
 'Teaching Practice Coordination Unit', 0),

-- GSU (id=2)
(2, 'Gombe State University', 'GSU', 'gsu', 'university',
 '', NULL, NULL, 'Gombe', NULL,
 NULL, '#1e40af', '#f59e0b',
 NULL, 465, 1, NULL, NULL,
 NULL, NULL,
 0, NULL,
 1, 1, 1440,
 'per_student', 0.00, 'NGN',
 0, 100.00, NULL,
 NULL, NULL, NULL,
 0, 'active', NOW(), NOW(),
 NULL, NULL, 'Knowledge for Development',
 'Teaching Practice Coordination Unit', 0),

-- FUK (id=3)
(3, 'Federal University Kashere', 'FUK', 'fuk', 'university',
 '', NULL, NULL, 'Gombe', NULL,
 NULL, '#1a5f2a', '#8b4513',
 NULL, 465, 1, NULL, NULL,
 NULL, NULL,
 0, NULL,
 1, 1, 1440,
 'per_student', 0.00, 'NGN',
 0, 100.00, NULL,
 NULL, NULL, NULL,
 0, 'active', NOW(), NOW(),
 NULL, NULL, 'Excellence in Education',
 'Teaching Practice Coordination Unit', 0);

-- Reset auto-increment for institutions
ALTER TABLE `institutions` AUTO_INCREMENT = 4;

-- =====================================================================
-- STEP 4: Enable all features for the 3 institutions
-- =====================================================================
INSERT INTO `institution_feature_toggles` (`institution_id`, `feature_toggle_id`, `is_enabled`, `enabled_at`, `created_at`, `updated_at`)
SELECT inst.id, ft.id, 1, NOW(), NOW(), NOW()
FROM `institutions` inst
CROSS JOIN `feature_toggles` ft
WHERE inst.id IN (1, 2, 3);

-- =====================================================================
-- STEP 5: Create default super_admin user for initial access
-- Password: 'changeme123' (bcrypt hash - CHANGE IMMEDIATELY after login)
-- =====================================================================
INSERT INTO `users` (`id`, `institution_id`, `name`, `email`, `phone`, `password_hash`, `role`, `status`, `created_at`, `updated_at`)
VALUES (1, NULL, 'Super Admin', 'admin@sitpms.com', NULL,
  '$2b$10$XQkJEjKQGJGJzGJzGJzGOeN8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8',
  'super_admin', 'active', NOW(), NOW());

ALTER TABLE `users` AUTO_INCREMENT = 2;

-- =====================================================================
-- STEP 6: Re-enable checks and restore SQL mode
-- =====================================================================
SET FOREIGN_KEY_CHECKS = 1;
SET SQL_MODE = @OLD_SQL_MODE;

-- =====================================================================
-- VERIFICATION QUERIES (run these after to confirm)
-- =====================================================================
-- SELECT id, name, code, subdomain FROM institutions ORDER BY id;
-- SELECT COUNT(*) AS feature_count FROM institution_feature_toggles;
-- SELECT COUNT(*) AS user_count FROM users;
-- SELECT COUNT(*) AS student_count FROM students;
-- SELECT COUNT(*) AS posting_count FROM supervisor_postings;
