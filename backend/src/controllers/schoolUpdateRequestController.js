/**
 * School Update Request Controller (MedeePay Pattern)
 * 
 * Handles admin operations for reviewing school update requests.
 * Uses direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const { distanceMeters } = require('../utils/geo');

/**
 * How recently another institution must have moved the shared point for it to be
 * worth warning about. Migration 061 backfills provenance from historical approved
 * requests, so without this window every long-settled school would raise a
 * "another institution moved this" alarm about something that happened years ago.
 */
const RECENT_MOVE_DAYS = 120;

/**
 * Warn an approver when the shared master_schools.location they are about to
 * overwrite was recently moved by a DIFFERENT institution.
 *
 * Only the timestamp, the age and the distance are exposed - never the other
 * institution's identity - so this stays non-identifying across tenants.
 */
function buildLocationProvenance(request, institutionId) {
  const movedAt = request.location_updated_at || null;
  const movedBy = request.location_updated_by_institution_id;

  if (!movedAt || movedBy == null) return null;

  const daysAgo = Math.max(0, Math.floor((Date.now() - new Date(movedAt).getTime()) / 86400000));
  const byOtherInstitution =
    Number(movedBy) !== Number(institutionId) && daysAgo <= RECENT_MOVE_DAYS;

  if (!byOtherInstitution) {
    return { moved_at: movedAt, by_other_institution: false, days_ago: daysAgo, distance_m: null };
  }

  const distance = distanceMeters(
    request.current_latitude,
    request.current_longitude,
    request.proposed_latitude,
    request.proposed_longitude
  );

  return {
    moved_at: movedAt,
    by_other_institution: true,
    days_ago: daysAgo,
    distance_m: distance === null ? null : Math.round(distance),
  };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  approve: z.object({
    body: z.object({
      admin_notes: z.string().max(500).optional().nullable(),
    }),
  }),

  reject: z.object({
    body: z.object({
      rejection_reason: z.string().min(5, 'Please provide a reason for rejection').max(500),
      admin_notes: z.string().max(500).optional().nullable(),
    }),
  }),

  bulkApprove: z.object({
    body: z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one request').max(200),
      admin_notes: z.string().max(500).optional().nullable(),
    }),
  }),

  approveAll: z.object({
    body: z.object({
      session_id: z.coerce.number().int().positive().optional().nullable(),
      search: z.string().max(200).optional().nullable(),
      preview: z.boolean().optional(),
      max_id: z.coerce.number().int().positive().optional().nullable(),
      admin_notes: z.string().max(500).optional().nullable(),
    }),
  }),
};

// ============================================================================
// APPROVAL HELPERS (shared by single and bulk approve)
// ============================================================================

/**
 * Mark a request approved, guarding on status so a request approved or rejected
 * by someone else in the meantime is never processed twice. Throwing here rolls
 * back the surrounding transaction, including the school update.
 */
async function markApproved(conn, table, requestId, institutionId, userId, adminNotes) {
  const [result] = await conn.execute(
    `UPDATE ${table}
     SET status = 'approved', reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
     WHERE id = ? AND institution_id = ? AND status = 'pending'`,
    [userId, adminNotes, requestId, institutionId]
  );
  if (result.affectedRows === 0) {
    throw new ConflictError('Request has already been processed');
  }
}

async function applyPrincipalApproval(conn, request, institutionId, userId, adminNotes) {
  // Get the master_school_id from the institution_school
  const [isv] = await conn.execute(
    'SELECT master_school_id FROM institution_schools WHERE id = ?',
    [request.institution_school_id]
  );

  if (isv.length > 0) {
    // Update the master_school with new principal info
    await conn.execute(
      `UPDATE master_schools SET principal_name = ?, principal_phone = ?, updated_at = NOW()
       WHERE id = ?`,
      [request.proposed_principal_name, request.proposed_principal_phone,
       isv[0].master_school_id]
    );
  }

  await markApproved(conn, 'school_principal_update_requests', request.id, institutionId, userId, adminNotes);
}

