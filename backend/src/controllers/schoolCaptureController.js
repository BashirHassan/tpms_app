/**
 * School Capture Controller (MedeePay Pattern)
 *
 * Supervisor school data capture. The Head of TP bulk-assigns supervisors to
 * schools that are missing a verified GPS location or principal details; each
 * supervisor then records them in the field. Submissions are written to the SAME
 * request tables students use (school_location_update_requests and
 * school_principal_update_requests) as PENDING, so the existing School Update
 * Requests review flow approves or rejects them unchanged.
 *
 * Every query is institution-scoped. Every supervisor-facing handler also checks
 * that the assignment belongs to the calling supervisor.
 */

const { z } = require('zod');
const { query, queryOne, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError, AuthorizationError } = require('../utils/errors');
const { distanceMeters } = require('../utils/geo');
const { allocate } = require('../services/schoolCaptureAllocator');
const { analyzeLocationSubmission, summariseSamples } = require('../services/captureRiskAnalyzer');
const { insertEvents, recordEvent, requestContext } = require('../services/schoolCaptureEvents');
const {
  schemas: portalSchemas,
  MIN_CORRECTION_DISTANCE_M,
  getExternalVerification,
  toNumber,
  mapsUrl,
} = require('./schoolPortalController');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const idList = () => z.array(z.coerce.number().int().positive()).optional().default([]);

const SCOPES = ['missing_any', 'missing_location', 'missing_principal', 'all'];

// Where the list of schools comes from:
//   institution - the schools this institution has linked
//   master      - every active school in the master registry, linked or not
// Capture is always recorded against the MASTER school, so a school captured once is
// never captured again - not even after it is later linked to an institution.
const SCHOOL_SOURCES = ['institution', 'master'];
const normaliseSource = (v) => (SCHOOL_SOURCES.includes(v) ? v : 'institution');

const planBody = z.object({
  session_id: z.coerce.number().int().positive('Session ID is required'),
  mode: z.enum(['lga', 'random']).default('lga'),
  scope: z.enum(SCOPES).default('missing_any'),
  school_source: z.enum(SCHOOL_SOURCES).default('institution'),
  supervisor_ids: idList(),
  states: z.array(z.string().min(1)).optional().default([]),
  lgas: z.array(z.object({ state: z.string().min(1), lga: z.string().min(1) })).optional().default([]),
  max_per_supervisor: z.coerce.number().int().min(1).max(5000).optional().nullable(),
  shuffle_salt: z.coerce.number().int().min(0).max(1000000).default(0),
});

const schemas = {
  preview: z.object({ body: planBody }),

  execute: z.object({
    body: planBody.extend({
      // The preview's plan_hash - execute refuses to save a different plan
      expected_plan_hash: z.string().min(1).max(64),
    }),
  }),

  manualBulk: z.object({
    body: z.object({
      session_id: z.coerce.number().int().positive('Session ID is required'),
      supervisor_id: z.coerce.number().int().positive('Supervisor is required'),
      school_source: z.enum(SCHOOL_SOURCES).default('institution'),
      // master_schools.id values, whichever source they were picked from
      school_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one school').max(5000),
    }),
  }),

  reassign: z.object({
    body: z.object({ supervisor_id: z.coerce.number().int().positive('Supervisor is required') }),
  }),

  submitLocation: z.object({
    body: z.object({
      proposed_latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
      proposed_longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
      proposed_ward: z.string().max(100).optional().nullable(),
      proposed_address: z.string().max(1000).optional().nullable(),
      accuracy_meters: z.number().min(0, 'GPS accuracy cannot be negative').max(100000).optional().nullable(),
      capture_method: z.enum(['gps', 'manual']).default('gps'),
      // The device's raw readings and clock - the evidence the risk checks run on
      gps_samples: z
        .array(
          z.object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            accuracy_meters: z.number().min(0).max(100000).optional().nullable(),
            altitude_meters: z.number().optional().nullable(),
            timestamp: z.string().max(40).optional().nullable(),
          })
        )
        .max(30)
        .optional()
        .nullable(),
      client_timestamp: z.string().max(40).optional().nullable(),
      note: z.string().max(500).optional().nullable(),
    }),
  }),

  // Same name/phone rules as the student principal form
  submitPrincipal: portalSchemas.portalPrincipalUpdate,
};

// ============================================================================
// HELPERS
// ============================================================================

const instId = (req) => parseInt(req.params.institutionId);

async function getSessionById(institutionId, sessionId) {
  return queryOne('SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?', [
    parseInt(sessionId),
    institutionId,
  ]);
}

async function getCurrentSession(institutionId) {
  return queryOne(
    'SELECT * FROM academic_sessions WHERE institution_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1',
    [institutionId]
  );
}

/** The requested session, or the current one when none is given. */
async function resolveSession(institutionId, sessionId) {
  const session = sessionId ? await getSessionById(institutionId, sessionId) : await getCurrentSession(institutionId);
  if (!session) throw new NotFoundError(sessionId ? 'Session not found' : 'No active session');
  return session;
}

/** What a school still needs, given its master record and this session's requests. */
function computeNeeds(row, scope) {
  const locMissing = !!Number(row.loc_missing) && !Number(row.loc_pending);
  const principalMissing = !!Number(row.princ_missing) && !Number(row.princ_pending);
  const everything = scope === 'all';
  return {
    needs_location: everything || (scope !== 'missing_principal' && locMissing),
    needs_principal: everything || (scope !== 'missing_location' && principalMissing),
  };
}

/**
 * Schools a run could pick up: not yet held by a live capture assignment this
 * session, with what each still needs. Every id here is a MASTER school id.
 *
 * "Missing" is read from the master school's own record, so a school captured by
 * ANY institution (or by this one earlier) no longer shows up. A school whose
 * location (or principal) request is already awaiting review is treated as handled -
 * sending a supervisor to it would only duplicate a request.
 */
async function getEligibleSchools(
  institutionId,
  sessionId,
  { scope = 'missing_any', states = [], lgas = [], source = 'institution' } = {}
) {
  const fromClause =
    source === 'master'
      ? `FROM master_schools ms
         LEFT JOIN institution_schools isv ON isv.master_school_id = ms.id AND isv.institution_id = ?
         WHERE ms.status = 'active'`
      : `FROM institution_schools isv
         JOIN master_schools ms ON ms.id = isv.master_school_id
         WHERE isv.institution_id = ? AND isv.status = 'active'`;

  const rows = await query(
    `SELECT ms.id AS id, isv.id AS institution_school_id, (isv.id IS NOT NULL) AS linked,
            ms.name, ms.official_code AS code, ms.state, ms.lga, ms.ward, ms.address,
            (ms.location IS NULL OR ms.location_updated_at IS NULL) AS loc_missing,
            (ms.principal_name IS NULL OR TRIM(ms.principal_name) = ''
              OR ms.principal_phone IS NULL OR TRIM(ms.principal_phone) = '') AS princ_missing,
            EXISTS (SELECT 1 FROM school_location_update_requests r
                    WHERE r.master_school_id = ms.id AND r.session_id = ?
                      AND r.institution_id = ? AND r.status = 'pending') AS loc_pending,
            EXISTS (SELECT 1 FROM school_principal_update_requests r
                    WHERE r.master_school_id = ms.id AND r.session_id = ?
                      AND r.institution_id = ? AND r.status = 'pending') AS princ_pending
     ${fromClause}
       AND NOT EXISTS (
         SELECT 1 FROM school_capture_assignments a
         WHERE a.master_school_id = ms.id AND a.session_id = ?
           AND a.institution_id = ? AND a.status = 'active'
       )
     ORDER BY ms.state, ms.lga, ms.name`,
    [sessionId, institutionId, sessionId, institutionId, institutionId, sessionId, institutionId]
  );

  const stateSet = new Set(states.map((s) => s.trim().toLowerCase()));
  const lgaSet = new Set(lgas.map((l) => `${l.state.trim().toLowerCase()}|${l.lga.trim().toLowerCase()}`));

  return rows
    .map((row) => ({ ...row, ...computeNeeds(row, scope) }))
    .filter((row) => scope === 'all' || row.needs_location || row.needs_principal)
    .filter((row) => stateSet.size === 0 || stateSet.has(String(row.state || '').trim().toLowerCase()))
    .filter(
      (row) =>
        lgaSet.size === 0 ||
        lgaSet.has(`${String(row.state || '').trim().toLowerCase()}|${String(row.lga || '').trim().toLowerCase()}`)
    );
}

