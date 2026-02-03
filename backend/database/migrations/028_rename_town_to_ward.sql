-- Migration: Rename town to ward in master_schools table
-- Date: 2026-01-17
-- Description: Change town column to ward to match Nigeria's administrative geography
--              Ward GPS coordinates are looked up from GeoJSON service, not stored here
--              (the existing `location` POINT column stores actual school GPS)

-- Step 1: Rename town column to ward
ALTER TABLE `master_schools` 
  CHANGE COLUMN `town` `ward` VARCHAR(100) DEFAULT NULL;

-- Step 2: Update the legacy schools table if it exists (for backward compatibility)
SET @table_exists = (SELECT COUNT(*) FROM information_schema.columns 
                     WHERE table_schema = DATABASE() 
                     AND table_name = 'schools' 
                     AND column_name = 'town');

SET @sql = IF(@table_exists > 0, 
  'ALTER TABLE `schools` CHANGE COLUMN `town` `ward` VARCHAR(100) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Update v_schools view to use ward instead of town
DROP VIEW IF EXISTS `v_schools`;
CREATE VIEW `v_schools` AS
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
  ms.ward,
  ms.address,
  isv.distance_km,
  isv.student_capacity,
  ms.principal_name,
  ms.principal_phone,
  ms.location,
  ST_X(ms.location) AS latitude,
  ST_Y(ms.location) AS longitude,
  isv.geofence_radius_m,
  isv.status,
  isv.notes,
  isv.created_at,
  isv.updated_at,
  ms.id AS master_school_id,
  ms.is_verified,
  ms.official_code
FROM institution_schools isv
JOIN master_schools ms ON isv.master_school_id = ms.id;

-- Step 4: Add index for ward column for better search performance
CREATE INDEX idx_master_schools_ward ON master_schools(ward);
