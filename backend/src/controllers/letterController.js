/**
 * Letter Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles document template management and letter generation
 */

const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      document_type: z.enum(['posting_letter', 'acceptance_form', 'supervision_report', 'allowance_voucher', 'custom']),
      name: z.string().min(3, 'Name must be at least 3 characters'),
      description: z.string().optional().nullable(),
      content: z.string().min(10, 'Content must be at least 10 characters'),
      session_id: z.number().int().positive().optional().nullable(),
      is_default: z.boolean().default(false),
      format: z.enum(['html', 'pdf', 'docx']).default('html'),
      paper_size: z.enum(['A4', 'Letter', 'Legal']).default('A4'),
      orientation: z.enum(['portrait', 'landscape']).default('portrait'),
      margins: z.object({
        top: z.number().optional(),
        bottom: z.number().optional(),
        left: z.number().optional(),
        right: z.number().optional(),
      }).optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(3).optional(),
      description: z.string().optional().nullable(),
      content: z.string().min(10).optional(),
      is_default: z.boolean().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      format: z.enum(['html', 'pdf', 'docx']).optional(),
      paper_size: z.enum(['A4', 'Letter', 'Legal']).optional(),
      orientation: z.enum(['portrait', 'landscape']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  generate: z.object({
    body: z.object({
      template_id: z.number().int().positive('Template ID is required'),
      student_ids: z.array(z.number().int().positive()).min(1, 'At least one student ID is required'),
      session_id: z.number().int().positive().optional(),
    }),
  }),
};

/**
 * Get all letter templates
 * GET /:institutionId/letters
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { document_type, session_id, status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT dt.*, 
             sess.name as session_name,
             u.name as created_by_name,
             pub.name as published_by_name
      FROM document_templates dt
      LEFT JOIN academic_sessions sess ON dt.session_id = sess.id
      LEFT JOIN users u ON dt.created_by = u.id
      LEFT JOIN users pub ON dt.published_by = pub.id
      WHERE dt.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (document_type) {
      sql += ' AND dt.document_type = ?';
      params.push(document_type);
    }
    if (session_id) {
      sql += ' AND dt.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (status) {
      sql += ' AND dt.status = ?';
      params.push(status);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY dt.is_default DESC, dt.updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const templates = await query(sql, params);

    res.json({
      success: true,
      data: templates,
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
 * Get letter template by ID
 * GET /:institutionId/letters/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const templates = await query(
      `SELECT dt.*, 
              sess.name as session_name,
              u.name as created_by_name,
              pub.name as published_by_name
       FROM document_templates dt
       LEFT JOIN academic_sessions sess ON dt.session_id = sess.id
       LEFT JOIN users u ON dt.created_by = u.id
       LEFT JOIN users pub ON dt.published_by = pub.id
       WHERE dt.id = ? AND dt.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (templates.length === 0) {
      throw new NotFoundError('Letter template not found');
    }

    // Get placeholders used in this template
    const placeholders = await query(
      `SELECT dp.* 
       FROM document_placeholders dp
       WHERE dp.placeholder_key IN (
         SELECT DISTINCT SUBSTRING(
           content, 
           LOCATE('{{', content) + 2, 
           LOCATE('}}', content) - LOCATE('{{', content) - 2
         ) 
         FROM document_templates 
         WHERE id = ?
       )`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      data: {
        ...templates[0],
        placeholders,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create letter template
 * POST /:institutionId/letters
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      document_type, name, description, content, session_id, 
      is_default, format, paper_size, orientation, margins 
    } = req.body;

    // Verify session if provided
    if (session_id) {
      const sessions = await query(
        'SELECT id FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [session_id, parseInt(institutionId)]
      );
      if (sessions.length === 0) {
        throw new ValidationError('Invalid session ID');
      }
    }

    // If setting as default, unset other defaults for this document type
    if (is_default) {
      await query(
        'UPDATE document_templates SET is_default = 0 WHERE institution_id = ? AND document_type = ?',
        [parseInt(institutionId), document_type]
      );
    }

    const result = await query(
      `INSERT INTO document_templates 
       (institution_id, session_id, document_type, name, description, content, 
        is_default, format, paper_size, orientation, margins, status, created_by, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 1)`,
      [parseInt(institutionId), session_id || null, document_type, name, 
       description || null, content, is_default ? 1 : 0, format || 'html',
       paper_size || 'A4', orientation || 'portrait', 
       JSON.stringify(margins || { top: 20, bottom: 20, left: 20, right: 20 }),
       req.user.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'template_created', 'document_template', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ document_type, name }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Letter template created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update letter template
 * PUT /:institutionId/letters/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { name, description, content, is_default, status, format, paper_size, orientation } = req.body;

    // Check template exists
    const existing = await query(
      'SELECT id, document_type, version FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Letter template not found');
    }

    const template = existing[0];

    // If setting as default, unset other defaults
    if (is_default) {
      await query(
        'UPDATE document_templates SET is_default = 0 WHERE institution_id = ? AND document_type = ? AND id != ?',
        [parseInt(institutionId), template.document_type, parseInt(id)]
      );
    }

    // Build update
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
      // Increment version on content change
      updates.push('version = version + 1');
    }
    if (is_default !== undefined) {
      updates.push('is_default = ?');
      params.push(is_default ? 1 : 0);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      if (status === 'published') {
        updates.push('published_by = ?, published_at = NOW()');
        params.push(req.user.id);
      }
    }
    if (format !== undefined) {
      updates.push('format = ?');
      params.push(format);
    }
    if (paper_size !== undefined) {
      updates.push('paper_size = ?');
      params.push(paper_size);
    }
    if (orientation !== undefined) {
      updates.push('orientation = ?');
      params.push(orientation);
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE document_templates SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Letter template updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete letter template
 * DELETE /:institutionId/letters/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const existing = await query(
      'SELECT id, is_default FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Letter template not found');
    }

    if (existing[0].is_default) {
      throw new ValidationError('Cannot delete default template. Set another as default first.');
    }

    await query(
      'DELETE FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Letter template deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate letters for students
 * POST /:institutionId/letters/generate
 */
