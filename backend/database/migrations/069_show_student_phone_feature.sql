-- Migration 069: Add show_student_phone feature toggle
-- Lets an institution show each student's phone number (collected during
-- acceptance form submission) on a supervisor's own printable posting
-- schedule, so supervisors can contact their assigned students directly.
-- Default disabled (0) since this exposes student personal contact info -
-- institutions must opt in explicitly.

INSERT INTO feature_toggles
  (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module, created_at, updated_at)
SELECT
  'show_student_phone',
  'Student Phone on Posting Schedule',
  'Show each student''s phone number on a supervisor''s own printable posting schedule (My Postings), so supervisors can contact students directly. Phone numbers are collected from students during acceptance form submission.',
  1, 0, 0, 'institution', 'posting', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM feature_toggles WHERE feature_key = 'show_student_phone'
);
