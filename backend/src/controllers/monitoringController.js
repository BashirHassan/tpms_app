/**
 * Monitoring Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles monitor assignments and monitoring reports for teaching practice
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const emailService = require('../services/emailService');
const emailQueueService = require('../services/emailQueueService');

// Validation schemas
const schemas = {
  createAssignment: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      monitor_id: z.number().int().positive('Monitor ID is required'),
      school_id: z.number().int().positive('School ID is required'),
      monitoring_type: z.enum(['school_evaluation', 'supervision_evaluation']).default('supervision_evaluation'),
    }),
  }),

  updateAssignment: z.object({
    body: z.object({
      school_id: z.number().int().positive().optional(),
      monitoring_type: z.enum(['school_evaluation', 'supervision_evaluation']).optional(),
      status: z.enum(['pending', 'active', 'completed', 'cancelled']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  createReport: z.object({
    body: z.object({
      assignment_id: z.number().int().positive('Assignment ID is required'),
      observations: z.string().min(1, 'Observations are required'),
      recommendations: z.string().optional(),
      additional_notes: z.string().optional(),
      student_scores: z.array(z.object({
        student_id: z.number().int().positive(),
        score: z.number().min(0).max(100),
        comments: z.string().optional(),
      })).optional(),
    }),
  }),

  updateReport: z.object({
    body: z.object({
      observations: z.string().optional(),
      recommendations: z.string().optional(),
      additional_notes: z.string().optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

// ===========================
// ASSIGNMENT METHODS
// ===========================

/**
 * Get all monitor assignments
 * GET /:institutionId/monitoring/assignments
 * 
 * Role-based filtering:
 * - super_admin, head_of_teaching_practice: Can see all assignments
 * - supervisor, field_monitor: Can only see their own assignments
 */
