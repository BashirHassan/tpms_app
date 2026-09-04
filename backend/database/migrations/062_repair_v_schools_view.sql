-- Migration: 062_repair_v_schools_view.sql
-- Description: Repair the `v_schools` view, corrupt since migration 059.
--
--              059_session_geofence_and_accuracy.sql dropped
--              institution_schools.geofence_radius_m, but v_schools still
--              selected it. Any access to the view since then fails with
--              ER_VIEW_INVALID (1356), and because mysqldump walks every view
--              with SHOW FIELDS, that error aborts the dump partway through -
--              producing a silently TRUNCATED backup with no "Dump completed"
--              marker. Found 2026-09-04 while taking a pre-migration backup.
--
--              Two deliberate changes while recreating it:
--                * geofence_radius_m is gone from the column list (the column
--                  no longer exists; the session-level replacement lives on
--                  academic_sessions, and is not per-school).
--                * SQL SECURITY INVOKER instead of DEFINER=root@localhost, so
--                  the view resolves with the rights of whoever queries it.
--                  The old root definer was a second way for this view to fail
--                  for the application/backup user.
--
--              Everything else - column order, names, expressions, join - is
--              reproduced exactly as it was.
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
