-- Migration: 064_revert_v_schools_latlng_swap.sql
-- Description: Reverts 063. The view was right; the assumption behind 063 was wrong.
--
--              063 changed v_schools to latitude=ST_Y / longitude=ST_X on the
--              reasoning that every writer calls
--              ST_GeomFromText('POINT(<longitude> <latitude>)', making ST_X the
--              longitude. The stored data says otherwise:
--
--                GOVERNMENT DAY JUNIOR SECONDARY SCHOOL JALO WAZIRI GOMBE
--                  ST_X = 10.2882   ST_Y = 11.1590
--                Gombe town is 10.290 N, 11.167 E
--
--              so ST_X holds the LATITUDE. Read the other way the point lands
--              ~100 km away in Bauchi State. Every school row checked shows the
--              same orientation, i.e. master_schools.location was populated as
--              POINT(latitude longitude) by the original import, not by the
--              controller write path.
--
--              This restores the view to match the data actually stored.
--
--              NOTE - the underlying inconsistency is NOT resolved by this
--              migration: the stored data is POINT(lat lng) while the
--              application's read queries (locationTrackingController's
--              geofence in particular, which reads ST_X as school_longitude)
--              assume POINT(lng lat). One of the two has to change, and that is
--              a data decision, not a view definition. Left alone deliberately.
-- Created: September 4, 2026

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
  ST_X(`ms`.`location`)     AS `latitude`,
  ST_Y(`ms`.`location`)     AS `longitude`,
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
