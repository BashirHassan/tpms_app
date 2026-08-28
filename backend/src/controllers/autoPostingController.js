/**
 * Auto-Posting Controller (MedeePay Pattern)
 *
 * Fetches the data the allocation engine needs, runs it, and persists the result.
 * The allocation strategy itself lives in services/autoPostingEngine.js.
 *
 * Responsibilities here:
 * - Resolve eligible supervisors, available slots and existing school history
 * - Enforce the dean posting allocation (ceiling on assignments + usage counter)
 * - Report data-quality problems that would produce financially wrong postings
 * - Persist postings, including dependent postings for merged groups
 *
 * @see docs/AUTOMATED_POSTING_SYSTEM.md for full specification
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

const { calculateAllowances } = require('../services/allowanceCalculator');
const { runAutoPostingAlgorithm } = require('../services/autoPostingEngine');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * z.coerce.boolean() is a footgun: Boolean(anyNonEmptyString) is always true,
 * so a value that ever arrives as the STRING "false" (a query param, a
 * doubly-stringified body, form data, a non-browser caller) would be
 * silently coerced to `true`. This accepts a real boolean or the literal
 * strings "true"/"false" and nothing else, so a mis-shaped request fails
 * validation instead of silently flipping a checkbox's meaning.
 */
const strictBoolean = (defaultValue) =>
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(defaultValue);

const idList = () => z.array(z.coerce.number().int().positive()).optional().default([]);

