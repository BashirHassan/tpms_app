/**
 * Academic Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles Faculty, Department, and Program management
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas
const schemas = {
  // Faculty schemas
  createFaculty: z.object({
    body: z.object({
      name: z.string().min(2, 'Faculty name must be at least 2 characters'),
      code: z.string().min(1, 'Faculty code is required').max(20),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  }),

  updateFaculty: z.object({
    body: z.object({
      name: z.string().min(2).optional(),
      code: z.string().min(1).max(20).optional(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  // Department schemas
  createDepartment: z.object({
    body: z.object({
      faculty_id: z.number().int().positive('Faculty ID is required'),
      name: z.string().min(2, 'Department name must be at least 2 characters'),
      code: z.string().min(1, 'Department code is required').max(20),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  }),

  updateDepartment: z.object({
    body: z.object({
      faculty_id: z.number().int().positive().optional(),
      name: z.string().min(2).optional(),
      code: z.string().min(1).max(20).optional(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  // Program schemas
  createProgram: z.object({
    body: z.object({
      department_id: z.number().int().positive('Department ID is required'),
      name: z.string().min(2, 'Program name must be at least 2 characters'),
      code: z.string().min(1, 'Program code is required').max(20),
      status: z.enum(['active', 'inactive']).optional(),
    }),
  }),

  updateProgram: z.object({
    body: z.object({
      department_id: z.number().int().positive().optional(),
      name: z.string().min(2).optional(),
      code: z.string().min(1).max(20).optional(),
      status: z.enum(['active', 'inactive']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

// ===============================
// FACULTY CONTROLLERS
// ===============================

/**
 * Get all faculties
 * GET /:institutionId/academic/faculties
 */
const getAllFaculties = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { status, search } = req.query;

    let sql = `
      SELECT f.id, f.institution_id, f.name, f.code, f.status,
             f.created_at, f.updated_at,
             COUNT(DISTINCT d.id) as department_count,
             COUNT(DISTINCT p.id) as program_count
      FROM faculties f
      LEFT JOIN departments d ON f.id = d.faculty_id AND d.status = 'active'
      LEFT JOIN programs p ON d.id = p.department_id AND p.status = 'active'
      WHERE f.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (status) {
      sql += ' AND f.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (f.name LIKE ? OR f.code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' GROUP BY f.id ORDER BY f.name ASC';

    const faculties = await query(sql, params);

    res.json({ success: true, data: faculties });
  } catch (error) {
    next(error);
  }
};

/**
 * Get faculty by ID with departments and programs
 * GET /:institutionId/academic/faculties/:id
 */
const getFacultyById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const faculties = await query(
      'SELECT * FROM faculties WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (faculties.length === 0) {
      throw new NotFoundError('Faculty not found');
    }

    // Get departments with programs
    const departments = await query(
      `SELECT d.*, 
              COUNT(p.id) as program_count
       FROM departments d
       LEFT JOIN programs p ON d.id = p.department_id
       WHERE d.faculty_id = ? AND d.institution_id = ?
       GROUP BY d.id
       ORDER BY d.name`,
      [parseInt(id), parseInt(institutionId)]
    );

    // Get programs for each department
    for (const dept of departments) {
      dept.programs = await query(
        'SELECT * FROM programs WHERE department_id = ? AND institution_id = ? ORDER BY name',
        [dept.id, parseInt(institutionId)]
      );
    }

    res.json({
      success: true,
      data: {
        ...faculties[0],
        departments,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new faculty
 * POST /:institutionId/academic/faculties
 */
const createFaculty = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { name, code, status = 'active' } = req.body;

    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM faculties WHERE institution_id = ? AND code = ?',
      [parseInt(institutionId), code]
    );

    if (existing.length > 0) {
      throw new ConflictError('A faculty with this code already exists');
    }

    const result = await query(
      'INSERT INTO faculties (institution_id, name, code, status) VALUES (?, ?, ?, ?)',
      [parseInt(institutionId), name, code, status]
    );

    const [faculty] = await query('SELECT * FROM faculties WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Faculty created successfully',
      data: faculty,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a faculty
 * PUT /:institutionId/academic/faculties/:id
 */
const updateFaculty = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { name, code, status } = req.body;

    // Check if faculty exists
    const existing = await query(
      'SELECT id FROM faculties WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Faculty not found');
    }

    // Check for duplicate code
    if (code) {
      const duplicate = await query(
        'SELECT id FROM faculties WHERE institution_id = ? AND code = ? AND id != ?',
        [parseInt(institutionId), code, parseInt(id)]
      );

      if (duplicate.length > 0) {
        throw new ConflictError('A faculty with this code already exists');
      }
    }

    // Build update query
    const updateFields = [];
    const updateParams = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(name);
    }
    if (code !== undefined) {
      updateFields.push('code = ?');
      updateParams.push(code);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE faculties SET ${updateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      updateParams
    );

    const [faculty] = await query('SELECT * FROM faculties WHERE id = ?', [parseInt(id)]);

    res.json({
      success: true,
      message: 'Faculty updated successfully',
      data: faculty,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a faculty
 * DELETE /:institutionId/academic/faculties/:id
 */
const deleteFaculty = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if faculty exists
    const existing = await query(
      'SELECT id, name FROM faculties WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Faculty not found');
    }

    // Check for departments
    const departments = await query(
      'SELECT COUNT(*) as count FROM departments WHERE faculty_id = ?',
      [parseInt(id)]
    );

    if (departments[0].count > 0) {
      throw new ConflictError('Cannot delete faculty with existing departments');
    }

    await query(
      'DELETE FROM faculties WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `Faculty "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// DEPARTMENT CONTROLLERS
