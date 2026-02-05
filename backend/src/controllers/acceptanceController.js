/**
 * Acceptance Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles student acceptance letters/forms for teaching practice placements
 */

const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError, AuthorizationError } = require('../utils/errors');
const { cloudinaryService } = require('../services');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      student_id: z.number().int().positive('Student ID is required'),
      school_id: z.number().int().positive('School ID is required'),
      group_number: z.number().int().positive().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      school_id: z.number().int().positive().optional(),
      group_number: z.number().int().positive().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      rejection_reason: z.string().optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  review: z.object({
    body: z.object({
      status: z.enum(['approved', 'rejected']),
      rejection_reason: z.string().optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

/**
 * Get all acceptances
 * GET /:institutionId/acceptances
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, school_id, student_id, status, search,
      limit = 50, page = 1, offset
    } = req.query;

    // Support both page/limit and offset/limit pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const offsetNum = offset !== undefined ? parseInt(offset) : (pageNum - 1) * limitNum;

    let sql = `
      SELECT sa.*,
             st.registration_number, st.full_name as student_name,
             ms.name as school_name, ms.official_code as school_code, ms.ward, ms.lga,
             r.name as route_name,
             p.name as program_name,
             sess.name as session_name,
             u.name as reviewed_by_name
      FROM student_acceptances sa
      LEFT JOIN students st ON sa.student_id = st.id
      LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      LEFT JOIN programs p ON st.program_id = p.id
      LEFT JOIN academic_sessions sess ON sa.session_id = sess.id
      LEFT JOIN users u ON sa.reviewed_by = u.id
      WHERE sa.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sa.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND sa.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (student_id) {
      sql += ' AND sa.student_id = ?';
      params.push(parseInt(student_id));
    }
    if (status) {
      sql += ' AND sa.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (st.full_name LIKE ? OR st.registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count query - create separate params for count to avoid mutation issues
    const countParams = [...params];
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/i, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY sa.submitted_at DESC, sa.created_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const acceptances = await query(sql, params);

    res.json({
      success: true,
      data: acceptances,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        offset: offsetNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get acceptance by ID
 * GET /:institutionId/acceptances/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const acceptances = await query(
      `SELECT sa.*,
              st.registration_number, st.full_name as student_name,
              st.gender, st.date_of_birth,
              p.name as program_name, p.code as program_code,
              ms.name as school_name, ms.official_code as school_code, ms.address, ms.ward, ms.lga, ms.state,
              ms.principal_name, ms.principal_phone,
              r.name as route_name,
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM student_acceptances sa
       LEFT JOIN students st ON sa.student_id = st.id
       LEFT JOIN programs p ON st.program_id = p.id
       LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       LEFT JOIN academic_sessions sess ON sa.session_id = sess.id
       LEFT JOIN users u ON sa.reviewed_by = u.id
       WHERE sa.id = ? AND sa.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (acceptances.length === 0) {
      throw new NotFoundError('Acceptance not found');
    }

    res.json({
      success: true,
      data: acceptances[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create acceptance
 * POST /:institutionId/acceptances
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, student_id, school_id, group_number, phone, email } = req.body;

    // Verify student belongs to institution
    const students = await query(
      'SELECT id, full_name FROM students WHERE id = ? AND institution_id = ?',
      [student_id, parseInt(institutionId)]
    );
    if (students.length === 0) {
      throw new ValidationError('Invalid student ID');
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

    // Check for duplicate
    const existing = await query(
      `SELECT id FROM student_acceptances 
       WHERE student_id = ? AND session_id = ? AND institution_id = ?`,
      [student_id, session_id, parseInt(institutionId)]
    );
    if (existing.length > 0) {
      throw new ConflictError('Acceptance already exists for this student in this session');
    }

    const result = await transaction(async (conn) => {
      const [insertResult] = await conn.execute(
        `INSERT INTO student_acceptances 
         (institution_id, session_id, student_id, institution_school_id, group_number, phone, email, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [parseInt(institutionId), session_id, student_id, school_id, group_number || null, phone || null, email || null]
      );

      return insertResult;
    });

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'acceptance_created', 'student_acceptance', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ student_name: students[0].full_name, school_name: schools[0].name }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Acceptance created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update acceptance
 * PUT /:institutionId/acceptances/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { school_id, group_number, phone, email, status, rejection_reason } = req.body;

    // Get existing
    const existing = await query(
      'SELECT * FROM student_acceptances WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Acceptance not found');
    }

    const acceptance = existing[0];

    // Build update
    const updates = [];
    const params = [];

    if (school_id !== undefined) {
      // Verify school using institution_schools
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
    if (group_number !== undefined) {
      updates.push('group_number = ?');
      params.push(group_number);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      
      if (status === 'approved' || status === 'rejected') {
        updates.push('reviewed_by = ?');
        params.push(req.user.id);
        updates.push('reviewed_at = NOW()');
      }
    }
    if (rejection_reason !== undefined) {
      updates.push('rejection_reason = ?');
      params.push(rejection_reason);
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE student_acceptances SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    // Update student's acceptance_status if status was changed
    if (status !== undefined) {
      await query(
        'UPDATE students SET acceptance_status = ? WHERE id = ?',
        [status, acceptance.student_id]
      );
    }

    res.json({
      success: true,
      message: 'Acceptance updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete acceptance
 * DELETE /:institutionId/acceptances/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const existing = await query(
      'SELECT * FROM student_acceptances WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Acceptance not found');
    }

    const acceptance = existing[0];

    await transaction(async (conn) => {
      // Remove acceptance
      await conn.execute(
        'DELETE FROM student_acceptances WHERE id = ? AND institution_id = ?',
        [parseInt(id), parseInt(institutionId)]
      );

      // Reset student's acceptance_status
      await conn.execute(
        'UPDATE students SET acceptance_status = NULL WHERE id = ?',
        [acceptance.student_id]
      );
    });

    res.json({
      success: true,
      message: 'Acceptance deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload signed acceptance form image
 * POST /:institutionId/acceptances/:id/upload
 */
const uploadImage = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    // Get acceptance
    const acceptances = await query(
      `SELECT sa.*, st.registration_number
       FROM student_acceptances sa
       JOIN students st ON sa.student_id = st.id
       WHERE sa.id = ? AND sa.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (acceptances.length === 0) {
      throw new NotFoundError('Acceptance not found');
    }

    const acceptance = acceptances[0];

    // Generate unique filename
    const ext = path.extname(req.file.originalname);
    const filename = `acceptance_${acceptance.registration_number}_${Date.now()}${ext}`;
    const uploadDir = path.join(__dirname, '../../uploads/acceptances');
    const filepath = path.join(uploadDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Move file
    fs.writeFileSync(filepath, req.file.buffer);

    // Delete old file if exists
    if (acceptance.signed_form_url) {
      const oldPath = path.join(__dirname, '../..', acceptance.signed_form_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update database
    const signedFormUrl = `/uploads/acceptances/${filename}`;
    await query(
      `UPDATE student_acceptances 
       SET signed_form_url = ?, signed_form_original_name = ?, submitted_at = NOW(), updated_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [signedFormUrl, req.file.originalname, parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Acceptance form uploaded successfully',
      data: {
        signed_form_url: signedFormUrl,
        original_name: req.file.originalname,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk create acceptances (from posting assignments)
 * POST /:institutionId/acceptances/bulk
 */
const bulkCreate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, assignments } = req.body;
    
    // assignments: [{ student_id, school_id, group_number }]
    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new ValidationError('Assignments array is required');
    }

    // Verify session
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    const results = { created: 0, skipped: 0, errors: [] };

    await transaction(async (conn) => {
      for (const assignment of assignments) {
        try {
          // Check if already exists
          const [existing] = await conn.execute(
            `SELECT id FROM student_acceptances 
             WHERE student_id = ? AND session_id = ? AND institution_id = ?`,
            [assignment.student_id, session_id, parseInt(institutionId)]
          );

          if (existing.length > 0) {
            results.skipped++;
            continue;
          }

          // Create acceptance
          await conn.execute(
            `INSERT INTO student_acceptances 
             (institution_id, session_id, student_id, institution_school_id, group_number, status)
             VALUES (?, ?, ?, ?, ?, 'approved')`,
            [parseInt(institutionId), session_id, assignment.student_id, 
             assignment.school_id, assignment.group_number || null]
          );

          results.created++;
        } catch (err) {
          results.errors.push({ student_id: assignment.student_id, error: err.message });
        }
      }
    });

    res.status(201).json({
      success: true,
      message: `Created ${results.created} acceptances, skipped ${results.skipped}`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get acceptance statistics
 * GET /:institutionId/acceptances/statistics
 */
const getStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        COUNT(DISTINCT institution_school_id) as schools_selected
      FROM student_acceptances
      WHERE institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    const [stats] = await query(sql, params);

    // Get total students for the session to calculate not submitted
    let totalStudents = 0;
    if (session_id) {
      const [studentCount] = await query(
        `SELECT COUNT(*) as count FROM students 
         WHERE institution_id = ? AND session_id = ? AND status = 'active'`,
        [parseInt(institutionId), parseInt(session_id)]
      );
      totalStudents = parseInt(studentCount?.count) || 0;
    }

    const totalSubmissions = parseInt(stats.total) || 0;

    res.json({
      success: true,
      data: {
        total: totalSubmissions,
        total_submissions: totalSubmissions,
        total_students: totalStudents,
        not_submitted: Math.max(0, totalStudents - totalSubmissions),
        pending: parseInt(stats.pending) || 0,
        approved: parseInt(stats.approved) || 0,
        rejected: parseInt(stats.rejected) || 0,
        schools_selected: parseInt(stats.schools_selected) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// STUDENT-FACING METHODS (for student portal)
// ============================================================================

/**
 * Get student's acceptance status
 * GET /portal/acceptance/status
 */
const getStudentStatus = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    // Get current session
    const [session] = await query(
      `SELECT * FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 AND status = 'active' 
       LIMIT 1`,
      [institutionId]
    );

    if (!session) {
      return res.json({
        success: true,
        data: {
          active_session: false,
          message: 'No active teaching practice session',
        },
      });
    }

    // Check window status
    const now = new Date();
    const windowOpen = session.acceptance_form_start_date && session.acceptance_form_end_date &&
      now >= new Date(session.acceptance_form_start_date) &&
      now <= new Date(session.acceptance_form_end_date);

    // Get existing acceptance
    const [acceptance] = await query(
      `SELECT sa.*, ms.name as school_name, ms.official_code as school_code, 
              ms.address, ms.ward, ms.lga, ms.state,
              ms.principal_name, ms.principal_phone,
              r.name as route_name
       FROM student_acceptances sa
       JOIN institution_schools isv ON sa.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sa.student_id = ? AND sa.session_id = ? AND sa.institution_id = ?`,
      [studentId, session.id, institutionId]
    );

    // Get institution payment settings
    const [institution] = await query(
      'SELECT payment_enabled, payment_base_amount FROM institutions WHERE id = ?',
      [institutionId]
    );
    const requiredAmount = parseFloat(institution?.payment_base_amount) || 0;
    const paymentRequired = institution?.payment_enabled && requiredAmount > 0;

    // Get payment status
    const [paymentInfo] = await query(
      `SELECT SUM(amount) as total_paid 
       FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ? AND status = 'success'`,
      [studentId, session.id, institutionId]
    );
    const totalPaid = parseFloat(paymentInfo?.total_paid) || 0;
    const paymentMade = !paymentRequired || totalPaid >= requiredAmount;

    // Build response
    const canSubmit = windowOpen && !acceptance && paymentMade;

    // Calculate posting letter availability
    const postingLetterDate = session.posting_letter_available_date ? new Date(session.posting_letter_available_date) : null;
    const postingLetterAvailable = postingLetterDate && now >= postingLetterDate;

    const response = {
      active_session: true,
      session: {
        id: session.id,
        name: session.name,
        acceptance_start: session.acceptance_form_start_date,
        acceptance_end: session.acceptance_form_end_date,
      },
      window_open: windowOpen,
      payment_met: paymentMade,
      submitted: !!acceptance,
      can_submit: canSubmit,
      // Add posting_letter object for frontend compatibility
      posting_letter: {
        available: postingLetterAvailable,
        can_download: postingLetterAvailable && !!acceptance,
        message: postingLetterAvailable 
          ? (acceptance 
              ? 'Your posting letter is ready for download'
              : 'Posting letters are available. Please submit your acceptance form first.')
          : (postingLetterDate
              ? `Available from ${postingLetterDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
              : 'Not yet available'),
      },
      // Add windows object for frontend compatibility
      windows: {
        acceptance: {
          is_open: windowOpen,
          starts_at: session.acceptance_form_start_date,
          ends_at: session.acceptance_form_end_date,
        },
        posting_letter: {
          is_open: postingLetterAvailable,
          starts_at: session.posting_letter_available_date,
          message: postingLetterAvailable 
            ? 'Posting letters are available'
            : postingLetterDate
              ? `Available from ${postingLetterDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
              : 'Not yet available',
        },
      },
    };

    if (acceptance) {
      response.acceptance = {
        id: acceptance.id,
        school_id: acceptance.institution_school_id,
        school_name: acceptance.school_name,
        school_code: acceptance.school_code,
        school_address: acceptance.address,
        school_ward: acceptance.ward,
        school_lga: acceptance.lga,
        school_state: acceptance.state,
        principal_name: acceptance.principal_name,
        principal_phone: acceptance.principal_phone,
        route_name: acceptance.route_name,
        group_number: acceptance.group_number,
        status: acceptance.status,
        rejection_reason: acceptance.rejection_reason,
        submitted_at: acceptance.created_at,
        reviewed_at: acceptance.reviewed_at,
      };
    } else if (!canSubmit) {
      response.submission_errors = [];
      if (!windowOpen) response.submission_errors.push('Acceptance submission window is currently closed');
      if (!paymentMade) response.submission_errors.push('Payment is required before you can proceed with acceptance.');
    }

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available schools for student selection
 * GET /portal/acceptance/schools
 */
const getAvailableSchools = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    const { route_id, state, lga, search } = req.query;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    // Get student's program
    const [student] = await query(
      `SELECT s.program_id, p.department_id 
       FROM students s 
       LEFT JOIN programs p ON s.program_id = p.id 
       WHERE s.id = ? AND s.institution_id = ?`,
      [studentId, institutionId]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get current session
    const [session] = await query(
      `SELECT * FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 AND status = 'active' 
       LIMIT 1`,
      [institutionId]
    );

    if (!session) {
      throw new ValidationError('No active session');
    }

    const maxPerProgram = session.max_students_per_school_per_program || 20;

    // Build query
    let sql = `
      SELECT isv.id, ms.name, ms.official_code as school_code, ms.school_type, ms.category, 
             ms.state, ms.lga, ms.ward, ms.address, isv.distance_km,
             ms.principal_name, ms.principal_phone, isv.student_capacity,
             r.id as route_id, r.name as route_name, r.code as route_code,
             COALESCE(
               (SELECT COUNT(*) FROM student_acceptances sa
                JOIN students st ON st.id = sa.student_id
                WHERE sa.institution_school_id = isv.id AND sa.session_id = ?
                  AND st.program_id = ? AND sa.status IN ('pending', 'approved')),
               0
             ) as current_count,
             ? as max_count
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON r.id = isv.route_id
      WHERE isv.institution_id = ? AND isv.status = 'active'
    `;
    const params = [session.id, student.program_id, maxPerProgram, institutionId];

    if (route_id) {
      sql += ' AND isv.route_id = ?';
      params.push(parseInt(route_id));
    }
    if (state) {
      sql += ' AND ms.state = ?';
      params.push(state);
    }
    if (lga) {
      sql += ' AND ms.lga = ?';
      params.push(lga);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR ms.official_code LIKE ? OR ms.ward LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY ms.name ASC';

    const schools = await query(sql, params);

    // Add availability flags
    const enrichedSchools = schools.map(school => ({
      ...school,
      available: school.current_count < school.max_count,
      remaining_slots: school.max_count - school.current_count,
    }));

    res.json({ success: true, data: enrichedSchools });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit acceptance form (student endpoint)
 * POST /portal/acceptance/submit
 */
const submitAcceptance = async (req, res, next) => {
  try {
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;
    const { school_id, phone, email } = req.body;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    if (!school_id) {
      throw new ValidationError('School selection is required');
    }

    // Get current session
    const [session] = await query(
      `SELECT * FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 AND status = 'active' 
       LIMIT 1`,
      [institutionId]
    );

    if (!session) {
      throw new ValidationError('No active session');
    }

    // Check window
    const now = new Date();
    const windowOpen = session.acceptance_form_start_date && session.acceptance_form_end_date &&
      now >= new Date(session.acceptance_form_start_date) &&
      now <= new Date(session.acceptance_form_end_date);

    if (!windowOpen) {
      throw new ValidationError('Acceptance submission window is closed');
    }

    // Check not already submitted
    const [existing] = await query(
      `SELECT id FROM student_acceptances 
       WHERE student_id = ? AND session_id = ? AND institution_id = ?`,
      [studentId, session.id, institutionId]
    );

    if (existing) {
      throw new ConflictError('You have already submitted an acceptance for this session');
    }

    // Get institution payment settings
    const [institution] = await query(
      'SELECT code, payment_enabled, payment_base_amount FROM institutions WHERE id = ?',
      [institutionId]
    );
    const requiredAmount = parseFloat(institution?.payment_base_amount) || 0;
    const paymentRequired = institution?.payment_enabled && requiredAmount > 0;

    // Check payment status
    const [paymentInfo] = await query(
      `SELECT SUM(amount) as total_paid 
       FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ? AND status = 'success'`,
      [studentId, session.id, institutionId]
    );
    const totalPaid = parseFloat(paymentInfo?.total_paid) || 0;
    const paymentMade = !paymentRequired || totalPaid >= requiredAmount;

    if (!paymentMade) {
      throw new ValidationError('Payment requirements not met. Please complete payment first.');
    }

    // Validate school using institution_schools + master_schools
    const [school] = await query(
      `SELECT isv.*, ms.name as school_name FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ? AND isv.status = ?`,
      [parseInt(school_id), institutionId, 'active']
    );

    if (!school) {
      throw new NotFoundError('Selected school not found or not available');
    }

    // Validate file upload
    if (!req.file) {
      throw new ValidationError('Signed acceptance form is required');
    }

    // Get student info for Cloudinary upload (institution already queried above)
    const [student] = await query(
      'SELECT registration_number FROM students WHERE id = ?',
      [studentId]
    );

    // Upload signed form to Cloudinary
    let signedFormUrl;
    let signedFormOriginalName;
    try {
      const uploadResult = await cloudinaryService.uploadImage(req.file, {
        institutionCode: institution?.code || `inst-${institutionId}`,
        sessionName: session.code || session.name,
        studentId: student?.registration_number || `student-${studentId}`,
        type: 'acceptances',
        originalFilename: req.file.originalname,
      });
      signedFormUrl = uploadResult.url;
      signedFormOriginalName = req.file.originalname;
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      throw new ValidationError('Failed to upload signed form. Please try again.');
    }

    // Get next available group number
    const [groupInfo] = await query(
      `SELECT COALESCE(MAX(group_number), 0) + 1 as next_group,
              COUNT(*) as total_in_school
       FROM student_acceptances 
       WHERE institution_school_id = ? AND session_id = ? AND institution_id = ?
       AND status IN ('pending', 'approved')`,
      [parseInt(school_id), session.id, institutionId]
    );

    const studentsPerGroup = session.students_per_group || 10;
    const groupNumber = Math.floor(groupInfo.total_in_school / studentsPerGroup) + 1;

    // Create acceptance with institution_school_id
    const result = await query(
      `INSERT INTO student_acceptances 
       (institution_id, session_id, student_id, institution_school_id, phone, email, group_number, signed_form_url, signed_form_original_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [institutionId, session.id, studentId, parseInt(school_id), phone, email, groupNumber, signedFormUrl, signedFormOriginalName]
    );

    // Fetch created acceptance with school details
    const [newAcceptance] = await query(
      `SELECT sa.*, ms.name as school_name, ms.official_code as school_code, 
              ms.address, ms.ward, ms.lga, ms.state,
              r.name as route_name
       FROM student_acceptances sa
       JOIN institution_schools isv ON sa.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sa.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Acceptance form submitted successfully',
      data: newAcceptance,
    });
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
  uploadImage,
  bulkCreate,
  // Student portal methods
  getStudentStatus,
  getAvailableSchools,
  submitAcceptance,
};
