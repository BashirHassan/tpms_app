-- Migration: 072_normalize_master_school_locations.sql
-- Description: Upper-cases and trims master_schools.state / lga / ward so each
--              place is stored one way. Rows written before the controllers
--              started normalising (and wards applied from student location
--              requests) were title-case, which made state filters list the
--              same state twice, e.g. "GOMBE" and "Gombe".
--              Idempotent: only rows that differ are touched, and updated_at is
--              kept so the cleanup does not look like a school edit.
-- Created: October 7, 2026

UPDATE `master_schools`
SET `state` = UPPER(TRIM(`state`)),
    `lga` = UPPER(TRIM(`lga`)),
    `ward` = NULLIF(UPPER(TRIM(`ward`)), ''),
    `updated_at` = `updated_at`
WHERE BINARY `state` <> BINARY UPPER(TRIM(`state`))
   OR BINARY `lga` <> BINARY UPPER(TRIM(`lga`))
   OR BINARY IFNULL(`ward`, '') <> BINARY UPPER(TRIM(IFNULL(`ward`, '')));
