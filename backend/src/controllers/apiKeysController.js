/**
 * API Keys Controller
 *
 * Manages SSO partner credentials and SSO logs for institutions.
 * Used by the API Keys tab in institution settings.
 */

const crypto = require('crypto');
const { query } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a secure partner ID
 */
function generatePartnerId(institutionCode) {
  const random = crypto.randomBytes(4).toString('hex');
  return `ptn_${institutionCode.toLowerCase()}_${random}`;
}

/**
 * Generate a secure secret key (64 hex characters = 256 bits)
 */
function generateSecretKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get hint from secret key (first 4 and last 4 characters)
 */
function getSecretKeyHint(secretKey) {
  return `${secretKey.substring(0, 4)}...${secretKey.substring(secretKey.length - 4)}`;
}

// ============================================================================
// CONTROLLERS
// ============================================================================

/**
 * Get API Keys / SSO credentials for institution
 * GET /api/:institutionId/settings/api-keys
 */
const getAPIKeys = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Get institution info
    const [institution] = await query(
      `SELECT id, code, name, sso_enabled FROM institutions WHERE id = ?`,
      [parseInt(institutionId)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Get partner credentials (there should be at most one per institution)
    const [partner] = await query(
      `SELECT id, partner_id, secret_key_hash, name, allowed_origins, is_enabled, created_at, updated_at
       FROM sso_partners
       WHERE institution_id = ?`,
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ssoEnabled: Boolean(institution.sso_enabled),
        institutionCode: institution.code,
        ssoEndpoint: `https://${institution.code.toLowerCase()}.digitaltipi.com/sso`,
        partner: partner
          ? {
              id: partner.id,
              partnerId: partner.partner_id,
              secretKey: partner.secret_key_hash, // Return full key for viewing/copying
              name: partner.name,
              allowedOrigins: partner.allowed_origins ? JSON.parse(partner.allowed_origins) : [],
              isEnabled: Boolean(partner.is_enabled),
              createdAt: partner.created_at,
              updatedAt: partner.updated_at,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new partner credentials
 * POST /api/:institutionId/settings/api-keys
 */
const createAPIKeys = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { name, allowedOrigins } = req.body;
    const userId = req.user.id;

    // Get institution
    const [institution] = await query(
      `SELECT id, code, name FROM institutions WHERE id = ?`,
      [parseInt(institutionId)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Check if partner already exists
    const [existing] = await query(
      `SELECT id FROM sso_partners WHERE institution_id = ?`,
      [parseInt(institutionId)]
    );

    if (existing) {
      throw new ConflictError('API credentials already exist. Use regenerate to get a new secret key.');
    }

    // Generate credentials
    const partnerId = generatePartnerId(institution.code);
    const secretKey = generateSecretKey();
    const secretKeyHint = getSecretKeyHint(secretKey);

    // Store credentials (store the actual secret key as it's used for validation)
    await query(
      `INSERT INTO sso_partners 
       (institution_id, partner_id, secret_key_hash, secret_key_hint, name, allowed_origins, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(institutionId),
        partnerId,
        secretKey, // Store the actual key for signature verification
        secretKeyHint,
        name || `${institution.name} SSO`,
        allowedOrigins ? JSON.stringify(allowedOrigins) : null,
        userId,
      ]
    );

    // Enable SSO for institution
    await query(`UPDATE institutions SET sso_enabled = 1 WHERE id = ?`, [parseInt(institutionId)]);

    res.status(201).json({
      success: true,
      message: 'API credentials created successfully',
      data: {
        partnerId,
        secretKey, // Only returned once on creation!
        secretKeyHint,
        institutionCode: institution.code,
        ssoEndpoint: `https://${institution.code.toLowerCase()}.digitaltipi.com/sso`,
      },
      warning: 'Save the secret key now. It will not be shown again.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Regenerate secret key
 * POST /api/:institutionId/settings/api-keys/regenerate
 */
const regenerateSecretKey = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Get institution
    const [institution] = await query(
      `SELECT id, code FROM institutions WHERE id = ?`,
      [parseInt(institutionId)]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    // Get existing partner
    const [partner] = await query(
      `SELECT id, partner_id FROM sso_partners WHERE institution_id = ?`,
      [parseInt(institutionId)]
    );

    if (!partner) {
      throw new NotFoundError('API credentials not found. Create them first.');
    }

    // Generate new secret key
    const secretKey = generateSecretKey();
    const secretKeyHint = getSecretKeyHint(secretKey);

    // Update secret key
    await query(
      `UPDATE sso_partners SET secret_key_hash = ?, secret_key_hint = ?, updated_at = NOW() WHERE id = ?`,
      [secretKey, secretKeyHint, partner.id]
    );

    res.json({
      success: true,
      message: 'Secret key regenerated successfully',
      data: {
        partnerId: partner.partner_id,
        secretKey, // Only returned once!
        secretKeyHint,
        ssoEndpoint: `https://${institution.code.toLowerCase()}.digitaltipi.com/sso`,
      },
      warning: 'Save the secret key now. It will not be shown again. All existing tokens are now invalid.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle SSO enabled/disabled
 * PATCH /api/:institutionId/settings/api-keys/toggle
 */
const toggleSSO = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      throw new ValidationError('enabled must be a boolean');
    }

    // Update institution SSO flag
    await query(`UPDATE institutions SET sso_enabled = ? WHERE id = ?`, [enabled ? 1 : 0, parseInt(institutionId)]);

    // Also update partner if exists
    await query(`UPDATE sso_partners SET is_enabled = ? WHERE institution_id = ?`, [
      enabled ? 1 : 0,
      parseInt(institutionId),
    ]);

    res.json({
      success: true,
      message: `SSO ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: { ssoEnabled: enabled },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update allowed origins
 * PATCH /api/:institutionId/settings/api-keys/origins
 */
const updateAllowedOrigins = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { allowedOrigins } = req.body;

    if (!Array.isArray(allowedOrigins)) {
      throw new ValidationError('allowedOrigins must be an array');
    }

    // Update partner
    const result = await query(
      `UPDATE sso_partners SET allowed_origins = ?, updated_at = NOW() WHERE institution_id = ?`,
      [JSON.stringify(allowedOrigins), parseInt(institutionId)]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('API credentials not found');
    }

    res.json({
      success: true,
      message: 'Allowed origins updated successfully',
      data: { allowedOrigins },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete API credentials
 * DELETE /api/:institutionId/settings/api-keys
 */
const deleteAPIKeys = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Delete partner
    await query(`DELETE FROM sso_partners WHERE institution_id = ?`, [parseInt(institutionId)]);

    // Disable SSO for institution
    await query(`UPDATE institutions SET sso_enabled = 0 WHERE id = ?`, [parseInt(institutionId)]);

    res.json({
      success: true,
      message: 'API credentials deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get SSO logs
 * GET /api/:institutionId/settings/api-keys/logs
 */
const getSSOLogs = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE institution_id = ?';
    const params = [parseInt(institutionId)];

    if (status && ['success', 'failed'].includes(status)) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    // Get logs
    const logs = await query(
      `SELECT id, partner_id, user_type, identifier, status, error_code, error_message, ip_address, created_at
       FROM sso_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Get total count
    const [countResult] = await query(`SELECT COUNT(*) as total FROM sso_logs ${whereClause}`, params);

    res.json({
      success: true,
      data: logs,
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
 * Get SSO statistics
 * GET /api/:institutionId/settings/api-keys/stats
 */
const getSSOStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Get stats for last 30 days
    const stats = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN user_type = 'student' THEN 1 ELSE 0 END) as students,
        SUM(CASE WHEN user_type = 'staff' THEN 1 ELSE 0 END) as staff
       FROM sso_logs
       WHERE institution_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [parseInt(institutionId)]
    );

    // Get daily stats for chart
    const dailyStats = await query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM sso_logs
       WHERE institution_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        summary: stats[0] || { total: 0, successful: 0, failed: 0, students: 0, staff: 0 },
        daily: dailyStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAPIKeys,
  createAPIKeys,
  regenerateSecretKey,
  toggleSSO,
  updateAllowedOrigins,
  deleteAPIKeys,
  getSSOLogs,
  getSSOStats,
};
