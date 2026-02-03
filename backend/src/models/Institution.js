/**
 * Institution Model
 * Multi-tenant SaaS core entity
 * All data is isolated by institution_id
 * 
 * CENTRALIZED SETTINGS ARCHITECTURE:
 * - All institution settings are now stored in dedicated columns (not JSON)
 * - Settings are grouped by tab: institution, branding, smtp, payment, general
 * - Each tab has its own update method for scoped saves
 * - Sensitive fields (passwords, API keys) are encrypted at rest
 * 
 * INSTITUTION TYPES:
 * - college_of_education, university, polytechnic, other
 * 
 * PAYMENT TYPE:
 * - per_student: Each student pays individually
 * - per_session: Institution pays in bulk (students NOT charged)
 */

const pool = require('../db/connection');
const encryptionService = require('../services/encryptionService');

// Sensitive fields that should be encrypted at rest
const SENSITIVE_FIELDS = ['paystack_secret_key', 'paystack_public_key', 'smtp_password'];

// Legacy alias for backward compatibility
const SENSITIVE_PAYMENT_FIELDS = ['paystack_secret_key', 'paystack_public_key'];

/**
 * Check if a value appears to be encrypted (iv:authTag:ciphertext format)
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Mask a sensitive value for display
 */
function maskValue(value, visibleChars = 20) {
  if (!value || typeof value !== 'string' || value.length === 0) {
    return '••••••••';
  }
  if (visibleChars === 0 || value.length <= visibleChars) {
    return '••••••••';
  }
  return `${value.substring(0, visibleChars)}••••••••`;
}

/**
 * Process sensitive fields - decrypt or mask
 */
function processSensitiveFields(row, includeSensitive = false) {
  if (!row) return null;
  
  const processed = { ...row };
  
  for (const field of SENSITIVE_FIELDS) {
    const value = processed[field];
    if (!value) continue;
    
    if (includeSensitive) {
      // Decrypt the value
      if (isEncrypted(value)) {
        try {
          processed[field] = encryptionService.decrypt(value);
        } catch (error) {
          console.error(`Failed to decrypt ${field}:`, error.message);
          processed[field] = null;
        }
      }
      // If not encrypted, keep as-is (legacy data)
    } else {
      // Mask the value for display
      processed[field] = '••••••••';
    }
  }
  
  return processed;
}

// Legacy alias for backward compatibility
function processPaymentSettings(row, includeSensitive = false) {
  return processSensitiveFields(row, includeSensitive);
}

class Institution {
  /**
   * Find institution by ID
   * @param {number} id 
   * @param {boolean} includeSensitive - If true, returns decrypted sensitive fields
   */
  static async findById(id, includeSensitive = false) {
    const [rows] = await pool.query(
      `SELECT id, name, code, subdomain, institution_type, email, phone, address, state,
              ST_X(location) as longitude, ST_Y(location) as latitude,
              logo_url, primary_color, secondary_color, status, tp_unit_name,
              smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password,
              smtp_from_name, smtp_from_email,
              maintenance_mode, maintenance_message, allow_student_portal,
              require_pin_change, session_timeout_minutes,
              payment_type, payment_base_amount, payment_currency,
              payment_allow_partial, payment_minimum_percentage, payment_program_pricing,
              paystack_public_key, paystack_secret_key, paystack_split_code, payment_enabled,
              created_at, updated_at 
       FROM institutions WHERE id = ?`,
      [id]
    );
    if (rows[0]) {
      if (rows[0].payment_program_pricing) {
        rows[0].payment_program_pricing = typeof rows[0].payment_program_pricing === 'string' 
          ? JSON.parse(rows[0].payment_program_pricing) 
          : rows[0].payment_program_pricing;
      }
      return processSensitiveFields(rows[0], includeSensitive);
    }
    return null;
  }

