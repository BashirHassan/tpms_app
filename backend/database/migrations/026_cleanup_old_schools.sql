-- Migration: Cleanup Old Schools Architecture
-- Description: Removes the old `schools` table and related columns after successful migration
--              to the central schools registry (master_schools + institution_schools)
-- 
-- Prerequisites: 
-- - 024_central_schools_registry.sql must have been run
-- - All data must have been migrated to institution_school_id columns
--
-- Date: 2026-01-17
-- 
-- NOTE: This migration is idempotent and safe to re-run.
-- Errors from dropping non-existent constraints/indexes are expected if partially run.

-- ============================================================================
-- STEP 1: Ensure institution_school_id exists on update request tables
-- ============================================================================

-- school_location_update_requests: Add institution_school_id if not exists
ALTER TABLE `school_location_update_requests`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL;

-- school_principal_update_requests: Add institution_school_id if not exists  
ALTER TABLE `school_principal_update_requests`
ADD COLUMN IF NOT EXISTS `institution_school_id` bigint(20) DEFAULT NULL;

-- ============================================================================
-- STEP 2: Drop foreign key constraints referencing old schools table
-- These may already be dropped, errors are expected
-- ============================================================================

-- school_groups: Drop FK to schools table
ALTER TABLE `school_groups` DROP FOREIGN KEY IF EXISTS `school_groups_ibfk_2`;

-- school_location_update_requests: Drop FK to schools table
ALTER TABLE `school_location_update_requests` DROP FOREIGN KEY IF EXISTS `fk_location_requests_school`;

-- school_principal_update_requests: Drop FK to schools table
ALTER TABLE `school_principal_update_requests` DROP FOREIGN KEY IF EXISTS `fk_principal_requests_school`;

-- school_program_capacities: Drop FKs to schools table (table may not exist)
-- Will be dropped entirely in Step 8

-- student_acceptances: Drop FK referencing schools table
ALTER TABLE `student_acceptances` DROP FOREIGN KEY IF EXISTS `student_acceptances_ibfk_4`;

-- supervisor_postings: Drop FK referencing schools table
ALTER TABLE `supervisor_postings` DROP FOREIGN KEY IF EXISTS `supervisor_postings_ibfk_4`;

-- student_results: Drop FK referencing schools table
ALTER TABLE `student_results` DROP FOREIGN KEY IF EXISTS `fk_student_results_school`;

-- merged_groups: Drop FKs referencing schools table
ALTER TABLE `merged_groups` DROP FOREIGN KEY IF EXISTS `merged_groups_ibfk_3`;
ALTER TABLE `merged_groups` DROP FOREIGN KEY IF EXISTS `merged_groups_ibfk_4`;

-- monitor_assignments: Drop FK referencing schools table
ALTER TABLE `monitor_assignments` DROP FOREIGN KEY IF EXISTS `fk_fma_school`;

-- monitoring_reports: Drop FK referencing schools table
ALTER TABLE `monitoring_reports` DROP FOREIGN KEY IF EXISTS `fk_mr_school`;

-- ============================================================================
-- STEP 3: Handle generated columns that depend on school_id
-- ============================================================================

-- school_location_update_requests: Drop generated column first
ALTER TABLE `school_location_update_requests` DROP COLUMN IF EXISTS `pending_unique_key`;

-- school_principal_update_requests: Drop generated column first
ALTER TABLE `school_principal_update_requests` DROP COLUMN IF EXISTS `pending_unique_key`;

-- ============================================================================
-- STEP 4: Drop indexes and unique constraints that reference school_id
-- ============================================================================

-- monitor_assignments: Drop unique constraint and index
ALTER TABLE `monitor_assignments` DROP INDEX IF EXISTS `unique_assignment`;
ALTER TABLE `monitor_assignments` DROP INDEX IF EXISTS `idx_fma_school`;

-- supervisor_postings: Drop unique constraint and indexes  
ALTER TABLE `supervisor_postings` DROP INDEX IF EXISTS `unique_posting`;
ALTER TABLE `supervisor_postings` DROP INDEX IF EXISTS `idx_school`;
ALTER TABLE `supervisor_postings` DROP INDEX IF EXISTS `idx_postings_group`;
ALTER TABLE `supervisor_postings` DROP INDEX IF EXISTS `idx_sup_postings_sess_school`;
ALTER TABLE `supervisor_postings` DROP INDEX IF EXISTS `idx_posting_school_group_visit`;

-- monitoring_reports: Drop index
ALTER TABLE `monitoring_reports` DROP INDEX IF EXISTS `idx_mr_school`;

-- student_results: Drop index
ALTER TABLE `student_results` DROP INDEX IF EXISTS `idx_student_results_school`;

-- merged_groups: Drop unique constraints and indexes referencing school_id columns
ALTER TABLE `merged_groups` DROP INDEX IF EXISTS `unique_merge`;
ALTER TABLE `merged_groups` DROP INDEX IF EXISTS `unique_secondary`;
ALTER TABLE `merged_groups` DROP INDEX IF EXISTS `primary_school_id`;
ALTER TABLE `merged_groups` DROP INDEX IF EXISTS `secondary_school_id`;

-- document_render_logs: Drop index if exists
ALTER TABLE `document_render_logs` DROP INDEX IF EXISTS `idx_render_logs_school`;

