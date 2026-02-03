/**
 * Route Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles Supervision Routes for organizing schools geographically
 * 
 * Note: Monitors are assigned to schools via monitor_assignments table,
 * not to routes directly. Routes are purely for school grouping.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      name: z.string().min(2, 'Route name must be at least 2 characters'),
      code: z.string().min(1, 'Route code is required').max(20),
      description: z.string().optional().nullable(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      code: z.string().min(1).max(20).optional(),
      description: z.string().optional().nullable(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

/**
 * Get all routes
 * GET /:institutionId/routes
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { status, search } = req.query;

    let sql = `
      SELECT r.id, r.institution_id, r.name, r.code, r.description,
             r.status, r.created_at, r.updated_at,
             COUNT(DISTINCT isv.id) as school_count
      FROM routes r
      LEFT JOIN institution_schools isv ON r.id = isv.route_id AND isv.institution_id = r.institution_id
      WHERE r.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (r.name LIKE ? OR r.code LIKE ? OR r.description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' GROUP BY r.id ORDER BY r.name ASC';

    const routes = await query(sql, params);

    res.json({ success: true, data: routes });
  } catch (error) {
    next(error);
  }
};

/**
 * Get route by ID with assigned schools
 * GET /:institutionId/routes/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const routes = await query(
      'SELECT * FROM routes WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (routes.length === 0) {
      throw new NotFoundError('Route not found');
    }

    const route = routes[0];

    // Get assigned schools
    const schools = await query(
      `SELECT isv.id, ms.name, ms.official_code as code, ms.address, ms.state, ms.lga, ms.ward
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.route_id = ? AND isv.institution_id = ?
       ORDER BY ms.name`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...route,
        schools,
        school_count: schools.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new route
 * POST /:institutionId/routes
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { name, code, description = null, status = 'active' } = req.body;

    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM routes WHERE institution_id = ? AND code = ?',
      [parseInt(institutionId), code]
    );

    if (existing.length > 0) {
      throw new ConflictError('A route with this code already exists');
    }

    const result = await query(
      'INSERT INTO routes (institution_id, name, code, description, status) VALUES (?, ?, ?, ?, ?)',
      [parseInt(institutionId), name, code, description, status]
    );

    const [route] = await query('SELECT * FROM routes WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      data: route,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a route
 * PUT /:institutionId/routes/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const updates = req.body;

    // Check if route exists
    const existing = await query(
      'SELECT id FROM routes WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Route not found');
    }

    // Check for duplicate code
    if (updates.code) {
      const duplicate = await query(
        'SELECT id FROM routes WHERE institution_id = ? AND code = ? AND id != ?',
        [parseInt(institutionId), updates.code, parseInt(id)]
      );

      if (duplicate.length > 0) {
        throw new ConflictError('A route with this code already exists');
      }
    }

    // Build update query dynamically
    const allowedFields = ['name', 'code', 'description', 'status'];
    const updateFields = [];
    const updateParams = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateParams.push(updates[field]);
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE routes SET ${updateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      updateParams
    );

    const [route] = await query('SELECT * FROM routes WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: 'Route updated successfully',
      data: route,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a route
 * DELETE /:institutionId/routes/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if route exists
    const existing = await query(
      'SELECT id, name FROM routes WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Route not found');
    }

    // Check for school assignments
    const [schoolAssignments] = await query(
      'SELECT COUNT(*) as count FROM institution_schools WHERE route_id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (schoolAssignments.count > 0) {
      throw new ConflictError('Cannot delete route with assigned schools. Remove school assignments first.');
    }

    await query(
      'DELETE FROM routes WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `Route "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign schools to a route
 * POST /:institutionId/routes/:id/assign-schools
 */
