/**
 * Global Routes - MedeePay Pattern
 * 
 * Platform-wide operations for super_admin only.
 * Accessible from admin.digitaltipi.com subdomain.
 * 
 * Routes:
 * - GET /api/global/users - List all users across institutions
 * - GET /api/global/users/:id - Get user details
 * - POST /api/global/users - Create a new user
 * - PUT /api/global/users/:id - Update a user
 * - DELETE /api/global/users/:id - Delete a user
 * - POST /api/global/users/:id/reset-password - Reset user password
 * - GET /api/global/features - List all features with institution usage counts
 * - GET /api/global/payments - List all payments across institutions
 * - POST /api/global/payments/:id/verify - Verify a pending payment
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query, transaction } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/rbac');
const emailQueueService = require('../services/emailQueueService');
const paystackService = require('../services/paystackService');
const { encryptionService } = require('../services');
const masterSchoolController = require('../controllers/masterSchoolController');
const validate = require('../middleware/validate');

const BCRYPT_ROUNDS = 12;

// Helper: Generate random password
function generateRandomPassword() {
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += Math.floor(Math.random() * 10);
  }
  return password;
}

// Helper: Get role display name
function getRoleDisplayName(role) {
  const roleNames = {
    super_admin: 'Super Admin',
    head_of_teaching_practice: 'Head of Teaching Practice',
    supervisor: 'Supervisor',
    field_monitor: 'Field Monitor',
    student: 'Student',
  };
  return roleNames[role] || role;
}

// =============================================================================
// GLOBAL USERS
// =============================================================================

/**
 * GET /api/global/users
 * Get all users across all institutions
 * Query params: page, limit, search, role, institution_id
 */
