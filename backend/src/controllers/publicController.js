/**
 * Public Controller (MedeePay Pattern)
 * 
 * Handles public (unauthenticated) endpoints.
 * These endpoints don't require authentication but may use subdomain for institution context.
 */

const { query } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================



// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current active session for institution
 */
async function getCurrentSession(institutionId) {
  const [session] = await query(
    `SELECT * FROM academic_sessions 
     WHERE institution_id = ? AND is_current = 1 
     ORDER BY created_at DESC LIMIT 1`,
    [institutionId]
  );
  return session || null;
}

/**
 * Check if feature is enabled for institution
 */
async function isFeatureEnabled(featureKey, institutionId) {
  const [feature] = await query(
    `SELECT ift.is_enabled 
     FROM institution_feature_toggles ift
     JOIN feature_toggles ft ON ift.feature_toggle_id = ft.id
     WHERE ft.feature_key = ? AND ift.institution_id = ?`,
    [featureKey, institutionId]
  );
  return feature?.is_enabled === 1;
}

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Get institution by subdomain
 * GET /public/institution/:subdomain
 */
const getInstitutionBySubdomain = async (req, res, next) => {
  try {
    const { subdomain } = req.params;

    if (!subdomain) {
      throw new ValidationError('Subdomain is required');
    }

    const [institution] = await query(
      `SELECT id, public_id, name, code, subdomain, email, phone, address, state,
              logo_url, primary_color, secondary_color, status, institution_type,
              tp_unit_name, maintenance_mode, maintenance_message
       FROM institutions
       WHERE (subdomain = ? OR code = ?) AND status = 'active'`,
      [subdomain.toLowerCase(), subdomain.toUpperCase()]
    );

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    res.json({
      success: true,
      data: institution,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lookup institution (supports multiple search methods)
 * GET /public/institutions/lookup
 */
const lookupInstitution = async (req, res, next) => {
  try {
    const { code, subdomain, id } = req.query;

    let sql = `
      SELECT id, name, code, subdomain, email, phone, address, state,
             logo_url, primary_color, secondary_color, status, institution_type,
             tp_unit_name
      FROM institutions 
      WHERE status = 'active'
    `;
    const params = [];

    if (id) {
      sql += ' AND id = ?';
      params.push(parseInt(id));
    } else if (code) {
      sql += ' AND code = ?';
      params.push(code.toUpperCase());
    } else if (subdomain) {
      sql += ' AND subdomain = ?';
      params.push(subdomain.toLowerCase());
    } else {
      throw new ValidationError('Please provide id, code, or subdomain to lookup');
    }

    const [institution] = await query(sql, params);

    if (!institution) {
      throw new NotFoundError('Institution not found');
    }

    res.json({
      success: true,
      data: institution,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get list of all active institutions (minimal info)
 * GET /public/institutions
 */
const getInstitutions = async (req, res, next) => {
  try {
    const institutions = await query(
      `SELECT id, name, code, subdomain 
       FROM institutions 
       WHERE status = 'active' 
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: institutions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get schools for an institution (public, safe fields only)
 * GET /public/institutions/:institutionId/schools
 */
const getSchools = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      exclude_pending_principal, 
      exclude_pending_location, 
      missing_coordinates_only,
      search 
    } = req.query;

    let sql = `
      SELECT isv.id, ms.name, ms.official_code AS school_code, ms.state, ms.lga, ms.ward, ms.address, 
             r.name AS route_name
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE isv.institution_id = ? AND isv.status = 'active'
    `;
    const params = [parseInt(institutionId)];

    if (missing_coordinates_only === 'true') {
      sql += ` AND (ms.location IS NULL OR ST_X(ms.location) IS NULL OR ST_Y(ms.location) IS NULL)`;
    }

    if (search) {
      sql += ' AND (ms.name LIKE ? OR ms.official_code LIKE ? OR ms.ward LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Exclude schools with pending principal requests
    if (exclude_pending_principal === 'true') {
      const session = await getCurrentSession(parseInt(institutionId));
      if (session) {
        sql += `
          AND isv.id NOT IN (
            SELECT spur.institution_school_id 
            FROM school_principal_update_requests spur 
            WHERE spur.institution_id = ? 
              AND spur.session_id = ? 
              AND spur.status IN ('pending', 'approved')
              AND spur.institution_school_id IS NOT NULL
          )
        `;
        params.push(parseInt(institutionId), session.id);
      }
    }

    // Exclude schools with pending location requests
    if (exclude_pending_location === 'true') {
      const session = await getCurrentSession(parseInt(institutionId));
      if (session) {
        sql += `
          AND isv.id NOT IN (
            SELECT slur.institution_school_id 
            FROM school_location_update_requests slur 
            WHERE slur.institution_id = ? 
              AND slur.session_id = ? 
              AND slur.status IN ('pending', 'approved')
              AND slur.institution_school_id IS NOT NULL
          )
        `;
        params.push(parseInt(institutionId), session.id);
      }
    }

    sql += ' ORDER BY ms.name ASC';

    const schools = await query(sql, params);

    res.json({
      success: true,
      data: schools,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Health check endpoint
 * GET /public/health
 */
const healthCheck = async (req, res, next) => {
  try {
    // Test database connection
    const [dbCheck] = await query('SELECT 1 as ok');

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck?.ok === 1 ? 'connected' : 'error',
      version: process.env.APP_VERSION || '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message,
    });
  }
};

/**
 * Get feature toggles for an institution
 * GET /public/institutions/:institutionId/features
 */
const getFeatureToggles = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const features = await query(
      `SELECT feature_key, is_enabled 
       FROM feature_toggles 
       WHERE institution_id = ?`,
      [parseInt(institutionId)]
    );

    // Convert to object for easier consumption
    const featureMap = {};
    for (const f of features) {
      featureMap[f.feature_key] = f.is_enabled === 1;
    }

    res.json({
      success: true,
      data: featureMap,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current session for an institution (public info only)
 * GET /public/institutions/:institutionId/session
 */
const getCurrentSessionPublic = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const session = await getCurrentSession(parseInt(institutionId));

    if (!session) {
      return res.json({
        success: true,
        data: null,
        message: 'No active session',
      });
    }

    // Return only public session info
    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        code: session.code,
        tp_start_date: session.tp_start_date,
        tp_end_date: session.tp_end_date,
        acceptance_window_start: session.acceptance_window_start,
        acceptance_window_end: session.acceptance_window_end,
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
  getInstitutionBySubdomain,
  lookupInstitution,
  getInstitutions,
  getSchools,
  healthCheck,
  getFeatureToggles,
  getCurrentSessionPublic,
};
