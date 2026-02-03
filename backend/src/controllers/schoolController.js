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
      geofence_radius_m: z.number().int().min(50).max(5000).optional(),
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
      geofence_radius_m: z.number().int().min(50).max(5000).optional(),
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
      geofence_radius_m: z.number().int().min(50).max(5000).optional(),
      notes: z.string().optional().nullable(),
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
      limit = 100, 
      offset = 0 
    } = req.query;

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
        isv.geofence_radius_m, 
        isv.status, 
        isv.notes, 
        isv.created_at, 
        isv.updated_at,
        r.name as route_name, 
        r.code as route_code,
        ST_X(ms.location) as latitude, 
        ST_Y(ms.location) as longitude,
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
      sql += ' AND ms.state = ?';
      params.push(state);
    }
    if (lga) {
      sql += ' AND ms.lga = ?';
      params.push(lga);
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
    if (state) countConditions.push('ms.state = ?');
    if (lga) countConditions.push('ms.lga = ?');
    if (status) countConditions.push('isv.status = ?');
    if (search) countConditions.push('(ms.name LIKE ? OR ms.official_code LIKE ? OR ms.ward LIKE ? OR ms.principal_name LIKE ?)');
    
    if (countConditions.length > 0) {
      countSql += ' AND ' + countConditions.join(' AND ');
    }
    
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY ms.name ASC LIMIT ? OFFSET ?';
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
        isv.geofence_radius_m, isv.status, isv.notes, 
        isv.created_at, isv.updated_at,
        r.name as route_name, r.code as route_code,
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
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
      name, school_type, category, state, lga, ward, address,
      principal_name, principal_phone, latitude, longitude,
      // Institution-specific data
      location_category, distance_km, student_capacity,
      route_id, geofence_radius_m, notes,
      // Optional: link to existing master school
      master_school_id
    } = req.body;

    let masterSchoolId = master_school_id;
    let createdSchoolId;

    await transaction(async (conn) => {
      if (!masterSchoolId) {
        // Check if a similar school already exists in master
        const [existing] = await conn.execute(
          `SELECT id FROM master_schools 
           WHERE name = ? AND state = ? AND lga = ? AND status = 'active'`,
          [name, state || 'Unknown', lga || 'Unknown']
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
            state || 'Unknown',
            lga || 'Unknown',
            ward || null,
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
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?))
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
          location_category, distance_km, student_capacity, geofence_radius_m, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(institutionId),
          masterSchoolId,
          route_id ? parseInt(route_id) : null,
          location_category || 'outside',
          distance_km || 0,
          student_capacity || 0,
          geofence_radius_m || 100,
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
        isv.geofence_radius_m, isv.status, isv.notes, 
        isv.created_at, isv.updated_at,
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
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
      distance_km, student_capacity, geofence_radius_m, notes
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
        location_category, distance_km, student_capacity, geofence_radius_m, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(institutionId),
        parseInt(master_school_id),
        route_id ? parseInt(route_id) : null,
        location_category || 'outside',
        distance_km || 0,
        student_capacity || 0,
        geofence_radius_m || 100,
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
        isv.geofence_radius_m, isv.status, isv.notes, 
        isv.created_at, isv.updated_at,
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
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
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
        CASE WHEN isv.id IS NOT NULL THEN 1 ELSE 0 END as is_linked
      FROM master_schools ms
      LEFT JOIN institution_schools isv ON ms.id = isv.master_school_id AND isv.institution_id = ?
      WHERE ms.status = 'active'
    `;
    const params = [parseInt(institutionId)];

    if (search) {
      sql += ' AND (ms.name LIKE ? OR ms.ward LIKE ? OR ms.lga LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    if (state) {
      sql += ' AND ms.state = ?';
      params.push(state);
    }
    if (lga) {
      sql += ' AND ms.lga = ?';
      params.push(lga);
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
      'geofence_radius_m': 'geofence_radius_m',
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
        isv.geofence_radius_m, isv.status, isv.notes,
        r.name as route_name,
        ST_X(ms.location) as latitude, ST_Y(ms.location) as longitude,
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
          const state = row.state || row.State || 'Unknown';
          const lga = row.lga || row.LGA || 'Unknown';

          if (!name) {
            results.errors.push({ row: rowNum, error: 'School name is required' });
            results.failed++;
            continue;
          }

          // Check if school exists in master_schools
          let [existingMaster] = await conn.execute(
            `SELECT id FROM master_schools WHERE name = ? AND state = ? AND lga = ?`,
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
                row.ward || row.Ward || null,
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
                row.ward || row.Ward || null,
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
        'State': 'Kano',
        'LGA': 'Kano Municipal',
        'Ward': 'Kano City',
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
};
