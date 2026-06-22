-- Migration 049: Add max_gps_accuracy_meters to academic_sessions
-- Allows admins to configure the maximum acceptable GPS accuracy radius (in metres)
-- for student location update submissions. NULL means no enforcement.

ALTER TABLE `academic_sessions`
  ADD COLUMN `max_gps_accuracy_meters` INT UNSIGNED DEFAULT NULL
    COMMENT 'Maximum GPS accuracy radius (metres) allowed for student location updates. NULL = no limit.'
    AFTER `inside_distance_threshold_km`;
