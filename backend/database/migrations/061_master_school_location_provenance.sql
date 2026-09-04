-- Migration: 061_master_school_location_provenance.sql
-- Description: master_schools.location is a SHARED column - every institution linked
--              to the same master school reads and writes the same GPS point.
--              Approving a student location request therefore overwrites the
--              coordinates other institutions rely on, with no trace of who moved it.
--
--              These columns record who last moved the point so the review screen can
--              warn an approver before they overwrite a correction another institution
--              made days earlier ("coordinate ping-pong"). Advisory only - the
--              approving TP unit still decides.
--
--              Mirrors the existing principal_updated_at / principal_updated_by pair
--              on the same table. No FK, matching that pattern.
--              Ported from siwesms' 099_master_establishment_location_provenance.sql.
-- Created: September 4, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'master_schools'
    AND COLUMN_NAME = 'location_updated_at'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `master_schools`
    ADD COLUMN `location_updated_at` TIMESTAMP NULL DEFAULT NULL
      COMMENT ''When the shared GPS point was last changed by an approved update request''
      AFTER `location`,
    ADD COLUMN `location_updated_by_institution_id` BIGINT NULL DEFAULT NULL
      COMMENT ''Institution whose TP unit approved the last GPS change - used to warn other institutions before they overwrite it''
      AFTER `location_updated_at`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Backfill from the most recent approved request per school,
-- so existing shared points are not treated as "never moved".
-- =====================================================

SET @backfill_ready = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'master_schools'
    AND COLUMN_NAME = 'location_updated_at'
);

SET @sql = IF(@backfill_ready = 1,
  'UPDATE `master_schools` ms
     JOIN (
       SELECT isv.master_school_id AS master_id,
              MAX(r.reviewed_at) AS reviewed_at,
              SUBSTRING_INDEX(GROUP_CONCAT(r.institution_id ORDER BY r.reviewed_at DESC), '','', 1) AS institution_id
       FROM `school_location_update_requests` r
       JOIN `institution_schools` isv ON isv.id = r.institution_school_id
       WHERE r.status = ''approved'' AND r.reviewed_at IS NOT NULL
       GROUP BY isv.master_school_id
     ) latest ON latest.master_id = ms.id
     SET ms.location_updated_at = latest.reviewed_at,
         ms.location_updated_by_institution_id = latest.institution_id,
         ms.updated_at = ms.updated_at
   WHERE ms.location_updated_at IS NULL',
  'SELECT ''Backfill skipped'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
