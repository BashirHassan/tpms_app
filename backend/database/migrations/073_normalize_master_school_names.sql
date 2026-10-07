-- Migration: 073_normalize_master_school_names.sql
-- Description: Upper-cases and trims master_schools.name so every school name is
--              stored the same way as the rest of the registry (one row,
--              "Government Vocational Training Centre Tula wange", was saved
--              as typed before the controllers normalised names on write).
--              Idempotent: only rows that differ are touched, and updated_at is
--              kept so the cleanup does not look like a school edit.
-- Created: October 7, 2026

UPDATE `master_schools`
SET `name` = UPPER(TRIM(`name`)),
    `updated_at` = `updated_at`
WHERE BINARY `name` <> BINARY UPPER(TRIM(`name`));
