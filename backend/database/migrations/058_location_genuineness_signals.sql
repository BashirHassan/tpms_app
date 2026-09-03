-- Migration: 058_location_genuineness_signals.sql
-- Description: Audit column backing a supervisor check-in anti-spoofing signal
--              in locationTrackingController.js:
--                - detectZeroJitter: the raw multi-sample GPS readings taken
--                  during capture, so a suspiciously bit-identical set across
--                  every reading can be flagged (real GPS chips jitter, several
--                  mock-location tools don't).
-- Created: September 3, 2026

SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'supervision_location_logs'
    AND COLUMN_NAME = 'gps_samples'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `supervision_location_logs`
    ADD COLUMN `gps_samples` JSON DEFAULT NULL
      COMMENT ''Raw multi-sample GPS readings submitted with this check-in, for audit and zero-jitter detection'' AFTER `device_info`',
  'SELECT ''Column already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration complete
-- =====================================================
