-- Migration: 055_biometric_exemption.sql
-- Description: Per-supervisor exemption from the 'supervisor_biometric_verification'
--              check-in gate, for supervisors without a WebAuthn-capable device
--              (no smartphone, or a phone with no fingerprint/face sensor). An
--              exempt supervisor's check-ins fall back to the pre-existing
--              geofence + device-fingerprint checks only. Set by a Head of TP+
--              admin - see biometricController.adminSetExemption.
-- Created: August 27, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'biometric_exempt'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `users`
    ADD COLUMN `biometric_exempt` TINYINT(1) NOT NULL DEFAULT 0
      COMMENT ''Skip the biometric check-in gate for this supervisor - device cannot do WebAuthn'',
    ADD COLUMN `biometric_exempt_reason` VARCHAR(500) DEFAULT NULL,
    ADD COLUMN `biometric_exempt_set_by` BIGINT(20) DEFAULT NULL
      COMMENT ''users.id of the Head of TP+ admin who set this'',
    ADD COLUMN `biometric_exempt_set_at` TIMESTAMP NULL DEFAULT NULL',
  'SELECT ''Columns already exist'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Foreign key for biometric_exempt_set_by (best-effort; skip if it already exists)
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND CONSTRAINT_NAME = 'fk_users_biometric_exempt_set_by'
);

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `users`
    ADD CONSTRAINT `fk_users_biometric_exempt_set_by` FOREIGN KEY (`biometric_exempt_set_by`) REFERENCES `users`(`id`) ON DELETE SET NULL',
  'SELECT ''FK already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
