-- Normalize existing school location names to the uppercase canonical format.

UPDATE master_schools
SET
  state = UPPER(TRIM(state)),
  lga = UPPER(TRIM(lga)),
  ward = CASE
    WHEN ward IS NULL OR TRIM(ward) = '' THEN NULL
    ELSE UPPER(TRIM(ward))
  END
WHERE
  state <> UPPER(TRIM(state))
  OR lga <> UPPER(TRIM(lga))
  OR (
    ward IS NOT NULL
    AND (
      TRIM(ward) = ''
      OR ward <> UPPER(TRIM(ward))
    )
  );
