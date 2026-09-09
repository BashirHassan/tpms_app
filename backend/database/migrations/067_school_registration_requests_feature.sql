-- Migration 067: Add school_registration_requests feature toggle
-- Controls whether students can request a new school be added while
-- submitting their acceptance form. Enabled by default since the
-- capability is already live for every institution today; institutions
-- that don't want it can disable it from the Features admin page.

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'school_registration_requests',
  'Student School Registration Requests',
  'Allow students to request a new school be added when submitting their acceptance form.',
  1, 0, 1, 'institution', 'schools', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'school_registration_requests'
);
