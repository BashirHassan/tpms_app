-- Migration: 066_binary_acceptance_status.sql
-- Description: Collapse the acceptance-status concept to a plain binary
--              Submitted / Not Submitted everywhere. The old 3-value review
--              workflow (pending/approved/rejected) on student_acceptances.status
--              was removed from the product - there's no approve/reject step
--              anymore, so any student_acceptances row that exists simply IS
--              a submission. Legacy pending/rejected rows from before the
--              workflow was removed are normalized to the new single value.
--
--              students.acceptance_status (a separate, denormalized column on
--              students) is fixed at the same time: it was previously only
--              written by the generic acceptance update()/remove() endpoints,
--              never by the three paths that actually create an acceptance,
--              so it silently stayed stale/NULL for most real students. This
--              migration backfills it from actual student_acceptances
--              existence (the real source of truth), not from its own value.
--
-- IDEMPOTENCY: every step here is safe to re-run - the UPDATEs recompute from
--              current data each time and the ALTERs are idempotent MODIFYs.
-- Created: September 6, 2026

-- =====================================================
-- Step 1: Normalize existing student_acceptances rows.
-- =====================================================
UPDATE `student_acceptances` SET `status` = 'submitted' WHERE `status` <> 'submitted';

-- Step 2: Narrow the enum so pending/approved/rejected can never be written again.
ALTER TABLE `student_acceptances`
  MODIFY `status` ENUM('submitted') NOT NULL DEFAULT 'submitted';

-- =====================================================
-- Step 3: Backfill students.acceptance_status from actual submission
-- existence (student_acceptances), not from its own current value.
-- =====================================================
UPDATE `students` s
LEFT JOIN (
  SELECT DISTINCT student_id FROM `student_acceptances`
) has_sa ON has_sa.student_id = s.id
SET s.`acceptance_status` = IF(has_sa.student_id IS NOT NULL, 'submitted', 'not_submitted');

-- Step 4: Narrow students.acceptance_status to the binary model, NOT NULL.
ALTER TABLE `students`
  MODIFY `acceptance_status` ENUM('not_submitted','submitted') NOT NULL DEFAULT 'not_submitted';