async function getEligibleSupervisors(institutionId, supervisorIds = []) {
  let sql = `SELECT u.id, u.name, u.email, u.phone
             FROM users u
             WHERE u.institution_id = ? AND u.role = 'supervisor' AND u.status = 'active'`;
  const params = [institutionId];
  if (supervisorIds.length > 0) {
    sql += ' AND u.id IN (?)';
    params.push(supervisorIds);
  }
  sql += ' ORDER BY u.name ASC';
  return query(sql, params);
}

async function getExistingLoad(institutionId, sessionId) {
  const rows = await query(
    `SELECT supervisor_id, COUNT(*) AS c
     FROM school_capture_assignments
     WHERE institution_id = ? AND session_id = ? AND status = 'active'
     GROUP BY supervisor_id`,
    [institutionId, sessionId]
  );
  return new Map(rows.map((r) => [Number(r.supervisor_id), Number(r.c)]));
}

/** Resolve filters + run the allocator. Shared by preview and execute so both see the same plan. */
async function buildPlan(institutionId, session, body) {
  const [schools, supervisors, existingLoad] = await Promise.all([
    getEligibleSchools(institutionId, session.id, {
      scope: body.scope,
      states: body.states,
      lgas: body.lgas,
      source: body.school_source,
    }),
    getEligibleSupervisors(institutionId, body.supervisor_ids),
    getExistingLoad(institutionId, session.id),
  ]);

  if (body.supervisor_ids.length > 0 && supervisors.length !== new Set(body.supervisor_ids).size) {
    const found = new Set(supervisors.map((s) => s.id));
    const missing = body.supervisor_ids.filter((id) => !found.has(id));
    throw new ValidationError(`Supervisor(s) not found or not eligible in this institution: ${missing.join(', ')}`);
  }

  const result = allocate(supervisors, schools, {
    mode: body.mode,
    maxPerSupervisor: body.max_per_supervisor || null,
    existingLoad,
    shuffleSalt: body.shuffle_salt,
  });

  return { schools, supervisors, existingLoad, result };
}

const schoolById = (schools) => new Map(schools.map((s) => [s.id, s]));

function shapeSchool(s) {
  return {
    id: s.id,
    name: s.name,
    code: s.code || null,
    state: s.state || null,
    lga: s.lga || null,
    ward: s.ward || null,
    linked: !!Number(s.linked),
    needs_location: !!s.needs_location,
    needs_principal: !!s.needs_principal,
  };
}

// Newest request per school+session for one request table - status/ids only
const latestRequestSql = (table, column) => `
  (SELECT r.${column} FROM ${table} r
   WHERE r.master_school_id = a.master_school_id
     AND r.session_id = a.session_id AND r.institution_id = a.institution_id
   ORDER BY r.created_at DESC, r.id DESC LIMIT 1)`;

function deriveStatus(latestStatus, needed) {
  if (latestStatus) return latestStatus; // pending | approved | rejected
  return needed ? 'not_started' : 'not_required';
}

const ASSIGNMENT_SELECT = `
  SELECT a.id, a.session_id, a.supervisor_id, a.master_school_id, a.batch_id, a.status AS assignment_status,
         isv.id AS institution_school_id, (isv.id IS NOT NULL) AS linked,
         a.needs_location, a.needs_principal, a.created_at AS assigned_at,
         u.name AS supervisor_name, u.email AS supervisor_email, u.phone AS supervisor_phone,
         ms.name AS school_name, ms.official_code AS school_code,
         ms.state, ms.lga, ms.ward, ms.address,
         isv.distance_km, isv.location_category,
         ms.principal_name, ms.principal_phone,
         ST_Latitude(ms.location) AS latitude, ST_Longitude(ms.location) AS longitude,
         ms.location_updated_at,
         ${latestRequestSql('school_location_update_requests', 'status')} AS location_status,
         ${latestRequestSql('school_location_update_requests', 'id')} AS location_request_id,
         ${latestRequestSql('school_location_update_requests', 'risk_level')} AS location_risk_level,
         ${latestRequestSql('school_location_update_requests', 'distance_from_record_m')} AS captured_vs_record_m,
         ${latestRequestSql('school_principal_update_requests', 'status')} AS principal_status
  FROM school_capture_assignments a
  JOIN users u ON u.id = a.supervisor_id AND u.institution_id = a.institution_id
  JOIN master_schools ms ON ms.id = a.master_school_id
  LEFT JOIN institution_schools isv ON isv.master_school_id = a.master_school_id AND isv.institution_id = a.institution_id`;

function shapeAssignment(row) {
  return {
    id: row.id,
    session_id: row.session_id,
    supervisor_id: row.supervisor_id,
    supervisor_name: row.supervisor_name,
    supervisor_email: row.supervisor_email || null,
    supervisor_phone: row.supervisor_phone || null,
    master_school_id: row.master_school_id,
    // The institution's own link to this school, if it has one (resolved live)
    institution_school_id: row.institution_school_id || null,
    linked: !!Number(row.linked),
    school_name: row.school_name,
    school_code: row.school_code || null,
    state: row.state || null,
    lga: row.lga || null,
    ward: row.ward || null,
    batch_id: row.batch_id || null,
    assigned_at: row.assigned_at,
    needs_location: !!row.needs_location,
    needs_principal: !!row.needs_principal,
    // Latest location submission's risk - admin-only; never sent to supervisors
    location_request_id: row.location_request_id || null,
    risk_level: row.location_risk_level || null,
    captured_vs_record_m: row.captured_vs_record_m != null ? Number(row.captured_vs_record_m) : null,
    // Distance of the school from THIS institution (the figure allowances use)
    distance_km: row.distance_km != null ? Number(row.distance_km) : null,
    location_category: row.location_category || null,
    location_status: deriveStatus(row.location_status, !!row.needs_location),
    principal_status: deriveStatus(row.principal_status, !!row.needs_principal),
  };
}

/** A task counts as finished once approved, or when it was never needed. */
const taskDone = (status) => status === 'approved' || status === 'not_required';

function overallProgress(a) {
  if (taskDone(a.location_status) && taskDone(a.principal_status)) return 'completed';
  if (a.location_status === 'rejected' || a.principal_status === 'rejected') return 'rejected';
  if (a.location_status === 'pending' || a.principal_status === 'pending') return 'pending';
  if (a.location_status === 'approved' || a.principal_status === 'approved') return 'in_progress';
  return 'not_started';
}

