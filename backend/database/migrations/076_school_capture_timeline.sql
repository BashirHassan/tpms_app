-- Migration: 076_school_capture_timeline.sql
-- Description: Audit trail + fraud signals for supervisor school data capture.
--              Supervisors are paid per captured school, so every step is
--              recorded and every submitted location is scored:
--                * school_capture_events - append-only timeline per assignment
--                  (assigned, reassigned, cancelled, rolled back, location /
--                  principal submitted, approved, rejected). Never updated or
--                  deleted by application code.
--                * on school_location_update_requests:
--                    gps_samples          raw readings the device reported
--                    client_timestamp     device clock at submission
--                    risk_level           none | medium | high (highest flag)
--                    risk_flags           [{code, severity, message, details}]
--                    distance_from_record_m  distance from the point already on file
-- Created: November 22, 2026

CREATE TABLE IF NOT EXISTS `school_capture_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `institution_id` bigint NOT NULL,
  `session_id` bigint NOT NULL,
  `assignment_id` bigint DEFAULT NULL COMMENT 'school_capture_assignments.id (kept even after the assignment is cancelled)',
  `institution_school_id` bigint DEFAULT NULL,
  `supervisor_id` bigint DEFAULT NULL COMMENT 'The supervisor the event is about',
  `actor_user_id` bigint DEFAULT NULL COMMENT 'Who did it (supervisor or Head of TP); NULL for system',
  `actor_type` enum('supervisor','admin','system') NOT NULL DEFAULT 'system',
  `event_type` varchar(40) NOT NULL,
  `request_type` enum('location','principal') DEFAULT NULL,
  `request_id` bigint DEFAULT NULL,
  `summary` varchar(300) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_capture_events_inst_session` (`institution_id`, `session_id`, `created_at`),
  KEY `idx_capture_events_assignment` (`assignment_id`, `created_at`),
  KEY `idx_capture_events_supervisor` (`supervisor_id`, `created_at`),
  KEY `idx_capture_events_school` (`institution_school_id`),
  KEY `idx_capture_events_type` (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Append-only timeline of supervisor school data capture';

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'school_location_update_requests'
    AND COLUMN_NAME = 'risk_level'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `school_location_update_requests`
    ADD COLUMN `gps_samples` JSON NULL
      COMMENT ''Raw GPS readings the device reported for this capture'' AFTER `capture_method`,
    ADD COLUMN `client_timestamp` DATETIME NULL
      COMMENT ''Device clock at submission'' AFTER `gps_samples`,
    ADD COLUMN `distance_from_record_m` DECIMAL(10,1) NULL
      COMMENT ''Distance from the point on file when this was submitted'' AFTER `client_timestamp`,
    ADD COLUMN `risk_level` ENUM(''none'',''medium'',''high'') NULL
      COMMENT ''Highest severity among risk_flags; NULL for student/legacy rows'' AFTER `distance_from_record_m`,
    ADD COLUMN `risk_flags` JSON NULL
      COMMENT ''[{code,severity,message,details}] computed server-side'' AFTER `risk_level`,
    ADD KEY `idx_location_requests_risk` (`institution_id`, `risk_level`)',
  'SELECT ''Location request risk columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
