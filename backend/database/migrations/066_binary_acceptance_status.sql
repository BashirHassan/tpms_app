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
--              and remove() used to reset it to NULL - so it silently stayed
--              stale/NULL for most real students. This migration backfills it
--              from actual student_acceptances existence (the real source of
--              truth), not from its own value.
--
-- ENUM ORDERING: an ALTER that narrows an enum must run AFTER any UPDATE that
--              writes a value not yet in the old enum, and an ALTER that
--              introduces a new value must run BEFORE any UPDATE writes it -
--              MySQL rejects writing a string that isn't a member of the
--              column's current enum (strict mode: "Data truncated for
--              column"). So each column is widened first (old values + the
--              new value both valid, still nullable), then EVERY row is set
--              unconditionally (a WHERE <> comparison would silently skip any
--              existing NULL row, since `NULL <> 'x'` is never true in SQL),
--              then the enum is narrowed and NOT NULL is only added at that
--              final step, once no NULLs remain.
--
-- IDEMPOTENCY: every step here is safe to re-run - the UPDATEs recompute from
--              current data each time and the ALTERs are idempotent MODIFYs.
-- Created: September 6, 2026

-- =====================================================
-- student_acceptances.status
-- =====================================================

-- Step 1: Widen the enum so 'submitted' is valid alongside the legacy
-- values; stay nullable for now in case any row is currently NULL.
ALTER TABLE `student_acceptances`
  MODIFY `status` ENUM('pending','approved','rejected','submitted') DEFAULT 'submitted';

-- Step 2: Set every row unconditionally (covers NULL and all legacy values
-- in one pass - any row that exists represents a real submission).
UPDATE `student_acceptances` SET `status` = 'submitted';

-- Step 3: Narrow the enum and enforce NOT NULL - safe now, no NULLs remain.
ALTER TABLE `student_acceptances`
  MODIFY `status` ENUM('submitted') NOT NULL DEFAULT 'submitted';

-- =====================================================
-- students.acceptance_status
-- =====================================================

-- Step 4: Widen this enum too, so 'submitted' is valid alongside the legacy
-- values; stay nullable for now (existing NULLs are expected here).
ALTER TABLE `students`
  MODIFY `acceptance_status` ENUM('not_submitted','pending','approved','rejected','submitted') DEFAULT 'not_submitted';

-- Step 5: Backfill from actual submission existence (student_acceptances),
-- NOT from this column's own current value - it's the buggy column being
-- fixed. Unconditional (no WHERE), so existing NULLs are covered too.
UPDATE `students` s
LEFT JOIN (
  SELECT DISTINCT student_id FROM `student_acceptances`
) has_sa ON has_sa.student_id = s.id
SET s.`acceptance_status` = IF(has_sa.student_id IS NOT NULL, 'submitted', 'not_submitted');

-- Step 6: Narrow to the binary model and enforce NOT NULL - safe now.
ALTER TABLE `students`
  MODIFY `acceptance_status` ENUM('not_submitted','submitted') NOT NULL DEFAULT 'not_submitted';
