/**
 * Public Controller (MedeePay Pattern)
 * 
 * Handles public (unauthenticated) endpoints.
 * These endpoints don't require authentication but may use subdomain for institution context.
 */

const { z } = require('zod');
const { query } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Nigerian phone regex - supports formats: 08012345678, +2348012345678, 2348012345678
const nigerianPhoneRegex = /^(\+?234|0)?[789][01]\d{8}$/;

const schemas = {
  principalUpdate: z.object({
    body: z.object({
      institution_id: z.coerce.number().int().positive().optional(),
      school_id: z.coerce.number().int().positive('Please select a valid school'),
      proposed_principal_name: z
        .string()
        .min(3, 'Principal name must be at least 3 characters')
        .max(200, 'Principal name is too long')
        .transform((val) => val.trim().toUpperCase()),
      proposed_principal_phone: z
        .string()
        .regex(nigerianPhoneRegex, 'Please enter a valid Nigerian phone number'),
      contributor_name: z.string().max(200).optional().nullable(),
      contributor_phone: z
        .string()
        .regex(nigerianPhoneRegex, 'Please enter a valid Nigerian phone number')
        .optional()
        .nullable()
        .or(z.literal('')),
    }),
  }),

  locationUpdate: z.object({
    body: z.object({
      institution_id: z.coerce.number().int().positive().optional(),
      school_id: z.coerce.number().int().positive('Please select a valid school'),
      proposed_latitude: z.number().min(-90).max(90),
      proposed_longitude: z.number().min(-180).max(180),
      contributor_name: z.string().max(200).optional().nullable(),
      contributor_phone: z
        .string()
        .regex(nigerianPhoneRegex, 'Please enter a valid Nigerian phone number')
        .optional()
        .nullable()
        .or(z.literal('')),
    }),
  }),
};

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
      `SELECT id, name, code, subdomain, email, phone, address, state,
              logo_url, primary_color, secondary_color, status, institution_type,
              tp_unit_name
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
 * Get school principal info for update page
 * GET /public/institutions/:institutionId/schools/:schoolId/principal
 */
const getSchoolPrincipal = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;

    // Check feature toggle
    const featureEnabled = await isFeatureEnabled('public_principal_update', parseInt(institutionId));

    // Get school info
    const [school] = await query(
      `SELECT isv.id, ms.name, ms.official_code as code, ms.principal_name, ms.principal_phone 
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ? AND isv.status = 'active'`,
      [parseInt(schoolId), parseInt(institutionId)]
    );

    if (!school) {
      throw new NotFoundError('School not found');
    }

    // Get active session and check for pending request
    const session = await getCurrentSession(parseInt(institutionId));
    let pendingRequestExists = false;

    if (session) {
      const [pending] = await query(
        `SELECT id FROM school_principal_update_requests 
         WHERE institution_school_id = ? AND session_id = ? AND status = 'pending'`,
        [parseInt(schoolId), session.id]
      );
      pendingRequestExists = !!pending;
    }

    res.json({
      success: true,
      data: {
        school: {
          id: school.id,
          name: school.name,
          code: school.code,
          principal_name: school.principal_name,
          principal_phone: school.principal_phone,
        },
        feature_enabled: featureEnabled,
        can_request_update: featureEnabled && session && !pendingRequestExists,
        pending_request_exists: pendingRequestExists,
        active_session: session ? { id: session.id, name: session.name } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit principal update request
 * POST /public/institutions/:institutionId/schools/principal-update
 */
const submitPrincipalUpdate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.principalUpdate.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;
    const targetInstitutionId = data.institution_id || parseInt(institutionId);

    // Check feature toggle
    const featureEnabled = await isFeatureEnabled('public_principal_update', targetInstitutionId);
    if (!featureEnabled) {
      throw new ValidationError('Principal update requests are not enabled for this institution');
    }

    // Get active session
    const session = await getCurrentSession(targetInstitutionId);
    if (!session) {
      throw new ValidationError('No active session. Cannot submit request.');
    }

    // Check for existing pending request
    const [existing] = await query(
      `SELECT id FROM school_principal_update_requests 
       WHERE institution_school_id = ? AND session_id = ? AND status IN ('pending', 'approved')`,
      [data.school_id, session.id]
    );

    if (existing) {
      throw new ValidationError('A request has already been submitted for this school in the current session');
    }

    // Verify school exists and get current principal info
    const [school] = await query(
      `SELECT isv.id, ms.principal_name, ms.principal_phone 
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ? AND isv.status = ?`,
      [data.school_id, targetInstitutionId, 'active']
    );

    if (!school) {
      throw new NotFoundError('School not found');
    }

    // Create request with previous principal info
    const result = await query(
      `INSERT INTO school_principal_update_requests 
       (institution_id, session_id, institution_school_id, 
        proposed_principal_name, proposed_principal_phone,
        previous_principal_name, previous_principal_phone,
        contributor_name, contributor_phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        targetInstitutionId,
        session.id,
        data.school_id,
        data.proposed_principal_name,
        data.proposed_principal_phone,
        school.principal_name || null,
        school.principal_phone || null,
        data.contributor_name || null,
        data.contributor_phone || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully. It will be reviewed by the institution.',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get school location info for update page
 * GET /public/institutions/:institutionId/schools/:schoolId/location
 */
const getSchoolLocation = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;

    // Check feature toggle
    const featureEnabled = await isFeatureEnabled('public_location_update', parseInt(institutionId));

    // Get school info
    const [school] = await query(
      `SELECT isv.id, ms.name, ms.official_code as code, 
              ST_X(ms.location) as longitude,
              ST_Y(ms.location) as latitude
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ? AND isv.status = 'active'`,
      [parseInt(schoolId), parseInt(institutionId)]
    );

    if (!school) {
      throw new NotFoundError('School not found');
    }

    // Get active session and check for pending request
    const session = await getCurrentSession(parseInt(institutionId));
    let pendingRequestExists = false;

    if (session) {
      const [pending] = await query(
        `SELECT id FROM school_location_update_requests 
         WHERE institution_school_id = ? AND session_id = ? AND status = 'pending'`,
        [parseInt(schoolId), session.id]
      );
      pendingRequestExists = !!pending;
    }

    res.json({
      success: true,
      data: {
        school: {
          id: school.id,
          name: school.name,
          code: school.code,
          latitude: school.latitude,
          longitude: school.longitude,
        },
        feature_enabled: featureEnabled,
        can_request_update: featureEnabled && session && !pendingRequestExists,
        pending_request_exists: pendingRequestExists,
        active_session: session ? { id: session.id, name: session.name } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit location update request
 * POST /public/institutions/:institutionId/schools/location-update
 */
const submitLocationUpdate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const validation = schemas.locationUpdate.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const data = validation.data.body;
    const targetInstitutionId = data.institution_id || parseInt(institutionId);

    // Check feature toggle
    const featureEnabled = await isFeatureEnabled('public_location_update', targetInstitutionId);
    if (!featureEnabled) {
      throw new ValidationError('Location update requests are not enabled for this institution');
    }

    // Get active session
    const session = await getCurrentSession(targetInstitutionId);
    if (!session) {
      throw new ValidationError('No active session. Cannot submit request.');
    }

    // Check for existing pending request
    const [existing] = await query(
      `SELECT id FROM school_location_update_requests 
       WHERE institution_school_id = ? AND session_id = ? AND status IN ('pending', 'approved')`,
      [data.school_id, session.id]
    );

    if (existing) {
      throw new ValidationError('A request has already been submitted for this school in the current session');
    }

    // Verify school exists
    const [school] = await query(
      'SELECT id FROM institution_schools WHERE id = ? AND institution_id = ? AND status = ?',
      [data.school_id, targetInstitutionId, 'active']
    );

    if (!school) {
      throw new NotFoundError('School not found');
    }

    // Create request
    const result = await query(
      `INSERT INTO school_location_update_requests 
       (institution_id, session_id, institution_school_id, proposed_latitude, proposed_longitude,
        contributor_name, contributor_phone, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        targetInstitutionId,
        session.id,
        data.school_id,
        data.proposed_latitude,
        data.proposed_longitude,
        data.contributor_name || null,
        data.contributor_phone || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully. It will be reviewed by the institution.',
      data: { id: result.insertId },
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
  schemas,
  getInstitutionBySubdomain,
  lookupInstitution,
  getInstitutions,
  getSchools,
  getSchoolByCode: getSchoolLocation, // Alias for routes
  getSchoolPrincipal,
  submitPrincipalUpdate,
  requestPrincipalUpdate: submitPrincipalUpdate, // Alias for routes
  getSchoolLocation,
  submitLocationUpdate,
  requestLocationUpdate: submitLocationUpdate, // Alias for routes
  healthCheck,
  getFeatureToggles,
  getCurrentSessionPublic,
};
