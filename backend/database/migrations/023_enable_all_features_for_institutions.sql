-- Migration: Enable All Features for All Institutions
-- Description: Ensures all feature toggles are enabled by default for all institutions.
--              This fixes the issue where new institutions were not getting features enabled.
-- Date: 2026-01-10

-- Insert enabled feature toggles for all institutions for any missing features
INSERT IGNORE INTO `institution_feature_toggles` (`institution_id`, `feature_toggle_id`, `is_enabled`, `created_at`)
SELECT 
  i.id,
  ft.id,
  1,
  NOW()
FROM institutions i
CROSS JOIN feature_toggles ft
WHERE i.status IN ('active', 'inactive')
  AND NOT EXISTS (
    SELECT 1 
    FROM institution_feature_toggles ift 
    WHERE ift.institution_id = i.id AND ift.feature_toggle_id = ft.id
  );

-- Also update any existing feature toggles that are disabled to enabled
UPDATE institution_feature_toggles 
SET is_enabled = 1, updated_at = NOW()
WHERE is_enabled = 0;
