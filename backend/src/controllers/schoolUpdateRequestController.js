/**
 * School Update Request Controller (MedeePay Pattern)
 * 
 * Handles admin operations for reviewing school update requests.
 * Uses direct SQL with institutionId from route params.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  approve: z.object({
    body: z.object({
      admin_notes: z.string().max(500).optional().nullable(),
    }),
  }),

  reject: z.object({
    body: z.object({
      rejection_reason: z.string().min(5, 'Please provide a reason for rejection').max(500),
      admin_notes: z.string().max(500).optional().nullable(),
    }),
  }),
};

// ============================================================================
// PRINCIPAL UPDATE REQUEST METHODS
// ============================================================================

/**
 * Get all principal update requests
 * GET /:institutionId/school-update-requests/principal
 */
const getPrincipalRequests = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, status, search, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT spur.*, 
             ms.name as school_name, ms.official_code as school_code,
             ms.state, ms.lga, ms.ward,
             ms.principal_name as current_principal_name,
             ms.principal_phone as current_principal_phone,
             sess.name as session_name,
             u.name as reviewed_by_name
      FROM school_principal_update_requests spur
      LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON spur.session_id = sess.id
      LEFT JOIN users u ON spur.reviewed_by = u.id
      WHERE spur.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND spur.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND spur.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (status) {
      sql += ' AND spur.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR spur.proposed_principal_name LIKE ? OR spur.contributor_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    sql += ' ORDER BY spur.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const requests = await query(sql, params);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get principal request by ID
 * GET /:institutionId/school-update-requests/principal/:id
 */
const getPrincipalRequestById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [request] = await query(
      `SELECT spur.*, 
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state, ms.lga, ms.ward,
              ms.principal_name as current_principal_name,
              ms.principal_phone as current_principal_phone,
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_principal_update_requests spur
       LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN academic_sessions sess ON spur.session_id = sess.id
       LEFT JOIN users u ON spur.reviewed_by = u.id
       WHERE spur.id = ? AND spur.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve principal update request
 * POST /:institutionId/school-update-requests/principal/:id/approve
 */
const approvePrincipalRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.approve.safeParse({ body: req.body });
    const adminNotes = validation.success ? validation.data.body.admin_notes : null;

    const [request] = await query(
      `SELECT * FROM school_principal_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await transaction(async (conn) => {
      // Get the master_school_id from the institution_school
      const [isv] = await conn.execute(
        'SELECT master_school_id FROM institution_schools WHERE id = ?',
        [request.institution_school_id]
      );
      
      if (isv.length > 0) {
        // Update the master_school with new principal info
        await conn.execute(
          `UPDATE master_schools SET principal_name = ?, principal_phone = ?, updated_at = NOW()
           WHERE id = ?`,
          [request.proposed_principal_name, request.proposed_principal_phone, 
           isv[0].master_school_id]
        );
      }

      // Update request status
      await conn.execute(
        `UPDATE school_principal_update_requests 
         SET status = 'approved', reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
         WHERE id = ? AND institution_id = ?`,
        [req.user.id, adminNotes, parseInt(id), parseInt(institutionId)]
      );
    });

    res.json({
      success: true,
      message: 'Request approved successfully. School principal details have been updated.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject principal update request
 * POST /:institutionId/school-update-requests/principal/:id/reject
 */
const rejectPrincipalRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.reject.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { rejection_reason, admin_notes } = validation.data.body;

    const [request] = await query(
      `SELECT * FROM school_principal_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await query(
      `UPDATE school_principal_update_requests 
       SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [rejection_reason, req.user.id, admin_notes, parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Request rejected',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get principal requests by school
 * GET /:institutionId/school-update-requests/principal/by-school/:schoolId
 */
const getPrincipalRequestsBySchool = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;

    const requests = await query(
      `SELECT spur.*, 
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_principal_update_requests spur
       LEFT JOIN academic_sessions sess ON spur.session_id = sess.id
       LEFT JOIN users u ON spur.reviewed_by = u.id
       WHERE spur.institution_school_id = ? AND spur.institution_id = ?
       ORDER BY spur.created_at DESC`,
      [parseInt(schoolId), parseInt(institutionId)]
    );

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get principal request statistics
 * GET /:institutionId/school-update-requests/principal/statistics
 */
const getPrincipalStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM school_principal_update_requests
      WHERE institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    const [stats] = await query(sql, params);

    res.json({
      success: true,
      data: {
        total: stats?.total || 0,
        pending: stats?.pending || 0,
        approved: stats?.approved || 0,
        rejected: stats?.rejected || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// LOCATION UPDATE REQUEST METHODS
// ============================================================================

/**
 * Get all location update requests
 * GET /:institutionId/school-update-requests/location
 */
const getLocationRequests = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, status, search, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT slur.*, 
             ms.name as school_name, ms.official_code as school_code,
             ms.state, ms.lga, ms.ward,
             ST_X(ms.location) as current_longitude,
             ST_Y(ms.location) as current_latitude,
             sess.name as session_name,
             u.name as reviewed_by_name
      FROM school_location_update_requests slur
      LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON slur.session_id = sess.id
      LEFT JOIN users u ON slur.reviewed_by = u.id
      WHERE slur.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND slur.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND slur.institution_school_id = ?';
      params.push(parseInt(school_id));
    }
    if (status) {
      sql += ' AND slur.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR slur.contributor_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    sql += ' ORDER BY slur.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const requests = await query(sql, params);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location request by ID
 * GET /:institutionId/school-update-requests/location/:id
 */
const getLocationRequestById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const [request] = await query(
      `SELECT slur.*, 
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state, ms.lga, ms.ward,
              ST_X(ms.location) as current_longitude,
              ST_Y(ms.location) as current_latitude,
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_location_update_requests slur
       LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN academic_sessions sess ON slur.session_id = sess.id
       LEFT JOIN users u ON slur.reviewed_by = u.id
       WHERE slur.id = ? AND slur.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve location update request
 * POST /:institutionId/school-update-requests/location/:id/approve
 */
const approveLocationRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.approve.safeParse({ body: req.body });
    const adminNotes = validation.success ? validation.data.body.admin_notes : null;

    const [request] = await query(
      `SELECT * FROM school_location_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await transaction(async (conn) => {
      // Get the master_school_id from the institution_school
      const [isv] = await conn.execute(
        'SELECT master_school_id FROM institution_schools WHERE id = ?',
        [request.institution_school_id]
      );
      
      if (isv.length > 0) {
        // Update the master_school with new location
        await conn.execute(
          `UPDATE master_schools SET location = ST_GeomFromText(?), updated_at = NOW()
           WHERE id = ?`,
          [`POINT(${request.proposed_longitude} ${request.proposed_latitude})`, 
           isv[0].master_school_id]
        );
      }

      // Update request status
      await conn.execute(
        `UPDATE school_location_update_requests 
         SET status = 'approved', reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
         WHERE id = ? AND institution_id = ?`,
        [req.user.id, adminNotes, parseInt(id), parseInt(institutionId)]
      );
    });

    res.json({
      success: true,
      message: 'Request approved successfully. School location has been updated.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject location update request
 * POST /:institutionId/school-update-requests/location/:id/reject
 */
const rejectLocationRequest = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const validation = schemas.reject.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { rejection_reason, admin_notes } = validation.data.body;

    const [request] = await query(
      `SELECT * FROM school_location_update_requests 
       WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!request) {
      throw new NotFoundError('Request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictError('Request has already been processed');
    }

    await query(
      `UPDATE school_location_update_requests 
       SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [rejection_reason, req.user.id, admin_notes, parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Request rejected',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location requests by school
 * GET /:institutionId/school-update-requests/location/by-school/:schoolId
 */
const getLocationRequestsBySchool = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;

    const requests = await query(
      `SELECT slur.*, 
              sess.name as session_name,
              u.name as reviewed_by_name
       FROM school_location_update_requests slur
       LEFT JOIN academic_sessions sess ON slur.session_id = sess.id
       LEFT JOIN users u ON slur.reviewed_by = u.id
       WHERE slur.institution_school_id = ? AND slur.institution_id = ?
       ORDER BY slur.created_at DESC`,
      [parseInt(schoolId), parseInt(institutionId)]
    );

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

/**
 * Get location request statistics
 * GET /:institutionId/school-update-requests/location/statistics
 */
const getLocationStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM school_location_update_requests
      WHERE institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND session_id = ?';
      params.push(parseInt(session_id));
    }

    const [stats] = await query(sql, params);

    res.json({
      success: true,
      data: {
        total: stats?.total || 0,
        pending: stats?.pending || 0,
        approved: stats?.approved || 0,
        rejected: stats?.rejected || 0,
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
  // Validation schemas
  schemas,
  
  // Principal requests
  getPrincipalRequests,
  getPrincipalRequestById,
  approvePrincipalRequest,
  rejectPrincipalRequest,
  getPrincipalRequestsBySchool,
  getPrincipalStatistics,
  
  // Location requests
  getLocationRequests,
  getLocationRequestById,
  approveLocationRequest,
  rejectLocationRequest,
  getLocationRequestsBySchool,
  getLocationStatistics,
  
  // Generic aliases for routes (combines both request types)
  getAll: async (req, res, next) => {
    // Combine both principal and location requests
    try {
      const { institutionId } = req.params;
      const { type, status, school_id, page = 1, limit = 50 } = req.query;
      
      let requests = [];
      
      // Get principal requests if type is not specified or is 'principal'
      if (!type || type === 'principal') {
        const principalReq = { ...req };
        principalReq.query = { status, school_id, page, limit };
        
        const principalRequests = await query(
          `SELECT 'principal' as request_type, spur.*, ms.name as school_name, ms.official_code as school_code,
                  u.full_name as submitted_by_name, au.full_name as approved_by_name
           FROM school_principal_update_requests spur
           LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
           LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
           LEFT JOIN users u ON spur.submitted_by = u.id
           LEFT JOIN users au ON spur.approved_by = au.id
           WHERE spur.institution_id = ?
           ${status ? 'AND spur.status = ?' : ''}
           ${school_id ? 'AND spur.institution_school_id = ?' : ''}
           ORDER BY spur.created_at DESC`,
          [parseInt(institutionId), ...(status ? [status] : []), ...(school_id ? [school_id] : [])]
        );
        requests = requests.concat(principalRequests);
      }
      
      // Get location requests if type is not specified or is 'location'
      if (!type || type === 'location') {
        const locationRequests = await query(
          `SELECT 'location' as request_type, slur.*, ms.name as school_name, ms.official_code as school_code,
                  u.full_name as submitted_by_name, au.full_name as approved_by_name
           FROM school_location_update_requests slur
           LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
           LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
           LEFT JOIN users u ON slur.submitted_by = u.id
           LEFT JOIN users au ON slur.approved_by = au.id
           WHERE slur.institution_id = ?
           ${status ? 'AND slur.status = ?' : ''}
           ${school_id ? 'AND slur.institution_school_id = ?' : ''}
           ORDER BY slur.created_at DESC`,
          [parseInt(institutionId), ...(status ? [status] : []), ...(school_id ? [school_id] : [])]
        );
        requests = requests.concat(locationRequests);
      }
      
      // Sort combined results by date
      requests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      res.json({
        success: true,
        data: requests.slice((page - 1) * limit, page * limit),
        pagination: {
          total: requests.length,
          page: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
  
  getById: async (req, res, next) => {
    // Try principal first, then location
    try {
      const { institutionId, id } = req.params;
      
      let request = await query(
        `SELECT 'principal' as request_type, spur.*, ms.name as school_name
         FROM school_principal_update_requests spur
         LEFT JOIN institution_schools isv ON spur.institution_school_id = isv.id
         LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
         WHERE spur.id = ? AND spur.institution_id = ?`,
        [id, parseInt(institutionId)]
      );
      
      if (!request.length) {
        request = await query(
          `SELECT 'location' as request_type, slur.*, ms.name as school_name
           FROM school_location_update_requests slur
           LEFT JOIN institution_schools isv ON slur.institution_school_id = isv.id
           LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
           WHERE slur.id = ? AND slur.institution_id = ?`,
          [id, parseInt(institutionId)]
        );
      }
      
      if (!request.length) {
        throw new NotFoundError('Update request not found');
      }
      
      res.json({ success: true, data: request[0] });
    } catch (error) {
      next(error);
    }
  },
  
  getBySchool: async (req, res, next) => {
    try {
      const { institutionId, schoolId } = req.params;
      
      const principalRequests = await query(
        `SELECT 'principal' as request_type, spur.* 
         FROM school_principal_update_requests spur
         WHERE spur.institution_school_id = ? AND spur.institution_id = ?
         ORDER BY spur.created_at DESC`,
        [schoolId, parseInt(institutionId)]
      );
      
      const locationRequests = await query(
        `SELECT 'location' as request_type, slur.* 
         FROM school_location_update_requests slur
         WHERE slur.institution_school_id = ? AND slur.institution_id = ?
         ORDER BY slur.created_at DESC`,
        [schoolId, parseInt(institutionId)]
      );
      
      res.json({
        success: true,
        data: {
          principal: principalRequests,
          location: locationRequests,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  
  create: async (req, res, next) => {
    // Delegate to appropriate create based on type
    const { type } = req.body;
    if (type === 'location') {
      // Import inline since we can't reference before export
      const { query } = require('../db/database');
      const { institutionId } = req.params;
      const { school_id, new_latitude, new_longitude, reason } = req.body;
      
      const result = await query(
        `INSERT INTO school_location_update_requests 
         (institution_id, institution_school_id, new_latitude, new_longitude, reason, submitted_by, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [parseInt(institutionId), school_id, new_latitude, new_longitude, reason, req.user.id]
      );
      
      res.status(201).json({ 
        success: true, 
        data: { id: result.insertId }, 
        message: 'Location update request submitted' 
      });
    } else {
      // Principal update
      const { query } = require('../db/database');
      const { institutionId } = req.params;
      const { school_id, new_principal_name, new_principal_phone, new_principal_email, reason } = req.body;
      
      const result = await query(
        `INSERT INTO school_principal_update_requests 
         (institution_id, institution_school_id, new_principal_name, new_principal_phone, new_principal_email, reason, submitted_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [parseInt(institutionId), school_id, new_principal_name, new_principal_phone, new_principal_email, reason, req.user.id]
      );
      
      res.status(201).json({ 
        success: true, 
        data: { id: result.insertId }, 
        message: 'Principal update request submitted' 
      });
    }
  },
  
  approve: async (req, res, next) => {
    // Determine type and delegate
    try {
      const { institutionId, id } = req.params;
      const { query } = require('../db/database');
      
      // Check principal first
      let [request] = await query(
        'SELECT * FROM school_principal_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return approvePrincipalRequest(req, res, next);
      }
      
      // Check location
      [request] = await query(
        'SELECT * FROM school_location_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return approveLocationRequest(req, res, next);
      }
      
      throw new NotFoundError('Update request not found');
    } catch (error) {
      next(error);
    }
  },
  
  reject: async (req, res, next) => {
    // Determine type and delegate
    try {
      const { institutionId, id } = req.params;
      const { query } = require('../db/database');
      
      // Check principal first
      let [request] = await query(
        'SELECT * FROM school_principal_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return rejectPrincipalRequest(req, res, next);
      }
      
      // Check location
      [request] = await query(
        'SELECT * FROM school_location_update_requests WHERE id = ? AND institution_id = ?',
        [id, parseInt(institutionId)]
      );
      
      if (request) {
        return rejectLocationRequest(req, res, next);
      }
      
      throw new NotFoundError('Update request not found');
    } catch (error) {
      next(error);
    }
  },
};
