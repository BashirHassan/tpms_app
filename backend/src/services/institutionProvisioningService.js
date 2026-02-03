/**
 * Institution Provisioning Service
 * 
 * Handles the complete workflow for setting up a new institution:
 * 1. Create institution record
 * 2. Enable default features
 * 3. Create initial admin user
 * 4. Set up default academic session
 * 5. Configure default settings
 */

const pool = require('../db/connection');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { encrypt } = require('./encryptionService');

/**
 * Provisioning steps definition
 */
const PROVISIONING_STEPS = {
  CREATE_INSTITUTION: {
    key: 'create_institution',
    name: 'Create Institution Record',
    order: 1,
  },
  ENABLE_FEATURES: {
    key: 'enable_features',
    name: 'Enable Default Features',
    order: 2,
  },
  CREATE_ADMIN: {
    key: 'create_admin',
    name: 'Create Initial Admin User',
    order: 3,
  },
  CREATE_SESSION: {
    key: 'create_session',
    name: 'Set Up Academic Session',
    order: 4,
  },
  CONFIGURE_SETTINGS: {
    key: 'configure_settings',
    name: 'Configure Default Settings',
    order: 5,
  },
  FINALIZE: {
    key: 'finalize',
    name: 'Finalize Setup',
    order: 6,
  },
};

/**
 * Default features to enable for new institutions
 */
const DEFAULT_FEATURES = [
  'student_portal',
  'student_registration',
  'posting_letters',
  'acceptance_forms',
  'payment_tracking',
];

/**
 * Premium features (disabled by default, requires upgrade)
 */
const PREMIUM_FEATURES = [
  'monitoring_visits',
  'advanced_reporting',
  'bulk_operations',
  'api_access',
];

