/**
 * Student Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles student management with Excel upload and program auto-detection
 */

const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');
const { encryptStudentPin, decryptStudentPin } = require('../services/encryptionService');
const { hashPassword } = require('./authController');

// Validation schemas
const schemas = {
  create: z.object({
    body: z.object({
      registration_number: z.string().min(1, 'Registration number is required'),
      full_name: z.string().min(2, 'Full name must be at least 2 characters'),
      program_id: z.number().int().positive().optional().nullable(),
    }),
  }),

  update: z.object({
    body: z.object({
      full_name: z.string().min(2).optional(),
      program_id: z.number().int().positive().optional().nullable(),
      status: z.enum(['active', 'inactive']).optional(),
      payment_status: z.enum(['pending', 'partial', 'paid']).optional(),
    }),
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),

  bulkDetect: z.object({
    body: z.object({
      registration_numbers: z
        .array(z.string().min(1))
        .min(1, 'At least one registration number is required'),
    }),
  }),

  resetPin: z.object({
    params: z.object({
      institutionId: z.string(),
      id: z.string(),
    }),
  }),
};

/**
 * Generate a 10-digit PIN
 */
function generatePin() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

/**
 * Get all students
 * GET /:institutionId/students
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { program_id, session_id, status, payment_status, search, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT s.id, s.institution_id, s.program_id, s.session_id, s.registration_number,
             s.full_name, s.status, s.payment_status,
             s.pin_encrypted, s.created_at, s.updated_at,
             p.name as program_name, p.code as program_code,
             sess.name as session_name
      FROM students s
      LEFT JOIN programs p ON s.program_id = p.id
      LEFT JOIN academic_sessions sess ON s.session_id = sess.id
      WHERE s.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND s.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (program_id) {
      sql += ' AND s.program_id = ?';
      params.push(parseInt(program_id));
    }
    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }
    if (payment_status) {
      sql += ' AND s.payment_status = ?';
      params.push(payment_status);
    }
    if (search) {
      sql += ' AND (s.full_name LIKE ? OR s.registration_number LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Count query
    const countSql = sql.replace(/SELECT.*FROM/s, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await query(countSql, params);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const students = await query(sql, params);

    // Decrypt PINs for admin display
    const studentsWithDecryptedPins = students.map(student => {
      const pin = student.pin_encrypted ? decryptStudentPin(student.pin_encrypted) : null;
      const { pin_encrypted, ...rest } = student;
      return { ...rest, pin };
    });

    res.json({
      success: true,
      data: studentsWithDecryptedPins,
      pagination: {
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
 * Get student by ID
 * GET /:institutionId/students/:id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const students = await query(
      `SELECT s.*, p.name as program_name, p.code as program_code,
              d.name as department_name, d.code as dept_code,
              f.name as faculty_name, sess.name as session_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN faculties f ON d.faculty_id = f.id
       LEFT JOIN academic_sessions sess ON s.session_id = sess.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (students.length === 0) {
      throw new NotFoundError('Student not found');
    }

    const student = students[0];
    const pin = student.pin_encrypted ? decryptStudentPin(student.pin_encrypted) : null;
    const { pin_encrypted, ...rest } = student;

    res.json({
      success: true,
      data: { ...rest, pin },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create single student
 * POST /:institutionId/students
 */
const create = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { registration_number, full_name, program_id } = req.body;

    // Normalize to uppercase
    const normalizedRegNumber = registration_number.toUpperCase().trim();
    const normalizedFullName = full_name.toUpperCase().trim();

    // Check for duplicate registration number
    const existing = await query(
      'SELECT id FROM students WHERE registration_number = ? AND institution_id = ?',
      [normalizedRegNumber, parseInt(institutionId)]
    );
    
    if (existing.length > 0) {
      throw new ConflictError('A student with this registration number already exists');
    }

    // Auto-detect program if not provided
    let finalProgramId = program_id;
    if (!finalProgramId) {
      const programs = await query(
        `SELECT id, code FROM programs WHERE institution_id = ? AND status = 'active'`,
        [parseInt(institutionId)]
      );
      
      // Extract parts from registration number (e.g., NCE/2024/MATH/124 -> ['NCE', '2024', 'MATH', '124'])
      const regParts = normalizedRegNumber.split('/').map(p => p.trim().toUpperCase());
      
      for (const program of programs) {
        // Check if any part of the registration number matches the program code
        // Program codes can be like 'NCE-MATH' or 'MATH', so check both full code and suffix
        const programCode = program.code.toUpperCase();
        const codeSuffix = programCode.includes('-') ? programCode.split('-').pop() : programCode;
        
        if (regParts.includes(programCode) || regParts.includes(codeSuffix)) {
          finalProgramId = program.id;
          break;
        }
      }
    }

    // Verify program belongs to institution if provided
    if (finalProgramId) {
      const programs = await query(
        'SELECT id FROM programs WHERE id = ? AND institution_id = ?',
        [finalProgramId, parseInt(institutionId)]
      );
      if (programs.length === 0) {
        throw new ValidationError('Invalid program ID');
      }
    }

    // Get current session
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
      [parseInt(institutionId)]
    );
    const currentSessionId = sessions[0]?.id || null;

    // Generate PIN, hash for auth, and encrypt for admin display
    const pin = generatePin();
    const pinHash = await hashPassword(pin);
    const pinEncrypted = encryptStudentPin(pin);

    // Insert student
    const result = await query(
      `INSERT INTO students (institution_id, program_id, session_id, registration_number, 
                             full_name, pin_hash, pin_encrypted, status, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'pending')`,
      [parseInt(institutionId), finalProgramId, currentSessionId, normalizedRegNumber, 
       normalizedFullName, pinHash, pinEncrypted]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, 
                               resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'student_created', 'student', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, result.insertId, 
       JSON.stringify({ registration_number: normalizedRegNumber, full_name: normalizedFullName }),
       req.ip]
    );

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: {
        id: result.insertId,
        institution_id: parseInt(institutionId),
        program_id: finalProgramId,
        registration_number: normalizedRegNumber,
        full_name: normalizedFullName,
        pin, // Return PIN only on creation
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update student
 * PUT /:institutionId/students/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Check student exists
    const existing = await query(
      'SELECT id FROM students WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );
    
    if (existing.length === 0) {
      throw new NotFoundError('Student not found');
    }

    // Build update
    const updates = {};
    if (req.body.full_name) updates.full_name = req.body.full_name.toUpperCase().trim();
    if (req.body.registration_number) updates.registration_number = req.body.registration_number.toUpperCase().trim();
    if (req.body.program_id !== undefined) updates.program_id = req.body.program_id;
    if (req.body.status) updates.status = req.body.status;
    if (req.body.payment_status) updates.payment_status = req.body.payment_status;

    // Verify program if changing
    if (updates.program_id) {
      const programs = await query(
        'SELECT id FROM programs WHERE id = ? AND institution_id = ?',
        [updates.program_id, parseInt(institutionId)]
      );
      if (programs.length === 0) {
        throw new ValidationError('Invalid program ID');
      }
    }

    // Perform update
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(updates), parseInt(id), parseInt(institutionId)];
      
      await query(
        `UPDATE students SET ${setClauses}, updated_at = NOW() WHERE id = ? AND institution_id = ?`,
        values
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, 
                               resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'student_updated', 'student', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, parseInt(id), JSON.stringify(updates), req.ip]
    );

    // Fetch updated student
    const students = await query(
      'SELECT * FROM students WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    res.json({
      success: true,
      message: 'Student updated successfully',
      data: students[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete student (hard delete)
 * DELETE /:institutionId/students/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const students = await query(
      'SELECT id, full_name, registration_number FROM students WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );
    
    if (students.length === 0) {
      throw new NotFoundError('Student not found');
    }

    const student = students[0];

    // Delete the student record (cascades will handle related records)
    await query(
      'DELETE FROM students WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, 
                               resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'student_deleted', 'student', ?, ?, ?)`,
      [parseInt(institutionId), req.user.id, parseInt(id), JSON.stringify({ full_name: student.full_name, registration_number: student.registration_number }), req.ip]
    );

    res.json({
      success: true,
      message: 'Student deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset student PIN
 * POST /:institutionId/students/:id/reset-pin
 */
const resetPin = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    const students = await query(
      'SELECT id, registration_number, full_name FROM students WHERE id = ? AND institution_id = ?',
      [parseInt(id), parseInt(institutionId)]
    );
    
    if (students.length === 0) {
      throw new NotFoundError('Student not found');
    }

    const student = students[0];
    const newPin = generatePin();
    const pinHash = await hashPassword(newPin);
    const pinEncrypted = encryptStudentPin(newPin);

    await query(
      'UPDATE students SET pin_hash = ?, pin_encrypted = ?, updated_at = NOW() WHERE id = ? AND institution_id = ?',
      [pinHash, pinEncrypted, parseInt(id), parseInt(institutionId)]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, 
                               resource_id, ip_address)
       VALUES (?, ?, 'staff', 'student_pin_reset', 'student', ?, ?)`,
      [parseInt(institutionId), req.user.id, parseInt(id), req.ip]
    );

    res.json({
      success: true,
      message: 'PIN reset successfully',
      data: {
        registration_number: student.registration_number,
        full_name: student.full_name,
        new_pin: newPin,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk detect programs from registration numbers
 * POST /:institutionId/students/bulk-detect
 */
const bulkDetectPrograms = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { registration_numbers } = req.body;

    // Get all active programs
    const programs = await query(
      'SELECT id, name, code FROM programs WHERE institution_id = ? AND status = \'active\'',
      [parseInt(institutionId)]
    );

    const results = registration_numbers.map(regNum => {
      let detectedProgram = null;
      
      // Extract parts from registration number (e.g., NCE/2024/MATH/124 -> ['NCE', '2024', 'MATH', '124'])
      const regParts = regNum.toUpperCase().split('/').map(p => p.trim());
      
      for (const program of programs) {
        const programCode = program.code.toUpperCase();
        const codeSuffix = programCode.includes('-') ? programCode.split('-').pop() : programCode;
        
        if (regParts.includes(programCode) || regParts.includes(codeSuffix)) {
          detectedProgram = { id: program.id, name: program.name, code: program.code };
          break;
        }
      }
      
      return { registration_number: regNum, program: detectedProgram };
    });

    const detected = results.filter(r => r.program !== null).length;
    const undetected = results.filter(r => r.program === null).length;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: registration_numbers.length,
          detected,
          undetected,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload students from Excel file
 * POST /:institutionId/students/upload
 */
const uploadFromExcel = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const filePath = req.file.path;

    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    // Clean up file after reading
    fs.unlinkSync(filePath);

    if (rawData.length === 0) {
      throw new ValidationError('Excel file is empty');
    }

    // Normalize column names
    const normalizeColumn = (name) => {
      const normalized = name.toLowerCase().trim().replace(/[_\s]+/g, '_');
      const mappings = {
        reg_number: 'registration_number',
        reg_no: 'registration_number',
        regno: 'registration_number',
        registration_no: 'registration_number',
        matriculation_number: 'registration_number',
        matric_number: 'registration_number',
        matric_no: 'registration_number',
        name: 'full_name',
        student_name: 'full_name',
        fullname: 'full_name',
      };
      return mappings[normalized] || normalized;
    };

    // Process data
    const students = rawData.map((row, index) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeColumn(key);
        normalized[normalizedKey] = String(value).trim();
      }
      if (normalized.full_name) normalized.full_name = normalized.full_name.toUpperCase();
      if (normalized.registration_number) normalized.registration_number = normalized.registration_number.toUpperCase();
      return { ...normalized, row_number: index + 2 };
    });

    // Validate required fields
    const errors = [];
    const validStudents = [];

    for (const student of students) {
      const rowErrors = [];
      if (!student.registration_number) rowErrors.push('Registration number is required');
      if (!student.full_name) rowErrors.push('Full name is required');

      if (rowErrors.length > 0) {
        errors.push({
          row: student.row_number,
          registration_number: student.registration_number || 'N/A',
          errors: rowErrors,
        });
      } else {
        validStudents.push(student);
      }
    }

    // Check for duplicates within file
    const regNumbers = validStudents.map(s => s.registration_number);
    const duplicatesInFile = regNumbers.filter((item, index) => regNumbers.indexOf(item) !== index);

    if (duplicatesInFile.length > 0) {
      const uniqueDuplicates = [...new Set(duplicatesInFile)];
      for (const dup of uniqueDuplicates) {
        const rows = validStudents.filter(s => s.registration_number === dup).map(s => s.row_number);
        errors.push({
          row: rows.join(', '),
          registration_number: dup,
          errors: ['Duplicate registration number within file'],
        });
      }
    }

    // Check for duplicates in database
    const existingStudents = await query(
      'SELECT registration_number FROM students WHERE institution_id = ?',
      [parseInt(institutionId)]
    );
    const existingRegNumbers = new Set(existingStudents.map(s => s.registration_number.toUpperCase()));

    const newStudents = [];
    for (const student of validStudents) {
      if (existingRegNumbers.has(student.registration_number.toUpperCase())) {
        errors.push({
          row: student.row_number,
          registration_number: student.registration_number,
          errors: ['Registration number already exists in database'],
        });
      } else if (!duplicatesInFile.includes(student.registration_number)) {
        newStudents.push(student);
      }
    }

    // Detect programs - get all active programs
    const programs = await query(
      'SELECT id, name, code FROM programs WHERE institution_id = ? AND status = \'active\'',
      [parseInt(institutionId)]
    );

    const programMap = new Map();
    const studentsWithPrograms = [];
    
    for (const student of newStudents) {
      let detectedProgram = null;
      
      // Extract parts from registration number (e.g., NCE/2024/MATH/124 -> ['NCE', '2024', 'MATH', '124'])
      const regParts = student.registration_number.toUpperCase().split('/').map(p => p.trim());
      
      for (const program of programs) {
        const programCode = program.code.toUpperCase();
        const codeSuffix = programCode.includes('-') ? programCode.split('-').pop() : programCode;
        
        if (regParts.includes(programCode) || regParts.includes(codeSuffix)) {
          detectedProgram = { id: program.id, name: program.name, code: program.code };
          break;
        }
      }
      
      if (detectedProgram) {
        programMap.set(student.registration_number, detectedProgram);
        studentsWithPrograms.push(student);
      } else {
        // Add to errors - students without matching program are not allowed
        errors.push({
          row: student.row_number,
          registration_number: student.registration_number,
          errors: ['No matching program CODE in student Reg. No.'],
        });
      }
    }

    // Build validation summary
    const validationSummary = {
      total_rows: rawData.length,
      valid_rows: studentsWithPrograms.length,
      error_rows: errors.length,
      programs_detected: studentsWithPrograms.length,
      programs_undetected: 0, // All undetected are now errors
      errors: errors.slice(0, 50),
      preview: studentsWithPrograms.slice(0, 10).map(s => ({
        registration_number: s.registration_number,
        full_name: s.full_name,
        program: programMap.get(s.registration_number),
      })),
    };

    // If validate_only or errors exist
    if (req.query.validate_only === 'true' || (errors.length > 0 && req.query.validate_only !== 'false')) {
      return res.json({
        success: true,
        message: errors.length > 0 ? 'Validation completed with errors' : 'Validation completed successfully',
        data: validationSummary,
        can_proceed: errors.length === 0 && studentsWithPrograms.length > 0,
      });
    }

    // Get current session
    const sessions = await query(
      'SELECT id FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
      [parseInt(institutionId)]
    );
    const currentSessionId = sessions[0]?.id || null;

    // Insert students (only those with valid programs)
    const insertedStudents = [];
    const insertErrors = [];

    for (const student of studentsWithPrograms) {
      try {
        const program = programMap.get(student.registration_number);
        const pin = generatePin();
        const pinHash = await hashPassword(pin);
        const pinEncrypted = encryptStudentPin(pin);

        const result = await query(
          `INSERT INTO students (institution_id, program_id, session_id, registration_number, 
                                 full_name, pin_hash, pin_encrypted, status, payment_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'pending')`,
          [parseInt(institutionId), program?.id || null, currentSessionId, student.registration_number,
           student.full_name, pinHash, pinEncrypted]
        );

        insertedStudents.push({
          id: result.insertId,
          registration_number: student.registration_number,
          full_name: student.full_name,
          program_name: program?.name || null,
          pin,
        });
      } catch (err) {
        insertErrors.push({
          registration_number: student.registration_number,
          error: err.message,
        });
      }
    }

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, details, ip_address)
       VALUES (?, ?, 'staff', 'students_bulk_upload', 'student', ?, ?)`,
      [parseInt(institutionId), req.user.id, 
       JSON.stringify({ total_uploaded: rawData.length, inserted: insertedStudents.length, errors: insertErrors.length }),
       req.ip]
    );

    res.json({
      success: true,
      message: `Successfully uploaded ${insertedStudents.length} students`,
      data: {
        inserted: insertedStudents.length,
        errors: insertErrors,
        students: insertedStudents,
      },
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

/**
 * Download Excel template
 * GET /:institutionId/students/template
 */
const downloadTemplate = async (req, res, next) => {
  try {
    const workbook = XLSX.utils.book_new();
    const templateData = [
      { full_name: 'JOHN DOE', registration_number: 'NCE/2024/001' },
      { full_name: 'JANE SMITH', registration_number: 'NCE/2024/002' },
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [{ wch: 30 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=student_upload_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Export students to Excel
 * GET /:institutionId/students/export
 */
const exportStudents = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { program_id, status, include_pins } = req.query;

    let sql = `
      SELECT s.registration_number, s.full_name, s.status, s.payment_status,
             s.pin_encrypted, p.name as program_name
      FROM students s
      LEFT JOIN programs p ON s.program_id = p.id
      WHERE s.institution_id = ?
    `;
    const params = [parseInt(institutionId)];

    if (program_id) {
      sql += ' AND s.program_id = ?';
      params.push(parseInt(program_id));
    }
    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.full_name';

    const students = await query(sql, params);

    const exportData = students.map(s => {
      const data = {
        registration_number: s.registration_number,
        full_name: s.full_name,
        program: s.program_name || 'Unassigned',
        status: s.status,
        payment_status: s.payment_status,
      };

      if (include_pins === 'true' && req.user.role === 'super_admin') {
        data.pin = s.pin_encrypted ? decryptStudentPin(s.pin_encrypted) : 'N/A';
      }

      return data;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = `students_export_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
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
  resetPin,
  bulkDetectPrograms,
  uploadFromExcel,
  downloadTemplate,
  exportStudents,
};
