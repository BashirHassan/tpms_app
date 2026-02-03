/**
 * Institution Controller (MedeePay Pattern)
 * 
 * Handles institution management operations.
 * Most endpoints require super_admin role.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const { encrypt, decrypt } = require('../services/encryptionService');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  create: z.object({
    body: z.object({
      name: z.string().min(3, 'Name must be at least 3 characters').max(200),
      code: z.string().min(2, 'Code must be at least 2 characters').max(20).toUpperCase(),
      subdomain: z.string().min(2).max(50).toLowerCase().regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'),
      email: z.string().email('Invalid email format'),
      phone: z.string().min(10).max(20).optional().nullable(),
      address: z.string().max(500).optional().nullable(),
      state: z.string().max(100).optional().nullable(),
      lga: z.string().max(100).optional().nullable(),
      institution_type: z.enum(['university', 'polytechnic', 'college']).default('university'),
      logo_url: z.string().url().optional().nullable(),
      primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      status: z.enum(['active', 'inactive', 'suspended']).default('active'),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(3).max(200).optional(),
      code: z.string().min(2).max(20).toUpperCase().optional(),
      subdomain: z.string().min(2).max(50).toLowerCase().regex(/^[a-z0-9-]+$/).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(10).max(20).optional().nullable(),
      address: z.string().max(500).optional().nullable(),
      state: z.string().max(100).optional().nullable(),
      lga: z.string().max(100).optional().nullable(),
      institution_type: z.enum(['university', 'polytechnic', 'college', 'college_of_education']).optional(),
      logo_url: z.string().url().optional().nullable(),
      primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
      status: z.enum(['active', 'inactive', 'suspended']).optional(),
      // Payment settings
      payment_type: z.enum(['per_student', 'per_session']).optional(),
      payment_base_amount: z.coerce.number().min(0).optional(),
      payment_currency: z.string().max(3).optional(),
      payment_allow_partial: z.boolean().optional(),
      payment_minimum_percentage: z.coerce.number().min(0).max(100).optional(),
      payment_program_pricing: z.record(z.coerce.number()).optional(),
      paystack_public_key: z.string().max(100).optional().nullable(),
      paystack_secret_key: z.string().max(100).optional().nullable(),
      paystack_split_code: z.string().max(100).optional().nullable(),
    }),
  }),

  updateSettings: z.object({
    body: z.object({
      default_allowance_rate: z.coerce.number().min(0).optional(),
      base_distance_km: z.coerce.number().min(0).optional(),
      max_distance_km: z.coerce.number().min(0).optional(),
      scoring_type: z.enum(['percentage', 'grades', 'points']).optional(),
      result_decimal_places: z.coerce.number().int().min(0).max(4).optional(),
      enable_student_portal: z.boolean().optional(),
      enable_supervisor_mobile: z.boolean().optional(),
      enable_auto_posting: z.boolean().optional(),
      auto_posting_algorithm: z.enum(['nearest', 'balanced', 'random']).optional(),
      max_students_per_school: z.coerce.number().int().min(1).optional(),
      max_schools_per_supervisor: z.coerce.number().int().min(1).optional(),
    }),
  }),

  updateSmtp: z.object({
    body: z.object({
      smtp_host: z.string().min(1, 'SMTP host is required'),
      smtp_port: z.coerce.number().int().min(1).max(65535),
      smtp_user: z.string().min(1, 'SMTP username is required'),
      smtp_password: z.string().min(1, 'SMTP password is required'),
      smtp_from_email: z.string().email('Invalid from email'),
      smtp_from_name: z.string().max(100).optional(),
      smtp_secure: z.boolean().default(true),
    }),
  }),
};

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Get all institutions
 * GET /global/institutions
 */
