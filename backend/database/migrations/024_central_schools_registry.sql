-- Migration: Central Schools Registry
-- Description: Implements a central schools table (master_schools) with institution-specific 
-- partnership data (institution_schools) to eliminate data duplication across institutions.
-- 
-- Benefits:
-- 1. Single source of truth for school identity, GPS, and principal details
-- 2. Institution-specific data (routes, distance, capacity) stored separately
-- 3. Global updates to principal info affect all institutions
-- 4. Easy school discovery and linking for new institutions

-- ============================================================================
-- STEP 1: Create master_schools table (Central Registry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `master_schools` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  
  -- School Identity (rarely changes)
  `name` varchar(200) NOT NULL,
  `official_code` varchar(50) DEFAULT NULL COMMENT 'Official government school code if available',
  `school_type` enum('primary','junior','senior','both') NOT NULL DEFAULT 'senior',
  `category` enum('public','private','others') NOT NULL DEFAULT 'public',
  
  -- Location (Geographic - stable data)
  `state` varchar(100) NOT NULL,
  `lga` varchar(100) NOT NULL,
  `town` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `location` point DEFAULT NULL COMMENT 'GPS coordinates',
  
  -- Principal Details (can be updated via public requests)
  `principal_name` varchar(200) DEFAULT NULL,
  `principal_phone` varchar(20) DEFAULT NULL,
  `principal_email` varchar(255) DEFAULT NULL,
  `principal_updated_at` timestamp NULL DEFAULT NULL,
  `principal_updated_by` bigint(20) DEFAULT NULL,
  
  -- Metadata
  `is_verified` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Verified by super_admin',
  `verified_at` timestamp NULL DEFAULT NULL COMMENT 'When the school was verified',
  `verified_by` bigint(20) DEFAULT NULL COMMENT 'User who verified the school',
  `created_by_institution_id` bigint(20) DEFAULT NULL COMMENT 'Which institution first added this school',
  `merged_into_id` bigint(20) DEFAULT NULL COMMENT 'If merged, points to the target master_school',
  `status` enum('active','inactive','merged','deleted') NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  PRIMARY KEY (`id`),
  KEY `idx_state_lga` (`state`, `lga`),
  KEY `idx_school_type` (`school_type`),
  KEY `idx_name` (`name`),
  KEY `idx_status` (`status`),
  KEY `idx_verified` (`is_verified`),
  KEY `idx_merged_into` (`merged_into_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Central repository of all schools - single source of truth for school identity';

-- ============================================================================
-- STEP 2: Create institution_schools table (Partnership/Operational Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `institution_schools` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `institution_id` bigint(20) NOT NULL,
  `master_school_id` bigint(20) NOT NULL,
  
  -- Institution-specific operational data
  `local_code` varchar(50) DEFAULT NULL COMMENT 'Institution-specific code for this school',
  `route_id` bigint(20) DEFAULT NULL COMMENT 'Route assignment (institution-specific)',
  `location_category` enum('inside','outside') NOT NULL DEFAULT 'outside' COMMENT 'Distance category for allowance (varies per institution location)',
  `distance_km` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Distance from THIS institution',
  `student_capacity` int(11) NOT NULL DEFAULT 0 COMMENT 'Student capacity allocation for THIS institution',
  `geofence_radius_m` int(10) UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Geofence radius for visit verification',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  
  -- Timestamps
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_institution_school` (`institution_id`, `master_school_id`),
  KEY `idx_institution_status` (`institution_id`, `status`),
  KEY `idx_master_school` (`master_school_id`),
  KEY `idx_route` (`route_id`),
  CONSTRAINT `fk_institution_schools_institution` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_institution_schools_master` FOREIGN KEY (`master_school_id`) REFERENCES `master_schools`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_institution_schools_route` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Links institutions to master schools with institution-specific operational data';

-- ============================================================================
-- STEP 3: Migrate existing schools data
-- ============================================================================

-- 3a. Insert unique schools into master_schools (deduplicate by name+state+lga)
INSERT INTO `master_schools` (
  `name`, `official_code`, `school_type`, `category`, 
  `state`, `lga`, `town`, `address`, `location`,
  `principal_name`, `principal_phone`,
  `created_by_institution_id`, `status`, `notes`, `created_at`, `updated_at`
)
SELECT 
  s.name,
  s.code AS official_code,
  CASE 
    WHEN s.school_type = '' OR s.school_type IS NULL THEN 'senior'
    ELSE s.school_type 
  END AS school_type,
  CASE 
    WHEN s.category = '' OR s.category IS NULL THEN 'public'
    ELSE s.category 
  END AS category,
  COALESCE(s.state, 'Unknown') AS state,
  COALESCE(s.lga, 'Unknown') AS lga,
  s.town,
  s.address,
  s.location,
  s.principal_name,
  s.principal_phone,
  s.institution_id AS created_by_institution_id,
  s.status,
  s.notes,
  s.created_at,
  s.updated_at
FROM schools s
-- Use subquery to get first occurrence of each unique school
WHERE s.id IN (
  SELECT MIN(id) 
  FROM schools 
  GROUP BY name, COALESCE(state, ''), COALESCE(lga, '')
);

-- 3b. Create institution_schools links for ALL existing schools
INSERT INTO `institution_schools` (
  `institution_id`, `master_school_id`, `local_code`, `route_id`,
  `location_category`, `distance_km`, `student_capacity`, `geofence_radius_m`,
  `status`, `notes`, `created_at`, `updated_at`
)
SELECT 
  s.institution_id,
  ms.id AS master_school_id,
  s.code AS local_code,
  s.route_id,
  COALESCE(s.location_category, 'outside') AS location_category,
  COALESCE(s.distance_km, 0) AS distance_km,
  COALESCE(s.student_capacity, 0) AS student_capacity,
  COALESCE(s.geofence_radius_m, 100) AS geofence_radius_m,
  s.status,
  s.notes,
  s.created_at,
  s.updated_at
FROM schools s
JOIN master_schools ms ON (
  ms.name COLLATE utf8mb4_unicode_ci = s.name COLLATE utf8mb4_unicode_ci
  AND ms.state COLLATE utf8mb4_unicode_ci = COALESCE(s.state, 'Unknown') COLLATE utf8mb4_unicode_ci
  AND ms.lga COLLATE utf8mb4_unicode_ci = COALESCE(s.lga, 'Unknown') COLLATE utf8mb4_unicode_ci
);

-- ============================================================================
-- STEP 4: Create backward-compatible view (v_schools)
-- ============================================================================

-- This view mimics the old schools table structure for backward compatibility
CREATE OR REPLACE VIEW `v_schools` AS
SELECT 
  isv.id,
  isv.institution_id,
  isv.route_id,
  ms.name,
  isv.local_code AS code,
  ms.school_type,
  ms.category,
  isv.location_category,
  ms.state,
  ms.lga,
  ms.town,
  ms.address,
  isv.distance_km,
  isv.student_capacity,
  ms.principal_name,
  ms.principal_phone,
  ms.location,
  isv.geofence_radius_m,
  isv.status,
  isv.notes,
  isv.created_at,
  isv.updated_at,
  -- Additional fields from master
  ms.id AS master_school_id,
  ms.is_verified,
  ms.official_code
FROM institution_schools isv
JOIN master_schools ms ON isv.master_school_id = ms.id;

-- ============================================================================
-- STEP 5: Create mapping table for ID transition
-- ============================================================================

-- This table maps old school IDs to new institution_schools IDs for FK updates
CREATE TABLE IF NOT EXISTS `_school_id_migration` (
  `old_school_id` bigint(20) NOT NULL,
  `new_institution_school_id` bigint(20) NOT NULL,
  `institution_id` bigint(20) NOT NULL,
  PRIMARY KEY (`old_school_id`),
  KEY `idx_new_id` (`new_institution_school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Populate the mapping
INSERT INTO `_school_id_migration` (old_school_id, new_institution_school_id, institution_id)
SELECT 
  s.id AS old_school_id,
  isv.id AS new_institution_school_id,
  s.institution_id
FROM schools s
JOIN master_schools ms ON (
  ms.name COLLATE utf8mb4_unicode_ci = s.name COLLATE utf8mb4_unicode_ci
  AND ms.state COLLATE utf8mb4_unicode_ci = COALESCE(s.state, 'Unknown') COLLATE utf8mb4_unicode_ci
  AND ms.lga COLLATE utf8mb4_unicode_ci = COALESCE(s.lga, 'Unknown') COLLATE utf8mb4_unicode_ci
)
JOIN institution_schools isv ON (
  isv.master_school_id = ms.id 
  AND isv.institution_id = s.institution_id
);

-- ============================================================================
-- STEP 6: Add school_id column to related tables (parallel to existing)
-- ============================================================================

-- Add new FK column to student_acceptances (keep old for transition)
ALTER TABLE `student_acceptances` 
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL AFTER `school_id`,
ADD KEY IF NOT EXISTS `idx_institution_school` (`institution_school_id`);

-- Update with mapped IDs
UPDATE `student_acceptances` sa
JOIN `_school_id_migration` m ON sa.school_id = m.old_school_id
SET sa.institution_school_id = m.new_institution_school_id;

-- Add new FK column to supervisor_postings
ALTER TABLE `supervisor_postings`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL AFTER `school_id`,
ADD KEY IF NOT EXISTS `idx_institution_school` (`institution_school_id`);

UPDATE `supervisor_postings` sp
JOIN `_school_id_migration` m ON sp.school_id = m.old_school_id
SET sp.institution_school_id = m.new_institution_school_id;

-- Add new FK column to student_results
ALTER TABLE `student_results`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL AFTER `school_id`,
ADD KEY IF NOT EXISTS `idx_institution_school` (`institution_school_id`);

UPDATE `student_results` sr
JOIN `_school_id_migration` m ON sr.school_id = m.old_school_id
SET sr.institution_school_id = m.new_institution_school_id;

-- Add new FK column to school_groups
ALTER TABLE `school_groups`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL AFTER `school_id`,
ADD KEY IF NOT EXISTS `idx_institution_school` (`institution_school_id`);

UPDATE `school_groups` sg
JOIN `_school_id_migration` m ON sg.school_id = m.old_school_id
SET sg.institution_school_id = m.new_institution_school_id;

-- Add new FK columns to merged_groups
ALTER TABLE `merged_groups`
ADD COLUMN IF NOT EXISTS `primary_institution_school_id` bigint(20) DEFAULT NULL AFTER `primary_school_id`,
ADD COLUMN IF NOT EXISTS `secondary_institution_school_id` bigint(20) DEFAULT NULL AFTER `secondary_school_id`;

UPDATE `merged_groups` mg
JOIN `_school_id_migration` m1 ON mg.primary_school_id = m1.old_school_id
SET mg.primary_institution_school_id = m1.new_institution_school_id;

UPDATE `merged_groups` mg
JOIN `_school_id_migration` m2 ON mg.secondary_school_id = m2.old_school_id
SET mg.secondary_institution_school_id = m2.new_institution_school_id;

-- Add new FK column to monitor_assignments
ALTER TABLE `monitor_assignments`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL AFTER `school_id`,
ADD KEY IF NOT EXISTS `idx_institution_school` (`institution_school_id`);

UPDATE `monitor_assignments` ma
JOIN `_school_id_migration` m ON ma.school_id = m.old_school_id
SET ma.institution_school_id = m.new_institution_school_id;

-- Add new FK column to monitoring_reports
ALTER TABLE `monitoring_reports`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL AFTER `school_id`,
ADD KEY IF NOT EXISTS `idx_institution_school` (`institution_school_id`);

UPDATE `monitoring_reports` mr
JOIN `_school_id_migration` m ON mr.school_id = m.old_school_id
SET mr.institution_school_id = m.new_institution_school_id;

-- Add new FK column to school_location_update_requests
ALTER TABLE `school_location_update_requests`
ADD COLUMN IF NOT EXISTS `master_school_id` bigint(20) DEFAULT NULL AFTER `school_id`;

UPDATE `school_location_update_requests` slur
JOIN `_school_id_migration` m ON slur.school_id = m.old_school_id
JOIN `institution_schools` isv ON isv.id = m.new_institution_school_id
SET slur.master_school_id = isv.master_school_id;

-- Add new FK column to school_principal_update_requests
ALTER TABLE `school_principal_update_requests`
ADD COLUMN IF NOT EXISTS `master_school_id` bigint(20) DEFAULT NULL AFTER `school_id`;

UPDATE `school_principal_update_requests` spur
JOIN `_school_id_migration` m ON spur.school_id = m.old_school_id
JOIN `institution_schools` isv ON isv.id = m.new_institution_school_id
SET spur.master_school_id = isv.master_school_id;

-- ============================================================================
-- STEP 7: Add foreign key constraints (after data is populated)
-- ============================================================================

-- Note: We keep the old school_id columns for now to allow gradual transition
-- The application will be updated to use institution_school_id
-- After verification, old columns can be dropped in a future migration

ALTER TABLE `student_acceptances`
ADD CONSTRAINT `fk_sa_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE SET NULL;

ALTER TABLE `supervisor_postings`
ADD CONSTRAINT `fk_sp_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE SET NULL;

ALTER TABLE `student_results`
ADD CONSTRAINT `fk_sr_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE SET NULL;

ALTER TABLE `school_groups`
ADD CONSTRAINT `fk_sg_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE;

ALTER TABLE `monitor_assignments`
ADD CONSTRAINT `fk_ma_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE;

ALTER TABLE `monitoring_reports`
ADD CONSTRAINT `fk_mr_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE SET NULL;

-- ============================================================================
-- STEP 8: Add feature toggle for central schools
-- ============================================================================

INSERT INTO `feature_toggles` (`feature_key`, `name`, `description`, `is_enabled`, `is_premium`, `default_enabled`, `scope`, `module`)
VALUES ('central_schools_registry', 'Central Schools Registry', 'Use centralized school database with institution-specific partnerships', 1, 0, 1, 'global', 'core')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- Enable for all existing institutions
INSERT INTO `institution_feature_toggles` (`institution_id`, `feature_toggle_id`, `is_enabled`, `created_at`, `updated_at`)
SELECT i.id, ft.id, 1, NOW(), NOW()
FROM institutions i
CROSS JOIN feature_toggles ft
WHERE ft.feature_key = 'central_schools_registry'
ON DUPLICATE KEY UPDATE `is_enabled` = 1, `updated_at` = NOW();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- 1. Created master_schools table with central school data
-- 2. Created institution_schools table for institution-specific partnerships
-- 3. Migrated existing schools data to new structure
-- 4. Created v_schools view for backward compatibility
-- 5. Added new FK columns to related tables (parallel to old columns)
-- 6. Updated related tables with new institution_school_id values
--
-- IMPORTANT: The old 'schools' table is kept for backward compatibility
-- Application code should be updated to use institution_schools/master_schools
-- After full transition, run cleanup migration to drop old columns and table