const generateLetter = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { template_id, student_ids, session_id } = req.body;

    // Get template
    const templates = await query(
      `SELECT * FROM document_templates WHERE id = ? AND institution_id = ? AND status = 'published'`,
      [template_id, parseInt(institutionId)]
    );

    if (templates.length === 0) {
      throw new NotFoundError('Published template not found');
    }

    const template = templates[0];

    // Get institution details
    const [institution] = await query(
      'SELECT * FROM institutions WHERE id = ?',
      [parseInt(institutionId)]
    );

    // Get session
    let session;
    if (session_id) {
      const sessions = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [session_id, parseInt(institutionId)]
      );
      session = sessions[0];
    }

    // Get students with their details
    const students = await query(
      `SELECT s.*, 
              p.name as program_name, p.code as program_code,
              ms.name as school_name, ms.address as school_address, ms.ward as school_ward, ms.lga as school_lga,
              sa.group_number, sa.status as acceptance_status
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN student_acceptances sa ON s.id = sa.student_id AND sa.session_id = ?
       LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE s.id IN (${student_ids.map(() => '?').join(',')}) 
         AND s.institution_id = ?`,
      [session_id || session?.id, ...student_ids, parseInt(institutionId)]
    );

    if (students.length === 0) {
      throw new NotFoundError('No students found');
    }

    // Generate letters
    const generatedLetters = students.map(student => {
      let content = template.content;

      // Replace placeholders
      const replacements = {
        '{{student_name}}': student.full_name || '',
        '{{student_full_name}}': student.full_name || '',
        '{{registration_number}}': student.registration_number || '',
        '{{program_name}}': student.program_name || '',
        '{{program_code}}': student.program_code || '',
        '{{school_name}}': student.school_name || '',
        '{{school_address}}': student.school_address || '',
        '{{school_ward}}': student.school_ward || '',
        '{{school_lga}}': student.school_lga || '',
        '{{group_number}}': student.group_number || '',
        '{{institution_name}}': institution?.name || '',
        '{{institution_code}}': institution?.code || '',
        '{{session_name}}': session?.name || '',
        '{{session_start_date}}': session?.start_date ? new Date(session.start_date).toLocaleDateString() : '',
        '{{session_end_date}}': session?.end_date ? new Date(session.end_date).toLocaleDateString() : '',
        '{{current_date}}': new Date().toLocaleDateString(),
        '{{current_year}}': new Date().getFullYear().toString(),
      };

      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(placeholder, 'g'), value);
      }

      return {
        student_id: student.id,
        student_name: student.full_name,
        registration_number: student.registration_number,
        content,
        generated_at: new Date().toISOString(),
      };
    });

    // Log render
    await query(
      `INSERT INTO document_render_logs (institution_id, template_id, student_id, rendered_by, render_count)
       VALUES ${generatedLetters.map(() => '(?, ?, ?, ?, 1)').join(',')}
       ON DUPLICATE KEY UPDATE render_count = render_count + 1, rendered_at = NOW()`,
      generatedLetters.flatMap(l => [parseInt(institutionId), template_id, l.student_id, req.user.id])
    );

    res.json({
      success: true,
      data: {
        template: {
          id: template.id,
          name: template.name,
          document_type: template.document_type,
        },
        letters: generatedLetters,
        count: generatedLetters.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download generated letter
 * GET /:institutionId/letters/:id/download/:studentId
 */
const downloadLetter = async (req, res, next) => {
  try {
    const { institutionId, id, studentId } = req.params;
    const { format = 'html' } = req.query;

    // Generate the letter first
    const result = await generateLetter(
      {
        params: { institutionId },
        body: { template_id: parseInt(id), student_ids: [parseInt(studentId)] },
        user: req.user,
      },
      { json: (data) => data },
      next
    );

    if (!result.success || !result.data.letters.length) {
      throw new NotFoundError('Could not generate letter');
    }

    const letter = result.data.letters[0];

    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${letter.registration_number}_letter.html"`);
      res.send(letter.content);
    } else {
      // For PDF, would need a PDF generator like puppeteer or pdfkit
      throw new ValidationError('PDF format not yet implemented');
    }
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
  generateLetter,
  downloadLetter,
};
