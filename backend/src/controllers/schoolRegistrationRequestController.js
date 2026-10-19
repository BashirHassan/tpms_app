/**
 * School Registration Request Controller
 *
 * Lets a student request that a brand-new school be added to the central
 * registry when it isn't already in their institution's list. Super admin
 * reviews the request; approval creates (or reuses) a master_schools row and
 * links it to the requesting institution via institution_schools.
 *
 * MedeePay Pattern: Direct SQL, no repository layer.
 */

const { z } = require('zod');
const { query, queryOne, transaction } = require('../db/database');
const { NotFoundError, ValidationError, AuthorizationError, ConflictError } = require('../utils/errors');
const { normalizeLocationValue, normalizeOptionalLocationValue, normalizeSchoolName } = require('../utils/locationNormalizer');

const schemas = {
  submit: z.object({
    body: z.object({
      name: z.string().min(2, 'School name must be at least 2 characters'),
      official_code: z.string().optional().nullable(),
      school_type: z.enum(['primary', 'junior', 'senior', 'both'], {
        errorMap: () => ({ message: 'School type is required' }),
      }),
      category: z.enum(['public', 'private', 'others'], {
        errorMap: () => ({ message: 'Category is required' }),
      }),
      state: z.string().min(1, 'State is required'),
      lga: z.string().min(1, 'LGA is required'),
      ward: z.string().optional().nullable(),
      address: z.string().min(3, 'Address is required'),
    }),
  }),
  // Full replace of the editable fields, same shape as submit
  update: z.object({
    body: z.object({
      name: z.string().min(2, 'School name must be at least 2 characters'),
      official_code: z.string().optional().nullable(),
      school_type: z.enum(['primary', 'junior', 'senior', 'both'], {
        errorMap: () => ({ message: 'School type is required' }),
      }),
      category: z.enum(['public', 'private', 'others'], {
        errorMap: () => ({ message: 'Category is required' }),
      }),
      state: z.string().min(1, 'State is required'),
      lga: z.string().min(1, 'LGA is required'),
      ward: z.string().optional().nullable(),
      address: z.string().min(3, 'Address is required'),
    }),
  }),
  // expected_resubmit_count is the edit count the reviewer was looking at; a
  // mismatch means the student changed the request after the reviewer opened it
  approve: z.object({
    body: z.object({
      expected_resubmit_count: z.number().int().min(0).optional(),
    }).optional().default({}),
  }),
  reject: z.object({
    body: z.object({
      rejection_reason: z.string().min(5, 'Rejection reason must be at least 5 characters'),
      expected_resubmit_count: z.number().int().min(0).optional(),
    }),
  }),
};

const DUPLICATE_REQUEST_MESSAGE = 'You already have a pending or approved school registration request for this session';

/**
 * Refuses to act on a request the student has edited since the reviewer loaded
 * it, so a reviewer never approves or rejects details they haven't seen.
 * Callers that don't send a count are not checked.
 */
function assertNotEditedSince(request, expectedResubmitCount) {
  if (expectedResubmitCount === undefined || expectedResubmitCount === null) return;
  if (request.resubmit_count !== expectedResubmitCount) {
    throw new ConflictError(
      'The student has edited this request since you opened it. Reload the list to review the latest details.'
    );
  }
}

// Students type these freehand - store them in the registry's upper-case form
function normalizeRequestFields({ name, state, lga, ward }) {
  return {
    name: normalizeSchoolName(name),
    state: normalizeLocationValue(state),
    lga: normalizeLocationValue(lga),
    ward: normalizeOptionalLocationValue(ward),
  };
}

async function resolveCurrentSession(institutionId) {
  return queryOne(
    `SELECT * FROM academic_sessions WHERE institution_id = ? AND is_current = 1 AND status = 'active' LIMIT 1`,
    [institutionId]
  );
}

/**
 * GET /portal/school-registration-requests/status
 */
