/**
 * School Portal Controller (MedeePay Pattern)
 *
 * Student-initiated school data corrections - principal name/phone
 * and GPS coordinates - for the student's OWN assigned school, resolved
 * from their approved acceptance. No school picker, no way to submit for
 * somebody else's school.
 * Writes to the same request tables the admin review flow reads; that flow is
 * unchanged.
 */

const { z } = require('zod');
const { query, queryOne } = require('../db/database');
const { ValidationError } = require('../utils/errors');
const { distanceMeters } = require('../utils/geo');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const NIGERIAN_PHONE = /^(\+?234|0)[789]\d{9}$/;

const schemas = {
  portalPrincipalUpdate: z.object({
    body: z.object({
      proposed_principal_name: z
        .string()
        .min(3, 'Principal name must be at least 3 characters')
        .max(200)
        .transform((v) => v.trim().toUpperCase()),
      proposed_principal_phone: z
        .string()
        .regex(NIGERIAN_PHONE, 'Invalid Nigerian phone number'),
    }),
  }),

  portalLocationUpdate: z.object({
    body: z.object({
      proposed_latitude: z
        .number()
        .min(-90, 'Latitude must be between -90 and 90')
        .max(90, 'Latitude must be between -90 and 90'),
      proposed_longitude: z
        .number()
        .min(-180, 'Longitude must be between -180 and 180')
        .max(180, 'Longitude must be between -180 and 180'),
      proposed_ward: z.string().max(100).optional().nullable(),
      proposed_address: z.string().max(1000).optional().nullable(),
      accuracy_meters: z
        .number()
        .min(0, 'GPS accuracy cannot be negative')
        .max(100000)
        .optional()
        .nullable(),
      student_note: z.string().max(500).optional().nullable(),
    }),
  }),
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Minimum distance (metres) a re-submission must move an already-approved
 * location before it is treated as a real correction rather than noise.
 */
const MIN_CORRECTION_DISTANCE_M = 25;

function getInstitutionId(req) {
  if (req.params.institutionId) return parseInt(req.params.institutionId);
  const id = req.student?.institution_id || req.user?.institution_id;
  return id ? parseInt(id) : null;
}

async function getCurrentSession(institutionId) {
  const [session] = await query(
    'SELECT * FROM academic_sessions WHERE institution_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1',
    [institutionId]
  );
  return session || null;
}

async function isFeatureEnabled(featureKey, institutionId) {
  const [feature] = await query(
    `SELECT ift.is_enabled
     FROM institution_feature_toggles ift
     JOIN feature_toggles ft ON ift.feature_toggle_id = ft.id
     WHERE ft.feature_key = ? AND ift.institution_id = ?`,
    [featureKey, institutionId]
  );
  return feature?.is_enabled === 1;
}

async function getApprovedAcceptance(studentId, sessionId, institutionId) {
  return queryOne(
    `SELECT sa.id, sa.institution_school_id, sa.phone AS student_phone,
            isv.master_school_id,
            ms.name  AS school_name,
            ms.official_code AS school_code,
            ms.state AS school_state,
            ms.lga   AS school_lga,
            ms.ward  AS school_ward,
            ms.address AS school_address,
            ms.principal_name, ms.principal_phone,
            ST_X(ms.location) AS longitude,
            ST_Y(ms.location) AS latitude
     FROM student_acceptances sa
     JOIN institution_schools isv ON isv.id = sa.institution_school_id
     JOIN master_schools ms ON ms.id = isv.master_school_id
     WHERE sa.student_id = ? AND sa.session_id = ? AND sa.institution_id = ? AND sa.status = 'approved'`,
    [studentId, sessionId, institutionId]
  );
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapsUrl(latitude, longitude) {
  if (latitude === null || longitude === null) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Fetch the school record (with its current coordinates) for an
 * institution_school_id, scoped to the institution.
 */
async function getSchoolRecord(institutionSchoolId, institutionId) {
  return queryOne(
    `SELECT isv.id AS institution_school_id, isv.master_school_id,
            ms.name  AS school_name,
            ms.official_code AS school_code,
            ms.state AS school_state,
            ms.lga   AS school_lga,
            ms.ward  AS school_ward,
            ms.address AS school_address,
            ST_X(ms.location) AS longitude,
            ST_Y(ms.location) AS latitude
     FROM institution_schools isv
     JOIN master_schools ms ON ms.id = isv.master_school_id
     WHERE isv.id = ? AND isv.institution_id = ?`,
    [institutionSchoolId, institutionId]
  );
}

/**
 * Has a student from a DIFFERENT institution already had this school's
 * shared GPS point approved?
 *
 * master_schools.location is one row shared by every institution linked to
 * the school, so a point confirmed on the ground by another institution's
 * student is just as real for ours - asking our students to redo that work is
 * pure duplication.
 *
 * DELIBERATE CROSS-INSTITUTION READ. This is the one query here that is not
 * scoped by institution_id, so it returns a timestamp and nothing else: no
 * institution, no student, no note, no contributor. Keep it that way.
 */
async function getExternalVerification(masterSchoolId, institutionSchoolId) {
  if (!masterSchoolId) return null;

  const row = await queryOne(
    `SELECT r.reviewed_at
     FROM school_location_update_requests r
     JOIN institution_schools isv ON isv.id = r.institution_school_id
     WHERE isv.master_school_id = ?
       AND r.institution_school_id <> ?
       AND r.status = 'approved'
       AND r.reviewed_at IS NOT NULL
     ORDER BY r.reviewed_at DESC
     LIMIT 1`,
    [masterSchoolId, institutionSchoolId]
  );

  return row ? { verified_at: row.reviewed_at } : null;
}

/**
 * Shape one location update request row for student consumption.
 * Contributor phone is deliberately never exposed to other students.
 */
function shapeLocationRequest(row, studentId) {
  if (!row) return null;
  const latitude = toNumber(row.proposed_latitude);
  const longitude = toNumber(row.proposed_longitude);
  return {
    id: row.id,
    status: row.status,
    latitude,
    longitude,
    maps_url: mapsUrl(latitude, longitude),
    ward: row.proposed_ward || null,
    address: row.proposed_address || null,
    accuracy_meters: toNumber(row.accuracy_meters),
    note: row.student_note || null,
    submitted_by: row.contributor_name || null,
    is_mine: row.student_id != null && Number(row.student_id) === Number(studentId),
    rejection_reason: row.rejection_reason || null,
    submitted_at: row.created_at,
    reviewed_at: row.reviewed_at || null,
  };
}

/**
 * Single source of truth for "where does my school's location stand?".
 *
 * Used by both the dedicated location page and the dashboard/sidebar status so
 * the student never sees two different answers in two different places.
 *
 * Statuses:
 *   not_applicable - no session / acceptance not approved yet
 *   missing        - no coordinates on record and nothing awaiting review
 *   pending        - a request is awaiting the TP unit's review
 *   verified       - a student-submitted request was approved this session
 *   recorded       - coordinates exist from institution records but were never
 *                    confirmed on the ground by a student this session
 */
async function buildSchoolLocationStatus({
  institutionId,
  session,
  studentId,
  institutionSchoolId = null,
  acceptanceApproved = null,
  includeHistory = false,
}) {
  const base = {
    active_session: !!session,
    status: 'not_applicable',
    feature_enabled: false,
    acceptance_approved: false,
    has_coordinates: false,
    is_verified: false,
    action_required: false,
    can_submit: false,
    requires_note: false,
    school: null,
    location: null,
    pending_request: null,
    last_request: null,
    external_verification: null,
    history: includeHistory ? [] : undefined,
    max_gps_accuracy_meters: session?.max_gps_accuracy_meters ?? null,
  };

  if (!session) return base;

  let schoolId = institutionSchoolId;
  let record = null;

  if (acceptanceApproved === false) {
    return base;
  }

  if (schoolId) {
    record = await getSchoolRecord(schoolId, institutionId);
  } else {
    record = await getApprovedAcceptance(studentId, session.id, institutionId);
    schoolId = record?.institution_school_id || null;
  }

  if (!record || !schoolId) return base;

  base.acceptance_approved = true;
  base.feature_enabled = await isFeatureEnabled('location_update', institutionId);

  const requests = await query(
    `SELECT id, status, student_id, proposed_latitude, proposed_longitude,
            proposed_ward, proposed_address, accuracy_meters, student_note,
            contributor_name, rejection_reason, created_at, reviewed_at
     FROM school_location_update_requests
     WHERE institution_school_id = ? AND session_id = ? AND institution_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [schoolId, session.id, institutionId]
  );

  const pendingRow = requests.find((r) => r.status === 'pending') || null;
  const approvedRow = requests.find((r) => r.status === 'approved') || null;

  // Only worth asking about when our own institution has not settled it
  const externalVerification =
    pendingRow || approvedRow
      ? null
      : await getExternalVerification(record.master_school_id, schoolId);

  const latitude = toNumber(record.latitude);
  const longitude = toNumber(record.longitude);
  const hasCoordinates = latitude !== null && longitude !== null;

  base.school = {
    id: schoolId,
    name: record.school_name,
    code: record.school_code || null,
    state: record.school_state || null,
    lga: record.school_lga || null,
    ward: record.school_ward || null,
    address: record.school_address || null,
  };

  base.location = {
    latitude,
    longitude,
    maps_url: mapsUrl(latitude, longitude),
    // Where the coordinates on record came from, as far as this session knows
    source: approvedRow ? 'student_verified' : hasCoordinates ? 'institution_record' : null,
    verified_at: approvedRow?.reviewed_at || null,
  };

  base.has_coordinates = hasCoordinates;
  base.is_verified = !!approvedRow && hasCoordinates;
  base.pending_request = shapeLocationRequest(pendingRow, studentId);
  base.last_request = shapeLocationRequest(requests[0] || null, studentId);
  base.external_verification = hasCoordinates ? externalVerification : null;

  if (base.external_verification) {
    base.location.source = 'externally_verified';
  }

  if (pendingRow) {
    base.status = 'pending';
  } else if (base.is_verified) {
    base.status = 'verified';
  } else if (hasCoordinates) {
    base.status = 'recorded';
  } else {
    base.status = 'missing';
  }

  // A student may correct a location that has already been confirmed - by our own
  // TP unit or by another institution sharing this school - but must say why.
  base.requires_note = base.status === 'verified' || !!base.external_verification;
  base.can_submit = base.feature_enabled && !pendingRow;
  base.action_required = base.feature_enabled && base.status === 'missing';
  base.min_correction_distance_m = MIN_CORRECTION_DISTANCE_M;

  if (includeHistory) {
    base.history = requests.map((row) => shapeLocationRequest(row, studentId));
  }

  return base;
}

// ============================================================================
// PORTAL - STUDENT FACING
// ============================================================================

/**
 * GET /portal/my-school/principal
 * Returns principal info for the student's assigned school.
 */
const getMySchoolPrincipal = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    const session = await getCurrentSession(institutionId);
    if (!session) {
      return res.json({ success: true, data: { active_session: false } });
    }

    const acceptance = await getApprovedAcceptance(studentId, session.id, institutionId);
    if (!acceptance) {
      return res.json({
        success: true,
        data: {
          active_session: true,
          session: { id: session.id, name: session.name },
          acceptance: { approved: false },
        },
      });
    }

    const featureEnabled = await isFeatureEnabled('principal_update', institutionId);

    const pending = await queryOne(
      `SELECT id FROM school_principal_update_requests
       WHERE institution_school_id = ? AND session_id = ? AND status = 'pending'`,
      [acceptance.institution_school_id, session.id]
    );
    const pendingRequestExists = !!pending;

    return res.json({
      success: true,
      data: {
        active_session: true,
        session: { id: session.id, name: session.name },
        acceptance: {
          approved: true,
          school_id: acceptance.institution_school_id,
          school_name: acceptance.school_name,
          school_code: acceptance.school_code,
          school_state: acceptance.school_state,
          school_lga: acceptance.school_lga,
          school_ward: acceptance.school_ward || null,
          school_address: acceptance.school_address || null,
        },
        principal: {
          current_name: acceptance.principal_name || null,
          current_phone: acceptance.principal_phone || null,
        },
        feature_enabled: featureEnabled,
        pending_request_exists: pendingRequestExists,
        can_submit: featureEnabled && !pendingRequestExists,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /portal/my-school/principal-update
 * Submit a principal update request for the student's assigned school.
 */
const submitMyPrincipalUpdate = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;
    const { proposed_principal_name, proposed_principal_phone } = req.body;

    const session = await getCurrentSession(institutionId);
    if (!session) throw new ValidationError('No active session');

    const acceptance = await getApprovedAcceptance(studentId, session.id, institutionId);
    if (!acceptance) {
      throw new ValidationError('Your acceptance must be approved before submitting a school update');
    }

    const featureEnabled = await isFeatureEnabled('principal_update', institutionId);
    if (!featureEnabled) {
      throw new ValidationError('Principal update requests are not enabled for this institution');
    }

    const existing = await queryOne(
      `SELECT id FROM school_principal_update_requests
       WHERE institution_school_id = ? AND session_id = ? AND status IN ('pending', 'approved')`,
      [acceptance.institution_school_id, session.id]
    );
    if (existing) {
      throw new ValidationError('A request has already been submitted for your school in this session');
    }

    const student = await queryOne('SELECT full_name FROM students WHERE id = ?', [studentId]);

    await query(
      `INSERT INTO school_principal_update_requests
         (institution_id, session_id, institution_school_id,
          proposed_principal_name, proposed_principal_phone,
          previous_principal_name, previous_principal_phone,
          contributor_name, contributor_phone, ip_address, user_agent, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        institutionId,
        session.id,
        acceptance.institution_school_id,
        proposed_principal_name,
        proposed_principal_phone,
        acceptance.principal_name || null,
        acceptance.principal_phone || null,
        student?.full_name || null,
        acceptance.student_phone || null,
        req.ip || null,
        req.get('user-agent') || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully. It will be reviewed by the institution.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /portal/my-school/location
 * Returns the full GPS location status for the student's assigned school,
 * including anything awaiting review and the submission history for the session.
 */
const getMySchoolLocation = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    const session = await getCurrentSession(institutionId);
    if (!session) {
      return res.json({ success: true, data: { active_session: false } });
    }

    const status = await buildSchoolLocationStatus({
      institutionId,
      session,
      studentId,
      includeHistory: true,
    });

    return res.json({
      success: true,
      data: {
        ...status,
        session: { id: session.id, name: session.name },
        pending_request_exists: !!status.pending_request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /portal/my-school/location-update
 * Submit a GPS location update request for the student's assigned school.
 */
const submitMyLocationUpdate = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;
    const {
      proposed_latitude,
      proposed_longitude,
      proposed_ward,
      proposed_address,
      accuracy_meters,
      student_note,
    } = req.body;

    const session = await getCurrentSession(institutionId);
    if (!session) throw new ValidationError('No active session');

    const acceptance = await getApprovedAcceptance(studentId, session.id, institutionId);
    if (!acceptance) {
      throw new ValidationError('Your acceptance must be approved before submitting a school update');
    }

    const featureEnabled = await isFeatureEnabled('location_update', institutionId);
    if (!featureEnabled) {
      throw new ValidationError('Location update requests are not enabled for this institution');
    }

    const pending = await queryOne(
      `SELECT id, contributor_name, student_id FROM school_location_update_requests
       WHERE institution_school_id = ? AND session_id = ? AND institution_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [acceptance.institution_school_id, session.id, institutionId]
    );
    if (pending) {
      throw new ValidationError(
        Number(pending.student_id) === Number(studentId)
          ? 'You already have a location request awaiting review for this school'
          : 'A location request for your school is already awaiting review'
      );
    }

    const approved = await queryOne(
      `SELECT id FROM school_location_update_requests
       WHERE institution_school_id = ? AND session_id = ? AND institution_id = ? AND status = 'approved'
       ORDER BY reviewed_at DESC LIMIT 1`,
      [acceptance.institution_school_id, session.id, institutionId]
    );

    // The GPS point is shared with every other institution posted here, so a
    // confirmation by any of them counts as settled - otherwise the two
    // TP units can approve competing points back and forth forever.
    const externalVerification = approved
      ? null
      : await getExternalVerification(
          acceptance.master_school_id,
          acceptance.institution_school_id
        );

    const note = typeof student_note === 'string' ? student_note.trim() : '';

    // Correcting an already-confirmed location is allowed, but it has to be a
    // deliberate act: a real reason and a materially different position.
    if (approved || externalVerification) {
      if (note.length < 10) {
        throw new ValidationError(
          approved
            ? 'This school already has an approved location. Please explain why it needs to be corrected (at least 10 characters).'
            : 'This school’s location has already been confirmed by another institution posted here. Please explain why it needs to be corrected (at least 10 characters).'
        );
      }

      const currentLat = toNumber(acceptance.latitude);
      const currentLng = toNumber(acceptance.longitude);
      if (currentLat !== null && currentLng !== null) {
        const moved = distanceMeters(currentLat, currentLng, proposed_latitude, proposed_longitude);
        if (moved !== null && moved < MIN_CORRECTION_DISTANCE_M) {
          throw new ValidationError(
            `The location on record is already within ${Math.round(moved)} m of the coordinates you submitted, so no correction is needed.`
          );
        }
      }
    }

    const maxAccuracy = session.max_gps_accuracy_meters || null;
    const accuracy = toNumber(accuracy_meters);
    if (accuracy !== null && maxAccuracy && accuracy > maxAccuracy) {
      throw new ValidationError(
        `Your GPS reading is only accurate to ±${Math.round(accuracy)} m. Move outdoors, away from buildings, and try again (max ±${maxAccuracy} m).`
      );
    }

    const student = await queryOne('SELECT full_name FROM students WHERE id = ?', [studentId]);

    try {
      await query(
        `INSERT INTO school_location_update_requests
           (institution_id, session_id, institution_school_id, student_id,
            proposed_latitude, proposed_longitude, proposed_ward, proposed_address,
            accuracy_meters, student_note,
            previous_latitude, previous_longitude,
            contributor_name, contributor_phone, ip_address, user_agent, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          institutionId,
          session.id,
          acceptance.institution_school_id,
          studentId,
          proposed_latitude,
          proposed_longitude,
          proposed_ward || null,
          proposed_address || null,
          accuracy,
          note || null,
          toNumber(acceptance.latitude),
          toNumber(acceptance.longitude),
          student?.full_name || null,
          acceptance.student_phone || null,
          req.ip || null,
          req.get('user-agent') || null,
        ]
      );
    } catch (error) {
      // Two students can race the same school; the unique pending key wins
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ValidationError('A location request for your school is already awaiting review');
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'Location submitted. The TP unit will review and apply it.',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  schemas,
  getMySchoolPrincipal,
  submitMyPrincipalUpdate,
  getMySchoolLocation,
  submitMyLocationUpdate,
  buildSchoolLocationStatus,
};
