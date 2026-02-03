/**
 * Rank Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles Staff Ranks and allowance configuration
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      name: z.string().min(2, 'Rank name must be at least 2 characters'),
      code: z.string().min(1, 'Rank code is required').max(20),
      local_running_allowance: z.number().min(0).optional(),
      transport_per_km: z.number().min(0).optional(),
      dsa: z.number().min(0).optional(),
      dta: z.number().min(0).optional(),
      tetfund: z.number().min(0).optional(),
      other_allowances: z.array(z.object({
        name: z.string(),
        amount: z.number().min(0),
      })).optional().nullable(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      code: z.string().min(1).max(20).optional(),
      local_running_allowance: z.number().min(0).optional(),
      transport_per_km: z.number().min(0).optional(),
      dsa: z.number().min(0).optional(),
      dta: z.number().min(0).optional(),
      tetfund: z.number().min(0).optional(),
      other_allowances: z.array(z.object({
        name: z.string(),
        amount: z.number().min(0),
      })).optional().nullable(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

/**
 * Get all ranks
 * GET /:institutionId/ranks
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { status, search, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT r.id, r.institution_id, r.name, r.code,
             r.local_running_allowance, r.transport_per_km,
             r.dsa, r.dta, r.tetfund, r.other_allowances,
             r.status, r.created_at, r.updated_at,
             COUNT(u.id) as user_count
      FROM ranks r
      LEFT JOIN users u ON r.id = u.rank_id AND u.status = 'active'
      WHERE r.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (status) {
      sql += ' AND r.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (r.name LIKE ? OR r.code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' GROUP BY r.id ORDER BY r.name ASC';

    const ranks = await query(sql, params);

    // Parse other_allowances JSON
    const parsedRanks = ranks.map(rank => ({
      ...rank,
      other_allowances: rank.other_allowances ? JSON.parse(rank.other_allowances) : null,
    }));

    res.json({ success: true, data: parsedRanks });
  } catch (error) {
    next(error);
  }
};

/**
 * Get rank by ID
 * GET /:institutionId/ranks/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const ranks = await query(
      'SELECT * FROM ranks WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (ranks.length === 0) {
      throw new NotFoundError('Rank not found');
    }

    const rank = ranks[0];
    
    // Parse other_allowances JSON
    if (rank.other_allowances) {
      rank.other_allowances = JSON.parse(rank.other_allowances);
    }

    // Get users with this rank
    const users = await query(
      `SELECT id, name, email, file_number 
       FROM users 
       WHERE rank_id = ? AND institution_id = ? AND status = 'active'
       ORDER BY name`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...rank,
        users,
        user_count: users.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new rank
 * POST /:institutionId/ranks
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const {
      name,
      code,
      local_running_allowance = 0,
      transport_per_km = 0,
      dsa = 0,
      dta = 0,
      tetfund = 0,
      other_allowances = null,
      status = 'active',
    } = req.body;

    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM ranks WHERE institution_id = ? AND code = ?',
      [parseInt(institutionId), code]
    );

    if (existing.length > 0) {
      throw new ConflictError('A rank with this code already exists');
    }

    const result = await query(
      `INSERT INTO ranks (
        institution_id, name, code, local_running_allowance,
        transport_per_km, dsa, dta, tetfund, other_allowances, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(institutionId),
        name,
        code,
        parseFloat(local_running_allowance) || 0,
        parseFloat(transport_per_km) || 0,
        parseFloat(dsa) || 0,
        parseFloat(dta) || 0,
        parseFloat(tetfund) || 0,
        other_allowances ? JSON.stringify(other_allowances) : null,
        status,
      ]
    );

    const [rank] = await query('SELECT * FROM ranks WHERE id = ?', [result.insertId]);
    
    // Parse other_allowances
    if (rank.other_allowances) {
      rank.other_allowances = JSON.parse(rank.other_allowances);
    }

    res.status(201).json({
      success: true,
      message: 'Rank created successfully',
      data: rank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a rank
 * PUT /:institutionId/ranks/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const updates = req.body;

    // Check if rank exists
    const existing = await query(
      'SELECT id FROM ranks WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Rank not found');
    }

    // Check for duplicate code
    if (updates.code) {
      const duplicate = await query(
        'SELECT id FROM ranks WHERE institution_id = ? AND code = ? AND id != ?',
        [parseInt(institutionId), updates.code, parseInt(id)]
      );

      if (duplicate.length > 0) {
        throw new ConflictError('A rank with this code already exists');
      }
    }

    // Build update query dynamically
    const allowedFields = [
      'name', 'code', 'local_running_allowance', 'transport_per_km',
      'dsa', 'dta', 'tetfund', 'status'
    ];

    const updateFields = [];
    const updateParams = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        if (['local_running_allowance', 'transport_per_km', 'dsa', 'dta', 'tetfund'].includes(field)) {
          updateParams.push(parseFloat(updates[field]) || 0);
        } else {
          updateParams.push(updates[field]);
        }
      }
    }

    // Handle other_allowances separately (JSON field)
    if (updates.other_allowances !== undefined) {
      updateFields.push('other_allowances = ?');
      updateParams.push(updates.other_allowances ? JSON.stringify(updates.other_allowances) : null);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE ranks SET ${updateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      updateParams
    );

    const [rank] = await query('SELECT * FROM ranks WHERE id = ?', [parseInt(id)]);
    
    // Parse other_allowances
    if (rank.other_allowances) {
      rank.other_allowances = JSON.parse(rank.other_allowances);
    }

    res.json({
      success: true,
      message: 'Rank updated successfully',
      data: rank,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a rank
 * DELETE /:institutionId/ranks/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if rank exists
    const existing = await query(
      'SELECT id, name FROM ranks WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Rank not found');
    }

    // Check for users with this rank
    const [userCount] = await query(
      'SELECT COUNT(*) as count FROM users WHERE rank_id = ?',
      [parseInt(id)]
    );

    if (userCount.count > 0) {
      throw new ConflictError('Cannot delete rank with assigned staff members');
    }

    await query(
      'DELETE FROM ranks WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `Rank "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate allowances for a rank based on distance
 * POST /:institutionId/ranks/:id/calculate-allowance
 */
