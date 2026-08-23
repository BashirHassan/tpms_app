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
async function getEligibleSupervisors(institutionId, sessionId, priorityEnabled, facultyId = null) {
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
async function getAvailableSlots(institutionId, sessionId) {
  // Get session settings
  const [session] = await query(
    'SELECT max_supervision_visits FROM academic_sessions WHERE id = ?',
    [sessionId]
  );
  const maxVisits = session?.max_supervision_visits || 3;

  // Get all schools with their groups (only schools with students)
  // Derives groups from student_acceptances table (approved students grouped by group_number)
  // Excludes secondary/merged groups - they get dependent postings automatically
  const schools = await query(
    `SELECT 
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
    GROUP BY isv.id, ms.name, ms.lga, ms.state, isv.route_id, r.name, isv.distance_km, isv.location_category, sa.group_number
    HAVING student_count > 0`,
    [parseInt(sessionId), parseInt(institutionId), parseInt(institutionId)]
  );

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

    // Get data
    const supervisors = await getEligibleSupervisors(institutionId, session_id, priority_enabled, faculty_id);
    const slots = await getAvailableSlots(institutionId, session_id);
    const schoolHistory = await getSupervisorSchoolHistory(institutionId, session_id);
    const deanAllocation = await getDeanAllocation(institutionId, session_id, req.user);

    // Log for debugging
    console.log(`[Auto-Post Preview] visits_to_include=${number_of_postings}, total_slots=${slots.length}, supervisors=${supervisors.length}`);

    // Run algorithm (dry run)
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
      }
    );

    // Calculate filtered slots count for display (slots for selected visits only)
    const filteredSlotsCount = slots.filter(s => s.visit_number <= number_of_postings).length;

    res.json({
      success: true,
      data: {
        preview: true,
        visits_included: number_of_postings,
        total_supervisors: supervisors.length,
        total_available_slots: filteredSlotsCount, // Show only slots for selected visits
        total_all_slots: slots.length, // Total including all visits
        assignments: result.assignments,
        statistics: result.statistics,
        warnings: result.warnings,
        data_quality: collectDataQuality(supervisors, slots),
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

    // Get data
    const supervisors = await getEligibleSupervisors(institutionId, session_id, priority_enabled, faculty_id);
    const slots = await getAvailableSlots(institutionId, session_id);
    const schoolHistory = await getSupervisorSchoolHistory(institutionId, session_id);
    const deanAllocation = await getDeanAllocation(institutionId, session_id, req.user);
    const maxPostingsPerSupervisor = await getMaxPostingsPerSupervisor(institutionId, session_id);

    if (deanAllocation && deanAllocation.remaining <= 0) {
      throw new ValidationError(
        `Your posting allocation for this session is exhausted (${deanAllocation.used_postings} of ${deanAllocation.allocated_postings} used)`
      );
    }

    // Run algorithm
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
        JSON.stringify({ number_of_postings, posting_type, priority_enabled, avoid_repeat_schools, faculty_id }),
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
  rollbackAutoPosting,
  schemas,
  // Re-exported from services/autoPostingEngine for tests and existing callers
  runAutoPostingAlgorithm,
  // Exported for testing
  getAvailableSlots,
};
