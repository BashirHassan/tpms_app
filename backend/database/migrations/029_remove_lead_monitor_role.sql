-- Migration: Remove Lead Monitor Role
-- Description: Remove the lead_monitor role which is no longer used in the system.
-- The lead_monitor role has been consolidated into field_monitor.
-- Any existing users with lead_monitor role are updated to field_monitor.

-- Step 1: Update any existing users with lead_monitor role to field_monitor
UPDATE users 
SET role = 'field_monitor' 
WHERE role = 'lead_monitor';

-- Step 2: Alter the users table to remove lead_monitor from the role enum
ALTER TABLE users 
MODIFY COLUMN role ENUM('super_admin', 'head_of_teaching_practice', 'supervisor', 'field_monitor') NOT NULL;

-- Note: If you need to rollback, run:
-- ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'head_of_teaching_practice', 'supervisor', 'lead_monitor', 'field_monitor') NOT NULL;
