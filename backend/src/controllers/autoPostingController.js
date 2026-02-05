/**
 * Auto-Posting Controller (MedeePay Pattern)
 * 
 * Handles automated supervisor posting with configurable criteria:
 * - Number of postings per supervisor
 * - Posting type (random, route_based, lga_based)
 * - Priority-based distribution (higher ranked supervisors get longer distances)
 * - Round-robin allocation for fairness
 * 
 * @see docs/AUTOMATED_POSTING_SYSTEM.md for full specification
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  autoPost: z.object({
    body: z.object({
      session_id: z.coerce.number().int().positive('Session ID is required'),
      number_of_postings: z.coerce.number().int().min(1).max(10).default(1),
      posting_type: z.enum(['random', 'route_based', 'lga_based']).default('random'),
      priority_enabled: z.coerce.boolean().default(true),
      faculty_id: z.coerce.number().int().positive().optional().nullable(), // For dean filtering
      dry_run: z.coerce.boolean().default(false), // Preview without creating
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
 * Calculate distance-based location category
 */
function getLocationCategory(distanceKm, thresholdKm = 10) {
  return distanceKm <= thresholdKm ? 'inside' : 'outside';
}

/**
 * Calculate allowances based on rank and distance
 * Matches the calculation in postingController.js
 */
function calculateAllowances(supervisor, school, session, isSecondary = false) {
  const distanceKm = parseFloat(school.distance_km) || 0;
  const insideThreshold = parseFloat(session.inside_distance_threshold_km) || 10;
  const locationCategory = getLocationCategory(distanceKm, insideThreshold);

  // Secondary/dependent postings for merged groups get ZERO allowances
  if (isSecondary) {
    return {
      transport: 0,
      dsa: 0,
      dta: 0,
      local_running: 0,
      tetfund: 0,
      total: 0,
      location_category: locationCategory,
      distance_km: distanceKm,
      is_secondary: true,
    };
  }

  // Get supervisor rank rates
  const localRunningRate = parseFloat(supervisor.local_running_allowance) || 0;
  const transportPerKm = parseFloat(supervisor.transport_per_km) || 0;
  const dtaRate = parseFloat(supervisor.dta) || 0;
  const tetfundRate = parseFloat(supervisor.tetfund) || 0;

  // Get session DSA settings
  const dsaEnabled = session.dsa_enabled === 1 || session.dsa_enabled === true;
  const dsaMinDistance = parseFloat(session.dsa_min_distance_km) || 11;
  const dsaMaxDistance = parseFloat(session.dsa_max_distance_km) || 30;
  const dsaPercentage = parseFloat(session.dsa_percentage) || 50;

  let transport = 0;
  let dsa = 0;
  let dta = 0;
  let localRunning = 0;
  let tetfund = 0;

  if (locationCategory === 'inside') {
    // RULE 1: Inside distance threshold - LOCAL RUNNING ONLY
    localRunning = localRunningRate;
  } else if (dsaEnabled && distanceKm >= dsaMinDistance && distanceKm <= dsaMaxDistance) {
    // RULE 2: DSA enabled AND distance within DSA range
    transport = transportPerKm * distanceKm;
    dsa = (dtaRate * dsaPercentage) / 100;
    tetfund = tetfundRate;
  } else {
    // RULE 3: Outside + (DSA disabled OR distance > dsa_max_distance_km)
    transport = transportPerKm * distanceKm;
    dta = dtaRate;
    tetfund = tetfundRate;
  }

  return {
    transport,
    dsa,
    dta,
    local_running: localRunning,
    tetfund,
    total: transport + dsa + dta + localRunning + tetfund,
    location_category: locationCategory,
    distance_km: distanceKm,
    is_secondary: false,
  };
}

/**
 * Get eligible supervisors for auto-posting
 * Ordered by priority (if enabled) then by existing postings count
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
          AND u.role NOT IN ('super_admin', 'student')
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
 * IMPORTANT: Uses student_acceptances table to derive groups (not school_groups table).
 * Groups are determined by counting approved student acceptances per school per group_number.
 * Secondary/merged groups are excluded as they get dependent postings automatically.
 */
