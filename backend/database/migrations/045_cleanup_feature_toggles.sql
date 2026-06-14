-- Migration 045: Clean up feature toggles
-- Mirrors ITMS migrations 064-067:
--   Step 1: Remove 17 dead/stale features (no code references)
--   Step 2: Add missing letter_management (used in routes, absent from DB)
--   Step 3: Merge 6 frontend-only alias keys into backend canonical keys
--   Step 4: Rename public_ prefix off school update features

-- ============================================================
-- Step 1: Remove 17 dead features (no code reference anywhere)
-- ============================================================

DELETE ift FROM institution_feature_toggles ift
JOIN feature_toggles ft ON ift.feature_toggle_id = ft.id
WHERE ft.feature_key IN (
  'central_schools_registry','document_templates','field_monitoring',
  'grouping_engine','monitoring_module','posting_letters',
  'report_exports','reporting_analytics','route_management',
  'saved_reports','score_locking','session_management',
  'sms_notifications','staff_management','student_grouping',
  'student_portal','supervisor_evaluation'
);

DELETE FROM feature_toggles WHERE feature_key IN (
  'central_schools_registry','document_templates','field_monitoring',
  'grouping_engine','monitoring_module','posting_letters',
  'report_exports','reporting_analytics','route_management',
  'saved_reports','score_locking','session_management',
  'sms_notifications','staff_management','student_grouping',
  'student_portal','supervisor_evaluation'
);

-- ============================================================
-- Step 2: Add missing letter_management
-- letters.js calls requireFeature('letter_management') but this
-- key was never inserted — silent 403 on all letter routes.
-- ============================================================

INSERT IGNORE INTO feature_toggles
  (feature_key, name, description, is_enabled, default_enabled,
   is_premium, scope, module, created_at, updated_at)
VALUES
  ('letter_management', 'Letter Management',
   'Posting letter generation and downloads',
   0, 0, 0, 'institution', 'documents', NOW(), NOW());

-- ============================================================
-- Step 3: Merge 6 frontend-only alias keys into backend canonical keys.
-- If any institution had an alias enabled but not the canonical,
-- propagate the enabled state before deleting the alias.
-- ============================================================

-- allowance_calculation → allowance_management
INSERT INTO institution_feature_toggles
  (institution_id, feature_toggle_id, is_enabled, enabled_by, enabled_at)
SELECT
  old_ift.institution_id,
  (SELECT id FROM feature_toggles WHERE feature_key = 'allowance_management'),
  1, old_ift.enabled_by, old_ift.enabled_at
FROM institution_feature_toggles old_ift
JOIN feature_toggles old_ft ON old_ift.feature_toggle_id = old_ft.id
WHERE old_ft.feature_key = 'allowance_calculation'
  AND old_ift.is_enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM institution_feature_toggles x
    JOIN feature_toggles xf ON x.feature_toggle_id = xf.id
    WHERE xf.feature_key = 'allowance_management'
      AND x.institution_id = old_ift.institution_id
      AND x.is_enabled = 1
  )
ON DUPLICATE KEY UPDATE is_enabled = 1;

-- posting_engine + supervisor_posting → posting_management
INSERT INTO institution_feature_toggles
  (institution_id, feature_toggle_id, is_enabled, enabled_by, enabled_at)
SELECT DISTINCT
  old_ift.institution_id,
  (SELECT id FROM feature_toggles WHERE feature_key = 'posting_management'),
  1, old_ift.enabled_by, old_ift.enabled_at
FROM institution_feature_toggles old_ift
JOIN feature_toggles old_ft ON old_ift.feature_toggle_id = old_ft.id
WHERE old_ft.feature_key IN ('posting_engine', 'supervisor_posting')
  AND old_ift.is_enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM institution_feature_toggles x
    JOIN feature_toggles xf ON x.feature_toggle_id = xf.id
    WHERE xf.feature_key = 'posting_management'
      AND x.institution_id = old_ift.institution_id
      AND x.is_enabled = 1
  )
ON DUPLICATE KEY UPDATE is_enabled = 1;

-- payment_integration + payment_gateway → payment_management
INSERT INTO institution_feature_toggles
  (institution_id, feature_toggle_id, is_enabled, enabled_by, enabled_at)
SELECT DISTINCT
  old_ift.institution_id,
  (SELECT id FROM feature_toggles WHERE feature_key = 'payment_management'),
  1, old_ift.enabled_by, old_ift.enabled_at
FROM institution_feature_toggles old_ift
JOIN feature_toggles old_ft ON old_ift.feature_toggle_id = old_ft.id
WHERE old_ft.feature_key IN ('payment_integration', 'payment_gateway')
  AND old_ift.is_enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM institution_feature_toggles x
    JOIN feature_toggles xf ON x.feature_toggle_id = xf.id
    WHERE xf.feature_key = 'payment_management'
      AND x.institution_id = old_ift.institution_id
      AND x.is_enabled = 1
  )
ON DUPLICATE KEY UPDATE is_enabled = 1;

-- supervisor_scoring → student_results
INSERT INTO institution_feature_toggles
  (institution_id, feature_toggle_id, is_enabled, enabled_by, enabled_at)
SELECT
  old_ift.institution_id,
  (SELECT id FROM feature_toggles WHERE feature_key = 'student_results'),
  1, old_ift.enabled_by, old_ift.enabled_at
FROM institution_feature_toggles old_ift
JOIN feature_toggles old_ft ON old_ift.feature_toggle_id = old_ft.id
WHERE old_ft.feature_key = 'supervisor_scoring'
  AND old_ift.is_enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM institution_feature_toggles x
    JOIN feature_toggles xf ON x.feature_toggle_id = xf.id
    WHERE xf.feature_key = 'student_results'
      AND x.institution_id = old_ift.institution_id
      AND x.is_enabled = 1
  )
ON DUPLICATE KEY UPDATE is_enabled = 1;

-- Remove the absorbed alias overrides then the definitions
DELETE ift FROM institution_feature_toggles ift
JOIN feature_toggles ft ON ift.feature_toggle_id = ft.id
WHERE ft.feature_key IN (
  'allowance_calculation', 'posting_engine', 'supervisor_posting',
  'payment_integration', 'payment_gateway', 'supervisor_scoring'
);

DELETE FROM feature_toggles WHERE feature_key IN (
  'allowance_calculation', 'posting_engine', 'supervisor_posting',
  'payment_integration', 'payment_gateway', 'supervisor_scoring'
);

-- ============================================================
-- Step 4: Rename public_ prefix off school update features.
-- These are now portal-scoped (student auth), not exclusively public.
-- Mirrors ITMS migration 064.
-- ============================================================

UPDATE feature_toggles
SET feature_key  = 'principal_update',
    name         = 'Principal Update',
    description  = 'Allow students to submit school principal detail updates',
    module       = 'schools'
WHERE feature_key = 'public_principal_update';

UPDATE feature_toggles
SET feature_key  = 'location_update',
    name         = 'Location Update',
    description  = 'Allow students to submit school GPS coordinate updates',
    module       = 'schools'
WHERE feature_key = 'public_location_update';