const getStudentRequestStatus = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    const session = await resolveCurrentSession(institutionId);
    if (!session) {
      return res.json({ success: true, data: null });
    }

    const request = await queryOne(
      `SELECT * FROM school_registration_requests
       WHERE student_id = ? AND session_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, session.id]
    );

    res.json({ success: true, data: request || null });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /portal/school-registration-requests/search-master
 */
const searchMasterSchools = async (req, res, next) => {
  try {
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    if (!institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const results = await query(
      `SELECT ms.id, ms.name, ms.official_code, ms.school_type, ms.category,
              ms.state, ms.lga, ms.ward,
              isv.id AS institution_school_id,
              CASE WHEN isv.id IS NOT NULL THEN 1 ELSE 0 END AS linked_to_institution
       FROM master_schools ms
       LEFT JOIN institution_schools isv
         ON isv.master_school_id = ms.id AND isv.institution_id = ?
       WHERE ms.status = 'active' AND ms.name LIKE ?
       ORDER BY linked_to_institution DESC, ms.name ASC
       LIMIT 8`,
      [institutionId, `%${q}%`]
    );

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /portal/school-registration-requests
 */
const submitRequest = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    const { name: rawName, official_code, school_type, category, state: rawState, lga: rawLga, ward: rawWard, address } = req.body;

    const { name, state, lga, ward } = normalizeRequestFields({
      name: rawName,
      state: rawState,
      lga: rawLga,
      ward: rawWard,
    });

    const session = await resolveCurrentSession(institutionId);
    if (!session) {
      throw new ValidationError('No active teaching practice session');
    }

    const existing = await queryOne(
      `SELECT id, status FROM school_registration_requests
       WHERE student_id = ? AND session_id = ? AND status IN ('pending', 'approved')`,
      [studentId, session.id]
    );
    if (existing) {
      throw new ValidationError(DUPLICATE_REQUEST_MESSAGE);
    }

    let insertId;
    try {
      const result = await query(
        `INSERT INTO school_registration_requests
           (institution_id, session_id, student_id, name, official_code, school_type, category, state, lga, ward, address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          institutionId,
          session.id,
          studentId,
          name.trim(),
          official_code ? official_code.trim() : null,
          school_type,
          category,
          state,
          lga,
          ward,
          address.trim(),
        ]
      );
      insertId = result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ValidationError(DUPLICATE_REQUEST_MESSAGE);
      }
      throw error;
    }

    const created = await queryOne(`SELECT * FROM school_registration_requests WHERE id = ?`, [insertId]);

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /portal/school-registration-requests/:id
 * Student corrects their own request while it is pending or after a rejection.
 * A rejected request goes back to pending; the rejection reason it carried is
 * kept in previous_rejection_reason so the reviewer can see what was flagged.
 */
