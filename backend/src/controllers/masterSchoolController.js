/**
 * Master School Controller
 * 
 * Super admin only controller for managing the central schools registry.
 * Provides global operations across all schools (not institution-scoped).
 * 
 * MedeePay Pattern: Global routes without institutionId
 */

const { z } = require('zod');
const XLSX = require('xlsx');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      name: z.string().min(2, 'School name must be at least 2 characters'),
      official_code: z.string().optional().nullable(),
      school_type: z.enum(['primary', 'junior', 'senior', 'both']).optional(),
      category: z.enum(['public', 'private', 'others']).optional(),
      state: z.string().min(1, 'State is required'),
      lga: z.string().min(1, 'LGA is required'),
      ward: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      principal_name: z.string().optional().nullable(),
      principal_phone: z.string().optional().nullable(),
      latitude: z.number().optional().nullable(),
      longitude: z.number().optional().nullable(),
      is_verified: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
    }),
  }),

  update: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      official_code: z.string().optional().nullable(),
      school_type: z.enum(['primary', 'junior', 'senior', 'both']).optional(),
      category: z.enum(['public', 'private', 'others']).optional(),
      state: z.string().optional().nullable(),
      lga: z.string().optional().nullable(),
      ward: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      principal_name: z.string().optional().nullable(),
      principal_phone: z.string().optional().nullable(),
      latitude: z.number().optional().nullable(),
      longitude: z.number().optional().nullable(),
      status: z.enum(['active', 'inactive', 'merged']).optional(),
      is_verified: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
    }),
  }),

  merge: z.object({
    body: z.object({
      source_ids: z.array(z.number().int().positive()).min(1, 'At least one source school required'),
      target_id: z.number().int().positive('Target school ID is required'),
    }),
  }),

  search: z.object({
    query: z.object({
      search: z.string().optional(),
      state: z.string().optional(),
      lga: z.string().optional(),
      school_type: z.string().optional(),
      category: z.string().optional(),
      is_verified: z.string().optional(),
      status: z.string().optional(),
      limit: z.string().optional(),
      offset: z.string().optional(),
    }),
  }),
};

/**
 * Get all master schools (global)
 * GET /api/global/master-schools
 */
