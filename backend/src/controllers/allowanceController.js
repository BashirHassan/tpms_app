/**
 * Allowance Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles supervisor allowance management and calculations
 */

const { query } = require('../db/database');
const { ValidationError } = require('../utils/errors');

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
  getStatistics,
  getAllowancesBySupervisor,
  getAllowancesByVisit,
  getAllowancesBySupervisorAndVisit,
};
