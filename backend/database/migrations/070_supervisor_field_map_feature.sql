-- Migration 070: Add supervisor_field_map feature toggle
-- Lets a supervisor view their entire posting workload on an interactive
-- map: pins for each assigned school, an optimized visit order, and
-- visit-status/overdue tracking. Uses data that's already visible to the
-- supervisor elsewhere (distances, GPS points, visit history) in a new
-- visual layout, so it's safe to default on.

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'supervisor_field_map',
  'Supervisor Field Map',
  'Interactive map view of a supervisor''s posting workload - school locations, an optimized visit order, distance and visit-status tracking. Requires posting_management to also be enabled.',
  1, 0, 1, 'institution', 'posting', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'supervisor_field_map'
);