async function applyLocationApproval(conn, request, institutionId, userId, adminNotes) {
  // Get the master_school_id from the institution_school
  const [isv] = await conn.execute(
    'SELECT master_school_id FROM institution_schools WHERE id = ?',
    [request.institution_school_id]
  );

  if (isv.length > 0) {
    // master_schools.location is shared across every institution linked to this
    // school - stamp who moved it so the next institution to review a request
    // can be warned before overwriting this correction.
    // Stored as POINT(latitude longitude) - verified against live data
    // (GDJSS Jalo Waziri Gombe reads ST_X=10.2882, ST_Y=11.1590; Gombe town
    // is 10.290 N, 11.167 E). Writing longitude-first here would leave this
    // school's point oriented the opposite way to every other row.
    const updates = ['location = ST_GeomFromText(?, 4326)'];
    const updateParams = [
      `POINT(${request.proposed_latitude} ${request.proposed_longitude})`,
    ];

    if (request.proposed_ward) {
      updates.push('ward = ?');
      updateParams.push(request.proposed_ward);
    }
    if (request.proposed_address) {
      updates.push('address = ?');
      updateParams.push(request.proposed_address);
    }

    updates.push('location_updated_at = NOW()');
    updates.push('location_updated_by_institution_id = ?');
    updateParams.push(institutionId);
    updates.push('updated_at = NOW()');

    await conn.execute(
      `UPDATE master_schools SET ${updates.join(', ')} WHERE id = ?`,
      [...updateParams, isv[0].master_school_id]
    );
  }

  await markApproved(conn, 'school_location_update_requests', request.id, institutionId, userId, adminNotes);
}

/**
 * Approve several pending requests in one transaction (all or nothing).
 *
 * When the selection holds more than one request for the same school, only the
 * newest is applied - approving them all would silently overwrite the school with
 * whichever ran last. The older ones stay pending and are reported as skipped.
 */
async function bulkApprove(req, table, applyApproval) {
  const { institutionId } = req.params;
  const instId = parseInt(institutionId);
  const validation = schemas.bulkApprove.safeParse({ body: req.body });

  if (!validation.success) {
    throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
  }

  const { admin_notes: adminNotes = null } = validation.data.body;
  const ids = [...new Set(validation.data.body.ids)];

  const requests = await query(
    `SELECT * FROM ${table}
     WHERE institution_id = ? AND status = 'pending' AND id IN (${ids.map(() => '?').join(', ')})
     ORDER BY created_at DESC, id DESC`,
    [instId, ...ids]
  );

  const { toApprove, skipped } = keepNewestPerSchool(requests);

  const foundIds = new Set(requests.map((r) => r.id));
  for (const id of ids) {
    if (!foundIds.has(id)) {
      skipped.push({ id, reason: 'Not found or already processed' });
    }
  }

  await approveInTransaction(toApprove, instId, req.user.id, adminNotes, applyApproval);

  return {
    approved: toApprove.map((r) => r.id),
    skipped,
  };
}

/**
 * Split requests (ordered newest first) into the newest per school, which get
 * approved, and older ones for a school already covered, which are skipped.
 */
function keepNewestPerSchool(requests) {
  const toApprove = [];
  const skipped = [];
  const seenSchools = new Set();

  for (const request of requests) {
    if (seenSchools.has(request.institution_school_id)) {
      skipped.push({ id: request.id, reason: 'A newer request for the same school was approved' });
    } else {
      seenSchools.add(request.institution_school_id);
      toApprove.push(request);
    }
  }

  return { toApprove, skipped };
}

async function approveInTransaction(requests, institutionId, userId, adminNotes, applyApproval) {
  if (requests.length === 0) return;
  await transaction(async (conn) => {
    for (const request of requests) {
      await applyApproval(conn, request, institutionId, userId, adminNotes);
    }
  });
}

const APPROVE_ALL_SOURCES = {
  principal: {
    table: 'school_principal_update_requests',
    searchColumns: ['ms.name', 'r.proposed_principal_name', 'r.contributor_name'],
    extraColumns: '',
    applyApproval: applyPrincipalApproval,
  },
  location: {
    table: 'school_location_update_requests',
    searchColumns: ['ms.name', 'r.contributor_name'],
    extraColumns: `,
             ST_Latitude(ms.location) as current_latitude,
             ST_Longitude(ms.location) as current_longitude,
             ms.location_updated_at,
             ms.location_updated_by_institution_id`,
    applyApproval: applyLocationApproval,
  },
};

/**
 * Approve every pending request matching the list filters (session + search),
 * across all pages. With preview: true nothing is written - it returns the counts
 * the confirmation dialog shows, plus max_id. Passing that max_id back on the real
 * call bounds it to what was previewed, so requests submitted in between are not
 * approved unseen.
 */