  /**
   * Find institution by code (unique identifier)
   * @param {string} code
   * @param {boolean} includeSensitive - If true, returns decrypted sensitive fields
   */
  static async findByCode(code, includeSensitive = false) {
    const [rows] = await pool.query(
      `SELECT id, name, code, subdomain, institution_type, email, phone, address, state, logo_url,
              primary_color, secondary_color, status, tp_unit_name,
              smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password,
              smtp_from_name, smtp_from_email,
              maintenance_mode, maintenance_message, allow_student_portal,
              require_pin_change, session_timeout_minutes,
              payment_type, payment_base_amount, payment_currency,
              payment_allow_partial, payment_minimum_percentage, payment_program_pricing,
              paystack_public_key, paystack_secret_key, paystack_split_code, payment_enabled,
              created_at, updated_at 
       FROM institutions WHERE code = ?`,
      [code]
    );
    if (rows[0]) {
      if (rows[0].payment_program_pricing) {
        rows[0].payment_program_pricing = typeof rows[0].payment_program_pricing === 'string' 
          ? JSON.parse(rows[0].payment_program_pricing) 
          : rows[0].payment_program_pricing;
      }
      return processSensitiveFields(rows[0], includeSensitive);
    }
    return null;
  }

  /**
   * Find all institutions with optional filters
   */
  static async findAll(filters = {}) {
    let query = `SELECT id, name, code, subdomain, institution_type, email, phone, address, state,
                        ST_X(location) as longitude, ST_Y(location) as latitude,
                        logo_url, primary_color, secondary_color, status, tp_unit_name,
                        created_at, updated_at 
                 FROM institutions WHERE 1=1`;
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.institution_type) {
      query += ' AND institution_type = ?';
      params.push(filters.institution_type);
    }