const getAll = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT i.*, 
             (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as user_count,
             (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id) as student_count,
             (SELECT COUNT(*) FROM institution_schools isv WHERE isv.institution_id = i.id) as school_count
      FROM institutions i
      WHERE 1=1
    `;
    let countSql = 'SELECT COUNT(*) as total FROM institutions WHERE 1=1';
    const params = [];
    const countParams = [];

    if (status) {
      sql += ' AND i.status = ?';
      countSql += ' AND status = ?';
      params.push(status);
      countParams.push(status);
    }

    if (search) {
      sql += ' AND (i.name LIKE ? OR i.code LIKE ? OR i.subdomain LIKE ?)';
      countSql += ' AND (name LIKE ? OR code LIKE ? OR subdomain LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY i.name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [institutions, [countResult]] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    res.json({
      success: true,
      data: institutions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get institution by ID
 * GET /global/institutions/:id
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [institution] = await query(
      `SELECT i.*,
              (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as user_count,
              (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id) as student_count,
              (SELECT COUNT(*) FROM institution_schools isv WHERE isv.institution_id = i.id) as school_count,
              (SELECT COUNT(*) FROM academic_sessions ses WHERE ses.institution_id = i.id) as session_count
       FROM institutions i
       WHERE i.id = ?`,
      [parseInt(id)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Get current session
    const [currentSession] = await query(
      `SELECT id, name, code, is_current 
       FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1`,
      [parseInt(id)]
    );

    institution.current_session = currentSession || null;

    // Don't expose SMTP credentials
    delete institution.smtp_password;

    res.json({
      success: true,
      data: institution,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new institution
 * POST /global/institutions
 */
const create = async (req, res, next) => {
  try {
    const validation = schemas.create.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;

    // Check for existing code or subdomain
    const [existing] = await query(
      'SELECT id, code, subdomain FROM institutions WHERE code = ? OR subdomain = ?',
      [data.code, data.subdomain]
    );

    if (existing) {
      if (existing.code === data.code) {
        throw new ConflictError('Institution code already exists');
      }
      if (existing.subdomain === data.subdomain) {
        throw new ConflictError('Subdomain already exists');
      }
    }

    // Insert institution
    const result = await query(
      `INSERT INTO institutions 
       (name, code, subdomain, email, phone, address, state, lga, institution_type,
        logo_url, primary_color, secondary_color, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        data.name,
        data.code,
        data.subdomain,
        data.email,
        data.phone || null,
        data.address || null,
        data.state || null,
        data.lga || null,
        data.institution_type,
        data.logo_url || null,
        data.primary_color || null,
        data.secondary_color || null,
        data.status,
      ]
    );

    // Enable all feature toggles by default for new institutions
    // Get all available features from the feature_toggles table
    const allFeatures = await query('SELECT id FROM feature_toggles');
    
    // Insert into institution_feature_toggles with is_enabled = 1 for all features
    if (allFeatures.length > 0) {
      const values = allFeatures.map(f => `(${result.insertId}, ${f.id}, 1, NOW())`).join(', ');
      await query(
        `INSERT INTO institution_feature_toggles (institution_id, feature_toggle_id, is_enabled, created_at)
         VALUES ${values}`
      );
    }

    res.status(201).json({
      success: true,
      message: 'Institution created successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update institution
 * PUT /global/institutions/:id
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validation = schemas.update.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;

    // Check institution exists
    const [existing] = await query('SELECT id FROM institutions WHERE id = ?', [parseInt(id)]);
    if (!existing) {
      throw new NotFoundError('Institution not found');
    }

    // Check for code/subdomain conflicts
    if (data.code || data.subdomain) {
      const [conflict] = await query(
        'SELECT id, code, subdomain FROM institutions WHERE (code = ? OR subdomain = ?) AND id != ?',
        [data.code || '', data.subdomain || '', parseInt(id)]
      );

      if (conflict) {
        if (data.code && conflict.code === data.code) {
          throw new ConflictError('Institution code already exists');
        }
        if (data.subdomain && conflict.subdomain === data.subdomain) {
          throw new ConflictError('Subdomain already exists');
        }
      }
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    // Fields that need encryption
    const sensitiveFields = ['paystack_secret_key', 'paystack_public_key', 'smtp_password'];

    for (const [key, value] of Object.entries(data)) {
      // Encrypt sensitive fields if value is provided and not masked
      if (sensitiveFields.includes(key) && value && !value.includes('••••')) {
        updates.push(`${key} = ?`);
        params.push(encrypt(value));
      } else if (!sensitiveFields.includes(key) || (value && !value.includes('••••'))) {
        // For non-sensitive fields, or if sensitive field has actual new value
        updates.push(`${key} = ?`);
        params.push(value);
      }
      // Skip masked values (don't update if user didn't change the sensitive field)
    }

    // Update payment_enabled based on Paystack key presence
    if (data.paystack_public_key !== undefined || data.paystack_secret_key !== undefined) {
      // Check current keys
      const [current] = await query(
        'SELECT paystack_public_key, paystack_secret_key FROM institutions WHERE id = ?',
        [parseInt(id)]
      );
      const hasPublic = (data.paystack_public_key && !data.paystack_public_key.includes('••••')) || current?.paystack_public_key;
      const hasSecret = (data.paystack_secret_key && !data.paystack_secret_key.includes('••••')) || current?.paystack_secret_key;
      updates.push('payment_enabled = ?');
      params.push(!!(hasPublic && hasSecret));
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updates.push('updated_at = NOW()');
    params.push(parseInt(id));

    await query(
      `UPDATE institutions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'Institution updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete institution
 * DELETE /global/institutions/:id
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check institution exists
    const [existing] = await query('SELECT id, name FROM institutions WHERE id = ?', [parseInt(id)]);
    if (!existing) {
      throw new NotFoundError('Institution not found');
    }

    // Check for dependent data
    const [userCount] = await query('SELECT COUNT(*) as count FROM users WHERE institution_id = ?', [parseInt(id)]);
    const [studentCount] = await query('SELECT COUNT(*) as count FROM students WHERE institution_id = ?', [parseInt(id)]);

    if (userCount.count > 0 || studentCount.count > 0) {
      throw new ValidationError(
        `Cannot delete institution with existing data. Found ${userCount.count} users and ${studentCount.count} students.`
      );
    }

    await query('DELETE FROM institutions WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: `Institution "${existing.name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get institution settings
 * GET /api/:institutionId/settings
 */
const getSettings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const [institution] = await query(
      `SELECT id, name, code,
              default_allowance_rate, base_distance_km, max_distance_km,
              scoring_type, result_decimal_places,
              enable_student_portal, enable_supervisor_mobile, enable_auto_posting,
              auto_posting_algorithm, max_students_per_school, max_schools_per_supervisor
       FROM institutions
       WHERE id = ?`,
      [parseInt(institutionId)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Get feature toggles for this institution
    const features = await query(
      `SELECT ft.feature_key, COALESCE(ift.is_enabled, ft.default_enabled, 0) as is_enabled
       FROM feature_toggles ft
       LEFT JOIN institution_feature_toggles ift 
         ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?`,
      [parseInt(institutionId)]
    );

    const featureMap = {};
    for (const f of features) {
      featureMap[f.feature_key] = f.is_enabled === 1;
    }

    res.json({
      success: true,
      data: {
        ...institution,
        features: featureMap,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update institution settings
 * PUT /api/:institutionId/settings
 */
const updateSettings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.updateSettings.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;

    // Check institution exists
    const [existing] = await query('SELECT id FROM institutions WHERE id = ?', [parseInt(institutionId)]);
    if (!existing) {
      throw new NotFoundError('Institution not found');
    }

    // Build update query
    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(data)) {
      updates.push(`${key} = ?`);
      params.push(value);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(parseInt(institutionId));

      await query(
        `UPDATE institutions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get SMTP settings (decrypted)
 * GET /api/:institutionId/settings/smtp
 */
const getSmtpSettings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const [institution] = await query(
      `SELECT smtp_host, smtp_port, smtp_user, smtp_password, 
              smtp_from_email, smtp_from_name, smtp_secure
       FROM institutions
       WHERE id = ?`,
      [parseInt(institutionId)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Decrypt password if exists
    const smtpSettings = {
      smtp_host: institution.smtp_host,
      smtp_port: institution.smtp_port,
      smtp_user: institution.smtp_user,
      smtp_password: institution.smtp_password ? decrypt(institution.smtp_password) : null,
      smtp_from_email: institution.smtp_from_email,
      smtp_from_name: institution.smtp_from_name,
      smtp_secure: institution.smtp_secure === 1,
      is_configured: !!(institution.smtp_host && institution.smtp_user),
    };

    // Mask password for response
    if (smtpSettings.smtp_password) {
      smtpSettings.smtp_password_masked = '••••••••';
      delete smtpSettings.smtp_password; // Don't send actual password to frontend
    }

    res.json({
      success: true,
      data: smtpSettings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update SMTP settings (encrypted)
 * PUT /api/:institutionId/settings/smtp
 */
const updateSmtpSettings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.updateSmtp.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;

    // Check institution exists
    const [existing] = await query('SELECT id FROM institutions WHERE id = ?', [parseInt(institutionId)]);
    if (!existing) {
      throw new NotFoundError('Institution not found');
    }

    // Encrypt password
    const encryptedPassword = encrypt(data.smtp_password);

    await query(
      `UPDATE institutions 
       SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password = ?,
           smtp_from_email = ?, smtp_from_name = ?, smtp_secure = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        data.smtp_host,
        data.smtp_port,
        data.smtp_user,
        encryptedPassword,
        data.smtp_from_email,
        data.smtp_from_name || null,
        data.smtp_secure ? 1 : 0,
        parseInt(institutionId),
      ]
    );

    res.json({
      success: true,
      message: 'SMTP settings updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Test SMTP connection
 * POST /api/:institutionId/settings/smtp/test
 */
const testSmtpConnection = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { test_email } = req.body;

    if (!test_email) {
      throw new ValidationError('Test email address is required');
    }

    // Use emailService to test SMTP connection and send test email
    const { emailService } = require('../services');
    const result = await emailService.testSmtpConnection(parseInt(institutionId), test_email);

    if (!result.success) {
      throw new ValidationError(result.message);
    }

    res.json({
      success: true,
      message: result.message,
      warnings: result.warnings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Test SMTP connection for any institution (super_admin only)
 * POST /global/institutions/:id/smtp/test
 * 
 * This endpoint allows super admins to test SMTP settings for any institution
 * and sends the test email to the specified address.
 */
const testSmtpGlobal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { test_email } = req.body;
    
    // Use provided test_email, or fall back to super admin's email
    const recipientEmail = test_email || req.user?.email;

    if (!recipientEmail) {
      throw new ValidationError('Test email address is required');
    }

    // Check institution exists
    const [institution] = await query(
      'SELECT id, name, code FROM institutions WHERE id = ?',
      [parseInt(id)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Use emailService to test SMTP connection and send test email
    const { emailService } = require('../services');
    const result = await emailService.testSmtpConnection(parseInt(id), recipientEmail);

    if (!result.success) {
      throw new ValidationError(result.message);
    }

    res.json({
      success: true,
      message: result.message,
      data: {
        institution: institution.name,
        institution_code: institution.code,
        recipient: recipientEmail,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all institutions stats (super_admin)
 * GET /global/institutions/stats
 */
const getAllStats = async (req, res, next) => {
  try {
    // Get total counts
    const [[totals]] = await Promise.all([
      query(`
        SELECT 
          (SELECT COUNT(*) FROM institutions WHERE status != 'deleted') as total_institutions,
          (SELECT COUNT(*) FROM institutions WHERE status = 'active') as active_institutions,
          (SELECT COUNT(*) FROM students) as total_students,
          (SELECT COUNT(*) FROM users WHERE role != 'super_admin') as total_users,
          (SELECT COUNT(*) FROM institution_schools) as total_schools
      `),
    ]);

    // Get per-institution stats
    const institutions = await query(`
      SELECT 
        i.id,
        i.name,
        i.code,
        (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as user_count,
        (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id) as student_count,
        (SELECT COUNT(*) FROM students s 
         JOIN academic_sessions sess ON s.session_id = sess.id 
         WHERE s.institution_id = i.id AND sess.is_current = 1) as current_session_student_count,
        (SELECT COUNT(*) FROM institution_schools isv WHERE isv.institution_id = i.id) as school_count
      FROM institutions i
      WHERE i.status != 'deleted'
      ORDER BY i.name
    `);

    res.json({
      success: true,
      data: {
        totals: {
          total_institutions: totals.total_institutions || 0,
          active_institutions: totals.active_institutions || 0,
          total_students: totals.total_students || 0,
          total_users: totals.total_users || 0,
          total_schools: totals.total_schools || 0,
        },
        institutions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update institution status
 * PATCH /global/institutions/:id/status
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['active', 'inactive', 'suspended', 'deleted'];
    if (!status || !validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Check institution exists
    const [existing] = await query('SELECT id, name, status FROM institutions WHERE id = ?', [parseInt(id)]);
    if (!existing) {
      throw new NotFoundError('Institution not found');
    }

    await query(
      'UPDATE institutions SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, parseInt(id)]
    );

    res.json({
      success: true,
      message: `Institution "${existing.name}" status updated to "${status}"`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get institution dashboard stats
 * GET /api/:institutionId/dashboard
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Parallel queries for stats
    const [
      [institution],
      [currentSession],
      [userStats],
      [studentStats],
      [schoolStats],
      [postingStats],
    ] = await Promise.all([
      query('SELECT id, name, code FROM institutions WHERE id = ?', [parseInt(institutionId)]),
      query(
        'SELECT id, name FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
        [parseInt(institutionId)]
      ),
      query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
           SUM(CASE WHEN role = 'supervisor' THEN 1 ELSE 0 END) as supervisors
         FROM users WHERE institution_id = ?`,
        [parseInt(institutionId)]
      ),
      query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
         FROM students WHERE institution_id = ?`,
        [parseInt(institutionId)]
      ),
      query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
         FROM institution_schools WHERE institution_id = ?`,
        [parseInt(institutionId)]
      ),
      currentSession?.[0]
        ? query(
            `SELECT 
               COUNT(*) as total,
               SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
             FROM supervisor_postings WHERE institution_id = ? AND session_id = ?`,
            [parseInt(institutionId), currentSession[0].id]
          )
        : [{ total: 0, active: 0 }],
    ]);

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    res.json({
      success: true,
      data: {
        institution: {
          id: institution.id,
          name: institution.name,
          code: institution.code,
        },
        current_session: currentSession || null,
        stats: {
          users: {
            total: userStats?.total || 0,
            active: userStats?.active || 0,
            supervisors: userStats?.supervisors || 0,
          },
          students: {
            total: studentStats?.total || 0,
            active: studentStats?.active || 0,
          },
          schools: {
            total: schoolStats?.total || 0,
            active: schoolStats?.active || 0,
          },
          postings: {
            total: postingStats?.[0]?.total || 0,
            active: postingStats?.[0]?.active || 0,
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update feature toggle
 * PUT /api/:institutionId/features/:featureKey
 */
const updateFeatureToggle = async (req, res, next) => {
  try {
    const { institutionId, featureKey } = req.params;
    const { is_enabled } = req.body;

    if (typeof is_enabled !== 'boolean') {
      throw new ValidationError('is_enabled must be a boolean');
    }

    // Get the feature toggle ID from feature_toggles table
    const [feature] = await query(
      'SELECT id FROM feature_toggles WHERE feature_key = ?',
      [featureKey]
    );

    if (!feature) {
      throw new NotFoundError(`Feature "${featureKey}" not found`);
    }

    // Check if institution already has this feature toggle entry
    const [existing] = await query(
      'SELECT id FROM institution_feature_toggles WHERE institution_id = ? AND feature_toggle_id = ?',
      [parseInt(institutionId), feature.id]
    );

    if (existing) {
      await query(
        `UPDATE institution_feature_toggles 
         SET is_enabled = ?, 
             ${is_enabled ? 'enabled_by = ?, enabled_at = NOW()' : 'disabled_by = ?, disabled_at = NOW()'}, 
             updated_at = NOW() 
         WHERE id = ?`,
        [is_enabled ? 1 : 0, req.user?.id || null, existing.id]
      );
    } else {
      await query(
        `INSERT INTO institution_feature_toggles 
         (institution_id, feature_toggle_id, is_enabled, ${is_enabled ? 'enabled_by, enabled_at' : 'disabled_by, disabled_at'}, created_at) 
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [parseInt(institutionId), feature.id, is_enabled ? 1 : 0, req.user?.id || null]
      );
    }

    res.json({
      success: true,
      message: `Feature "${featureKey}" ${is_enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Provision a new institution with complete setup
 * POST /global/institutions/provision
 */
const provision = async (req, res, next) => {
  try {
    const InstitutionProvisioningService = require('../services/institutionProvisioningService');
    
    const {
      // Institution data
      name,
      code,
      subdomain,
      institution_type = 'college_of_education',
      email,
      phone,
      address,
      state,
      logo_url,
      primary_color,
      secondary_color,
      // SMTP data
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_password,
      smtp_from_name,
      smtp_from_email,
      // Payment data
      payment_type,
      base_amount,
      currency,
      allow_partial_payment,
      minimum_payment_percentage,
      paystack_public_key,
      paystack_secret_key,
      paystack_split_code,
      // General data
      maintenance_mode,
      maintenance_message,
      allow_student_portal,
      require_pin_change,
      session_timeout_minutes,
      // Optional admin data
      admin_name,
      admin_email,
      admin_password,
    } = req.body;

    // Validate required fields
    if (!name || !code || !email) {
      throw new ValidationError('Name, code, and email are required');
    }

    // Check for existing code or subdomain
    const [existing] = await query(
      'SELECT id, code, subdomain FROM institutions WHERE code = ? OR (subdomain = ? AND subdomain IS NOT NULL)',
      [code.toUpperCase(), subdomain?.toLowerCase()]
    );

    if (existing) {
      if (existing.code === code.toUpperCase()) {
        throw new ConflictError('Institution code already exists');
      }
      if (subdomain && existing.subdomain === subdomain.toLowerCase()) {
        throw new ConflictError('Subdomain already exists');
      }
    }

    // Prepare institution data
    const institutionData = {
      name,
      code: code.toUpperCase(),
      subdomain: subdomain?.toLowerCase() || null,
      institution_type,
      email,
      phone: phone || null,
      address: address || null,
      state: state || null,
      logo_url: logo_url || null,
      primary_color: primary_color || '#1a5f2a',
      secondary_color: secondary_color || '#8b4513',
      // SMTP settings
      smtp_host: smtp_host || null,
      smtp_port: smtp_port || 465,
      smtp_secure: smtp_secure !== false,
      smtp_user: smtp_user || null,
      smtp_password: smtp_password ? encrypt(smtp_password) : null,
      smtp_from_name: smtp_from_name || null,
      smtp_from_email: smtp_from_email || null,
      // Payment settings
      payment_type: payment_type || 'per_student',
      payment_base_amount: parseFloat(base_amount) || 0,
      payment_currency: currency || 'NGN',
      payment_allow_partial: allow_partial_payment || false,
      payment_minimum_percentage: parseFloat(minimum_payment_percentage) || 100,
      paystack_public_key: paystack_public_key ? encrypt(paystack_public_key) : null,
      paystack_secret_key: paystack_secret_key ? encrypt(paystack_secret_key) : null,
      paystack_split_code: paystack_split_code || null,
      payment_enabled: !!(paystack_public_key && paystack_secret_key),
      // General settings
      maintenance_mode: maintenance_mode || false,
      maintenance_message: maintenance_message || null,
      allow_student_portal: allow_student_portal !== false,
      require_pin_change: require_pin_change !== false,
      session_timeout_minutes: session_timeout_minutes || 1440,
    };

    // Prepare admin data if provided
    const adminData = admin_name && admin_email ? {
      full_name: admin_name,
      email: admin_email,
      password: admin_password,
    } : null;

    // Provision the institution
    const result = await InstitutionProvisioningService.provisionInstitution(
      institutionData,
      adminData,
      req.user?.id
    );

    res.status(201).json({
      success: true,
      message: 'Institution provisioned successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload institution logo
 * POST /global/institutions/upload-logo
 */
const uploadLogo = async (req, res, next) => {
  try {
    const cloudinaryService = require('../services/cloudinaryService');
    
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const institutionCode = req.body.code || 'TEMP';
    const oldLogoUrl = req.body.old_logo_url || null;

    // Delete old logo if replacing
    if (oldLogoUrl) {
      try {
        const publicId = cloudinaryService.extractPublicIdFromUrl(oldLogoUrl);
        if (publicId) {
          await cloudinaryService.deleteImage(publicId);
        }
      } catch (err) {
        console.warn('Failed to delete old logo:', err.message);
      }
    }

    // Upload to Cloudinary
    const result = await cloudinaryService.uploadImage(req.file, {
      folder: `digitaltp/logos/${institutionCode}`,
      transformation: [
        { width: 400, height: 400, crop: 'limit' },
        { quality: 'auto' },
      ],
    });

    res.json({
      success: true,
      data: {
        url: result.secure_url,
        public_id: result.public_id,
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
  getAll,
  getAllStats,
  getById,
  create,
  update,
  updateStatus,
  remove,
  provision,
  uploadLogo,
  getSettings,
  updateSettings,
  getSmtpSettings,
  updateSmtpSettings,
  testSmtpConnection,
  testSmtpGlobal,
  getDashboardStats,
  updateFeatureToggle,
};
