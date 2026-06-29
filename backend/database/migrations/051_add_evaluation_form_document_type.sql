-- Migration: Add evaluation_form document type
-- Description: Adds 'evaluation_form' as a document type that students download alongside
-- their posting letter. It uses the same access gates (posting_letter_available_date +
-- approved acceptance) so no separate feature toggle or session date is needed.

-- 1. Extend the ENUM to include evaluation_form
ALTER TABLE `document_templates`
  MODIFY COLUMN `document_type` ENUM(
    'introduction_letter',
    'acceptance_form',
    'posting_letter',
    'supervisor_invitation_letter',
    'completion_certificate',
    'evaluation_form'
  ) NOT NULL;

-- 2. Register placeholder applicability for all posting-letter-compatible placeholders
--    so the template editor's placeholder picker shows them for evaluation_form templates.
UPDATE `document_placeholders`
SET `applicable_document_types` = JSON_MERGE_PRESERVE(
      COALESCE(`applicable_document_types`, '[]'),
      '["evaluation_form"]'
    ),
    `updated_at` = CURRENT_TIMESTAMP
WHERE JSON_CONTAINS(`applicable_document_types`, '"posting_letter"');