/**
 * Write an 'assigned' event for every live assignment of a batch (inside the
 * same transaction as the assignments, so the trail can never lag behind them).
 */
async function recordBatchAssigned(conn, req, { institutionId, sessionId, batchId, mode, schoolSource = 'institution' }) {
  const [rows] = await conn.query(
    `SELECT a.id, a.supervisor_id, a.master_school_id, a.needs_location, a.needs_principal
     FROM school_capture_assignments a
     WHERE a.batch_id = ? AND a.institution_id = ?`,
    [batchId, institutionId]
  );
  const ctx = requestContext(req);
  await insertEvents(
    conn,
    rows.map((a) => ({
      institutionId,
      sessionId,
      assignmentId: a.id,
      supervisorId: a.supervisor_id,
      actorUserId: req.user.id,
      actorType: 'admin',
      eventType: 'assigned',
      summary: mode === 'manual' ? 'Assigned manually' : `Assigned by ${mode === 'lga' ? 'LGA-based' : 'even-split'} auto-assign`,
      metadata: {
        batch_id: batchId,
        mode,
        school_source: schoolSource,
        needs_location: !!a.needs_location,
        needs_principal: !!a.needs_principal,
      },
      ...ctx,
    }))
  );
}

// ============================================================================
// ADMIN - OPTIONS / PREVIEW / EXECUTE
// ============================================================================

/**
 * GET /:institutionId/school-capture/options?session_id&scope
 * What a run can be scoped to, counted from the schools that currently need capturing.
 */
