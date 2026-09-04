/**
 * School Controller
 * 
 * Central Schools Registry Architecture:
 * - master_schools: Central registry (editable by super_admin only via Master Schools page)
 * - institution_schools: Institution-specific data (editable by staff)
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 */

const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const { normalizeLocationValue, normalizeOptionalLocationValue } = require('../utils/locationNormalizer');

// Tables carrying a plain institution_school_id FK with no unique constraint on
// that column - safe to repoint with a single bulk UPDATE during a merge.
const MERGE_PLAIN_TABLES = [
  { table: 'student_acceptances', column: 'institution_school_id' },
  { table: 'supervisor_postings', column: 'institution_school_id' },
  { table: 'student_results', column: 'institution_school_id' },
  { table: 'monitor_assignments', column: 'institution_school_id' },
  { table: 'monitoring_reports', column: 'institution_school_id' },
  { table: 'school_location_update_requests', column: 'institution_school_id' },
  { table: 'school_principal_update_requests', column: 'institution_school_id' },
  { table: 'supervision_location_logs', column: 'institution_school_id' },
  { table: 'school_registration_requests', column: 'created_institution_school_id' },
];

/**
 * Validates that source/target both belong to this institution and are distinct.
 * Shared by the merge preview and the merge itself.
 */
const resolveMergePair = async (institutionId, sourceId, targetId) => {
  if (sourceId === targetId) {
    throw new ValidationError('Cannot merge a school into itself');
  }

  const rows = await query(
    `SELECT isv.id, ms.name
     FROM institution_schools isv
     JOIN master_schools ms ON isv.master_school_id = ms.id
     WHERE isv.id IN (?, ?) AND isv.institution_id = ?`,
    [sourceId, targetId, institutionId]
  );

  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === targetId);

  if (!source) throw new NotFoundError('Source school not found');
  if (!target) throw new NotFoundError('Target school not found');

  return { source, target };
};

/**
 * Groups don't live in a table of their own (see groupController.js): a "group" is
 * just the (institution_school_id, session_id, group_number) tuple on
 * student_acceptances. Since student_acceptances is already bulk-repointed by
 * MERGE_PLAIN_TABLES above, every group moves for free - the only thing worth
 * reporting is how many source groups land on a same-numbered target group in the
 * same session and end up combined.
 * `exec` is an (sql, params) => rows function - works with both the plain
 * `query` helper (preview, outside a transaction) and a conn.execute adapter
 * (actual merge, inside a transaction - must be called before the bulk repoint).
 */
const countGroupOverlap = async (exec, sourceId, targetId) => {
  const [{ total: totalGroups }] = await exec(
    'SELECT COUNT(DISTINCT session_id, group_number) as total FROM student_acceptances WHERE institution_school_id = ?',
    [sourceId]
  );
  const [{ total: conflicts }] = await exec(
    `SELECT COUNT(DISTINCT src.session_id, src.group_number) as total
     FROM student_acceptances src
     WHERE src.institution_school_id = ?
       AND EXISTS (
         SELECT 1 FROM student_acceptances tgt
         WHERE tgt.institution_school_id = ?
           AND tgt.session_id = src.session_id
           AND tgt.group_number = src.group_number
       )`,
    [sourceId, targetId]
  );
  return { totalGroups, conflicts };
};

/**
 * Plans how merged_groups rows move from source to target for both of its
 * institution_school_id-shaped columns. A row is dropped instead of repointed
 * if repointing would collide with an existing row (unique_merge_new /
 * unique_secondary_new) or would make primary == secondary (degenerate
 * self-merge once both sides point at the target).
 */