const updateRequest = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    const { name: rawName, official_code, school_type, category, state: rawState, lga: rawLga, ward: rawWard, address } = req.body;

    const { name, state, lga, ward } = normalizeRequestFields({
      name: rawName,
      state: rawState,
      lga: rawLga,
      ward: rawWard,
    });

    const requestId = parseInt(req.params.id);

    try {
      await transaction(async (conn) => {
        // Lock so a concurrent approve/reject can't land between the status check and the update
        const [rows] = await conn.execute(
          `SELECT * FROM school_registration_requests
           WHERE id = ? AND student_id = ? AND institution_id = ? FOR UPDATE`,
          [requestId, studentId, institutionId]
        );
        const current = rows[0];

        if (!current) throw new NotFoundError('School registration request not found');
        if (current.status === 'approved') {
          throw new ConflictError('This request has already been approved and can no longer be edited');
        }

        // Only the current session's request can be reopened, and only if the
        // student has no other live request there (submitRequest allows a fresh
        // one after a rejection, so an older rejected row must not be revived
        // alongside it).
        const [sessionRows] = await conn.execute(
          `SELECT id FROM academic_sessions WHERE institution_id = ? AND is_current = 1 AND status = 'active' LIMIT 1`,
          [institutionId]
        );
        if (!sessionRows[0] || sessionRows[0].id !== current.session_id) {
          throw new ConflictError('This request belongs to a previous session and can no longer be edited');
        }

        const [otherRows] = await conn.execute(
          `SELECT id FROM school_registration_requests
           WHERE student_id = ? AND session_id = ? AND id <> ? AND status IN ('pending', 'approved') LIMIT 1`,
          [studentId, current.session_id, requestId]
        );
        if (otherRows[0]) {
          throw new ConflictError(DUPLICATE_REQUEST_MESSAGE);
        }

        await conn.execute(
          `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
           VALUES (?, ?, 'student', 'school_request_resubmitted', 'school_registration_request', ?, ?, ?)`,
          [
            institutionId,
            studentId,
            requestId,
            JSON.stringify({
              previous_status: current.status,
              previous_rejection_reason: current.rejection_reason,
              previous_values: {
                name: current.name,
                official_code: current.official_code,
                school_type: current.school_type,
                category: current.category,
                state: current.state,
                lga: current.lga,
                ward: current.ward,
                address: current.address,
              },
            }),
            req.ip,
          ]
        );

        // Only a rejected row carries a reason to remember; editing a pending row
        // again must not wipe the one saved by an earlier correction.
        const previousReason =
          current.status === 'rejected' ? current.rejection_reason : current.previous_rejection_reason;

        await conn.execute(
          `UPDATE school_registration_requests
           SET name = ?, official_code = ?, school_type = ?, category = ?, state = ?, lga = ?, ward = ?, address = ?,
               status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL,
               previous_rejection_reason = ?, resubmitted_at = NOW(), resubmit_count = resubmit_count + 1
           WHERE id = ?`,
          [
            name.trim(),
            official_code ? official_code.trim() : null,
            school_type,
            category,
            state,
            lga,
            ward,
            address.trim(),
            previousReason || null,
            requestId,
          ]
        );
      });
    } catch (error) {
      // pending_unique_key allows one live request per student per session
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictError(DUPLICATE_REQUEST_MESSAGE);
      }
      throw error;
    }

    const updated = await queryOne(`SELECT * FROM school_registration_requests WHERE id = ?`, [requestId]);

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /global/school-registration-requests
 */