async function getAvailableSlots(institutionId, sessionId, postingType) {
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
 * Group slots by route
 */
function groupSlotsByRoute(slots) {
  const groups = {};
  for (const slot of slots) {
    const key = slot.route_id || 'unassigned';
    if (!groups[key]) {
      groups[key] = {
        id: slot.route_id,
        name: slot.route_name || 'Unassigned Route',
        slots: [],
        totalDistance: 0,
      };
    }
    groups[key].slots.push(slot);
    groups[key].totalDistance += slot.distance_km;
  }
  return groups;
}

/**
 * Group slots by LGA
 */
function groupSlotsByLGA(slots) {
  const groups = {};
  for (const slot of slots) {
    const key = slot.lga || 'Unknown';
    if (!groups[key]) {
      groups[key] = {
        id: key,
        name: key,
        slots: [],
        totalDistance: 0,
      };
    }
    groups[key].slots.push(slot);
    groups[key].totalDistance += slot.distance_km;
  }
  return groups;
}

/**
 * Core auto-posting algorithm - SLOT-BASED with ROUND-ROBIN distribution
 * 
 * LOGIC: 
 * 1. Sort slots by VISIT NUMBER FIRST - all Visit 1s before Visit 2s, etc.
 * 2. Within each visit, schools are processed in order (round-robin style)
 * 3. Supervisors are assigned round-robin across all slots
 * 
 * This ensures:
 * - All schools get their Visit 1 postings before any Visit 2 postings
 * - Schools are distributed fairly (each school gets one posting before any school gets two)
 * - Supervisors are distributed round-robin (each supervisor gets one posting before any gets two)
 * 
 * @param {Array} supervisors - Available supervisors with remaining_slots
 * @param {Array} slots - Available slots (school+group+visit combinations)
 * @param {number} numberOfPostings - Max postings per supervisor (not visits!)
 * @param {string} postingType - 'random', 'route_based', or 'lga_based'
 * @param {boolean} priorityEnabled - Whether to sort by rank priority
 */
function runAutoPostingAlgorithm(supervisors, slots, numberOfPostings, postingType, priorityEnabled) {
  const assignments = [];
  const warnings = [];
  const supervisorPostings = new Map(); // supervisor_id -> current posting count
  const usedSlots = new Set();

  if (supervisors.length === 0) {
    warnings.push('No eligible supervisors available');
    return { assignments, warnings, statistics: calculateStatistics([], supervisors, numberOfPostings) };
  }

  if (slots.length === 0) {
    warnings.push('No available slots to assign');
    return { assignments, warnings, statistics: calculateStatistics([], supervisors, numberOfPostings) };
  }

  // Filter slots to only include visits 1 through numberOfPostings
  // numberOfPostings = 1 means only Visit 1, numberOfPostings = 2 means Visit 1 & 2, etc.
  const filteredSlots = slots.filter(slot => slot.visit_number <= numberOfPostings);

  if (filteredSlots.length === 0) {
    warnings.push(`No available slots for Visit 1${numberOfPostings > 1 ? ` through ${numberOfPostings}` : ''}`);
    return { assignments, warnings, statistics: calculateStatistics([], supervisors, numberOfPostings) };
  }

  // Sort slots: VISIT NUMBER FIRST (round-robin by visit), then by secondary criteria
  // This ensures all Visit 1s are exhausted before Visit 2s, etc.
  let sortedSlots = [...filteredSlots];
  
  if (postingType === 'route_based') {
    // Visit first, then route, then school, then group
    sortedSlots.sort((a, b) => {
      // PRIMARY: Visit number (all Visit 1s first, then Visit 2s, etc.)
      const visitCompare = a.visit_number - b.visit_number;
      if (visitCompare !== 0) return visitCompare;
      // SECONDARY: Route (for geographic grouping within same visit)
      const routeCompare = String(a.route_id || '').localeCompare(String(b.route_id || ''));
      if (routeCompare !== 0) return routeCompare;
      // TERTIARY: Distance descending (longer distances first for priority)
      if (priorityEnabled) {
        const distCompare = b.distance_km - a.distance_km;
        if (distCompare !== 0) return distCompare;
      }
      // Then by school and group for consistent ordering
      const schoolCompare = a.school_id - b.school_id;
      if (schoolCompare !== 0) return schoolCompare;
      return a.group_number - b.group_number;
    });
  } else if (postingType === 'lga_based') {
    // Visit first, then LGA, then school, then group
    sortedSlots.sort((a, b) => {
      // PRIMARY: Visit number (all Visit 1s first, then Visit 2s, etc.)
      const visitCompare = a.visit_number - b.visit_number;
      if (visitCompare !== 0) return visitCompare;
      // SECONDARY: LGA (for geographic grouping within same visit)
      const lgaCompare = String(a.lga || '').localeCompare(String(b.lga || ''));
      if (lgaCompare !== 0) return lgaCompare;
      // TERTIARY: Distance descending (longer distances first for priority)
      if (priorityEnabled) {
        const distCompare = b.distance_km - a.distance_km;
        if (distCompare !== 0) return distCompare;
      }
      // Then by school and group for consistent ordering
      const schoolCompare = a.school_id - b.school_id;
      if (schoolCompare !== 0) return schoolCompare;
      return a.group_number - b.group_number;
    });
  } else {
    // Random/default: Visit first, then distance (if priority), then school/group
    sortedSlots.sort((a, b) => {
      // PRIMARY: Visit number (all Visit 1s first, then Visit 2s, etc.)
      const visitCompare = a.visit_number - b.visit_number;
      if (visitCompare !== 0) return visitCompare;
      // SECONDARY: Distance descending if priority enabled (longer distances get higher-ranked supervisors)
      if (priorityEnabled) {
        const distCompare = b.distance_km - a.distance_km;
        if (distCompare !== 0) return distCompare;
      }
      // Then by school and group for consistent ordering
      const schoolCompare = a.school_id - b.school_id;
      if (schoolCompare !== 0) return schoolCompare;
      return a.group_number - b.group_number;
    });
  }

  // Sort supervisors: by priority (if enabled), then by current postings (fewest first)
  let sortedSupervisors = [...supervisors];
  if (priorityEnabled) {
    // Higher priority (lower number) supervisors get assigned first for longer distances
    sortedSupervisors.sort((a, b) => {
      const priorityCompare = (a.priority_number || 99) - (b.priority_number || 99);
      if (priorityCompare !== 0) return priorityCompare;
      return (a.current_postings || 0) - (b.current_postings || 0);
    });
  } else {
    // Fair distribution: sort by fewest existing postings
    sortedSupervisors.sort((a, b) => (a.current_postings || 0) - (b.current_postings || 0));
  }

  // Round-robin supervisor index
  let supervisorIndex = 0;

  // Iterate through each slot and assign ONE supervisor (legacy pattern)
  for (const slot of sortedSlots) {
    // Skip if slot already used (shouldn't happen, but safety check)
    if (usedSlots.has(slot.id)) continue;

    // Find next available supervisor (round-robin)
    let assigned = false;
    let attempts = 0;
    const maxAttempts = sortedSupervisors.length;

    while (!assigned && attempts < maxAttempts) {
      const supervisor = sortedSupervisors[supervisorIndex];
      const currentCount = supervisorPostings.get(supervisor.id) || 0;

      // Check if supervisor has capacity (can still receive more postings up to session max)
      // numberOfPostings only filters which visits to include, not total postings per supervisor
      const hasCapacity = currentCount < supervisor.remaining_slots;

      if (hasCapacity) {
        // Assign this slot to this supervisor
        assignments.push({
          supervisor_id: supervisor.id,
          supervisor_name: supervisor.name,
          rank_code: supervisor.rank_code,
          priority_number: supervisor.priority_number,
          school_id: slot.school_id,
          school_name: slot.school_name,
          group_number: slot.group_number,
          visit_number: slot.visit_number,
          distance_km: slot.distance_km,
          route_id: slot.route_id,
          route_name: slot.route_name,
          lga: slot.lga,
        });

        usedSlots.add(slot.id);
        supervisorPostings.set(supervisor.id, currentCount + 1);
        assigned = true;
      }

      // Move to next supervisor (round-robin)
      supervisorIndex = (supervisorIndex + 1) % sortedSupervisors.length;
      attempts++;
    }

    if (!assigned) {
      // Only add warning if we have supervisors but they're all at capacity
      // (This is informational - not an error if slots exceed available supervisor capacity)
      warnings.push(
        `Could not assign slot: ${slot.school_name} Group ${slot.group_number} Visit ${slot.visit_number} - all supervisors at capacity`
      );
    }
  }

  // If all supervisors got at least one posting, reduce noise by summarizing capacity warnings
  const capacityWarnings = warnings.filter(w => w.includes('all supervisors at capacity'));
  const otherWarnings = warnings.filter(w => !w.includes('all supervisors at capacity'));
  
  // Keep capacity warnings only if there were unassigned slots AND supervisors got 0 postings
  // Otherwise, summarize them since this is expected behavior when slots > capacity
  let finalWarnings = [...otherWarnings];
  if (capacityWarnings.length > 0) {
    const supervisorsWithPostings = new Set(assignments.map(a => a.supervisor_id)).size;
    if (supervisorsWithPostings < supervisors.length) {
      // Some supervisors got nothing - this is a real issue, keep warnings
      finalWarnings = [...finalWarnings, ...capacityWarnings];
    } else if (capacityWarnings.length > 0) {
      // All supervisors got postings, just summarize
      finalWarnings.push(`${capacityWarnings.length} slots could not be assigned (more slots than total supervisor capacity)`);
    }
  }

  // Calculate statistics
  const statistics = calculateStatistics(assignments, supervisors, numberOfPostings);

  // Validate no duplicates in assignments (same slot assigned to multiple supervisors)
  const slotAssignments = new Map();
  const duplicates = [];
  for (const a of assignments) {
    const slotKey = `${a.school_id}-${a.group_number}-${a.visit_number}`;
    if (slotAssignments.has(slotKey)) {
      duplicates.push({
        slot: slotKey,
        first_supervisor: slotAssignments.get(slotKey),
        second_supervisor: a.supervisor_name,
      });
    } else {
      slotAssignments.set(slotKey, a.supervisor_name);
    }
  }

  if (duplicates.length > 0) {
    finalWarnings.push(`Algorithm error: ${duplicates.length} duplicate slot assignments detected`);
    statistics.duplicate_errors = duplicates;
  }

  // Add metadata about the filtering
  statistics.visits_included = numberOfPostings;
  statistics.filtered_slots_count = sortedSlots.length;

  return { assignments, warnings: finalWarnings, statistics };
}

/**
 * Calculate statistics for the posting result
 * @param {Array} assignments - List of created assignments
 * @param {Array} supervisors - List of eligible supervisors
 * @param {number} visitsIncluded - Number of visits included (1 = Visit 1 only, etc.)
 */
function calculateStatistics(assignments, supervisors, visitsIncluded) {
  const byVisit = {};
  const bySupervisor = {};
  const bySchool = {};
  
  for (const a of assignments) {
    // By visit number
    const visitKey = `visit_${a.visit_number}`;
    byVisit[visitKey] = (byVisit[visitKey] || 0) + 1;
    
    // By supervisor
    if (!bySupervisor[a.supervisor_id]) {
      bySupervisor[a.supervisor_id] = { count: 0, name: a.supervisor_name };
    }
    bySupervisor[a.supervisor_id].count++;

    // By school (for debugging/analysis)
    if (!bySchool[a.school_id]) {
      bySchool[a.school_id] = { count: 0, name: a.school_name };
    }
    bySchool[a.school_id].count++;
  }

  // Calculate posting distribution statistics
  const supervisorCounts = Object.values(bySupervisor).map(s => s.count);
  const avgPostingsPerSupervisor = supervisorCounts.length > 0 
    ? Math.round(supervisorCounts.reduce((a, b) => a + b, 0) / supervisorCounts.length) 
    : 0;
  const minPostings = supervisorCounts.length > 0 ? Math.min(...supervisorCounts) : 0;
  const maxPostings = supervisorCounts.length > 0 ? Math.max(...supervisorCounts) : 0;

  // Count supervisors by posting status
  const supervisorsWithPostings = Object.keys(bySupervisor).length;
  const supervisorsWithNoPostings = supervisors.length - supervisorsWithPostings;

  // For backward compatibility, map to old field names
  // "Full" = got postings, "Partial" = not applicable, "None" = no postings
  return {
    total_assignments: assignments.length,
    total_schools: Object.keys(bySchool).length,
    by_visit: byVisit,
    supervisors_full: supervisorsWithPostings,
    supervisors_partial: 0,
    supervisors_none: supervisorsWithNoPostings,
    visits_included: visitsIncluded,
    avg_postings_per_supervisor: avgPostingsPerSupervisor,
    min_postings: minPostings,
    max_postings: maxPostings,
    by_round: byVisit, // Alias for frontend compatibility
  };
}

/**
 * Create postings from assignments using transaction
 */
async function createPostingsFromAssignments(institutionId, sessionId, session, assignments, userId, batchId) {
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

      if (countCheck[0].count >= session.max_posting_per_supervisor) {
        skipped.push({ 
          ...assignment, 
          reason: `Supervisor reached max posting limit (${session.max_posting_per_supervisor})` 
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

    const { session_id, number_of_postings, posting_type, priority_enabled, faculty_id } = validation.data.body;

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
    const slots = await getAvailableSlots(institutionId, session_id, posting_type);

    // Log for debugging
    console.log(`[Auto-Post Preview] visits_to_include=${number_of_postings}, total_slots=${slots.length}, supervisors=${supervisors.length}`);

    // Run algorithm (dry run)
    const result = runAutoPostingAlgorithm(
      supervisors,
      slots,
      number_of_postings,
      posting_type,
      priority_enabled
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

    const { session_id, number_of_postings, posting_type, priority_enabled, faculty_id } = validation.data.body;

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
    const slots = await getAvailableSlots(institutionId, session_id, posting_type);

    // Run algorithm
    const result = runAutoPostingAlgorithm(
      supervisors,
      slots,
      number_of_postings,
      posting_type,
      priority_enabled
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
        JSON.stringify({ number_of_postings, posting_type, priority_enabled, faculty_id }),
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
        batchId
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
};