-- ============================================================================
-- STEP 5: Drop old school_id columns
-- ============================================================================

-- school_groups
ALTER TABLE `school_groups` DROP COLUMN IF EXISTS `school_id`;

-- school_location_update_requests
ALTER TABLE `school_location_update_requests` DROP COLUMN IF EXISTS `school_id`;
ALTER TABLE `school_location_update_requests` DROP COLUMN IF EXISTS `master_school_id`;

-- school_principal_update_requests
ALTER TABLE `school_principal_update_requests` DROP COLUMN IF EXISTS `school_id`;
ALTER TABLE `school_principal_update_requests` DROP COLUMN IF EXISTS `master_school_id`;

-- student_acceptances
ALTER TABLE `student_acceptances` DROP COLUMN IF EXISTS `school_id`;

-- supervisor_postings
ALTER TABLE `supervisor_postings` DROP COLUMN IF EXISTS `school_id`;

-- student_results
ALTER TABLE `student_results` DROP COLUMN IF EXISTS `school_id`;

-- merged_groups
ALTER TABLE `merged_groups` DROP COLUMN IF EXISTS `primary_school_id`;
ALTER TABLE `merged_groups` DROP COLUMN IF EXISTS `secondary_school_id`;

-- monitor_assignments
ALTER TABLE `monitor_assignments` DROP COLUMN IF EXISTS `school_id`;

-- monitoring_reports
ALTER TABLE `monitoring_reports` DROP COLUMN IF EXISTS `school_id`;

-- document_render_logs
ALTER TABLE `document_render_logs` DROP COLUMN IF EXISTS `school_id`;

-- ============================================================================
-- STEP 6: Recreate generated columns using institution_school_id
-- ============================================================================

-- Recreate pending_unique_key for school_location_update_requests
ALTER TABLE `school_location_update_requests` 
ADD COLUMN IF NOT EXISTS `pending_unique_key` VARCHAR(50) GENERATED ALWAYS AS (
  CASE WHEN `status` = 'pending' THEN CONCAT(`institution_school_id`, '-', `session_id`) ELSE NULL END
) STORED;

-- Recreate pending_unique_key for school_principal_update_requests
ALTER TABLE `school_principal_update_requests` 
ADD COLUMN IF NOT EXISTS `pending_unique_key` VARCHAR(50) GENERATED ALWAYS AS (
  CASE WHEN `status` = 'pending' THEN CONCAT(`institution_school_id`, '-', `session_id`) ELSE NULL END
) STORED;

-- ============================================================================
-- STEP 7: Create unique constraints and indexes
-- ============================================================================

-- school_groups: Create unique constraint on institution_school_id
ALTER TABLE `school_groups` 
ADD UNIQUE KEY IF NOT EXISTS `unique_institution_school_group` (`institution_school_id`, `session_id`, `group_number`);

-- Add indexes for institution_school_id columns
ALTER TABLE `school_location_update_requests`
ADD INDEX IF NOT EXISTS `idx_slur_institution_school` (`institution_school_id`);

ALTER TABLE `school_principal_update_requests`
ADD INDEX IF NOT EXISTS `idx_spur_institution_school` (`institution_school_id`);

-- ============================================================================
-- STEP 8: Add foreign key constraints for institution_school_id
-- Note: DROP first to handle idempotency, then ADD
-- ============================================================================

-- school_location_update_requests: Add FK to institution_schools
ALTER TABLE `school_location_update_requests`
DROP FOREIGN KEY IF EXISTS `fk_slur_institution_school`;

ALTER TABLE `school_location_update_requests`
ADD CONSTRAINT `fk_slur_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE;

-- school_principal_update_requests: Add FK to institution_schools
ALTER TABLE `school_principal_update_requests`
DROP FOREIGN KEY IF EXISTS `fk_spur_institution_school`;

ALTER TABLE `school_principal_update_requests`
ADD CONSTRAINT `fk_spur_institution_school` 
FOREIGN KEY (`institution_school_id`) REFERENCES `institution_schools`(`id`) ON DELETE CASCADE;

-- ============================================================================
-- STEP 9: Drop the old schools table and related objects
-- ============================================================================

-- Drop the v_schools backward compatibility view
DROP VIEW IF EXISTS `v_schools`;

-- Drop the school_program_capacities table (uses old schools table)
DROP TABLE IF EXISTS `school_program_capacities`;

-- Drop the _school_id_migration temporary table
DROP TABLE IF EXISTS `_school_id_migration`;

-- Finally, drop the old schools table
DROP TABLE IF EXISTS `schools`;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary:
-- 1. Added institution_school_id to update request tables (if not exists)
-- 2. Dropped all foreign keys referencing the old schools table
-- 3. Dropped generated columns that depend on school_id
-- 4. Dropped all old school_id columns from related tables
-- 5. Recreated generated columns using institution_school_id
-- 6. Created new unique constraints and indexes
-- 7. Added new foreign key constraints to institution_schools
-- 8. Dropped the old schools table and related objects

-- Tables Dropped:
-- - schools
-- - school_program_capacities
-- - _school_id_migration
-- - v_schools (view)

-- Columns Dropped (from various tables):
-- - school_id (replaced by institution_school_id)
-- - master_school_id (in update request tables - now use institution_school_id)
-- - primary_school_id, secondary_school_id (in merged_groups)
