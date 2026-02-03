/**
 * Result Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles student teaching practice results and scoring
 */

const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      student_id: z.number().int().positive('Student ID is required'),
      supervisor_id: z.number().int().positive().optional(),
      school_id: z.number().int().positive().optional(),
      group_number: z.number().int().positive().optional(),
      visit_number: z.number().int().min(1).max(5).optional(),
      scoring_type: z.enum(['basic', 'advanced']).default('basic'),
      total_score: z.number().min(0).max(100),
      score_breakdown: z.record(z.any()).optional(),
      meta: z.record(z.any()).optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      supervisor_id: z.number().int().positive().optional(),
      visit_number: z.number().int().min(1).max(5).optional(),
      scoring_type: z.enum(['basic', 'advanced']).optional(),
      total_score: z.number().min(0).max(100).optional(),
      score_breakdown: z.record(z.any()).optional(),
      meta: z.record(z.any()).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  bulkUpload: z.object({
    body: z.object({
      session_id: z.number().int().positive('Session ID is required'),
      results: z.array(z.object({
        registration_number: z.string().min(1, 'Registration number is required'),
        total_score: z.number().min(0).max(100),
        score_breakdown: z.record(z.any()).optional(),
      })).min(1, 'At least one result is required'),
    }),
  }),
};

