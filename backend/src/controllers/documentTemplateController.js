/**
 * Document Template Controller (MedeePay Pattern)
 * 
 * Handles document templates with direct SQL and institutionId from route params.
 * Supports CRUD, versioning, placeholders, preview, and document generation.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  create: z.object({
    body: z.object({
      document_type: z.enum([
        'introduction_letter', 'acceptance_form', 'posting_letter',
        'supervisor_invitation_letter', 'completion_certificate'
      ]),
      name: z.string().min(2, 'Name must be at least 2 characters').max(255),
      description: z.string().max(1000).optional().nullable(),
      content: z.string().min(1, 'Content is required'),
      css_styles: z.string().optional().nullable(),
      header_content: z.string().optional().nullable(),
      footer_content: z.string().optional().nullable(),
      page_size: z.enum(['A4', 'LETTER', 'LEGAL']).default('A4'),
      page_orientation: z.enum(['portrait', 'landscape']).default('portrait'),
      page_margins: z.object({
        top: z.number().min(0).max(100).default(40),
        bottom: z.number().min(0).max(100).default(40),
        left: z.number().min(0).max(100).default(40),
        right: z.number().min(0).max(100).default(40),
      }).optional(),
      applicable_institution_types: z.array(z.string()).optional().nullable(),
      applicable_program_ids: z.array(z.number()).optional().nullable(),
      is_session_specific: z.boolean().default(false),
      session_id: z.number().int().positive().optional().nullable(),
      is_default: z.boolean().default(false),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(1000).optional().nullable(),
      content: z.string().min(1).optional(),
      css_styles: z.string().optional().nullable(),
      header_content: z.string().optional().nullable(),
      footer_content: z.string().optional().nullable(),
      page_size: z.enum(['A4', 'LETTER', 'LEGAL']).optional(),
      page_orientation: z.enum(['portrait', 'landscape']).optional(),
      page_margins: z.object({
        top: z.number().min(0).max(100),
        bottom: z.number().min(0).max(100),
        left: z.number().min(0).max(100),
        right: z.number().min(0).max(100),
      }).optional(),
      applicable_institution_types: z.array(z.string()).optional().nullable(),
      applicable_program_ids: z.array(z.number()).optional().nullable(),
      is_session_specific: z.boolean().optional(),
      session_id: z.number().int().positive().optional().nullable(),
      is_default: z.boolean().optional(),
      change_summary: z.string().max(500).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

// ============================================================================
// PLACEHOLDER REGISTRY (loaded from database)
// ============================================================================

// Cache for placeholders loaded from database
let placeholdersCache = null;
let placeholdersCacheTime = null;
const PLACEHOLDER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load placeholders from database
 * Returns { category: [{ key, display, sample }], ... }
 */
async function loadPlaceholdersFromDb() {
  // Check cache
  if (placeholdersCache && placeholdersCacheTime && (Date.now() - placeholdersCacheTime) < PLACEHOLDER_CACHE_TTL) {
    return placeholdersCache;
  }

  const rows = await query(
    `SELECT placeholder_key, display_name, category, sample_value, description
     FROM document_placeholders
     ORDER BY category, sort_order`
  );

  // Group by category
  const grouped = {};
  for (const row of rows) {
    const cat = row.category || 'other';
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push({
      key: row.placeholder_key,
      display: row.display_name,
      sample: row.sample_value || '',
      description: row.description || ''
    });
  }

  placeholdersCache = grouped;
  placeholdersCacheTime = Date.now();
  return grouped;
}

/**
 * Get all valid placeholder keys from database
 */
async function getValidPlaceholderKeys() {
  const rows = await query('SELECT placeholder_key FROM document_placeholders');
  return rows.map(r => r.placeholder_key);
}

/**
 * Get placeholder sample values map from database
 * Returns { placeholder_key: sample_value, ... }
 */
async function getPlaceholderSampleValues() {
  const rows = await query('SELECT placeholder_key, sample_value FROM document_placeholders');
  const map = {};
  for (const row of rows) {
    map[row.placeholder_key] = row.sample_value || '';
  }
  return map;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract placeholders from content
 */
function extractPlaceholders(content) {
  const regex = /\{([a-z_]+)(?::([a-z]+))?\}/gi;
  const matches = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    matches.push({
      key: match[1],
      format: match[2] || null,
      full: match[0],
    });
  }

  return matches;
}