    if (filters.search) {
      query += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY name ASC';

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

  /**
   * Count institutions
   */
  static async count(filters = {}) {
    let query = 'SELECT COUNT(*) as total FROM institutions WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (name LIKE ? OR code LIKE ? OR email LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  /**
   * Create a new institution
   */
  static async create(data) {
    const {
      name,
      code,
      institution_type = 'college_of_education',
      email,
      phone,
      address,
      state,
      latitude,
      longitude,
      logo_url,
      primary_color,
      secondary_color,
    } = data;

    // Build location POINT if coordinates provided
    const hasLocation = latitude != null && longitude != null;
    const locationValue = hasLocation 
      ? `ST_PointFromText('POINT(${parseFloat(longitude)} ${parseFloat(latitude)})', 4326)` 
      : 'NULL';

    const [result] = await pool.query(
      `INSERT INTO institutions 
       (name, code, institution_type, email, phone, address, state, location, logo_url, primary_color, secondary_color, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ${locationValue}, ?, ?, ?, 'active')`,
      [
        name,
        code,
        institution_type,
        email,
        phone || null,
        address || null,
        state || null,
        logo_url || null,
        primary_color || '#1a5f2a',
        secondary_color || '#8b4513',
      ]
    );

    return this.findById(result.insertId);
  }

  /**
   * Update institution (general update - prefer tab-scoped methods)
   */
  static async update(id, data) {
    const updates = [];
    const values = [];

    const allowedFields = [
      'name',
      'institution_type',
      'email',
      'phone',
      'address',
      'state',
      'logo_url',
      'primary_color',
      'secondary_color',
      'status',
      // SMTP fields
      'smtp_host',
      'smtp_port',
      'smtp_secure',
      'smtp_user',
      'smtp_from_name',
      'smtp_from_email',
      // General settings
      'maintenance_mode',
      'maintenance_message',
      'allow_student_portal',
      'require_pin_change',
      'session_timeout_minutes',
      // Payment fields
      'payment_type',
      'payment_base_amount',
      'payment_currency',
      'payment_allow_partial',
      'payment_minimum_percentage',
      'payment_enabled',
      'paystack_split_code',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    // Handle location POINT field
    if (data.latitude !== undefined || data.longitude !== undefined) {
      const lat = data.latitude;
      const lng = data.longitude;
      if (lat != null && lng != null) {
        updates.push(`location = ST_PointFromText('POINT(${parseFloat(lng)} ${parseFloat(lat)})', 4326)`);
      } else if (lat === null || lng === null) {
        updates.push('location = NULL');
      }
    }

    // Handle JSON fields
    if (data.payment_program_pricing !== undefined) {
      updates.push('payment_program_pricing = ?');
      values.push(data.payment_program_pricing ? JSON.stringify(data.payment_program_pricing) : null);
    }

    // Handle encrypted sensitive fields
    // Check for masked values - skip if value is masked placeholder
    const isMaskedValue = (val) => {
      if (!val || typeof val !== 'string') return true;
      return val === '••••••••' || val === '********' || val.endsWith('••••••••');
    };

    if (data.paystack_secret_key !== undefined && !isMaskedValue(data.paystack_secret_key)) {
      updates.push('paystack_secret_key = ?');
      values.push(encryptionService.encrypt(data.paystack_secret_key));
    }
    
    if (data.paystack_public_key !== undefined && !isMaskedValue(data.paystack_public_key)) {
      updates.push('paystack_public_key = ?');
      values.push(encryptionService.encrypt(data.paystack_public_key));
    }

    if (data.smtp_password !== undefined && !isMaskedValue(data.smtp_password)) {
      updates.push('smtp_password = ?');
      values.push(encryptionService.encrypt(data.smtp_password));
    }

    // Note: Legacy 'settings' JSON column has been removed.
    // All settings now use dedicated columns.

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.query(`UPDATE institutions SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

    return this.findById(id);
  }

  // =========================================================================
  // TAB-SCOPED UPDATE METHODS
  // =========================================================================

  /**
   * Update Institution tab settings only
   */
  static async updateInstitutionInfo(id, data) {
    const allowedFields = ['name', 'institution_type', 'email', 'phone', 'address', 'state', 'latitude', 'longitude'];
    const filtered = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        filtered[field] = data[field];
      }
    }
    return this.update(id, filtered);
  }

  /**
   * Update Branding tab settings only
   */
  static async updateBranding(id, data) {
    const allowedFields = ['logo_url', 'primary_color', 'secondary_color'];
    const filtered = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        filtered[field] = data[field];
      }
    }
    return this.update(id, filtered);
  }

  /**
   * Update SMTP/Email tab settings only
   */
  static async updateSmtpSettings(id, data) {
    const allowedFields = [
      'smtp_host', 'smtp_port', 'smtp_secure', 
      'smtp_user', 'smtp_password',
      'smtp_from_name', 'smtp_from_email'
    ];
    const filtered = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        filtered[field] = data[field];
      }
    }
    return this.update(id, filtered);
  }

  /**
   * Update General tab settings only
   */
  static async updateGeneralSettings(id, data) {
    const allowedFields = [
      'maintenance_mode', 'maintenance_message',
      'allow_student_portal', 'require_pin_change', 'session_timeout_minutes'
    ];
    const filtered = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        filtered[field] = data[field];
      }
    }
    return this.update(id, filtered);
  }

  // Note: TP Configuration settings (tp_duration_weeks, tp_start_date, etc.)
  // are now managed per-session in the academic_sessions table.
  // Use AcademicSession.update() for TP settings.

  /**
   * Delete institution (soft delete by setting status to 'deleted')
   */
  static async delete(id) {
    const [result] = await pool.query(
      "UPDATE institutions SET status = 'deleted', updated_at = NOW() WHERE id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Get institution branding configuration
   */
  static async getBranding(id) {
    const [rows] = await pool.query(
      `SELECT name, code, logo_url, primary_color, secondary_color, tp_unit_name, settings 
       FROM institutions WHERE id = ?`,
      [id]
    );

    if (!rows[0]) return null;

    const institution = rows[0];
    const settings = institution.settings ? JSON.parse(institution.settings) : {};

    return {
      name: institution.name,
      code: institution.code,
      logo: institution.logo_url,
      colors: {
        primary: institution.primary_color,
        secondary: institution.secondary_color,
      },
      tp_unit_name: institution.tp_unit_name || 'Teaching Practice Coordination Unit',
      ...settings.branding,
    };
  }

  /**
   * Update institution settings
   */
  static async updateSettings(id, newSettings) {
    const current = await this.findById(id);
    if (!current) return null;

    const mergedSettings = {
      ...(current.settings || {}),
      ...newSettings,
    };

    await pool.query('UPDATE institutions SET settings = ?, updated_at = NOW() WHERE id = ?', [
      JSON.stringify(mergedSettings),
      id,
    ]);

    return this.findById(id);
  }

  // =========================================================================
  // PAYMENT SETTINGS METHODS
  // =========================================================================

  /**
   * Get payment configuration for an institution
   * @param {number} institutionId 
   * @param {boolean} includeSensitive - If true, returns decrypted Paystack keys
   * @returns {Object} Payment configuration
   */
  static async getPaymentConfig(institutionId, includeSensitive = false) {
    const institution = await this.findById(institutionId, includeSensitive);
    if (!institution) return null;

    return {
      payment_type: institution.payment_type,
      base_amount: parseFloat(institution.payment_base_amount) || 0,
      currency: institution.payment_currency || 'NGN',
      allow_partial_payment: institution.payment_allow_partial || false,
      minimum_payment_percentage: parseFloat(institution.payment_minimum_percentage) || 100,
      program_pricing: institution.payment_program_pricing || {},
      paystack_public_key: institution.paystack_public_key,
      paystack_secret_key: institution.paystack_secret_key,
      paystack_split_code: institution.paystack_split_code,
    };
  }

  /**
   * Update payment configuration
   * @param {number} institutionId 
   * @param {Object} paymentData 
   */
  static async updatePaymentConfig(institutionId, paymentData) {
    const updateData = {};

    // Map payment config fields to institution columns
    if (paymentData.payment_type !== undefined) {
      updateData.payment_type = paymentData.payment_type;
    }
    if (paymentData.base_amount !== undefined) {
      updateData.payment_base_amount = paymentData.base_amount;
    }
    if (paymentData.currency !== undefined) {
      updateData.payment_currency = paymentData.currency;
    }
    if (paymentData.allow_partial_payment !== undefined) {
      updateData.payment_allow_partial = paymentData.allow_partial_payment;
    }
    if (paymentData.minimum_payment_percentage !== undefined) {
      updateData.payment_minimum_percentage = paymentData.minimum_payment_percentage;
    }
    if (paymentData.program_pricing !== undefined) {
      updateData.payment_program_pricing = paymentData.program_pricing;
    }
    if (paymentData.paystack_public_key !== undefined) {
      updateData.paystack_public_key = paymentData.paystack_public_key;
    }
    if (paymentData.paystack_secret_key !== undefined) {
      updateData.paystack_secret_key = paymentData.paystack_secret_key;
    }
    if (paymentData.paystack_split_code !== undefined) {
      updateData.paystack_split_code = paymentData.paystack_split_code;
    }

    return this.update(institutionId, updateData);
  }

  /**
   * Check if payment is required for students in this institution
   * If payment_type is 'per_session', institution pays in bulk - students don't pay
   * @param {number} institutionId 
   * @returns {boolean}
   */
  static async isStudentPaymentRequired(institutionId) {
    const config = await this.getPaymentConfig(institutionId);
    if (!config) return false;

    // If per_session (institution pays bulk), students don't pay
    if (config.payment_type === 'per_session') {
      return false;
    }

    // Check if base amount is set
    if (config.base_amount > 0) {
      return true;
    }

    // Check if any program-specific pricing is greater than 0
    if (config.program_pricing && typeof config.program_pricing === 'object') {
      for (const [, price] of Object.entries(config.program_pricing)) {
        if (parseFloat(price) > 0) {
          return true;
        }
      }
    }

    // No payment configured
    return false;
  }

  /**
   * Get payment amount for a student based on their program
   * @param {number} institutionId 
   * @param {number} programId - Optional program ID for program-specific pricing
   * @returns {Object|null}
   */
  static async getPaymentAmountForStudent(institutionId, programId = null) {
    const config = await this.getPaymentConfig(institutionId);
    if (!config) return null;

    // If per_session, no payment required from students
    if (config.payment_type === 'per_session') {
      return {
        amount: 0,
        currency: config.currency,
        required: false,
        reason: 'Institution pays per session (bulk payment)',
      };
    }

    let amount = config.base_amount;

    // Check for program-specific pricing (only if value > 0)
    if (config.program_pricing && programId) {
      const programPricing = config.program_pricing;
      const programAmount = parseFloat(programPricing[programId]);
      // Only use program-specific pricing if it's greater than 0
      if (programAmount > 0) {
        amount = programAmount;
      }
    }

    // If final amount is 0 or less, no payment required
    if (amount <= 0) {
      return {
        amount: 0,
        currency: config.currency,
        required: false,
        reason: 'Payment amount not configured',
      };
    }

    return {
      amount,
      currency: config.currency,
      allow_partial: config.allow_partial_payment,
      minimum_percentage: config.minimum_payment_percentage,
      required: true,
    };
  }

  // =========================================================================
  // LOCATION & DISTANCE METHODS
  // =========================================================================

  /**
   * Calculate distance from institution to a specific school
   * @param {number} institutionId 
   * @param {number} schoolId (institution_school_id)
   * @returns {Object|null} { distance_km }
   */
  static async getDistanceToSchool(institutionId, schoolId) {
    const [rows] = await pool.query(
      `SELECT 
         ST_Distance_Sphere(i.location, ms.location) / 1000 as distance_km
       FROM institutions i
       JOIN institution_schools isv ON isv.institution_id = i.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE i.id = ? AND isv.id = ? 
         AND i.location IS NOT NULL AND ms.location IS NOT NULL`,
      [institutionId, schoolId]
    );

    if (rows.length === 0) return null;

    return {
      distance_km: parseFloat(rows[0].distance_km?.toFixed(2)) || null,
    };
  }

  /**
   * Get all schools with their distances from the institution
   * @param {number} institutionId 
   * @returns {Array} Schools with distance_km field
   */
  static async getSchoolsWithDistances(institutionId) {
    const [rows] = await pool.query(
      `SELECT 
         isv.id, ms.name, ms.lga, ms.school_type,
         ST_Y(ms.location) as latitude,
         ST_X(ms.location) as longitude,
         ROUND(ST_Distance_Sphere(i.location, ms.location) / 1000, 2) as distance_km
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       JOIN institutions i ON isv.institution_id = i.id
       WHERE isv.institution_id = ? 
         AND i.location IS NOT NULL 
         AND ms.location IS NOT NULL
       ORDER BY distance_km ASC`,
      [institutionId]
    );

    return rows;
  }

  /**
   * Update institution location
   * @param {number} id 
   * @param {number} latitude 
   * @param {number} longitude 
   */
  static async updateLocation(id, latitude, longitude) {
    let query;
    
    if (latitude != null && longitude != null) {
      query = `UPDATE institutions SET location = ST_PointFromText('POINT(${parseFloat(longitude)} ${parseFloat(latitude)})', 4326), updated_at = NOW() WHERE id = ?`;
    } else {
      query = `UPDATE institutions SET location = NULL, updated_at = NOW() WHERE id = ?`;
    }

    await pool.query(query, [id]);
    return this.findById(id);
  }
}

module.exports = Institution;
