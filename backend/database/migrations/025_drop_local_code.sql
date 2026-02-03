-- Migration: Drop local_code from institution_schools
-- Description: Each school has only one code (official_code from master_schools)
--              The local_code column is no longer needed
-- Date: 2025-01-04

-- Drop the local_code column from institution_schools
ALTER TABLE institution_schools DROP COLUMN IF EXISTS local_code;