const calculateAllowance = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { distance_km, location_category, session_id } = req.body;

    if (distance_km === undefined) {
      throw new ValidationError('Distance is required');
    }

    // Get rank
    const ranks = await query(
      'SELECT * FROM ranks WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (ranks.length === 0) {
      throw new NotFoundError('Rank not found');
    }

    const rank = ranks[0];

    // Get session settings if provided
    let session = null;
    if (session_id) {
      const sessions = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [parseInt(session_id), parseInt(institutionId)]
      );
      if (sessions.length > 0) {
        session = sessions[0];
      }
    }

    // Calculate allowances based on distance and session settings
    const distanceKm = parseFloat(distance_km);
    const insideThreshold = session?.inside_distance_threshold_km || 10;
    const isInside = location_category === 'inside' || distanceKm <= insideThreshold;
    const dsaEnabled = session?.dsa_enabled || false;
    const dsaMinKm = session?.dsa_min_distance_km || 11;
    const dsaMaxKm = session?.dsa_max_distance_km || 30;
    const dsaPercentage = session?.dsa_percentage || 50;

    let allowance = {};

    if (isInside) {
      // Inside: Local running allowance + transport per km
      allowance = {
        type: 'inside',
        local_running: parseFloat(rank.local_running_allowance) || 0,
        transport: (parseFloat(rank.transport_per_km) || 0) * distanceKm,
        dsa: 0,
        dta: 0,
        tetfund: 0,
        total: 0,
      };
      allowance.total = allowance.local_running + allowance.transport;
    } else if (dsaEnabled && distanceKm >= dsaMinKm && distanceKm <= dsaMaxKm) {
      // DSA range
      const dtaValue = parseFloat(rank.dta) || 0;
      const dsaValue = dtaValue * (dsaPercentage / 100);
      allowance = {
        type: 'dsa',
        local_running: 0,
        transport: 0,
        dsa: dsaValue,
        dta: 0,
        tetfund: parseFloat(rank.tetfund) || 0,
        total: 0,
      };
      allowance.total = allowance.dsa + allowance.tetfund;
    } else {
      // Outside (DTA applies)
      allowance = {
        type: 'outside',
        local_running: 0,
        transport: 0,
        dsa: 0,
        dta: parseFloat(rank.dta) || 0,
        tetfund: parseFloat(rank.tetfund) || 0,
        total: 0,
      };
      allowance.total = allowance.dta + allowance.tetfund;
    }

    // Add other allowances if any
    let otherTotal = 0;
    if (rank.other_allowances) {
      const others = JSON.parse(rank.other_allowances);
      if (Array.isArray(others)) {
        otherTotal = others.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      }
    }
    allowance.other_allowances = otherTotal;
    allowance.total += otherTotal;

    res.json({
      success: true,
      data: {
        rank_id: rank.id,
        rank_name: rank.name,
        distance_km: distanceKm,
        location_category: isInside ? 'inside' : (allowance.type === 'dsa' ? 'dsa_range' : 'outside'),
        allowance,
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
  calculateAllowance,
};
