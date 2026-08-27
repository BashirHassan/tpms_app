-- Migration: 054_supervisor_biometric_credentials.sql
-- Description: WebAuthn (platform authenticator / Android-Windows-Mac built-in
--              fingerprint or face biometric) credential storage for supervisor
--              location check-ins. A device fingerprint alone (migration 053)
--              cannot tell a proxy holding the supervisor's own already-logged-in
--              phone apart from the supervisor - a fresh biometric assertion,
--              gated per check-in, can.
-- Created: August 27, 2026

-- =====================================================
-- Enrolled biometric (WebAuthn) credentials, one row per enrolled device
-- =====================================================

CREATE TABLE IF NOT EXISTS `supervisor_biometric_credentials` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `institution_id` INT NOT NULL,
  `user_id` BIGINT(20) NOT NULL,
  `credential_id` VARCHAR(255) NOT NULL COMMENT 'Base64url WebAuthn credential ID',
  `public_key` TEXT NOT NULL COMMENT 'Base64-encoded COSE public key',
  `counter` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Signature counter, replay-detection',
  `device_label` VARCHAR(255) DEFAULT NULL COMMENT 'User-facing label, e.g. "Samsung A14"',
  `transports` JSON DEFAULT NULL COMMENT 'e.g. ["internal"]',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` TIMESTAMP NULL DEFAULT NULL,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  `revoked_by` BIGINT(20) DEFAULT NULL COMMENT 'users.id of the Head of TP+ admin who revoked this device',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sbc_credential_id` (`credential_id`),
  KEY `idx_sbc_user` (`user_id`),
  KEY `idx_sbc_institution` (`institution_id`),
  CONSTRAINT `fk_sbc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sbc_revoked_by` FOREIGN KEY (`revoked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Short-lived WebAuthn challenges (registration + authentication ceremonies)
-- =====================================================

CREATE TABLE IF NOT EXISTS `webauthn_challenges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT(20) NOT NULL,
  `challenge` VARCHAR(255) NOT NULL,
  `challenge_type` ENUM('registration','authentication') NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wc_user_type` (`user_id`, `challenge_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Record biometric verification outcome on each location check-in log
-- =====================================================

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervision_location_logs'
    AND COLUMN_NAME = 'biometric_verified'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `supervision_location_logs`
    ADD COLUMN `biometric_verified` TINYINT(1) NOT NULL DEFAULT 0
      COMMENT ''1 if a fresh WebAuthn platform-authenticator assertion backed this check-in'' AFTER `flag_reasons`,
    ADD COLUMN `biometric_credential_id` VARCHAR(255) DEFAULT NULL
      COMMENT ''supervisor_biometric_credentials.credential_id used for this check-in, if any'' AFTER `biometric_verified`',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Feature toggle catalog entry (opt-in per institution, default OFF)
-- =====================================================

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'supervisor_biometric_verification',
  'Supervisor Biometric Verification',
  'Require a fresh fingerprint/face (WebAuthn platform authenticator) confirmation from the supervisor at each location check-in, so a colleague holding the supervisor''s already-logged-in phone cannot check in on their behalf.',
  1, 0, 0, 'institution', 'location_tracking', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'supervisor_biometric_verification'
);

-- Intentionally NOT bulk-enabled for existing institutions - an admin opts in
-- once supervisors are ready to enroll a biometric device.

-- =====================================================
-- Migration complete
-- =====================================================