const schemas = {
  autoPost: z.object({
    body: z.object({
      session_id: z.coerce.number().int().positive('Session ID is required'),
      number_of_postings: z.coerce.number().int().min(1).max(10).default(1),
      posting_type: z.enum(['random', 'route_based', 'lga_based']).default('random'),
      priority_enabled: strictBoolean(true),
      avoid_repeat_schools: strictBoolean(true), // Don't send a supervisor to the same school twice
      faculty_id: z.coerce.number().int().positive().optional().nullable(), // For dean filtering
      dry_run: strictBoolean(false), // Preview without creating

      // Scope-narrowing filters - request-time only, never persisted as config.
      // All default to [] (no narrowing), preserving today's institution-wide behavior.
      supervisor_ids: idList(),
      faculty_ids: idList(), // Admin-editable narrowing; ANDs with faculty_id, never replaces it
      states: z.array(z.string().min(1)).optional().default([]),
      lgas: z.array(z.object({ state: z.string().min(1), lga: z.string().min(1) })).optional().default([]),
      route_ids: idList(),
      visit_numbers: z.array(z.coerce.number().int().min(1).max(10)).optional().default([]),
    }),
  }),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get session by ID with validation
 */
async function getSession(institutionId, sessionId) {
  const [session] = await query(
    'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
    [parseInt(sessionId), parseInt(institutionId)]
  );
  return session;
}

/**
 * Append an `AND column IN (...)` clause when values is non-empty, pushing params.
 * A no-op when values is empty/undefined, so callers can chain filters unconditionally.
 */
function appendInClause(sql, params, column, values) {
  if (!values || values.length === 0) return sql;
  params.push(...values);
  return `${sql} AND ${column} IN (${values.map(() => '?').join(',')})`;
}

/**
 * Resolve and validate the scope-narrowing filters from a request body.
 *
 * digitaltp uses plain integer IDs (no opaque public_ids), so validation is a
 * direct institution-scoped existence check: any submitted ID not found in this
 * institution throws, naming the offender, rather than silently widening scope.
 *
 * States/LGAs are matched as (state, lga) pairs - never a bare LGA name - because
 * LGA names repeat across different states.
 */
async function resolveAutoPostFilters(institutionId, body) {
  const instId = parseInt(institutionId);

  const resolveIds = async (table, ids, label) => {
    if (!ids || ids.length === 0) return [];
    const unique = [...new Set(ids)];
    const rows = await query(
      `SELECT id FROM ${table} WHERE institution_id = ? AND id IN (${unique.map(() => '?').join(',')})`,
      [instId, ...unique]
    );
    const found = new Set(rows.map((r) => r.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ValidationError(`${label} id(s) ${missing.join(', ')} were not found in this institution`);
    }
    return unique;
  };

  const normalise = (v) => String(v ?? '').trim().toUpperCase();
  const states = [...new Set((body.states || []).map((s) => String(s).trim()).filter(Boolean))];
  const lgaPairs = (body.lgas || [])
    .map(({ state, lga }) => ({ state: String(state).trim(), lga: String(lga).trim() }))
    .filter(({ state, lga }) => state && lga);

  if (states.length > 0 || lgaPairs.length > 0) {
    const known = await query(
      `SELECT DISTINCT ms.state, ms.lga
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.institution_id = ? AND isv.status = 'active'`,
      [instId]
    );
    const knownStates = new Set(known.map((r) => normalise(r.state)));
    const knownPairs = new Set(known.map((r) => `${normalise(r.state)}::${normalise(r.lga)}`));

    const badStates = states.filter((s) => !knownStates.has(normalise(s)));
    if (badStates.length > 0) {
      throw new ValidationError(`State(s) ${badStates.join(', ')} have no schools in this institution`);
    }
    const badPairs = lgaPairs.filter(({ state, lga }) => !knownPairs.has(`${normalise(state)}::${normalise(lga)}`));
    if (badPairs.length > 0) {
      throw new ValidationError(
        `LGA(s) ${badPairs.map((p) => `${p.lga} (${p.state})`).join(', ')} have no schools in this institution`
      );
    }
  }

  return {
    supervisorIds: await resolveIds('users', body.supervisor_ids, 'Supervisor'),
    facultyIds: await resolveIds('faculties', body.faculty_ids, 'Faculty'),
    routeIds: await resolveIds('routes', body.route_ids, 'Route'),
    states,
    lgaPairs,
    visitNumbers: [...new Set(body.visit_numbers || [])].sort((a, b) => a - b),
  };
}

/**
 * Reject an explicit visit number beyond the session's supervision-visit limit.
 */
function assertVisitNumbersWithinSession(visitNumbers, session) {
  const maxVisits = session.max_supervision_visits;
  const overflow = visitNumbers.find((v) => v > maxVisits);
  if (overflow !== undefined) {
    throw new ValidationError(
      `Visit ${overflow} is outside this session's limit of ${maxVisits} supervision visit(s)`
    );
  }
}

/**
 * Get max primary postings per supervisor from session settings
 * This is the cap on how many postings a supervisor can receive
 */
async function getMaxPostingsPerSupervisor(institutionId, sessionId) {
  const session = await getSession(institutionId, sessionId);
  // Use max_posting_per_supervisor if set, otherwise fall back to max_supervision_visits
  return session?.max_posting_per_supervisor || session?.max_supervision_visits || 3;
}

/**
 * Get eligible supervisors for auto-posting
 * Ordered by priority (if enabled) then by existing postings count
 *
 * Eligible roles: supervisor, head_of_teaching_practice.
 * Field monitors do monitoring visits, not supervision postings, so they are excluded.
 */
async function getEligibleSupervisors(institutionId, sessionId, priorityEnabled, facultyId = null, filters = {}) {
  const maxPostings = await getMaxPostingsPerSupervisor(institutionId, sessionId);

  let sql = `
    SELECT 
      u.id, u.name, u.email, u.faculty_id,
      r.id as rank_id, r.name as rank_name, r.code as rank_code,
      r.priority_number,
      r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund,
      f.name as faculty_name,
      COALESCE(ps.posting_count, 0) as current_postings,
      ? - COALESCE(ps.posting_count, 0) as remaining_slots
    FROM users u
    LEFT JOIN ranks r ON u.rank_id = r.id
    LEFT JOIN faculties f ON u.faculty_id = f.id
    LEFT JOIN (
      SELECT supervisor_id, COUNT(*) as posting_count
      FROM supervisor_postings
      WHERE institution_id = ? AND session_id = ? 
            AND status != 'cancelled' AND is_primary_posting = 1
      GROUP BY supervisor_id
    ) ps ON u.id = ps.supervisor_id
    WHERE u.institution_id = ?
          AND u.role NOT IN ('super_admin', 'student', 'field_monitor')
          AND u.status = 'active'
          AND (? - COALESCE(ps.posting_count, 0)) > 0
  `;

  const params = [
    maxPostings, 
    parseInt(institutionId), 
    parseInt(sessionId), 
    parseInt(institutionId), 
    maxPostings
  ];

  if (facultyId) {
    sql += ' AND u.faculty_id = ?';
    params.push(parseInt(facultyId));
  }

  sql = appendInClause(sql, params, 'u.id', filters.supervisorIds);
  sql = appendInClause(sql, params, 'u.faculty_id', filters.facultyIds);

  // Order by priority if enabled, then by fewest existing postings
  if (priorityEnabled) {
    sql += ' ORDER BY COALESCE(r.priority_number, 99) ASC, COALESCE(ps.posting_count, 0) ASC, u.name ASC';
  } else {
    sql += ' ORDER BY COALESCE(ps.posting_count, 0) ASC, u.name ASC';
  }

  return await query(sql, params);
}

/**
 * Get available school slots for auto-posting
 * Returns all school + group + visit combinations that are not yet assigned
 * 
 * IMPORTANT: Groups are derived from the student_acceptances table - there is no
 * separate table for them. Groups are determined by counting approved student
 * acceptances per school per group_number.
 * Secondary/merged groups are excluded as they get dependent postings automatically.
 */
async function getAvailableSlots(institutionId, sessionId, filters = {}) {
  // Get session settings
  const [session] = await query(
    'SELECT max_supervision_visits FROM academic_sessions WHERE id = ?',
    [sessionId]
  );
  const maxVisits = session?.max_supervision_visits || 3;

  // Get all schools with their groups (only schools with students)
  // Derives groups from student_acceptances table (approved students grouped by group_number)
  // Excludes secondary/merged groups - they get dependent postings automatically
  let schoolsSql = `
    SELECT
      isv.id as school_id,
      ms.name as school_name,
      ms.lga,
      ms.state,
      isv.route_id,
      r.name as route_name,
      isv.distance_km,
      isv.location_category,
      sa.group_number,
      COUNT(DISTINCT sa.student_id) as student_count
    FROM institution_schools isv
    JOIN master_schools ms ON isv.master_school_id = ms.id
    LEFT JOIN routes r ON isv.route_id = r.id
    JOIN student_acceptances sa ON sa.institution_school_id = isv.id
      AND sa.session_id = ?
      AND sa.institution_id = ?
      AND sa.status = 'approved'
    LEFT JOIN merged_groups mg ON mg.secondary_institution_school_id = isv.id
      AND mg.secondary_group_number = sa.group_number
      AND mg.session_id = sa.session_id
      AND mg.status = 'active'
    WHERE isv.institution_id = ? AND isv.status = 'active' AND mg.id IS NULL
  `;
  const schoolParams = [parseInt(sessionId), parseInt(institutionId), parseInt(institutionId)];

  schoolsSql = appendInClause(schoolsSql, schoolParams, 'ms.state', filters.states);
  schoolsSql = appendInClause(schoolsSql, schoolParams, 'isv.route_id', filters.routeIds);
  if (filters.lgaPairs && filters.lgaPairs.length > 0) {
    schoolsSql += ` AND (ms.state, ms.lga) IN (${filters.lgaPairs.map(() => '(?,?)').join(',')})`;
    for (const { state, lga } of filters.lgaPairs) schoolParams.push(state, lga);
  }

  schoolsSql += `
    GROUP BY isv.id, ms.name, ms.lga, ms.state, isv.route_id, r.name, isv.distance_km, isv.location_category, sa.group_number
    HAVING student_count > 0`;

  const schools = await query(schoolsSql, schoolParams);

  // Get existing postings to find available slots
  const existingPostings = await query(
    `SELECT institution_school_id, group_number, visit_number
     FROM supervisor_postings
     WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'`,
    [parseInt(institutionId), parseInt(sessionId)]
  );

  // Create a set of taken slots
  const takenSlots = new Set(
    existingPostings.map(p => `${p.institution_school_id}-${p.group_number}-${p.visit_number}`)
  );

  // Generate available slots (school + group + visit combinations)
  const availableSlots = [];
  for (const school of schools) {
    for (let visit = 1; visit <= maxVisits; visit++) {
      const slotKey = `${school.school_id}-${school.group_number}-${visit}`;
      if (!takenSlots.has(slotKey)) {
        availableSlots.push({
          id: slotKey,
          school_id: school.school_id,
          school_name: school.school_name,
          group_number: school.group_number,
          visit_number: visit,
          route_id: school.route_id,
          route_name: school.route_name,
          state: school.state,
          lga: school.lga,
          distance_km: parseFloat(school.distance_km) || 0,
          location_category: school.location_category,
        });
      }
    }
  }

  // Sort by distance DESC (longest first for priority assignment)
  availableSlots.sort((a, b) => b.distance_km - a.distance_km);

  return availableSlots;
}

/**
 * Get the schools each supervisor is already covering for this session
 *
 * Returns Map<supervisor_id, Set<institution_school_id>>. Includes manual postings,
 * postings from earlier auto-posting batches, and merged/dependent postings - anything
 * that already puts the supervisor at that school.
 */
async function getSupervisorSchoolHistory(institutionId, sessionId) {
  const rows = await query(
    `SELECT DISTINCT supervisor_id, institution_school_id
     FROM supervisor_postings
     WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'`,
    [parseInt(institutionId), parseInt(sessionId)]
  );

  const history = new Map();
  for (const row of rows) {
    if (!history.has(row.supervisor_id)) {
      history.set(row.supervisor_id, new Set());
    }
    history.get(row.supervisor_id).add(row.institution_school_id);
  }
  return history;
}

/**
 * Flag inputs that would silently produce financially wrong postings.
 *
 * A supervisor with no rank has no allowance rates, so every posting they receive
 * pays zero. A school with no distance is treated as "inside" the threshold and
 * pays local running only. Neither is an error - the admin may know better - but
 * neither should happen without being told.
 */
function collectDataQuality(supervisors, slots) {
  const rankless = supervisors.filter((s) => !s.rank_id);

  const distancelessSchools = new Map();
  for (const slot of slots) {
    if (slot.distance_km > 0) continue;
    if (!distancelessSchools.has(slot.school_id)) {
      distancelessSchools.set(slot.school_id, {
        school_id: slot.school_id,
        school_name: slot.school_name,
        slots: 0,
      });
    }
    distancelessSchools.get(slot.school_id).slots++;
  }

  return {
    supervisors_without_rank_count: rankless.length,
    supervisors_without_rank: rankless
      .slice(0, 20)
      .map((s) => ({ id: s.id, name: s.name })),
    schools_without_distance_count: distancelessSchools.size,
    schools_without_distance: [...distancelessSchools.values()].slice(0, 20),
  };
}

/**
 * Resolve the acting user's dean posting allocation, if one applies.
 *
 * Mirrors the check in postingController.createMultiPostings so auto-posting is
 * bound by the same quota as manual multiposting. Admin-level users are exempt.
 *
 * @returns {Object|null} The allocation row plus `remaining`, or null when exempt
 */
async function getDeanAllocation(institutionId, sessionId, user) {
  const isAdminLevel = ['super_admin', 'head_of_teaching_practice'].includes(user.role);
  const isDean = user.is_dean === 1;

  if (isAdminLevel || !isDean) return null;

  const [allocation] = await query(
    `SELECT * FROM dean_posting_allocations
     WHERE institution_id = ? AND session_id = ? AND dean_user_id = ?`,
    [parseInt(institutionId), parseInt(sessionId), user.id]
  );

  if (!allocation) {
    throw new ValidationError('You do not have a posting allocation for this session');
  }

  return {
    ...allocation,
    remaining: Math.max(0, allocation.allocated_postings - allocation.used_postings),
  };
}

/**
 * Create postings from assignments using transaction
 *
 * @param {number} maxPostingsPerSupervisor - Resolved cap; must be the same value the
 *   planner used, or the guard here silently disagrees with what was previewed
 * @param {Object|null} deanAllocation - When set, used_postings is advanced inside
 *   the same transaction by the number of primary postings actually created
 */
async function createPostingsFromAssignments(
  institutionId,
  sessionId,
  session,
  assignments,
  userId,
  batchId,
  maxPostingsPerSupervisor,
  deanAllocation = null
) {
  const results = { total: 0, supervisorCount: 0, details: [] };
  const supervisorIds = new Set();

  // Build cache of supervisors and schools to avoid repeated queries
  const supervisorCache = new Map();
  const schoolCache = new Map();

  // Pre-fetch all needed supervisors
  const supervisorIdList = [...new Set(assignments.map(a => a.supervisor_id))];
  if (supervisorIdList.length > 0) {
    const supervisors = await query(
      `SELECT u.*, r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       WHERE u.id IN (${supervisorIdList.map(() => '?').join(',')})`,
      supervisorIdList
    );
    for (const s of supervisors) {
      supervisorCache.set(s.id, s);
    }
  }

  // Pre-fetch all needed schools
  const schoolIdList = [...new Set(assignments.map(a => a.school_id))];
  if (schoolIdList.length > 0) {
    const schools = await query(
      `SELECT isv.*, ms.name as school_name, r.name as route_name
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE isv.id IN (${schoolIdList.map(() => '?').join(',')})`,
      schoolIdList
    );
    for (const s of schools) {
      schoolCache.set(s.id, s);
    }
  }

  return await transaction(async (conn) => {
    // Track slots used in this batch to prevent duplicates within the batch
    const batchUsedSlots = new Set();
    const skipped = [];

    for (const assignment of assignments) {
      const supervisor = supervisorCache.get(assignment.supervisor_id);
      const school = schoolCache.get(assignment.school_id);

      if (!supervisor || !school) {
        skipped.push({ ...assignment, reason: 'Missing supervisor or school data' });
        continue;
      }

      const slotKey = `${assignment.school_id}-${assignment.group_number}-${assignment.visit_number}`;

      // Check if this slot was already used in this batch
      if (batchUsedSlots.has(slotKey)) {
        skipped.push({ ...assignment, reason: 'Duplicate slot in batch' });
        continue;
      }

      // Check if posting already exists in database (school + group + visit)
      const [existingCheck] = await conn.execute(
        `SELECT id, supervisor_id FROM supervisor_postings 
         WHERE institution_id = ? AND session_id = ? 
               AND institution_school_id = ? AND group_number = ? AND visit_number = ?
               AND status != 'cancelled'
         LIMIT 1`,
        [parseInt(institutionId), parseInt(sessionId), 
         assignment.school_id, assignment.group_number, assignment.visit_number]
      );

      if (existingCheck.length > 0) {
        skipped.push({ 
          ...assignment, 
          reason: `Slot already assigned to another supervisor (posting ID: ${existingCheck[0].id})` 
        });
        continue;
      }

      // Check supervisor posting limit (only count primary postings)
      const [countCheck] = await conn.execute(
        `SELECT COUNT(*) as count FROM supervisor_postings 
         WHERE institution_id = ? AND session_id = ? AND supervisor_id = ? 
               AND status != 'cancelled' AND is_primary_posting = 1`,
        [parseInt(institutionId), parseInt(sessionId), assignment.supervisor_id]
      );

      // Uses the same resolved cap the planner used. Comparing against the raw
      // session column here would silently disable the guard when it is NULL
      // (count >= null is always false).
      if (countCheck[0].count >= maxPostingsPerSupervisor) {
        skipped.push({
          ...assignment,
          reason: `Supervisor reached max posting limit (${maxPostingsPerSupervisor})`,
        });
        continue;
      }

      // Calculate allowances
      const allowances = calculateAllowances(supervisor, school, session, false);

      // Insert PRIMARY posting
      const [result] = await conn.execute(
        `INSERT INTO supervisor_postings 
         (institution_id, session_id, supervisor_id, institution_school_id, route_id,
          group_number, visit_number, distance_km, transport, dsa, dta, local_running,
          tetfund, is_primary_posting, rank_id, posting_type, posted_by, auto_posting_batch_id,
          posted_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'auto', ?, ?, NOW(), 'active', NOW())`,
        [
          parseInt(institutionId),
          parseInt(sessionId),
          assignment.supervisor_id,
          assignment.school_id,
          school.route_id || null,
          assignment.group_number,
          assignment.visit_number,
          allowances.distance_km,
          allowances.transport,
          allowances.dsa,
          allowances.dta,
          allowances.local_running,
          allowances.tetfund,
          supervisor.rank_id || null,
          userId,
          batchId,
        ]
      );

      const primaryPostingId = result.insertId;

      batchUsedSlots.add(slotKey);
      supervisorIds.add(assignment.supervisor_id);
      results.total++;
      results.details.push({
        posting_id: primaryPostingId,
        ...assignment,
        is_primary: true,
        allowances: {
          transport: allowances.transport,
          dsa: allowances.dsa,
          dta: allowances.dta,
          local_running: allowances.local_running,
          tetfund: allowances.tetfund,
          total: allowances.total,
        },
      });

      // Handle DEPENDENT/MERGED groups - same as multiposting
      // These are secondary groups that get auto-posted with zero allowances
      const [mergedGroups] = await conn.execute(
        `SELECT mg.*, 
                mg.secondary_institution_school_id as secondary_school_id,
                ms.name as secondary_school_name,
                isv.route_id as secondary_route_id,
                isv.distance_km as secondary_distance_km
         FROM merged_groups mg
         JOIN institution_schools isv ON mg.secondary_institution_school_id = isv.id
         JOIN master_schools ms ON isv.master_school_id = ms.id
         WHERE mg.institution_id = ? 
           AND mg.session_id = ?
           AND mg.primary_institution_school_id = ?
           AND mg.primary_group_number = ?
           AND mg.status = 'active'`,
        [parseInt(institutionId), parseInt(sessionId), 
         assignment.school_id, assignment.group_number]
      );

      // Create dependent postings for each secondary/merged group
      for (const merged of mergedGroups) {
        // Check if dependent posting already exists
        const [existingDependent] = await conn.execute(
          `SELECT id FROM supervisor_postings 
           WHERE institution_id = ? AND session_id = ? 
                 AND institution_school_id = ? AND group_number = ? AND visit_number = ?
                 AND status != 'cancelled'`,
          [parseInt(institutionId), parseInt(sessionId),
           merged.secondary_school_id, merged.secondary_group_number, assignment.visit_number]
        );

        if (existingDependent.length > 0) {
          continue; // Skip if already exists
        }

        // Calculate ZERO allowances for secondary posting
        const secondarySchool = {
          distance_km: merged.secondary_distance_km || 0,
        };
        const secondaryAllowances = calculateAllowances(supervisor, secondarySchool, session, true);

        // Create SECONDARY/DEPENDENT posting with zero allowances
        const [secondaryResult] = await conn.execute(
          `INSERT INTO supervisor_postings 
           (institution_id, session_id, supervisor_id, institution_school_id, route_id, 
            group_number, visit_number, distance_km, transport, dsa, dta, local_running,
            tetfund, is_primary_posting, rank_id, merged_with_posting_id, posting_type, 
            posted_by, auto_posting_batch_id, posted_at, status, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, 'auto', ?, ?, NOW(), 'active', NOW())`,
          [
            parseInt(institutionId),
            parseInt(sessionId),
            assignment.supervisor_id,
            merged.secondary_school_id,
            merged.secondary_route_id || null,
            merged.secondary_group_number,
            assignment.visit_number,
            secondaryAllowances.distance_km,
            supervisor.rank_id || null,
            primaryPostingId, // Link to the primary posting
            userId,
            batchId,
          ]
        );

        results.details.push({
          posting_id: secondaryResult.insertId,
          supervisor_id: assignment.supervisor_id,
          supervisor_name: assignment.supervisor_name,
          school_id: merged.secondary_school_id,
          school_name: merged.secondary_school_name,
          group_number: merged.secondary_group_number,
          visit_number: assignment.visit_number,
          is_primary: false,
          is_dependent: true,
          merged_with_posting_id: primaryPostingId,
          allowances: { transport: 0, dsa: 0, dta: 0, local_running: 0, tetfund: 0, total: 0 },
        });
      }
    }

    // Advance the dean's usage inside the same transaction, so a rollback cannot
    // leave the counter ahead of the postings it is supposed to track
    if (deanAllocation && results.total > 0) {
      await conn.execute(
        `UPDATE dean_posting_allocations
         SET used_postings = used_postings + ?, updated_at = NOW()
         WHERE id = ?`,
        [results.total, deanAllocation.id]
      );
      results.deanAllocationUsed = results.total;
    }

    results.supervisorCount = supervisorIds.size;
    results.skipped = skipped;
    return results;
  });
}

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Summarise the resolved scope filters for display in preview/execute/history.
 */
function summariseFilters(filters, supervisors, slots) {
  const isScoped =
    filters.supervisorIds.length > 0 ||
    filters.facultyIds.length > 0 ||
    filters.states.length > 0 ||
    filters.lgaPairs.length > 0 ||
    filters.routeIds.length > 0 ||
    filters.visitNumbers.length > 0;

  return {
    is_scoped: isScoped,
    supervisor_count: filters.supervisorIds.length,
    supervisor_names:
      filters.supervisorIds.length > 0 ? supervisors.slice(0, 50).map((s) => s.name) : [],
    faculty_count: filters.facultyIds.length,
    faculty_names:
      filters.facultyIds.length > 0
        ? [...new Set(supervisors.map((s) => s.faculty_name).filter(Boolean))]
        : [],
    states: filters.states,
    lgas: filters.lgaPairs,
    route_count: filters.routeIds.length,
    route_names:
      filters.routeIds.length > 0
        ? [...new Set(slots.map((s) => s.route_name).filter(Boolean))]
        : [],
    visit_numbers: filters.visitNumbers,
  };
}

/**
 * Preview auto-posting results without creating
 * POST /:institutionId/auto-posting/preview
 */
const previewAutoPosting = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.autoPost.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, number_of_postings, posting_type, priority_enabled, avoid_repeat_schools, faculty_id } = validation.data.body;

    // Get session
    const session = await getSession(institutionId, session_id);
    if (!session) throw new NotFoundError('Session not found');

    // Validate number_of_postings
    if (number_of_postings > session.max_supervision_visits) {
      throw new ValidationError(
        `Number of postings cannot exceed session limit of ${session.max_supervision_visits}`
      );
    }

    const filters = await resolveAutoPostFilters(institutionId, validation.data.body);
    assertVisitNumbersWithinSession(filters.visitNumbers, session);

    // Get data
    const supervisors = await getEligibleSupervisors(institutionId, session_id, priority_enabled, faculty_id, filters);
    const slots = await getAvailableSlots(institutionId, session_id, filters);
    const schoolHistory = await getSupervisorSchoolHistory(institutionId, session_id);
    const deanAllocation = await getDeanAllocation(institutionId, session_id, req.user);

    // Log for debugging
    console.log(`[Auto-Post Preview] visits_to_include=${number_of_postings}, total_slots=${slots.length}, supervisors=${supervisors.length}`);

    // Run algorithm (dry run). An explicit visit selection (including non-contiguous
    // sets like [1,3]) is handled natively by the engine, which supersedes the
    // "visits 1 through N" shorthand when given.
    const result = runAutoPostingAlgorithm(
      supervisors,
      slots,
      number_of_postings,
      posting_type,
      priority_enabled,
      {
        avoidRepeatSchools: avoid_repeat_schools,
        schoolHistory,
        maxAssignments: deanAllocation ? deanAllocation.remaining : Infinity,
        visitNumbers: filters.visitNumbers,
      }
    );

    // Slots the run actually considered - the engine decides visit eligibility, so this
    // is read back from it rather than recomputed here where the two could drift apart
    const filteredSlotsCount = result.statistics.filtered_slots_count;

    res.json({
      success: true,
      data: {
        preview: true,
        // A number for a plain 1..N run, or the exact array when specific visits were chosen -
        // callers that need to display this should handle both shapes (see describeVisits on
        // the frontend)
        visits_included: result.statistics.visits_included,
        total_supervisors: supervisors.length,
        total_available_slots: filteredSlotsCount, // Show only slots for selected visits
        total_all_slots: slots.length, // Total including all visits
        assignments: result.assignments,
        statistics: result.statistics,
        warnings: result.warnings,
        data_quality: collectDataQuality(supervisors, slots),
        filters_applied: summariseFilters(filters, supervisors, slots),
        dean_allocation: deanAllocation
          ? {
              allocated: deanAllocation.allocated_postings,
              used: deanAllocation.used_postings,
              remaining: deanAllocation.remaining,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Execute auto-posting
 * POST /:institutionId/auto-posting/execute
 */
const executeAutoPosting = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const userId = req.user.id;
    const validation = schemas.autoPost.safeParse({ body: req.body });
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, number_of_postings, posting_type, priority_enabled, avoid_repeat_schools, faculty_id } = validation.data.body;

    // Get session
    const session = await getSession(institutionId, session_id);
    if (!session) throw new NotFoundError('Session not found');

    if (number_of_postings > session.max_supervision_visits) {
      throw new ValidationError(
        `Number of postings cannot exceed session limit of ${session.max_supervision_visits}`
      );
    }

    const filters = await resolveAutoPostFilters(institutionId, validation.data.body);
    assertVisitNumbersWithinSession(filters.visitNumbers, session);

    // Get data
    const supervisors = await getEligibleSupervisors(institutionId, session_id, priority_enabled, faculty_id, filters);
    const slots = await getAvailableSlots(institutionId, session_id, filters);
    const schoolHistory = await getSupervisorSchoolHistory(institutionId, session_id);
    const deanAllocation = await getDeanAllocation(institutionId, session_id, req.user);
    const maxPostingsPerSupervisor = await getMaxPostingsPerSupervisor(institutionId, session_id);

    if (deanAllocation && deanAllocation.remaining <= 0) {
      throw new ValidationError(
        `Your posting allocation for this session is exhausted (${deanAllocation.used_postings} of ${deanAllocation.allocated_postings} used)`
      );
    }

    // Run algorithm. An explicit visit selection (including non-contiguous sets like
    // [1,3]) is handled natively by the engine, which supersedes the "visits 1
    // through N" shorthand when given.
    const result = runAutoPostingAlgorithm(
      supervisors,
      slots,
      number_of_postings,
      posting_type,
      priority_enabled,
      {
        avoidRepeatSchools: avoid_repeat_schools,
        schoolHistory,
        maxAssignments: deanAllocation ? deanAllocation.remaining : Infinity,
        visitNumbers: filters.visitNumbers,
      }
    );

    if (result.assignments.length === 0) {
      throw new ValidationError('No valid assignments could be made. Check available slots and supervisor eligibility.');
    }

    // Create batch record
    const batch = await query(
      `INSERT INTO auto_posting_batches
       (institution_id, session_id, initiated_by, criteria, status, started_at)
       VALUES (?, ?, ?, ?, 'processing', NOW())`,
      [
        parseInt(institutionId),
        parseInt(session_id),
        userId,
        JSON.stringify({
          number_of_postings,
          posting_type,
          priority_enabled,
          avoid_repeat_schools,
          faculty_id,
          supervisor_ids: filters.supervisorIds,
          faculty_ids: filters.facultyIds,
          states: filters.states,
          lgas: filters.lgaPairs,
          route_ids: filters.routeIds,
          visit_numbers: filters.visitNumbers,
        }),
      ]
    );

    const batchId = batch.insertId;

    // Create postings in transaction
    try {
      const created = await createPostingsFromAssignments(
        institutionId,
        session_id,
        session,
        result.assignments,
        userId,
        batchId,
        maxPostingsPerSupervisor,
        deanAllocation
      );

      // Update batch as completed
      await query(
        `UPDATE auto_posting_batches 
         SET status = 'completed', 
             total_postings_created = ?,
             total_supervisors_posted = ?,
             completed_at = NOW()
         WHERE id = ?`,
        [created.total, created.supervisorCount, batchId]
      );

      // Add warnings for skipped records
      if (created.skipped && created.skipped.length > 0) {
        result.warnings.push(`${created.skipped.length} assignments were skipped due to validation errors`);
      }

      res.json({
        success: true,
        message: `Created ${created.total} postings for ${created.supervisorCount} supervisors`,
        data: {
          batch_id: batchId,
          total_postings_created: created.total,
          total_supervisors: created.supervisorCount,
          skipped: created.skipped || [],
          assignments: created.details,
          statistics: result.statistics,
          warnings: result.warnings,
          data_quality: collectDataQuality(supervisors, slots),
          filters_applied: summariseFilters(filters, supervisors, slots),
          dean_allocation: deanAllocation
            ? {
                allocated: deanAllocation.allocated_postings,
                used: deanAllocation.used_postings + (created.deanAllocationUsed || 0),
                remaining: Math.max(0, deanAllocation.remaining - (created.deanAllocationUsed || 0)),
              }
            : null,
        },
      });
    } catch (error) {
      // Mark batch as failed
      await query(
        `UPDATE auto_posting_batches SET status = 'failed', error_message = ? WHERE id = ?`,
        [error.message, batchId]
      );
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

function totalSupervisorCapacity(supervisors) {
  return supervisors.reduce((sum, s) => sum + Math.max(0, Number(s.remaining_slots) || 0), 0);
}

/**
 * Get what an auto-posting run can be scoped to: faculties, supervisors,
 * states/LGAs, routes and visits - each counted from the CURRENTLY ELIGIBLE
 * pool (no filters applied here), so every picker option's count is honest
 * about what selecting just that one filter would actually match.
 * GET /:institutionId/auto-posting/options
 */
const getAutoPostingOptions = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, faculty_id } = req.query;
    if (!session_id) throw new ValidationError('session_id is required');

    const session = await getSession(institutionId, session_id);
    if (!session) throw new NotFoundError('Session not found');

    const [supervisors, slots] = await Promise.all([
      getEligibleSupervisors(institutionId, session.id, true, faculty_id),
      getAvailableSlots(institutionId, session.id),
    ]);

    const stateIndex = new Map();
    const routeIndex = new Map();
    const visitIndex = new Map();

    for (const slot of slots) {
      const stateName = slot.state || 'Unknown';
      if (!stateIndex.has(stateName)) {
        stateIndex.set(stateName, { state: stateName, slot_count: 0, lgas: new Map() });
      }
      const stateEntry = stateIndex.get(stateName);
      stateEntry.slot_count++;
      const lgaName = slot.lga || 'Unknown';
      if (!stateEntry.lgas.has(lgaName)) {
        stateEntry.lgas.set(lgaName, { lga: lgaName, slot_count: 0, schools: new Set() });
      }
      const lgaEntry = stateEntry.lgas.get(lgaName);
      lgaEntry.slot_count++;
      lgaEntry.schools.add(slot.school_id);

      if (slot.route_id) {
        if (!routeIndex.has(slot.route_id)) {
          routeIndex.set(slot.route_id, { name: slot.route_name, slot_count: 0 });
        }
        routeIndex.get(slot.route_id).slot_count++;
      }
      visitIndex.set(slot.visit_number, (visitIndex.get(slot.visit_number) || 0) + 1);
    }

    const facultyIndex = new Map();
    for (const s of supervisors) {
      if (!s.faculty_id) continue;
      const entry = facultyIndex.get(s.faculty_id) || { id: s.faculty_id, name: s.faculty_name, supervisor_count: 0 };
      entry.supervisor_count++;
      facultyIndex.set(s.faculty_id, entry);
    }

    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

    res.json({
      success: true,
      data: {
        max_visits: session.max_supervision_visits || 3,
        max_postings_per_supervisor: await getMaxPostingsPerSupervisor(institutionId, session_id),
        total_available_slots: slots.length,
        total_supervisor_capacity: totalSupervisorCapacity(supervisors),
        supervisors: supervisors.map((s) => ({
          id: s.id,
          name: s.name,
          rank_code: s.rank_code,
          rank_name: s.rank_name,
          priority_number: s.priority_number,
          faculty_id: s.faculty_id,
          faculty_name: s.faculty_name,
          current_postings: Number(s.current_postings) || 0,
          remaining_slots: Number(s.remaining_slots) || 0,
        })),
        locations: [...stateIndex.values()]
          .sort((a, b) => String(a.state).localeCompare(String(b.state)))
          .map((entry) => ({
            state: entry.state,
            slot_count: entry.slot_count,
            lgas: [...entry.lgas.values()]
              .sort((a, b) => String(a.lga).localeCompare(String(b.lga)))
              .map((l) => ({ lga: l.lga, slot_count: l.slot_count, school_count: l.schools.size })),
          })),
        routes: [...routeIndex.entries()]
          .map(([id, v]) => ({ id, name: v.name, slot_count: v.slot_count }))
          .sort(byName),
        faculties: [...facultyIndex.values()].sort(byName),
        visits: [...visitIndex.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([visit_number, slot_count]) => ({ visit_number, slot_count })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get auto-posting history (batches)
 * GET /:institutionId/auto-posting/history
 */
const getAutoPostingHistory = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, limit = 20, offset = 0 } = req.query;

    let sql = `
      SELECT apb.*, 
             u.name as initiated_by_name,
             s.name as session_name
      FROM auto_posting_batches apb
      LEFT JOIN users u ON apb.initiated_by = u.id
      LEFT JOIN academic_sessions s ON apb.session_id = s.id
      WHERE apb.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND apb.session_id = ?';
      params.push(parseInt(session_id));
    }

    sql += ' ORDER BY apb.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const batches = await query(sql, params);

    // Parse criteria JSON
    const formattedBatches = batches.map(b => ({
      ...b,
      criteria: typeof b.criteria === 'string' ? JSON.parse(b.criteria) : b.criteria,
    }));

    res.json({
      success: true,
      data: formattedBatches,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Rollback an auto-posting batch (cancel all postings from batch)
 * POST /:institutionId/auto-posting/:batchId/rollback
 */
const rollbackAutoPosting = async (req, res, next) => {
  try {
    const { institutionId, batchId } = req.params;

    // Get batch
    const [batch] = await query(
      'SELECT * FROM auto_posting_batches WHERE id = ? AND institution_id = ?',
      [parseInt(batchId), parseInt(institutionId)]
    );

    if (!batch) {
      throw new NotFoundError('Auto-posting batch not found');
    }

    if (batch.status === 'rolled_back') {
      throw new ValidationError('This batch has already been rolled back');
    }

    if (batch.status !== 'completed') {
      throw new ValidationError('Only completed batches can be rolled back');
    }

    // Cancel all postings from this batch
    const result = await query(
      `UPDATE supervisor_postings 
       SET status = 'cancelled', updated_at = NOW() 
       WHERE auto_posting_batch_id = ? AND institution_id = ? AND status = 'active'`,
      [parseInt(batchId), parseInt(institutionId)]
    );

    // Update batch status
    await query(
      `UPDATE auto_posting_batches SET status = 'rolled_back', updated_at = NOW() WHERE id = ?`,
      [parseInt(batchId)]
    );

    res.json({
      success: true,
      message: `Rolled back ${result.affectedRows} postings`,
      data: {
        cancelled_count: result.affectedRows,
        batch_id: parseInt(batchId),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  previewAutoPosting,
  executeAutoPosting,
  getAutoPostingHistory,
  getAutoPostingOptions,
  rollbackAutoPosting,
  schemas,
  // Re-exported from services/autoPostingEngine for tests and existing callers
  runAutoPostingAlgorithm,
  // Exported for testing
  getAvailableSlots,
};
