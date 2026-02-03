-- Migration: Add TP Unit Name Column
-- Description: Adds tp_unit_name column to institutions table for customizable
--              Teaching Practice unit naming (e.g., "Teaching Practice Coordination Unit")
-- Date: 2026-01-20

-- Add tp_unit_name column with default value
ALTER TABLE `institutions` 
ADD COLUMN `tp_unit_name` VARCHAR(255) DEFAULT 'Teaching Practice Coordination Unit' 
COMMENT 'Name of the Teaching Practice unit displayed on documents' 
AFTER `tagline`;

-- Update existing institutions to have the default value
UPDATE `institutions` SET `tp_unit_name` = 'Teaching Practice Coordination Unit' WHERE `tp_unit_name` IS NULL;
