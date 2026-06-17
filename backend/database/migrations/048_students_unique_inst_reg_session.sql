-- Add composite unique constraint on students so that a registration number
-- cannot be uploaded twice for the same institution + session combination.
-- This makes INSERT IGNORE effective for bulk-upload deduplication.

ALTER TABLE `students`
  ADD CONSTRAINT `uq_students_inst_reg_sess`
  UNIQUE KEY (`institution_id`, `registration_number`, `session_id`);
