-- Migration: 065_normalize_geometry_srid_4326.sql
-- Description: Put every stored point on one standard: SRID 4326 with the
--              EPSG:4326 axis order, i.e. WKT POINT(latitude longitude).
--
--              Before this migration the two geometry columns disagreed, which
--              is what produced the transposed-coordinate bugs (a geofence that
--              could never match, and ST_Distance_Sphere raising
--              ER_GIS_DIFFERENT_SRIDS 3033 on every call):
--
--                institutions.location          SRID 4326, POINT(lng lat)  <- wrong axis order
--                master_schools.location       SRID 0,    POINT(lat lng)  <- right order, no SRS
--
--              After this migration BOTH are SRID 4326, POINT(lat lng), and the
--              column definitions carry an SRID 4326 attribute so MySQL refuses
--              any future write in another reference system.
--
--              From here on, application code must read coordinates ONLY through
--              ST_Latitude() and ST_Longitude(), never ST_X()/ST_Y(). Those two
--              accessors are unambiguous and cannot be transposed by mistake;
--              that is the whole point of standardising.
--
--              Writes must use ST_GeomFromText('POINT(<lat> <lng>)', 4326).
--
-- IDEMPOTENCY: the institutions step SWAPS coordinates, so it must never run
--              twice. It is guarded on the column not yet carrying the SRID 4326
--              attribute, which this migration sets at the end - so a re-run
--              (including `npm run migrate -- --force`) is a no-op.
-- Created: September 4, 2026

-- =====================================================
-- Guard: has this database already been normalised?
-- =====================================================

SET @already_normalised = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'institutions'
    AND COLUMN_NAME = 'location'
    AND SRS_ID = 4326
);

-- =====================================================
-- institutions.location - already SRID 4326 but stored
-- longitude-first, so the coordinates must be swapped.
-- =====================================================

SET @sql = IF(@already_normalised = 0,
  'UPDATE `institutions`
      SET `location` = ST_SRID(POINT(ST_Latitude(`location`), ST_Longitude(`location`)), 4326)
    WHERE `location` IS NOT NULL',
  'SELECT ''institutions already normalised'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- master_schools.location - SRID 0 holding POINT(lat lng).
-- ST_SRID() alone would NOT do: it reads an SRID-0 point as
-- (longitude, latitude), so a bare re-tag transposes our
-- latitude-first values. Rebuild with the axes in the order
-- ST_SRID expects instead. (siwesms migration 100 made exactly
-- that mistake and needed 101 to undo it.)
-- =====================================================

SET @sql = IF(@already_normalised = 0,
  'UPDATE `master_schools`
      SET `location` = ST_SRID(POINT(ST_Y(`location`), ST_X(`location`)), 4326)
    WHERE `location` IS NOT NULL',
  'SELECT ''master_schools already normalised'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Enforce the reference system at the column level.
-- This is also the idempotency marker checked above.
-- =====================================================

SET @sql = IF(@already_normalised = 0,
  'ALTER TABLE `institutions` MODIFY `location` POINT SRID 4326 NULL
     COMMENT ''GPS coordinates - EPSG:4326, POINT(latitude longitude). Read with ST_Latitude()/ST_Longitude(), never ST_X()/ST_Y()''',
  'SELECT ''institutions column already constrained'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@already_normalised = 0,
  'ALTER TABLE `master_schools` MODIFY `location` POINT SRID 4326 NULL
     COMMENT ''GPS coordinates - EPSG:4326, POINT(latitude longitude). Read with ST_Latitude()/ST_Longitude(), never ST_X()/ST_Y()''',
  'SELECT ''master_schools column already constrained'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- v_schools now uses the unambiguous accessors too
-- =====================================================

CREATE OR REPLACE
  SQL SECURITY INVOKER
  VIEW `v_schools` AS
SELECT
  `isv`.`id`                AS `id`,
  `isv`.`institution_id`    AS `institution_id`,
  `isv`.`route_id`          AS `route_id`,
  `ms`.`name`               AS `name`,
  `ms`.`school_type`        AS `school_type`,
  `ms`.`category`           AS `category`,
  `isv`.`location_category` AS `location_category`,
  `ms`.`state`              AS `state`,
  `ms`.`lga`                AS `lga`,
  `ms`.`ward`               AS `ward`,
  `ms`.`address`            AS `address`,
  `isv`.`distance_km`       AS `distance_km`,
  `isv`.`student_capacity`  AS `student_capacity`,
  `ms`.`principal_name`     AS `principal_name`,
  `ms`.`principal_phone`    AS `principal_phone`,
  `ms`.`location`           AS `location`,
  ST_Latitude(`ms`.`location`)  AS `latitude`,
  ST_Longitude(`ms`.`location`) AS `longitude`,
  `isv`.`status`            AS `status`,
  `isv`.`notes`             AS `notes`,
  `isv`.`created_at`        AS `created_at`,
  `isv`.`updated_at`        AS `updated_at`,
  `ms`.`id`                 AS `master_school_id`,
  `ms`.`is_verified`        AS `is_verified`,
  `ms`.`official_code`      AS `official_code`
FROM `institution_schools` `isv`
JOIN `master_schools` `ms` ON `isv`.`master_school_id` = `ms`.`id`;

-- =====================================================
-- Migration complete
-- =====================================================
