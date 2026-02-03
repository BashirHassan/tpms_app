-- Migration: Add missing FK and indexes to merged_groups table
-- Description: Adds foreign key constraints and indexes for institution_school_id columns
-- Date: 2026-01-17

-- Add indexes for performance
ALTER TABLE `merged_groups`
ADD INDEX IF NOT EXISTS `idx_primary_institution_school` (`primary_institution_school_id`);

ALTER TABLE `merged_groups`
ADD INDEX IF NOT EXISTS `idx_secondary_institution_school` (`secondary_institution_school_id`);

-- Add unique constraint to prevent duplicate merges
ALTER TABLE `merged_groups`
ADD UNIQUE KEY IF NOT EXISTS `unique_merge_new` 
  (`session_id`, `primary_institution_school_id`, `primary_group_number`, 
   `secondary_institution_school_id`, `secondary_group_number`);

-- Add unique constraint to prevent a secondary group from being merged multiple times
ALTER TABLE `merged_groups`
ADD UNIQUE KEY IF NOT EXISTS `unique_secondary_new` 
  (`session_id`, `secondary_institution_school_id`, `secondary_group_number`);

-- Add foreign key constraints
ALTER TABLE `merged_groups`
DROP FOREIGN KEY IF EXISTS `fk_mg_primary_institution_school`;

ALTER TABLE `merged_groups`
ADD CONSTRAINT `fk_mg_primary_institution_school` 
FOREIGN KEY (`primary_institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE;

ALTER TABLE `merged_groups`
DROP FOREIGN KEY IF EXISTS `fk_mg_secondary_institution_school`;

ALTER TABLE `merged_groups`
ADD CONSTRAINT `fk_mg_secondary_institution_school` 
FOREIGN KEY (`secondary_institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