const getAll = async (req, res, next) => {
  try {
    const {
      search,
      state,
      lga,
      school_type,
      category,
      is_verified,
      status = 'active',
      limit = 100,
      offset = 0,
    } = req.query;

    let sql = `
      SELECT 
        ms.id, ms.name, ms.official_code, ms.school_type, ms.category,
        ms.state, ms.lga, ms.ward, ms.address,
        ms.principal_name, ms.principal_phone,
        ms.is_verified, ms.status,
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
        ms.created_at, ms.updated_at,
        ms.created_by_institution_id, ms.merged_into_id,
        i.name as created_by_institution_name,
        (SELECT COUNT(*) FROM institution_schools WHERE master_school_id = ms.id) as linked_institutions_count
      FROM master_schools ms
      LEFT JOIN institutions i ON ms.created_by_institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND ms.status = ?';
      params.push(status);
    }
    if (state) {
      sql += ' AND ms.state = ?';
      params.push(state);
    }
    if (lga) {
      sql += ' AND ms.lga = ?';
      params.push(lga);
    }
    if (school_type) {
      sql += ' AND ms.school_type = ?';
      params.push(school_type);
    }
    if (category) {
      sql += ' AND ms.category = ?';
      params.push(category);
    }
    if (is_verified !== undefined) {
      sql += ' AND ms.is_verified = ?';
      params.push(is_verified === 'true' || is_verified === '1' ? 1 : 0);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR ms.official_code LIKE ? OR ms.ward LIKE ? OR ms.lga LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Count query
    const countParams = [...params];
    let countSql = sql.replace(/SELECT[\s\S]*?FROM master_schools/i, 'SELECT COUNT(*) as total FROM master_schools');
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY ms.is_verified DESC, ms.name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const schools = await query(sql, params);

    res.json({
      success: true,
      data: schools,
      meta: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get master school by ID
 * GET /api/global/master-schools/:id
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const schools = await query(
      `SELECT 
        ms.id, ms.name, ms.official_code, ms.school_type, ms.category,
        ms.state, ms.lga, ms.ward, ms.address,
        ms.principal_name, ms.principal_phone,
        ms.is_verified, ms.status,
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
        ms.created_at, ms.updated_at,
        ms.created_by_institution_id, ms.merged_into_id,
        i.name as created_by_institution_name
      FROM master_schools ms
      LEFT JOIN institutions i ON ms.created_by_institution_id = i.id
      WHERE ms.id = ?`,
      [parseInt(id)]
    );

    if (schools.length === 0) {
      throw new NotFoundError('Master school not found');
    }

    // Get linked institutions
    const linkedInstitutions = await query(
      `SELECT 
        isv.id as institution_school_id, isv.status,
        isv.student_capacity, isv.distance_km, isv.location_category,
        inst.id as institution_id, inst.name as institution_name, inst.code as institution_code
      FROM institution_schools isv
      JOIN institutions inst ON isv.institution_id = inst.id
      WHERE isv.master_school_id = ?`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      data: {
        ...schools[0],
        linked_institutions: linkedInstitutions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new master school
 * POST /api/global/master-schools
 */
const create = async (req, res, next) => {
  try {
    const {
      name, official_code, school_type, category,
      state, lga, ward, address,
      principal_name, principal_phone,
      latitude, longitude, is_verified
    } = req.body;

    // Check for duplicate
    const existing = await query(
      `SELECT id FROM master_schools WHERE name = ? AND state = ? AND lga = ?`,
      [name, state, lga]
    );

    if (existing.length > 0) {
      throw new ConflictError('A school with this name already exists in this state/LGA');
    }

    let insertSql = `
      INSERT INTO master_schools (
        name, official_code, school_type, category, state, lga, ward, address,
        principal_name, principal_phone, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const insertParams = [
      name,
      official_code || null,
      school_type || 'senior',
      category || 'public',
      state,
      lga,
      ward || null,
      address || null,
      principal_name || null,
      principal_phone || null,
      is_verified ? 1 : 0
    ];

    if (latitude && longitude) {
      insertSql = `
        INSERT INTO master_schools (
          name, official_code, school_type, category, state, lga, ward, address,
          principal_name, principal_phone, is_verified, location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?))
      `;
      insertParams.push(`POINT(${parseFloat(latitude)} ${parseFloat(longitude)})`);
    }

    const result = await query(insertSql, insertParams);

    const [school] = await query(
      `SELECT ms.*, ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude
       FROM master_schools ms WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Master school created successfully',
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a master school
 * PUT /api/global/master-schools/:id
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await query(
      'SELECT id FROM master_schools WHERE id = ?',
      [parseInt(id)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Master school not found');
    }

    const allowedFields = [
      'name', 'official_code', 'school_type', 'category',
      'state', 'lga', 'ward', 'address',
      'principal_name', 'principal_phone', 'status', 'is_verified'
    ];

    const updateFields = [];
    const updateParams = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateParams.push(field === 'is_verified' ? (updates[field] ? 1 : 0) : updates[field]);
      }
    }

    if (updates.latitude !== undefined && updates.longitude !== undefined) {
      updateFields.push('location = ST_GeomFromText(?)');
      updateParams.push(`POINT(${parseFloat(updates.latitude)} ${parseFloat(updates.longitude)})`);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id));

    await query(
      `UPDATE master_schools SET ${updateFields.join(', ')} WHERE id = ?`,
      updateParams
    );

    const [school] = await query(
      `SELECT ms.*, ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude
       FROM master_schools ms WHERE id = ?`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Master school updated successfully',
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a master school (only if not linked)
 * DELETE /api/global/master-schools/:id
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await query(
      'SELECT id, name FROM master_schools WHERE id = ?',
      [parseInt(id)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Master school not found');
    }

    // Check if linked to any institutions
    const linked = await query(
      'SELECT COUNT(*) as count FROM institution_schools WHERE master_school_id = ?',
      [parseInt(id)]
    );

    if (linked[0].count > 0) {
      throw new ConflictError(`Cannot delete master school linked to ${linked[0].count} institution(s). Unlink first or merge instead.`);
    }

    await query('DELETE FROM master_schools WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: `Master school "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify a master school
 * POST /api/global/master-schools/:id/verify
 */
const verify = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await query(
      'SELECT id, name FROM master_schools WHERE id = ?',
      [parseInt(id)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Master school not found');
    }

    await query(
      'UPDATE master_schools SET is_verified = 1, verified_at = NOW() WHERE id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: `School "${existing[0].name}" verified successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Merge duplicate schools
 * POST /api/global/master-schools/merge
 * 
 * Merges source schools into target school. All institution_schools pointing to 
 * source schools will be redirected to the target.
 */
const merge = async (req, res, next) => {
  try {
    const { source_ids, target_id } = req.body;

    // Validate target exists
    const target = await query(
      'SELECT id, name FROM master_schools WHERE id = ? AND status = ?',
      [parseInt(target_id), 'active']
    );

    if (target.length === 0) {
      throw new NotFoundError('Target school not found or not active');
    }

    // Validate sources exist
    const sources = await query(
      `SELECT id, name FROM master_schools WHERE id IN (?) AND status = 'active'`,
      [source_ids.map(id => parseInt(id))]
    );

    if (sources.length !== source_ids.length) {
      throw new ValidationError('One or more source schools not found or not active');
    }

    // Cannot merge into self
    if (source_ids.includes(target_id)) {
      throw new ValidationError('Cannot merge a school into itself');
    }

    await transaction(async (conn) => {
      // Update all institution_schools to point to target
      for (const sourceId of source_ids) {
        // Check for conflicts (institution already linked to target)
        const [conflicts] = await conn.execute(
          `SELECT isv_source.id, isv_source.institution_id
           FROM institution_schools isv_source
           JOIN institution_schools isv_target ON isv_source.institution_id = isv_target.institution_id
           WHERE isv_source.master_school_id = ? AND isv_target.master_school_id = ?`,
          [sourceId, target_id]
        );

        if (conflicts.length > 0) {
          // Delete the conflicting source links (keep target)
          await conn.execute(
            'DELETE FROM institution_schools WHERE master_school_id = ? AND institution_id IN (?)',
            [sourceId, conflicts.map(c => c.institution_id)]
          );
        }

        // Update remaining to point to target
        await conn.execute(
          'UPDATE institution_schools SET master_school_id = ? WHERE master_school_id = ?',
          [target_id, sourceId]
        );

        // Mark source as merged
        await conn.execute(
          'UPDATE master_schools SET status = ?, merged_into_id = ? WHERE id = ?',
          ['merged', target_id, sourceId]
        );
      }
    });

    res.json({
      success: true,
      message: `${sources.length} school(s) merged into "${target[0].name}"`,
      data: {
        target_id: target_id,
        merged_count: sources.length,
        merged_schools: sources.map(s => s.name),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Find potential duplicates
 * GET /api/global/master-schools/duplicates
 */
const findDuplicates = async (req, res, next) => {
  try {
    const { state, lga, limit = 50 } = req.query;

    let sql = `
      SELECT 
        ms1.id as school1_id, ms1.name as school1_name,
        ms2.id as school2_id, ms2.name as school2_name,
        ms1.state, ms1.lga, ms1.ward,
        (SELECT COUNT(*) FROM institution_schools WHERE master_school_id = ms1.id) as school1_links,
        (SELECT COUNT(*) FROM institution_schools WHERE master_school_id = ms2.id) as school2_links
      FROM master_schools ms1
      JOIN master_schools ms2 ON ms1.state = ms2.state 
        AND ms1.lga = ms2.lga 
        AND ms1.id < ms2.id
        AND (
          ms1.name = ms2.name 
          OR SOUNDEX(ms1.name) = SOUNDEX(ms2.name)
          OR ms1.name LIKE CONCAT('%', ms2.name, '%')
          OR ms2.name LIKE CONCAT('%', ms1.name, '%')
        )
      WHERE ms1.status = 'active' AND ms2.status = 'active'
    `;
    const params = [];

    if (state) {
      sql += ' AND ms1.state = ?';
      params.push(state);
    }
    if (lga) {
      sql += ' AND ms1.lga = ?';
      params.push(lga);
    }

    sql += ' ORDER BY ms1.state, ms1.lga, ms1.name LIMIT ?';
    params.push(parseInt(limit));

    const duplicates = await query(sql, params);

    res.json({
      success: true,
      data: duplicates,
      meta: {
        count: duplicates.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get statistics
 * GET /api/global/master-schools/stats
 */
const getStats = async (req, res, next) => {
  try {
    const [stats] = await query(`
      SELECT 
        COUNT(*) as total_schools,
        SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified_schools,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_schools,
        SUM(CASE WHEN status = 'merged' THEN 1 ELSE 0 END) as merged_schools,
        COUNT(DISTINCT state) as states_covered,
        COUNT(DISTINCT lga) as lgas_covered
      FROM master_schools
    `);

    const byState = await query(`
      SELECT state, COUNT(*) as count
      FROM master_schools
      WHERE status = 'active'
      GROUP BY state
      ORDER BY count DESC
      LIMIT 10
    `);

    const byType = await query(`
      SELECT school_type, COUNT(*) as count
      FROM master_schools
      WHERE status = 'active'
      GROUP BY school_type
    `);

    const linkedStats = await query(`
      SELECT 
        COUNT(*) as total_links,
        COUNT(DISTINCT master_school_id) as schools_linked,
        COUNT(DISTINCT institution_id) as institutions_using
      FROM institution_schools
    `);

    res.json({
      success: true,
      data: {
        ...stats,
        ...linkedStats[0],
        by_state: byState,
        by_type: byType,
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
  verify,
  merge,
  findDuplicates,
  getStats,
};