const getOptions = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const session = await resolveSession(institutionId, req.query.session_id);
    const scope = SCOPES.includes(req.query.scope) ? req.query.scope : 'missing_any';
    const source = normaliseSource(req.query.school_source);

    const [allSchools, supervisors, existingLoad] = await Promise.all([
      getEligibleSchools(institutionId, session.id, { scope: 'all', source }),
      getEligibleSupervisors(institutionId),
      getExistingLoad(institutionId, session.id),
    ]);

    const needsCapture = (row, s) => {
      const n = computeNeeds(row, s);
      return n.needs_location || n.needs_principal;
    };
    const countFor = (s) => allSchools.filter((row) => needsCapture(row, s)).length;
    const inScope = scope === 'all' ? allSchools : allSchools.filter((row) => needsCapture(row, scope));

    const stateCounts = new Map();
    const lgaCounts = new Map();
    for (const s of inScope) {
      const st = s.state || 'Unknown';
      const lg = s.lga || 'Unknown';
      stateCounts.set(st, (stateCounts.get(st) || 0) + 1);
      const key = `${st}|${lg}`;
      lgaCounts.set(key, (lgaCounts.get(key) || 0) + 1);
    }

    res.json({
      success: true,
      data: {
        session: { id: session.id, name: session.name, max_gps_accuracy_meters: session.max_gps_accuracy_meters ?? null },
        scope,
        school_source: source,
        linked_count: allSchools.filter((s) => Number(s.linked)).length,
        unlinked_count: allSchools.filter((s) => !Number(s.linked)).length,
        counts: {
          missing_any: countFor('missing_any'),
          missing_location: countFor('missing_location'),
          missing_principal: countFor('missing_principal'),
          all: allSchools.length,
        },
        supervisors: supervisors.map((s) => ({ ...s, current_assignments: existingLoad.get(s.id) || 0 })),
        states: [...stateCounts.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => a.state.localeCompare(b.state)),
        lgas: [...lgaCounts.entries()]
          .map(([key, count]) => {
            const [state, lga] = key.split('|');
            return { state, lga, count };
          })
          .sort((a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /:institutionId/school-capture/eligible-schools?session_id&scope&state&lga
 * The schools a run could pick up right now - feeds the manual-pick list.
 */
const getEligibleSchoolList = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const session = await resolveSession(institutionId, req.query.session_id);
    const scope = SCOPES.includes(req.query.scope) ? req.query.scope : 'missing_any';

    const schools = await getEligibleSchools(institutionId, session.id, {
      scope,
      source: normaliseSource(req.query.school_source),
      states: req.query.state ? [String(req.query.state)] : [],
      lgas: req.query.state && req.query.lga ? [{ state: String(req.query.state), lga: String(req.query.lga) }] : [],
    });

    res.json({ success: true, data: schools.map(shapeSchool), total: schools.length, scope });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:institutionId/school-capture/preview
 * Dry run: who would get which school. Nothing is written.
 */
const previewPlan = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const body = req.body;
    const session = await resolveSession(institutionId, body.session_id);

    const { schools, supervisors, result } = await buildPlan(institutionId, session, body);
    const lookup = schoolById(schools);
    const supervisorName = new Map(supervisors.map((s) => [s.id, s.name]));

    const assignments = result.assignments.map((a) => ({
      supervisor_id: a.supervisor_id,
      supervisor_name: supervisorName.get(a.supervisor_id) || null,
      school: shapeSchool(lookup.get(a.school_id)),
    }));

    res.json({
      success: true,
      data: {
        preview: true,
        plan_hash: result.planHash,
        mode: body.mode,
        scope: body.scope,
        total_schools: schools.length,
        total_supervisors: supervisors.length,
        assigned_count: result.assignments.length,
        unassigned_count: result.unassigned.length,
        unassigned: result.unassigned.map((id) => shapeSchool(lookup.get(id))),
        per_supervisor: result.perSupervisor,
        assignments,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Insert assignments in chunks. Throws ConflictError if another run got a school first. */
async function insertAssignments(conn, rows) {
  const CHUNK = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await conn.query(
        `INSERT INTO school_capture_assignments
           (institution_id, session_id, supervisor_id, master_school_id, batch_id,
            needs_location, needs_principal, assigned_by)
         VALUES ?`,
        [rows.slice(i, i + CHUNK)]
      );
    }
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new ConflictError('Some of these schools were assigned by someone else in the meantime. Please preview again.');
    }
    throw error;
  }
}

/**
 * POST /:institutionId/school-capture/execute
 * Saves exactly the plan that was previewed (plan_hash must still match).
 */
const executePlan = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const body = req.body;
    const session = await resolveSession(institutionId, body.session_id);

    const { schools, supervisors, result } = await buildPlan(institutionId, session, body);

    if (result.planHash !== body.expected_plan_hash) {
      throw new ConflictError('The schools or supervisors changed since the preview. Please preview again before saving.');
    }
    if (result.assignments.length === 0) {
      throw new ValidationError(result.warnings[0] || 'Nothing to assign');
    }

    const lookup = schoolById(schools);
    const batchId = await transaction(async (conn) => {
      const [batch] = await conn.execute(
        `INSERT INTO school_capture_batches
           (institution_id, session_id, mode, scope, filters, school_count, supervisor_count, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
        [
          institutionId,
          session.id,
          body.mode,
          body.scope,
          JSON.stringify({
            school_source: body.school_source,
            supervisor_ids: body.supervisor_ids,
            states: body.states,
            lgas: body.lgas,
            max_per_supervisor: body.max_per_supervisor || null,
            shuffle_salt: body.shuffle_salt,
          }),
          result.assignments.length,
          new Set(result.assignments.map((a) => a.supervisor_id)).size,
          req.user.id,
        ]
      );

      await insertAssignments(
        conn,
        result.assignments.map((a) => {
          const school = lookup.get(a.school_id);
          return [
            institutionId,
            session.id,
            a.supervisor_id,
            a.school_id,
            batch.insertId,
            school.needs_location ? 1 : 0,
            school.needs_principal ? 1 : 0,
            req.user.id,
          ];
        })
      );
      await recordBatchAssigned(conn, req, {
        institutionId,
        sessionId: session.id,
        batchId: batch.insertId,
        mode: body.mode,
        schoolSource: body.school_source,
      });
      return batch.insertId;
    });

    res.status(201).json({
      success: true,
      message: `Assigned ${result.assignments.length} school(s) to ${new Set(result.assignments.map((a) => a.supervisor_id)).size} supervisor(s)`,
      data: {
        batch_id: batchId,
        assigned_count: result.assignments.length,
        unassigned_count: result.unassigned.length,
        supervisor_count: supervisors.length,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /:institutionId/school-capture/assignments/bulk
 * Manual pick: hand a chosen set of schools to one supervisor. Recorded as a
 * 'manual' batch so it appears in history and can be rolled back.
 */
const manualBulkAssign = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const { session_id, supervisor_id, school_ids } = req.body;
    const session = await resolveSession(institutionId, session_id);

    const [supervisor] = await getEligibleSupervisors(institutionId, [supervisor_id]);
    if (!supervisor) throw new ValidationError('Supervisor not found or not eligible in this institution');

    const eligible = await getEligibleSchools(institutionId, session.id, { scope: 'all', source: req.body.school_source });
    const wanted = new Set(school_ids);
    const chosen = eligible.filter((s) => wanted.has(s.id));
    const skipped = school_ids.length - chosen.length; // already assigned, inactive, or not in this institution

    if (chosen.length === 0) {
      throw new ValidationError('None of the selected schools can be assigned - they may already have a supervisor');
    }

    // What each still needs (a manual pick keeps the usual "missing" meaning, not "everything")
    const needs = chosen.map((s) => ({ school: s, ...computeNeeds(s, 'missing_any') }));

    const batchId = await transaction(async (conn) => {
      const [batch] = await conn.execute(
        `INSERT INTO school_capture_batches
           (institution_id, session_id, mode, scope, filters, school_count, supervisor_count, status, created_by)
         VALUES (?, ?, 'manual', 'missing_any', ?, ?, 1, 'completed', ?)`,
        [institutionId, session.id, JSON.stringify({ school_source: req.body.school_source, supervisor_ids: [supervisor_id] }), chosen.length, req.user.id]
      );
      await insertAssignments(
        conn,
        needs.map((n) => {
          // A school with nothing flagged missing was hand-picked anyway - capture both
          const nothingFlagged = !n.needs_location && !n.needs_principal;
          return [
            institutionId,
            session.id,
            supervisor_id,
            n.school.id,
            batch.insertId,
            n.needs_location || nothingFlagged ? 1 : 0,
            n.needs_principal || nothingFlagged ? 1 : 0,
            req.user.id,
          ];
        })
      );
      await recordBatchAssigned(conn, req, {
        institutionId,
        sessionId: session.id,
        batchId: batch.insertId,
        mode: 'manual',
        schoolSource: req.body.school_source,
      });
      return batch.insertId;
    });

    res.status(201).json({
      success: true,
      message: `Assigned ${chosen.length} school(s) to ${supervisor.name}`,
      data: { batch_id: batchId, assigned_count: chosen.length, skipped_count: skipped },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN - ALL ASSIGNMENTS / BATCHES
// ============================================================================

/**
 * GET /:institutionId/school-capture/assignments
 * Every supervisor's live assignments with location/principal progress. `limit=all`
 * returns the whole filtered set (table + export).
 */
const getAssignments = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const session = await resolveSession(institutionId, req.query.session_id);
    const { supervisor_id, state, lga, progress, risk, search, page = '1', limit = '50' } = req.query;

    const rows = await query(
      `${ASSIGNMENT_SELECT}
       WHERE a.institution_id = ? AND a.session_id = ? AND a.status = 'active'
       ORDER BY u.name, ms.state, ms.lga, ms.name`,
      [institutionId, session.id]
    );

    let data = rows.map((row) => {
      const a = shapeAssignment(row);
      return { ...a, progress: overallProgress(a) };
    });

    // Per-supervisor summary is over the whole session, before narrowing filters
    const summaryMap = new Map();
    for (const a of data) {
      if (!summaryMap.has(a.supervisor_id)) {
        summaryMap.set(a.supervisor_id, {
          supervisor_id: a.supervisor_id,
          supervisor_name: a.supervisor_name,
          schools: 0,
          location_pending: 0,
          location_approved: 0,
          principal_pending: 0,
          principal_approved: 0,
          completed: 0,
          flagged: 0,
          flagged_high: 0,
          total_distance_km: 0,
        });
      }
      const s = summaryMap.get(a.supervisor_id);
      s.schools += 1;
      s.total_distance_km = Math.round((s.total_distance_km + (a.distance_km || 0)) * 100) / 100;
      if (a.risk_level === 'high') s.flagged_high += 1;
      if (a.risk_level === 'high' || a.risk_level === 'medium') s.flagged += 1;
      if (a.location_status === 'pending') s.location_pending += 1;
      if (a.location_status === 'approved') s.location_approved += 1;
      if (a.principal_status === 'pending') s.principal_pending += 1;
      if (a.principal_status === 'approved') s.principal_approved += 1;
      if (a.progress === 'completed') s.completed += 1;
    }

    if (supervisor_id) data = data.filter((a) => a.supervisor_id === parseInt(supervisor_id));
    if (state) data = data.filter((a) => (a.state || '').toLowerCase() === String(state).toLowerCase());
    if (lga) data = data.filter((a) => (a.lga || '').toLowerCase() === String(lga).toLowerCase());
    if (progress) data = data.filter((a) => a.progress === progress);
    if (risk === 'flagged') data = data.filter((a) => a.risk_level === 'high' || a.risk_level === 'medium');
    else if (risk === 'high' || risk === 'medium') data = data.filter((a) => a.risk_level === risk);
    if (search) {
      const term = String(search).toLowerCase();
      data = data.filter((a) =>
        [a.school_name, a.school_code, a.supervisor_name, a.lga, a.state].some((v) => (v || '').toLowerCase().includes(term))
      );
    }

    const total = data.length;
    let pagination;
    if (String(limit) === 'all') {
      pagination = { total, page: 1, limit: total, totalPages: 1 };
    } else {
      const lim = Math.max(1, parseInt(limit) || 50);
      const pg = Math.max(1, parseInt(page) || 1);
      data = data.slice((pg - 1) * lim, pg * lim);
      pagination = { total, page: pg, limit: lim, totalPages: Math.ceil(total / lim) };
    }

    res.json({
      success: true,
      data,
      pagination,
      supervisors: [...summaryMap.values()].sort((a, b) => a.supervisor_name.localeCompare(b.supervisor_name)),
      session: { id: session.id, name: session.name },
    });
  } catch (error) {
    next(error);
  }
};

/** Load one live assignment of this institution or throw. */
async function loadAssignment(institutionId, id) {
  const row = await queryOne(
    `SELECT * FROM school_capture_assignments WHERE id = ? AND institution_id = ?`,
    [parseInt(id), institutionId]
  );
  if (!row) throw new NotFoundError('Assignment not found');
  return row;
}

/** PATCH /:institutionId/school-capture/assignments/:id - hand the school to a different supervisor */
const reassignAssignment = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const assignment = await loadAssignment(institutionId, req.params.id);
    if (assignment.status !== 'active') throw new ValidationError('Only active assignments can be reassigned');

    const [supervisor] = await getEligibleSupervisors(institutionId, [req.body.supervisor_id]);
    if (!supervisor) throw new ValidationError('Supervisor not found or not eligible in this institution');

    const previous = await queryOne('SELECT name FROM users WHERE id = ?', [assignment.supervisor_id]);

    await transaction(async (conn) => {
      await conn.execute(
        'UPDATE school_capture_assignments SET supervisor_id = ?, assigned_by = ?, updated_at = NOW() WHERE id = ? AND institution_id = ?',
        [supervisor.id, req.user.id, assignment.id, institutionId]
      );
      await insertEvents(conn, [
        {
          institutionId,
          sessionId: assignment.session_id,
          assignmentId: assignment.id,
          supervisorId: supervisor.id,
          actorUserId: req.user.id,
          actorType: 'admin',
          eventType: 'reassigned',
          summary: `Reassigned from ${previous?.name || 'another supervisor'} to ${supervisor.name}`,
          metadata: { from_supervisor_id: assignment.supervisor_id, to_supervisor_id: supervisor.id },
          ...requestContext(req),
        },
      ]);
    });

    res.json({ success: true, message: `Reassigned to ${supervisor.name}` });
  } catch (error) {
    next(error);
  }
};

/** DELETE /:institutionId/school-capture/assignments/:id - cancel (kept as history) */
const cancelAssignment = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const assignment = await loadAssignment(institutionId, req.params.id);
    if (assignment.status !== 'active') throw new ValidationError('This assignment is already cancelled');

    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE school_capture_assignments SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND institution_id = ?`,
        [assignment.id, institutionId]
      );
      await insertEvents(conn, [
        {
          institutionId,
          sessionId: assignment.session_id,
          assignmentId: assignment.id,
          supervisorId: assignment.supervisor_id,
          actorUserId: req.user.id,
          actorType: 'admin',
          eventType: 'cancelled',
          summary: 'Assignment cancelled',
          ...requestContext(req),
        },
      ]);
    });
    res.json({ success: true, message: 'Assignment cancelled' });
  } catch (error) {
    next(error);
  }
};

/** GET /:institutionId/school-capture/batches */
const getBatches = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const params = [institutionId];
    let sql = `SELECT b.id, b.session_id, b.mode, b.scope, b.school_count, b.supervisor_count, b.status,
                      b.created_at, u.name AS created_by_name, sess.name AS session_name,
                      (SELECT COUNT(*) FROM school_capture_assignments a
                       WHERE a.batch_id = b.id AND a.status = 'active') AS active_count
               FROM school_capture_batches b
               LEFT JOIN users u ON u.id = b.created_by
               LEFT JOIN academic_sessions sess ON sess.id = b.session_id
               WHERE b.institution_id = ?`;
    if (req.query.session_id) {
      sql += ' AND b.session_id = ?';
      params.push(parseInt(req.query.session_id));
    }
    sql += ' ORDER BY b.created_at DESC LIMIT 50';

    const rows = await query(sql, params);
    res.json({ success: true, data: rows.map((r) => ({ ...r, active_count: Number(r.active_count) })) });
  } catch (error) {
    next(error);
  }
};

/** POST /:institutionId/school-capture/batches/:batchId/rollback */
const rollbackBatch = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const batchId = parseInt(req.params.batchId);

    const batch = await queryOne('SELECT * FROM school_capture_batches WHERE id = ? AND institution_id = ?', [
      batchId,
      institutionId,
    ]);
    if (!batch) throw new NotFoundError('Batch not found');
    if (batch.status === 'rolled_back') throw new ValidationError('This batch has already been rolled back');

    const cancelled = await transaction(async (conn) => {
      const [live] = await conn.query(
        `SELECT id, session_id, supervisor_id FROM school_capture_assignments
         WHERE batch_id = ? AND institution_id = ? AND status = 'active'`,
        [batchId, institutionId]
      );
      const ctx = requestContext(req);
      await insertEvents(
        conn,
        live.map((a) => ({
          institutionId,
          sessionId: a.session_id,
          assignmentId: a.id,
          supervisorId: a.supervisor_id,
          actorUserId: req.user.id,
          actorType: 'admin',
          eventType: 'rolled_back',
          summary: `Batch #${batchId} rolled back`,
          metadata: { batch_id: batchId },
          ...ctx,
        }))
      );
      const [result] = await conn.execute(
        `UPDATE school_capture_assignments SET status = 'cancelled', updated_at = NOW()
         WHERE batch_id = ? AND institution_id = ? AND status = 'active'`,
        [batchId, institutionId]
      );
      await conn.execute(
        `UPDATE school_capture_batches SET status = 'rolled_back', updated_at = NOW() WHERE id = ? AND institution_id = ?`,
        [batchId, institutionId]
      );
      return result.affectedRows;
    });

    res.json({
      success: true,
      message: `Rolled back ${cancelled} assignment(s)`,
      data: { batch_id: batchId, cancelled_count: cancelled },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// ADMIN - TIMELINE / ACTIVITY LOG
// ============================================================================

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const EVENT_SELECT = `
  SELECT e.id, e.session_id, e.assignment_id, a.master_school_id, e.supervisor_id, e.actor_user_id,
         e.actor_type, e.event_type, e.request_type, e.request_id, e.summary, e.metadata,
         e.ip_address, e.user_agent, e.created_at,
         actor.name AS actor_name, sup.name AS supervisor_name,
         ms.name AS school_name, ms.official_code AS school_code, ms.state, ms.lga
  FROM school_capture_events e
  LEFT JOIN users actor ON actor.id = e.actor_user_id
  LEFT JOIN users sup ON sup.id = e.supervisor_id
  LEFT JOIN school_capture_assignments a ON a.id = e.assignment_id
  LEFT JOIN master_schools ms ON ms.id = a.master_school_id`;

function shapeEvent(row) {
  return {
    id: row.id,
    assignment_id: row.assignment_id,
    master_school_id: row.master_school_id || null,
    supervisor_id: row.supervisor_id,
    supervisor_name: row.supervisor_name || null,
    school_name: row.school_name || null,
    school_code: row.school_code || null,
    state: row.state || null,
    lga: row.lga || null,
    event_type: row.event_type,
    summary: row.summary,
    actor_type: row.actor_type,
    actor_name: row.actor_name || null,
    request_type: row.request_type,
    request_id: row.request_id,
    metadata: parseJson(row.metadata) || {},
    ip_address: row.ip_address || null,
    user_agent: row.user_agent || null,
    created_at: row.created_at,
  };
}

/**
 * GET /:institutionId/school-capture/assignments/:id/timeline
 * Everything that happened on one assignment, oldest first: who assigned it, when
 * the supervisor submitted what (with the GPS evidence and risk flags), and how
 * each submission was reviewed. Works for cancelled assignments too.
 */
const getAssignmentTimeline = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const assignmentId = parseInt(req.params.id);

    const [row] = await query(`${ASSIGNMENT_SELECT} WHERE a.id = ? AND a.institution_id = ?`, [assignmentId, institutionId]);
    if (!row) throw new NotFoundError('Assignment not found');

    const [events, locationRequests, principalRequests] = await Promise.all([
      query(`${EVENT_SELECT} WHERE e.institution_id = ? AND e.assignment_id = ? ORDER BY e.created_at ASC, e.id ASC`, [
        institutionId,
        assignmentId,
      ]),
      query(
        `SELECT r.id, r.status, r.rejection_reason, r.reviewed_at, r.admin_notes, r.gps_samples,
                r.risk_level, r.risk_flags, rv.name AS reviewed_by_name
         FROM school_location_update_requests r LEFT JOIN users rv ON rv.id = r.reviewed_by
         WHERE r.institution_id = ? AND r.capture_assignment_id = ?`,
        [institutionId, assignmentId]
      ),
      query(
        `SELECT r.id, r.status, r.rejection_reason, r.reviewed_at, r.admin_notes, rv.name AS reviewed_by_name
         FROM school_principal_update_requests r LEFT JOIN users rv ON rv.id = r.reviewed_by
         WHERE r.institution_id = ? AND r.capture_assignment_id = ?`,
        [institutionId, assignmentId]
      ),
    ]);

    const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
    const locById = byId(locationRequests);
    const prById = byId(principalRequests);

    const shaped = events.map((e) => {
      const event = shapeEvent(e);
      // Where the request stands NOW (it may have been decided after the event)
      const req_ = e.request_type === 'location' ? locById.get(e.request_id) : e.request_type === 'principal' ? prById.get(e.request_id) : null;
      if (req_) {
        event.request = {
          status: req_.status,
          reviewed_at: req_.reviewed_at,
          reviewed_by_name: req_.reviewed_by_name || null,
          rejection_reason: req_.rejection_reason || null,
          admin_notes: req_.admin_notes || null,
          ...(e.request_type === 'location' ? { gps_samples: parseJson(req_.gps_samples) || [] } : {}),
        };
      }
      return event;
    });

    const a = shapeAssignment(row);
    res.json({
      success: true,
      data: {
        assignment: {
          ...a,
          progress: overallProgress(a),
          assignment_status: row.assignment_status,
          current_latitude: toNumber(row.latitude),
          current_longitude: toNumber(row.longitude),
          maps_url: mapsUrl(toNumber(row.latitude), toNumber(row.longitude)),
        },
        events: shaped,
        totals: {
          events: shaped.length,
          location_submissions: shaped.filter((e) => e.event_type === 'location_submitted').length,
          flagged: shaped.filter((e) => ['medium', 'high'].includes(e.metadata?.risk_level) && e.event_type === 'location_submitted').length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /:institutionId/school-capture/activity
 * The institution-wide (or one supervisor's) capture log, newest first. Filter to
 * flagged submissions to see who keeps tripping the checks.
 * Query: session_id, supervisor_id, school_id, event_type, risk (flagged|high|medium), page, limit
 */
const getActivityLog = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const { session_id, supervisor_id, school_id, event_type, risk } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    let where = 'WHERE e.institution_id = ?';
    const params = [institutionId];
    if (session_id) {
      where += ' AND e.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (supervisor_id) {
      where += ' AND e.supervisor_id = ?';
      params.push(parseInt(supervisor_id));
    }
    if (school_id) {
      where += ' AND a.master_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (event_type) {
      where += ' AND e.event_type = ?';
      params.push(String(event_type));
    }
    if (risk === 'high' || risk === 'medium') {
      where += " AND JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.risk_level')) = ?";
      params.push(risk);
    } else if (risk === 'flagged') {
      where += " AND JSON_UNQUOTE(JSON_EXTRACT(e.metadata, '$.risk_level')) IN ('medium', 'high')";
    }

    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM school_capture_events e ${where}`, params);
    const rows = await query(`${EVENT_SELECT} ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      (page - 1) * limit,
    ]);

    res.json({
      success: true,
      data: rows.map(shapeEvent),
      pagination: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// SUPERVISOR - MY SCHOOLS / SUBMIT
// ============================================================================

function shapeRequest(row, kind) {
  if (!row) return null;
  const base = {
    id: row.id,
    status: row.status,
    rejection_reason: row.rejection_reason || null,
    submitted_at: row.created_at,
    reviewed_at: row.reviewed_at || null,
    by_me: !!row.by_me,
  };
  if (kind === 'location') {
    const latitude = toNumber(row.proposed_latitude);
    const longitude = toNumber(row.proposed_longitude);
    return {
      ...base,
      latitude,
      longitude,
      maps_url: mapsUrl(latitude, longitude),
      ward: row.proposed_ward || null,
      address: row.proposed_address || null,
      accuracy_meters: toNumber(row.accuracy_meters),
      capture_method: row.capture_method || null,
      note: row.student_note || null,
    };
  }
  return { ...base, principal_name: row.proposed_principal_name, principal_phone: row.proposed_principal_phone };
}

/**
 * GET /:institutionId/school-capture/my-schools?session_id
 * EVERY school allocated to the calling supervisor, with current data and the
 * state of any request already filed for it.
 */
const getMySchools = async (req, res, next) => {
  try {
    const institutionId = instId(req);
    const userId = req.user.id;
    const session = await resolveSession(institutionId, req.query.session_id);

    const rows = await query(
      `${ASSIGNMENT_SELECT}
       WHERE a.institution_id = ? AND a.session_id = ? AND a.supervisor_id = ? AND a.status = 'active'
       ORDER BY ms.state, ms.lga, ms.name`,
      [institutionId, session.id, userId]
    );

    const schoolIds = rows.map((r) => r.master_school_id);
    let locationRequests = [];
    let principalRequests = [];
    if (schoolIds.length > 0) {
      [locationRequests, principalRequests] = await Promise.all([
        query(
          `SELECT r.*, (r.submitted_by_user_id = ?) AS by_me
           FROM school_location_update_requests r
           WHERE r.institution_id = ? AND r.session_id = ? AND r.master_school_id IN (?)
           ORDER BY r.created_at DESC, r.id DESC`,
          [userId, institutionId, session.id, schoolIds]
        ),
        query(
          `SELECT r.*, (r.submitted_by_user_id = ?) AS by_me
           FROM school_principal_update_requests r
           WHERE r.institution_id = ? AND r.session_id = ? AND r.master_school_id IN (?)
           ORDER BY r.created_at DESC, r.id DESC`,
          [userId, institutionId, session.id, schoolIds]
        ),
      ]);
    }

    const latestBySchool = (requests) => {
      const map = new Map();
      for (const r of requests) if (!map.has(r.master_school_id)) map.set(r.master_school_id, r);
      return map;
    };
    const latestLocation = latestBySchool(locationRequests);
    const latestPrincipal = latestBySchool(principalRequests);

    const schools = rows.map((row) => {
      // Risk scoring is for reviewers only - a supervisor who can see what trips
      // the checks can learn to avoid them
      const { risk_level: _risk, location_request_id: _locReq, captured_vs_record_m: _vsRecord, ...a } = shapeAssignment(row);
      const latitude = toNumber(row.latitude);
      const longitude = toNumber(row.longitude);
      const hasCoordinates = latitude !== null && longitude !== null;
      const locReq = latestLocation.get(row.master_school_id) || null;
      const prReq = latestPrincipal.get(row.master_school_id) || null;
      return {
        ...a,
        progress: overallProgress(a),
        current: {
          latitude,
          longitude,
          maps_url: mapsUrl(latitude, longitude),
          address: row.address || null,
          principal_name: row.principal_name || null,
          principal_phone: row.principal_phone || null,
          location_verified: hasCoordinates && !!row.location_updated_at,
        },
        location_request: shapeRequest(locReq, 'location'),
        principal_request: shapeRequest(prReq, 'principal'),
        can_submit_location: !locReq || locReq.status !== 'pending',
        can_submit_principal: !prReq || !['pending', 'approved'].includes(prReq.status),
        // Correcting an already-verified point needs a reason, same as students
        requires_note: hasCoordinates && !!row.location_updated_at,
      };
    });

    const count = (pred) => schools.filter(pred).length;
    res.json({
      success: true,
      data: schools,
      session: {
        id: session.id,
        name: session.name,
        max_gps_accuracy_meters: session.max_gps_accuracy_meters ?? null,
      },
      min_correction_distance_m: MIN_CORRECTION_DISTANCE_M,
      summary: {
        total: schools.length,
        not_started: count((s) => s.progress === 'not_started'),
        in_progress: count((s) => s.progress === 'in_progress'),
        pending: count((s) => s.progress === 'pending'),
        rejected: count((s) => s.progress === 'rejected'),
        completed: count((s) => s.progress === 'completed'),
      },
    });
  } catch (error) {
    next(error);
  }
};

/** The caller's own live assignment, with the school's current coordinates. */
async function loadOwnAssignment(req) {
  const institutionId = instId(req);
  const assignment = await queryOne(
    `SELECT a.*, ms.name AS school_name,
            ST_Latitude(ms.location) AS latitude, ST_Longitude(ms.location) AS longitude,
            ms.location_updated_at,
            isv.id AS live_institution_school_id
     FROM school_capture_assignments a
     JOIN master_schools ms ON ms.id = a.master_school_id
     LEFT JOIN institution_schools isv ON isv.master_school_id = a.master_school_id AND isv.institution_id = a.institution_id
     WHERE a.id = ? AND a.institution_id = ?`,
    [parseInt(req.params.assignmentId), institutionId]
  );
  if (!assignment) throw new NotFoundError('Assignment not found');
  if (Number(assignment.supervisor_id) !== Number(req.user.id)) {
    throw new AuthorizationError('This school is not assigned to you');
  }
  if (assignment.status !== 'active') throw new ValidationError('This assignment has been cancelled');
  return { institutionId, assignment };
}

async function getSubmitter(userId) {
  return queryOne('SELECT name, phone FROM users WHERE id = ?', [userId]);
}

/**
 * The context the risk checks need: this supervisor's previous capture, and other
 * schools' points sitting on (almost exactly) the same spot. Bounding-box
 * prefilters in SQL, exact distances in the analyzer.
 */
async function gatherRiskEvidence({ institutionId, userId, masterSchoolId, latitude, longitude }) {
  const DEG = 0.0004; // ~44 m in latitude; wider than any threshold the analyzer applies
  const [previous, submitted, registered] = await Promise.all([
    queryOne(
      `SELECT proposed_latitude AS latitude, proposed_longitude AS longitude, created_at AS at
       FROM school_location_update_requests
       WHERE institution_id = ? AND submitted_by_user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [institutionId, userId]
    ),
    // This institution's other submissions (tenancy: never another institution's requests)
    query(
      `SELECT r.proposed_latitude AS latitude, r.proposed_longitude AS longitude, ms.name AS school_name
       FROM school_location_update_requests r
       JOIN master_schools ms ON ms.id = r.master_school_id
       WHERE r.institution_id = ? AND r.master_school_id <> ? AND r.status <> 'rejected'
         AND r.proposed_latitude BETWEEN ? AND ? AND r.proposed_longitude BETWEEN ? AND ?
       LIMIT 20`,
      [institutionId, masterSchoolId, latitude - DEG, latitude + DEG, longitude - DEG, longitude + DEG]
    ),
    // Every school in the master registry - its points are shared data, so a point
    // reused from ANY institution's school is caught, not just this institution's
    query(
      `SELECT ST_Latitude(ms.location) AS latitude, ST_Longitude(ms.location) AS longitude, ms.name AS school_name
       FROM master_schools ms
       WHERE ms.id <> ? AND ms.status = 'active' AND ms.location IS NOT NULL
         AND ST_Latitude(ms.location) BETWEEN ? AND ? AND ST_Longitude(ms.location) BETWEEN ? AND ?
       LIMIT 20`,
      [masterSchoolId, latitude - DEG, latitude + DEG, longitude - DEG, longitude + DEG]
    ),
  ]);

  const others = [...submitted, ...registered].map((o) => ({
    school_name: o.school_name,
    latitude: Number(o.latitude),
    longitude: Number(o.longitude),
  }));
  return {
    previousCapture: previous
      ? { latitude: Number(previous.latitude), longitude: Number(previous.longitude), at: previous.at }
      : null,
    sameSpotElsewhere: others,
    nearbySchools: others,
  };
}

/** POST /:institutionId/school-capture/my-schools/:assignmentId/location */
const submitLocation = async (req, res, next) => {
  try {
    const { institutionId, assignment } = await loadOwnAssignment(req);
    const {
      proposed_latitude,
      proposed_longitude,
      proposed_ward,
      proposed_address,
      accuracy_meters,
      capture_method,
      gps_samples,
      client_timestamp,
      note,
    } = req.body;

    const session = await getSessionById(institutionId, assignment.session_id);
    if (!session) throw new NotFoundError('Session not found');

    const pending = await queryOne(
      `SELECT id, submitted_by_user_id FROM school_location_update_requests
       WHERE master_school_id = ? AND session_id = ? AND institution_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [assignment.master_school_id, assignment.session_id, institutionId]
    );
    if (pending) {
      throw new ValidationError(
        Number(pending.submitted_by_user_id) === Number(req.user.id)
          ? 'You already have a location awaiting review for this school'
          : 'A location for this school is already awaiting review'
      );
    }

    // Max GPS accuracy comes from the session settings. A GPS reading must carry
    // its accuracy whenever a limit is set - otherwise omitting it would skip the check.
    const maxAccuracy = session.max_gps_accuracy_meters || null;
    const accuracy = toNumber(accuracy_meters);
    if (capture_method === 'gps' && maxAccuracy) {
      if (accuracy === null) {
        throw new ValidationError('The GPS accuracy reading is missing. Record the location again.');
      }
      if (accuracy > maxAccuracy) {
        throw new ValidationError(
          `Your GPS reading is only accurate to ±${Math.round(accuracy)} m. Move outdoors, away from buildings, and try again (max ±${maxAccuracy} m).`
        );
      }
    }

    // Correcting a point that is already verified needs a reason and a real move
    const currentLat = toNumber(assignment.latitude);
    const currentLng = toNumber(assignment.longitude);
    const hasCurrent = currentLat !== null && currentLng !== null;
    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    const approvedThisSession = await queryOne(
      `SELECT id FROM school_location_update_requests
       WHERE master_school_id = ? AND session_id = ? AND institution_id = ? AND status = 'approved' LIMIT 1`,
      [assignment.master_school_id, assignment.session_id, institutionId]
    );
    const external = approvedThisSession
      ? null
      : await getExternalVerification(assignment.master_school_id, assignment.live_institution_school_id);
    const verified = !!approvedThisSession || !!external || !!assignment.location_updated_at;

    if (verified && hasCurrent) {
      if (trimmedNote.length < 10) {
        throw new ValidationError(
          'This school already has a verified location. Please explain why it needs to be corrected (at least 10 characters).'
        );
      }
      const moved = distanceMeters(currentLat, currentLng, proposed_latitude, proposed_longitude);
      if (moved !== null && moved < MIN_CORRECTION_DISTANCE_M) {
        throw new ValidationError(
          `The location on record is already within ${Math.round(moved)} m of the coordinates you submitted, so no correction is needed.`
        );
      }
    }

    const submitter = await getSubmitter(req.user.id);

    // ---- Fraud / mistake signals (never blocking - high risk is held back from bulk approval) ----
    const samples = capture_method === 'gps' ? gps_samples || [] : [];
    const clientTime = client_timestamp && !Number.isNaN(new Date(client_timestamp).getTime()) ? new Date(client_timestamp) : null;
    const evidence = await gatherRiskEvidence({
      institutionId,
      userId: req.user.id,
      masterSchoolId: assignment.master_school_id,
      latitude: proposed_latitude,
      longitude: proposed_longitude,
    });
    const risk = analyzeLocationSubmission({
      latitude: proposed_latitude,
      longitude: proposed_longitude,
      method: capture_method,
      accuracy,
      samples,
      clientTimestamp: clientTime,
      now: new Date(),
      record: hasCurrent ? { latitude: currentLat, longitude: currentLng } : null,
      ...evidence,
    });
    const sampleSummary = summariseSamples(samples);

    let insertedId = null;
    try {
      const inserted = await query(
        `INSERT INTO school_location_update_requests
           (institution_id, session_id, institution_school_id, master_school_id, student_id,
            submitted_by_user_id, capture_assignment_id,
            proposed_latitude, proposed_longitude, proposed_ward, proposed_address,
            accuracy_meters, capture_method, gps_samples, client_timestamp,
            distance_from_record_m, risk_level, risk_flags, student_note,
            previous_latitude, previous_longitude,
            contributor_name, contributor_phone, ip_address, user_agent, status, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          institutionId,
          assignment.session_id,
          assignment.live_institution_school_id || null,
          assignment.master_school_id,
          req.user.id,
          assignment.id,
          proposed_latitude,
          proposed_longitude,
          proposed_ward || null,
          proposed_address || null,
          capture_method === 'gps' ? accuracy : null,
          capture_method,
          samples.length ? JSON.stringify(samples) : null,
          clientTime,
          risk.distance_from_record_m,
          risk.level,
          JSON.stringify(risk.flags),
          trimmedNote || null,
          currentLat,
          currentLng,
          submitter?.name || null,
          submitter?.phone || null,
          req.ip || null,
          req.get('user-agent') || null,
        ]
      );
      insertedId = inserted.insertId;
    } catch (error) {
      // Two submitters can race the same school; the unique pending key wins
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ValidationError('A location for this school is already awaiting review');
      }
      throw error;
    }

    await recordEvent({
      institutionId,
      sessionId: assignment.session_id,
      assignmentId: assignment.id,
      supervisorId: req.user.id,
      actorUserId: req.user.id,
      actorType: 'supervisor',
      eventType: 'location_submitted',
      requestType: 'location',
      requestId: insertedId,
      summary:
        capture_method === 'gps'
          ? `Location recorded by GPS${accuracy !== null ? ` (±${Math.round(accuracy)} m, ${sampleSummary.count} reading${sampleSummary.count === 1 ? '' : 's'})` : ''}`
          : 'Location typed in manually',
      metadata: {
        latitude: proposed_latitude,
        longitude: proposed_longitude,
        maps_url: mapsUrl(proposed_latitude, proposed_longitude),
        capture_method,
        accuracy_meters: capture_method === 'gps' ? accuracy : null,
        max_gps_accuracy_meters: maxAccuracy,
        samples: sampleSummary,
        distance_from_record_m: risk.distance_from_record_m,
        previous_latitude: currentLat,
        previous_longitude: currentLng,
        risk_level: risk.level,
        risk_flags: risk.flags,
        device_clock: clientTime ? clientTime.toISOString() : null,
        had_note: !!trimmedNote,
      },
      ...requestContext(req),
    });

    res.status(201).json({
      success: true,
      message: 'Location submitted. The TP unit will review it.',
    });
  } catch (error) {
    next(error);
  }
};

/** POST /:institutionId/school-capture/my-schools/:assignmentId/principal */
const submitPrincipal = async (req, res, next) => {
  try {
    const { institutionId, assignment } = await loadOwnAssignment(req);
    const { proposed_principal_name, proposed_principal_phone } = req.body;

    const existing = await queryOne(
      `SELECT id, status FROM school_principal_update_requests
       WHERE master_school_id = ? AND session_id = ? AND institution_id = ? AND status IN ('pending', 'approved')
       ORDER BY created_at DESC LIMIT 1`,
      [assignment.master_school_id, assignment.session_id, institutionId]
    );
    if (existing) {
      throw new ValidationError(
        existing.status === 'pending'
          ? 'Principal details for this school are already awaiting review'
          : 'Principal details have already been approved for this school in this session'
      );
    }

    const master = await queryOne(
      `SELECT principal_name, principal_phone FROM master_schools WHERE id = ?`,
      [assignment.master_school_id]
    );
    const submitter = await getSubmitter(req.user.id);

    let principalRequestId = null;
    try {
      const inserted = await query(
        `INSERT INTO school_principal_update_requests
           (institution_id, session_id, institution_school_id, master_school_id,
            submitted_by_user_id, capture_assignment_id,
            proposed_principal_name, proposed_principal_phone,
            previous_principal_name, previous_principal_phone,
            contributor_name, contributor_phone, ip_address, user_agent, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          institutionId,
          assignment.session_id,
          assignment.live_institution_school_id || null,
          assignment.master_school_id,
          req.user.id,
          assignment.id,
          proposed_principal_name,
          proposed_principal_phone,
          master?.principal_name || null,
          master?.principal_phone || null,
          submitter?.name || null,
          submitter?.phone || null,
          req.ip || null,
          req.get('user-agent') || null,
        ]
      );
      principalRequestId = inserted.insertId;
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ValidationError('Principal details for this school are already awaiting review');
      }
      throw error;
    }

    await recordEvent({
      institutionId,
      sessionId: assignment.session_id,
      assignmentId: assignment.id,
      supervisorId: req.user.id,
      actorUserId: req.user.id,
      actorType: 'supervisor',
      eventType: 'principal_submitted',
      requestType: 'principal',
      requestId: principalRequestId,
      summary: 'Principal details submitted',
      metadata: {
        principal_name: proposed_principal_name,
        principal_phone: proposed_principal_phone,
        previous_principal_name: master?.principal_name || null,
        previous_principal_phone: master?.principal_phone || null,
        // Typing the phone number already on file again is a copy, not a capture
        unchanged: master?.principal_phone === proposed_principal_phone && (master?.principal_name || '').toUpperCase() === proposed_principal_name,
      },
      ...requestContext(req),
    });

    res.status(201).json({
      success: true,
      message: 'Principal details submitted. The TP unit will review them.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  // Admin
  getOptions,
  getEligibleSchoolList,
  previewPlan,
  executePlan,
  manualBulkAssign,
  getAssignments,
  getAssignmentTimeline,
  getActivityLog,
  reassignAssignment,
  cancelAssignment,
  getBatches,
  rollbackBatch,
  // Supervisor
  getMySchools,
  submitLocation,
  submitPrincipal,
  // Exposed for tests
  computeNeeds,
  overallProgress,
  deriveStatus,
};