const assignSchools = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { school_ids, replace = false } = req.body;

    if (!Array.isArray(school_ids) || school_ids.length === 0) {
      throw new ValidationError('At least one school ID is required');
    }

    // Verify route exists
    const routeExists = await query(
      'SELECT id FROM routes WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (routeExists.length === 0) {
      throw new NotFoundError('Route not found');
    }

    // Verify all schools exist and belong to this institution
    const schoolIdsInt = school_ids.map(s => parseInt(s));
    const schools = await query(
      `SELECT id FROM institution_schools WHERE id IN (${schoolIdsInt.map(() => '?').join(',')}) AND institution_id = ?`,
      [...schoolIdsInt, parseInt(institutionId)]
    );

    if (schools.length !== school_ids.length) {
      throw new ValidationError('One or more schools not found');
    }

    await transaction(async (conn) => {
      // Remove existing assignments if replacing
      if (replace) {
        await conn.execute(
          'UPDATE institution_schools SET route_id = NULL WHERE route_id = ? AND institution_id = ?',
          [parseInt(id), parseInt(institutionId)]
        );
      }

      // Assign schools to this route
      for (const schoolId of schoolIdsInt) {
        await conn.execute(
          'UPDATE institution_schools SET route_id = ? WHERE id = ? AND institution_id = ?',
          [parseInt(id), schoolId, parseInt(institutionId)]
        );
      }
    });

    // Get updated route with assignments
    const route = await query(
      `SELECT r.*, COUNT(isv.id) as school_count
       FROM routes r
       LEFT JOIN institution_schools isv ON r.id = isv.route_id AND isv.institution_id = r.institution_id
       WHERE r.id = ?
       GROUP BY r.id`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: `${school_ids.length} schools assigned to route`,
      data: route[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove schools from a route
 * POST /:institutionId/routes/:id/remove-schools
 */
const removeSchools = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { school_ids } = req.body;

    if (!Array.isArray(school_ids) || school_ids.length === 0) {
      throw new ValidationError('At least one school ID is required');
    }

    // Verify route exists
    const routeExists = await query(
      'SELECT id FROM routes WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (routeExists.length === 0) {
      throw new NotFoundError('Route not found');
    }

    const schoolIdsInt = school_ids.map(s => parseInt(s));

    await query(
      `UPDATE institution_schools SET route_id = NULL WHERE route_id = ? AND institution_id = ? AND id IN (${schoolIdsInt.map(() => '?').join(',')})`,
      [parseInt(id), parseInt(institutionId), ...schoolIdsInt]
    );

    res.json({
      success: true,
      message: `${school_ids.length} schools removed from route`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get route statistics
 * GET /:institutionId/routes/:id/statistics
 */
const getStatistics = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    // Total routes
    const [totalRoutes] = await query(
      'SELECT COUNT(*) as count FROM routes WHERE institution_id = ?',
      [parseInt(institutionId)]
    );

    // Active routes
    const [activeRoutes] = await query(
      "SELECT COUNT(*) as count FROM routes WHERE institution_id = ? AND status = 'active'",
      [parseInt(institutionId)]
    );

    // Routes with no schools
    const emptyRoutes = await query(
      `SELECT r.id FROM routes r
       LEFT JOIN institution_schools isv ON r.id = isv.route_id AND isv.institution_id = r.institution_id
       WHERE r.institution_id = ?
       GROUP BY r.id
       HAVING COUNT(isv.id) = 0`,
      [parseInt(institutionId)]
    );

    // Average schools per route
    const [avgSchools] = await query(
      `SELECT AVG(school_count) as avg FROM (
         SELECT r.id, COUNT(isv.id) as school_count
         FROM routes r
         LEFT JOIN institution_schools isv ON r.id = isv.route_id AND isv.institution_id = r.institution_id
         WHERE r.institution_id = ?
         GROUP BY r.id
       ) as counts`,
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        total_routes: totalRoutes.count,
        active_routes: activeRoutes.count,
        inactive_routes: totalRoutes.count - activeRoutes.count,
        routes_without_schools: emptyRoutes?.length || 0,
        average_schools_per_route: Math.round((avgSchools?.avg || 0) * 10) / 10,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getAll,
  getById,
  create,
  update,
  remove,
  assignSchools,
  removeSchools,
  getStatistics,
};
