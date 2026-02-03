/**
 * User Model
 * Staff users (non-student) with email/password auth
 * 
 * Simple single-institution model:
 * - Each user belongs to exactly ONE institution (via users.institution_id)
 * - super_admin role can have NULL institution_id (platform-level access)
 * - Subdomain determines which institution context the user is accessing
 */

const pool = require('../db/connection');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class User {
  /**
   * Find user by ID (basic info)
   */
  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT u.id, u.institution_id, u.name, u.email, u.phone, 
              u.role, u.rank_id, u.faculty_id, u.file_number, u.is_dean, u.status, 
              u.last_login, u.created_at, u.updated_at,
              r.name as rank_name, r.code as rank_code,
              f.name as faculty_name, f.code as faculty_code,
              i.name as institution_name, i.code as institution_code, i.subdomain
       FROM users u
       LEFT JOIN ranks r ON u.rank_id = r.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       LEFT JOIN institutions i ON u.institution_id = i.id
       WHERE u.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Check if user is a super_admin (can access all institutions)
   * @param {Object} user - User object
   * @returns {boolean}
   */
  static isSuperAdmin(user) {
    return user.role === 'super_admin';
  }

  /**
   * Check if user can access a specific institution
   * @param {number} userId - User ID
   * @param {number} institutionId - Institution ID to check
   * @returns {Promise<boolean>}
   */
  static async canAccessInstitution(userId, institutionId) {
    const user = await this.findById(userId);
    if (!user) return false;

    // super_admin can access any institution
    if (this.isSuperAdmin(user)) {
      return true;
    }

    // Regular users can only access their own institution
    return user.institution_id === parseInt(institutionId);
  }

  /**
   * Get user's role in a specific institution
   * @param {number} userId - User ID
   * @param {number} institutionId - Institution ID
   * @returns {Promise<string|null>} Role or null
   */
  static async getRoleInInstitution(userId, institutionId) {
    const user = await this.findById(userId);
    if (!user) return null;

    // super_admin has super_admin role everywhere
    if (this.isSuperAdmin(user)) {
      return 'super_admin';
    }

    // Regular users only have role in their own institution
    if (user.institution_id === parseInt(institutionId)) {
      return user.role;
    }

    return null;
  }

  /**
   * Find user by ID including password (for auth)
   */
  static async findByIdWithPassword(id) {
    const [rows] = await pool.query(
      `SELECT id, institution_id, name, email, password_hash, role, rank_id, status 
       FROM users WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find user by email (global - for login)
   * Uses LEFT JOIN to support super_admin users without institution
   */
  static async findByEmail(email) {
    const [rows] = await pool.query(
      `SELECT u.*, i.name as institution_name, i.status as institution_status, i.subdomain
       FROM users u
       LEFT JOIN institutions i ON u.institution_id = i.id
       WHERE u.email = ?`,
      [email]
    );
    return rows[0] || null;
  }

  /**
   * Find user by email within an institution
   */
  static async findByEmailAndInstitution(email, institutionId) {
    const [rows] = await pool.query(
      `SELECT id, institution_id, name, email, role, status 
       FROM users WHERE email = ? AND institution_id = ?`,
      [email, institutionId]
    );
    return rows[0] || null;
  }

  /**
   * Find user by email globally (for checking email uniqueness across all institutions)
   */
  static async findByEmailGlobal(email) {
    const [rows] = await pool.query(
      `SELECT id, institution_id, name, email, role, status 
       FROM users WHERE email = ?`,
      [email]
    );
    return rows[0] || null;
  }

  /**
   * Find all users with filters (institution-scoped)
   */
  static async findAll(institutionId, filters = {}) {
    let query = `SELECT u.id, u.institution_id, u.name, u.email, u.phone, u.role, u.rank_id, u.faculty_id,
                        u.file_number, u.is_dean, u.status, u.last_login, u.created_at, u.updated_at,
                        r.name as rank_name, r.code as rank_code,
                        f.name as faculty_name, f.code as faculty_code
                 FROM users u
                 LEFT JOIN ranks r ON u.rank_id = r.id
                 LEFT JOIN faculties f ON u.faculty_id = f.id
                 WHERE u.institution_id = ?`;
    const params = [institutionId];

    if (filters.role) {
      query += ' AND u.role = ?';
      params.push(filters.role);
    }

    if (filters.status) {
      query += ' AND u.status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY u.created_at DESC';

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
   * Count users (institution-scoped)
   */
  static async count(institutionId, filters = {}) {
    let query = 'SELECT COUNT(*) as total FROM users WHERE institution_id = ?';
    const params = [institutionId];

    if (filters.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (name LIKE ? OR email LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    const [rows] = await pool.query(query, params);
    return rows[0].total;
  }

  /**
   * Create a new user
   * Note: institution_id can be null for super_admin users
   */
  static async create(data) {
    const { institution_id, name, email, password, phone, role, rank_id, faculty_id, file_number, is_dean } = data;

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      `INSERT INTO users (institution_id, name, email, password_hash, phone, role, rank_id, faculty_id, file_number, is_dean, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [institution_id || null, name, email, passwordHash, phone || null, role, rank_id || null, faculty_id || null, file_number || null, is_dean ? 1 : 0]
    );

    return this.findById(result.insertId);
  }

  /**
   * Update user
   */
  static async update(id, data) {
    const updates = [];
    const values = [];

    const allowedFields = ['name', 'email', 'phone', 'role', 'rank_id', 'faculty_id', 'file_number', 'is_dean', 'status'];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === 'is_dean') {
          updates.push(`${field} = ?`);
          values.push(data[field] ? 1 : 0);
        } else {
          updates.push(`${field} = ?`);
          values.push(data[field]);
        }
      }
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

    return this.findById(id);
  }

  /**
   * Update password
   */
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, id]);
    return true;
  }

  /**
   * Verify password
   */
  static async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(id) {
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [id]);
  }

  /**
   * Create password reset token
   * @param {number} userId - User ID
   * @param {string} resetToken - Optional pre-generated token (if not provided, generates one)
   * @returns {string} The plain reset token (for sending in email)
   */
  static async createResetToken(userId, resetToken = null) {
    const token = resetToken || crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await pool.query('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [
      tokenHash,
      expires,
      userId,
    ]);

    return token;
  }

  /**
   * Find user by reset token
   */
  static async findByResetToken(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.query(
      `SELECT id, institution_id, name, email, role, status 
       FROM users WHERE reset_token = ? AND reset_token_expires > NOW()`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  /**
   * Clear reset token
   */
  static async clearResetToken(userId) {
    await pool.query('UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [userId]);
  }

  /**
   * Delete user (soft delete)
   */
  static async delete(id) {
    const [result] = await pool.query("UPDATE users SET status = 'deleted', updated_at = NOW() WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }
}

module.exports = User;