/**
 * Validate placeholders in content (async - loads from database)
 */
async function validatePlaceholders(content, documentType) {
  const found = extractPlaceholders(content);
  const validKeys = await getValidPlaceholderKeys();

  const invalid = [];
  const valid = [];
  const warnings = [];

  for (const placeholder of found) {
    if (validKeys.includes(placeholder.key)) {
      valid.push(placeholder);
    } else {
      invalid.push(placeholder);
    }
  }

  return {
    valid: invalid.length === 0,
    found,
    validPlaceholders: valid,
    invalid,
    warnings,
  };
}

/**
 * Replace placeholders with sample data (async - loads from database)
 */
async function replacePlaceholdersWithSample(content) {
  let result = content;
  const sampleValues = await getPlaceholderSampleValues();

  for (const [key, sample] of Object.entries(sampleValues)) {
    const regex = new RegExp(`\\{${key}(?::[a-z]+)?\\}`, 'gi');
    result = result.replace(regex, sample);
  }

  return result;
}

/**
 * Format date based on format type
 */
function formatDate(date, format = 'long') {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const day = d.getDate();
  const suffix = ['th', 'st', 'nd', 'rd'][(day % 10 > 3 || [11, 12, 13].includes(day % 100)) ? 0 : day % 10];

  switch (format) {
    case 'short':
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    case 'long':
    default:
      return `${day}${suffix} ${months[d.getMonth()]}, ${d.getFullYear()}`;
  }
}

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Get all templates
 * GET /:institutionId/document-templates
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { document_type, status, session_id, is_default, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT dt.*, 
             u.name as created_by_name,
             sess.name as session_name
      FROM document_templates dt
      LEFT JOIN users u ON dt.created_by = u.id
      LEFT JOIN academic_sessions sess ON dt.session_id = sess.id
      WHERE dt.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (document_type) {
      sql += ' AND dt.document_type = ?';
      params.push(document_type);
    }
    if (status) {
      sql += ' AND dt.status = ?';
      params.push(status);
    }
    if (session_id) {
      sql += ' AND dt.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (is_default !== undefined) {
      sql += ' AND dt.is_default = ?';
      params.push(is_default === 'true' ? 1 : 0);
    }
    if (search) {
      sql += ' AND (dt.name LIKE ? OR dt.description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    sql += ' ORDER BY dt.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const templates = await query(sql, params);

    res.json({
      success: true,
      data: templates,
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
 * Get template by ID
 * GET /:institutionId/document-templates/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [template] = await query(
      `SELECT dt.*, 
              u.name as created_by_name,
              pub.name as published_by_name,
              sess.name as session_name
       FROM document_templates dt
       LEFT JOIN users u ON dt.created_by = u.id
       LEFT JOIN users pub ON dt.published_by = pub.id
       LEFT JOIN academic_sessions sess ON dt.session_id = sess.id
       WHERE dt.id = ? AND dt.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Parse JSON fields
    if (template.page_margins) {
      try {
        template.page_margins = JSON.parse(template.page_margins);
      } catch (e) {
        template.page_margins = { top: 40, bottom: 40, left: 40, right: 40 };
      }
    }

    if (template.applicable_institution_types) {
      try {
        template.applicable_institution_types = JSON.parse(template.applicable_institution_types);
      } catch (e) {
        template.applicable_institution_types = null;
      }
    }

    if (template.applicable_program_ids) {
      try {
        template.applicable_program_ids = JSON.parse(template.applicable_program_ids);
      } catch (e) {
        template.applicable_program_ids = null;
      }
    }

    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a template
 * POST /:institutionId/document-templates
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.create.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;

    // Validate placeholders in content
    const placeholderValidation = await validatePlaceholders(data.content, data.document_type);
    if (!placeholderValidation.valid) {
      throw new ValidationError('Invalid placeholders found in template', {
        invalid: placeholderValidation.invalid,
      });
    }

    // If is_default, unset other defaults for this document type
    if (data.is_default) {
      await query(
        `UPDATE document_templates SET is_default = 0 
         WHERE institution_id = ? AND document_type = ?`,
        [parseInt(institutionId), data.document_type]
      );
    }

    const result = await query(
      `INSERT INTO document_templates 
       (institution_id, document_type, name, description, content, css_styles,
        header_content, footer_content, page_size, page_orientation, page_margins,
        applicable_institution_types, applicable_program_ids, is_session_specific,
        session_id, is_default, status, version, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, NOW())`,
      [
        parseInt(institutionId),
        data.document_type,
        data.name,
        data.description || null,
        data.content,
        data.css_styles || null,
        data.header_content || null,
        data.footer_content || null,
        data.page_size || 'A4',
        data.page_orientation || 'portrait',
        data.page_margins ? JSON.stringify(data.page_margins) : null,
        data.applicable_institution_types ? JSON.stringify(data.applicable_institution_types) : null,
        data.applicable_program_ids ? JSON.stringify(data.applicable_program_ids) : null,
        data.is_session_specific ? 1 : 0,
        data.session_id || null,
        data.is_default ? 1 : 0,
        req.user.id,
      ]
    );

    const [newTemplate] = await query(
      'SELECT * FROM document_templates WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: newTemplate,
      warnings: placeholderValidation.warnings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a template
 * PUT /:institutionId/document-templates/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.update.safeParse({ body: req.body, params: req.params });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;

    // Check if template exists
    const [existing] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // Validate placeholders if content is being updated
    if (data.content) {
      const placeholderValidation = await validatePlaceholders(data.content, existing.document_type);
      if (!placeholderValidation.valid) {
        throw new ValidationError('Invalid placeholders found in template', {
          invalid: placeholderValidation.invalid,
        });
      }
    }

    // Save version history if content changed
    if (data.content && data.content !== existing.content) {
      // Check if this version is already archived (avoid duplicate entry error)
      const [existingVersion] = await query(
        'SELECT id FROM document_template_versions WHERE template_id = ? AND version = ?',
        [parseInt(id), existing.version]
      );

      // Only archive if this version hasn't been archived yet
      if (!existingVersion) {
        await query(
          `INSERT INTO document_template_versions 
           (template_id, version, content, css_styles, page_size, page_orientation, 
            page_margins, change_summary, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            parseInt(id),
            existing.version,
            existing.content,
            existing.css_styles,
            existing.page_size,
            existing.page_orientation,
            existing.page_margins,
            data.change_summary || 'Content updated',
            req.user.id,
          ]
        );
      }
    }

    // If setting as default, unset others
    if (data.is_default) {
      await query(
        `UPDATE document_templates SET is_default = 0 
         WHERE institution_id = ? AND document_type = ? AND id != ?`,
        [parseInt(institutionId), existing.document_type, parseInt(id)]
      );
    }

    // Build update query
    const updates = [];
    const params = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.content !== undefined) { 
      updates.push('content = ?'); 
      params.push(data.content);
      updates.push('version = version + 1');
    }
    if (data.css_styles !== undefined) { updates.push('css_styles = ?'); params.push(data.css_styles); }
    if (data.header_content !== undefined) { updates.push('header_content = ?'); params.push(data.header_content); }
    if (data.footer_content !== undefined) { updates.push('footer_content = ?'); params.push(data.footer_content); }
    if (data.page_size !== undefined) { updates.push('page_size = ?'); params.push(data.page_size); }
    if (data.page_orientation !== undefined) { updates.push('page_orientation = ?'); params.push(data.page_orientation); }
    if (data.page_margins !== undefined) { updates.push('page_margins = ?'); params.push(JSON.stringify(data.page_margins)); }
    if (data.applicable_institution_types !== undefined) { 
      updates.push('applicable_institution_types = ?'); 
      params.push(data.applicable_institution_types ? JSON.stringify(data.applicable_institution_types) : null); 
    }
    if (data.applicable_program_ids !== undefined) { 
      updates.push('applicable_program_ids = ?'); 
      params.push(data.applicable_program_ids ? JSON.stringify(data.applicable_program_ids) : null); 
    }
    if (data.is_session_specific !== undefined) { updates.push('is_session_specific = ?'); params.push(data.is_session_specific ? 1 : 0); }
    if (data.session_id !== undefined) { updates.push('session_id = ?'); params.push(data.session_id); }
    if (data.is_default !== undefined) { updates.push('is_default = ?'); params.push(data.is_default ? 1 : 0); }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE document_templates SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    const [updated] = await query(
      'SELECT * FROM document_templates WHERE id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Template updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a template
 * DELETE /:institutionId/document-templates/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [existing] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // Check if template is in use (published and default)
    if (existing.status === 'published' && existing.is_default) {
      throw new ValidationError('Cannot delete a published default template. Archive it instead.');
    }

    await query(
      'DELETE FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available placeholders
 * GET /:institutionId/document-templates/placeholders
 */
const getPlaceholders = async (req, res, next) => {
  try {
    const { document_type, category } = req.query;

    // Load from database
    const allPlaceholders = await loadPlaceholdersFromDb();

    let result = allPlaceholders;

    if (category) {
      result = { [category]: allPlaceholders[category] || [] };
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
 * Preview template with sample or raw data
 * GET /:institutionId/document-templates/:id/preview
 * Query params:
 *   - mode: 'raw' (show placeholders) or 'sample' (replace with sample data, default)
 */
const previewTemplate = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { mode = 'sample' } = req.query;

    const [template] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Get institution data for letterhead
    const [institution] = await query(
      'SELECT id, name, code, institution_type, logo_url, address, state, email, phone, primary_color, secondary_color, tp_unit_name FROM institutions WHERE id = ?',
      [parseInt(institutionId)]
    );

    // Get current session for header (include coordinator info for footer)
    const [session] = await query(
      `SELECT id, name, code, coordinator_name, coordinator_phone, coordinator_email, 
              tp_start_date, tp_end_date, tp_duration_weeks 
       FROM academic_sessions WHERE institution_id = ? AND is_current = 1`,
      [parseInt(institutionId)]
    );

    let renderedContent, renderedHeader, renderedFooter;

    if (mode === 'raw') {
      // Raw mode: show placeholders as-is (highlight them for visibility)
      renderedContent = template.content;
      renderedHeader = template.header_content || null;
      renderedFooter = template.footer_content || null;
    } else {
      // Sample mode: replace placeholders with sample data
      renderedContent = await replacePlaceholdersWithSample(template.content);
      renderedHeader = template.header_content ? await replacePlaceholdersWithSample(template.header_content) : null;
      renderedFooter = template.footer_content ? await replacePlaceholdersWithSample(template.footer_content) : null;
    }

    res.json({
      success: true,
      data: {
        html: renderedContent,
        header_html: renderedHeader,
        footer_html: renderedFooter,
        css_styles: template.css_styles,
        page_size: template.page_size,
        page_orientation: template.page_orientation,
        page_margins: template.page_margins ? JSON.parse(template.page_margins) : null,
        mode,
        institution,
        session,
        template: {
          id: template.id,
          name: template.name,
          document_type: template.document_type,
          version: template.version,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate document for a student
 * GET /:institutionId/document-templates/:id/generate/:studentId
 */
const generateDocument = async (req, res, next) => {
  try {
    const { institutionId, id, studentId } = req.params;
    const { session_id, school_id } = req.query;

    // Get template
    const [template] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Get student data
    const [student] = await query(
      `SELECT s.*, 
              p.name as program_name,
              d.name as department_name,
              f.name as faculty_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN faculties f ON d.faculty_id = f.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [parseInt(studentId), parseInt(institutionId)]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get institution data
    const [institution] = await query(
      'SELECT * FROM institutions WHERE id = ?',
      [parseInt(institutionId)]
    );

    // Get session data
    let session;
    if (session_id) {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [parseInt(session_id), parseInt(institutionId)]
      );
    } else {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
        [parseInt(institutionId)]
      );
    }

    // Get school data if provided
    let school = null;
    if (school_id) {
      [school] = await query(
        `SELECT isv.*, ms.name, ms.official_code as code, ms.address, ms.ward, ms.lga, ms.state,
                ms.principal_name, ms.principal_phone, ms.school_type, ms.category
         FROM institution_schools isv
         JOIN master_schools ms ON isv.master_school_id = ms.id
         WHERE isv.id = ? AND isv.institution_id = ?`,
        [parseInt(school_id), parseInt(institutionId)]
      );
    } else {
      // Try to get from acceptance
      const [acceptance] = await query(
        `SELECT ms.*, isv.id as institution_school_id, isv.route_id, isv.distance_km 
         FROM student_acceptances sa
         INNER JOIN institution_schools isv ON sa.institution_school_id = isv.id
         INNER JOIN master_schools ms ON isv.master_school_id = ms.id
         WHERE sa.student_id = ? AND sa.session_id = ? AND sa.status = 'approved'`,
        [parseInt(studentId), session?.id]
      );
      school = acceptance || null;
    }

    // Build placeholder data (including all aliases from database)
    const studentTitle = student.gender === 'male' ? 'Mr.' : (student.gender === 'female' ? (student.marital_status === 'married' ? 'Mrs.' : 'Miss') : '');
    const tpDuration = session?.tp_duration_weeks ? `${session.tp_duration_weeks} weeks` : '';
    
    const placeholderData = {
      // Student (with aliases)
      student_name: student.full_name,
      student_fullname: student.full_name, // alias
      student_title: studentTitle,
      student_regno: student.registration_number,
      student_registration_number: student.registration_number,
      matric_number: student.registration_number, // alias
      student_program: student.program_name || '',
      student_course: student.program_name || '', // alias
      student_department: student.department_name || '',
      student_faculty: student.faculty_name || '',
      
      // Institution (with aliases)
      institution_name: institution?.name || '',
      institution_short_name: institution?.code || '',
      institution_address: institution?.address || '',
      institution_phone: institution?.phone || '',
      institution_email: institution?.email || '',
      institution_logo: institution?.logo_url ? `<img src="${institution.logo_url}" height="80" alt="Institution Logo">` : '',
      award_type: institution?.award_type || 'National Certificate in Education',
      regulator_name: institution?.regulator_name || 'National Commission for Colleges of Education (NCCE)',
      
      // Session (with aliases)
      session_name: session?.name || '',
      current_session: session?.name || '', // alias
      session_code: session?.code || '',
      tp_start_date: session?.tp_start_date ? formatDate(session.tp_start_date) : '',
      tp_end_date: session?.tp_end_date ? formatDate(session.tp_end_date) : '',
      tp_duration: tpDuration,
      tp_duration_weeks: session?.tp_duration_weeks?.toString() || '',
      
      // Coordinator
      coordinator_name: session?.coordinator_name || '',
      coordinator_phone: session?.coordinator_phone || '',
      coordinator_email: session?.coordinator_email || '',
      
      // School
      school_name: school?.name || '',
      school_address: school?.address || '',
      school_type: school?.type || school?.school_type || '',
      school_state: school?.state || '',
      school_lga: school?.lga || '',
      school_ward: school?.ward || '',
      principal_name: school?.principal_name || '',
      principal_phone: school?.principal_phone || '',
      
      // Dates (with aliases)
      today: formatDate(new Date()),
      today_date: formatDate(new Date()), // alias
      current_date: formatDate(new Date()),
      current_date_short: formatDate(new Date(), 'short'),
      current_year: new Date().getFullYear().toString(),
      posting_date: formatDate(new Date()), // For posting letters
    };

    // Replace placeholders
    let renderedContent = template.content;
    for (const [key, value] of Object.entries(placeholderData)) {
      const regex = new RegExp(`\\{${key}(?::[a-z]+)?\\}`, 'gi');
      renderedContent = renderedContent.replace(regex, value);
    }

    let renderedHeader = template.header_content;
    if (renderedHeader) {
      for (const [key, value] of Object.entries(placeholderData)) {
        const regex = new RegExp(`\\{${key}(?::[a-z]+)?\\}`, 'gi');
        renderedHeader = renderedHeader.replace(regex, value);
      }
    }

    let renderedFooter = template.footer_content;
    if (renderedFooter) {
      for (const [key, value] of Object.entries(placeholderData)) {
        const regex = new RegExp(`\\{${key}(?::[a-z]+)?\\}`, 'gi');
        renderedFooter = renderedFooter.replace(regex, value);
      }
    }

    res.json({
      success: true,
      data: {
        html: renderedContent,
        header_html: renderedHeader,
        footer_html: renderedFooter,
        css_styles: template.css_styles,
        page_size: template.page_size,
        page_orientation: template.page_orientation,
        page_margins: template.page_margins ? JSON.parse(template.page_margins) : null,
        template: {
          id: template.id,
          name: template.name,
          document_type: template.document_type,
          version: template.version,
        },
        placeholderData,
        student: {
          id: student.id,
          full_name: student.full_name,
          registration_number: student.registration_number,
        },
        session: session ? {
          id: session.id,
          name: session.name,
          coordinator_name: session.coordinator_name,
          coordinator_phone: session.coordinator_phone,
          coordinator_email: session.coordinator_email,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Publish a template
 * POST /:institutionId/document-templates/:id/publish
 */
const publish = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [template] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Validate content before publishing
    const placeholderValidation = await validatePlaceholders(template.content, template.document_type);
    if (!placeholderValidation.valid) {
      throw new ValidationError('Cannot publish template with invalid placeholders', {
        invalid: placeholderValidation.invalid,
      });
    }

    await query(
      `UPDATE document_templates 
       SET status = 'published', published_at = NOW(), published_by = ?, updated_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [req.user.id, parseInt(id), parseInt(institutionId)]
    );

    const [updated] = await query(
      'SELECT * FROM document_templates WHERE id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Template published successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Archive a template
 * POST /:institutionId/document-templates/:id/archive
 */
const archive = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [template] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    await query(
      `UPDATE document_templates 
       SET status = 'archived', updated_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Template archived successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get template versions
 * GET /:institutionId/document-templates/:id/versions
 */
const getVersions = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [template] = await query(
      'SELECT id FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    const versions = await query(
      `SELECT v.*, u.name as created_by_name
       FROM document_template_versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.template_id = ?
       ORDER BY v.version DESC`,
      [parseInt(id)]
    );

    res.json({ success: true, data: versions });
  } catch (error) {
    next(error);
  }
};

/**
 * Rollback to a specific version
 * POST /:institutionId/document-templates/:id/rollback/:version
 */
const rollback = async (req, res, next) => {
  try {
    const { institutionId, id, version } = req.params;

    const [template] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    const [targetVersion] = await query(
      'SELECT * FROM document_template_versions WHERE template_id = ? AND version = ?',
      [parseInt(id), parseInt(version)]
    );

    if (!targetVersion) {
      throw new NotFoundError('Version not found');
    }

    // Save current version first
    await query(
      `INSERT INTO document_template_versions 
       (template_id, version, content, css_styles, page_size, page_orientation, 
        page_margins, change_summary, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        parseInt(id),
        template.version,
        template.content,
        template.css_styles,
        template.page_size,
        template.page_orientation,
        template.page_margins,
        `Rolled back to version ${version}`,
        req.user.id,
      ]
    );

    // Restore the target version
    await query(
      `UPDATE document_templates 
       SET content = ?, css_styles = ?, page_size = ?, page_orientation = ?, page_margins = ?,
           version = version + 1, updated_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [
        targetVersion.content,
        targetVersion.css_styles,
        targetVersion.page_size,
        targetVersion.page_orientation,
        targetVersion.page_margins,
        parseInt(id),
        parseInt(institutionId),
      ]
    );

    const [updated] = await query(
      'SELECT * FROM document_templates WHERE id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: `Rolled back to version ${version}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Duplicate a template
 * POST /:institutionId/document-templates/:id/duplicate
 */
const duplicate = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [original] = await query(
      'SELECT * FROM document_templates WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (!original) {
      throw new NotFoundError('Template not found');
    }

    // Create duplicate with "Copy" suffix
    const newName = `${original.name} (Copy)`;
    
    const result = await query(
      `INSERT INTO document_templates 
       (institution_id, document_type, name, description, content, 
        header_content, footer_content, css_styles, page_size, 
        page_orientation, page_margins, status, version, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, NOW(), NOW())`,
      [
        parseInt(institutionId),
        original.document_type,
        newName,
        original.description,
        original.content,
        original.header_content,
        original.footer_content,
        original.css_styles,
        original.page_size,
        original.page_orientation,
        original.page_margins,
        req.user.id,
      ]
    );

    const [duplicated] = await query(
      'SELECT * FROM document_templates WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Template duplicated successfully',
      data: duplicated,
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
  getPlaceholders,
  previewTemplate,
  generateDocument,
  publish,
  archive,
  duplicate,
  getVersions,
  rollback,
};