/**
 * Get all results
 * GET /:institutionId/results
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, student_id, supervisor_id, school_id, scoring_type,
      min_score, max_score, limit = 100, offset = 0 
    } = req.query;

    let sql = `
      SELECT sr.*,
             st.registration_number, st.full_name as student_name,
             sup.name as supervisor_name,
             ms.name as school_name, ms.official_code as school_code,
             sess.name as session_name,
             p.name as program_name
      FROM student_results sr
      LEFT JOIN students st ON sr.student_id = st.id
      LEFT JOIN users sup ON sr.supervisor_id = sup.id
      LEFT JOIN institution_schools isv ON sr.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON sr.session_id = sess.id
      LEFT JOIN programs p ON st.program_id = p.id
      WHERE sr.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sr.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (student_id) {
      sql += ' AND sr.student_id = ?';
      params.push(parseInt(student_id));
    }
    if (supervisor_id) {
      sql += ' AND sr.supervisor_id = ?';
      params.push(parseInt(supervisor_id));
    }
    if (school_id) {
      sql += ' AND sr.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (scoring_type) {
      sql += ' AND sr.scoring_type = ?';
      params.push(scoring_type);
    }
    if (min_score !== undefined) {
      sql += ' AND sr.total_score >= ?';
      params.push(parseFloat(min_score));
    }
    if (max_score !== undefined) {
      sql += ' AND sr.total_score <= ?';
      params.push(parseFloat(max_score));
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY sr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const results = await query(sql, params);

    // Parse JSON fields
    results.forEach(result => {
      if (result.score_breakdown && typeof result.score_breakdown === 'string') {
        try {
          result.score_breakdown = JSON.parse(result.score_breakdown);
        } catch (e) {
          result.score_breakdown = {};
        }
      }
      if (result.meta && typeof result.meta === 'string') {
        try {
          result.meta = JSON.parse(result.meta);
        } catch (e) {
          result.meta = {};
        }
      }
    });

    res.json({
      success: true,
      data: results,
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
 * Get result by ID
 * GET /:institutionId/results/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const results = await query(
      `SELECT sr.*,
              st.registration_number, st.full_name as student_name, st.gender, st.date_of_birth,
              sup.name as supervisor_name, sup.email as supervisor_email,
              ms.name as school_name, ms.official_code as school_code, ms.address, ms.ward, ms.lga,
              sess.name as session_name,
              p.name as program_name, p.code as program_code
       FROM student_results sr
       LEFT JOIN students st ON sr.student_id = st.id
       LEFT JOIN users sup ON sr.supervisor_id = sup.id
       LEFT JOIN institution_schools isv ON sr.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN academic_sessions sess ON sr.session_id = sess.id
       LEFT JOIN programs p ON st.program_id = p.id
       WHERE sr.id = ? AND sr.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (results.length === 0) {
      throw new NotFoundError('Result not found');
    }

    const result = results[0];

    // Parse JSON fields
    if (result.score_breakdown && typeof result.score_breakdown === 'string') {
      try {
        result.score_breakdown = JSON.parse(result.score_breakdown);
      } catch (e) {
        result.score_breakdown = {};
      }
    }
    if (result.meta && typeof result.meta === 'string') {
      try {
        result.meta = JSON.parse(result.meta);
      } catch (e) {
        result.meta = {};
      }
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create result
 * POST /:institutionId/results
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      session_id, student_id, supervisor_id, school_id, 
      group_number, visit_number, scoring_type, total_score, 
      score_breakdown, meta 
    } = req.body;

    // Verify student belongs to institution
    const students = await query(
      'SELECT id, full_name, registration_number FROM students WHERE id = ? AND institution_id = ?',
      [student_id, parseInt(institutionId)]
    );
    if (students.length === 0) {
      throw new ValidationError('Invalid student ID');
    }

    // Verify session belongs to institution
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    // Verify supervisor if provided
    if (supervisor_id) {
      const supervisors = await query(
        `SELECT id FROM users
         WHERE id = ? AND institution_id = ? AND role = 'supervisor' AND status = 'active'`,
        [supervisor_id, parseInt(institutionId)]
      );
      if (supervisors.length === 0) {
        throw new ValidationError('Invalid supervisor ID');
      }
    }

    // Verify school if provided
    if (school_id) {
      const schools = await query(
        'SELECT id FROM institution_schools WHERE id = ? AND institution_id = ?',
        [school_id, parseInt(institutionId)]
      );
      if (schools.length === 0) {
        throw new ValidationError('Invalid school ID');
      }
    }

    // Check for duplicate (student + session + visit_number combination)
    if (visit_number) {
      const existing = await query(
        `SELECT id FROM student_results 
         WHERE student_id = ? AND session_id = ? AND visit_number = ? AND institution_id = ?`,
        [student_id, session_id, visit_number, parseInt(institutionId)]
      );
      if (existing.length > 0) {
        throw new ConflictError('Result already exists for this student visit');
      }
    }

    const result = await query(
      `INSERT INTO student_results 
       (institution_id, session_id, student_id, supervisor_id, institution_school_id, group_number, 
        visit_number, scoring_type, total_score, score_breakdown, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(institutionId), session_id, student_id, supervisor_id || null, 
        school_id || null, group_number || null, visit_number || null,
        scoring_type || 'basic', total_score,
        score_breakdown ? JSON.stringify(score_breakdown) : null,
        meta ? JSON.stringify(meta) : null
      ]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'result_created', 'student_result', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ student_name: students[0].full_name, total_score }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Result created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update result
 * PUT /:institutionId/results/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { supervisor_id, visit_number, scoring_type, total_score, score_breakdown, meta } = req.body;

    // Get existing
    const existing = await query(
      'SELECT * FROM student_results WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Result not found');
    }

    // Build update
    const updates = [];
    const params = [];

    if (supervisor_id !== undefined) {
      updates.push('supervisor_id = ?');
      params.push(supervisor_id);
    }
    if (visit_number !== undefined) {
      updates.push('visit_number = ?');
      params.push(visit_number);
    }
    if (scoring_type !== undefined) {
      updates.push('scoring_type = ?');
      params.push(scoring_type);
    }
    if (total_score !== undefined) {
      updates.push('total_score = ?');
      params.push(total_score);
    }
    if (score_breakdown !== undefined) {
      updates.push('score_breakdown = ?');
      params.push(JSON.stringify(score_breakdown));
    }
    if (meta !== undefined) {
      updates.push('meta = ?');
      params.push(JSON.stringify(meta));
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE student_results SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Result updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete result
 * DELETE /:institutionId/results/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const existing = await query(
      'SELECT id FROM student_results WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Result not found');
    }

    await query(
      'DELETE FROM student_results WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Result deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload results from Excel file
 * POST /:institutionId/results/upload
 */
