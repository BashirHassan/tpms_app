-- Migration 046: Add edit_profile feature toggle
-- Controls whether staff can edit personal profile data.
-- Mirrors ITMS migration 062.

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'edit_profile',
  'Edit Profile',
  'Allow staff users to edit their personal profile data.',
  0, 0, 0, 'institution', 'core', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'edit_profile'
);

-- Enable for all existing institutions
INSERT INTO institution_feature_toggles
  (institution_id, feature_toggle_id, is_enabled, enabled_at, created_at, updated_at)
SELECT i.id, ft.id, 1, NOW(), NOW(), NOW()
FROM institutions i
CROSS JOIN feature_toggles ft
LEFT JOIN institution_feature_toggles ift
  ON ift.institution_id = i.id AND ift.feature_toggle_id = ft.id
WHERE ft.feature_key = 'edit_profile'
  AND ift.id IS NULL;
