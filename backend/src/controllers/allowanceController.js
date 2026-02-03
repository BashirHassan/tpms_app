/**
 * Allowance Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles supervisor allowance management and calculations
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      supervisor_id: z.number().int().positive('Supervisor ID is required'),
      posting_id: z.number().int().positive().optional().nullable(),
      allowance_type: z.enum(['local_running', 'transport', 'dsa', 'dta', 'tetfund', 'other']),
      amount: z.number().positive('Amount must be positive'),
      description: z.string().optional().nullable(),
      payment_status: z.enum(['pending', 'approved', 'paid', 'rejected']).default('pending'),
    }),
  }),

  update: z.object({
    body: z.object({
      amount: z.number().positive().optional(),
      description: z.string().optional().nullable(),
      payment_status: z.enum(['pending', 'approved', 'paid', 'rejected']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  calculate: z.object({
    body: z.object({
      supervisor_id: z.number().int().positive('Supervisor ID is required'),
      session_id: z.number().int().positive('Session ID is required'),
      posting_ids: z.array(z.number().int().positive()).optional(),
    }),
  }),
};

/**
 * Get all allowances
 * GET /:institutionId/allowances
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, supervisor_id, allowance_type, payment_status, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT a.*, 
             u.name as supervisor_name, u.email as supervisor_email,
             r.name as rank_name,
             sess.name as session_name,
             ms.name as school_name
      FROM supervisor_allowances a
      LEFT JOIN users u ON a.supervisor_id = u.id
      LEFT JOIN ranks r ON u.rank_id = r.id
      LEFT JOIN academic_sessions sess ON a.session_id = sess.id
      LEFT JOIN supervisor_postings sp ON a.posting_id = sp.id
      LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      WHERE a.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND a.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (supervisor_id) {
      sql += ' AND a.supervisor_id = ?';
      params.push(parseInt(supervisor_id));
    }
    if (allowance_type) {
      sql += ' AND a.allowance_type = ?';
      params.push(allowance_type);
    }
    if (payment_status) {
      sql += ' AND a.payment_status = ?';
      params.push(payment_status);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const allowances = await query(sql, params);

    res.json({
      success: true,
      data: allowances,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get allowance by ID
 * GET /:institutionId/allowances/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const allowances = await query(
      `SELECT a.*, 
              u.name as supervisor_name, u.email as supervisor_email, u.phone as supervisor_phone,
              r.name as rank_name, r.grade_level,
              sess.name as session_name,
              ms.name as school_name, ms.lga, ms.ward
       FROM supervisor_allowances a
       LEFT JOIN users u ON a.supervisor_id = u.id
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN academic_sessions sess ON a.session_id = sess.id
       LEFT JOIN supervisor_postings sp ON a.posting_id = sp.id
       LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE a.id = ? AND a.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (allowances.length === 0) {
      throw new NotFoundError('Allowance not found');
    }

    res.json({
      success: true,
      data: allowances[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create allowance
 * POST /:institutionId/allowances
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, supervisor_id, posting_id, allowance_type, amount, description, payment_status } = req.body;

    // Verify supervisor belongs to institution
    const supervisors = await query(
      'SELECT id FROM users WHERE id = ? AND institution_id = ?',
      [supervisor_id, parseInt(institutionId)]
    );
    if (supervisors.length === 0) {
      throw new ValidationError('Invalid supervisor ID');
    }

    // Verify session belongs to institution
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    // Verify posting if provided
    if (posting_id) {
      const postings = await query(
        'SELECT id FROM supervisor_postings WHERE id = ? AND institution_id = ?',
        [posting_id, parseInt(institutionId)]
      );
      if (postings.length === 0) {
        throw new ValidationError('Invalid posting ID');
      }
    }

    const result = await query(
      `INSERT INTO supervisor_allowances 
       (institution_id, session_id, supervisor_id, posting_id, allowance_type, amount, description, payment_status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parseInt(institutionId), session_id, supervisor_id, posting_id || null, 
       allowance_type, amount, description || null, payment_status || 'pending', req.user.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'allowance_created', 'allowance', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ supervisor_id, allowance_type, amount }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Allowance created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update allowance
 * PUT /:institutionId/allowances/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { amount, description, payment_status } = req.body;

    // Check allowance exists
    const existing = await query(
      'SELECT id, payment_status FROM supervisor_allowances WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Allowance not found');
    }

    // Prevent updating paid allowances
    if (existing[0].payment_status === 'paid' && payment_status !== 'paid') {
      throw new ValidationError('Cannot modify a paid allowance');
    }

    // Build update
    const updates = [];
    const params = [];

    if (amount !== undefined) {
      updates.push('amount = ?');
      params.push(amount);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (payment_status !== undefined) {
      updates.push('payment_status = ?');
      params.push(payment_status);
      if (payment_status === 'approved') {
        updates.push('approved_by = ?, approved_at = NOW()');
        params.push(req.user.id);
      }
      if (payment_status === 'paid') {
        updates.push('paid_at = NOW()');
      }
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE supervisor_allowances SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Allowance updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete allowance
 * DELETE /:institutionId/allowances/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const existing = await query(
      'SELECT id, payment_status FROM supervisor_allowances WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Allowance not found');
    }

    // Prevent deleting paid allowances
    if (existing[0].payment_status === 'paid') {
      throw new ValidationError('Cannot delete a paid allowance');
    }

    await query(
      'DELETE FROM supervisor_allowances WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Allowance deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate allowances for a supervisor based on postings
 * POST /:institutionId/allowances/calculate
 */