class InstitutionProvisioningService {
  /**
   * Provision a new institution with complete setup
   * @param {Object} data - Institution data
   * @param {Object} adminData - Initial admin user data
   * @param {number} provisionedBy - User ID who initiated provisioning
   * @returns {Promise<Object>} Provisioning result
   */
  static async provisionInstitution(data, adminData, provisionedBy = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const result = {
        institution: null,
        admin: null,
        session: null,
        features: [],
        steps: [],
      };

      // Step 1: Create Institution
      const institution = await this._createInstitution(connection, data);
      result.institution = institution;
      await this._recordStep(connection, institution.id, PROVISIONING_STEPS.CREATE_INSTITUTION, 'completed', provisionedBy);
      result.steps.push({ step: 'create_institution', status: 'completed' });

      // Step 2: Enable Default Features
      const features = await this._enableDefaultFeatures(connection, institution.id);
      result.features = features;
      await this._recordStep(connection, institution.id, PROVISIONING_STEPS.ENABLE_FEATURES, 'completed', provisionedBy);
      result.steps.push({ step: 'enable_features', status: 'completed' });

      // Step 3: Create Initial Admin
      if (adminData) {
        const admin = await this._createInitialAdmin(connection, institution.id, adminData);
        result.admin = admin;
        await this._recordStep(connection, institution.id, PROVISIONING_STEPS.CREATE_ADMIN, 'completed', provisionedBy);
        result.steps.push({ step: 'create_admin', status: 'completed' });
      } else {
        await this._recordStep(connection, institution.id, PROVISIONING_STEPS.CREATE_ADMIN, 'skipped', provisionedBy);
        result.steps.push({ step: 'create_admin', status: 'skipped' });
      }

      // Step 4: Create Initial Academic Session
      const session = await this._createInitialSession(connection, institution.id);
      result.session = session;
      await this._recordStep(connection, institution.id, PROVISIONING_STEPS.CREATE_SESSION, 'completed', provisionedBy);
      result.steps.push({ step: 'create_session', status: 'completed' });

      // Step 5: Configure Default Settings
      await this._configureDefaults(connection, institution.id);
      await this._recordStep(connection, institution.id, PROVISIONING_STEPS.CONFIGURE_SETTINGS, 'completed', provisionedBy);
      result.steps.push({ step: 'configure_settings', status: 'completed' });

      // Step 6: Finalize
      await this._recordStep(connection, institution.id, PROVISIONING_STEPS.FINALIZE, 'completed', provisionedBy, {
        provisioned_at: new Date().toISOString(),
        provisioned_by: provisionedBy,
      });
      result.steps.push({ step: 'finalize', status: 'completed' });

      await connection.commit();
      
      return {
        success: true,
        data: result,
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Create institution record
   * @private
   */
  static async _createInstitution(connection, data) {
    const {
      name,
      code,
      subdomain: customSubdomain,
      institution_type = 'college_of_education',
      email,
      phone,
      address,
      state,
      logo_url,
      primary_color = '#1a5f2a',
      secondary_color = '#8b4513',
      // SMTP
      smtp_host,
      smtp_port = 465,
      smtp_secure = true,
      smtp_user,
      smtp_password,
      smtp_from_name,
      smtp_from_email,
      // Payment
      payment_type = 'per_student',
      base_amount = 0,
      currency = 'NGN',
      allow_partial_payment = false,
      minimum_payment_percentage = 100,
      paystack_public_key,
      paystack_secret_key,
      paystack_split_code,
      // General
      maintenance_mode = false,
      maintenance_message,
      allow_student_portal = true,
      require_pin_change = true,
      session_timeout_minutes = 1440,
    } = data;

    // Use custom subdomain or generate from code
    const subdomain = customSubdomain || code.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Encrypt sensitive data if provided
    const encryptedSmtpPassword = smtp_password ? encrypt(smtp_password) : null;
    const encryptedPaystackPublicKey = paystack_public_key ? encrypt(paystack_public_key) : null;
    const encryptedPaystackSecretKey = paystack_secret_key ? encrypt(paystack_secret_key) : null;

    const [result] = await connection.query(
      `INSERT INTO institutions 
       (name, code, subdomain, institution_type, email, phone, address, state, 
        logo_url, primary_color, secondary_color,
        smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_from_name, smtp_from_email,
        payment_type, payment_base_amount, payment_currency, payment_allow_partial, payment_minimum_percentage,
        paystack_public_key, paystack_secret_key, paystack_split_code,
        maintenance_mode, maintenance_message, allow_student_portal, require_pin_change, session_timeout_minutes,
        status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        name,
        code,
        subdomain,
        institution_type,
        email,
        phone || null,
        address || null,
        state || null,
        logo_url || null,
        primary_color,
        secondary_color,
        smtp_host || null,
        smtp_port,
        smtp_secure ? 1 : 0,
        smtp_user || null,
        encryptedSmtpPassword,
        smtp_from_name || null,
        smtp_from_email || null,
        payment_type,
        parseFloat(base_amount) || 0,
        currency,
        allow_partial_payment ? 1 : 0,
        parseFloat(minimum_payment_percentage) || 100,
        encryptedPaystackPublicKey,
        encryptedPaystackSecretKey,
        paystack_split_code || null,
        maintenance_mode ? 1 : 0,
        maintenance_message || null,
        allow_student_portal ? 1 : 0,
        require_pin_change ? 1 : 0,
        session_timeout_minutes,
      ]
    );

    const [institutions] = await connection.query(
      'SELECT * FROM institutions WHERE id = ?',
      [result.insertId]
    );

    return institutions[0];
  }

  /**
   * Enable default features for institution
   * @private
   */
  static async _enableDefaultFeatures(connection, institutionId) {
    const enabledFeatures = [];

    for (const feature of DEFAULT_FEATURES) {
      // Check if feature exists in feature_toggles
      const [existing] = await connection.query(
        'SELECT id FROM feature_toggles WHERE feature_key = ?',
        [feature]
      );

      if (existing[0]) {
        // Link feature to institution
        await connection.query(
          `INSERT INTO institution_feature_toggles (institution_id, feature_toggle_id, is_enabled) 
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_enabled = 1`,
          [institutionId, existing[0].id]
        );
        enabledFeatures.push(feature);
      }
    }

    return enabledFeatures;
  }

  /**
   * Create initial admin user
   * @private
   */
  static async _createInitialAdmin(connection, institutionId, adminData) {
    const {
      name,
      email,
      password,
      phone,
    } = adminData;

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      `INSERT INTO users 
       (institution_id, name, email, password_hash, phone, role, status) 
       VALUES (?, ?, ?, ?, ?, 'head_of_teaching_practice', 'active')`,
      [institutionId, name, email, password_hash, phone || null]
    );

    // Return user without password
    return {
      id: result.insertId,
      institution_id: institutionId,
      name,
      email,
      phone,
      role: 'head_of_teaching_practice',
      status: 'active',
    };
  }

  /**
   * Create initial academic session
   * @private
   */
  static async _createInitialSession(connection, institutionId) {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const sessionName = `${currentYear}/${nextYear}`;
    const sessionCode = `${currentYear}-${nextYear}-1`;

    const [result] = await connection.query(
      `INSERT INTO academic_sessions 
       (institution_id, name, code, start_date, end_date, is_current, status) 
       VALUES (?, ?, ?, ?, ?, 1, 'active')`,
      [
        institutionId,
        sessionName,
        sessionCode,
        `${currentYear}-09-01`,
        `${nextYear}-08-31`,
      ]
    );

    return {
      id: result.insertId,
      name: sessionName,
      code: sessionCode,
      is_current: true,
    };
  }

  /**
   * Configure default institution settings
   * @private
   */
  static async _configureDefaults(connection, institutionId) {
    // Default settings are already set during institution creation
    // This step is kept for any additional configuration if needed
    // Settings like payment_type, maintenance_mode, etc. are passed from frontend
  }

  /**
   * Record provisioning step
   * @private
   */
  static async _recordStep(connection, institutionId, step, status, completedBy = null, metadata = null) {
    await connection.query(
      `INSERT INTO institution_provisioning 
       (institution_id, step_key, step_name, status, completed_at, completed_by, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), completed_at = VALUES(completed_at), 
                                completed_by = VALUES(completed_by), metadata = VALUES(metadata)`,
      [
        institutionId,
        step.key,
        step.name,
        status,
        status === 'completed' ? new Date() : null,
        completedBy,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  }

  /**
   * Get provisioning status for an institution
   */
  static async getProvisioningStatus(institutionId) {
    const [steps] = await pool.query(
      `SELECT * FROM institution_provisioning 
       WHERE institution_id = ? 
       ORDER BY created_at ASC`,
      [institutionId]
    );

    const allSteps = Object.values(PROVISIONING_STEPS);
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const totalSteps = allSteps.length;

    return {
      institution_id: institutionId,
      steps,
      progress: {
        completed: completedSteps,
        total: totalSteps,
        percentage: Math.round((completedSteps / totalSteps) * 100),
      },
      is_complete: completedSteps === totalSteps,
    };
  }

  /**
   * Resume provisioning from a failed step
   */
  static async resumeProvisioning(institutionId, provisionedBy = null) {
    const [failedSteps] = await pool.query(
      `SELECT * FROM institution_provisioning 
       WHERE institution_id = ? AND status IN ('pending', 'failed')
       ORDER BY created_at ASC`,
      [institutionId]
    );

    if (failedSteps.length === 0) {
      return { success: true, message: 'No pending steps to resume' };
    }

    // This would need to be expanded to actually resume each step
    // For now, just return the pending steps
    return {
      success: false,
      pending_steps: failedSteps,
      message: 'Manual intervention required to complete provisioning',
    };
  }

  /**
   * List all institutions with their provisioning status
   */
  static async listInstitutionsWithStatus(filters = {}) {
    let query = `
      SELECT 
        i.*,
        (SELECT COUNT(*) FROM institution_provisioning ip 
         WHERE ip.institution_id = i.id AND ip.status = 'completed') as completed_steps,
        (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id) as user_count,
        (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id) as student_count
      FROM institutions i
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      query += ' AND i.status = ?';
      params.push(filters.status);
    }

    if (filters.subscription_tier) {
      query += ' AND i.subscription_tier = ?';
      params.push(filters.subscription_tier);
    }

    query += ' ORDER BY i.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }
    }

    const [rows] = await pool.query(query, params);
    return rows;
  }
}

module.exports = InstitutionProvisioningService;
module.exports.PROVISIONING_STEPS = PROVISIONING_STEPS;
module.exports.DEFAULT_FEATURES = DEFAULT_FEATURES;
module.exports.PREMIUM_FEATURES = PREMIUM_FEATURES;
