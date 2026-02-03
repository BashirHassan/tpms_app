/**
 * Posting Controller (MedeePay Pattern)
 * 
 * Handles supervisor postings with direct SQL and institutionId from route params.
 * Most complex controller - handles multiposting, auto-posting, and statistics.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  create: z.object({
    body: z.object({
      supervisor_id: z.number().int().positive('Supervisor ID is required'),
      school_id: z.number().int().positive('School ID is required'),
      group_number: z.number().int().min(1).default(1),
      visit_number: z.number().int().min(1).default(1),
      session_id: z.number().int().positive().optional(),
      notes: z.string().max(500).optional().nullable(),
    }),
  }),

  update: z.object({
    body: z.object({
      visit_number: z.number().int().min(1).optional(),
      notes: z.string().max(500).optional().nullable(),
      status: z.enum(['active', 'cancelled']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  bulkCreate: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      postings: z.array(z.object({
        supervisor_id: z.number().int().positive(),
        school_id: z.number().int().positive(),
        group_number: z.number().int().min(1).default(1),
        visit_number: z.number().int().min(1).default(1),
      })).min(1, 'At least one posting is required'),
    }),
  }),

  autoPost: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      route_id: z.number().int().positive().optional(),
      max_postings_per_supervisor: z.number().int().min(1).max(100).optional(),
    }),
  }),

  clearPostings: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      supervisor_id: z.number().int().positive().optional(),
      route_id: z.number().int().positive().optional(),
    }),
  }),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current active session for institution
 */
async function getCurrentSession(institutionId) {
  const session = await query(
    `SELECT * FROM academic_sessions 
     WHERE institution_id = ? AND is_current = 1 
     ORDER BY created_at DESC LIMIT 1`,
    [institutionId]
  );
  return session[0] || null;
}

/**
 * Calculate distance-based location category
 */
function getLocationCategory(distanceKm, thresholdKm = 10) {
  return distanceKm <= thresholdKm ? 'inside' : 'outside';
}

/**
 * Calculate allowances based on rank and distance
 * 
 * ALLOWANCE CALCULATION RULES:
 * 
 * 1. LOCAL RUNNING (distance <= inside_distance_threshold_km):
 *    - Local Running Allowance ONLY
 *    - Transport = 0, DSA = 0, DTA = 0, Tetfund = 0
 *    (Inside postings are not eligible for tetfund)
 * 
 * 2. DSA ENABLED & distance within DSA range (dsa_min_distance_km to dsa_max_distance_km):
 *    - Local Running = 0
 *    - Transport = distance_km × transport_per_km
 *    - DSA = DTA × (dsa_percentage / 100)
 *    - DTA = 0
 *    - Tetfund = supervisor tetfund rate (eligible for tetfund)
 * 
 * 3. DSA DISABLED or distance > dsa_max_distance_km (full DTA range):
 *    - Local Running = 0
 *    - Transport = distance_km × transport_per_km
 *    - DSA = 0
 *    - DTA = full DTA rate
 *    - Tetfund = supervisor tetfund rate (eligible for tetfund)
 * 
 * NOTE: Tetfund is stored on ALL eligible postings (DSA and DTA range).
 * When calculating totals, use MAX(tetfund) to count it only ONCE per supervisor per session.
 * This provides resilience - if one posting is deleted, tetfund remains on other eligible postings.
 * 
 * @param {Object} supervisor - Supervisor with rank allowance rates
 * @param {Object} school - School with distance_km
 * @param {Object} session - Session with threshold settings
 * @param {boolean} isSecondary - If true, this is a dependent/merged posting (zero allowances)
 * @returns {Object} Calculated allowances
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
    // Inside postings are NOT eligible for tetfund
    localRunning = localRunningRate;
    // All other allowances are 0 (including tetfund)
  } else if (dsaEnabled && distanceKm >= dsaMinDistance && distanceKm <= dsaMaxDistance) {
    // RULE 2: DSA enabled AND distance within DSA range
    // Transport + DSA (percentage of DTA) + Tetfund
    transport = transportPerKm * distanceKm;
    dsa = (dtaRate * dsaPercentage) / 100;
    tetfund = tetfundRate; // Eligible for tetfund
    // DTA = 0
  } else {
    // RULE 3: Outside + (DSA disabled OR distance > dsa_max_distance_km)
    // Transport + full DTA + Tetfund
    transport = transportPerKm * distanceKm;
    dta = dtaRate;
    tetfund = tetfundRate; // Eligible for tetfund
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

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Get all postings
 * GET /:institutionId/postings
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, supervisor_id, school_id, route_id, 
      status = 'active', search, limit = 50, offset = 0 
    } = req.query;

    let sql = `
      SELECT sp.*, 
             u.name as supervisor_name, u.email as supervisor_email,
             ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
             ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
             ms.principal_name, ms.principal_phone,
             r.name as route_name,
             sess.name as session_name
      FROM supervisor_postings sp
      LEFT JOIN users u ON sp.supervisor_id = u.id
      LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
      WHERE sp.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sp.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (supervisor_id) {
      sql += ' AND sp.supervisor_id = ?';
      params.push(parseInt(supervisor_id));
    }
    if (school_id) {
      sql += ' AND sp.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (route_id) {
      sql += ' AND isv.route_id = ?';
      params.push(parseInt(route_id));
    }
    if (status) {
      sql += ' AND sp.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (u.name LIKE ? OR ms.name LIKE ? OR ms.official_code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY sp.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const postings = await query(sql, params);

    res.json({
      success: true,
      data: postings,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get posting by ID
 * GET /:institutionId/postings/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [posting] = await query(
      `SELECT sp.*, 
              u.name as supervisor_name, u.email as supervisor_email, u.phone as supervisor_phone,
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
              ms.principal_name, ms.principal_phone,
              ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
              r.name as route_name,
              sess.name as session_name
       FROM supervisor_postings sp
       LEFT JOIN users u ON sp.supervisor_id = u.id
       LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
       WHERE sp.id = ? AND sp.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!posting) {
      throw new NotFoundError('Posting not found');
    }

    res.json({ success: true, data: posting });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a posting
 * POST /:institutionId/postings
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.create.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { supervisor_id, school_id, group_number, visit_number, session_id, notes } = validation.data.body;

    // Get session
    let session;
    if (session_id) {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [session_id, parseInt(institutionId)]
      );
    } else {
      session = await getCurrentSession(parseInt(institutionId));
    }

    if (!session) {
      throw new ValidationError('No active session found');
    }

    // Verify supervisor exists
    const [supervisor] = await query(
      `SELECT u.*, r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       WHERE u.id = ? AND u.institution_id = ? AND u.role = 'supervisor'`,
      [supervisor_id, parseInt(institutionId)]
    );

    if (!supervisor) {
      throw new NotFoundError('Supervisor not found');
    }

    // Verify school exists and get distance
    // Use institution_schools.distance_km as the authoritative source for distance
    const [school] = await query(
      `SELECT isv.*, ms.name as school_name FROM institution_schools isv 
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ?`,
      [school_id, parseInt(institutionId)]
    );

    if (!school) {
      throw new NotFoundError('School not found');
    }

    // Check for duplicate posting
    const [existing] = await query(
      `SELECT id FROM supervisor_postings 
       WHERE institution_id = ? AND session_id = ? AND supervisor_id = ? 
             AND institution_school_id = ? AND group_number = ? AND visit_number = ? AND status = 'active'`,
      [parseInt(institutionId), session.id, supervisor_id, school_id, group_number, visit_number]
    );

    if (existing) {
      throw new ConflictError('This posting already exists');
    }

    // Calculate allowances
    const allowances = calculateAllowances(supervisor, school, session, false);

    // Create posting (always primary when created directly)
    const result = await query(
      `INSERT INTO supervisor_postings 
       (institution_id, session_id, supervisor_id, institution_school_id, group_number, visit_number,
        distance_km, transport, dsa, dta, local_running,
        tetfund, is_primary_posting, rank_id, posted_by, notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'active', NOW())`,
      [
        parseInt(institutionId), session.id, supervisor_id, school_id, group_number, visit_number,
        allowances.distance_km, allowances.transport,
        allowances.dsa, allowances.dta, allowances.local_running, allowances.tetfund,
        supervisor.rank_id || null, req.user.id, notes || null
      ]
    );

    const [newPosting] = await query(
      'SELECT * FROM supervisor_postings WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Posting created successfully',
      data: newPosting,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a posting
 * PUT /:institutionId/postings/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.update.safeParse({ body: req.body, params: req.params });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { visit_number, notes, status } = validation.data.body;

    // Check if posting exists
    const [existing] = await query(
      'SELECT * FROM supervisor_postings WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!existing) {
      throw new NotFoundError('Posting not found');
    }

    // Build update fields
    const updates = [];
    const params = [];

    if (visit_number !== undefined) {
      updates.push('visit_number = ?');
      params.push(visit_number);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE supervisor_postings SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    const [updated] = await query(
      'SELECT * FROM supervisor_postings WHERE id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Posting updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove/cancel a posting
 * DELETE /:institutionId/postings/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [existing] = await query(
      'SELECT * FROM supervisor_postings WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!existing) {
      throw new NotFoundError('Posting not found');
    }

    // Soft delete by setting status to cancelled
    await query(
      `UPDATE supervisor_postings SET status = 'cancelled', updated_at = NOW() 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Posting cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get posting statistics for a session (summary stats for dashboard)
 * GET /:institutionId/postings/statistics
 * Returns: total postings, primary/non-primary, inside/outside counts, unique supervisors/schools
 * (Matches legacy SupervisorPosting.getPostingSummaryStats)
 */
const getPostingStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    // Get summary stats matching legacy getPostingSummaryStats
    const [summaryResult] = await query(
      `SELECT 
         COUNT(*) as total_postings,
         SUM(CASE WHEN sp.is_primary_posting = 1 THEN 1 ELSE 0 END) as primary_count,
         SUM(CASE WHEN sp.is_primary_posting = 0 OR sp.is_primary_posting IS NULL THEN 1 ELSE 0 END) as non_primary_count,
         SUM(CASE WHEN isv.location_category = 'inside' THEN 1 ELSE 0 END) as inside_count,
         SUM(CASE WHEN isv.location_category = 'outside' THEN 1 ELSE 0 END) as outside_count,
         COUNT(DISTINCT sp.supervisor_id) as unique_supervisors,
         COUNT(DISTINCT sp.institution_school_id) as unique_schools
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status != 'cancelled'`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    // Postings by location category (from institution_schools table)
    const locationStats = await query(
      `SELECT isv.location_category, COUNT(*) as count 
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status != 'cancelled'
       GROUP BY isv.location_category`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    // Postings by visit number
    const visitStats = await query(
      `SELECT visit_number, COUNT(*) as count 
       FROM supervisor_postings 
       WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'
       GROUP BY visit_number ORDER BY visit_number`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    // Total allowances (tetfund counted once per supervisor, not per posting)
    const [allowanceResult] = await query(
      `SELECT 
         SUM(COALESCE(transport, 0)) as total_transport,
         SUM(COALESCE(dsa, 0)) as total_dsa,
         SUM(COALESCE(dta, 0)) as total_dta,
         SUM(COALESCE(local_running, 0)) as total_local_running,
         (SELECT COALESCE(SUM(max_tf), 0) FROM (
           SELECT supervisor_id, MAX(COALESCE(tetfund, 0)) as max_tf 
           FROM supervisor_postings 
           WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'
           GROUP BY supervisor_id
         ) as tf) as total_tetfund,
         SUM(COALESCE(transport, 0) + COALESCE(dsa, 0) + COALESCE(dta, 0) + COALESCE(local_running, 0)) as subtotal
       FROM supervisor_postings 
       WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'`,
      [parseInt(institutionId), parseInt(session_id), parseInt(institutionId), parseInt(session_id)]
    );

    const summary = summaryResult || {};

    res.json({
      success: true,
      data: {
        // Legacy-compatible fields for PostingsPage.jsx
        total_postings: parseInt(summary.total_postings) || 0,
        primary_count: parseInt(summary.primary_count) || 0,
        non_primary_count: parseInt(summary.non_primary_count) || 0,
        inside_count: parseInt(summary.inside_count) || 0,
        outside_count: parseInt(summary.outside_count) || 0,
        unique_supervisors: parseInt(summary.unique_supervisors) || 0,
        unique_schools: parseInt(summary.unique_schools) || 0,
        // Additional stats
        supervisors_posted: parseInt(summary.unique_supervisors) || 0,
        schools_covered: parseInt(summary.unique_schools) || 0,
        by_location: locationStats,
        by_visit: visitStats,
        allowances: {
          transport: parseFloat(allowanceResult?.total_transport) || 0,
          dsa: parseFloat(allowanceResult?.total_dsa) || 0,
          dta: parseFloat(allowanceResult?.total_dta) || 0,
          local_running: parseFloat(allowanceResult?.total_local_running) || 0,
          tetfund: parseFloat(allowanceResult?.total_tetfund) || 0,
          // grand_total = subtotal (other allowances) + tetfund (once per supervisor)
          total: (parseFloat(allowanceResult?.subtotal) || 0) + (parseFloat(allowanceResult?.total_tetfund) || 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available schools for posting (schools with students)
 * GET /:institutionId/postings/available-schools
 */
const getAvailableSchools = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, route_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    // Use institution_schools.distance_km as the authoritative source for distance
    let sql = `
      SELECT DISTINCT isv.id, ms.name, ms.official_code as code, ms.address, ms.state, ms.lga, ms.ward,
             ms.principal_name, ms.principal_phone,
             isv.distance_km,
             r.name as route_name, r.id as route_id,
             COUNT(DISTINCT sa.student_id) as student_count,
             MAX(sa.group_number) as max_group_number
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      INNER JOIN student_acceptances sa ON isv.id = sa.institution_school_id AND sa.status = 'approved'
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE isv.institution_id = ? AND sa.session_id = ? AND isv.status = 'active'
    `;
    const params = [parseInt(institutionId), parseInt(session_id)];

    if (route_id) {
      sql += ' AND isv.route_id = ?';
      params.push(parseInt(route_id));
    }

    sql += ' GROUP BY isv.id ORDER BY ms.name';

    const schools = await query(sql, params);

    res.json({ success: true, data: schools });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available supervisors for posting
 * GET /:institutionId/postings/available-supervisors
 * Returns staff with their posting counts and allowance totals for the session
 * 
 * All staff roles are eligible EXCEPT super_admin (legacy: getEligibleSupervisors)
 * Includes: supervisor, head_of_teaching_practice, field_monitor
 * 
 * For deans: Only returns supervisors from the dean's faculty
 * Query params:
 *   - session_id: Required session ID
 *   - faculty_id: Optional - filter supervisors by faculty (used for deans)
 */
const getAvailableSupervisors = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, faculty_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    // Get session max postings
    const [session] = await query(
      'SELECT max_posting_per_supervisor FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );

    const maxPostings = session?.max_posting_per_supervisor || 50;

    // Build dynamic WHERE clause for faculty filtering
    let facultyFilter = '';
    const params = [maxPostings, parseInt(institutionId), parseInt(session_id), parseInt(institutionId), maxPostings];
    
    if (faculty_id) {
      facultyFilter = 'AND u.faculty_id = ?';
      params.push(parseInt(faculty_id));
    }

    // Get all staff with posting counts, allowances, and rank info
    // All roles except super_admin and student are eligible for posting
    // Only PRIMARY postings count toward the limit (secondary postings have zero payment)
    // This matches what MultipostingPage.jsx expects
    const supervisors = await query(
      `SELECT 
         u.id, 
         u.name, 
         u.name as fullname,
         u.email, 
         u.phone,
         u.role,
         u.faculty_id,
         r.id as rank_id,
         r.name as rank_name,
         r.code as rank_code,
         r.local_running_allowance,
         r.transport_per_km,
         r.dsa,
         r.dta,
         r.tetfund,
         f.name as faculty_name,
         COALESCE(posting_stats.posting_count, 0) as current_postings,
         COALESCE(posting_stats.posting_count, 0) as current_visits,
         ? - COALESCE(posting_stats.posting_count, 0) as remaining_slots,
         COALESCE(posting_stats.total_allowance, 0) as total_allowance
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       LEFT JOIN (
         SELECT 
           supervisor_id,
           COUNT(*) as posting_count,
           SUM(COALESCE(local_running, 0) + COALESCE(transport, 0) + COALESCE(dsa, 0) + COALESCE(dta, 0)) + MAX(COALESCE(tetfund, 0)) as total_allowance
         FROM supervisor_postings
         WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'
           AND is_primary_posting = 1 AND merged_with_posting_id IS NULL
         GROUP BY supervisor_id
       ) posting_stats ON u.id = posting_stats.supervisor_id
       WHERE u.institution_id = ? 
             AND u.role NOT IN ('super_admin', 'student')
             AND u.status = 'active'
             AND (? - COALESCE(posting_stats.posting_count, 0)) > 0
             ${facultyFilter}
       ORDER BY COALESCE(posting_stats.posting_count, 0) ASC, u.name ASC`,
      params
    );

    res.json({ success: true, data: supervisors });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk create postings
 * POST /:institutionId/postings/bulk
 */
const bulkCreate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.bulkCreate.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, postings } = validation.data.body;

    // Verify session exists
    const [session] = await query(
      'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const results = { successful: [], failed: [] };

    await transaction(async (conn) => {
      for (const posting of postings) {
        try {
          // Get supervisor with rank
          const [supervisorRows] = await conn.execute(
            `SELECT u.*, r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund
             FROM users u
             LEFT JOIN ranks r ON u.rank_id = r.id
             WHERE u.id = ? AND u.institution_id = ?`,
            [posting.supervisor_id, parseInt(institutionId)]
          );
          const supervisor = supervisorRows[0];

          if (!supervisor) {
            results.failed.push({ ...posting, error: 'Supervisor not found' });
            continue;
          }

          // Get school - use institution_schools.distance_km as authoritative source
          const [schoolRows] = await conn.execute(
            `SELECT isv.*, ms.name as school_name FROM institution_schools isv 
             JOIN master_schools ms ON isv.master_school_id = ms.id
             WHERE isv.id = ? AND isv.institution_id = ?`,
            [posting.school_id, parseInt(institutionId)]
          );
          const school = schoolRows[0];

          if (!school) {
            results.failed.push({ ...posting, error: 'School not found' });
            continue;
          }

          // Check for duplicate
          const [existingRows] = await conn.execute(
            `SELECT id FROM supervisor_postings 
             WHERE institution_id = ? AND session_id = ? AND supervisor_id = ? 
                   AND institution_school_id = ? AND group_number = ? AND visit_number = ? AND status = 'active'`,
            [parseInt(institutionId), session_id, posting.supervisor_id, 
             posting.school_id, posting.group_number || 1, posting.visit_number || 1]
          );

          if (existingRows.length > 0) {
            results.failed.push({ ...posting, error: 'Posting already exists' });
            continue;
          }

          // Calculate allowances
          const allowances = calculateAllowances(supervisor, school, session, false);

          // Insert posting
          const [insertResult] = await conn.execute(
            `INSERT INTO supervisor_postings 
             (institution_id, session_id, supervisor_id, institution_school_id, group_number, visit_number,
              distance_km, transport, dsa, dta, local_running,
              tetfund, is_primary_posting, rank_id, posted_by, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'active', NOW())`,
            [
              parseInt(institutionId), session_id, posting.supervisor_id, posting.school_id,
              posting.group_number || 1, posting.visit_number || 1,
              allowances.distance_km, allowances.transport,
              allowances.dsa, allowances.dta, allowances.local_running, allowances.tetfund,
              supervisor.rank_id || null, req.user.id
            ]
          );

          results.successful.push({
            ...posting,
            id: insertResult.insertId,
            allowances,
          });
        } catch (err) {
          results.failed.push({ ...posting, error: err.message });
        }
      }
    });

    res.status(201).json({
      success: true,
      message: `Created ${results.successful.length} postings, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Auto-post supervisors to schools
 * POST /:institutionId/postings/auto-post
 */
const autoPost = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.autoPost.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, route_id, max_postings_per_supervisor } = validation.data.body;

    // Verify session
    const [session] = await query(
      'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const maxPostings = max_postings_per_supervisor || session.max_posting_per_supervisor || 50;

    // Get schools with students that need supervisors
    // Use institution_schools.distance_km as the authoritative source for distance
    let schoolsSql = `
      SELECT DISTINCT isv.id as school_id, ms.name as school_name, isv.route_id,
             isv.distance_km,
             COUNT(DISTINCT sa.student_id) as student_count,
             MAX(sa.group_number) as max_group,
             (SELECT COUNT(*) FROM supervisor_postings sp 
              WHERE sp.institution_school_id = isv.id AND sp.session_id = ? AND sp.status = 'active') as existing_postings
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      INNER JOIN student_acceptances sa ON isv.id = sa.institution_school_id AND sa.status = 'approved'
      WHERE isv.institution_id = ? AND sa.session_id = ? AND isv.status = 'active'
    `;
    const schoolParams = [session_id, parseInt(institutionId), session_id];

    if (route_id) {
      schoolsSql += ' AND isv.route_id = ?';
      schoolParams.push(parseInt(route_id));
    }

    schoolsSql += ' GROUP BY isv.id HAVING existing_postings < ? ORDER BY isv.distance_km';
    schoolParams.push(session.max_supervision_visits || 3);

    const schools = await query(schoolsSql, schoolParams);

    // Get available supervisors (only count PRIMARY postings toward the limit)
    const supervisors = await query(
      `SELECT u.id, u.name,
              r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund,
              COUNT(sp.id) as current_postings
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN supervisor_postings sp ON u.id = sp.supervisor_id 
                 AND sp.session_id = ? AND sp.status = 'active'
                 AND sp.is_primary_posting = 1
       WHERE u.institution_id = ? AND u.role = 'supervisor' AND u.status = 'active'
       GROUP BY u.id
       HAVING current_postings < ?
       ORDER BY current_postings ASC, u.name`,
      [session_id, parseInt(institutionId), maxPostings]
    );

    const results = { successful: [], skipped: [] };
    let supervisorIndex = 0;

    await transaction(async (conn) => {
      for (const school of schools) {
        if (supervisorIndex >= supervisors.length) break;

        const supervisor = supervisors[supervisorIndex];
        const allowances = calculateAllowances(supervisor, school, session, false);

        // Create posting
        const [insertResult] = await conn.execute(
          `INSERT INTO supervisor_postings 
           (institution_id, session_id, supervisor_id, institution_school_id, group_number, visit_number,
            distance_km, transport, dsa, dta, local_running,
            tetfund, posted_by, is_primary_posting, status, created_at)
           VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, 1, 'active', NOW())`,
          [
            parseInt(institutionId), session_id, supervisor.id, school.school_id,
            allowances.distance_km, allowances.transport,
            allowances.dsa, allowances.dta, allowances.local_running, allowances.tetfund,
            req.user.id
          ]
        );

        results.successful.push({
          posting_id: insertResult.insertId,
          supervisor_id: supervisor.id,
          supervisor_name: supervisor.name,
          school_id: school.school_id,
          school_name: school.school_name,
        });

        // Move to next supervisor (round-robin)
        supervisorIndex = (supervisorIndex + 1) % supervisors.length;
      }
    });

    res.json({
      success: true,
      message: `Auto-posted ${results.successful.length} supervisors`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear postings for a session
 * POST /:institutionId/postings/clear
 */
const clearPostings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.clearPostings.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { session_id, supervisor_id, route_id } = validation.data.body;

    let sql = `UPDATE supervisor_postings SET status = 'cancelled', updated_at = NOW() 
               WHERE institution_id = ? AND session_id = ? AND status = 'active'`;
    const params = [parseInt(institutionId), session_id];

    if (supervisor_id) {
      sql += ' AND supervisor_id = ?';
      params.push(supervisor_id);
    }

    if (route_id) {
      sql += ' AND institution_school_id IN (SELECT id FROM institution_schools WHERE route_id = ?)';
      params.push(route_id);
    }

    const result = await query(sql, params);

    res.json({
      success: true,
      message: `Cleared ${result.affectedRows} postings`,
      data: { cleared_count: result.affectedRows },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get postings by session
 * GET /:institutionId/postings/by-session/:sessionId
 */
const getBySession = async (req, res, next) => {
  try {
    const { institutionId, sessionId } = req.params;
    const { status = 'active' } = req.query;

    const postings = await query(
      `SELECT sp.*, 
              u.name as supervisor_name,
              ms.name as school_name, ms.official_code as school_code,
              r.name as route_name
       FROM supervisor_postings sp
       LEFT JOIN users u ON sp.supervisor_id = u.id
       LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = ?
       ORDER BY u.name, ms.name`,
      [parseInt(institutionId), parseInt(sessionId), status]
    );

    res.json({ success: true, data: postings });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervisor's postings
 * GET /:institutionId/postings/supervisor/:supervisorId
 */
const getSupervisorPostings = async (req, res, next) => {
  try {
    const { institutionId, supervisorId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT sp.*, 
             ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
             ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
             ms.principal_name, ms.principal_phone,
             r.name as route_name
      FROM supervisor_postings sp
      LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.status = 'active'
    `;
    const params = [parseInt(institutionId), parseInt(supervisorId)];

    if (session_id) {
      sql += ' AND sp.session_id = ?';
      params.push(parseInt(session_id));
    }

    sql += ' ORDER BY sp.visit_number, ms.name';

    const postings = await query(sql, params);

    res.json({ success: true, data: postings });
  } catch (error) {
    next(error);
  }
};

/**
 * Get my postings (current user as supervisor)
 * GET /:institutionId/postings/my-postings
 */
const getMyPostings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    // Get current session if not provided
    let activeSessionId = session_id;
    if (!activeSessionId) {
      const session = await getCurrentSession(parseInt(institutionId));
      if (session) {
        activeSessionId = session.id;
      }
    }

    if (!activeSessionId) {
      return res.json({ success: true, data: [], message: 'No active session' });
    }

    const postings = await query(
      `SELECT sp.*, 
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
              ms.principal_name, ms.principal_phone,
              ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
              r.name as route_name,
              sess.name as session_name
       FROM supervisor_postings sp
       LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
       WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.session_id = ? AND sp.status = 'active'
       ORDER BY sp.visit_number, ms.name`,
      [parseInt(institutionId), req.user.id, activeSessionId]
    );

    res.json({ success: true, data: postings });
  } catch (error) {
    next(error);
  }
};

/**
 * Get my postings for printable view with filters and metadata
 * GET /:institutionId/postings/my-postings-printable
 * Returns postings for the current user with filter options for printing
 */
const getMyPostingsPrintable = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, route_id, visit_number, location_category } = req.query;

    // Get current session
    let activeSessionId = session_id;
    if (!activeSessionId) {
      const sessionResult = await getCurrentSession(parseInt(institutionId));
      if (sessionResult) {
        activeSessionId = sessionResult.id;
      }
    }

    if (!activeSessionId) {
      return res.json({
        success: true,
        data: [],
        has_postings: false,
        session: null,
        routes: [],
        visit_numbers: [],
        location_categories: [],
        statistics: null,
      });
    }

    // Get full session info including TP dates and thresholds
    const sessions = await query(
      `SELECT id, name, is_current, start_date, end_date, tp_start_date, tp_end_date, 
              max_supervision_visits, inside_distance_threshold_km
       FROM academic_sessions WHERE id = ? AND institution_id = ?`,
      [activeSessionId, parseInt(institutionId)]
    );
    const session = sessions[0] || null;

    // Get PRIMARY postings for current supervisor (with filters)
    let postingsSql = `
      SELECT sp.id as posting_id, sp.institution_school_id, sp.group_number, sp.visit_number,
             sp.distance_km, sp.is_primary_posting, sp.merged_with_posting_id,
             sp.transport, sp.dsa, sp.dta, sp.local_running, sp.tetfund,
             ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
             ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
             ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
             isv.distance_km as school_distance_km, isv.location_category,
             ms.principal_name, ms.principal_phone,
             r.id as route_id, r.name as route_name
      FROM supervisor_postings sp
      LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.session_id = ? 
        AND sp.status = 'active' AND sp.is_primary_posting = 1
    `;
    const postingParams = [parseInt(institutionId), req.user.id, parseInt(activeSessionId)];

    if (route_id) {
      postingsSql += ' AND r.id = ?';
      postingParams.push(parseInt(route_id));
    }
    if (visit_number) {
      postingsSql += ' AND sp.visit_number = ?';
      postingParams.push(parseInt(visit_number));
    }
    if (location_category) {
      postingsSql += ' AND isv.location_category = ?';
      postingParams.push(location_category);
    }

    postingsSql += ' ORDER BY sp.visit_number, ms.name';

    const primaryPostings = await query(postingsSql, postingParams);

    // Get all postings for the supervisor (unfiltered) to build filter options
    const allPostings = await query(
      `SELECT sp.visit_number, isv.location_category, r.id as route_id, r.name as route_name
       FROM supervisor_postings sp
       LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.session_id = ? AND sp.status = 'active'`,
      [parseInt(institutionId), req.user.id, parseInt(activeSessionId)]
    );

    // Build unique routes from the supervisor's postings
    const routeMap = new Map();
    allPostings.forEach(p => {
      if (p.route_id && p.route_name) {
        routeMap.set(p.route_id, { id: p.route_id, name: p.route_name });
      }
    });
    const routes = Array.from(routeMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Get unique visit numbers
    const visitNumbers = [...new Set(allPostings.map(p => p.visit_number))].sort((a, b) => a - b);

    // Get unique location categories
    const locationCategories = [...new Set(allPostings.map(p => p.location_category).filter(Boolean))];

    // If no primary postings found, return empty
    if (primaryPostings.length === 0) {
      return res.json({
        success: true,
        data: [],
        has_postings: false,
        session,
        routes,
        visit_numbers: visitNumbers,
        location_categories: locationCategories,
        statistics: { total_postings: 0, total_schools: 0, total_students: 0 },
      });
    }

    // Get posting IDs for fetching students and merged groups
    const postingIds = primaryPostings.map(p => p.posting_id);

    // Get students for each primary posting (by institution_school_id + group_number)
    const studentsMap = {};
    const studentConditions = primaryPostings.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ');
    const studentParams = primaryPostings.flatMap(p => [p.institution_school_id, p.group_number]);
    
    const primaryStudents = await query(
      `SELECT sa.institution_school_id, sa.group_number,
              s.id as student_id, s.registration_number, s.full_name,
              p.name as program_name
       FROM student_acceptances sa
       JOIN students s ON sa.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
         AND (${studentConditions})
       ORDER BY s.full_name`,
      [parseInt(institutionId), parseInt(activeSessionId), ...studentParams]
    );
    
    primaryStudents.forEach(s => {
      const key = `${s.institution_school_id}-${s.group_number}`;
      if (!studentsMap[key]) studentsMap[key] = [];
      studentsMap[key].push(s);
    });

    // Get merged/secondary postings linked to these primary postings
    const mergedMap = {};
    const mergedPostings = await query(
      `SELECT sp.id as posting_id, sp.institution_school_id, sp.group_number, sp.visit_number,
              sp.merged_with_posting_id,
              ms.name as school_name, ms.address as school_address,
              ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
              ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
              isv.distance_km as school_distance_km, isv.location_category,
              ms.principal_name, ms.principal_phone,
              r.name as route_name
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = 'active'
         AND sp.is_primary_posting = 0
         AND sp.merged_with_posting_id IN (${postingIds.map(() => '?').join(',')})`,
      [parseInt(institutionId), parseInt(activeSessionId), ...postingIds]
    );

    // Get students for merged postings
    if (mergedPostings.length > 0) {
      const mergedStudentConditions = mergedPostings.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ');
      const mergedStudentParams = mergedPostings.flatMap(p => [p.institution_school_id, p.group_number]);
      
      const mergedStudents = await query(
        `SELECT sa.institution_school_id, sa.group_number,
                s.id as student_id, s.registration_number, s.full_name,
                p.name as program_name
         FROM student_acceptances sa
         JOIN students s ON sa.student_id = s.id
         LEFT JOIN programs p ON s.program_id = p.id
         WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
           AND (${mergedStudentConditions})
         ORDER BY s.full_name`,
        [parseInt(institutionId), parseInt(activeSessionId), ...mergedStudentParams]
      );
      
      mergedStudents.forEach(s => {
        const key = `${s.institution_school_id}-${s.group_number}`;
        if (!studentsMap[key]) studentsMap[key] = [];
        studentsMap[key].push(s);
      });
    }

    // Group merged postings by their parent posting ID
    mergedPostings.forEach(mp => {
      const key = `${mp.institution_school_id}-${mp.group_number}`;
      mp.students = studentsMap[key] || [];
      mp.student_count = mp.students.length;

      if (!mergedMap[mp.merged_with_posting_id]) mergedMap[mp.merged_with_posting_id] = [];
      mergedMap[mp.merged_with_posting_id].push(mp);
    });

    // Build final postings with students and merged_groups
    const postingsWithDetails = primaryPostings.map(p => {
      const key = `${p.institution_school_id}-${p.group_number}`;
      return {
        ...p,
        students: studentsMap[key] || [],
        student_count: (studentsMap[key] || []).length,
        merged_groups: mergedMap[p.posting_id] || [],
      };
    });

    // Calculate statistics - include both primary and merged schools
    const totalStudents = postingsWithDetails.reduce((sum, p) => 
      sum + p.student_count + p.merged_groups.reduce((ms, mg) => ms + mg.student_count, 0), 0);

    // Collect all unique school IDs (primary + merged)
    const allSchoolIds = new Set();
    postingsWithDetails.forEach(p => {
      allSchoolIds.add(p.institution_school_id);
      p.merged_groups.forEach(mg => allSchoolIds.add(mg.institution_school_id));
    });

    const stats = {
      total_postings: postingsWithDetails.length,
      total_schools: allSchoolIds.size,
      total_students: totalStudents,
    };

    res.json({
      success: true,
      data: postingsWithDetails,
      has_postings: postingsWithDetails.length > 0,
      session,
      routes,
      visit_numbers: visitNumbers,
      location_categories: locationCategories,
      statistics: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervisor invitation letter data
 * GET /:institutionId/postings/my-invitation-letter
 * Returns data needed to render a supervisor invitation letter for the current user
 * 
 * The invitation letter includes:
 * - Supervisor information
 * - Institution branding
 * - Session details (TP dates, duration)
 * - Summary of their postings (schools, students count)
 * - Optional: template-rendered HTML if a supervisor_invitation_letter template exists
 */
const getMyInvitationLetter = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const userId = req.user.id;

    // Get current session
    const sessionResult = await getCurrentSession(parseInt(institutionId));
    if (!sessionResult) {
      return res.status(404).json({
        success: false,
        message: 'No active session found',
      });
    }

    // Get full session info
    const [session] = await query(
      `SELECT id, name, code, is_current, start_date, end_date, tp_start_date, tp_end_date, 
              tp_duration_weeks, max_supervision_visits, inside_distance_threshold_km,
              coordinator_name, coordinator_phone, coordinator_email
       FROM academic_sessions WHERE id = ? AND institution_id = ?`,
      [sessionResult.id, parseInt(institutionId)]
    );

    // Get supervisor (current user) information
    const [supervisor] = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.file_number,
              r.name as rank_name,
              f.name as faculty_name
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       WHERE u.id = ? AND u.institution_id = ?`,
      [userId, parseInt(institutionId)]
    );

    if (!supervisor) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user has any postings in this session
    const postingStats = await query(
      `SELECT 
         COUNT(DISTINCT sp.id) as total_postings,
         COUNT(DISTINCT sp.institution_school_id) as total_schools,
         COUNT(DISTINCT sp.visit_number) as total_visits
       FROM supervisor_postings sp
       WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.session_id = ? AND sp.status = 'active'`,
      [parseInt(institutionId), userId, session.id]
    );

    const stats = postingStats[0] || { total_postings: 0, total_schools: 0, total_visits: 0 };

    if (stats.total_postings === 0) {
      return res.status(404).json({
        success: false,
        message: 'You have no postings for this session',
      });
    }

    // Get student count
    const studentStats = await query(
      `SELECT COUNT(DISTINCT sa.student_id) as total_students
       FROM supervisor_postings sp
       JOIN student_acceptances sa ON sa.institution_school_id = sp.institution_school_id 
         AND sa.group_number = sp.group_number 
         AND sa.session_id = sp.session_id
       WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.session_id = ? 
         AND sp.status = 'active' AND sa.status = 'approved'`,
      [parseInt(institutionId), userId, session.id]
    );

    stats.total_students = studentStats[0]?.total_students || 0;

    // Get institution data
    const [institution] = await query(
      `SELECT id, name, code, address, state, phone, email,
              logo_url, primary_color, secondary_color,
              institution_type, tp_unit_name
       FROM institutions WHERE id = ?`,
      [parseInt(institutionId)]
    );

    // Try to get supervisor_invitation_letter template
    let templateHtml = null;
    const [template] = await query(
      `SELECT * FROM document_templates 
       WHERE institution_id = ? 
       AND document_type = 'supervisor_invitation_letter' 
       AND status = 'published'
       AND (session_id IS NULL OR session_id = ?)
       ORDER BY session_id DESC, version DESC 
       LIMIT 1`,
      [parseInt(institutionId), session.id]
    );

    if (template) {
      // Build placeholder data for supervisor invitation
      const placeholderData = {
        // User/Supervisor
        user_name: supervisor.name || '',
        supervisor_name: supervisor.name || '',
        supervisor_title: supervisor.rank_name || '',
        supervisor_email: supervisor.email || '',
        supervisor_phone: supervisor.phone || '',
        supervisor_file_number: supervisor.file_number || '',
        supervisor_faculty: supervisor.faculty_name || '',
        supervisor_department: supervisor.department_name || '',
        supervisor_rank: supervisor.rank_name || '',
        
        // Institution
        institution_name: institution?.name || '',
        institution_short_name: institution?.code || '',
        institution_address: institution?.address || '',
        institution_phone: institution?.phone || '',
        institution_email: institution?.email || '',
        tp_unit_name: institution?.tp_unit_name || 'Teaching Practice Coordination Unit',
        
        // Session
        session_name: session?.name || '',
        current_session: session?.name || '',
        session_code: session?.code || '',
        tp_start_date: session?.tp_start_date ? formatDateLong(session.tp_start_date) : '',
        tp_end_date: session?.tp_end_date ? formatDateLong(session.tp_end_date) : '',
        tp_duration: session?.tp_duration_weeks ? `${session.tp_duration_weeks} weeks` : '',
        tp_duration_weeks: session?.tp_duration_weeks?.toString() || '',
        max_visits: session?.max_supervision_visits?.toString() || '3',
        
        // Coordinator
        coordinator_name: session?.coordinator_name || '',
        coordinator_phone: session?.coordinator_phone || '',
        coordinator_email: session?.coordinator_email || '',
        
        // Posting statistics
        total_schools: stats.total_schools?.toString() || '0',
        total_students: stats.total_students?.toString() || '0',
        total_visits: stats.total_visits?.toString() || '0',
        total_postings: stats.total_postings?.toString() || '0',
        
        // Dates
        today: formatDateLong(new Date()),
        today_date: formatDateLong(new Date()),
        current_date: formatDateLong(new Date()),
        current_year: new Date().getFullYear().toString(),
      };

      // Replace placeholders in template
      templateHtml = template.content;
      for (const [key, value] of Object.entries(placeholderData)) {
        const regex = new RegExp(`\\{${key}(?::[a-z]+)?\\}`, 'gi');
        templateHtml = templateHtml.replace(regex, value);
      }
    }

    res.json({
      success: true,
      data: {
        supervisor,
        institution,
        session,
        statistics: stats,
        html: templateHtml,
        hasTemplate: !!template,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Format date for documents (long format)
 */
function formatDateLong(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const day = d.getDate();
  const suffix = ['th', 'st', 'nd', 'rd'][(day % 10 > 3 || [11, 12, 13].includes(day % 100)) ? 0 : day % 10];
  
  return `${day}${suffix} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * Get all postings for printable view with full details
 * GET /:institutionId/postings/printable
 * 
 * Returns data grouped by school (with students and supervisors) when no supervisor filter.
 * Returns data grouped by supervisor (with postings containing students) when supervisor filter applied.
 * 
 * NOTE: Only PRIMARY postings are returned. Secondary/dependent postings are nested inside
 * their parent primary posting as `merged_groups` array.
 */
const getPrintablePostings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, supervisor_id, route_id, visit_number, location_category } = req.query;

    // Get sessions for dropdown
    const sessions = await query(
      'SELECT id, name, is_current, tp_start_date, tp_end_date, max_supervision_visits FROM academic_sessions WHERE institution_id = ? ORDER BY start_date DESC',
      [parseInt(institutionId)]
    );

    // Get current session if not provided
    let activeSessionId = session_id;
    if (!activeSessionId) {
      const currentSession = sessions.find(s => s.is_current);
      if (currentSession) {
        activeSessionId = currentSession.id;
      } else if (sessions.length > 0) {
        activeSessionId = sessions[0].id;
      }
    }

    if (!activeSessionId) {
      return res.json({
        success: true,
        data: [],
        has_postings: false,
        grouped_by_supervisor: false,
        grouped_by_school: false,
        session: null,
        sessions,
        supervisors: [],
        routes: [],
        visit_numbers: [],
        location_categories: [],
        statistics: { total_postings: 0, total_supervisors: 0, total_schools: 0, total_students: 0 },
      });
    }

    // Get session info
    const session = sessions.find(s => s.id === parseInt(activeSessionId)) || null;

    // Get supervisors for filter dropdown (from active postings)
    const supervisors = await query(
      `SELECT DISTINCT u.id, u.name 
       FROM users u 
       INNER JOIN supervisor_postings sp ON u.id = sp.supervisor_id 
       WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = 'active'
       ORDER BY u.name`,
      [parseInt(institutionId), parseInt(activeSessionId)]
    );

    // Get routes for filter dropdown
    const routes = await query(
      "SELECT id, name FROM routes WHERE institution_id = ? AND status = 'active' ORDER BY name",
      [parseInt(institutionId)]
    );

    // Build WHERE clauses for filtering
    let filterWhere = '';
    const filterParams = [];
    if (route_id) {
      filterWhere += ' AND isv.route_id = ?';
      filterParams.push(parseInt(route_id));
    }
    if (location_category) {
      filterWhere += ' AND isv.location_category = ?';
      filterParams.push(location_category);
    }

    // ============================================================================
    // WHEN SUPERVISOR FILTER IS APPLIED: Group by Supervisor with their postings
    // ============================================================================
    if (supervisor_id) {
      // Get PRIMARY postings for the specific supervisor
      let postingsSql = `
        SELECT sp.id as posting_id, sp.institution_school_id, sp.group_number, sp.visit_number,
               sp.distance_km, sp.is_primary_posting, sp.merged_with_posting_id,
               sp.transport, sp.dsa, sp.dta, sp.local_running, sp.tetfund,
               u.id as supervisor_id, u.name as supervisor_name, u.email as supervisor_email, u.phone as supervisor_phone,
               ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
               ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
               ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
               isv.distance_km as school_distance_km, isv.location_category,
               ms.principal_name, ms.principal_phone,
               r.id as route_id, r.name as route_name
        FROM supervisor_postings sp
        JOIN users u ON sp.supervisor_id = u.id
        JOIN institution_schools isv ON sp.institution_school_id = isv.id
        JOIN master_schools ms ON isv.master_school_id = ms.id
        LEFT JOIN routes r ON isv.route_id = r.id
        WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = 'active'
          AND sp.supervisor_id = ?
          AND sp.is_primary_posting = 1
      `;
      const postingParams = [parseInt(institutionId), parseInt(activeSessionId), parseInt(supervisor_id)];

      if (visit_number) {
        postingsSql += ' AND sp.visit_number = ?';
        postingParams.push(parseInt(visit_number));
      }
      if (route_id) {
        postingsSql += ' AND isv.route_id = ?';
        postingParams.push(parseInt(route_id));
      }
      if (location_category) {
        postingsSql += ' AND isv.location_category = ?';
        postingParams.push(location_category);
      }

      postingsSql += ' ORDER BY sp.visit_number, ms.name';

      const primaryPostings = await query(postingsSql, postingParams);

      // Get students for each posting
      const postingIds = primaryPostings.map(p => p.posting_id);
      let studentsMap = {};
      if (postingIds.length > 0) {
        const students = await query(
          `SELECT sa.institution_school_id, sa.group_number,
                  s.id as student_id, s.registration_number, s.full_name,
                  p.name as program_name
           FROM student_acceptances sa
           JOIN students s ON sa.student_id = s.id
           LEFT JOIN programs p ON s.program_id = p.id
           WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
             AND (${primaryPostings.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ')})
           ORDER BY s.full_name`,
          [parseInt(institutionId), parseInt(activeSessionId),
           ...primaryPostings.flatMap(p => [p.institution_school_id, p.group_number])]
        );
        students.forEach(s => {
          const key = `${s.institution_school_id}-${s.group_number}`;
          if (!studentsMap[key]) studentsMap[key] = [];
          studentsMap[key].push(s);
        });
      }

      // Get merged/secondary postings
      let mergedMap = {};
      if (postingIds.length > 0) {
        const mergedPostings = await query(
          `SELECT sp.id as posting_id, sp.institution_school_id, sp.group_number, sp.visit_number,
                  sp.merged_with_posting_id,
                  ms.name as school_name, ms.address as school_address,
                  ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
                  ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
                  isv.distance_km as school_distance_km, isv.location_category,
                  ms.principal_name, ms.principal_phone,
                  r.name as route_name
           FROM supervisor_postings sp
           JOIN institution_schools isv ON sp.institution_school_id = isv.id
           JOIN master_schools ms ON isv.master_school_id = ms.id
           LEFT JOIN routes r ON isv.route_id = r.id
           WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = 'active'
             AND sp.is_primary_posting = 0
             AND sp.merged_with_posting_id IN (${postingIds.map(() => '?').join(',')})`,
          [parseInt(institutionId), parseInt(activeSessionId), ...postingIds]
        );

        // Get students for merged postings
        if (mergedPostings.length > 0) {
          const mergedStudents = await query(
            `SELECT sa.institution_school_id, sa.group_number,
                    s.id as student_id, s.registration_number, s.full_name,
                    p.name as program_name
             FROM student_acceptances sa
             JOIN students s ON sa.student_id = s.id
             LEFT JOIN programs p ON s.program_id = p.id
             WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
               AND (${mergedPostings.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ')})
             ORDER BY s.full_name`,
            [parseInt(institutionId), parseInt(activeSessionId),
             ...mergedPostings.flatMap(p => [p.institution_school_id, p.group_number])]
          );
          mergedStudents.forEach(s => {
            const key = `${s.institution_school_id}-${s.group_number}`;
            if (!studentsMap[key]) studentsMap[key] = [];
            studentsMap[key].push(s);
          });
        }

        // Group merged postings by their parent
        mergedPostings.forEach(mp => {
          const key = `${mp.institution_school_id}-${mp.group_number}`;
          mp.students = studentsMap[key] || [];
          mp.student_count = mp.students.length;

          if (!mergedMap[mp.merged_with_posting_id]) mergedMap[mp.merged_with_posting_id] = [];
          mergedMap[mp.merged_with_posting_id].push(mp);
        });
      }

      // Build final postings with students and merged_groups
      const postingsWithDetails = primaryPostings.map(p => {
        const key = `${p.institution_school_id}-${p.group_number}`;
        return {
          ...p,
          students: studentsMap[key] || [],
          student_count: (studentsMap[key] || []).length,
          merged_groups: mergedMap[p.posting_id] || [],
        };
      });

      // Group by supervisor (in this case, single supervisor)
      const supervisorData = {
        supervisor_id: parseInt(supervisor_id),
        supervisor_name: postingsWithDetails[0]?.supervisor_name || '',
        posting_count: postingsWithDetails.length,
        student_count: postingsWithDetails.reduce((sum, p) => 
          sum + p.student_count + p.merged_groups.reduce((ms, mg) => ms + mg.student_count, 0), 0),
        postings: postingsWithDetails,
      };

      // Get unique visit numbers and location categories from results
      const visitNumbers = [...new Set(postingsWithDetails.map(p => p.visit_number))].sort((a, b) => a - b);
      const locationCategories = [...new Set(postingsWithDetails.map(p => p.location_category).filter(Boolean))];

      // Collect all unique school IDs (primary + merged)
      const allSchoolIds = new Set();
      postingsWithDetails.forEach(p => {
        allSchoolIds.add(p.institution_school_id);
        p.merged_groups.forEach(mg => allSchoolIds.add(mg.institution_school_id));
      });

      const stats = {
        total_postings: postingsWithDetails.length,
        total_supervisors: 1,
        total_schools: allSchoolIds.size,
        total_students: supervisorData.student_count,
      };

      return res.json({
        success: true,
        data: postingsWithDetails.length > 0 ? [supervisorData] : [],
        has_postings: postingsWithDetails.length > 0,
        grouped_by_supervisor: true,
        grouped_by_school: false,
        session,
        sessions,
        supervisors,
        routes,
        visit_numbers: visitNumbers,
        location_categories: locationCategories,
        statistics: stats,
      });
    }

    // ============================================================================
    // NO SUPERVISOR FILTER: Group by School+Group with students and supervisors list
    // ============================================================================
    
    // Get all unique school+group combinations that have PRIMARY postings
    let groupsSql = `
      SELECT DISTINCT 
        isv.id as school_id,
        ms.name as school_name,
        ms.official_code as school_code,
        ms.address as school_address,
        ms.state as school_state,
        ms.lga as school_lga,
        ms.ward as school_ward,
        ST_X(ms.location) as school_latitude,
        ST_Y(ms.location) as school_longitude,
        isv.distance_km as school_distance_km,
        isv.location_category,
        ms.principal_name,
        ms.principal_phone,
        r.id as route_id,
        r.name as route_name,
        sp.group_number
      FROM supervisor_postings sp
      JOIN institution_schools isv ON sp.institution_school_id = isv.id
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = 'active'
        AND sp.is_primary_posting = 1
        ${filterWhere}
    `;
    const groupsParams = [parseInt(institutionId), parseInt(activeSessionId), ...filterParams];

    // Add visit_number filter if specified
    if (visit_number) {
      groupsSql += ' AND sp.visit_number = ?';
      groupsParams.push(parseInt(visit_number));
    }

    groupsSql += ' ORDER BY ms.name, sp.group_number';

    const schoolGroups = await query(groupsSql, groupsParams);

    if (schoolGroups.length === 0) {
      return res.json({
        success: true,
        data: [],
        has_postings: false,
        grouped_by_supervisor: false,
        grouped_by_school: true,
        session,
        sessions,
        supervisors,
        routes,
        visit_numbers: [],
        location_categories: [],
        statistics: { total_postings: 0, total_supervisors: 0, total_schools: 0, total_students: 0 },
      });
    }

    // Get students for each school+group
    const studentConditions = schoolGroups.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ');
    const studentParams = schoolGroups.flatMap(g => [g.school_id, g.group_number]);
    
    const allStudents = await query(
      `SELECT sa.institution_school_id as school_id, sa.group_number,
              s.id as student_id, s.registration_number, s.full_name,
              p.name as program_name
       FROM student_acceptances sa
       JOIN students s ON sa.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
         AND (${studentConditions})
       ORDER BY s.full_name`,
      [parseInt(institutionId), parseInt(activeSessionId), ...studentParams]
    );

    // Map students by school+group
    const studentsMap = {};
    allStudents.forEach(s => {
      const key = `${s.school_id}-${s.group_number}`;
      if (!studentsMap[key]) studentsMap[key] = [];
      studentsMap[key].push(s);
    });

    // Get supervisors for each school+group (all visits)
    let supervisorsSql = `
      SELECT sp.institution_school_id as school_id, sp.group_number, sp.visit_number,
             u.id as supervisor_id, u.name as supervisor_name
      FROM supervisor_postings sp
      JOIN users u ON sp.supervisor_id = u.id
      WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status = 'active'
        AND sp.is_primary_posting = 1
        AND (${schoolGroups.map(() => '(sp.institution_school_id = ? AND sp.group_number = ?)').join(' OR ')})
    `;
    const supervisorsParams = [parseInt(institutionId), parseInt(activeSessionId),
      ...schoolGroups.flatMap(g => [g.school_id, g.group_number])];

    if (visit_number) {
      supervisorsSql += ' AND sp.visit_number = ?';
      supervisorsParams.push(parseInt(visit_number));
    }

    supervisorsSql += ' ORDER BY sp.visit_number';

    const allSupervisors = await query(supervisorsSql, supervisorsParams);

    // Map supervisors by school+group
    const supervisorsMap = {};
    allSupervisors.forEach(s => {
      const key = `${s.school_id}-${s.group_number}`;
      if (!supervisorsMap[key]) supervisorsMap[key] = [];
      supervisorsMap[key].push(s);
    });

    // Get merged groups for each primary school+group
    const mergedGroups = await query(
      `SELECT mg.primary_institution_school_id as primary_school_id, mg.primary_group_number,
              mg.secondary_institution_school_id as school_id, mg.secondary_group_number as group_number,
              ms.name as school_name, ms.address as school_address,
              ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
              ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
              isv.distance_km as school_distance_km, isv.location_category,
              ms.principal_name, ms.principal_phone,
              r.name as route_name
       FROM merged_groups mg
       JOIN institution_schools isv ON mg.secondary_institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE mg.institution_id = ? AND mg.session_id = ? AND mg.status = 'active'
         AND (${schoolGroups.map(() => '(mg.primary_institution_school_id = ? AND mg.primary_group_number = ?)').join(' OR ')})`,
      [parseInt(institutionId), parseInt(activeSessionId),
       ...schoolGroups.flatMap(g => [g.school_id, g.group_number])]
    );

    // Get students for merged groups
    if (mergedGroups.length > 0) {
      const mergedStudents = await query(
        `SELECT sa.institution_school_id as school_id, sa.group_number,
                s.id as student_id, s.registration_number, s.full_name,
                p.name as program_name
         FROM student_acceptances sa
         JOIN students s ON sa.student_id = s.id
         LEFT JOIN programs p ON s.program_id = p.id
         WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
           AND (${mergedGroups.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ')})
         ORDER BY s.full_name`,
        [parseInt(institutionId), parseInt(activeSessionId),
         ...mergedGroups.flatMap(g => [g.school_id, g.group_number])]
      );
      mergedStudents.forEach(s => {
        const key = `${s.school_id}-${s.group_number}`;
        if (!studentsMap[key]) studentsMap[key] = [];
        studentsMap[key].push(s);
      });
    }

    // Map merged groups by primary school+group
    const mergedMap = {};
    mergedGroups.forEach(mg => {
      const primaryKey = `${mg.primary_school_id}-${mg.primary_group_number}`;
      const mergedKey = `${mg.school_id}-${mg.group_number}`;
      if (!mergedMap[primaryKey]) mergedMap[primaryKey] = [];
      mergedMap[primaryKey].push({
        ...mg,
        students: studentsMap[mergedKey] || [],
        student_count: (studentsMap[mergedKey] || []).length,
      });
    });

    // Build final school groups with all details
    const groupsWithDetails = schoolGroups.map(g => {
      const key = `${g.school_id}-${g.group_number}`;
      return {
        ...g,
        students: studentsMap[key] || [],
        student_count: (studentsMap[key] || []).length,
        supervisors: supervisorsMap[key] || [],
        merged_groups: mergedMap[key] || [],
      };
    });

    // Collect unique visit numbers and location categories
    const allVisitNumbers = new Set();
    const allLocationCategories = new Set();
    let totalStudents = 0;

    groupsWithDetails.forEach(g => {
      g.supervisors.forEach(s => allVisitNumbers.add(s.visit_number));
      if (g.location_category) allLocationCategories.add(g.location_category);
      totalStudents += g.student_count;
      g.merged_groups.forEach(mg => {
        totalStudents += mg.student_count;
        if (mg.location_category) allLocationCategories.add(mg.location_category);
      });
    });

    const visitNumbers = [...allVisitNumbers].sort((a, b) => a - b);
    const locationCategories = [...allLocationCategories];

    // Statistics
    const uniqueSupervisorIds = new Set();
    groupsWithDetails.forEach(g => {
      g.supervisors.forEach(s => uniqueSupervisorIds.add(s.supervisor_id));
    });

    // Collect all unique school IDs (primary + merged)
    const allSchoolIds = new Set();
    groupsWithDetails.forEach(g => {
      allSchoolIds.add(g.school_id);
      g.merged_groups.forEach(mg => allSchoolIds.add(mg.school_id));
    });

    const stats = {
      total_postings: allSupervisors.length,
      total_supervisors: uniqueSupervisorIds.size,
      total_schools: allSchoolIds.size,
      total_students: totalStudents,
    };

    res.json({
      success: true,
      data: groupsWithDetails,
      has_postings: groupsWithDetails.length > 0,
      grouped_by_supervisor: false,
      grouped_by_school: true,
      session,
      sessions,
      supervisors,
      routes,
      visit_numbers: visitNumbers,
      location_categories: locationCategories,
      statistics: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all postings for display in "All Postings" tab
 * GET /:institutionId/postings/display
 * Returns: school name, visit number, supervisor name, session name
 * (From legacy SupervisorPosting.getAllPostingsForDisplay)
 */
const getPostingsForDisplay = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, search, page = 1, limit = 50 } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT sp.id, sp.visit_number, sp.status, sp.created_at,
             ms.name as school_name,
             u.name as supervisor_name,
             sess.name as session_name,
             sp.is_primary_posting, sp.merged_with_posting_id
      FROM supervisor_postings sp
      JOIN institution_schools isv ON sp.institution_school_id = isv.id
      JOIN master_schools ms ON isv.master_school_id = ms.id
      JOIN users u ON sp.supervisor_id = u.id
      JOIN academic_sessions sess ON sp.session_id = sess.id
      WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status != 'cancelled'
    `;
    const params = [parseInt(institutionId), parseInt(session_id)];

    if (search) {
      sql += ` AND (ms.name LIKE ? OR u.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY ms.name ASC, sp.visit_number ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const postings = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM supervisor_postings sp
      JOIN institution_schools isv ON sp.institution_school_id = isv.id
      JOIN master_schools ms ON isv.master_school_id = ms.id
      JOIN users u ON sp.supervisor_id = u.id
      WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.status != 'cancelled'
    `;
    const countParams = [parseInt(institutionId), parseInt(session_id)];
    if (search) {
      countSql += ` AND (ms.name LIKE ? OR u.name LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    const countResult = await query(countSql, countParams);

    res.json({
      success: true,
      data: postings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0]?.total || 0,
        totalPages: Math.ceil((countResult[0]?.total || 0) / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get schools with students grouped by school
 * GET /:institutionId/postings/schools-students
 * Returns: school, category, students count, groups count, state, LGA
 * (From legacy SupervisorPosting.getSchoolsWithStudents)
 */
const getSchoolsWithStudents = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const rows = await query(
      `SELECT 
         isv.id as school_id,
         ms.name as school_name,
         ms.category,
         ms.state,
         ms.lga,
         r.name as route_name,
         COUNT(DISTINCT sa.student_id) as students_count,
         COUNT(DISTINCT sa.group_number) as groups_count
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON r.id = isv.route_id
       LEFT JOIN student_acceptances sa ON isv.id = sa.institution_school_id 
         AND sa.session_id = ? 
         AND sa.status = 'approved'
       WHERE isv.institution_id = ?
         AND EXISTS (
           SELECT 1 FROM student_acceptances acc 
           WHERE acc.institution_school_id = isv.id 
             AND acc.session_id = ? 
             AND acc.status = 'approved'
         )
       GROUP BY isv.id, ms.name, ms.category, ms.state, ms.lga, r.name
       ORDER BY ms.name ASC`,
      [parseInt(session_id), parseInt(institutionId), parseInt(session_id)]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get schools with count of supervisor postings
 * GET /:institutionId/postings/schools-supervisors
 * Returns: school, supervisors_count
 * (From legacy SupervisorPosting.getSchoolsWithSupervisors)
 */
const getSchoolsWithSupervisors = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const rows = await query(
      `SELECT 
         isv.id as school_id,
         ms.name as school_name,
         COUNT(sp.id) as supervisors_count
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       INNER JOIN supervisor_postings sp ON isv.id = sp.institution_school_id 
         AND sp.session_id = ? 
         AND sp.status != 'cancelled'
         AND sp.supervisor_id IS NOT NULL
       WHERE isv.institution_id = ?
       GROUP BY isv.id, ms.name
       ORDER BY ms.name ASC`,
      [parseInt(session_id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validate a posting before creation
 * POST /:institutionId/postings/validate
 * Checks: duplicate posting (school+group+visit), supervisor limits, school group exists
 * 
 * DUPLICATE LOGIC: A posting is considered duplicate if the same institution + session +
 * school + group + visit already has an active posting. Each group can have its own
 * supervisor for each visit.
 */
const validatePosting = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { supervisor_id, school_id, group_number, visit_number, session_id } = req.body;

    const errors = [];

    // Check for duplicate posting - same school + group + visit is a duplicate
    // Each group can have its own supervisor for each visit
    const existingPosting = await query(
      `SELECT sp.id, u.name as supervisor_name 
       FROM supervisor_postings sp
       JOIN users u ON sp.supervisor_id = u.id
       WHERE sp.institution_id = ? AND sp.session_id = ? 
             AND sp.institution_school_id = ? AND sp.group_number = ? AND sp.visit_number = ?
             AND sp.status != 'cancelled'`,
      [parseInt(institutionId), parseInt(session_id), 
       parseInt(school_id), parseInt(group_number), parseInt(visit_number)]
    );

    if (existingPosting.length > 0) {
      const assignedTo = existingPosting[0].supervisor_name || 'another supervisor';
      errors.push(`Group ${group_number}, Visit ${visit_number} is already assigned to ${assignedTo}`);
    }

    // Check supervisor posting limit
    const [session] = await query(
      'SELECT max_posting_per_supervisor FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );

    const maxPostings = session?.max_posting_per_supervisor || 50;

    // Only count PRIMARY postings toward the limit (secondary/dependent postings don't count)
    const supervisorPostingCount = await query(
      `SELECT COUNT(*) as count FROM supervisor_postings 
       WHERE institution_id = ? AND session_id = ? AND supervisor_id = ? AND status != 'cancelled'
         AND is_primary_posting = 1`,
      [parseInt(institutionId), parseInt(session_id), parseInt(supervisor_id)]
    );

    if (supervisorPostingCount[0].count >= maxPostings) {
      errors.push(`Supervisor has reached the maximum posting limit (${maxPostings})`);
    }

    // Check if group exists for the school
    const groupExists = await query(
      `SELECT COUNT(*) as count FROM student_acceptances 
       WHERE institution_id = ? AND session_id = ? AND institution_school_id = ? AND group_number = ? AND status = 'approved'`,
      [parseInt(institutionId), parseInt(session_id), parseInt(school_id), parseInt(group_number)]
    );

    if (groupExists[0].count === 0) {
      errors.push(`Group ${group_number} does not exist for this school`);
    }

    res.json({
      success: true,
      data: {
        valid: errors.length === 0,
        errors,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get schools with their groups for multiposting
 * GET /:institutionId/postings/schools-with-groups
 * Returns schools with their group numbers for selection in multiposting
 * Also returns which visits are already assigned PER GROUP to help frontend filter options
 * 
 * IMPORTANT: Secondary/merged groups are EXCLUDED from this list because
 * they will automatically get dependent postings when their primary group is posted.
 * (Legacy: getDependentRoutePostings creates these automatically)
 */
const getSchoolsWithGroups = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Get max supervision visits from session settings
    const [session] = await query(
      'SELECT max_supervision_visits FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const maxVisits = session?.max_supervision_visits || 3;

    // Get schools that have approved acceptances with groups
    // EXCLUDE secondary groups (groups that are merged into other groups)
    // Secondary groups will automatically get dependent postings
    const schools = await query(
      `SELECT 
         isv.id as school_id,
         ms.name as school_name,
         ms.category,
         isv.location_category,
         isv.distance_km,
         ms.address,
         ms.state,
         ms.lga,
         ms.ward,
         r.id as route_id,
         r.name as route_name,
         GROUP_CONCAT(
           DISTINCT CASE 
             WHEN mg.id IS NULL THEN sa.group_number 
             ELSE NULL 
           END 
           ORDER BY sa.group_number ASC
         ) as groups,
         COUNT(DISTINCT CASE WHEN mg.id IS NULL THEN sa.student_id ELSE NULL END) as total_students
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON r.id = isv.route_id
       INNER JOIN student_acceptances sa ON isv.id = sa.institution_school_id 
         AND sa.session_id = ? 
         AND sa.status = 'approved'
       LEFT JOIN merged_groups mg ON mg.secondary_institution_school_id = isv.id 
         AND mg.secondary_group_number = sa.group_number
         AND mg.session_id = sa.session_id
         AND mg.status = 'active'
       WHERE isv.institution_id = ?
       GROUP BY isv.id, ms.name, ms.category, isv.location_category, isv.distance_km, 
                ms.address, ms.state, ms.lga, ms.ward, r.id, r.name
       HAVING groups IS NOT NULL AND groups != ''
       ORDER BY ms.name ASC`,
      [parseInt(session_id), parseInt(institutionId)]
    );

    // Get all existing postings for these schools to know which visits are assigned PER GROUP
    const schoolIds = schools.map(s => s.school_id);
    // Map: school_id -> { group_number -> [assigned visit numbers] }
    let assignedVisitsMap = {};
    
    if (schoolIds.length > 0) {
      const existingPostings = await query(
        `SELECT institution_school_id as school_id, group_number, visit_number 
         FROM supervisor_postings 
         WHERE institution_id = ? AND session_id = ? 
               AND institution_school_id IN (${schoolIds.map(() => '?').join(',')})
               AND status != 'cancelled'`,
        [parseInt(institutionId), parseInt(session_id), ...schoolIds]
      );
      
      // Build a map of school_id -> { group_number -> [assigned visit numbers] }
      existingPostings.forEach(p => {
        if (!assignedVisitsMap[p.school_id]) {
          assignedVisitsMap[p.school_id] = {};
        }
        if (!assignedVisitsMap[p.school_id][p.group_number]) {
          assignedVisitsMap[p.school_id][p.group_number] = [];
        }
        if (!assignedVisitsMap[p.school_id][p.group_number].includes(p.visit_number)) {
          assignedVisitsMap[p.school_id][p.group_number].push(p.visit_number);
        }
      });
    }

    // Transform groups from comma-separated string to array with per-group visit info
    const schoolsWithGroups = schools.map(school => {
      const groupNumbers = school.groups ? school.groups.split(',').map(g => parseInt(g)) : [];
      const schoolAssignments = assignedVisitsMap[school.school_id] || {};
      
      // Build group details with available visits per group
      const groupDetails = groupNumbers.map(groupNum => {
        const assignedVisits = schoolAssignments[groupNum] || [];
        const availableVisits = [];
        for (let i = 1; i <= maxVisits; i++) {
          if (!assignedVisits.includes(i)) {
            availableVisits.push(i);
          }
        }
        return {
          group_number: groupNum,
          assigned_visits: assignedVisits,
          available_visits: availableVisits,
        };
      });
      
      // Count total available slots across all groups
      const totalAvailableSlots = groupDetails.reduce((sum, g) => sum + g.available_visits.length, 0);
      
      return {
        ...school,
        groups: groupNumbers,
        group_details: groupDetails,
        total_available_slots: totalAvailableSlots,
      };
    });

    // Filter out schools where ALL groups have ALL visits assigned
    const availableSchools = schoolsWithGroups.filter(s => s.total_available_slots > 0);

    res.json({
      success: true,
      data: availableSchools,
      meta: {
        max_visits: maxVisits,
        total_schools: schools.length,
        available_schools: availableSchools.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create multiple postings (multi-posting interface)
 * POST /:institutionId/postings/multi
 * Similar to bulkCreate but with session_id in URL
 * 
 * MERGED GROUPS HANDLING:
 * When posting to a primary group that has merged (secondary) groups,
 * this function automatically creates dependent postings for those secondary groups.
 * Dependent postings have:
 * - is_primary_posting = 0
 * - merged_with_posting_id = primary posting ID
 * - All allowances = 0 (secondary postings don't receive payment)
 */
const createMultiPostings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, postings } = req.body;
    const userId = req.user.id;

    if (!session_id || !postings || !Array.isArray(postings) || postings.length === 0) {
      throw new ValidationError('session_id and postings array are required');
    }

    // Get session for allowance calculation
    const [session] = await query(
      'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // Check if user is a dean with allocation (not admin-level)
    let deanAllocation = null;
    const userRole = req.user.role;
    const isDean = req.user.is_dean === 1;
    const isAdminLevel = ['super_admin', 'head_of_teaching_practice'].includes(userRole);

    if (!isAdminLevel && isDean) {
      // Get dean's allocation for this session
      const [allocation] = await query(
        `SELECT * FROM dean_posting_allocations 
         WHERE institution_id = ? AND session_id = ? AND dean_user_id = ?`,
        [parseInt(institutionId), parseInt(session_id), userId]
      );

      if (!allocation) {
        throw new ValidationError('You do not have posting allocation for this session');
      }

      const remainingAllocation = allocation.allocated_postings - allocation.used_postings;
      if (postings.length > remainingAllocation) {
        throw new ValidationError(
          `You can only create ${remainingAllocation} more posting(s). Requested: ${postings.length}`
        );
      }

      deanAllocation = allocation;
    }

    const successful = [];
    const failed = [];
    const dependentPostings = []; // Track auto-created secondary postings

    for (const posting of postings) {
      try {
        const { supervisor_id, school_id, group_number, visit_number } = posting;

        // Get supervisor with rank for allowance calculation
        const [supervisor] = await query(
          `SELECT u.*, r.local_running_allowance, r.transport_per_km, r.dsa, r.dta, r.tetfund
           FROM users u
           LEFT JOIN ranks r ON u.rank_id = r.id
           WHERE u.id = ? AND u.institution_id = ?`,
          [parseInt(supervisor_id), parseInt(institutionId)]
        );

        if (!supervisor) {
          failed.push({ ...posting, error: 'Supervisor not found' });
          continue;
        }

        // If dean is creating postings, verify supervisor is from their faculty
        if (deanAllocation && supervisor.faculty_id !== req.user.faculty_id) {
          failed.push({ 
            ...posting, 
            error: `Supervisor ${supervisor.name} is not in your faculty` 
          });
          continue;
        }

        // Get school - use institution_schools.distance_km as authoritative source for allowance calculation
        const [school] = await query(
          `SELECT isv.*, ms.name as school_name FROM institution_schools isv
           JOIN master_schools ms ON isv.master_school_id = ms.id
           WHERE isv.id = ? AND isv.institution_id = ?`,
          [parseInt(school_id), parseInt(institutionId)]
        );

        if (!school) {
          failed.push({ ...posting, error: 'School not found' });
          continue;
        }

        // Check for duplicate - same school + group + visit is a duplicate
        // Each group can have its own supervisor for each visit
        const existingPosting = await query(
          `SELECT sp.id, u.name as supervisor_name 
           FROM supervisor_postings sp
           JOIN users u ON sp.supervisor_id = u.id
           WHERE sp.institution_id = ? AND sp.session_id = ? 
                 AND sp.institution_school_id = ? AND sp.group_number = ? AND sp.visit_number = ?
                 AND sp.status != 'cancelled'`,
          [parseInt(institutionId), parseInt(session_id), 
           parseInt(school_id), parseInt(group_number || 1), parseInt(visit_number || 1)]
        );

        if (existingPosting.length > 0) {
          const assignedTo = existingPosting[0].supervisor_name || 'another supervisor';
          failed.push({ ...posting, error: `Group ${group_number}, Visit ${visit_number} already assigned to ${assignedTo}` });
          continue;
        }

        // Calculate allowances based on supervisor rank and school distance
        const allowances = calculateAllowances(supervisor, school, session, false);

        // Create PRIMARY posting with allowances
        const result = await query(
          `INSERT INTO supervisor_postings 
           (institution_id, session_id, supervisor_id, institution_school_id, route_id, 
            group_number, visit_number, distance_km, transport, dsa, dta, local_running,
            tetfund, is_primary_posting, rank_id, posting_type, posted_by, created_by_dean_id, posted_at, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'multiposting', ?, ?, NOW(), 'active')`,
          [
            parseInt(institutionId),
            parseInt(session_id),
            parseInt(supervisor_id),
            parseInt(school_id),
            school.route_id,
            parseInt(group_number || 1),
            parseInt(visit_number || 1),
            allowances.distance_km,
            allowances.transport,
            allowances.dsa,
            allowances.dta,
            allowances.local_running,
            allowances.tetfund,
            supervisor.rank_id || null,
            req.user.id,
            deanAllocation ? userId : null, // Track if created by a dean
          ]
        );

        const primaryPostingId = result.insertId;

        successful.push({
          ...posting,
          id: primaryPostingId,
          school_name: school.school_name,
          supervisor_name: supervisor.name,
          allowances,
          is_primary: true,
        });

        // Check for merged (secondary) groups that should get dependent postings
        // Use institution_schools.distance_km as authoritative source
        const mergedGroups = await query(
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
          [parseInt(institutionId), parseInt(session_id), 
           parseInt(school_id), parseInt(group_number || 1)]
        );

        // Create dependent postings for each secondary group
        for (const merged of mergedGroups) {
          try {
            // Check if dependent posting already exists
            const existingDependent = await query(
              `SELECT id FROM supervisor_postings 
               WHERE institution_id = ? AND session_id = ? 
                     AND institution_school_id = ? AND group_number = ? AND visit_number = ?
                     AND status != 'cancelled'`,
              [parseInt(institutionId), parseInt(session_id),
               merged.secondary_school_id, merged.secondary_group_number, parseInt(visit_number || 1)]
            );

            if (existingDependent.length > 0) {
              continue; // Skip if already exists
            }

            // Use secondary_distance_km directly from school record
            const secondarySchool = {
              distance_km: merged.secondary_distance_km || 0,
            };

            // Calculate ZERO allowances for secondary posting
            const secondaryAllowances = calculateAllowances(supervisor, secondarySchool, session, true);

            // Create SECONDARY/DEPENDENT posting with zero allowances
            const secondaryResult = await query(
              `INSERT INTO supervisor_postings 
               (institution_id, session_id, supervisor_id, institution_school_id, route_id, 
                group_number, visit_number, distance_km, transport, dsa, dta, local_running,
                tetfund, is_primary_posting, rank_id, merged_with_posting_id, posting_type, posted_by, posted_at, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'multiposting', ?, NOW(), 'active')`,
              [
                parseInt(institutionId),
                parseInt(session_id),
                parseInt(supervisor_id),
                merged.secondary_school_id,
                merged.secondary_route_id,
                merged.secondary_group_number,
                parseInt(visit_number || 1),
                secondaryAllowances.distance_km,
                secondaryAllowances.transport, // 0
                secondaryAllowances.dsa, // 0
                secondaryAllowances.dta, // 0
                secondaryAllowances.local_running, // 0
                secondaryAllowances.tetfund, // 0
                supervisor.rank_id || null,
                primaryPostingId,
                req.user.id,
              ]
            );

            dependentPostings.push({
              id: secondaryResult.insertId,
              primary_posting_id: primaryPostingId,
              school_id: merged.secondary_school_id,
              school_name: merged.secondary_school_name,
              group_number: merged.secondary_group_number,
              visit_number: parseInt(visit_number || 1),
              is_primary: false,
            });
          } catch (mergedErr) {
            console.error(`Failed to create dependent posting for merged group: ${mergedErr.message}`);
            // Continue with other merged groups
          }
        }
      } catch (err) {
        failed.push({ ...posting, error: err.message });
      }
    }

    // Update dean's used_postings if this was a dean posting
    if (deanAllocation && successful.length > 0) {
      await query(
        `UPDATE dean_posting_allocations 
         SET used_postings = used_postings + ?, updated_at = NOW()
         WHERE id = ?`,
        [successful.length, deanAllocation.id]
      );
    }

    res.json({
      success: true,
      data: {
        successful,
        failed,
        dependent_postings: dependentPostings,
        summary: {
          total: postings.length,
          successful: successful.length,
          failed: failed.length,
          dependent_created: dependentPostings.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get preposting template
 * GET /:institutionId/postings/preposting-template
 * Returns schools with students grouped by school/group for pre-posting planning
 * 
 * Data structure matches what AllPostingsPage.jsx expects for SchoolGroupCard:
 * - school_id, school_name, school_address, school_state, school_lga, school_ward, school_distance_km
 * - location_category, principal_name, principal_phone, route_name, group_number
 * - students: [{ student_id, registration_number, full_name, program_name }]
 * - supervisors: [] (empty for preposting template)
 * - merged_groups: [...] (secondary groups merged into this primary group)
 */
const getPrepostingTemplate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, route_id, location_category } = req.query;

    // Get sessions for filter dropdown (include TP dates and max visits)
    const sessions = await query(
      'SELECT id, name, is_current, tp_start_date, tp_end_date, max_supervision_visits FROM academic_sessions WHERE institution_id = ? ORDER BY start_date DESC',
      [parseInt(institutionId)]
    );

    // Find active session or use provided
    let activeSessionId = session_id;
    if (!activeSessionId && sessions.length > 0) {
      const current = sessions.find(s => s.is_current);
      activeSessionId = current ? current.id : sessions[0].id;
    }

    if (!activeSessionId) {
      return res.json({
        success: true,
        data: [],
        has_data: false,
        session: null,
        sessions,
        routes: [],
        location_categories: [],
        statistics: { total_schools: 0, total_groups: 0, total_students: 0 },
      });
    }

    // Get routes for filter dropdown
    const routes = await query(
      "SELECT id, name FROM routes WHERE institution_id = ? AND status = 'active' ORDER BY name",
      [parseInt(institutionId)]
    );

    // Build filter conditions
    let filterWhere = '';
    const filterParams = [];
    if (route_id) {
      filterWhere += ' AND isv.route_id = ?';
      filterParams.push(parseInt(route_id));
    }
    if (location_category) {
      filterWhere += ' AND isv.location_category = ?';
      filterParams.push(location_category);
    }

    // Get unique school+group combinations from approved acceptances
    // Exclude secondary groups (those merged into other groups)
    const schoolGroups = await query(
      `SELECT 
        isv.id as school_id,
        ms.name as school_name,
        ms.category,
        isv.location_category,
        ms.principal_name,
        ms.principal_phone,
        ms.address as school_address,
        ms.state as school_state,
        ms.lga as school_lga,
        ms.ward as school_ward,
        ST_X(ms.location) as school_latitude,
        ST_Y(ms.location) as school_longitude,
        isv.distance_km as school_distance_km,
        r.id as route_id,
        r.name as route_name,
        sa.group_number,
        COUNT(DISTINCT sa.student_id) as student_count
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON r.id = isv.route_id
      INNER JOIN student_acceptances sa ON isv.id = sa.institution_school_id 
        AND sa.session_id = ? 
        AND sa.status = 'approved'
      LEFT JOIN merged_groups mg ON mg.secondary_institution_school_id = isv.id 
        AND mg.secondary_group_number = sa.group_number
        AND mg.session_id = sa.session_id
        AND mg.status = 'active'
      WHERE isv.institution_id = ? AND mg.id IS NULL
        ${filterWhere}
      GROUP BY isv.id, ms.name, ms.category, isv.location_category, 
               ms.principal_name, ms.principal_phone, ms.address, ms.state, ms.lga, ms.ward,
               isv.distance_km, r.id, r.name, sa.group_number
      ORDER BY ms.name, sa.group_number`,
      [parseInt(activeSessionId), parseInt(institutionId), ...filterParams]
    );

    if (schoolGroups.length === 0) {
      const session = sessions.find(s => s.id === parseInt(activeSessionId)) || null;
      return res.json({
        success: true,
        data: [],
        has_data: false,
        session,
        sessions,
        routes,
        location_categories: [],
        statistics: { total_schools: 0, total_groups: 0, total_students: 0 },
      });
    }

    // Get students for each school+group
    const studentConditions = schoolGroups.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ');
    const studentParams = schoolGroups.flatMap(g => [g.school_id, g.group_number]);
    
    const allStudents = await query(
      `SELECT sa.institution_school_id as school_id, sa.group_number,
              s.id as student_id, s.registration_number, s.full_name,
              p.name as program_name
       FROM student_acceptances sa
       JOIN students s ON sa.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
         AND (${studentConditions})
       ORDER BY s.full_name`,
      [parseInt(institutionId), parseInt(activeSessionId), ...studentParams]
    );

    // Map students by school+group
    const studentsMap = {};
    allStudents.forEach(s => {
      const key = `${s.school_id}-${s.group_number}`;
      if (!studentsMap[key]) studentsMap[key] = [];
      studentsMap[key].push(s);
    });

    // Get merged groups for each primary school+group
    const mergedGroups = await query(
      `SELECT mg.primary_institution_school_id as primary_school_id, mg.primary_group_number,
              mg.secondary_institution_school_id as school_id, mg.secondary_group_number as group_number,
              ms.name as school_name, ms.address as school_address,
              ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
              ST_X(ms.location) as school_latitude, ST_Y(ms.location) as school_longitude,
              isv.distance_km as school_distance_km, isv.location_category,
              ms.principal_name, ms.principal_phone,
              r.name as route_name
       FROM merged_groups mg
       JOIN institution_schools isv ON mg.secondary_institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE mg.institution_id = ? AND mg.session_id = ? AND mg.status = 'active'
         AND (${schoolGroups.map(() => '(mg.primary_institution_school_id = ? AND mg.primary_group_number = ?)').join(' OR ')})`,
      [parseInt(institutionId), parseInt(activeSessionId),
       ...schoolGroups.flatMap(g => [g.school_id, g.group_number])]
    );

    // Get students for merged groups
    if (mergedGroups.length > 0) {
      const mergedStudents = await query(
        `SELECT sa.institution_school_id as school_id, sa.group_number,
                s.id as student_id, s.registration_number, s.full_name,
                p.name as program_name
         FROM student_acceptances sa
         JOIN students s ON sa.student_id = s.id
         LEFT JOIN programs p ON s.program_id = p.id
         WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved'
           AND (${mergedGroups.map(() => '(sa.institution_school_id = ? AND sa.group_number = ?)').join(' OR ')})
         ORDER BY s.full_name`,
        [parseInt(institutionId), parseInt(activeSessionId),
         ...mergedGroups.flatMap(g => [g.school_id, g.group_number])]
      );
      mergedStudents.forEach(s => {
        const key = `${s.school_id}-${s.group_number}`;
        if (!studentsMap[key]) studentsMap[key] = [];
        studentsMap[key].push(s);
      });
    }

    // Map merged groups by primary school+group
    const mergedMap = {};
    mergedGroups.forEach(mg => {
      const primaryKey = `${mg.primary_school_id}-${mg.primary_group_number}`;
      const mergedKey = `${mg.school_id}-${mg.group_number}`;
      if (!mergedMap[primaryKey]) mergedMap[primaryKey] = [];
      mergedMap[primaryKey].push({
        ...mg,
        students: studentsMap[mergedKey] || [],
        student_count: (studentsMap[mergedKey] || []).length,
      });
    });

    // Build final school groups with all details
    const groupsWithDetails = schoolGroups.map(g => {
      const key = `${g.school_id}-${g.group_number}`;
      return {
        ...g,
        students: studentsMap[key] || [],
        student_count: (studentsMap[key] || []).length,
        supervisors: [], // Empty for preposting template
        merged_groups: mergedMap[key] || [],
      };
    });

    // Get unique location categories for filter
    const allLocationCategories = new Set();
    let totalStudents = 0;
    groupsWithDetails.forEach(g => {
      if (g.location_category) allLocationCategories.add(g.location_category);
      totalStudents += g.student_count;
      g.merged_groups.forEach(mg => {
        totalStudents += mg.student_count;
        if (mg.location_category) allLocationCategories.add(mg.location_category);
      });
    });

    // Get session info
    const session = sessions.find(s => s.id === parseInt(activeSessionId)) || null;

    // Calculate statistics
    const stats = {
      total_schools: new Set(groupsWithDetails.map(sg => sg.school_id)).size,
      total_groups: groupsWithDetails.length,
      total_students: totalStudents,
    };

    res.json({
      success: true,
      data: groupsWithDetails,
      has_data: groupsWithDetails.length > 0,
      session,
      sessions,
      routes,
      location_categories: [...allLocationCategories],
      statistics: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all supervisors' posting counts for a session with inside/outside breakdown
 * GET /:institutionId/postings/supervisor-counts
 * Returns: supervisor posting counts with location category breakdown
 * (From legacy SupervisorPosting.getAllSupervisorPostingCounts)
 */
const getAllSupervisorPostingCounts = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    const rows = await query(
      `SELECT 
         sp.supervisor_id,
         u.name as supervisor_name,
         u.email as supervisor_email,
         r.name as rank_name,
         r.code as rank_code,
         COUNT(*) as total_count,
         SUM(CASE WHEN isv.location_category = 'inside' THEN 1 ELSE 0 END) as inside_count,
         SUM(CASE WHEN isv.location_category = 'outside' THEN 1 ELSE 0 END) as outside_count,
         COUNT(DISTINCT sp.institution_school_id) as unique_schools,
         SUM(COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0)) + MAX(COALESCE(sp.tetfund, 0)) as total_allowance,
         MAX(sp.created_at) as last_posting_date
       FROM supervisor_postings sp
       JOIN users u ON sp.supervisor_id = u.id
       LEFT JOIN ranks r ON u.rank_id = r.id
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sp.institution_id = ? 
             AND sp.session_id = ? 
             AND sp.status != 'cancelled'
       GROUP BY sp.supervisor_id, u.name, u.email, r.name, r.code
       ORDER BY total_count DESC`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervisor posting count with inside/outside breakdown
 * GET /:institutionId/postings/supervisor/:supervisorId/count
 * Returns: detailed posting count for a single supervisor
 * (From legacy SupervisorPosting.getSupervisorPostingCountDetailed)
 */
const getSupervisorPostingCountDetailed = async (req, res, next) => {
  try {
    const { institutionId, supervisorId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    const [result] = await query(
      `SELECT 
         COUNT(*) as total_count,
         SUM(CASE WHEN isv.location_category = 'inside' THEN 1 ELSE 0 END) as inside_count,
         SUM(CASE WHEN isv.location_category = 'outside' THEN 1 ELSE 0 END) as outside_count,
         COUNT(DISTINCT sp.institution_school_id) as unique_schools,
         COUNT(DISTINCT sp.route_id) as unique_routes,
         SUM(COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0)) + MAX(COALESCE(sp.tetfund, 0)) as total_allowance
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       WHERE sp.institution_id = ? 
             AND sp.session_id = ? 
             AND sp.supervisor_id = ? 
             AND sp.status != 'cancelled'`,
      [parseInt(institutionId), parseInt(session_id), parseInt(supervisorId)]
    );

    res.json({
      success: true,
      data: result || { total_count: 0, inside_count: 0, outside_count: 0, unique_schools: 0, unique_routes: 0, total_allowance: 0 },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervisor's postings with allowance details
 * GET /:institutionId/postings/supervisor/:supervisorId/allowances
 * Returns: All postings for a supervisor with allowance breakdown
 * (From legacy SupervisorPosting.getSupervisorPostingsWithAllowances)
 */
const getSupervisorPostingsWithAllowances = async (req, res, next) => {
  try {
    const { institutionId, supervisorId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    const postings = await query(
      `SELECT sp.*,
              ms.name as school_name, ms.address as school_address,
              ms.lga as school_lga, isv.distance_km as school_distance,
              isv.location_category,
              r.name as rank_name, r.code as rank_code,
              (COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0) + COALESCE(sp.tetfund, 0)) as total_allowance
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN ranks r ON COALESCE(sp.rank_id, (SELECT rank_id FROM users WHERE id = sp.supervisor_id)) = r.id
       WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.supervisor_id = ?
             AND sp.status != 'cancelled'
       ORDER BY sp.created_at ASC`,
      [parseInt(institutionId), parseInt(session_id), parseInt(supervisorId)]
    );

    // Calculate totals
    const totals = postings.reduce((acc, p) => ({
      local_running: acc.local_running + (parseFloat(p.local_running) || 0),
      transport: acc.transport + (parseFloat(p.transport) || 0),
      dsa: acc.dsa + (parseFloat(p.dsa) || 0),
      dta: acc.dta + (parseFloat(p.dta) || 0),
      tetfund: acc.tetfund + (parseFloat(p.tetfund) || 0),
      total: acc.total + (parseFloat(p.total_allowance) || 0),
    }), { local_running: 0, transport: 0, dsa: 0, dta: 0, tetfund: 0, total: 0 });

    res.json({
      success: true,
      data: postings,
      summary: totals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get session allowance summary
 * GET /:institutionId/postings/allowance-summary
 * Returns: Total allowance breakdown for the session
 * (From legacy SupervisorPosting.getSessionAllowanceSummary)
 */
const getSessionAllowanceSummary = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    // Note: tetfund is counted once per supervisor per session
    const [result] = await query(
      `SELECT 
         COUNT(DISTINCT supervisor_id) as total_supervisors,
         COUNT(*) as total_postings,
         SUM(CASE WHEN is_primary_posting = 1 THEN 1 ELSE 0 END) as primary_postings,
         SUM(CASE WHEN is_primary_posting = 0 OR is_primary_posting IS NULL THEN 1 ELSE 0 END) as merged_postings,
         SUM(COALESCE(local_running, 0)) as total_local_running,
         SUM(COALESCE(transport, 0)) as total_transport,
         SUM(COALESCE(dsa, 0)) as total_dsa,
         SUM(COALESCE(dta, 0)) as total_dta,
         (SELECT COALESCE(SUM(max_tf), 0) FROM (
           SELECT supervisor_id, MAX(COALESCE(tetfund, 0)) as max_tf 
           FROM supervisor_postings 
           WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'
           GROUP BY supervisor_id
         ) as tf) as total_tetfund,
         SUM(COALESCE(local_running, 0) + COALESCE(transport, 0) + COALESCE(dsa, 0) + COALESCE(dta, 0)) as subtotal
       FROM supervisor_postings 
       WHERE institution_id = ? AND session_id = ? AND status != 'cancelled'`,
      [parseInt(institutionId), parseInt(session_id), parseInt(institutionId), parseInt(session_id)]
    );

    // Compute grand_total from subtotal + tetfund (counted once per supervisor)
    const grandTotal = (parseFloat(result?.subtotal) || 0) + (parseFloat(result?.total_tetfund) || 0);
    
    res.json({
      success: true,
      data: {
        total_supervisors: parseInt(result?.total_supervisors) || 0,
        total_postings: parseInt(result?.total_postings) || 0,
        primary_postings: parseInt(result?.primary_postings) || 0,
        merged_postings: parseInt(result?.merged_postings) || 0,
        total_local_running: parseFloat(result?.total_local_running) || 0,
        total_transport: parseFloat(result?.total_transport) || 0,
        total_dsa: parseFloat(result?.total_dsa) || 0,
        total_dta: parseFloat(result?.total_dta) || 0,
        total_tetfund: parseFloat(result?.total_tetfund) || 0,
        grand_total: grandTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get postings for a specific school
 * GET /:institutionId/postings/school/:schoolId
 * Returns: All supervisors posted to a school
 * (From legacy SupervisorPosting.getSchoolPostings)
 */
const getSchoolPostings = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT sp.*, 
             u.name as supervisor_name, u.email as supervisor_email, u.phone as supervisor_phone,
             r.name as rank_name, r.code as rank_code,
             ms.name as school_name,
             sess.name as session_name
      FROM supervisor_postings sp
      JOIN users u ON sp.supervisor_id = u.id
      LEFT JOIN ranks r ON u.rank_id = r.id
      JOIN institution_schools isv ON sp.institution_school_id = isv.id
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
      WHERE sp.institution_id = ? AND sp.institution_school_id = ? AND sp.status != 'cancelled'
    `;
    const params = [parseInt(institutionId), parseInt(schoolId)];

    if (session_id) {
      sql += ' AND sp.session_id = ?';
      params.push(parseInt(session_id));
    }

    sql += ' ORDER BY sp.visit_number, u.name';

    const postings = await query(sql, params);

    res.json({ success: true, data: postings });
  } catch (error) {
    next(error);
  }
};

/**
 * Get groups for a specific school (for multiposting dropdown)
 * GET /:institutionId/postings/school/:schoolId/groups
 * Returns: Group numbers with student count and available visits PER GROUP
 * 
 * IMPORTANT: Secondary/merged groups are EXCLUDED from this list because
 * they will automatically get dependent postings when their primary group is posted.
 */
const getSchoolGroups = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('session_id is required');
    }

    // Get max supervision visits from session settings
    const [session] = await query(
      'SELECT max_supervision_visits FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const maxVisits = session?.max_supervision_visits || 3;

    // Get which visits are already assigned for this school PER GROUP
    const existingPostings = await query(
      `SELECT group_number, visit_number 
       FROM supervisor_postings 
       WHERE institution_id = ? AND session_id = ? AND institution_school_id = ? AND status != 'cancelled'`,
      [parseInt(institutionId), parseInt(session_id), parseInt(schoolId)]
    );
    
    // Build a map of group_number -> [assigned visit numbers]
    const assignedVisitsMap = {};
    existingPostings.forEach(p => {
      if (!assignedVisitsMap[p.group_number]) {
        assignedVisitsMap[p.group_number] = [];
      }
      if (!assignedVisitsMap[p.group_number].includes(p.visit_number)) {
        assignedVisitsMap[p.group_number].push(p.visit_number);
      }
    });

    // Get groups EXCLUDING secondary/merged groups
    // Secondary groups will automatically get dependent postings when their primary is posted
    const groups = await query(
      `SELECT 
         sa.group_number,
         COUNT(DISTINCT sa.student_id) as student_count
       FROM student_acceptances sa
       LEFT JOIN merged_groups mg ON mg.secondary_institution_school_id = sa.institution_school_id 
         AND mg.secondary_group_number = sa.group_number
         AND mg.session_id = sa.session_id
         AND mg.status = 'active'
       WHERE sa.institution_id = ? 
         AND sa.institution_school_id = ? 
         AND sa.session_id = ? 
         AND sa.status = 'approved'
         AND mg.id IS NULL
       GROUP BY sa.group_number
       ORDER BY sa.group_number ASC`,
      [parseInt(institutionId), parseInt(schoolId), parseInt(session_id)]
    );

    // Add available_visits to each group (different per group)
    const groupsWithVisits = groups.map(g => {
      const assignedVisits = assignedVisitsMap[g.group_number] || [];
      const availableVisits = [];
      for (let i = 1; i <= maxVisits; i++) {
        if (!assignedVisits.includes(i)) {
          availableVisits.push(i);
        }
      }
      return {
        ...g,
        available_visits: availableVisits,
        assigned_visits: assignedVisits,
      };
    });

    // Filter out groups where all visits are assigned
    const availableGroups = groupsWithVisits.filter(g => g.available_visits.length > 0);

    res.json({ 
      success: true, 
      data: availableGroups,
      meta: {
        max_visits: maxVisits,
        total_groups: groups.length,
        available_groups: availableGroups.length,
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
  
  // CRUD methods
  getAll,
  getById,
  create,
  update,
  remove,
  getPostingStatistics,
  getAvailableSchools,
  getAvailableSupervisors,
  bulkCreate,
  autoPost,
  clearPostings,
  getBySession,
  getSupervisorPostings,
  getMyPostings,
  getMyPostingsPrintable,
  getMyInvitationLetter,
  getPrintablePostings,
  // Display methods (from legacy SupervisorPosting model)
  getPostingsForDisplay,
  getSchoolsWithStudents,
  getSchoolsWithSupervisors,
  // Multiposting methods
  validatePosting,
  getSchoolsWithGroups,
  createMultiPostings,
  // Preposting template
  getPrepostingTemplate,
  // NEW: Legacy-compatible methods
  getAllSupervisorPostingCounts,
  getSupervisorPostingCountDetailed,
  getSupervisorPostingsWithAllowances,
  getSessionAllowanceSummary,
  getSchoolPostings,
  getSchoolGroups,
};