async function approveAllMatching(req, type) {
  const source = APPROVE_ALL_SOURCES[type];
  const instId = parseInt(req.params.institutionId);
  const validation = schemas.approveAll.safeParse({ body: req.body });

  if (!validation.success) {
    throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
  }

  const { session_id, search, preview, max_id, admin_notes: adminNotes = null } = validation.data.body;

  let sql = `
    SELECT r.*${source.extraColumns}
    FROM ${source.table} r
    LEFT JOIN institution_schools isv ON r.institution_school_id = isv.id
    LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
    WHERE r.institution_id = ? AND r.status = 'pending'
  `;
  const params = [instId];

  if (session_id) {
    sql += ' AND r.session_id = ?';
    params.push(session_id);
  }
  if (search) {
    sql += ` AND (${source.searchColumns.map((col) => `${col} LIKE ?`).join(' OR ')})`;
    params.push(...source.searchColumns.map(() => `%${search}%`));
  }
  if (max_id) {
    sql += ' AND r.id <= ?';
    params.push(max_id);
  }
  sql += ' ORDER BY r.created_at DESC, r.id DESC';

  const requests = await query(sql, params);
  const { toApprove, skipped } = keepNewestPerSchool(requests);

  if (preview) {
    return {
      total: requests.length,
      to_approve: toApprove.length,
      superseded: skipped.length,
      // Only meaningful for location requests - see buildLocationProvenance
      overwrites_other_institution: type === 'location'
        ? toApprove.filter((r) => buildLocationProvenance(r, instId)?.by_other_institution).length
        : 0,
      max_id: requests.reduce((max, r) => Math.max(max, r.id), 0),
    };
  }

  await approveInTransaction(toApprove, instId, req.user.id, adminNotes, source.applyApproval);

  return {
    approved: toApprove.map((r) => r.id),
    skipped,
  };
}

// ============================================================================
// PRINCIPAL UPDATE REQUEST METHODS
// ============================================================================

/**
 * Get all principal update requests
 * GET /:institutionId/school-update-requests/principal
 */
