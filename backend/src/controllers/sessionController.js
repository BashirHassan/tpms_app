/**
 * Session Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles Academic Session management
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      name: z.string().min(1, 'Session name is required'),
      code: z.string().min(1, 'Session code is required'),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
      max_posting_per_supervisor: z.number().int().min(1).optional(),
      max_students_per_school_per_program: z.number().int().min(1).optional(),
      max_students_per_department_per_school: z.number().int().min(1).optional(),
      local_running_distance_km: z.number().min(0).optional(),
      enable_grouping: z.boolean().optional(),
      max_students_per_group: z.number().int().min(1).optional(),
      posting_letter_available_date: z.string().optional().nullable(),
      acceptance_form_start_date: z.string().optional().nullable(),
      acceptance_form_end_date: z.string().optional().nullable(),
      acceptance_instructions: z.string().optional().nullable(),
      tp_start_date: z.string().optional().nullable(),
      tp_end_date: z.string().optional().nullable(),
      coordinator_name: z.string().optional().nullable(),
      coordinator_phone: z.string().optional().nullable(),
      coordinator_email: z.string().email().optional().nullable(),
      tp_duration_weeks: z.number().int().min(1).optional(),
      inside_distance_threshold_km: z.number().min(0).optional(),
      max_supervision_visits: z.number().int().min(1).optional(),
      scoring_type: z.enum(['basic', 'advanced']).optional(),
      max_students_per_merged_group: z.number().int().min(1).optional(),
      max_groups_inside_schools: z.number().int().min(1).optional(),
      max_groups_outside_schools: z.number().int().min(1).optional(),
      dsa_enabled: z.boolean().optional(),
      dsa_min_distance_km: z.number().min(0).optional(),
      dsa_max_distance_km: z.number().min(0).optional(),
      dsa_percentage: z.number().min(0).max(100).optional(),
      require_acceptance_before_posting: z.boolean().optional(),
      require_payment_before_posting: z.boolean().optional(),
      allow_student_school_preference: z.boolean().optional(),
      status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(1).optional(),
      code: z.string().min(1).optional(),
      start_date: z.string().optional().nullable(),
      end_date: z.string().optional().nullable(),
      max_posting_per_supervisor: z.number().int().min(1).optional(),
      max_students_per_school_per_program: z.number().int().min(1).optional(),
      max_students_per_department_per_school: z.number().int().min(1).optional(),
      local_running_distance_km: z.number().min(0).optional(),
      enable_grouping: z.boolean().optional(),
      max_students_per_group: z.number().int().min(1).optional(),
      posting_letter_available_date: z.string().optional().nullable(),
      acceptance_form_start_date: z.string().optional().nullable(),
      acceptance_form_end_date: z.string().optional().nullable(),
      acceptance_instructions: z.string().optional().nullable(),
      tp_start_date: z.string().optional().nullable(),
      tp_end_date: z.string().optional().nullable(),
      coordinator_name: z.string().optional().nullable(),
      coordinator_phone: z.string().optional().nullable(),
      coordinator_email: z.string().email().optional().nullable(),
      tp_duration_weeks: z.number().int().min(1).optional(),
      inside_distance_threshold_km: z.number().min(0).optional(),
      max_supervision_visits: z.number().int().min(1).optional(),
      scoring_type: z.enum(['basic', 'advanced']).optional(),
      max_students_per_merged_group: z.number().int().min(1).optional(),
      max_groups_inside_schools: z.number().int().min(1).optional(),
      max_groups_outside_schools: z.number().int().min(1).optional(),
      dsa_enabled: z.boolean().optional(),
      dsa_min_distance_km: z.number().min(0).optional(),
      dsa_max_distance_km: z.number().min(0).optional(),
      dsa_percentage: z.number().min(0).max(100).optional(),
      require_acceptance_before_posting: z.boolean().optional(),
      require_payment_before_posting: z.boolean().optional(),
      allow_student_school_preference: z.boolean().optional(),
      is_locked: z.boolean().optional(),
      status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

/**
 * Get all academic sessions
 * GET /:institutionId/sessions
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { status, is_current, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT s.*, u.name as created_by_name,
             (SELECT COUNT(*) FROM students st WHERE st.session_id = s.id) as student_count,
             (SELECT COUNT(*) FROM supervisor_postings p WHERE p.session_id = s.id) as posting_count
      FROM academic_sessions s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }
    if (is_current !== undefined) {
      sql += ' AND s.is_current = ?';
      params.push(is_current === 'true' || is_current === '1' ? 1 : 0);
    }
    if (search) {
      sql += ' AND (s.name LIKE ? OR s.code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Count query - build a simple count query with the same WHERE conditions
    let countSql = `SELECT COUNT(*) as total FROM academic_sessions s WHERE s.institution_id = ?`;
    const countParams = [parseInt(institutionId)];
    
    if (status) {
      countSql += ' AND s.status = ?';
      countParams.push(status);
    }
    if (is_current !== undefined) {
      countSql += ' AND s.is_current = ?';
      countParams.push(is_current === 'true' || is_current === '1' ? 1 : 0);
    }
    if (search) {
      countSql += ' AND (s.name LIKE ? OR s.code LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm);
    }
    
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY s.is_current DESC, s.start_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const sessions = await query(sql, params);

    res.json({
      success: true,
      data: sessions,
      meta: {
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
 * Get session by ID
 * GET /:institutionId/sessions/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const sessions = await query(
      `SELECT s.*, u.name as created_by_name
       FROM academic_sessions s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (sessions.length === 0) {
      throw new NotFoundError('Session not found');
    }

    // Get statistics for this session
    const [studentCount] = await query(
      'SELECT COUNT(*) as count FROM students WHERE session_id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    const [postingCount] = await query(
      'SELECT COUNT(*) as count FROM supervisor_postings WHERE session_id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    const [schoolCount] = await query(
      `SELECT COUNT(DISTINCT institution_school_id) as count FROM supervisor_postings 
       WHERE session_id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...sessions[0],
        statistics: {
          student_count: studentCount.count,
          posting_count: postingCount.count,
          school_count: schoolCount.count,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new academic session
 * POST /:institutionId/sessions
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const data = req.body;

    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM academic_sessions WHERE institution_id = ? AND code = ?',
      [parseInt(institutionId), data.code]
    );

    if (existing.length > 0) {
      throw new ConflictError('A session with this code already exists');
    }

    // Build insert query
    const fields = [
      'institution_id', 'name', 'code', 'start_date', 'end_date',
      'max_posting_per_supervisor', 'max_students_per_school_per_program',
      'max_students_per_department_per_school', 'local_running_distance_km',
      'enable_grouping', 'max_students_per_group', 'posting_letter_available_date',
      'acceptance_form_start_date', 'acceptance_form_end_date', 'acceptance_instructions',
      'tp_start_date', 'tp_end_date', 'coordinator_name', 'coordinator_phone',
      'coordinator_email', 'tp_duration_weeks', 'inside_distance_threshold_km',
      'max_supervision_visits', 'scoring_type', 'max_students_per_merged_group',
      'max_groups_inside_schools', 'max_groups_outside_schools', 'dsa_enabled',
      'dsa_min_distance_km', 'dsa_max_distance_km', 'dsa_percentage',
      'require_acceptance_before_posting', 'require_payment_before_posting',
      'allow_student_school_preference', 'status', 'created_by'
    ];

    const values = [
      parseInt(institutionId),
      data.name,
      data.code,
      data.start_date || null,
      data.end_date || null,
      data.max_posting_per_supervisor || 50,
      data.max_students_per_school_per_program || 20,
      data.max_students_per_department_per_school || 10,
      data.local_running_distance_km || 50.00,
      data.enable_grouping !== undefined ? data.enable_grouping : true,
      data.max_students_per_group || 10,
      data.posting_letter_available_date || null,
      data.acceptance_form_start_date || null,
      data.acceptance_form_end_date || null,
      data.acceptance_instructions || null,
      data.tp_start_date || null,
      data.tp_end_date || null,
      data.coordinator_name || null,
      data.coordinator_phone || null,
      data.coordinator_email || null,
      data.tp_duration_weeks || 12,
      data.inside_distance_threshold_km || 10.00,
      data.max_supervision_visits || 3,
      data.scoring_type || 'basic',
      data.max_students_per_merged_group || 6,
      data.max_groups_inside_schools || 6,
      data.max_groups_outside_schools || 5,
      data.dsa_enabled !== undefined ? data.dsa_enabled : false,
      data.dsa_min_distance_km || 11.00,
      data.dsa_max_distance_km || 30.00,
      data.dsa_percentage || 50.00,
      data.require_acceptance_before_posting !== undefined ? data.require_acceptance_before_posting : false,
      data.require_payment_before_posting !== undefined ? data.require_payment_before_posting : true,
      data.allow_student_school_preference !== undefined ? data.allow_student_school_preference : false,
      data.status || 'draft',
      req.user?.id || null,
    ];

    const placeholders = fields.map(() => '?').join(', ');
    const result = await query(
      `INSERT INTO academic_sessions (${fields.join(', ')}) VALUES (${placeholders})`,
      values
    );

    const [session] = await query('SELECT * FROM academic_sessions WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Academic session created successfully',
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an academic session
 * PUT /:institutionId/sessions/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const updates = req.body;

    // Check if session exists
    const existing = await query(
      'SELECT id, is_locked FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Session not found');
    }

    // Check if session is locked
    if (existing[0].is_locked && !updates.is_locked) {
      // Allow unlocking but warn about other changes
      const criticalFields = ['name', 'code', 'start_date', 'end_date', 'tp_start_date', 'tp_end_date'];
      const hasCriticalChanges = criticalFields.some(f => updates[f] !== undefined);
      
      if (hasCriticalChanges) {
        throw new ConflictError('Cannot modify critical fields while session is locked');
      }
    }

    // Check for duplicate code
    if (updates.code) {
      const duplicate = await query(
        'SELECT id FROM academic_sessions WHERE institution_id = ? AND code = ? AND id != ?',
        [parseInt(institutionId), updates.code, parseInt(id)]
      );

      if (duplicate.length > 0) {
        throw new ConflictError('A session with this code already exists');
      }
    }

    // Build update query dynamically
    const allowedFields = [
      'name', 'code', 'start_date', 'end_date', 'max_posting_per_supervisor',
      'max_students_per_school_per_program', 'max_students_per_department_per_school',
      'local_running_distance_km', 'enable_grouping', 'max_students_per_group',
      'posting_letter_available_date', 'acceptance_form_start_date', 'acceptance_form_end_date',
      'acceptance_instructions', 'tp_start_date', 'tp_end_date', 'coordinator_name',
      'coordinator_phone', 'coordinator_email', 'tp_duration_weeks',
      'inside_distance_threshold_km', 'max_supervision_visits', 'scoring_type',
      'max_students_per_merged_group', 'max_groups_inside_schools', 'max_groups_outside_schools',
      'dsa_enabled', 'dsa_min_distance_km', 'dsa_max_distance_km', 'dsa_percentage',
      'require_acceptance_before_posting', 'require_payment_before_posting',
      'allow_student_school_preference', 'is_locked', 'status'
    ];

    const updateFields = [];
    const updateParams = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateParams.push(updates[field]);
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE academic_sessions SET ${updateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      updateParams
    );

    const [session] = await query('SELECT * FROM academic_sessions WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: 'Academic session updated successfully',
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an academic session
 * DELETE /:institutionId/sessions/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if session exists
    const existing = await query(
      'SELECT id, name, is_current, is_locked FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Session not found');
    }

    if (existing[0].is_current) {
      throw new ConflictError('Cannot delete the current session');
    }

    if (existing[0].is_locked) {
      throw new ConflictError('Cannot delete a locked session');
    }

    // Check for students
    const [studentCount] = await query(
      'SELECT COUNT(*) as count FROM students WHERE session_id = ?',
      [parseInt(id)]
    );

    if (studentCount.count > 0) {
      throw new ConflictError('Cannot delete session with enrolled students');
    }

    // Check for postings
    const [postingCount] = await query(
      'SELECT COUNT(*) as count FROM supervisor_postings WHERE session_id = ?',
      [parseInt(id)]
    );

    if (postingCount.count > 0) {
      throw new ConflictError('Cannot delete session with active postings');
    }

    await query(
      'DELETE FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `Session "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set a session as the current session
 * POST /:institutionId/sessions/:id/set-current
 */