router.get(
  '/global/users',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search = '', 
        role = '',
        institution_id = ''
      } = req.query;
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      // Build query dynamically
      let sql = `
        SELECT 
          u.id,
          u.name,
          u.email,
          u.role,
          u.status,
          u.phone,
          u.last_login,
          u.created_at,
          u.rank_id,
          u.faculty_id,
          u.file_number,
          u.is_dean,
          i.id as institution_id,
          i.name as institution_name,
          i.code as institution_code,
          i.subdomain as institution_subdomain,
          r.name as rank_name,
          r.code as rank_code,
          f.name as faculty_name,
          f.code as faculty_code
        FROM users u
        LEFT JOIN institutions i ON u.institution_id = i.id
        LEFT JOIN ranks r ON u.rank_id = r.id
        LEFT JOIN faculties f ON u.faculty_id = f.id
        WHERE 1=1
      `;
      const params = [];

      // Search filter
      if (search) {
        sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      // Role filter
      if (role) {
        sql += ' AND u.role = ?';
        params.push(role);
      }

      // Institution filter
      if (institution_id) {
        sql += ' AND u.institution_id = ?';
        params.push(parseInt(institution_id));
      }

      // Get total count
      const countSql = sql.replace(
        /SELECT[\s\S]*?FROM users/,
        'SELECT COUNT(*) as total FROM users'
      );
      const countResult = await query(countSql, params);
      const total = countResult[0]?.total || 0;

      // Add ordering and pagination
      sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const users = await query(sql, params);

      // Get role distribution
      const roleStats = await query(`
        SELECT role, COUNT(*) as count
        FROM users
        GROUP BY role
        ORDER BY count DESC
      `);

      // Get institution distribution (top 10)
      const institutionStats = await query(`
        SELECT 
          i.id,
          i.name,
          i.code,
          COUNT(u.id) as user_count
        FROM institutions i
        LEFT JOIN users u ON u.institution_id = i.id
        GROUP BY i.id
        ORDER BY user_count DESC
        LIMIT 10
      `);

      res.json({
        success: true,
        data: {
          users,
          stats: {
            total,
            by_role: roleStats,
            by_institution: institutionStats,
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/global/users/:id
 * Get a specific user with full details
 */
router.get(
  '/global/users/:id',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const users = await query(`
        SELECT 
          u.*,
          i.name as institution_name,
          i.code as institution_code,
          i.subdomain as institution_subdomain
        FROM users u
        LEFT JOIN institutions i ON u.institution_id = i.id
        WHERE u.id = ?
      `, [parseInt(id)]);

      if (!users.length) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Remove sensitive fields
      const user = users[0];
      delete user.password;

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/global/users
 * Create a new user (super_admin can create users for any institution)
 */
router.post(
  '/global/users',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { name, email, phone, role, institution_id, rank_id, faculty_id, file_number, is_dean } = req.body;

      // Validation
      if (!name || name.length < 2) {
        return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Valid email is required' });
      }
      if (!role) {
        return res.status(400).json({ success: false, message: 'Role is required' });
      }
      
      // Non-super_admin users must have an institution
      if (role !== 'super_admin' && !institution_id) {
        return res.status(400).json({ success: false, message: 'Institution is required for non-super_admin users' });
      }

      // Check if email already exists
      const existingUsers = await query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
      if (existingUsers.length > 0) {
        return res.status(409).json({ success: false, message: 'A user with this email already exists' });
      }

      // Verify institution exists if provided
      if (institution_id) {
        const institutions = await query('SELECT id FROM institutions WHERE id = ?', [parseInt(institution_id)]);
        if (institutions.length === 0) {
          return res.status(400).json({ success: false, message: 'Institution not found' });
        }
      }

      // Generate password
      const plainPassword = generateRandomPassword();
      const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

      // Insert user
      const result = await query(
        `INSERT INTO users (name, email, phone, password, role, institution_id, rank_id, faculty_id, file_number, is_dean, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          name,
          email.toLowerCase(),
          phone || null,
          hashedPassword,
          role,
          role === 'super_admin' ? null : parseInt(institution_id),
          rank_id ? parseInt(rank_id) : null,
          faculty_id ? parseInt(faculty_id) : null,
          file_number || null,
          is_dean ? 1 : 0,
        ]
      );

      // Send welcome email (queue it)
      try {
        await emailQueueService.enqueue(institution_id || null, {
          to: email.toLowerCase(),
          template: 'staffWelcome',
          data: {
            name,
            email: email.toLowerCase(),
            password: plainPassword,
            role: getRoleDisplayName(role),
            loginUrl: process.env.FRONTEND_URL || 'https://digitaltipi.com',
          },
        }, { priority: 'high' });
      } catch (emailErr) {
        console.error('Failed to queue welcome email:', emailErr);
      }

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
          id: result.insertId,
          name,
          email: email.toLowerCase(),
          role,
          password: plainPassword, // Return for display to admin
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/global/users/:id
 * Update a user
 */
router.put(
  '/global/users/:id',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, email, phone, role, institution_id, rank_id, faculty_id, file_number, is_dean, status } = req.body;

      // Check user exists
      const users = await query('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const existingUser = users[0];

      // Prevent self-demotion
      if (existingUser.id === req.user.id && role && role !== existingUser.role) {
        return res.status(400).json({ success: false, message: 'You cannot change your own role' });
      }

      // Check email uniqueness if changed
      if (email && email.toLowerCase() !== existingUser.email) {
        const emailCheck = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), parseInt(id)]);
        if (emailCheck.length > 0) {
          return res.status(409).json({ success: false, message: 'A user with this email already exists' });
        }
      }

      // Build update query dynamically
      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (email !== undefined) { updates.push('email = ?'); params.push(email.toLowerCase()); }
      if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
      if (role !== undefined) { updates.push('role = ?'); params.push(role); }
      if (institution_id !== undefined) { 
        updates.push('institution_id = ?'); 
        params.push(role === 'super_admin' ? null : (institution_id ? parseInt(institution_id) : null)); 
      }
      if (rank_id !== undefined) { updates.push('rank_id = ?'); params.push(rank_id ? parseInt(rank_id) : null); }
      if (faculty_id !== undefined) { updates.push('faculty_id = ?'); params.push(faculty_id ? parseInt(faculty_id) : null); }
      if (file_number !== undefined) { updates.push('file_number = ?'); params.push(file_number || null); }
      if (is_dean !== undefined) { updates.push('is_dean = ?'); params.push(is_dean ? 1 : 0); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');
      params.push(parseInt(id));

      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

      res.json({
        success: true,
        message: 'User updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/global/users/:id
 * Delete a user
 */
router.delete(
  '/global/users/:id',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check user exists
      const users = await query('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Prevent self-deletion
      if (users[0].id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
      }

      await query('DELETE FROM users WHERE id = ?', [parseInt(id)]);

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/global/users/:id/reset-password
 * Reset a user's password
 */
router.post(
  '/global/users/:id/reset-password',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check user exists
      const users = await query('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = users[0];

      // Prevent self-reset
      if (user.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'You cannot reset your own password here' });
      }

      // Generate new password
      const plainPassword = generateRandomPassword();
      const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

      await query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, parseInt(id)]);

      // Send password reset email
      try {
        await emailQueueService.enqueue(user.institution_id, {
          to: user.email,
          template: 'passwordReset',
          data: {
            name: user.name,
            email: user.email,
            password: plainPassword,
            role: getRoleDisplayName(user.role),
            loginUrl: process.env.FRONTEND_URL || 'https://digitaltipi.com',
          },
        }, { priority: 'high' });
      } catch (emailErr) {
        console.error('Failed to queue password reset email:', emailErr);
      }

      res.json({
        success: true,
        message: 'Password reset successfully',
        data: {
          name: user.name,
          email: user.email,
          password: plainPassword,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// GLOBAL FEATURES
// =============================================================================

/**
 * GET /api/global/features
 * Get all features with institution usage counts
 */
router.get(
  '/global/features',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { module = '' } = req.query;

      let sql = `
        SELECT 
          ft.id,
          ft.feature_key,
          ft.name,
          ft.description,
          ft.module,
          ft.scope,
          ft.is_premium,
          ft.default_enabled,
          ft.is_enabled,
          ft.created_at,
          COUNT(DISTINCT CASE WHEN ift.is_enabled = 1 THEN ift.institution_id END) as enabled_count,
          COUNT(DISTINCT CASE WHEN ift.is_enabled = 0 THEN ift.institution_id END) as disabled_count,
          (SELECT COUNT(*) FROM institutions WHERE status = 'active') as total_institutions
        FROM feature_toggles ft
        LEFT JOIN institution_feature_toggles ift ON ft.id = ift.feature_toggle_id
        WHERE 1=1
      `;
      const params = [];

      if (module) {
        sql += ' AND ft.module = ?';
        params.push(module);
      }

      sql += ' GROUP BY ft.id ORDER BY ft.module, ft.name';

      const features = await query(sql, params);

      // Get module summary
      const moduleSummary = await query(`
        SELECT 
          module,
          COUNT(*) as feature_count
        FROM feature_toggles
        GROUP BY module
        ORDER BY feature_count DESC
      `);

      // Get total institutions count
      const institutionCount = await query(`
        SELECT COUNT(*) as count FROM institutions WHERE status = 'active'
      `);

      res.json({
        success: true,
        data: {
          features: features.map(f => ({
            ...f,
            usage_percentage: f.total_institutions > 0 
              ? Math.round((f.enabled_count / f.total_institutions) * 100) 
              : 0,
          })),
          stats: {
            total_features: features.length,
            total_institutions: institutionCount[0]?.count || 0,
            by_module: moduleSummary,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/global/features/:id
 * Get feature details with list of institutions using it
 */
router.get(
  '/global/features/:id',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Get feature details
      const features = await query(`
        SELECT * FROM feature_toggles WHERE id = ?
      `, [parseInt(id)]);

      if (!features.length) {
        return res.status(404).json({
          success: false,
          message: 'Feature not found',
        });
      }

      const feature = features[0];

      // Get institutions with this feature enabled/disabled
      const institutionUsage = await query(`
        SELECT 
          i.id,
          i.name,
          i.code,
          i.subdomain,
          i.status,
          COALESCE(ift.is_enabled, ?) as is_enabled,
          ift.enabled_at,
          ift.disabled_at,
          eu.name as enabled_by_name,
          du.name as disabled_by_name
        FROM institutions i
        LEFT JOIN institution_feature_toggles ift 
          ON i.id = ift.institution_id AND ift.feature_toggle_id = ?
        LEFT JOIN users eu ON ift.enabled_by = eu.id
        LEFT JOIN users du ON ift.disabled_by = du.id
        WHERE i.status = 'active'
        ORDER BY i.name
      `, [feature.default_enabled ? 1 : 0, parseInt(id)]);

      const enabledCount = institutionUsage.filter(i => i.is_enabled).length;
      const disabledCount = institutionUsage.filter(i => !i.is_enabled).length;

      res.json({
        success: true,
        data: {
          feature,
          institutions: institutionUsage,
          stats: {
            enabled_count: enabledCount,
            disabled_count: disabledCount,
            total: institutionUsage.length,
            usage_percentage: institutionUsage.length > 0 
              ? Math.round((enabledCount / institutionUsage.length) * 100) 
              : 0,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// GLOBAL PAYMENTS
// =============================================================================

/**
 * GET /api/global/payments
 * Get all payments across all institutions
 * Query params: page, limit, status, institution_id, start_date, end_date
 */
router.get(
  '/global/payments',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        status = '',
        institution_id = '',
        start_date = '',
        end_date = '',
        search = ''
      } = req.query;
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      
      // Build query dynamically
      let sql = `
        SELECT 
          sp.id,
          sp.reference,
          sp.amount,
          sp.currency,
          sp.status,
          sp.payment_type,
          sp.channel,
          sp.card_type,
          sp.bank,
          sp.authorization_code,
          sp.paystack_reference,
          sp.verified_at,
          sp.ip_address,
          sp.user_agent,
          sp.metadata,
          sp.created_at,
          sp.updated_at,
          st.id as student_id,
          st.full_name as student_name,
          st.registration_number,
          p.name as program_name,
          sess.name as session_name,
          i.id as institution_id,
          i.name as institution_name,
          i.code as institution_code,
          i.subdomain as institution_subdomain
        FROM student_payments sp
        LEFT JOIN students st ON sp.student_id = st.id
        LEFT JOIN programs p ON st.program_id = p.id
        LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
        LEFT JOIN institutions i ON sp.institution_id = i.id
        WHERE 1=1
      `;
      const params = [];

      // Search filter (by student name or registration number or reference)
      if (search) {
        sql += ' AND (st.full_name LIKE ? OR st.registration_number LIKE ? OR sp.reference LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      // Status filter
      if (status) {
        sql += ' AND sp.status = ?';
        params.push(status);
      }

      // Institution filter
      if (institution_id) {
        sql += ' AND sp.institution_id = ?';
        params.push(parseInt(institution_id));
      }

      // Date range filter
      if (start_date) {
        sql += ' AND sp.created_at >= ?';
        params.push(start_date);
      }
      if (end_date) {
        sql += ' AND sp.created_at <= ?';
        params.push(end_date + ' 23:59:59');
      }

      // Get total count
      const countSql = sql.replace(
        /SELECT[\s\S]*?FROM student_payments/,
        'SELECT COUNT(*) as total FROM student_payments'
      );
      const countResult = await query(countSql, params);
      const total = countResult[0]?.total || 0;

      // Add ordering and pagination
      sql += ' ORDER BY sp.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const payments = await query(sql, params);

      // Build stats filter (same filters as main query, but without LIMIT/OFFSET)
      let statsFilter = '';
      const statsParams = [];

      if (search) {
        statsFilter += ' AND (st.full_name LIKE ? OR st.registration_number LIKE ? OR sp.reference LIKE ?)';
        statsParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (status) {
        statsFilter += ' AND sp.status = ?';
        statsParams.push(status);
      }
      if (institution_id) {
        statsFilter += ' AND sp.institution_id = ?';
        statsParams.push(parseInt(institution_id));
      }
      if (start_date) {
        statsFilter += ' AND sp.created_at >= ?';
        statsParams.push(start_date);
      }
      if (end_date) {
        statsFilter += ' AND sp.created_at <= ?';
        statsParams.push(end_date + ' 23:59:59');
      }

      // Get payment statistics (with filters applied)
      const stats = await query(`
        SELECT 
          COUNT(*) as total_payments,
          SUM(CASE WHEN sp.status = 'success' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN sp.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN sp.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          SUM(CASE WHEN sp.status = 'success' THEN sp.amount ELSE 0 END) as total_completed_amount,
          SUM(CASE WHEN sp.status = 'pending' THEN sp.amount ELSE 0 END) as total_pending_amount
        FROM student_payments sp
        LEFT JOIN students st ON sp.student_id = st.id
        WHERE 1=1${statsFilter}
      `, statsParams);

      // Get payments by institution (top 10)
      const byInstitution = await query(`
        SELECT 
          i.id,
          i.name,
          i.code,
          COUNT(sp.id) as payment_count,
          SUM(CASE WHEN sp.status = 'success' THEN sp.amount ELSE 0 END) as total_amount
        FROM institutions i
        LEFT JOIN student_payments sp ON sp.institution_id = i.id
        GROUP BY i.id
        ORDER BY total_amount DESC
        LIMIT 10
      `);

      res.json({
        success: true,
        data: {
          payments,
          stats: {
            total_payments: stats[0]?.total_payments || 0,
            completed_count: stats[0]?.completed_count || 0,
            pending_count: stats[0]?.pending_count || 0,
            failed_count: stats[0]?.failed_count || 0,
            total_completed_amount: parseFloat(stats[0]?.total_completed_amount || 0),
            total_pending_amount: parseFloat(stats[0]?.total_pending_amount || 0),
            by_institution: byInstitution,
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/global/payments/:id
 * Get a specific payment with full details
 */
router.get(
  '/global/payments/:id',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const payments = await query(`
        SELECT 
          sp.*,
          st.full_name as student_name,
          st.registration_number,
          st.email as student_email,
          st.phone as student_phone,
          sess.name as session_name,
          p.name as program_name,
          i.id as institution_id,
          i.name as institution_name,
          i.code as institution_code,
          i.subdomain as institution_subdomain
        FROM student_payments sp
        LEFT JOIN students st ON sp.student_id = st.id
        LEFT JOIN academic_sessions sess ON sp.session_id = sess.id
        LEFT JOIN programs p ON st.program_id = p.id
        LEFT JOIN institutions i ON sp.institution_id = i.id
        WHERE sp.id = ?
      `, [parseInt(id)]);

      if (!payments.length) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      res.json({
        success: true,
        data: payments[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/global/payments/:id/verify
 * Verify a pending payment with Paystack
 */
router.post(
  '/global/payments/:id/verify',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Get payment
      const payments = await query(`
        SELECT sp.*, i.paystack_secret_key, st.full_name as student_name
        FROM student_payments sp
        LEFT JOIN institutions i ON sp.institution_id = i.id
        LEFT JOIN students st ON sp.student_id = st.id
        WHERE sp.id = ?
      `, [parseInt(id)]);

      if (!payments.length) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const payment = payments[0];

      if (payment.status === 'success') {
        return res.json({ success: true, message: 'Payment already verified', data: payment });
      }

      const reference = payment.reference || payment.paystack_reference;
      if (!reference) {
        return res.status(400).json({ success: false, message: 'No payment reference found' });
      }

      // Get Paystack secret key (decrypt if needed)
      let paystackKey = payment.paystack_secret_key;
      if (paystackKey) {
        try {
          paystackKey = encryptionService.decrypt(paystackKey);
        } catch (e) {
          // Key may not be encrypted, use as-is
        }
      }
      if (!paystackKey) {
        paystackKey = process.env.PAYSTACK_SECRET_KEY;
      }

      if (!paystackKey) {
        return res.status(400).json({ success: false, message: 'Paystack not configured for this institution' });
      }

      // Verify with Paystack using paystackService
      const verifyResult = await paystackService.verifyTransaction(paystackKey, reference);

      if (!verifyResult.success) {
        return res.json({
          success: false,
          message: 'Paystack verification failed',
          data: { status: 'failed', reference, error: verifyResult.error },
        });
      }

      const verification = { status: true, data: verifyResult.data };

      if (!verification.status || !verification.data) {
        return res.json({
          success: false,
          message: 'Paystack verification failed',
          data: { status: 'failed', reference },
        });
      }

      if (verification.data.status !== 'success') {
        // Update payment as failed
        await query(
          `UPDATE student_payments SET status = 'failed', updated_at = NOW() WHERE id = ?`,
          [parseInt(id)]
        );

        return res.json({
          success: false,
          message: `Payment not successful. Status: ${verification.data.status}`,
          data: { status: 'failed', reference, paystack_status: verification.data.status },
        });
      }

      // Update payment as successful
      const paystackData = verification.data;
      
      // Extract authorization details (may be null for some payment channels like bank_transfer)
      const authCode = paystackData.authorization?.authorization_code || null;
      const cardType = paystackData.authorization?.card_type || null;
      const bankName = paystackData.authorization?.bank || paystackData.authorization?.bank_name || null;
      const channel = paystackData.channel || null;
      
      // Prepare metadata to store
      const storedMetadata = JSON.stringify({
        ...paystackData.metadata,
        gateway_response: paystackData.gatewayResponse,
        paid_at: paystackData.paidAt,
        customer_email: paystackData.customer?.email,
        verified_by_admin: req.user?.email,
        authorization_details: paystackData.authorization ? {
          card_type: cardType,
          last4: paystackData.authorization.last4,
          exp_month: paystackData.authorization.exp_month,
          exp_year: paystackData.authorization.exp_year,
          brand: paystackData.authorization.brand,
          bank: bankName,
          country_code: paystackData.authorization.country_code,
          account_name: paystackData.authorization.account_name,
        } : null,
      });

      await query(
        `UPDATE student_payments 
         SET paystack_reference = ?, authorization_code = ?, channel = ?, 
             card_type = ?, bank = ?, status = 'success', verified_at = NOW(), updated_at = NOW(),
             ip_address = COALESCE(ip_address, ?), user_agent = COALESCE(user_agent, ?), metadata = ?
         WHERE id = ?`,
        [
          paystackData.reference,
          authCode,
          channel,
          cardType,
          bankName,
          req.ip || req.headers['x-forwarded-for'] || null,
          req.headers['user-agent'] || null,
          storedMetadata,
          parseInt(id)
        ]
      );

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          payment_id: parseInt(id),
          reference: payment.reference,
          status: 'success',
          amount: payment.amount,
          student_name: payment.student_name,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/global/payments/:id/cancel
 * Cancel a pending payment
 */
router.post(
  '/global/payments/:id/cancel',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Get payment
      const payments = await query('SELECT * FROM student_payments WHERE id = ?', [parseInt(id)]);

      if (!payments.length) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const payment = payments[0];

      if (payment.status === 'success') {
        return res.status(400).json({ success: false, message: 'Cannot cancel a successful payment' });
      }

      await query(
        `UPDATE student_payments SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [parseInt(id)]
      );

      res.json({
        success: true,
        message: 'Payment cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/global/payments/verify-reference
 * Verify a payment by reference (for recovering failed callbacks)
 */
router.post(
  '/global/payments/verify-reference',
  authenticate,
  isSuperAdmin,
  async (req, res, next) => {
    try {
      const { reference, institution_id } = req.body;

      if (!reference) {
        return res.status(400).json({ success: false, message: 'Reference is required' });
      }

      // Try to find existing payment
      let payment = null;
      const existingPayments = await query(
        'SELECT sp.*, i.paystack_secret_key FROM student_payments sp LEFT JOIN institutions i ON sp.institution_id = i.id WHERE sp.reference = ? OR sp.paystack_reference = ?',
        [reference, reference]
      );

      if (existingPayments.length > 0) {
        payment = existingPayments[0];
      }

      // Determine Paystack key
      let paystackKey = payment?.paystack_secret_key;
      if (!paystackKey && institution_id) {
        const inst = await query('SELECT paystack_secret_key FROM institutions WHERE id = ?', [parseInt(institution_id)]);
        if (inst.length > 0) paystackKey = inst[0].paystack_secret_key;
      }
      if (!paystackKey) {
        paystackKey = process.env.PAYSTACK_SECRET_KEY;
      }

      if (!paystackKey) {
        return res.status(400).json({ success: false, message: 'Paystack not configured' });
      }

      // Decrypt key if needed
      try {
        paystackKey = encryptionService.decrypt(paystackKey);
      } catch (e) {
        // Key may not be encrypted, use as-is
      }

      // Verify with Paystack using paystackService
      const verifyResult = await paystackService.verifyTransaction(paystackKey, reference);

      if (!verifyResult.success || verifyResult.data.status !== 'success') {
        return res.json({
          success: false,
          message: verifyResult.data?.status ? `Payment status: ${verifyResult.data.status}` : 'Verification failed',
        });
      }

      const verification = { data: verifyResult.data };

      // Update or create payment record
      if (payment) {
        // If already verified successfully, skip database update
        if (payment.status === 'success') {
          return res.json({
            success: true,
            message: 'Payment already verified',
            data: { payment_id: payment.id, reference, status: 'success', already_verified: true },
          });
        }

        const paystackData = verification.data;
        
        // Extract authorization details (may be null for some payment channels like bank_transfer)
        const authCode = paystackData.authorization?.authorization_code || null;
        const cardType = paystackData.authorization?.card_type || null;
        const bankName = paystackData.authorization?.bank || paystackData.authorization?.bank_name || null;
        const channel = paystackData.channel || null;
        
        // Prepare metadata to store
        const storedMetadata = JSON.stringify({
          ...paystackData.metadata,
          gateway_response: paystackData.gatewayResponse,
          paid_at: paystackData.paidAt,
          customer_email: paystackData.customer?.email,
          verified_by_admin: req.user?.email,
          authorization_details: paystackData.authorization ? {
            card_type: cardType,
            last4: paystackData.authorization.last4,
            exp_month: paystackData.authorization.exp_month,
            exp_year: paystackData.authorization.exp_year,
            brand: paystackData.authorization.brand,
            bank: bankName,
            country_code: paystackData.authorization.country_code,
            account_name: paystackData.authorization.account_name,
          } : null,
        });

        await query(
          `UPDATE student_payments 
           SET paystack_reference = ?, authorization_code = ?, channel = ?, 
               card_type = ?, bank = ?, status = 'success', verified_at = NOW(), updated_at = NOW(),
               ip_address = COALESCE(ip_address, ?), user_agent = COALESCE(user_agent, ?), metadata = ?
           WHERE id = ?`,
          [
            paystackData.reference,
            authCode,
            channel,
            cardType,
            bankName,
            req.ip || req.headers['x-forwarded-for'] || null,
            req.headers['user-agent'] || null,
            storedMetadata,
            payment.id
          ]
        );

        res.json({
          success: true,
          message: 'Payment verified and updated successfully',
          data: { payment_id: payment.id, reference, status: 'success' },
        });
      } else {
        res.json({
          success: true,
          message: 'Payment verified in Paystack but no local record found',
          data: {
            reference,
            paystack_status: 'success',
            amount: verification.data.amount / 100,
            note: 'Create payment record manually if needed',
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// MASTER SCHOOLS (Central Schools Registry)
// =============================================================================

// Stats and utilities
router.get('/global/master-schools/stats', authenticate, isSuperAdmin, masterSchoolController.getStats);
router.get('/global/master-schools/duplicates', authenticate, isSuperAdmin, masterSchoolController.findDuplicates);

// CRUD
router.get('/global/master-schools', authenticate, isSuperAdmin, masterSchoolController.getAll);
router.get('/global/master-schools/:id', authenticate, isSuperAdmin, masterSchoolController.getById);
router.post('/global/master-schools', authenticate, isSuperAdmin, validate(masterSchoolController.schemas.create), masterSchoolController.create);
router.put('/global/master-schools/:id', authenticate, isSuperAdmin, validate(masterSchoolController.schemas.update), masterSchoolController.update);
router.delete('/global/master-schools/:id', authenticate, isSuperAdmin, masterSchoolController.remove);

// Actions
router.post('/global/master-schools/:id/verify', authenticate, isSuperAdmin, masterSchoolController.verify);
router.post('/global/master-schools/merge', authenticate, isSuperAdmin, validate(masterSchoolController.schemas.merge), masterSchoolController.merge);

module.exports = router;