const getPrincipalRequests = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, status, search, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT spur.*, 
             ms.name as school_name, ms.official_code as school_code,
             ms.state, ms.lga, ms.ward,
             ms.principal_name as current_principal_name,
             ms.principal_phone as current_principal_phone,
             sess.name as session_name,
             u.name as reviewed_by_name
      FROM school_principal_update_requests spur
      LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON spur.session_id = sess.id
      LEFT JOIN users u ON spur.reviewed_by = u.id
      WHERE spur.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND spur.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND spur.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (status) {
      sql += ' AND spur.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR spur.proposed_principal_name LIKE ? OR spur.contributor_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    sql += ' ORDER BY spur.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const requests = await query(sql, params);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get principal request by ID
 * GET /:institutionId/school-update-requests/principal/:id
 */
const getPrincipalRequestById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [request] = await query(
      `SELECT spur.*, 
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state, ms.lga, ms.ward,
              ms.principal_name as current_principal_name,
              ms.principal_phone as current_principal_phone,
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_principal_update_requests spur
       LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN academic_sessions sess ON spur.session_id = sess.id
       LEFT JOIN users u ON spur.reviewed_by = u.id
       WHERE spur.id = ? AND spur.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve principal update request
 * POST /:institutionId/school-update-requests/principal/:id/approve
 */
const approvePrincipalRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.approve.safeParse({ body: req.body });
    const adminNotes = validation.success ? validation.data.body.admin_notes : null;

    const [request] = await query(
      `SELECT * FROM school_principal_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await transaction(async (conn) => {
      await applyPrincipalApproval(conn, request, parseInt(institutionId), req.user.id, adminNotes);
    });

    res.json({
      success: true,
      message: 'Request approved successfully. School principal details have been updated.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk approve principal update requests
 * POST /:institutionId/school-update-requests/principal/bulk-approve
 */
const bulkApprovePrincipalRequests = async (req, res, next) => {
  try {
    const result = await bulkApprove(req, 'school_principal_update_requests', applyPrincipalApproval);
    res.json({
      success: true,
      message: `${result.approved.length} request(s) approved`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve all pending principal update requests matching the current filters
 * POST /:institutionId/school-update-requests/principal/approve-all
 */
const approveAllPrincipalRequests = async (req, res, next) => {
  try {
    const result = await approveAllMatching(req, 'principal');
    res.json({
      success: true,
      message: req.body.preview ? 'Preview' : `${result.approved.length} request(s) approved`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject principal update request
 * POST /:institutionId/school-update-requests/principal/:id/reject
 */
const rejectPrincipalRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.reject.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { rejection_reason, admin_notes } = validation.data.body;

    const [request] = await query(
      `SELECT * FROM school_principal_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await query(
      `UPDATE school_principal_update_requests 
       SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [rejection_reason, req.user.id, admin_notes, parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Request rejected',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get principal requests by school
 * GET /:institutionId/school-update-requests/principal/by-school/:schoolId
 */
const getPrincipalRequestsBySchool = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;

    const requests = await query(
      `SELECT spur.*, 
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_principal_update_requests spur
       LEFT JOIN academic_sessions sess ON spur.session_id = sess.id
       LEFT JOIN users u ON spur.reviewed_by = u.id
       WHERE spur.institution_school_id = ? AND spur.institution_id = ?
       ORDER BY spur.created_at DESC`,
      [parseInt(schoolId), parseInt(institutionId)]
    );

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get principal request statistics
 * GET /:institutionId/school-update-requests/principal/statistics
 */
const getPrincipalStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM school_principal_update_requests
      WHERE institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    const [stats] = await query(sql, params);

    res.json({
      success: true,
      data: {
        total: stats?.total || 0,
        pending: stats?.pending || 0,
        approved: stats?.approved || 0,
        rejected: stats?.rejected || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// LOCATION UPDATE REQUEST METHODS
// ============================================================================

/**
 * Get all location update requests
 * GET /:institutionId/school-update-requests/location
 */
const getLocationRequests = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, status, search, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT slur.*, 
             ms.name as school_name, ms.official_code as school_code,
             ms.state, ms.lga, ms.ward,
             ST_Latitude(ms.location) as current_latitude,
             ST_Longitude(ms.location) as current_longitude,
             ms.location_updated_at,
             ms.location_updated_by_institution_id,
             sess.name as session_name,
             u.name as reviewed_by_name
      FROM school_location_update_requests slur
      LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON slur.session_id = sess.id
      LEFT JOIN users u ON slur.reviewed_by = u.id
      WHERE slur.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND slur.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND slur.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (status) {
      sql += ' AND slur.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR slur.contributor_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    sql += ' ORDER BY slur.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const requests = (await query(sql, params)).map((row) => {
      const provenance = buildLocationProvenance(row, institutionId);
      // Never leak which institution moved the shared point - only when and how far
      const { location_updated_by_institution_id: _hidden, ...rest } = row;
      return { ...rest, location_provenance: provenance };
    });
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location request by ID
 * GET /:institutionId/school-update-requests/location/:id
 */
const getLocationRequestById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [request] = await query(
      `SELECT slur.*, 
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state, ms.lga, ms.ward,
              ST_Latitude(ms.location) as current_latitude,
              ST_Longitude(ms.location) as current_longitude,
              ms.location_updated_at,
              ms.location_updated_by_institution_id,
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_location_update_requests slur
       LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN academic_sessions sess ON slur.session_id = sess.id
       LEFT JOIN users u ON slur.reviewed_by = u.id
       WHERE slur.id = ? AND slur.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    // Never leak which institution moved the shared point - only when and how far
    const { location_updated_by_institution_id: _hidden, ...presented } = request;

    res.json({
      success: true,
      data: {
        ...presented,
        location_provenance: buildLocationProvenance(request, institutionId),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve location update request
 * POST /:institutionId/school-update-requests/location/:id/approve
 */
const approveLocationRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.approve.safeParse({ body: req.body });
    const adminNotes = validation.success ? validation.data.body.admin_notes : null;

    const [request] = await query(
      `SELECT * FROM school_location_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await transaction(async (conn) => {
      await applyLocationApproval(conn, request, parseInt(institutionId), req.user.id, adminNotes);
    });

    res.json({
      success: true,
      message: 'Request approved successfully. School location has been updated.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk approve location update requests
 * POST /:institutionId/school-update-requests/location/bulk-approve
 */
const bulkApproveLocationRequests = async (req, res, next) => {
  try {
    const result = await bulkApprove(req, 'school_location_update_requests', applyLocationApproval);
    res.json({
      success: true,
      message: `${result.approved.length} request(s) approved`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve all pending location update requests matching the current filters
 * POST /:institutionId/school-update-requests/location/approve-all
 */
const approveAllLocationRequests = async (req, res, next) => {
  try {
    const result = await approveAllMatching(req, 'location');
    res.json({
      success: true,
      message: req.body.preview ? 'Preview' : `${result.approved.length} request(s) approved`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject location update request
 * POST /:institutionId/school-update-requests/location/:id/reject
 */
const rejectLocationRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.reject.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { rejection_reason, admin_notes } = validation.data.body;

    const [request] = await query(
      `SELECT * FROM school_location_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await query(
      `UPDATE school_location_update_requests 
       SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [rejection_reason, req.user.id, admin_notes, parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Request rejected',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location requests by school
 * GET /:institutionId/school-update-requests/location/by-school/:schoolId
 */
const getLocationRequestsBySchool = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;

    const requests = await query(
      `SELECT slur.*, 
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_location_update_requests slur
       LEFT JOIN academic_sessions sess ON slur.session_id = sess.id
       LEFT JOIN users u ON slur.reviewed_by = u.id
       WHERE slur.institution_school_id = ? AND slur.institution_id = ?
       ORDER BY slur.created_at DESC`,
      [parseInt(schoolId), parseInt(institutionId)]
    );

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location request statistics
 * GET /:institutionId/school-update-requests/location/statistics
 */
const getLocationStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM school_location_update_requests
      WHERE institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    const [stats] = await query(sql, params);

    res.json({
      success: true,
      data: {
        total: stats?.total || 0,
        pending: stats?.pending || 0,
        approved: stats?.approved || 0,
        rejected: stats?.rejected || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Validation schemas
  schemas,
  
  // Principal requests
  getPrincipalRequests,
  getPrincipalRequestById,
  approvePrincipalRequest,
  bulkApprovePrincipalRequests,
  approveAllPrincipalRequests,
  rejectPrincipalRequest,
  getPrincipalRequestsBySchool,
  getPrincipalStatistics,
  
  // Location requests
  getLocationRequests,
  getLocationRequestById,
  approveLocationRequest,
  bulkApproveLocationRequests,
  approveAllLocationRequests,
  rejectLocationRequest,
  getLocationRequestsBySchool,
  getLocationStatistics,
  
  // Generic aliases for routes (combines both request types)
  getAll: async (req, res, next) => {
    // Combine both principal and location requests
    try {
      const { institutionId } = req.params;
      const { type, status, school_id, page = 1, limit = 50 } = req.query;
      
      let requests = [];
      
      // Get principal requests if type is not specified or is 'principal'
      if (!type || type === 'principal') {
        const principalReq = { ...req };
        principalReq.query = { status, school_id, page, limit };
        
        const principalRequests = await query(
          `SELECT 'principal' as request_type, spur.*, ms.name as school_name, ms.official_code as school_code,
                  u.full_name as submitted_by_name, au.full_name as approved_by_name
           FROM school_principal_update_requests spur
           LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
           LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
           LEFT JOIN users u ON spur.submitted_by = u.id
           LEFT JOIN users au ON spur.approved_by = au.id
           WHERE spur.institution_id = ?
           ${status ? 'AND spur.status = ?' : ''}
           ${school_id ? 'AND spur.institution_school_id = ?' : ''}
           ORDER BY spur.created_at DESC`,
          [parseInt(institutionId), ...(status ? [status] : []), ...(school_id ? [school_id] : [])]
        );
        requests = requests.concat(principalRequests);
      }
      
      // Get location requests if type is not specified or is 'location'
      if (!type || type === 'location') {
        const locationRequests = await query(
          `SELECT 'location' as request_type, slur.*, ms.name as school_name, ms.official_code as school_code,
                  u.full_name as submitted_by_name, au.full_name as approved_by_name
           FROM school_location_update_requests slur
           LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
           LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
           LEFT JOIN users u ON slur.submitted_by = u.id
           LEFT JOIN users au ON slur.approved_by = au.id
           WHERE slur.institution_id = ?
           ${status ? 'AND slur.status = ?' : ''}
           ${school_id ? 'AND slur.institution_school_id = ?' : ''}
           ORDER BY slur.created_at DESC`,
          [parseInt(institutionId), ...(status ? [status] : []), ...(school_id ? [school_id] : [])]
        );
        requests = requests.concat(locationRequests);
      }
      
      // Sort combined results by date
      requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      res.json({
        success: true,
        data: requests.slice((page - 1) * limit, page * limit),
        pagination: {
          total: requests.length,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
  
  getById: async (req, res, next) => {
    // Try principal first, then location
    try {
      const { institutionId, id } = req.params;
      
      let request = await query(
        `SELECT 'principal' as request_type, spur.*, ms.name as school_name
         FROM school_principal_update_requests spur
         LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
         LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
         WHERE spur.id = ? AND spur.institution_id = ?`,
        [id, parseInt(institutionId)]
      );
      
      if (!request.length) {
        request = await query(
          `SELECT 'location' as request_type, slur.*, ms.name as school_name
           FROM school_location_update_requests slur
           LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
           LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
           WHERE slur.id = ? AND slur.institution_id = ?`,
          [id, parseInt(institutionId)]
        );
      }
      
      if (!request.length) {
        throw new NotFoundError('Update request not found');
      }
      
      res.json({ success: true, data: request[0] });
    } catch (error) {
      next(error);
    }
  },
  
  getBySchool: async (req, res, next) => {
    try {
      const { institutionId, schoolId } = req.params;
      
      const principalRequests = await query(
        `SELECT 'principal' as request_type, spur.* 
         FROM school_principal_update_requests spur
         WHERE spur.institution_school_id = ? AND spur.institution_id = ?
         ORDER BY spur.created_at DESC`,
        [schoolId, parseInt(institutionId)]
      );
      
      const locationRequests = await query(
        `SELECT 'location' as request_type, slur.* 
         FROM school_location_update_requests slur
         WHERE slur.institution_school_id = ? AND slur.institution_id = ?
         ORDER BY slur.created_at DESC`,
        [schoolId, parseInt(institutionId)]
      );
      
      res.json({
        success: true,
        data: {
          principal: principalRequests,
          location: locationRequests,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  
  create: async (req, res, next) => {
    // Delegate to appropriate create based on type
    const { type } = req.body;
    if (type === 'location') {
      // Import inline since we can't reference before export
      const { query } = require('../db/database');
      const { institutionId } = req.params;
      const { school_id, new_latitude, new_longitude, reason } = req.body;
      
      const result = await query(
        `INSERT INTO school_location_update_requests 
         (institution_id, institution_school_id, new_latitude, new_longitude, reason, submitted_by, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [parseInt(institutionId), school_id, new_latitude, new_longitude, reason, req.user.id]
      );
      
      res.status(201).json({ 
        success: true, 
        data: { id: result.insertId }, 
        message: 'Location update request submitted' 
      });
    } else {
      // Principal update
      const { query } = require('../db/database');
      const { institutionId } = req.params;
      const { school_id, new_principal_name, new_principal_phone, new_principal_email, reason } = req.body;
      
      const result = await query(
        `INSERT INTO school_principal_update_requests 
         (institution_id, institution_school_id, new_principal_name, new_principal_phone, new_principal_email, reason, submitted_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [parseInt(institutionId), school_id, new_principal_name, new_principal_phone, new_principal_email, reason, req.user.id]
      );
      
      res.status(201).json({ 
        success: true, 
        data: { id: result.insertId }, 
        message: 'Principal update request submitted' 
      });
    }
  },
  
  approve: async (req, res, next) => {
    // Determine type and delegate
    try {
      const { institutionId, id } = req.params;
      const { query } = require('../db/database');
      
      // Check principal first
      let [request] = await query(
        'SELECT * FROM school_principal_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return approvePrincipalRequest(req, res, next);
      }
      
      // Check location
      [request] = await query(
        'SELECT * FROM school_location_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return approveLocationRequest(req, res, next);
      }
      
      throw new NotFoundError('Update request not found');
    } catch (error) {
      next(error);
    }
  },
  
  reject: async (req, res, next) => {
    // Determine type and delegate
    try {
      const { institutionId, id } = req.params;
      const { query } = require('../db/database');
      
      // Check principal first
      let [request] = await query(
        'SELECT * FROM school_principal_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return rejectPrincipalRequest(req, res, next);
      }
      
      // Check location
      [request] = await query(
        'SELECT * FROM school_location_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return rejectLocationRequest(req, res, next);
      }
      
      throw new NotFoundError('Update request not found');
    } catch (error) {
      next(error);
    }
  },
};
