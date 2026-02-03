-- Migration: Add user_name placeholder for supervisor invitation letters
-- Description: Adds a user_name placeholder that captures the current user/supervisor name
-- This is useful for supervisor invitation letters and other user-context documents

-- Add user_name placeholder (applicable to supervisor_invitation_letter)
INSERT INTO `document_placeholders` 
  (`placeholder_key`, `display_name`, `description`, `category`, `data_source`, `data_field`, `format_type`, `format_options`, `is_required`, `default_value`, `sample_value`, `applicable_document_types`, `sort_order`)
VALUES
  ('user_name', 'User/Supervisor Name', 'Full name of the current user or supervisor', 'supervisor', 'users', 'name', 'text', NULL, 1, NULL, 'Dr. Abubakar Ibrahim', '["supervisor_invitation_letter"]', 1),
  ('supervisor_name', 'Supervisor Name', 'Full name of the supervisor', 'supervisor', 'users', 'name', 'text', NULL, 1, NULL, 'Dr. Abubakar Ibrahim', '["supervisor_invitation_letter"]', 2),
  ('supervisor_title', 'Supervisor Title/Rank', 'Academic title or rank of the supervisor', 'supervisor', 'ranks', 'name', 'text', NULL, 0, NULL, 'Senior Lecturer', '["supervisor_invitation_letter"]', 3),
  ('supervisor_email', 'Supervisor Email', 'Email address of the supervisor', 'supervisor', 'users', 'email', 'text', NULL, 0, NULL, 'supervisor@institution.edu.ng', '["supervisor_invitation_letter"]', 4),
  ('supervisor_phone', 'Supervisor Phone', 'Phone number of the supervisor', 'supervisor', 'users', 'phone', 'phone', NULL, 0, NULL, '08012345678', '["supervisor_invitation_letter"]', 5),
  ('supervisor_file_number', 'Supervisor File Number', 'Staff file/employee number of the supervisor', 'supervisor', 'users', 'file_number', 'text', NULL, 0, NULL, 'FCE/ADM/2015/123', '["supervisor_invitation_letter"]', 6),
  ('supervisor_faculty', 'Supervisor Faculty', 'Faculty of the supervisor', 'supervisor', 'faculties', 'name', 'text', NULL, 0, NULL, 'Faculty of Education', '["supervisor_invitation_letter"]', 7),
  ('supervisor_department', 'Supervisor Department', 'Department of the supervisor', 'supervisor', 'departments', 'name', 'text', NULL, 0, NULL, 'Department of Educational Foundations', '["supervisor_invitation_letter"]', 8),
  ('supervisor_rank', 'Supervisor Rank', 'Rank of the supervisor (alias for supervisor_title)', 'supervisor', 'ranks', 'name', 'text', NULL, 0, NULL, 'Senior Lecturer', '["supervisor_invitation_letter"]', 9),
  ('total_schools', 'Total Schools Assigned', 'Number of schools assigned to supervisor', 'supervisor', 'computed', 'total_schools', 'text', NULL, 0, '0', '5', '["supervisor_invitation_letter"]', 10),
  ('total_students', 'Total Students Assigned', 'Number of students assigned to supervisor', 'supervisor', 'computed', 'total_students', 'text', NULL, 0, '0', '25', '["supervisor_invitation_letter"]', 11),
  ('total_visits', 'Total Supervision Visits', 'Total number of supervision visits required', 'supervisor', 'computed', 'total_visits', 'text', NULL, 0, '0', '75', '["supervisor_invitation_letter"]', 12),
  ('max_visits', 'Max Visits Per Student', 'Maximum supervision visits per student', 'supervisor', 'academic_sessions', 'max_supervision_visits', 'text', NULL, 0, '3', '3', '["supervisor_invitation_letter"]', 13)
ON DUPLICATE KEY UPDATE 
  `display_name` = VALUES(`display_name`),
  `description` = VALUES(`description`),
  `category` = VALUES(`category`),
  `sample_value` = VALUES(`sample_value`),
  `applicable_document_types` = JSON_MERGE_PRESERVE(`applicable_document_types`, VALUES(`applicable_document_types`)),
  `updated_at` = CURRENT_TIMESTAMP;