const getAll = async (req, res, next) => {
  try {
    const { status, session_id, institution_id, search, page = 1, limit = 20 } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('srr.status = ?');
      params.push(status);
    }
    if (session_id) {
      conditions.push('srr.session_id = ?');
      params.push(parseInt(session_id));
    }
    if (institution_id) {
      conditions.push('srr.institution_id = ?');
      params.push(parseInt(institution_id));
    }
    if (search) {
      conditions.push('(s.full_name LIKE ? OR s.registration_number LIKE ? OR srr.name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult] = await query(
      `SELECT COUNT(*) as total
       FROM school_registration_requests srr
       JOIN students s ON srr.student_id = s.id
       ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const rows = await query(
      `SELECT srr.*,
              s.full_name AS student_name, s.registration_number,
              i.name AS institution_name,
              sess.name AS session_name,
              u.name AS reviewed_by_name
       FROM school_registration_requests srr
       JOIN students s ON srr.student_id = s.id
       JOIN institutions i ON srr.institution_id = i.id
       JOIN academic_sessions sess ON srr.session_id = sess.id
       LEFT JOIN users u ON srr.reviewed_by = u.id
       ${whereClause}
       ORDER BY COALESCE(srr.resubmitted_at, srr.created_at) ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /global/school-registration-requests/stats
 */
const getStats = async (req, res, next) => {
  try {
    const { session_id, institution_id } = req.query;
    const conditions = [];
    const params = [];

    if (session_id) {
      conditions.push('session_id = ?');
      params.push(parseInt(session_id));
    }
    if (institution_id) {
      conditions.push('institution_id = ?');
      params.push(parseInt(institution_id));
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
      `SELECT status, COUNT(*) as count FROM school_registration_requests ${whereClause} GROUP BY status`,
      params
    );

    const stats = { pending: 0, approved: 0, rejected: 0 };
    rows.forEach((row) => {
      stats[row.status] = row.count;
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /global/school-registration-requests/:id
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const request = await queryOne(
      `SELECT srr.*,
              s.full_name AS student_name, s.registration_number, s.email AS student_email,
              i.name AS institution_name,
              sess.name AS session_name,
              u.name AS reviewed_by_name
       FROM school_registration_requests srr
       JOIN students s ON srr.student_id = s.id
       JOIN institutions i ON srr.institution_id = i.id
       JOIN academic_sessions sess ON srr.session_id = sess.id
       LEFT JOIN users u ON srr.reviewed_by = u.id
       WHERE srr.id = ?`,
      [parseInt(id)]
    );

    if (!request) {
      throw new NotFoundError('School registration request not found');
    }

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /global/school-registration-requests/:id/approve
 */
const approve = async (req, res, next) => {
  try {
    const { id } = req.params;
    let requestId;

    await transaction(async (conn) => {
      // Lock the row for the duration of the transaction so concurrent
      // approve/reject calls for the same request can't both pass the
      // pending check before either one commits.
      const [rows] = await conn.execute(
        `SELECT * FROM school_registration_requests WHERE id = ? FOR UPDATE`,
        [parseInt(id)]
      );
      const request = rows[0];
      if (!request) throw new NotFoundError('School registration request not found');
      if (request.status !== 'pending') {
        throw new ValidationError(`Request is already ${request.status}`);
      }
      assertNotEditedSince(request, req.body?.expected_resubmit_count);
      // Requests filed before names were normalised on submit may be mixed-case
      request.name = normalizeSchoolName(request.name);

      let masterSchoolId;
      const [existingMaster] = await conn.execute(
        `SELECT id FROM master_schools WHERE name = ? AND UPPER(state) = ? AND UPPER(lga) = ? AND status = 'active'`,
        [request.name, request.state, request.lga]
      );

      if (existingMaster.length > 0) {
        masterSchoolId = existingMaster[0].id;
      } else {
        const [insertResult] = await conn.execute(
          `INSERT INTO master_schools (name, official_code, school_type, category, state, lga, ward, address, created_by_institution_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            request.name,
            request.official_code || null,
            request.school_type,
            request.category,
            request.state,
            request.lga,
            request.ward,
            request.address || null,
            request.institution_id,
          ]
        );
        masterSchoolId = insertResult.insertId;
      }

      let institutionSchoolId;
      const [existingLink] = await conn.execute(
        `SELECT id FROM institution_schools WHERE institution_id = ? AND master_school_id = ?`,
        [request.institution_id, masterSchoolId]
      );

      if (existingLink.length > 0) {
        institutionSchoolId = existingLink[0].id;
      } else {
        const [linkResult] = await conn.execute(
          `INSERT INTO institution_schools (institution_id, master_school_id) VALUES (?, ?)`,
          [request.institution_id, masterSchoolId]
        );
        institutionSchoolId = linkResult.insertId;
      }

      // Guard repeated in case the row lock semantics ever change - keeps
      // this update from silently re-approving.
      const [updateResult] = await conn.execute(
        `UPDATE school_registration_requests
         SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(),
             created_master_school_id = ?, created_institution_school_id = ?
         WHERE id = ? AND status = 'pending'`,
        [req.user.id, masterSchoolId, institutionSchoolId, request.id]
      );
      if (updateResult.affectedRows === 0) {
        throw new ValidationError(`Request is already ${request.status}`);
      }

      requestId = request.id;
    });

    const updated = await queryOne(`SELECT * FROM school_registration_requests WHERE id = ?`, [requestId]);

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /global/school-registration-requests/:id/reject
 */
const reject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    let requestId;

    await transaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT id, status, resubmit_count FROM school_registration_requests WHERE id = ? FOR UPDATE`,
        [parseInt(id)]
      );
      const request = rows[0];
      if (!request) throw new NotFoundError('School registration request not found');
      if (request.status !== 'pending') {
        throw new ValidationError(`Request is already ${request.status}`);
      }
      assertNotEditedSince(request, req.body?.expected_resubmit_count);

      const [updateResult] = await conn.execute(
        `UPDATE school_registration_requests
         SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [rejection_reason, req.user.id, request.id]
      );
      if (updateResult.affectedRows === 0) {
        throw new ValidationError(`Request is already ${request.status}`);
      }

      requestId = request.id;
    });

    const updated = await queryOne(`SELECT * FROM school_registration_requests WHERE id = ?`, [requestId]);

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getStudentRequestStatus,
  searchMasterSchools,
  submitRequest,
  updateRequest,
  getAll,
  getStats,
  getById,
  approve,
  reject,
};