const setCurrentSession = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if session exists
    const existing = await query(
      'SELECT id, name, status FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Session not found');
    }

    if (existing[0].status === 'archived') {
      throw new ConflictError('Cannot set an archived session as current');
    }

    await transaction(async (conn) => {
      // Clear current flag from all sessions
      await conn.execute(
        'UPDATE academic_sessions SET is_current = 0 WHERE institution_id = ?',
        [parseInt(institutionId)]
      );

      // Set the new current session
      await conn.execute(
        `UPDATE academic_sessions SET is_current = 1, status = 'active' 
         WHERE id = ? AND institution_id = ?`,
        [parseInt(id), parseInt(institutionId)]
      );
    });

    const [session] = await query('SELECT * FROM academic_sessions WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: `"${existing[0].name}" is now the current session`,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current session
 * GET /:institutionId/sessions/current
 */
const getCurrentSession = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const sessions = await query(
      `SELECT s.*, u.name as created_by_name
       FROM academic_sessions s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.institution_id = ? AND s.is_current = 1`,
      [parseInt(institutionId)]
    );

    if (sessions.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No current session set',
      });
    }

    res.json({
      success: true,
      data: sessions[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervision visit timelines for a session
 * GET /:institutionId/sessions/:id/supervision-timelines
 */
const getSupervisionTimelines = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if session exists
    const sessions = await query(
      'SELECT id, max_supervision_visits FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (sessions.length === 0) {
      throw new NotFoundError('Session not found');
    }

    const timelines = await query(
      `SELECT svt.*, u.name as created_by_name
       FROM supervision_visit_timelines svt
       LEFT JOIN users u ON svt.created_by = u.id
       WHERE svt.session_id = ? AND svt.institution_id = ?
       ORDER BY svt.visit_number ASC`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        max_supervision_visits: sessions[0].max_supervision_visits,
        timelines,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save supervision visit timelines for a session (upsert)
 * PUT /:institutionId/sessions/:id/supervision-timelines
 */
const saveSupervisionTimelines = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { timelines } = req.body;

    if (!Array.isArray(timelines)) {
      throw new ValidationError('Timelines must be an array');
    }

    // Check if session exists
    const sessions = await query(
      'SELECT id, max_supervision_visits FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (sessions.length === 0) {
      throw new NotFoundError('Session not found');
    }

    const maxVisits = sessions[0].max_supervision_visits || 3;

    // Validate each timeline entry
    for (const timeline of timelines) {
      if (!timeline.visit_number || timeline.visit_number < 1 || timeline.visit_number > maxVisits) {
        throw new ValidationError(`Invalid visit number. Must be between 1 and ${maxVisits}`);
      }
      if (!timeline.start_date) {
        throw new ValidationError(`Start date is required for visit ${timeline.visit_number}`);
      }
      if (!timeline.end_date) {
        throw new ValidationError(`End date is required for visit ${timeline.visit_number}`);
      }
      if (new Date(timeline.end_date) < new Date(timeline.start_date)) {
        throw new ValidationError(`End date must be after start date for visit ${timeline.visit_number}`);
      }
    }

    await transaction(async (conn) => {
      // Delete existing timelines for this session
      await conn.execute(
        'DELETE FROM supervision_visit_timelines WHERE session_id = ? AND institution_id = ?',
        [parseInt(id), parseInt(institutionId)]
      );

      // Insert new timelines
      for (const timeline of timelines) {
        await conn.execute(
          `INSERT INTO supervision_visit_timelines 
           (institution_id, session_id, visit_number, title, start_date, end_date, description, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            parseInt(institutionId),
            parseInt(id),
            timeline.visit_number,
            timeline.title || `Visit ${timeline.visit_number}`,
            timeline.start_date,
            timeline.end_date,
            timeline.description || null,
            req.user?.id || null,
          ]
        );
      }
    });

    // Fetch updated timelines
    const updatedTimelines = await query(
      `SELECT svt.*, u.name as created_by_name
       FROM supervision_visit_timelines svt
       LEFT JOIN users u ON svt.created_by = u.id
       WHERE svt.session_id = ? AND svt.institution_id = ?
       ORDER BY svt.visit_number ASC`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Supervision timelines saved successfully',
      data: {
        max_supervision_visits: maxVisits,
        timelines: updatedTimelines,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getAll,
  getById,
  create,
  update,
  remove,
  setCurrentSession,
  getCurrentSession,
  getSupervisionTimelines,
  saveSupervisionTimelines,
};
