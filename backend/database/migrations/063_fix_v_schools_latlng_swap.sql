-- Migration: 063_fix_v_schools_latlng_swap.sql
-- Description: v_schools reported latitude and longitude the wrong way round.
--
--              Every writer stores the point as POINT(longitude latitude) -
--              see masterSchoolController, schoolController and
--              schoolUpdateRequestController's ST_GeomFromText calls - so
--              ST_X is longitude and ST_Y is latitude. The view had
--              ST_X AS latitude / ST_Y AS longitude, i.e. reversed.
--
--              062 reproduced the mistake deliberately, to keep that repair
--              to a single concern. This corrects it.
--
--              In Nigeria both coordinates fall in overlapping ranges
--              (lat 4-14N, lng 3-15E), so a swap yields a plausible-looking
--              point hundreds of km from the real school rather than an
--              obvious error - worth correcting even though no application
--              code reads this view.
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
  ST_Y(`ms`.`location`)     AS `latitude`,
  ST_X(`ms`.`location`)     AS `longitude`,
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