const planMergedGroupMoves = async (exec, sourceId, targetId) => {
  const primaryRows = await exec(
    `SELECT id, session_id, primary_group_number, secondary_institution_school_id, secondary_group_number
     FROM merged_groups WHERE primary_institution_school_id = ?`,
    [sourceId]
  );
  const secondaryRows = await exec(
    `SELECT id, session_id, secondary_group_number, primary_institution_school_id, primary_group_number
     FROM merged_groups WHERE secondary_institution_school_id = ?`,
    [sourceId]
  );

  const plan = { primary: [], secondary: [] };

  for (const row of primaryRows) {
    const degenerate = row.secondary_institution_school_id === targetId;
    let conflict = false;
    if (!degenerate) {
      const [existing] = await exec(
        `SELECT id FROM merged_groups
         WHERE session_id = ? AND primary_institution_school_id = ? AND primary_group_number = ?
           AND secondary_institution_school_id = ? AND secondary_group_number = ?`,
        [row.session_id, targetId, row.primary_group_number, row.secondary_institution_school_id, row.secondary_group_number]
      );
      conflict = Boolean(existing);
    }
    plan.primary.push({ id: row.id, drop: degenerate || conflict });
  }

  for (const row of secondaryRows) {
    const degenerate = row.primary_institution_school_id === targetId;
    let conflict = false;
    if (!degenerate) {
      const [existing] = await exec(
        `SELECT id FROM merged_groups
         WHERE session_id = ? AND primary_institution_school_id = ? AND primary_group_number = ?
           AND secondary_institution_school_id = ? AND secondary_group_number = ?`,
        [row.session_id, row.primary_institution_school_id, row.primary_group_number, targetId, row.secondary_group_number]
      );
      conflict = Boolean(existing);
    }
    plan.secondary.push({ id: row.id, drop: degenerate || conflict });
  }

  return plan;
};

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      // Master school data (for creating new schools)
      name: z.string().min(2, 'School name must be at least 2 characters'),
      school_type: z.enum(['primary', 'junior', 'senior', 'both']).optional(),
      category: z.enum(['public', 'private', 'others']).optional(),
      state: z.string().min(1, 'State is required').optional(),
      lga: z.string().min(1, 'LGA is required').optional(),
      ward: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      principal_name: z.string().optional().nullable(),
      principal_phone: z.string().optional().nullable(),
      latitude: z.number().optional().nullable(),
      longitude: z.number().optional().nullable(),
      
      // Institution-specific data
      location_category: z.enum(['inside', 'outside']).optional(),
      distance_km: z.number().min(0).optional(),
      student_capacity: z.number().int().min(0).optional(),
      route_id: z.number().int().positive().optional().nullable(),
      notes: z.string().optional().nullable(),

      // Optional: Link to existing master school
      master_school_id: z.number().int().positive().optional(),
    }),
  }),

  // Update only institution-specific fields (staff can do this)
  update: z.object({
    body: z.object({
      // Institution-specific fields ONLY
      location_category: z.enum(['inside', 'outside']).optional(),
      distance_km: z.number().min(0).optional(),
      student_capacity: z.number().int().min(0).optional(),
      route_id: z.number().int().positive().optional().nullable(),
      status: z.enum(['active', 'inactive']).optional(),
      notes: z.string().optional().nullable(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
  
  linkSchool: z.object({
    body: z.object({
      master_school_id: z.number().int().positive('Master school ID is required'),
      route_id: z.number().int().positive().optional().nullable(),
      location_category: z.enum(['inside', 'outside']).optional(),
      distance_km: z.number().min(0).optional(),
      student_capacity: z.number().int().min(0).optional(),
      notes: z.string().optional().nullable(),
    }),
  }),

  merge: z.object({
    body: z.object({
      target_id: z.number().int().positive('Target school ID is required'),
    }),
  }),
};

/**
 * Get all schools for an institution
 * GET /:institutionId/schools
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      route_id, 
      school_type, 
      category, 
      location_category, 
      state, 
      lga, 
      status,
      search,
      page,
      limit = 100,
      offset = 0
    } = req.query;

    const limitNum = Math.max(parseInt(limit) || 100, 1);
    // Support both page-based and offset-based pagination
    const offsetNum = page
      ? (Math.max(parseInt(page) || 1, 1) - 1) * limitNum
      : Math.max(parseInt(offset) || 0, 0);

    let sql = `
      SELECT 
        isv.id, 
        isv.institution_id, 
        isv.route_id, 
        ms.name, 
        ms.official_code as code,
        ms.school_type, 
        ms.category, 
        isv.location_category, 
        ms.state, 
        ms.lga, 
        ms.ward, 
        ms.address,
        isv.distance_km, 
        isv.student_capacity, 
        ms.principal_name,
        ms.principal_phone,
        isv.status,
        isv.notes,
        isv.created_at,
        isv.updated_at,
        r.name as route_name,
        r.code as route_code,
        ST_Latitude(ms.location) as latitude, 
        ST_Longitude(ms.location) as longitude,
        ms.id as master_school_id,
        ms.is_verified,
        ms.official_code
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE isv.institution_id = ?
    `;
    
    const params = [parseInt(institutionId)];

    if (route_id) {
      sql += ' AND isv.route_id = ?';
      params.push(parseInt(route_id));
    }
    if (school_type) {
      sql += ' AND ms.school_type = ?';
      params.push(school_type);
    }
    if (category) {
      sql += ' AND ms.category = ?';
      params.push(category);
    }
    if (location_category) {
      sql += ' AND isv.location_category = ?';
      params.push(location_category);
    }
    if (state) {
      sql += ' AND UPPER(ms.state) = ?';
      params.push(normalizeLocationValue(state));
    }
    if (lga) {
      sql += ' AND UPPER(ms.lga) = ?';
      params.push(normalizeLocationValue(lga));
    }
    if (status) {
      sql += ' AND isv.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (ms.name LIKE ? OR ms.official_code LIKE ? OR ms.ward LIKE ? OR ms.principal_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Count query
    const countParams = [...params];
    let countSql = `SELECT COUNT(*) as total FROM institution_schools isv 
                    JOIN master_schools ms ON isv.master_school_id = ms.id
                    WHERE isv.institution_id = ?`;
    
    const countConditions = [];
    if (route_id) countConditions.push('isv.route_id = ?');
    if (school_type) countConditions.push('ms.school_type = ?');
    if (category) countConditions.push('ms.category = ?');
    if (location_category) countConditions.push('isv.location_category = ?');
    if (state) countConditions.push('UPPER(ms.state) = ?');
    if (lga) countConditions.push('UPPER(ms.lga) = ?');
    if (status) countConditions.push('isv.status = ?');
    if (search) countConditions.push('(ms.name LIKE ? OR ms.official_code LIKE ? OR ms.ward LIKE ? OR ms.principal_name LIKE ?)');
    
    if (countConditions.length > 0) {
      countSql += ' AND ' + countConditions.join(' AND ');
    }
    
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY ms.name ASC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const schools = await query(sql, params);

    res.json({
      success: true,
      data: schools,
      meta: {
        total,
        limit: limitNum,
        offset: offsetNum,
        page: Math.floor(offsetNum / limitNum) + 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get school by ID
 * GET /:institutionId/schools/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const schools = await query(
      `SELECT 
        isv.id, isv.institution_id, isv.route_id, 
        ms.name, ms.official_code as code,
        ms.school_type, ms.category, isv.location_category, 
        ms.state, ms.lga, ms.ward, ms.address,
        isv.distance_km, isv.student_capacity, 
        ms.principal_name, ms.principal_phone,
        isv.status, isv.notes,
        isv.created_at, isv.updated_at,
        r.name as route_name, r.code as route_code,
        ST_Latitude(ms.location) as latitude, ST_Longitude(ms.location) as longitude,
        ms.id as master_school_id, ms.is_verified, ms.official_code
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE isv.id = ? AND isv.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (schools.length === 0) {
      throw new NotFoundError('School not found');
    }

    res.json({ success: true, data: schools[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new school
 * POST /:institutionId/schools
 * 
 * Can either:
 * 1. Create a new master school and link it to the institution
 * 2. Link an existing master school to the institution (if master_school_id provided)
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const {
      // Master school data
      name, school_type, category, state: rawState, lga: rawLga, ward: rawWard, address,
      principal_name, principal_phone, latitude, longitude,
      // Institution-specific data
      location_category, distance_km, student_capacity,
      route_id, notes,
      // Optional: link to existing master school
      master_school_id
    } = req.body;
    const state = normalizeLocationValue(rawState) || 'UNKNOWN';
    const lga = normalizeLocationValue(rawLga) || 'UNKNOWN';
    const ward = normalizeOptionalLocationValue(rawWard);

    let masterSchoolId = master_school_id;
    let createdSchoolId;

    await transaction(async (conn) => {
      if (!masterSchoolId) {
        // Check if a similar school already exists in master
        const [existing] = await conn.execute(
          `SELECT id FROM master_schools 
           WHERE name = ? AND UPPER(state) = ? AND UPPER(lga) = ? AND status = 'active'`,
          [name, state, lga]
        );

        if (existing.length > 0) {
          // School exists in master, just link it
          masterSchoolId = existing[0].id;
        } else {
          // Create new master school
          const schoolLat = latitude;
          const schoolLng = longitude;
          
          let insertMasterSql = `
            INSERT INTO master_schools (
              name, school_type, category, state, lga, ward, address,
              principal_name, principal_phone, created_by_institution_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const masterParams = [
            name,
            school_type || 'senior',
            category || 'public',
            state,
            lga,
            ward,
            address || null,
            principal_name || null,
            principal_phone || null,
            parseInt(institutionId)
          ];

          // Handle GPS coordinates (actual school location)
          if (schoolLat && schoolLng) {
            insertMasterSql = `
              INSERT INTO master_schools (
                name, school_type, category, state, lga, ward, address,
                principal_name, principal_phone, created_by_institution_id, location
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))
            `;
            masterParams.push(`POINT(${parseFloat(schoolLat)} ${parseFloat(schoolLng)})`);
          }

          const [masterResult] = await conn.execute(insertMasterSql, masterParams);
          masterSchoolId = masterResult.insertId;
        }
      }

      // Check if this institution already has this school linked
      const [existingLink] = await conn.execute(
        `SELECT id FROM institution_schools 
         WHERE institution_id = ? AND master_school_id = ?`,
        [parseInt(institutionId), masterSchoolId]
      );

      if (existingLink.length > 0) {
        throw new ConflictError('This school is already linked to your institution');
      }

      // Create institution_schools link
      const [linkResult] = await conn.execute(
        `INSERT INTO institution_schools (
          institution_id, master_school_id, route_id,
          location_category, distance_km, student_capacity, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(institutionId),
          masterSchoolId,
          route_id ? parseInt(route_id) : null,
          location_category || 'outside',
          distance_km || 0,
          student_capacity || 0,
          notes || null
        ]
      );
      createdSchoolId = linkResult.insertId;
    });

    // Fetch the created school
    const [school] = await query(
      `SELECT 
        isv.id, isv.institution_id, isv.route_id, 
        ms.name, ms.official_code as code,
        ms.school_type, ms.category, isv.location_category, 
        ms.state, ms.lga, ms.ward, ms.address,
        isv.distance_km, isv.student_capacity, 
        ms.principal_name, ms.principal_phone,
        isv.status, isv.notes,
        isv.created_at, isv.updated_at,
        ST_Latitude(ms.location) as latitude, ST_Longitude(ms.location) as longitude,
        ms.id as master_school_id, ms.is_verified
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      WHERE isv.id = ?`,
      [createdSchoolId]
    );

    res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Link an existing master school to the institution
 * POST /:institutionId/schools/link
 */
const linkSchool = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const {
      master_school_id, route_id, location_category,
      distance_km, student_capacity, notes
    } = req.body;

    // Check if master school exists
    const masterSchools = await query(
      'SELECT id, name FROM master_schools WHERE id = ? AND status = ?',
      [parseInt(master_school_id), 'active']
    );

    if (masterSchools.length === 0) {
      throw new NotFoundError('Master school not found');
    }

    const masterSchool = masterSchools[0];

    // Check if already linked
    const existing = await query(
      'SELECT id FROM institution_schools WHERE institution_id = ? AND master_school_id = ?',
      [parseInt(institutionId), parseInt(master_school_id)]
    );

    if (existing.length > 0) {
      throw new ConflictError('This school is already linked to your institution');
    }

    // Create link
    const result = await query(
      `INSERT INTO institution_schools (
        institution_id, master_school_id, route_id,
        location_category, distance_km, student_capacity, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(institutionId),
        parseInt(master_school_id),
        route_id ? parseInt(route_id) : null,
        location_category || 'outside',
        distance_km || 0,
        student_capacity || 0,
        notes || null
      ]
    );

    // Fetch the created link with master data
    const [school] = await query(
      `SELECT 
        isv.id, isv.institution_id, isv.route_id, 
        ms.name, ms.official_code as code,
        ms.school_type, ms.category, isv.location_category, 
        ms.state, ms.lga, ms.ward, ms.address,
        isv.distance_km, isv.student_capacity, 
        ms.principal_name, ms.principal_phone,
        isv.status, isv.notes,
        isv.created_at, isv.updated_at,
        ST_Latitude(ms.location) as latitude, ST_Longitude(ms.location) as longitude,
        ms.id as master_school_id, ms.is_verified
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      WHERE isv.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: `Successfully linked to ${masterSchool.name}`,
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search master schools (for linking)
 * GET /:institutionId/schools/search-master
 */
const searchMasterSchools = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { search, state, lga, limit = 20 } = req.query;

    let sql = `
      SELECT 
        ms.id, ms.name, ms.official_code, ms.school_type, ms.category,
        ms.state, ms.lga, ms.ward,
        ms.principal_name, ms.principal_phone,
        ms.is_verified,
        ST_Latitude(ms.location) as latitude, ST_Longitude(ms.location) as longitude,
        (SELECT COUNT(*) FROM institution_schools isv2 WHERE isv2.master_school_id = ms.id) as linked_institutions_count
      FROM master_schools ms
      WHERE ms.status = 'active'
        AND ms.id NOT IN (
          SELECT isv.master_school_id FROM institution_schools isv WHERE isv.institution_id = ?
        )
    `;
    const params = [parseInt(institutionId)];

    if (search) {
      sql += ' AND (ms.name LIKE ? OR ms.ward LIKE ? OR ms.lga LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    if (state) {
      sql += ' AND UPPER(ms.state) = ?';
      params.push(normalizeLocationValue(state));
    }
    if (lga) {
      sql += ' AND UPPER(ms.lga) = ?';
      params.push(normalizeLocationValue(lga));
    }

    sql += ' ORDER BY ms.is_verified DESC, ms.name ASC LIMIT ?';
    params.push(parseInt(limit));

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
 * Update institution-specific school data
 * PUT /:institutionId/schools/:id
 * 
 * NOTE: Only updates institution_schools fields (route, capacity, status, etc.)
 * Master school data (name, state, lga, principal) is edited via Master Schools page by super_admin only
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const updates = req.body;

    // Get the existing institution_school record
    const existing = await query(
      `SELECT isv.id, isv.master_school_id, ms.name
       FROM institution_schools isv 
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('School not found');
    }

    // Only allow institution_schools fields to be updated
    const instFields = {
      'route_id': 'route_id',
      'location_category': 'location_category',
      'distance_km': 'distance_km',
      'student_capacity': 'student_capacity',
      'status': 'status',
      'notes': 'notes'
    };
    
    const instUpdateFields = [];
    const instParams = [];

    for (const [inputField, dbField] of Object.entries(instFields)) {
      if (updates[inputField] !== undefined) {
        instUpdateFields.push(`${dbField} = ?`);
        instParams.push(updates[inputField]);
      }
    }

    if (instUpdateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    instParams.push(parseInt(id), parseInt(institutionId));
    await query(
      `UPDATE institution_schools SET ${instUpdateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      instParams
    );

    // Fetch updated school
    const [school] = await query(
      `SELECT 
        isv.id, isv.institution_id, isv.route_id, 
        ms.name, ms.official_code as code,
        ms.school_type, ms.category, isv.location_category, 
        ms.state, ms.lga, ms.ward, ms.address,
        isv.distance_km, isv.student_capacity, 
        ms.principal_name, ms.principal_phone,
        isv.status, isv.notes,
        r.name as route_name,
        ST_Latitude(ms.location) as latitude, ST_Longitude(ms.location) as longitude,
        ms.id as master_school_id
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE isv.id = ?`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'School updated successfully',
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete (unlink) a school from institution
 * DELETE /:institutionId/schools/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const existing = await query(
      `SELECT isv.id, ms.name 
       FROM institution_schools isv 
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('School not found');
    }

    // Check for active postings
    const postings = await query(
      `SELECT COUNT(*) as count FROM supervisor_postings 
       WHERE institution_school_id = ? AND status = 'active'`,
      [parseInt(id)]
    );

    if ((postings[0]?.count || 0) > 0) {
      throw new ConflictError('Cannot delete school with active postings');
    }

    await query(
      'DELETE FROM institution_schools WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `School "${existing[0].name}" unlinked from your institution`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Preview the effect of merging a source school into a target school -
 * counts of historical records (across every session) that would move,
 * plus how many groups/merged_groups rows would collide and combine
 * instead of moving cleanly.
 * GET /:institutionId/schools/:id/merge-preview?target_id=X
 */
const getMergePreview = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { target_id } = req.query;

    if (!target_id) {
      throw new ValidationError('target_id is required');
    }

    const instId = parseInt(institutionId);
    const sourceId = parseInt(id);
    const targetId = parseInt(target_id);

    const { source, target } = await resolveMergePair(instId, sourceId, targetId);

    const counts = {};
    for (const { table, column } of MERGE_PLAIN_TABLES) {
      const [row] = await query(
        `SELECT COUNT(*) as total FROM \`${table}\` WHERE \`${column}\` = ?`,
        [sourceId]
      );
      counts[table] = row.total;
    }

    const { totalGroups, conflicts: groupConflicts } = await countGroupOverlap(query, sourceId, targetId);
    counts.groups = totalGroups;

    const mgPlan = await planMergedGroupMoves(query, sourceId, targetId);
    counts.merged_groups = mgPlan.primary.length + mgPlan.secondary.length;
    const mergedGroupConflicts =
      mgPlan.primary.filter((r) => r.drop).length + mgPlan.secondary.filter((r) => r.drop).length;

    res.json({
      success: true,
      data: {
        source: { id: source.id, name: source.name },
        target: { id: target.id, name: target.name },
        counts,
        group_conflicts: groupConflicts,
        merged_group_conflicts: mergedGroupConflicts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Merge a source school into a target school within the same institution.
 * Every historical record tied to the source (across every session) is
 * repointed to the target, then the source is unlinked from the institution.
 * The global master_schools registry is never touched.
 * POST /:institutionId/schools/:id/merge
 */
const merge = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { target_id } = req.body;

    const instId = parseInt(institutionId);
    const sourceId = parseInt(id);
    const targetId = parseInt(target_id);

    const { source, target } = await resolveMergePair(instId, sourceId, targetId);

    // Must run before the student_acceptances repoint below - once source's rows
    // point at targetId, this overlap query can no longer tell them apart.
    const { conflicts: groupsMerged } = await countGroupOverlap(query, sourceId, targetId);

    const moved = {};
    let mergedGroupsMoved = 0;
    let mergedGroupsDropped = 0;

    await transaction(async (conn) => {
      const exec = async (sql, params) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      };

      for (const { table, column } of MERGE_PLAIN_TABLES) {
        const result = await exec(
          `UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`,
          [targetId, sourceId]
        );
        moved[table] = result.affectedRows || 0;
      }

      const mgPlan = await planMergedGroupMoves(exec, sourceId, targetId);
      for (const row of mgPlan.primary) {
        if (row.drop) {
          await conn.execute('DELETE FROM merged_groups WHERE id = ?', [row.id]);
          mergedGroupsDropped++;
        } else {
          await conn.execute(
            'UPDATE merged_groups SET primary_institution_school_id = ? WHERE id = ?',
            [targetId, row.id]
          );
          mergedGroupsMoved++;
        }
      }
      for (const row of mgPlan.secondary) {
        if (row.drop) {
          await conn.execute('DELETE FROM merged_groups WHERE id = ?', [row.id]);
          mergedGroupsDropped++;
        } else {
          await conn.execute(
            'UPDATE merged_groups SET secondary_institution_school_id = ? WHERE id = ?',
            [targetId, row.id]
          );
          mergedGroupsMoved++;
        }
      }
      moved.merged_groups = mergedGroupsMoved;

      await conn.execute(
        'DELETE FROM institution_schools WHERE id = ? AND institution_id = ?',
        [sourceId, instId]
      );
    });

    res.json({
      success: true,
      message: `"${source.name}" merged into "${target.name}" and unlinked from your institution`,
      data: {
        source_name: source.name,
        target_name: target.name,
        moved,
        groups_merged: groupsMerged,
        merged_groups_dropped: mergedGroupsDropped,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get schools with capacity info for posting
 * GET /:institutionId/schools/with-capacity
 */
const getSchoolsWithCapacity = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, route_id, location_category, status = 'active' } = req.query;

    let sql = `
      SELECT 
        isv.id, ms.name, ms.official_code as code, 
        ms.school_type, ms.category, isv.location_category,
        ms.state, ms.lga, isv.distance_km, isv.student_capacity,
        ms.principal_name, ms.principal_phone, isv.route_id,
        r.name as route_name,
        ms.id as master_school_id,
        COALESCE(posted.count, 0) as posted_count,
        (isv.student_capacity - COALESCE(posted.count, 0)) as available_capacity
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      LEFT JOIN (
        SELECT institution_school_id, COUNT(*) as count
        FROM supervisor_postings
        WHERE institution_id = ? AND session_id = ? AND status = 'active'
        GROUP BY institution_school_id
      ) posted ON isv.id = posted.institution_school_id
      WHERE isv.institution_id = ? AND isv.status = ?
    `;
    const params = [
      parseInt(institutionId),
      session_id ? parseInt(session_id) : 0,
      parseInt(institutionId),
      status
    ];

    if (route_id) {
      sql += ' AND isv.route_id = ?';
      params.push(parseInt(route_id));
    }
    if (location_category) {
      sql += ' AND isv.location_category = ?';
      params.push(location_category);
    }

    sql += ' ORDER BY ms.name';

    const schools = await query(sql, params);

    res.json({ success: true, data: schools });
  } catch (error) {
    next(error);
  }
};

/**
 * Get capacity details for a school
 * GET /:institutionId/schools/:id/capacity
 */
const getCapacity = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { session_id } = req.query;

    const schools = await query(
      `SELECT isv.id, ms.name, isv.student_capacity 
       FROM institution_schools isv
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (schools.length === 0) {
      throw new NotFoundError('School not found');
    }
    const school = schools[0];

    // Get posted students count per program
    let postingSql = `
      SELECT s.program_id, prog.name as program_name, COUNT(*) as count
      FROM supervisor_postings sp
      JOIN students s ON sp.student_id = s.id
      LEFT JOIN programs prog ON s.program_id = prog.id
      WHERE sp.institution_school_id = ? AND sp.institution_id = ? AND sp.status = 'active'
    `;
    
    const postingParams = [parseInt(id), parseInt(institutionId)];

    if (session_id) {
      postingSql += ' AND sp.session_id = ?';
      postingParams.push(parseInt(session_id));
    }

    postingSql += ' GROUP BY s.program_id, prog.name';

    const programCounts = await query(postingSql, postingParams);
    const totalPosted = programCounts.reduce((sum, p) => sum + p.count, 0);

    res.json({
      success: true,
      data: {
        school_id: school.id,
        school_name: school.name,
        total_capacity: school.student_capacity,
        posted_count: totalPosted,
        available_capacity: school.student_capacity - totalPosted,
        by_program: programCounts,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload schools from Excel
 * POST /:institutionId/schools/upload
 */
const uploadFromExcel = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      throw new ValidationError('Excel file is empty');
    }

    const results = {
      total: data.length,
      created: 0,
      updated: 0,
      linked: 0,
      failed: 0,
      errors: [],
    };

    await transaction(async (conn) => {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;

        try {
          const name = row.name || row.Name || row.SCHOOL_NAME || row['School Name'];
          const code = row.code || row.Code || row.SCHOOL_CODE || row['School Code'];
          const state = normalizeLocationValue(row.state || row.State) || 'UNKNOWN';
          const lga = normalizeLocationValue(row.lga || row.LGA) || 'UNKNOWN';
          const ward = normalizeOptionalLocationValue(row.ward || row.Ward);

          if (!name) {
            results.errors.push({ row: rowNum, error: 'School name is required' });
            results.failed++;
            continue;
          }

          // Check if school exists in master_schools
          let [existingMaster] = await conn.execute(
            `SELECT id FROM master_schools WHERE name = ? AND UPPER(state) = ? AND UPPER(lga) = ?`,
            [name, state, lga]
          );

          let masterSchoolId;
          if (existingMaster.length > 0) {
            masterSchoolId = existingMaster[0].id;
            // Update master school info
            await conn.execute(
              `UPDATE master_schools SET 
                school_type = ?, category = ?, ward = ?,
                principal_name = ?, principal_phone = ?
               WHERE id = ?`,
              [
                row.school_type || row['School Type'] || 'senior',
                row.category || row.Category || 'public',
                ward,
                row.principal_name || row['Principal Name'] || null,
                row.principal_phone || row['Principal Phone'] || null,
                masterSchoolId
              ]
            );
          } else {
            // Create new master school
            const [insertResult] = await conn.execute(
              `INSERT INTO master_schools (
                name, school_type, category, state, lga, ward,
                principal_name, principal_phone, created_by_institution_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                name,
                row.school_type || row['School Type'] || 'senior',
                row.category || row.Category || 'public',
                state,
                lga,
                ward,
                row.principal_name || row['Principal Name'] || null,
                row.principal_phone || row['Principal Phone'] || null,
                parseInt(institutionId)
              ]
            );
            masterSchoolId = insertResult.insertId;
          }

          // Check if institution already has this school linked
          const [existingLink] = await conn.execute(
            `SELECT id FROM institution_schools WHERE institution_id = ? AND master_school_id = ?`,
            [parseInt(institutionId), masterSchoolId]
          );

          if (existingLink.length > 0) {
            // Update existing link
            await conn.execute(
              `UPDATE institution_schools SET 
                location_category = ?, distance_km = ?, student_capacity = ?
               WHERE id = ?`,
              [
                row.location_category || row['Location Category'] || 'outside',
                parseFloat(row.distance_km || row.Distance || row['Distance (km)'] || 0),
                parseInt(row.student_capacity || row.Capacity || 0),
                existingLink[0].id
              ]
            );
            results.updated++;
          } else {
            // Create new link
            await conn.execute(
              `INSERT INTO institution_schools (
                institution_id, master_school_id, location_category,
                distance_km, student_capacity
              ) VALUES (?, ?, ?, ?, ?)`,
              [
                parseInt(institutionId),
                masterSchoolId,
                row.location_category || row['Location Category'] || 'outside',
                parseFloat(row.distance_km || row.Distance || row['Distance (km)'] || 0),
                parseInt(row.student_capacity || row.Capacity || 0)
              ]
            );
            results.created++;
            if (existingMaster.length > 0) {
              results.linked++;
            }
          }
        } catch (rowError) {
          results.errors.push({ row: rowNum, error: rowError.message });
          results.failed++;
        }
      }
    });

    const message = results.linked > 0
      ? `Processed ${results.total} schools: ${results.created} created (${results.linked} linked to existing), ${results.updated} updated, ${results.failed} failed`
      : `Processed ${results.total} schools: ${results.created} created, ${results.updated} updated, ${results.failed} failed`;

    res.json({
      success: true,
      message,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download school template
 * GET /:institutionId/schools/template
 */
const downloadTemplate = async (req, res, next) => {
  try {
    const templateData = [
      {
        'School Name': 'Example Secondary School',
        'School Code': 'ESS-001',
        'School Type': 'senior',
        'Category': 'public',
        'Location Category': 'inside',
        'State': 'KANO',
        'LGA': 'KANO MUNICIPAL',
        'Ward': 'KANO CITY',
        'Distance (km)': 5.5,
        'Capacity': 50,
        'Principal Name': 'Mr. John Doe',
        'Principal Phone': '08012345678',
      },
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schools');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=school_upload_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export schools to Excel
 * GET /:institutionId/schools/export
 */
const exportSchools = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { route_id, status } = req.query;

    let sql = `
      SELECT ms.name as 'School Name', ms.official_code as 'School Code',
             ms.school_type as 'School Type', ms.category as 'Category',
             isv.location_category as 'Location Category',
             ms.state as 'State', ms.lga as 'LGA', ms.ward as 'Ward',
             ms.address as 'Address', isv.distance_km as 'Distance (km)',
             isv.student_capacity as 'Capacity',
             ms.principal_name as 'Principal Name',
             ms.principal_phone as 'Principal Phone',
             r.name as 'Route', isv.status as 'Status',
             CASE WHEN ms.is_verified = 1 THEN 'Yes' ELSE 'No' END as 'Verified'
      FROM institution_schools isv
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE isv.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (route_id) {
      sql += ' AND isv.route_id = ?';
      params.push(parseInt(route_id));
    }
    if (status) {
      sql += ' AND isv.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY ms.name';

    const schools = await query(sql, params);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(schools);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schools');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=schools_export_${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Update school status
 * PATCH /:institutionId/schools/:id/status
 */
const updateStatus = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      throw new ValidationError('Invalid status. Must be "active" or "inactive"');
    }

    const existing = await query(
      `SELECT isv.id, ms.name 
       FROM institution_schools isv 
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE isv.id = ? AND isv.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('School not found');
    }

    await query(
      'UPDATE institution_schools SET status = ? WHERE id = ? AND institution_id = ?',
      [status, parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `School "${existing[0].name}" ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
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
  linkSchool,
  searchMasterSchools,
  getSchoolsWithCapacity,
  getCapacity,
  uploadFromExcel,
  downloadTemplate,
  exportSchools,
  updateStatus,
  getMergePreview,
  merge,
};