const getAllAssignments = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, monitor_id, school_id, monitoring_type, status,
      limit = 100, offset = 0 
    } = req.query;

    // Role-based access: non-admin roles can only see their own assignments
    const isAdmin = ['super_admin', 'head_of_teaching_practice'].includes(req.user.role);
    const effectiveMonitorId = isAdmin ? monitor_id : req.user.id;

    let sql = `
      SELECT ma.*,
             u.name as monitor_name, u.email as monitor_email, u.phone as monitor_phone,
             ms.name as school_name, ms.official_code as school_code, ms.ward, ms.lga, ms.address as school_address,
             r.name as route_name,
             sess.name as session_name,
             au.name as assigned_by_name
      FROM monitor_assignments ma
      LEFT JOIN users u ON ma.monitor_id = u.id
      LEFT JOIN institution_schools isv ON ma.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      LEFT JOIN academic_sessions sess ON ma.session_id = sess.id
      LEFT JOIN users au ON ma.assigned_by = au.id
      WHERE ma.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    // For non-admin roles, always filter by their own monitor_id
    if (!isAdmin) {
      sql += ' AND ma.monitor_id = ?';
      params.push(effectiveMonitorId);
    } else if (monitor_id) {
      // Admin can optionally filter by monitor_id
      sql += ' AND ma.monitor_id = ?';
      params.push(parseInt(monitor_id));
    }

    if (session_id) {
      sql += ' AND ma.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND ma.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (monitoring_type) {
      sql += ' AND ma.monitoring_type = ?';
      params.push(monitoring_type);
    }
    if (status) {
      sql += ' AND ma.status = ?';
      params.push(status);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY ma.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const assignments = await query(sql, params);

    // Get report counts per assignment
    const assignmentIds = assignments.map(a => a.id);
    if (assignmentIds.length > 0) {
      const reportCounts = await query(
        `SELECT assignment_id, COUNT(*) as report_count
         FROM monitoring_reports
         WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')})
         GROUP BY assignment_id`,
        assignmentIds
      );

      const countMap = new Map();
      reportCounts.forEach(rc => {
        countMap.set(rc.assignment_id, rc.report_count);
      });

      assignments.forEach(assignment => {
        assignment.report_count = countMap.get(assignment.id) || 0;
      });
    }

    res.json({
      success: true,
      data: assignments,
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
 * Get assignment by ID
 * GET /:institutionId/monitoring/assignments/:id
 */
const getAssignment = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const assignments = await query(
      `SELECT ma.*,
              u.name as monitor_name, u.email as monitor_email, u.phone as monitor_phone,
              ms.name as school_name, ms.official_code as school_code, ms.address, ms.ward, ms.lga, ms.state,
              r.name as route_name,
              sess.name as session_name,
              au.name as assigned_by_name,
              isv.id as institution_school_id
       FROM monitor_assignments ma
       LEFT JOIN users u ON ma.monitor_id = u.id
       LEFT JOIN institution_schools isv ON ma.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       LEFT JOIN academic_sessions sess ON ma.session_id = sess.id
       LEFT JOIN users au ON ma.assigned_by = au.id
       WHERE ma.id = ? AND ma.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (assignments.length === 0) {
      throw new NotFoundError('Assignment not found');
    }

    const assignment = assignments[0];

    // Get reports for this assignment
    const reports = await query(
      `SELECT mr.*, u.name as monitor_name
       FROM monitoring_reports mr
       LEFT JOIN users u ON mr.monitor_id = u.id
       WHERE mr.assignment_id = ? AND mr.institution_id = ?
       ORDER BY mr.created_at DESC`,
      [parseInt(id), parseInt(institutionId)]
    );

    // Get students at assigned school
    const students = await query(
      `SELECT st.id, st.registration_number, st.full_name,
              p.name as program_name
       FROM student_acceptances sa
       JOIN students st ON sa.student_id = st.id
       LEFT JOIN programs p ON st.program_id = p.id
       WHERE sa.institution_school_id = ? AND sa.session_id = ? 
         AND sa.institution_id = ? AND sa.status = 'approved'
       ORDER BY st.full_name`,
      [assignment.institution_school_id, assignment.session_id, parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...assignment,
        reports,
        students,
        student_count: students.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create monitor assignment
 * POST /:institutionId/monitoring/assignments
 */
const createAssignment = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, monitor_id, school_id, monitoring_type } = req.body;

    // Verify monitor is a valid user with monitor role
    const monitors = await query(
      `SELECT id, name FROM users
       WHERE id = ? AND institution_id = ? 
         AND role IN ('field_monitor', 'supervisor', 'head_of_teaching_practice') AND status = 'active'`,
      [monitor_id, parseInt(institutionId)]
    );
    if (monitors.length === 0) {
      throw new ValidationError('Invalid monitor ID or user is not a monitor');
    }

    // Verify school belongs to institution (using institution_schools + master_schools)
    const schools = await query(
      `SELECT isv.id, ms.name 
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ?`,
      [school_id, parseInt(institutionId)]
    );
    if (schools.length === 0) {
      throw new ValidationError('Invalid school ID');
    }

    // Verify session belongs to institution
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    // Check for duplicate assignment
    const existing = await query(
      `SELECT id FROM monitor_assignments 
       WHERE monitor_id = ? AND institution_school_id = ? AND session_id = ? AND institution_id = ?`,
      [monitor_id, school_id, session_id, parseInt(institutionId)]
    );
    if (existing.length > 0) {
      throw new ConflictError('Monitor is already assigned to this school for this session');
    }

    const result = await query(
      `INSERT INTO monitor_assignments 
       (institution_id, session_id, monitor_id, institution_school_id, monitoring_type, status, assigned_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [parseInt(institutionId), session_id, monitor_id, school_id, monitoring_type || 'supervision_evaluation', req.user.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'monitor_assigned', 'monitor_assignment', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ monitor_name: monitors[0].name, school_name: schools[0].name }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Monitor assigned successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create bulk monitor assignments (one monitor to multiple schools)
 * POST /:institutionId/monitoring/assignments/bulk
 */
const createAssignments = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, monitor_id, school_ids, monitoring_type = 'supervision_evaluation' } = req.body;

    if (!Array.isArray(school_ids) || school_ids.length === 0) {
      throw new ValidationError('school_ids must be a non-empty array');
    }

    // Verify monitor is a valid user with monitor role (include email for notification)
    const monitors = await query(
      `SELECT id, name, email FROM users
       WHERE id = ? AND institution_id = ? 
         AND role IN ('field_monitor', 'supervisor', 'head_of_teaching_practice') AND status = 'active'`,
      [monitor_id, parseInt(institutionId)]
    );
    if (monitors.length === 0) {
      throw new ValidationError('Invalid monitor ID or user is not a monitor');
    }

    // Verify session belongs to institution
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    const results = { successful: [], failed: [] };

    for (const school_id of school_ids) {
      try {
        // Verify school belongs to institution (using institution_schools + master_schools)
        const schools = await query(
          `SELECT isv.id, ms.name 
           FROM institution_schools isv
           JOIN master_schools ms ON isv.master_school_id = ms.id
           WHERE isv.id = ? AND isv.institution_id = ?`,
          [school_id, parseInt(institutionId)]
        );
        if (schools.length === 0) {
          results.failed.push({ school_id, reason: 'Invalid school ID' });
          continue;
        }

        // Check if school already has an assignment for this monitoring_type in this session
        const existing = await query(
          `SELECT id, monitor_id FROM monitor_assignments 
           WHERE institution_id = ? AND session_id = ? AND institution_school_id = ? AND monitoring_type = ? AND status = 'active'`,
          [parseInt(institutionId), session_id, school_id, monitoring_type]
        );

        if (existing.length > 0) {
          results.failed.push({ 
            school_id, 
            reason: `School already has a ${monitoring_type.replace('_', ' ')} assignment for this session` 
          });
          continue;
        }

        const result = await query(
          `INSERT INTO monitor_assignments 
           (institution_id, session_id, monitor_id, institution_school_id, monitoring_type, status, assigned_by)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
          [parseInt(institutionId), session_id, monitor_id, school_id, monitoring_type, req.user.id]
        );

        results.successful.push({ id: result.insertId, school_id, school_name: schools[0].name });
      } catch (error) {
        results.failed.push({ school_id, reason: error.message });
      }
    }

    // Send email notification to monitor if there were successful assignments
    if (results.successful.length > 0) {
      try {
        // Get session name
        const sessionData = await query(
          'SELECT name FROM academic_sessions WHERE id = ?',
          [session_id]
        );
        const sessionName = sessionData[0]?.name || 'Current Session';

        // Get frontend URL for the institution
        const dashboardUrl = await emailService.getFrontendUrl(parseInt(institutionId)) + '/admin/monitoring';

        // Build school list for email
        const schoolList = results.successful
          .map(s => `• ${s.school_name}`)
          .join('<br>');

        // Queue email notification
        emailQueueService.enqueue(parseInt(institutionId), {
          to: monitors[0].email,
          template: 'monitorAssignment',
          data: {
            name: monitors[0].name,
            schoolCount: results.successful.length,
            schoolName: results.successful.length === 1 ? results.successful[0].school_name : null,
            schoolList: results.successful.length > 1 ? schoolList : null,
            sessionName,
            monitoringType: monitoring_type,
            dashboardUrl,
          },
        }, { priority: 'normal' });
      } catch (emailError) {
        // Log but don't fail the request if email fails
        console.error('[MONITORING] Failed to send assignment notification email:', emailError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${results.successful.length} assignment(s), ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update monitor assignment
 * PUT /:institutionId/monitoring/assignments/:id
 */
const updateAssignment = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { school_id, monitoring_type, status } = req.body;

    // Get existing
    const existing = await query(
      'SELECT * FROM monitor_assignments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Assignment not found');
    }

    // Build update
    const updates = [];
    const params = [];

    if (school_id !== undefined) {
      const schools = await query(
        `SELECT isv.id FROM institution_schools isv
         WHERE isv.id = ? AND isv.institution_id = ?`,
        [school_id, parseInt(institutionId)]
      );
      if (schools.length === 0) {
        throw new ValidationError('Invalid school ID');
      }
      updates.push('institution_school_id = ?');
      params.push(school_id);
    }
    if (monitoring_type !== undefined) {
      updates.push('monitoring_type = ?');
      params.push(monitoring_type);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE monitor_assignments SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Assignment updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete monitor assignment
 * DELETE /:institutionId/monitoring/assignments/:id
 */
const removeAssignment = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const existing = await query(
      'SELECT id FROM monitor_assignments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Assignment not found');
    }

    // Check for reports
    const reports = await query(
      'SELECT COUNT(*) as count FROM monitoring_reports WHERE assignment_id = ?',
      [parseInt(id)]
    );

    if (reports[0].count > 0) {
      throw new ValidationError('Cannot delete assignment with existing reports. Delete reports first.');
    }

    await query(
      'DELETE FROM monitor_assignments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ===========================
// REPORT METHODS
// ===========================

/**
 * Get all monitoring reports
 * GET /:institutionId/monitoring/reports
 * 
 * Role-based filtering:
 * - super_admin, head_of_teaching_practice: Can see all reports
 * - supervisor, field_monitor: Can only see their own reports
 */
const getAllReports = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, assignment_id, monitor_id, school_id,
      limit = 100, offset = 0 
    } = req.query;

    // Role-based access: non-admin roles can only see their own reports
    const isAdmin = ['super_admin', 'head_of_teaching_practice'].includes(req.user.role);
    const effectiveMonitorId = isAdmin ? monitor_id : req.user.id;

    let sql = `
      SELECT mr.*,
             u.name as monitor_name, u.email as monitor_email,
             ms.name as school_name, ms.official_code as school_code, ms.ward,
             r.name as route_name,
             sess.name as session_name
      FROM monitoring_reports mr
      LEFT JOIN users u ON mr.monitor_id = u.id
      LEFT JOIN institution_schools isv ON mr.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      LEFT JOIN academic_sessions sess ON mr.session_id = sess.id
      WHERE mr.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    // For non-admin roles, always filter by their own monitor_id
    if (!isAdmin) {
      sql += ' AND mr.monitor_id = ?';
      params.push(effectiveMonitorId);
    } else if (monitor_id) {
      // Admin can optionally filter by monitor_id
      sql += ' AND mr.monitor_id = ?';
      params.push(parseInt(monitor_id));
    }

    if (session_id) {
      sql += ' AND mr.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (assignment_id) {
      sql += ' AND mr.assignment_id = ?';
      params.push(parseInt(assignment_id));
    }
    if (school_id) {
      sql += ' AND mr.institution_school_id = ?';
      params.push(parseInt(school_id));
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY mr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const reports = await query(sql, params);

    res.json({
      success: true,
      data: reports,
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
 * Get report by ID
 * GET /:institutionId/monitoring/reports/:id
 */
const getReport = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const reports = await query(
      `SELECT mr.*,
              u.name as monitor_name, u.email as monitor_email, u.phone as monitor_phone,
              ms.name as school_name, ms.official_code as school_code, ms.address, ms.ward, ms.lga,
              r.name as route_name,
              sess.name as session_name,
              ma.monitoring_type
       FROM monitoring_reports mr
       LEFT JOIN users u ON mr.monitor_id = u.id
       LEFT JOIN institution_schools isv ON mr.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       LEFT JOIN academic_sessions sess ON mr.session_id = sess.id
       LEFT JOIN monitor_assignments ma ON mr.assignment_id = ma.id
       WHERE mr.id = ? AND mr.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (reports.length === 0) {
      throw new NotFoundError('Report not found');
    }

    res.json({
      success: true,
      data: reports[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create monitoring report
 * POST /:institutionId/monitoring/reports
 */
const createReport = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { assignment_id, observations, recommendations, additional_notes, student_scores } = req.body;

    // Verify assignment exists and belongs to this monitor
    const assignments = await query(
      `SELECT ma.*, ms.name as school_name 
       FROM monitor_assignments ma
       JOIN institution_schools isv ON ma.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE ma.id = ? AND ma.institution_id = ?`,
      [assignment_id, parseInt(institutionId)]
    );

    if (assignments.length === 0) {
      throw new NotFoundError('Assignment not found');
    }

    const assignment = assignments[0];

    // Verify user is the assigned monitor or has admin role
    if (assignment.monitor_id !== req.user.id && req.user.role !== 'head_of_teaching_practice' && req.user.role !== 'super_admin') {
      throw new ValidationError('You are not authorized to create reports for this assignment');
    }

    // Check if a report already exists for this assignment
    const existingReports = await query(
      'SELECT id FROM monitoring_reports WHERE assignment_id = ? AND institution_id = ?',
      [assignment_id, parseInt(institutionId)]
    );
    if (existingReports.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A report already exists for this assignment',
        existing_report_id: existingReports[0].id
      });
    }

    const result = await transaction(async (conn) => {
      // Create report
      const [insertResult] = await conn.execute(
        `INSERT INTO monitoring_reports 
         (institution_id, session_id, assignment_id, monitor_id, institution_school_id, observations, recommendations, additional_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [parseInt(institutionId), assignment.session_id, assignment_id, 
         assignment.monitor_id, assignment.institution_school_id, observations, 
         recommendations || null, additional_notes || null]
      );

      // Create student scores if provided
      if (student_scores && student_scores.length > 0) {
        for (const score of student_scores) {
          await conn.execute(
            `INSERT INTO student_results 
             (institution_id, session_id, student_id, institution_school_id, supervisor_id, scoring_type, total_score, score_breakdown)
             VALUES (?, ?, ?, ?, ?, 'basic', ?, ?)
             ON DUPLICATE KEY UPDATE total_score = ?, score_breakdown = ?, updated_at = NOW()`,
            [parseInt(institutionId), assignment.session_id, score.student_id, 
             assignment.institution_school_id, assignment.monitor_id, score.score,
             JSON.stringify({ monitoring_score: score.score, comments: score.comments }),
             score.score, JSON.stringify({ monitoring_score: score.score, comments: score.comments })]
          );
        }
      }

      // Update assignment status
      await conn.execute(
        'UPDATE monitor_assignments SET status = ? WHERE id = ?',
        ['active', assignment_id]
      );

      return insertResult;
    });

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'monitoring_report_created', 'monitoring_report', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ school_name: assignment.school_name }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Monitoring report created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update monitoring report
 * PUT /:institutionId/monitoring/reports/:id
 */
const updateReport = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { observations, recommendations, additional_notes } = req.body;

    // Get existing
    const existing = await query(
      'SELECT * FROM monitoring_reports WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Report not found');
    }

    const report = existing[0];

    // Verify user is the monitor or has admin role
    if (report.monitor_id !== req.user.id && req.user.role !== 'head_of_teaching_practice' && req.user.role !== 'super_admin') {
      throw new ValidationError('You are not authorized to update this report');
    }

    // Build update
    const updates = [];
    const params = [];

    if (observations !== undefined) {
      updates.push('observations = ?');
      params.push(observations);
    }
    if (recommendations !== undefined) {
      updates.push('recommendations = ?');
      params.push(recommendations);
    }
    if (additional_notes !== undefined) {
      updates.push('additional_notes = ?');
      params.push(additional_notes);
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE monitoring_reports SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Report updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get monitoring dashboard stats
 * GET /:institutionId/monitoring/dashboard
 * 
 * Role-based filtering:
 * - super_admin, head_of_teaching_practice: See all statistics
 * - supervisor, field_monitor: See only their own statistics
 */
const getDashboard = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    // Role-based access: non-admin roles only see their own stats
    const isAdmin = ['super_admin', 'head_of_teaching_practice'].includes(req.user.role);

    let sessionFilter = '';
    let monitorFilter = '';
    const params = [parseInt(institutionId)];
    
    if (session_id) {
      sessionFilter = ' AND ma.session_id = ?';
      params.push(parseInt(session_id));
    }

    // Non-admin users only see their own assignments/reports
    if (!isAdmin) {
      monitorFilter = ' AND ma.monitor_id = ?';
      params.push(req.user.id);
    }

    // Get assignment stats
    const [assignmentStats] = await query(
      `SELECT 
        COUNT(*) as total_assignments,
        SUM(CASE WHEN ma.status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN ma.status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN ma.status = 'completed' THEN 1 ELSE 0 END) as completed,
        COUNT(DISTINCT ma.monitor_id) as total_monitors,
        COUNT(DISTINCT ma.institution_school_id) as total_schools
      FROM monitor_assignments ma
      WHERE ma.institution_id = ?${sessionFilter}${monitorFilter}`,
      params
    );

    // Get report stats
    const [reportStats] = await query(
      `SELECT COUNT(*) as total_reports
       FROM monitoring_reports mr
       INNER JOIN monitor_assignments ma ON mr.assignment_id = ma.id
       WHERE ma.institution_id = ?${sessionFilter}${monitorFilter}`,
      params
    );

    res.json({
      success: true,
      data: {
        total_assignments: parseInt(assignmentStats.total_assignments) || 0,
        pending_assignments: parseInt(assignmentStats.pending) || 0,
        active_assignments: parseInt(assignmentStats.active) || 0,
        completed_assignments: parseInt(assignmentStats.completed) || 0,
        total_monitors: parseInt(assignmentStats.total_monitors) || 0,
        total_schools: parseInt(assignmentStats.total_schools) || 0,
        total_reports: parseInt(reportStats.total_reports) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get my assignments (for current user as monitor)
 * GET /:institutionId/monitoring/my-assignments
 */
const getMyAssignments = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT ma.*,
             ms.name as school_name, ms.official_code as school_code, ms.ward, ms.lga, ms.address as school_address,
             ms.principal_name, ms.principal_phone,
             r.name as route_name,
             sess.name as session_name,
             (SELECT COUNT(*) FROM monitoring_reports mr WHERE mr.assignment_id = ma.id) as report_count
      FROM monitor_assignments ma
      LEFT JOIN institution_schools isv ON ma.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      LEFT JOIN academic_sessions sess ON ma.session_id = sess.id
      WHERE ma.institution_id = ? AND ma.monitor_id = ?
    `;
    const params = [parseInt(institutionId), req.user.id];

    if (session_id) {
      sql += ' AND ma.session_id = ?';
      params.push(parseInt(session_id));
    }

    sql += ' ORDER BY ma.created_at DESC';

    const assignments = await query(sql, params);

    res.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available monitors for assignment
 * GET /:institutionId/monitoring/available-monitors
 */
const getAvailableMonitors = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    const monitors = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role,
              rk.name as rank_name,
              (SELECT COUNT(*) FROM monitor_assignments ma 
               WHERE ma.monitor_id = u.id AND ma.institution_id = ? AND ma.status = 'active'
               ${session_id ? 'AND ma.session_id = ?' : ''}) as current_assignments
       FROM users u
       LEFT JOIN ranks rk ON u.rank_id = rk.id
       WHERE u.institution_id = ? 
         AND u.role IN ('field_monitor', 'supervisor', 'head_of_teaching_practice')
         AND u.status = 'active'
       ORDER BY u.name`,
      session_id 
        ? [parseInt(institutionId), parseInt(session_id), parseInt(institutionId)]
        : [parseInt(institutionId), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: monitors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get unassigned schools
 * GET /:institutionId/monitoring/unassigned-schools
 */
const getUnassignedSchools = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, monitoring_type = 'supervision_evaluation' } = req.query;

    if (!session_id) {
      return res.json({ success: true, data: [] });
    }

    const schools = await query(
      `SELECT isv.id, ms.name, ms.official_code as code, ms.ward, ms.lga, ms.state, ms.address, ms.principal_name,
              r.name as route_name
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE isv.institution_id = ? AND isv.status = 'active'
         AND isv.id NOT IN (
           SELECT institution_school_id FROM monitor_assignments 
           WHERE institution_id = ? AND session_id = ? AND monitoring_type = ? AND status = 'active'
         )
       ORDER BY ms.name`,
      [parseInt(institutionId), parseInt(institutionId), parseInt(session_id), monitoring_type]
    );

    res.json({
      success: true,
      data: schools,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete monitoring report
 * DELETE /:institutionId/monitoring/reports/:id
 */
const removeReport = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Verify report exists
    const reports = await query(
      'SELECT id, monitor_id FROM monitoring_reports WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );
    if (reports.length === 0) {
      throw new NotFoundError('Report not found');
    }

    const report = reports[0];

    // Verify user is the monitor or has admin role
    if (report.monitor_id !== req.user.id && req.user.role !== 'head_of_teaching_practice' && req.user.role !== 'super_admin') {
      throw new ValidationError('You are not authorized to delete this report');
    }

    await query(
      'DELETE FROM monitoring_reports WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  // Assignment methods
  getAllAssignments,
  getAssignment,
  createAssignment,
  createAssignments,
  updateAssignment,
  removeAssignment,
  getMyAssignments,
  getAvailableMonitors,
  getUnassignedSchools,
  // Report methods
  getAllReports,
  getReport,
  createReport,
  updateReport,
  removeReport,
  // Dashboard
  getDashboard,
};