const calculateAllowance = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { supervisor_id, session_id, posting_ids } = req.body;

    // Get supervisor rank and base rates
    const supervisors = await query(
      `SELECT u.id, u.name, u.rank_id, r.name as rank_name, r.grade_level,
              r.local_running_rate, r.transport_rate, r.dsa_rate, r.dta_rate, r.tetfund_rate
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       WHERE u.id = ? AND u.institution_id = ?`,
      [supervisor_id, parseInt(institutionId)]
    );

    if (supervisors.length === 0) {
      throw new NotFoundError('Supervisor not found');
    }

    const supervisor = supervisors[0];

    // Get postings
    let postingQuery = `
      SELECT sp.*, ms.name as school_name, ms.ward, ms.lga, isv.distance_km,
             r.name as route_name, r.distance_km as route_distance
      FROM supervisor_postings sp
      LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON sp.route_id = r.id
      WHERE sp.supervisor_id = ? AND sp.session_id = ? AND sp.institution_id = ?
    `;
    const postingParams = [supervisor_id, session_id, parseInt(institutionId)];

    if (posting_ids && posting_ids.length > 0) {
      postingQuery += ` AND sp.id IN (${posting_ids.map(() => '?').join(',')})`;
      postingParams.push(...posting_ids);
    }

    postingQuery += ' AND sp.status = ?';
    postingParams.push('active');

    const postings = await query(postingQuery, postingParams);

    // Calculate allowances per posting
    const calculations = postings.map(posting => {
      const distance = posting.distance_km || posting.route_distance || 0;
      
      return {
        posting_id: posting.id,
        school_name: posting.school_name,
        visit_number: posting.visit_number,
        is_primary: posting.is_primary_posting,
        distance_km: distance,
        allowances: {
          local_running: posting.is_primary_posting ? (supervisor.local_running_rate || posting.local_running || 0) : 0,
          transport: posting.is_primary_posting ? (supervisor.transport_rate || posting.transport || 0) : 0,
          dsa: supervisor.dsa_rate || posting.dsa || 0,
          dta: supervisor.dta_rate || posting.dta || 0,
          tetfund: posting.is_primary_posting ? (supervisor.tetfund_rate || posting.tetfund || 0) : 0,
        },
      };
    });

    // Calculate totals
    const totals = calculations.reduce(
      (acc, calc) => {
        acc.local_running += calc.allowances.local_running;
        acc.transport += calc.allowances.transport;
        acc.dsa += calc.allowances.dsa;
        acc.dta += calc.allowances.dta;
        acc.tetfund += calc.allowances.tetfund;
        return acc;
      },
      { local_running: 0, transport: 0, dsa: 0, dta: 0, tetfund: 0 }
    );

    totals.grand_total = Object.values(totals).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      data: {
        supervisor: {
          id: supervisor.id,
          name: supervisor.name,
          rank: supervisor.rank_name,
          grade_level: supervisor.grade_level,
        },
        postings: calculations,
        totals,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get summary statistics for allowances
 * GET /:institutionId/allowances/statistics
 * Returns summary stats from supervisor_postings (primary postings only)
 */
const getStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Get session's inside distance threshold
    const [session] = await query(
      'SELECT inside_distance_threshold_km FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const threshold = parseFloat(session?.inside_distance_threshold_km) || 10;

    // Get stats from primary postings only
    const [stats] = await query(
      `SELECT 
        COUNT(*) as total_postings,
        COUNT(DISTINCT sp.supervisor_id) as unique_supervisors,
        SUM(CASE WHEN COALESCE(sp.distance_km, 0) <= ? THEN 1 ELSE 0 END) as inside_count,
        SUM(CASE WHEN COALESCE(sp.distance_km, 0) > ? THEN 1 ELSE 0 END) as outside_count,
        SUM(COALESCE(sp.local_running, 0)) as total_local_running,
        SUM(COALESCE(sp.transport, 0)) as total_transport,
        SUM(COALESCE(sp.dsa, 0)) as total_dsa,
        SUM(COALESCE(sp.dta, 0)) as total_dta
       FROM supervisor_postings sp
       WHERE sp.session_id = ? 
         AND sp.institution_id = ? 
         AND sp.status = 'active'
         AND sp.is_primary_posting = 1`,
      [threshold, threshold, parseInt(session_id), parseInt(institutionId)]
    );

    // Get tetfund total (MAX per supervisor since it's only counted once per session)
    const [tetfundStats] = await query(
      `SELECT SUM(max_tetfund) as total_tetfund FROM (
         SELECT supervisor_id, MAX(COALESCE(tetfund, 0)) as max_tetfund 
         FROM supervisor_postings 
         WHERE session_id = ? AND status = 'active' AND institution_id = ? AND is_primary_posting = 1
         GROUP BY supervisor_id
       ) as tetfund_per_supervisor`,
      [parseInt(session_id), parseInt(institutionId)]
    );

    const subtotal = (parseFloat(stats.total_local_running) || 0) +
                     (parseFloat(stats.total_transport) || 0) +
                     (parseFloat(stats.total_dsa) || 0) +
                     (parseFloat(stats.total_dta) || 0);
    const totalTetfund = parseFloat(tetfundStats?.total_tetfund) || 0;

    res.json({
      success: true,
      data: {
        total_postings: parseInt(stats.total_postings) || 0,
        unique_supervisors: parseInt(stats.unique_supervisors) || 0,
        inside_count: parseInt(stats.inside_count) || 0,
        outside_count: parseInt(stats.outside_count) || 0,
        local_running: parseFloat(stats.total_local_running) || 0,
        transport: parseFloat(stats.total_transport) || 0,
        dsa: parseFloat(stats.total_dsa) || 0,
        dta: parseFloat(stats.total_dta) || 0,
        subtotal,
        tetfund: totalTetfund,
        grand_total: subtotal + totalTetfund,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get allowances grouped by supervisor
 * GET /:institutionId/allowances/by-supervisor
 * Returns total allowances per supervisor from primary postings only
 */
const getAllowancesBySupervisor = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Get session's inside distance threshold
    const [session] = await query(
      'SELECT inside_distance_threshold_km FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const threshold = parseFloat(session?.inside_distance_threshold_km) || 10;

    const supervisors = await query(
      `SELECT 
         u.id as supervisor_id,
         u.name as supervisor_name,
         u.file_number,
         r.code as rank_code,
         r.name as rank_name,
         f.code as faculty_code,
         f.name as faculty_name,
         COUNT(sp.id) as total_postings,
         SUM(CASE WHEN COALESCE(sp.distance_km, 0) <= ? THEN 1 ELSE 0 END) as inside_count,
         SUM(CASE WHEN COALESCE(sp.distance_km, 0) > ? THEN 1 ELSE 0 END) as outside_count,
         SUM(COALESCE(sp.local_running, 0)) as local_running,
         SUM(COALESCE(sp.transport, 0)) as transport,
         SUM(COALESCE(sp.dsa, 0)) as dsa,
         SUM(COALESCE(sp.dta, 0)) as dta,
         SUM(COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + 
             COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0)) as subtotal,
         MAX(COALESCE(sp.tetfund, 0)) as tetfund
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       INNER JOIN supervisor_postings sp ON u.id = sp.supervisor_id 
         AND sp.session_id = ? 
         AND sp.status = 'active' 
         AND sp.institution_id = ?
         AND sp.is_primary_posting = 1
       WHERE u.institution_id = ?
       GROUP BY u.id, u.name, u.file_number, r.code, r.name, f.code, f.name
       ORDER BY u.name`,
      [threshold, threshold, parseInt(session_id), parseInt(institutionId), parseInt(institutionId)]
    );

    res.json({ success: true, data: supervisors });
  } catch (error) {
    next(error);
  }
};

/**
 * Get allowances grouped by visit number
 * GET /:institutionId/allowances/by-visit
 * Returns total allowances per visit from primary postings only
 */
const getAllowancesByVisit = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Get session's inside distance threshold
    const [session] = await query(
      'SELECT inside_distance_threshold_km FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const threshold = parseFloat(session?.inside_distance_threshold_km) || 10;

    const visits = await query(
      `SELECT 
         sp.visit_number,
         COUNT(sp.id) as total_postings,
         COUNT(DISTINCT sp.supervisor_id) as supervisor_count,
         SUM(CASE WHEN COALESCE(sp.distance_km, 0) <= ? THEN 1 ELSE 0 END) as inside_count,
         SUM(CASE WHEN COALESCE(sp.distance_km, 0) > ? THEN 1 ELSE 0 END) as outside_count,
         SUM(COALESCE(sp.local_running, 0)) as local_running,
         SUM(COALESCE(sp.transport, 0)) as transport,
         SUM(COALESCE(sp.dsa, 0)) as dsa,
         SUM(COALESCE(sp.dta, 0)) as dta,
         SUM(COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + 
             COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0)) as subtotal
       FROM supervisor_postings sp
       WHERE sp.session_id = ? 
         AND sp.status = 'active' 
         AND sp.institution_id = ?
         AND sp.is_primary_posting = 1
       GROUP BY sp.visit_number
       ORDER BY sp.visit_number`,
      [threshold, threshold, parseInt(session_id), parseInt(institutionId)]
    );

    // Get tetfund per visit (MAX per supervisor per visit)
    const tetfundByVisit = await query(
      `SELECT visit_number, SUM(max_tetfund) as total_tetfund FROM (
         SELECT supervisor_id, visit_number, MAX(COALESCE(tetfund, 0)) as max_tetfund 
         FROM supervisor_postings 
         WHERE session_id = ? AND status = 'active' AND institution_id = ? AND is_primary_posting = 1
         GROUP BY supervisor_id, visit_number
       ) as tetfund_per_supervisor_visit
       GROUP BY visit_number`,
      [parseInt(session_id), parseInt(institutionId)]
    );

    // Map tetfund to visits
    const tetfundMap = {};
    tetfundByVisit.forEach(t => {
      tetfundMap[t.visit_number] = parseFloat(t.total_tetfund) || 0;
    });

    // Add tetfund and total to each visit
    const visitsWithTotal = visits.map(visit => ({
      ...visit,
      tetfund: tetfundMap[visit.visit_number] || 0,
      total: (parseFloat(visit.subtotal) || 0) + (tetfundMap[visit.visit_number] || 0),
    }));

    res.json({ success: true, data: visitsWithTotal });
  } catch (error) {
    next(error);
  }
};

/**
 * Get allowances by supervisor and visit (detailed breakdown)
 * GET /:institutionId/allowances/by-supervisor-visit
 * Returns allowances per supervisor per visit from primary postings only
 */
const getAllowancesBySupervisorAndVisit = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, visit_number } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Get session's inside distance threshold
    const [session] = await query(
      'SELECT inside_distance_threshold_km FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const threshold = parseFloat(session?.inside_distance_threshold_km) || 10;

    let sql = `
      SELECT 
         u.id as supervisor_id,
         u.name as supervisor_name,
         u.file_number,
         r.code as rank_code,
         r.name as rank_name,
         f.code as faculty_code,
         f.name as faculty_name,
         sp.visit_number,
         COUNT(sp.id) as total_postings,
         SUM(CASE WHEN COALESCE(sp.distance_km, 0) <= ? THEN 1 ELSE 0 END) as inside_count,
         SUM(CASE WHEN COALESCE(sp.distance_km, 0) > ? THEN 1 ELSE 0 END) as outside_count,
         SUM(COALESCE(sp.local_running, 0)) as local_running,
         SUM(COALESCE(sp.transport, 0)) as transport,
         SUM(COALESCE(sp.dsa, 0)) as dsa,
         SUM(COALESCE(sp.dta, 0)) as dta,
         SUM(COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + 
             COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0)) as subtotal,
         MAX(COALESCE(sp.tetfund, 0)) as tetfund,
         SUM(COALESCE(sp.local_running, 0) + COALESCE(sp.transport, 0) + 
             COALESCE(sp.dsa, 0) + COALESCE(sp.dta, 0)) + MAX(COALESCE(sp.tetfund, 0)) as total
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       INNER JOIN supervisor_postings sp ON u.id = sp.supervisor_id 
         AND sp.session_id = ? 
         AND sp.status = 'active' 
         AND sp.institution_id = ?
         AND sp.is_primary_posting = 1
       WHERE u.institution_id = ?
    `;
    const params = [threshold, threshold, parseInt(session_id), parseInt(institutionId), parseInt(institutionId)];

    if (visit_number) {
      sql += ' AND sp.visit_number = ?';
      params.push(parseInt(visit_number));
    }

    sql += ' GROUP BY u.id, u.name, u.file_number, r.code, r.name, f.code, f.name, sp.visit_number ORDER BY u.name, sp.visit_number';

    const data = await query(sql, params);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getAll,
  getById,
  getStatistics,
  create,
  update,
  remove,
  calculateAllowance,
  getAllowancesBySupervisor,
  getAllowancesByVisit,
  getAllowancesBySupervisorAndVisit,
};
