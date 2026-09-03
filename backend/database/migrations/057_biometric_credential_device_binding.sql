-- Migration: 057_biometric_credential_device_binding.sql
-- Description: Bind each enrolled WebAuthn credential to the browser-persisted
--              device id used by location check-in (migration 053's device
--              fingerprinting). Lets biometricController.verifyRegistration
--              refuse to enroll a device that already has another supervisor's
--              active credential on it - closing the gap where one physical
--              device could silently become the enrolled fingerprint
--              authenticator for more than one supervisor account.
-- Created: September 3, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervisor_biometric_credentials'
    AND COLUMN_NAME = 'device_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `supervisor_biometric_credentials`
    ADD COLUMN `device_id` VARCHAR(64) DEFAULT NULL
      COMMENT ''Browser-persisted device id (see frontend deviceId.js) this credential was enrolled from'' AFTER `device_label`,
    ADD KEY `idx_sbc_device` (`device_id`)',
  'SELECT ''Column already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