// ===============================

/**
 * Get all departments
 * GET /:institutionId/academic/departments
 */
const getAllDepartments = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { faculty_id, status, search } = req.query;

    let sql = `
      SELECT d.id, d.institution_id, d.faculty_id, d.name, d.code, d.status,
             d.created_at, d.updated_at,
             f.name as faculty_name, f.code as faculty_code,
             COUNT(p.id) as program_count
      FROM departments d
      JOIN faculties f ON d.faculty_id = f.id
      LEFT JOIN programs p ON d.id = p.department_id AND p.status = 'active'
      WHERE d.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (faculty_id) {
      sql += ' AND d.faculty_id = ?';
      params.push(parseInt(faculty_id));
    }
    if (status) {
      sql += ' AND d.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (d.name LIKE ? OR d.code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' GROUP BY d.id ORDER BY f.name, d.name ASC';

    const departments = await query(sql, params);

    res.json({ success: true, data: departments });
  } catch (error) {
    next(error);
  }
};

/**
 * Get department by ID with programs
 * GET /:institutionId/academic/departments/:id
 */
const getDepartmentById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const departments = await query(
      `SELECT d.*, f.name as faculty_name, f.code as faculty_code
       FROM departments d
       JOIN faculties f ON d.faculty_id = f.id
       WHERE d.id = ? AND d.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (departments.length === 0) {
      throw new NotFoundError('Department not found');
    }

    // Get programs
    const programs = await query(
      'SELECT * FROM programs WHERE department_id = ? AND institution_id = ? ORDER BY name',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...departments[0],
        programs,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new department
 * POST /:institutionId/academic/departments
 */
const createDepartment = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { faculty_id, name, code, status = 'active' } = req.body;

    // Check faculty exists
    const faculty = await query(
      'SELECT id FROM faculties WHERE id = ? AND institution_id = ?',
      [parseInt(faculty_id), parseInt(institutionId)]
    );

    if (faculty.length === 0) {
      throw new ValidationError('Faculty not found');
    }

    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM departments WHERE institution_id = ? AND code = ?',
      [parseInt(institutionId), code]
    );

    if (existing.length > 0) {
      throw new ConflictError('A department with this code already exists');
    }

    const result = await query(
      'INSERT INTO departments (institution_id, faculty_id, name, code, status) VALUES (?, ?, ?, ?, ?)',
      [parseInt(institutionId), parseInt(faculty_id), name, code, status]
    );

    const [department] = await query(
      `SELECT d.*, f.name as faculty_name
       FROM departments d
       JOIN faculties f ON d.faculty_id = f.id
       WHERE d.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a department
 * PUT /:institutionId/academic/departments/:id
 */
const updateDepartment = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { faculty_id, name, code, status } = req.body;

    // Check if department exists
    const existing = await query(
      'SELECT id FROM departments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Department not found');
    }

    // Check faculty if updating
    if (faculty_id) {
      const faculty = await query(
        'SELECT id FROM faculties WHERE id = ? AND institution_id = ?',
        [parseInt(faculty_id), parseInt(institutionId)]
      );

      if (faculty.length === 0) {
        throw new ValidationError('Faculty not found');
      }
    }

    // Check for duplicate code
    if (code) {
      const duplicate = await query(
        'SELECT id FROM departments WHERE institution_id = ? AND code = ? AND id != ?',
        [parseInt(institutionId), code, parseInt(id)]
      );

      if (duplicate.length > 0) {
        throw new ConflictError('A department with this code already exists');
      }
    }

    // Build update query
    const updateFields = [];
    const updateParams = [];

    if (faculty_id !== undefined) {
      updateFields.push('faculty_id = ?');
      updateParams.push(parseInt(faculty_id));
    }
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(name);
    }
    if (code !== undefined) {
      updateFields.push('code = ?');
      updateParams.push(code);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE departments SET ${updateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      updateParams
    );

    const [department] = await query(
      `SELECT d.*, f.name as faculty_name
       FROM departments d
       JOIN faculties f ON d.faculty_id = f.id
       WHERE d.id = ?`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Department updated successfully',
      data: department,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a department
 * DELETE /:institutionId/academic/departments/:id
 */
const deleteDepartment = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if department exists
    const existing = await query(
      'SELECT id, name FROM departments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Department not found');
    }

    // Check for programs
    const programs = await query(
      'SELECT COUNT(*) as count FROM programs WHERE department_id = ?',
      [parseInt(id)]
    );

    if (programs[0].count > 0) {
      throw new ConflictError('Cannot delete department with existing programs');
    }

    await query(
      'DELETE FROM departments WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `Department "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// PROGRAM CONTROLLERS
// ===============================

/**
 * Get all programs
 * GET /:institutionId/academic/programs
 */
const getAllPrograms = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { department_id, faculty_id, status, search } = req.query;

    let sql = `
      SELECT p.id, p.institution_id, p.department_id, p.name, p.code, p.status,
             p.created_at, p.updated_at,
             d.name as department_name, d.code as department_code,
             f.id as faculty_id, f.name as faculty_name, f.code as faculty_code,
             COUNT(s.id) as student_count
      FROM programs p
      JOIN departments d ON p.department_id = d.id
      JOIN faculties f ON d.faculty_id = f.id
      LEFT JOIN students s ON p.id = s.program_id AND s.status = 'active'
      WHERE p.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (department_id) {
      sql += ' AND p.department_id = ?';
      params.push(parseInt(department_id));
    }
    if (faculty_id) {
      sql += ' AND f.id = ?';
      params.push(parseInt(faculty_id));
    }
    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (p.name LIKE ? OR p.code LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    sql += ' GROUP BY p.id ORDER BY f.name, d.name, p.name ASC';

    const programs = await query(sql, params);

    res.json({ success: true, data: programs });
  } catch (error) {
    next(error);
  }
};

/**
 * Get program by ID
 * GET /:institutionId/academic/programs/:id
 */
const getProgramById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const programs = await query(
      `SELECT p.*, 
              d.name as department_name, d.code as department_code,
              f.id as faculty_id, f.name as faculty_name, f.code as faculty_code
       FROM programs p
       JOIN departments d ON p.department_id = d.id
       JOIN faculties f ON d.faculty_id = f.id
       WHERE p.id = ? AND p.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (programs.length === 0) {
      throw new NotFoundError('Program not found');
    }

    // Get student count
    const [studentCount] = await query(
      `SELECT COUNT(*) as count FROM students 
       WHERE program_id = ? AND institution_id = ? AND status = 'active'`,
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...programs[0],
        student_count: studentCount.count,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new program
 * POST /:institutionId/academic/programs
 */
const createProgram = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { department_id, name, code, status = 'active' } = req.body;

    // Check department exists
    const department = await query(
      'SELECT id FROM departments WHERE id = ? AND institution_id = ?',
      [parseInt(department_id), parseInt(institutionId)]
    );

    if (department.length === 0) {
      throw new ValidationError('Department not found');
    }

    // Check for duplicate code
    const existing = await query(
      'SELECT id FROM programs WHERE institution_id = ? AND code = ?',
      [parseInt(institutionId), code]
    );

    if (existing.length > 0) {
      throw new ConflictError('A program with this code already exists');
    }

    const result = await query(
      'INSERT INTO programs (institution_id, department_id, name, code, status) VALUES (?, ?, ?, ?, ?)',
      [parseInt(institutionId), parseInt(department_id), name, code, status]
    );

    const [program] = await query(
      `SELECT p.*, d.name as department_name, f.name as faculty_name
       FROM programs p
       JOIN departments d ON p.department_id = d.id
       JOIN faculties f ON d.faculty_id = f.id
       WHERE p.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Program created successfully',
      data: program,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a program
 * PUT /:institutionId/academic/programs/:id
 */
const updateProgram = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { department_id, name, code, status } = req.body;

    // Check if program exists
    const existing = await query(
      'SELECT id FROM programs WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Program not found');
    }

    // Check department if updating
    if (department_id) {
      const department = await query(
        'SELECT id FROM departments WHERE id = ? AND institution_id = ?',
        [parseInt(department_id), parseInt(institutionId)]
      );

      if (department.length === 0) {
        throw new ValidationError('Department not found');
      }
    }

    // Check for duplicate code
    if (code) {
      const duplicate = await query(
        'SELECT id FROM programs WHERE institution_id = ? AND code = ? AND id != ?',
        [parseInt(institutionId), code, parseInt(id)]
      );

      if (duplicate.length > 0) {
        throw new ConflictError('A program with this code already exists');
      }
    }

    // Build update query
    const updateFields = [];
    const updateParams = [];

    if (department_id !== undefined) {
      updateFields.push('department_id = ?');
      updateParams.push(parseInt(department_id));
    }
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateParams.push(name);
    }
    if (code !== undefined) {
      updateFields.push('code = ?');
      updateParams.push(code);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateParams.push(parseInt(id), parseInt(institutionId));

    await query(
      `UPDATE programs SET ${updateFields.join(', ')} WHERE id = ? AND institution_id = ?`,
      updateParams
    );

    const [program] = await query(
      `SELECT p.*, d.name as department_name, f.name as faculty_name
       FROM programs p
       JOIN departments d ON p.department_id = d.id
       JOIN faculties f ON d.faculty_id = f.id
       WHERE p.id = ?`,
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Program updated successfully',
      data: program,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a program
 * DELETE /:institutionId/academic/programs/:id
 */
const deleteProgram = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check if program exists
    const existing = await query(
      'SELECT id, name FROM programs WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Program not found');
    }

    // Check for students
    const students = await query(
      'SELECT COUNT(*) as count FROM students WHERE program_id = ? AND status = ?',
      [parseInt(id), 'active']
    );

    if (students[0].count > 0) {
      throw new ConflictError('Cannot delete program with active students');
    }

    await query(
      'DELETE FROM programs WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: `Program "${existing[0].name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Detect program from registration number
 * POST /:institutionId/academic/programs/detect
 */
const detectProgram = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { registration_number } = req.body;

    if (!registration_number) {
      throw new ValidationError('Registration number is required');
    }

    // Extract potential program code from registration number
    // Common patterns: NCE/2024/MATH/001, 2024/ENG/001, REG-PHY-001
    const patterns = [
      /\/([A-Z]{2,10})\/\d+$/i,           // NCE/2024/MATH/001 -> MATH
      /\/([A-Z]{2,10})-\d+$/i,            // NCE/2024/MATH-001 -> MATH
      /-([A-Z]{2,10})-\d+$/i,             // REG-MATH-001 -> MATH
      /([A-Z]{2,10})\/\d+$/i,             // 2024/MATH/001 -> MATH
    ];

    let extractedCode = null;
    for (const pattern of patterns) {
      const match = registration_number.match(pattern);
      if (match) {
        extractedCode = match[1].toUpperCase();
        break;
      }
    }

    if (!extractedCode) {
      return res.json({
        success: true,
        data: {
          detected: false,
          message: 'Could not detect program from registration number',
          program: null,
        },
      });
    }

    // Search for matching program
    const programs = await query(
      `SELECT p.id, p.name, p.code, d.name as department_name, f.name as faculty_name
       FROM programs p
       JOIN departments d ON p.department_id = d.id
       JOIN faculties f ON d.faculty_id = f.id
       WHERE p.institution_id = ? AND p.status = 'active'
         AND (p.code LIKE ? OR p.code LIKE ? OR p.name LIKE ?)`,
      [
        parseInt(institutionId),
        `%${extractedCode}%`,
        `NCE-${extractedCode}%`,
        `%${extractedCode}%`,
      ]
    );

    if (programs.length === 0) {
      return res.json({
        success: true,
        data: {
          detected: false,
          extracted_code: extractedCode,
          message: `No program found matching code: ${extractedCode}`,
          program: null,
        },
      });
    }

    // Return best match (first one or exact match)
    let bestMatch = programs[0];
    for (const program of programs) {
      if (program.code.toUpperCase().includes(extractedCode)) {
        bestMatch = program;
        break;
      }
    }

    res.json({
      success: true,
      data: {
        detected: true,
        extracted_code: extractedCode,
        program: bestMatch,
        alternatives: programs.length > 1 ? programs : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  // Faculties
  getAllFaculties,
  getFacultyById,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  // Departments
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  // Programs
  getAllPrograms,
  getProgramById,
  createProgram,
  updateProgram,
  deleteProgram,
  detectProgram,
};