const uploadResults = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.body;

    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Verify session
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [session_id, parseInt(institutionId)]
    );
    if (sessions.length === 0) {
      throw new ValidationError('Invalid session ID');
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      throw new ValidationError('Excel file is empty');
    }

    // Validate required columns
    const requiredColumns = ['registration_number', 'total_score'];
    const columns = Object.keys(data[0]);
    const missingColumns = requiredColumns.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      throw new ValidationError(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // Get all students for validation
    const students = await query(
      'SELECT id, registration_number FROM students WHERE institution_id = ?',
      [parseInt(institutionId)]
    );
    const studentMap = new Map(students.map(s => [s.registration_number.toUpperCase(), s.id]));

    const results = { created: 0, updated: 0, errors: [] };

    await transaction(async (conn) => {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2; // Excel row number (1-indexed + header)

        try {
          const regNumber = String(row.registration_number).toUpperCase().trim();
          const studentId = studentMap.get(regNumber);

          if (!studentId) {
            results.errors.push({ row: rowNum, error: `Student not found: ${regNumber}` });
            continue;
          }

          const totalScore = parseFloat(row.total_score);
          if (isNaN(totalScore) || totalScore < 0 || totalScore > 100) {
            results.errors.push({ row: rowNum, error: `Invalid score: ${row.total_score}` });
            continue;
          }

          // Build score breakdown from additional columns
          const scoreBreakdown = {};
          for (const [key, value] of Object.entries(row)) {
            if (!requiredColumns.includes(key) && value !== undefined && value !== '') {
              scoreBreakdown[key] = value;
            }
          }

          // Check if result exists
          const [existing] = await conn.execute(
            `SELECT id FROM student_results 
             WHERE student_id = ? AND session_id = ? AND institution_id = ?`,
            [studentId, session_id, parseInt(institutionId)]
          );

          if (existing.length > 0) {
            // Update
            await conn.execute(
              `UPDATE student_results 
               SET total_score = ?, score_breakdown = ?, updated_at = NOW()
               WHERE id = ?`,
              [totalScore, JSON.stringify(scoreBreakdown), existing[0].id]
            );
            results.updated++;
          } else {
            // Create
            await conn.execute(
              `INSERT INTO student_results 
               (institution_id, session_id, student_id, scoring_type, total_score, score_breakdown)
               VALUES (?, ?, ?, 'basic', ?, ?)`,
              [parseInt(institutionId), session_id, studentId, totalScore, JSON.stringify(scoreBreakdown)]
            );
            results.created++;
          }
        } catch (err) {
          results.errors.push({ row: rowNum, error: err.message });
        }
      }
    });

    res.json({
      success: true,
      message: `Processed ${data.length} rows: ${results.created} created, ${results.updated} updated`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download template for results upload
 * GET /:institutionId/results/template
 */
const downloadTemplate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    // Get students for this session (from acceptances)
    let students = [];
    if (session_id) {
      students = await query(
        `SELECT st.registration_number, st.full_name, ms.name as school_name
         FROM student_acceptances sa
         JOIN students st ON sa.student_id = st.id
         LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
         LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
         WHERE sa.session_id = ? AND sa.institution_id = ? AND sa.status = 'approved'
         ORDER BY st.registration_number`,
        [parseInt(session_id), parseInt(institutionId)]
      );
    } else {
      students = await query(
        `SELECT registration_number, full_name, '' as school_name
         FROM students WHERE institution_id = ?
         ORDER BY registration_number`,
        [parseInt(institutionId)]
      );
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Template data with headers and sample rows
    const templateData = students.map(s => ({
      registration_number: s.registration_number,
      full_name: s.full_name,
      school_name: s.school_name || '',
      total_score: '',
      lesson_delivery: '',
      classroom_management: '',
      communication: '',
      professionalism: '',
      comments: '',
    }));

    // If no students, add sample row
    if (templateData.length === 0) {
      templateData.push({
        registration_number: 'SAMPLE001',
        full_name: 'Sample Student',
        school_name: 'Sample School',
        total_score: 85,
        lesson_delivery: 20,
        classroom_management: 18,
        communication: 22,
        professionalism: 25,
        comments: 'Good performance',
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=results_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export results to Excel
 * GET /:institutionId/results/export
 */
const exportResults = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, program_id } = req.query;

    let sql = `
      SELECT sr.id, st.registration_number, st.full_name as student_name,
             p.name as program_name, ms.name as school_name,
             sup.name as supervisor_name,
             sr.visit_number, sr.scoring_type, sr.total_score,
             sr.score_breakdown, sr.created_at
      FROM student_results sr
      LEFT JOIN students st ON sr.student_id = st.id
      LEFT JOIN users sup ON sr.supervisor_id = sup.id
      LEFT JOIN institution_schools isv ON sr.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN programs p ON st.program_id = p.id
      WHERE sr.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sr.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND sr.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (program_id) {
      sql += ' AND st.program_id = ?';
      params.push(parseInt(program_id));
    }

    sql += ' ORDER BY st.registration_number, sr.visit_number';

    const results = await query(sql, params);

    // Flatten score_breakdown for export
    const exportData = results.map(r => {
      let breakdown = {};
      if (r.score_breakdown) {
        try {
          breakdown = typeof r.score_breakdown === 'string' 
            ? JSON.parse(r.score_breakdown) 
            : r.score_breakdown;
        } catch (e) {
          breakdown = {};
        }
      }

      return {
        registration_number: r.registration_number,
        student_name: r.student_name,
        program: r.program_name || '',
        school: r.school_name || '',
        supervisor: r.supervisor_name || '',
        visit_number: r.visit_number || '',
        scoring_type: r.scoring_type,
        total_score: r.total_score,
        ...breakdown,
        date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
      };
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=results_export.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Get results statistics
 * GET /:institutionId/results/stats
 */
const getStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sessionFilter = '';
    const params = [parseInt(institutionId)];
    
    if (session_id) {
      sessionFilter = ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    // Overall statistics
    const [stats] = await query(
      `SELECT 
         COUNT(*) as total_results,
         COUNT(DISTINCT student_id) as students_with_results,
         AVG(total_score) as average_score,
         MIN(total_score) as min_score,
         MAX(total_score) as max_score,
         SUM(CASE WHEN total_score >= 70 THEN 1 ELSE 0 END) as passed,
         SUM(CASE WHEN total_score < 70 THEN 1 ELSE 0 END) as failed
       FROM student_results
       WHERE institution_id = ?${sessionFilter}`,
      params
    );

    // Score distribution
    const distribution = await query(
      `SELECT 
         CASE 
           WHEN total_score >= 90 THEN 'A (90-100)'
           WHEN total_score >= 80 THEN 'B (80-89)'
           WHEN total_score >= 70 THEN 'C (70-79)'
           WHEN total_score >= 60 THEN 'D (60-69)'
           WHEN total_score >= 50 THEN 'E (50-59)'
           ELSE 'F (0-49)'
         END as grade,
         COUNT(*) as count
       FROM student_results
       WHERE institution_id = ?${sessionFilter}
       GROUP BY grade
       ORDER BY MIN(total_score) DESC`,
      params
    );

    // By school
    const bySchool = await query(
      `SELECT ms.name as school_name, 
              COUNT(*) as result_count,
              AVG(sr.total_score) as average_score
       FROM student_results sr
       LEFT JOIN institution_schools isv ON sr.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sr.institution_id = ?${sessionFilter}
       GROUP BY sr.institution_school_id
       ORDER BY average_score DESC`,
      params
    );

    res.json({
      success: true,
      data: {
        summary: {
          total_results: stats.total_results || 0,
          students_with_results: stats.students_with_results || 0,
          average_score: stats.average_score ? parseFloat(stats.average_score).toFixed(2) : 0,
          min_score: stats.min_score || 0,
          max_score: stats.max_score || 0,
          passed: stats.passed || 0,
          failed: stats.failed || 0,
          pass_rate: stats.total_results > 0 
            ? ((stats.passed / stats.total_results) * 100).toFixed(1) + '%'
            : '0%',
        },
        distribution,
        by_school: bySchool,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get students with results for admin view
 * GET /:institutionId/results/admin-students
 */
const getAdminStudentsWithResults = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, search, page = 1, limit = 50 } = req.query;

    if (!session_id) {
      return res.json({
        success: true,
        data: {
          data: [],
          pagination: { total: 0, page: 1, limit: parseInt(limit), pages: 0 },
          maxVisits: 3,
        },
      });
    }

    // Get max visits from session settings
    const [sessionData] = await query(
      'SELECT max_supervision_visits FROM academic_sessions WHERE id = ? AND institution_id = ?',
      [parseInt(session_id), parseInt(institutionId)]
    );
    const maxVisits = sessionData?.max_supervision_visits || 3;

    // Build base query for students with acceptances
    let sql = `
      SELECT DISTINCT
        st.id as student_id, st.registration_number, st.full_name as student_name,
        isv.id as school_id, ms.name as school_name, ms.official_code as school_code,
        sa.group_number,
        p.name as program_name
      FROM students st
      INNER JOIN student_acceptances sa ON st.id = sa.student_id AND sa.status = 'approved'
      LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN programs p ON st.program_id = p.id
      WHERE st.institution_id = ? AND sa.session_id = ?
    `;
    const params = [parseInt(institutionId), parseInt(session_id)];

    if (school_id && school_id !== 'all') {
      sql += ' AND sa.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (search) {
      sql += ' AND (st.full_name LIKE ? OR st.registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count query
    const countSql = sql.replace(/SELECT DISTINCT[\s\S]*FROM students st/i, 'SELECT COUNT(DISTINCT st.id) as total FROM students st');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add pagination
    sql += ' ORDER BY st.full_name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const students = await query(sql, params);

    // Get results for all students
    if (students.length > 0) {
      const studentIds = students.map(s => s.student_id);
      const results = await query(
        `SELECT student_id, visit_number, total_score, score_breakdown, supervisor_id,
                sup.name as supervisor_name
         FROM student_results sr
         LEFT JOIN users sup ON sr.supervisor_id = sup.id
         WHERE sr.institution_id = ? AND sr.session_id = ? AND sr.student_id IN (${studentIds.map(() => '?').join(',')})`,
        [parseInt(institutionId), parseInt(session_id), ...studentIds]
      );

      // Merge results into students
      students.forEach(student => {
        for (let v = 1; v <= maxVisits; v++) {
          const result = results.find(r => r.student_id === student.student_id && r.visit_number === v);
          if (result) {
            // Parse score_breakdown if it's a string
            let scoreBreakdown = result.score_breakdown;
            if (typeof scoreBreakdown === 'string') {
              try {
                scoreBreakdown = JSON.parse(scoreBreakdown);
              } catch (e) {
                scoreBreakdown = null;
              }
            }
            student[`visit_${v}`] = {
              has_result: true,
              total_score: result.total_score,
              score_breakdown: scoreBreakdown,
              supervisor_name: result.supervisor_name,
            };
          } else {
            student[`visit_${v}`] = { has_result: false };
          }
        }
      });
    }

    res.json({
      success: true,
      data: {
        data: students,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        maxVisits,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get scoring criteria
 * GET /:institutionId/results/scoring-criteria
 */
const getScoringCriteria = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const criteria = await query(
      `SELECT * FROM scoring_criteria 
       WHERE institution_id = ? 
       ORDER BY order_index, name`,
      [parseInt(institutionId)]
    );

    // Calculate total max score from active criteria
    const activeCriteria = criteria.filter(c => c.is_active);
    const totalMaxScore = activeCriteria.reduce((sum, c) => sum + (parseFloat(c.max_score) || 0), 0);

    res.json({
      success: true,
      data: criteria,
      totalMaxScore,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create scoring criteria
 * POST /:institutionId/results/scoring-criteria
 */
const createCriteria = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { name, label, description, max_score, order_index, is_active = true } = req.body;

    if (!name || !label) {
      throw new ValidationError('Name and label are required');
    }

    const result = await query(
      `INSERT INTO scoring_criteria 
       (institution_id, name, label, description, max_score, order_index, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [parseInt(institutionId), name, label, description || null, max_score || 20, order_index || 0, is_active ? 1 : 0]
    );

    const created = await query('SELECT * FROM scoring_criteria WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Criteria created successfully',
      data: created[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update scoring criteria
 * PUT /:institutionId/results/scoring-criteria/:id
 */
const updateCriteria = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { name, label, description, max_score, order_index, is_active } = req.body;

    // Verify criteria exists and belongs to institution
    const existing = await query(
      'SELECT id FROM scoring_criteria WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );
    if (existing.length === 0) {
      throw new NotFoundError('Criteria not found');
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (label !== undefined) { updates.push('label = ?'); params.push(label); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (max_score !== undefined) { updates.push('max_score = ?'); params.push(max_score); }
    if (order_index !== undefined) { updates.push('order_index = ?'); params.push(order_index); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE scoring_criteria SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    const updated = await query('SELECT * FROM scoring_criteria WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: 'Criteria updated successfully',
      data: updated[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete scoring criteria
 * DELETE /:institutionId/results/scoring-criteria/:id
 */
const deleteCriteria = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const result = await query(
      'DELETE FROM scoring_criteria WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('Criteria not found');
    }

    res.json({
      success: true,
      message: 'Criteria deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initialize default scoring criteria for an institution
 * POST /:institutionId/results/scoring-criteria/initialize
 */
const initializeDefaultCriteria = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Check if criteria already exist
    const existing = await query(
      'SELECT COUNT(*) as count FROM scoring_criteria WHERE institution_id = ?',
      [parseInt(institutionId)]
    );

    if (existing[0].count > 0) {
      throw new ConflictError('Scoring criteria already exist for this institution. Delete existing criteria first.');
    }

    // Default TP evaluation criteria
    const defaultCriteria = [
      { name: 'lesson_plan', label: 'Lesson Plan Preparation', max_score: 15, order_index: 1 },
      { name: 'introduction', label: 'Lesson Introduction', max_score: 10, order_index: 2 },
      { name: 'content_knowledge', label: 'Subject Matter Knowledge', max_score: 15, order_index: 3 },
      { name: 'teaching_methods', label: 'Teaching Methods/Strategies', max_score: 15, order_index: 4 },
      { name: 'communication', label: 'Communication Skills', max_score: 10, order_index: 5 },
      { name: 'class_management', label: 'Classroom Management', max_score: 10, order_index: 6 },
      { name: 'student_engagement', label: 'Student Engagement', max_score: 10, order_index: 7 },
      { name: 'evaluation', label: 'Lesson Evaluation/Closure', max_score: 10, order_index: 8 },
      { name: 'professionalism', label: 'Professional Conduct', max_score: 5, order_index: 9 },
    ];

    for (const criteria of defaultCriteria) {
      await query(
        `INSERT INTO scoring_criteria (institution_id, name, label, max_score, order_index, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [parseInt(institutionId), criteria.name, criteria.label, criteria.max_score, criteria.order_index]
      );
    }

    const created = await query(
      'SELECT * FROM scoring_criteria WHERE institution_id = ? ORDER BY order_index',
      [parseInt(institutionId)]
    );

    res.status(201).json({
      success: true,
      message: 'Default criteria initialized successfully',
      data: created,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin bulk submit results
 * POST /:institutionId/results/admin-bulk-submit
 * Allows admin to submit/update results for multiple students across visits
 */
const adminBulkSubmitResults = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, changes } = req.body;

    if (!session_id || !Array.isArray(changes) || changes.length === 0) {
      throw new ValidationError('Session ID and changes array are required');
    }

    const successful = [];
    const failed = [];

    for (const change of changes) {
      try {
        const { student_id, visit_number, total_score, scoring_type, score_breakdown } = change;

        if (!student_id || !visit_number) {
          failed.push({ student_id, visit_number, reason: 'Missing student_id or visit_number' });
          continue;
        }

        // Get student's school and group info from student_acceptances
        const students = await query(
          `SELECT s.id, sa.institution_school_id as school_id, sa.group_number
           FROM students s
           INNER JOIN student_acceptances sa ON s.id = sa.student_id AND sa.session_id = ? AND sa.status = 'approved'
           WHERE s.id = ? AND s.institution_id = ?`,
          [session_id, student_id, parseInt(institutionId)]
        );

        if (students.length === 0) {
          failed.push({ student_id, visit_number, reason: 'Student not found or no approved acceptance' });
          continue;
        }

        const student = students[0];
        const scoreBreakdownJson = score_breakdown ? JSON.stringify(score_breakdown) : null;

        // Upsert the result
        await query(
          `INSERT INTO student_results 
           (institution_id, session_id, student_id, supervisor_id, institution_school_id, group_number, visit_number, scoring_type, total_score, score_breakdown)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             scoring_type = VALUES(scoring_type),
             total_score = VALUES(total_score),
             score_breakdown = VALUES(score_breakdown),
             updated_at = CURRENT_TIMESTAMP`,
          [
            parseInt(institutionId),
            session_id,
            student_id,
            req.user.id, // Admin as supervisor
            student.school_id,
            student.group_number || 1,
            visit_number,
            scoring_type || 'basic',
            total_score,
            scoreBreakdownJson,
          ]
        );

        successful.push({ student_id, visit_number });
      } catch (err) {
        failed.push({ student_id: change.student_id, visit_number: change.visit_number, reason: err.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${successful.length} results, ${failed.length} failed`,
      data: { successful, failed },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervisor's assigned groups for the current session
 * Returns unique combinations of (school_id, group_number, visit_number)
 * GET /:institutionId/results/assigned-groups
 */
const getAssignedGroups = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const supervisorId = req.user.id;

    // Get current active session
    const sessions = await query(
      `SELECT * FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 AND status = 'active' 
       LIMIT 1`,
      [parseInt(institutionId)]
    );

    if (!sessions.length) {
      return res.json({
        success: true,
        data: {
          session: null,
          has_postings: false,
          data: [],
        },
      });
    }

    const session = sessions[0];

    // Get supervisor's postings for this session
    const postings = await query(
      `SELECT 
         sp.id as posting_id,
         sp.institution_school_id as school_id,
         sp.group_number,
         sp.visit_number,
         ms.name as school_name,
         ms.official_code as school_code,
         r.name as route_name,
         (SELECT COUNT(*) FROM student_acceptances sa 
          WHERE sa.institution_school_id = sp.institution_school_id 
          AND sa.session_id = sp.session_id 
          AND sa.group_number = sp.group_number
          AND sa.status = 'approved') as student_count
       FROM supervisor_postings sp
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sp.institution_id = ? 
         AND sp.session_id = ?
         AND sp.supervisor_id = ?
         AND sp.status = 'active'
       ORDER BY ms.name, sp.group_number, sp.visit_number`,
      [parseInt(institutionId), session.id, supervisorId]
    );

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
          scoring_type: session.scoring_type || 'basic',
          max_supervision_visits: session.max_supervision_visits || 3,
        },
        has_postings: postings.length > 0,
        data: postings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get students for scoring in a specific school/group/visit
 * GET /:institutionId/results/students-for-scoring
 */
const getStudentsForScoring = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { school_id, group_number, visit_number } = req.query;
    const supervisorId = req.user.id;

    if (!school_id || !group_number || !visit_number) {
      throw new ValidationError('school_id, group_number, and visit_number are required');
    }

    // Get current session
    const sessions = await query(
      `SELECT * FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 AND status = 'active' 
       LIMIT 1`,
      [parseInt(institutionId)]
    );

    if (!sessions.length) {
      throw new NotFoundError('No active session found');
    }

    const session = sessions[0];

    // Get students accepted at this school with approved status
    const students = await query(
      `SELECT 
         sa.student_id,
         sa.group_number,
         s.registration_number,
         s.full_name as student_name,
         p.name as program_name
       FROM student_acceptances sa
       JOIN students s ON sa.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE sa.institution_id = ?
         AND sa.session_id = ?
         AND sa.institution_school_id = ?
         AND sa.group_number = ?
         AND sa.status = 'approved'
       ORDER BY s.full_name`,
      [parseInt(institutionId), session.id, parseInt(school_id), parseInt(group_number)]
    );

    if (!students.length) {
      return res.json({
        success: true,
        data: [],
        message: 'No approved students found for this group',
      });
    }

    // Get existing results for these students for this visit
    const studentIds = students.map(s => s.student_id);
    const existingResults = await query(
      `SELECT sr.*, u.name as supervisor_name
       FROM student_results sr
       LEFT JOIN users u ON sr.supervisor_id = u.id
       WHERE sr.institution_id = ?
         AND sr.session_id = ?
         AND sr.institution_school_id = ?
         AND sr.group_number = ?
         AND sr.visit_number = ?
         AND sr.student_id IN (?)`,
      [parseInt(institutionId), session.id, parseInt(school_id), parseInt(group_number), parseInt(visit_number), studentIds]
    );

    // Map results by student_id
    const resultsMap = new Map(existingResults.map(r => [r.student_id, r]));

    // Combine student data with result data
    const studentsForScoring = students.map(student => {
      const existingResult = resultsMap.get(student.student_id);
      return {
        student_id: student.student_id,
        registration_number: student.registration_number,
        student_name: student.student_name,
        program_name: student.program_name,
        group_number: student.group_number,
        // Existing result data (if any)
        result_id: existingResult?.id || null,
        has_result: !!existingResult,
        scoring_type: existingResult?.scoring_type || null,
        total_score: existingResult?.total_score || null,
        score_breakdown: existingResult?.score_breakdown ? JSON.parse(existingResult.score_breakdown) : null,
        result_supervisor_id: existingResult?.supervisor_id || null,
        result_supervisor_name: existingResult?.supervisor_name || null,
        can_edit: existingResult ? existingResult.supervisor_id === supervisorId : true,
      };
    });

    res.json({
      success: true,
      data: studentsForScoring,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit bulk results (supervisor endpoint)
 * POST /:institutionId/results/bulk-submit
 */
const submitBulkResults = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { results } = req.body;
    const supervisorId = req.user.id;
    const userRole = req.user.role;

    if (!Array.isArray(results) || results.length === 0) {
      throw new ValidationError('Results array is required and cannot be empty');
    }

    // ADMIN BYPASS: head_of_teaching_practice and super_admin can manage results without location restrictions
    const isAdmin = ['super_admin', 'head_of_teaching_practice'].includes(userRole);

    // Check if location tracking is enabled for this institution
    const [featureToggle] = await query(
      `SELECT ift.is_enabled 
       FROM feature_toggles ft
       LEFT JOIN institution_feature_toggles ift 
         ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
       WHERE ft.feature_key = 'supervisor_location_tracking'`,
      [parseInt(institutionId)]
    );

    const locationTrackingEnabled = featureToggle?.is_enabled === 1;

    // Only enforce location verification for supervisors, not admins
    if (locationTrackingEnabled && !isAdmin) {
      // Get unique postings from results
      const uniquePostings = [
        ...new Set(results.map((r) => `${r.school_id}-${r.group_number}-${r.visit_number}`)),
      ];

      for (const postingKey of uniquePostings) {
        const [schoolId, groupNumber, visitNumber] = postingKey.split('-').map(Number);

        // Check if supervisor has verified location for this posting
        const [posting] = await query(
          `SELECT sp.id, sp.location_verified, ms.name as school_name
           FROM supervisor_postings sp
           JOIN institution_schools isv ON sp.institution_school_id = isv.id
           JOIN master_schools ms ON isv.master_school_id = ms.id
           WHERE sp.institution_id = ?
             AND sp.supervisor_id = ?
             AND sp.institution_school_id = ?
             AND sp.group_number = ?
             AND sp.visit_number = ?
             AND sp.status = 'active'`,
          [parseInt(institutionId), supervisorId, schoolId, groupNumber, visitNumber]
        );

        if (posting && !posting.location_verified) {
          throw new ValidationError(
            `You must verify your location at "${posting.school_name}" (Group ${groupNumber}, Visit ${visitNumber}) before uploading results. Please record your location first.`
          );
        }
      }
    }

    // Get current session
    const sessions = await query(
      `SELECT * FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 AND status = 'active' 
       LIMIT 1`,
      [parseInt(institutionId)]
    );

    if (!sessions.length) {
      throw new NotFoundError('No active session found');
    }

    const session = sessions[0];

    if (session.status === 'locked') {
      throw new ValidationError('Session is locked - no result submissions allowed');
    }

    const successful = [];
    const failed = [];

    for (const result of results) {
      try {
        const {
          student_id,
          school_id,
          group_number,
          visit_number,
          scoring_type = 'basic',
          total_score,
          score_breakdown,
        } = result;

        // Validate required fields
        if (!student_id || !school_id || !group_number || !visit_number || total_score === undefined) {
          throw new Error('Missing required fields');
        }

        // Calculate total score for advanced scoring
        let finalTotalScore = total_score;
        if (scoring_type === 'advanced' && score_breakdown) {
          finalTotalScore = Object.values(score_breakdown).reduce((sum, score) => sum + (parseFloat(score) || 0), 0);
        }

        // Validate score range
        if (finalTotalScore < 0 || finalTotalScore > 100) {
          throw new Error('Total score must be between 0 and 100');
        }

        // Check if result already exists for this student/visit
        const existing = await query(
          `SELECT id FROM student_results 
           WHERE student_id = ? AND session_id = ? AND visit_number = ?`,
          [student_id, session.id, visit_number]
        );

        if (existing.length > 0) {
          // Update existing
          await query(
            `UPDATE student_results SET 
              supervisor_id = ?, 
              scoring_type = ?, 
              total_score = ?, 
              score_breakdown = ?,
              updated_at = NOW()
             WHERE id = ?`,
            [
              supervisorId,
              scoring_type,
              finalTotalScore,
              score_breakdown ? JSON.stringify(score_breakdown) : null,
              existing[0].id,
            ]
          );
          successful.push({ student_id, result_id: existing[0].id, action: 'updated' });
        } else {
          // Insert new
          const insertResult = await query(
            `INSERT INTO student_results 
              (institution_id, session_id, student_id, supervisor_id, institution_school_id, 
               group_number, visit_number, scoring_type, total_score, score_breakdown)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              parseInt(institutionId),
              session.id,
              student_id,
              supervisorId,
              school_id,
              group_number,
              visit_number,
              scoring_type,
              finalTotalScore,
              score_breakdown ? JSON.stringify(score_breakdown) : null,
            ]
          );
          successful.push({ student_id, result_id: insertResult.insertId, action: 'created' });
        }
      } catch (error) {
        failed.push({
          student_id: result.student_id,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${successful.length} results, ${failed.length} failed`,
      data: { successful, failed },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export results as Excel
 * GET /:institutionId/results/export/excel
 */
const exportExcel = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const results = await query(
      `SELECT 
         s.registration_number,
         s.full_name as student_name,
         p.name as program_name,
         ms.name as school_name,
         sr.visit_number,
         sr.total_score,
         sr.scoring_type,
         u.name as supervisor_name
       FROM student_results sr
       JOIN students s ON sr.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN institution_schools isv ON sr.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN users u ON sr.supervisor_id = u.id
       WHERE sr.institution_id = ? AND sr.session_id = ?
       ORDER BY s.full_name, sr.visit_number`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(results);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=results_session_${session_id}.xlsx`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export results as PDF
 * GET /:institutionId/results/export/pdf
 */
const exportPDF = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // For now, return Excel format as PDF generation requires additional libraries
    // In production, use a library like pdfkit or puppeteer
    const results = await query(
      `SELECT 
         s.registration_number,
         s.full_name as student_name,
         p.name as program_name,
         ms.name as school_name,
         sr.visit_number,
         sr.total_score,
         sr.scoring_type
       FROM student_results sr
       JOIN students s ON sr.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN institution_schools isv ON sr.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sr.institution_id = ? AND sr.session_id = ?
       ORDER BY s.full_name, sr.visit_number`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    // Return as JSON with CSV-like format for now
    // TODO: Implement proper PDF generation
    res.json({
      success: true,
      message: 'PDF export not yet implemented. Use Excel export.',
      data: results,
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
  uploadResults,
  downloadTemplate,
  exportResults,
  getStats,
  getAdminStudentsWithResults,
  getScoringCriteria,
  createCriteria,
  updateCriteria,
  deleteCriteria,
  initializeDefaultCriteria,
  adminBulkSubmitResults,
  exportExcel,
  exportPDF,
  // Supervisor result upload methods
  getAssignedGroups,
  getStudentsForScoring,
  submitBulkResults,
};
