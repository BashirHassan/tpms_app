/**
 * Feature Toggle Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles institution-level feature flag management
 */

const { z } = require('zod');
const { query } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      feature_key: z.string().min(1).regex(/^[a-z_]+$/, 'Feature key must be lowercase letters and underscores only'),
      name: z.string().min(2),
      description: z.string().optional().nullable(),
      module: z.string().optional().default('other'),
      is_enabled: z.boolean().optional().default(false),
      is_premium: z.boolean().optional().default(false),
    }),
    params: z.object({
      institutionId: z.string(),
    }),
  }),
  update: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional().nullable(),
      module: z.string().optional(),
      is_enabled: z.boolean().optional(),
      is_premium: z.boolean().optional(),
      settings: z.record(z.any()).optional().nullable(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

/**
 * Get all feature toggles for an institution
 * GET /:institutionId/feature-toggles
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { module, scope, is_premium } = req.query;

    let sql = `
      SELECT 
        ft.id,
        ft.feature_key,
        ft.name,
        ft.description,
        ft.is_enabled as default_enabled,
        ft.is_premium,
        ft.scope,
        ft.module,
        ft.created_at,
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled,
        ift.settings,
        ift.enabled_by,
        ift.enabled_at,
        ift.disabled_by,
        ift.disabled_at,
        eu.name as enabled_by_name,
        du.name as disabled_by_name
      FROM feature_toggles ft
      LEFT JOIN institution_feature_toggles ift 
        ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
      LEFT JOIN users eu ON ift.enabled_by = eu.id
      LEFT JOIN users du ON ift.disabled_by = du.id
      WHERE 1=1
    `;
    const params = [parseInt(institutionId)];

    if (module) {
      sql += ' AND ft.module = ?';
      params.push(module);
    }
    if (scope) {
      sql += ' AND ft.scope = ?';
      params.push(scope);
    }
    if (is_premium !== undefined) {
      sql += ' AND ft.is_premium = ?';
      params.push(is_premium === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY ft.module, ft.name';

    const features = await query(sql, params);

    // Group by module for easier consumption
    const groupedByModule = features.reduce((acc, feature) => {
      const mod = feature.module || 'general';
      if (!acc[mod]) acc[mod] = [];
      acc[mod].push(feature);
      return acc;
    }, {});

    res.json({
      success: true,
      data: features,
      grouped: groupedByModule,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get feature toggle by ID
 * GET /:institutionId/feature-toggles/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const features = await query(
      `SELECT 
        ft.id,
        ft.feature_key,
        ft.name,
        ft.description,
        ft.is_enabled as default_enabled,
        ft.is_premium,
        ft.scope,
        ft.module,
        ft.created_at,
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled,
        ift.settings,
        ift.enabled_by,
        ift.enabled_at,
        ift.disabled_by,
        ift.disabled_at,
        eu.name as enabled_by_name,
        du.name as disabled_by_name
      FROM feature_toggles ft
      LEFT JOIN institution_feature_toggles ift 
        ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
      LEFT JOIN users eu ON ift.enabled_by = eu.id
      LEFT JOIN users du ON ift.disabled_by = du.id
      WHERE ft.id = ?`,
      [parseInt(institutionId), parseInt(id)]
    );

    if (features.length === 0) {
      throw new NotFoundError('Feature toggle not found');
    }

    res.json({
      success: true,
      data: features[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get feature toggle by key
 * GET /:institutionId/feature-toggles/key/:key
 */
const getByKey = async (req, res, next) => {
  try {
    const { institutionId, key } = req.params;

    const features = await query(
      `SELECT 
        ft.id,
        ft.feature_key,
        ft.name,
        ft.description,
        ft.is_enabled as default_enabled,
        ft.is_premium,
        ft.scope,
        ft.module,
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled,
        ift.settings
      FROM feature_toggles ft
      LEFT JOIN institution_feature_toggles ift 
        ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
      WHERE ft.feature_key = ?`,
      [parseInt(institutionId), key]
    );

    if (features.length === 0) {
      throw new NotFoundError('Feature toggle not found');
    }

    res.json({
      success: true,
      data: features[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update feature toggle for institution
 * PUT /:institutionId/feature-toggles/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { is_enabled, settings } = req.body;

    // Check feature toggle exists
    const features = await query(
      'SELECT id, feature_key, is_premium FROM feature_toggles WHERE id = ?',
      [parseInt(id)]
    );

    if (features.length === 0) {
      throw new NotFoundError('Feature toggle not found');
    }

    const feature = features[0];

    // Check if premium feature requires subscription
    if (feature.is_premium && is_enabled) {
      const institutions = await query(
        'SELECT subscription_plan FROM institutions WHERE id = ?',
        [parseInt(institutionId)]
      );
      
      const plan = institutions[0]?.subscription_plan;
      if (plan === 'basic') {
        throw new ValidationError('This premium feature requires a higher subscription plan');
      }
    }

    // Check if institution override exists
    const existing = await query(
      'SELECT id FROM institution_feature_toggles WHERE institution_id = ? AND feature_toggle_id = ?',
      [parseInt(institutionId), parseInt(id)]
    );

    if (existing.length > 0) {
      // Update existing
      const updates = [];
      const params = [];

      updates.push('is_enabled = ?');
      params.push(is_enabled ? 1 : 0);

      if (is_enabled) {
        updates.push('enabled_by = ?, enabled_at = NOW(), disabled_by = NULL, disabled_at = NULL');
        params.push(req.user.id);
      } else {
        updates.push('disabled_by = ?, disabled_at = NOW()');
        params.push(req.user.id);
      }

      if (settings !== undefined) {
        updates.push('settings = ?');
        params.push(JSON.stringify(settings));
      }

      params.push(parseInt(institutionId), parseInt(id));

      await query(
        `UPDATE institution_feature_toggles SET ${updates.join(', ')} 
         WHERE institution_id = ? AND feature_toggle_id = ?`,
        params
      );
    } else {
      // Create new override
      await query(
        `INSERT INTO institution_feature_toggles 
         (institution_id, feature_toggle_id, is_enabled, settings, enabled_by, enabled_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [parseInt(institutionId), parseInt(id), is_enabled ? 1 : 0, 
         JSON.stringify(settings || {}), is_enabled ? req.user.id : null]
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'feature_toggle_updated', 'feature_toggle', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, parseInt(id), 
       JSON.stringify({ feature_key: feature.feature_key, is_enabled }), req.ip]
    );

    res.json({
      success: true,
      message: `Feature ${is_enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if a feature is enabled for institution
 * GET /:institutionId/feature-toggles/check/:key
 */
const isFeatureEnabled = async (req, res, next) => {
  try {
    const { institutionId, key } = req.params;

    const features = await query(
      `SELECT 
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled,
        ift.settings
      FROM feature_toggles ft
      LEFT JOIN institution_feature_toggles ift 
        ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
      WHERE ft.feature_key = ?`,
      [parseInt(institutionId), key]
    );

    const isEnabled = features.length > 0 ? !!features[0].is_enabled : false;
    const settings = features.length > 0 ? features[0].settings : null;

    res.json({
      success: true,
      data: {
        feature_key: key,
        is_enabled: isEnabled,
        settings: settings ? JSON.parse(settings) : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk update feature toggles
 * PUT /:institutionId/feature-toggles/bulk
 */
const bulkUpdate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { updates } = req.body; // Array of { feature_id, is_enabled, settings? }

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ValidationError('Updates array is required');
    }

    const results = [];

    for (const update of updates) {
      try {
        await module.exports.update(
          {
            params: { institutionId, id: update.feature_id.toString() },
            body: { is_enabled: update.is_enabled, settings: update.settings },
            user: req.user,
            ip: req.ip,
          },
          { json: (data) => results.push({ feature_id: update.feature_id, ...data }) },
          (error) => { throw error; }
        );
      } catch (error) {
        results.push({ feature_id: update.feature_id, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get enabled features for an institution (lightweight endpoint)
 * GET /:institutionId/features/enabled
 * 
 * Returns only enabled feature keys - used for quick feature checks
 * Does not require staffOnly middleware - any authenticated user can access
 */
const getEnabled = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const features = await query(
      `SELECT 
        ft.feature_key,
        ft.name,
        ft.module,
        ft.is_premium,
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled
      FROM feature_toggles ft
      LEFT JOIN institution_feature_toggles ift 
        ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
      WHERE COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) = 1
      ORDER BY ft.module, ft.name`,
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: features,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new feature toggle
 * POST /:institutionId/features
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { feature_key, name, description, module, is_enabled, is_premium } = req.body;

    // Check if feature key already exists
    const existing = await query(
      'SELECT id FROM feature_toggles WHERE feature_key = ?',
      [feature_key]
    );

    if (existing.length > 0) {
      throw new ValidationError('A feature with this key already exists');
    }

    // Insert the new feature toggle
    const result = await query(
      `INSERT INTO feature_toggles 
       (feature_key, name, description, module, is_enabled, default_enabled, is_premium, scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'institution', NOW(), NOW())`,
      [feature_key, name, description || null, module || 'other', is_enabled ? 1 : 0, is_enabled ? 1 : 0, is_premium ? 1 : 0]
    );

    // If enabled, create institution override
    if (is_enabled) {
      await query(
        `INSERT INTO institution_feature_toggles 
         (institution_id, feature_toggle_id, is_enabled, enabled_by, enabled_at)
         VALUES (?, ?, 1, ?, NOW())`,
        [parseInt(institutionId), result.insertId, req.user.id]
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'feature_toggle_created', 'feature_toggle', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ feature_key, name, is_enabled, is_premium }), req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Feature created successfully',
      data: { id: result.insertId, feature_key, name },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle feature on/off
 * PATCH /:institutionId/features/:id/toggle
 */
const toggle = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { enabled } = req.body;

    // Check feature toggle exists
    const features = await query(
      'SELECT id, feature_key, is_premium FROM feature_toggles WHERE id = ?',
      [parseInt(id)]
    );

    if (features.length === 0) {
      throw new NotFoundError('Feature toggle not found');
    }

    const feature = features[0];
    const is_enabled = enabled === true || enabled === 'true' || enabled === 1;

    // Check if premium feature requires subscription
    if (feature.is_premium && is_enabled) {
      const institutions = await query(
        'SELECT subscription_plan FROM institutions WHERE id = ?',
        [parseInt(institutionId)]
      );
      
      const plan = institutions[0]?.subscription_plan;
      if (plan === 'basic') {
        throw new ValidationError('This premium feature requires a higher subscription plan');
      }
    }

    // Check if institution override exists
    const existing = await query(
      'SELECT id FROM institution_feature_toggles WHERE institution_id = ? AND feature_toggle_id = ?',
      [parseInt(institutionId), parseInt(id)]
    );

    if (existing.length > 0) {
      // Update existing
      if (is_enabled) {
        await query(
          `UPDATE institution_feature_toggles 
           SET is_enabled = 1, enabled_by = ?, enabled_at = NOW(), disabled_by = NULL, disabled_at = NULL
           WHERE institution_id = ? AND feature_toggle_id = ?`,
          [req.user.id, parseInt(institutionId), parseInt(id)]
        );
      } else {
        await query(
          `UPDATE institution_feature_toggles 
           SET is_enabled = 0, disabled_by = ?, disabled_at = NOW()
           WHERE institution_id = ? AND feature_toggle_id = ?`,
          [req.user.id, parseInt(institutionId), parseInt(id)]
        );
      }
    } else {
      // Create new override
      await query(
        `INSERT INTO institution_feature_toggles 
         (institution_id, feature_toggle_id, is_enabled, enabled_by, enabled_at, disabled_by, disabled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [parseInt(institutionId), parseInt(id), is_enabled ? 1 : 0, 
         is_enabled ? req.user.id : null, is_enabled ? new Date() : null,
         is_enabled ? null : req.user.id, is_enabled ? null : new Date()]
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'feature_toggle_toggled', 'feature_toggle', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, parseInt(id), 
       JSON.stringify({ feature_key: feature.feature_key, is_enabled }), req.ip]
    );

    res.json({
      success: true,
      message: `Feature ${is_enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a feature toggle
 * DELETE /:institutionId/features/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check feature toggle exists
    const features = await query(
      'SELECT id, feature_key, name FROM feature_toggles WHERE id = ?',
      [parseInt(id)]
    );

    if (features.length === 0) {
      throw new NotFoundError('Feature toggle not found');
    }

    const feature = features[0];

    // Delete institution overrides first (FK constraint)
    await query(
      'DELETE FROM institution_feature_toggles WHERE feature_toggle_id = ?',
      [parseInt(id)]
    );

    // Delete the feature toggle
    await query(
      'DELETE FROM feature_toggles WHERE id = ?',
      [parseInt(id)]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'feature_toggle_deleted', 'feature_toggle', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, parseInt(id), 
       JSON.stringify({ feature_key: feature.feature_key, name: feature.name }), req.ip]
    );

    res.json({
      success: true,
      message: 'Feature deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getAll,
  getById,
  getByKey,
  getEnabled,
  create,
  update,
  toggle,
  remove,
  isFeatureEnabled,
  bulkUpdate,
};
