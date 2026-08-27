-- Migration: 056_biometric_login.sql
-- Description: Biometric (WebAuthn platform authenticator) login for staff -
--              an additional, parallel way to log in on a device where a
--              staff member has enrolled their fingerprint/face, alongside
--              (never replacing) email + password. One credential per staff
--              user, stored directly on `users` rather than a separate
--              devices table - unlike the supervisor check-in feature, this
--              is a lightweight self-service convenience, not a fleet of
--              admin-policed devices.
-- Created: August 27, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'biometric_login_credential_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `users`
    ADD COLUMN `biometric_login_credential_id` VARCHAR(255) DEFAULT NULL
      COMMENT ''Base64url WebAuthn credential ID for fingerprint login (one device at a time)'',
    ADD COLUMN `biometric_login_public_key` TEXT DEFAULT NULL
      COMMENT ''Base64-encoded COSE public key'',
    ADD COLUMN `biometric_login_counter` BIGINT UNSIGNED DEFAULT NULL
      COMMENT ''Signature counter, replay-detection safety check'',
    ADD COLUMN `biometric_login_transports` JSON DEFAULT NULL,
    ADD COLUMN `biometric_login_device_label` VARCHAR(255) DEFAULT NULL,
    ADD COLUMN `biometric_login_enrolled_at` TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN `biometric_login_last_used_at` TIMESTAMP NULL DEFAULT NULL,
    ADD UNIQUE KEY `uq_users_biometric_login_credential_id` (`biometric_login_credential_id`)',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
