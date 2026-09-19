-- Migration 068: Add supervisor_allowance_stats feature toggle
-- Lets an institution hide the "Total Allowances" stats card on the
-- supervisor dashboard independently of the broader allowance_management
-- feature, so allowance amounts can stay hidden from supervisors until a
-- final decision on rates/allocations is made.
-- Default enabled (1) to preserve current behavior for institutions that
-- already have allowance_management on.

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'supervisor_allowance_stats',
  'Supervisor Allowance Stats Card',
  'Show the Total Allowances stats card on the supervisor dashboard. Requires allowance_management to also be enabled; disable this to hide allowance amounts from supervisors while final decisions are pending.',
  1, 0, 1, 'institution', 'allowances', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'supervisor_allowance_stats'
);
