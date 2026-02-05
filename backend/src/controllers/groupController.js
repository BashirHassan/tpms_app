/**
 * Group Controller
 * 
 * MedeePay Pattern: Direct SQL with institutionId from route params
 * Handles school groups and merged group management for student postings
 * 
 * IMPORTANT: Groups are derived from student_acceptances table (not a separate school_groups table).
 * A "group" is defined by the group_number column in student_acceptances for a given school + session.
 */

const { z } = require('zod');
const { query } = require('../db/database');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

// Validation schemas - simplified since school_groups CRUD is removed
const schemas = {
  assignStudent: z.object({
    body: z.object({
      student_id: z.number().int().positive('Student ID is required'),
      school_id: z.number().int().positive('School ID is required'),
      group_number: z.number().int().positive('Group number is required'),
      session_id: z.number().int().positive('Session ID is required'),
    }),
  }),
};

/**
 * Get all groups (derived from student_acceptances)
 * GET /:institutionId/groups
 * 
 * Groups are derived by aggregating student_acceptances by school + group_number
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id, school_id, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT 
        sa.institution_school_id,
        sa.group_number,
        sa.session_id,
        ms.name as school_name, 
        ms.official_code as school_code, 
        ms.ward, 
        ms.lga,
        sess.name as session_name,
        COUNT(DISTINCT sa.student_id) as student_count
      FROM student_acceptances sa
      JOIN institution_schools isv ON sa.institution_school_id = isv.id
      JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN academic_sessions sess ON sa.session_id = sess.id
      WHERE sa.institution_id = ? AND sa.status = 'approved'
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sa.session_id = ?';
      params.push(parseInt(session_id));
    }
    if (school_id) {
      sql += ' AND sa.institution_school_id = ?';
      params.push(parseInt(school_id));
    }

    sql += ' GROUP BY sa.institution_school_id, sa.group_number, sa.session_id, ms.name, ms.official_code, ms.ward, ms.lga, sess.name';

    // Count query - count distinct groups
    const countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT DISTINCT sa.institution_school_id, sa.group_number, sa.session_id
        FROM student_acceptances sa
        WHERE sa.institution_id = ? AND sa.status = 'approved'
        ${session_id ? ' AND sa.session_id = ?' : ''}
        ${school_id ? ' AND sa.institution_school_id = ?' : ''}
      ) as group_count
    `;
    const countParams = [parseInt(institutionId)];
    if (session_id) countParams.push(parseInt(session_id));
    if (school_id) countParams.push(parseInt(school_id));
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    // Add ordering and pagination
    sql += ' ORDER BY ms.name, sa.group_number LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const groups = await query(sql, params);

    // Generate synthetic IDs for backward compatibility
    const groupsWithIds = groups.map((g) => ({
      id: `${g.institution_school_id}-${g.group_number}-${g.session_id}`,
      ...g,
    }));

    res.json({
      success: true,
      data: groupsWithIds,
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
 * Get group by composite key (school_id-group_number-session_id)
 * GET /:institutionId/groups/:id
 * 
 * Note: The id can be a composite key format: "schoolId-groupNumber-sessionId"
 * or query params school_id, group_number, session_id
 */
const getById = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { school_id: qSchoolId, group_number: qGroupNumber, session_id: qSessionId } = req.query;

    let schoolId, groupNumber, sessionId;

    // Try parsing composite ID first
    if (id && id.includes('-')) {
      [schoolId, groupNumber, sessionId] = id.split('-').map(Number);
    } else if (qSchoolId && qGroupNumber && qSessionId) {
      schoolId = parseInt(qSchoolId);
      groupNumber = parseInt(qGroupNumber);
      sessionId = parseInt(qSessionId);
    } else {
      throw new ValidationError('Invalid group ID. Use composite format schoolId-groupNumber-sessionId or provide query params.');
    }

    if (!schoolId || !groupNumber || !sessionId) {
      throw new ValidationError('Invalid group ID format. Expected: schoolId-groupNumber-sessionId');
    }

    // Get group data from student_acceptances
    const groupData = await query(
      `SELECT 
        sa.institution_school_id,
        sa.group_number,
        sa.session_id,
        ms.name as school_name, 
        ms.official_code as school_code, 
        ms.address, 
        ms.ward, 
        ms.lga,
        sess.name as session_name,
        COUNT(DISTINCT sa.student_id) as student_count
       FROM student_acceptances sa
       JOIN institution_schools isv ON sa.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN academic_sessions sess ON sa.session_id = sess.id
       WHERE sa.institution_school_id = ? AND sa.group_number = ? AND sa.session_id = ? 
         AND sa.institution_id = ? AND sa.status = 'approved'
       GROUP BY sa.institution_school_id, sa.group_number, sa.session_id,
                ms.name, ms.official_code, ms.address, ms.ward, ms.lga, sess.name`,
      [schoolId, groupNumber, sessionId, parseInt(institutionId)]
    );

    if (groupData.length === 0) {
      throw new NotFoundError('Group not found');
    }

    const group = {
      id: `${schoolId}-${groupNumber}-${sessionId}`,
      ...groupData[0],
    };

    // Get students in this group
    const students = await query(
      `SELECT st.id, st.registration_number, st.full_name,
              p.name as program_name,
              sa.status as acceptance_status, sa.submitted_at
       FROM student_acceptances sa
       JOIN students st ON sa.student_id = st.id
       LEFT JOIN programs p ON st.program_id = p.id
       WHERE sa.institution_school_id = ? AND sa.group_number = ? 
         AND sa.session_id = ? AND sa.institution_id = ?
       ORDER BY st.full_name`,
      [schoolId, groupNumber, sessionId, parseInt(institutionId)]
    );

    // Get merged groups if any
    const mergedGroups = await query(
      `SELECT mg.*, 
              ps_ms.name as primary_school_name,
              ss_ms.name as dependent_school_name
       FROM merged_groups mg
       LEFT JOIN institution_schools ps_isv ON mg.primary_institution_school_id = ps_isv.id
       LEFT JOIN master_schools ps_ms ON ps_isv.master_school_id = ps_ms.id
       LEFT JOIN institution_schools ss_isv ON mg.secondary_institution_school_id = ss_isv.id
       LEFT JOIN master_schools ss_ms ON ss_isv.master_school_id = ss_ms.id
       WHERE (mg.primary_institution_school_id = ? OR mg.secondary_institution_school_id = ?)
         AND mg.session_id = ? AND mg.institution_id = ?`,
      [schoolId, schoolId, sessionId, parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        ...group,
        students,
        merged_groups: mergedGroups,
        student_count: students.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create school group - DEPRECATED
 * Groups are now derived from student_acceptances
 */
const create = async (req, res, next) => {
  res.status(400).json({
    success: false,
    message: 'Creating groups is no longer supported. Groups are derived from student acceptances.',
  });
};

/**
 * Update group - DEPRECATED
 */
const update = async (req, res, next) => {
  res.status(400).json({
    success: false,
    message: 'Updating groups is no longer supported. Groups are derived from student acceptances.',
  });
};

/**
 * Delete group - DEPRECATED
 */
const remove = async (req, res, next) => {
  res.status(400).json({
    success: false,
    message: 'Deleting groups is no longer supported. Groups are derived from student acceptances.',
  });
};

/**
 * Add students to group - DEPRECATED
 * Use student acceptance creation instead
 */
const addStudents = async (req, res, next) => {
  res.status(400).json({
    success: false,
    message: 'Use student acceptance creation to add students to groups.',
  });
};

/**
 * Remove students from group - DEPRECATED  
 * Use student acceptance deletion instead
 */
const removeStudents = async (req, res, next) => {
  res.status(400).json({
    success: false,
    message: 'Use student acceptance deletion to remove students from groups.',
  });
};

/**
 * Get groups summary - schools with students grouped by session
 * GET /:institutionId/groups/summary
 */
const getSummary = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    let sql = `
      SELECT 
        isv.id as institution_school_id,
        ms.name as school_name,
        ms.official_code as school_code,
        r.name as route_name,
        COUNT(DISTINCT sa.student_id) as student_count,
        COUNT(DISTINCT sa.group_number) as group_count
      FROM student_acceptances sa
      INNER JOIN institution_schools isv ON sa.institution_school_id = isv.id
      INNER JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE sa.institution_id = ? AND sa.status = 'approved'
    `;
    const params = [parseInt(institutionId)];

    if (session_id) {
      sql += ' AND sa.session_id = ?';
      params.push(parseInt(session_id));
    }

    sql += ' GROUP BY isv.id, ms.name, ms.official_code, r.name ORDER BY ms.name';

    const summary = await query(sql, params);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get students by school with their group assignments
 * GET /:institutionId/groups/schools/:schoolId/students
 */
const getStudentsBySchool = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const students = await query(
      `SELECT 
        sa.id,
        sa.student_id,
        sa.group_number,
        s.registration_number,
        s.full_name as name,
        p.name as program_name,
        sa.status as acceptance_status,
        sa.submitted_at
       FROM student_acceptances sa
       JOIN students s ON sa.student_id = s.id
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE sa.institution_id = ? 
         AND sa.institution_school_id = ? 
         AND sa.session_id = ?
         AND sa.status = 'approved'
       ORDER BY sa.group_number, s.full_name`,
      [parseInt(institutionId), parseInt(schoolId), parseInt(session_id)]
    );

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get groups for a specific school (with merge status)
 * GET /:institutionId/groups/schools/:schoolId/groups
 */
const getSchoolGroups = async (req, res, next) => {
  try {
    const { institutionId, schoolId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    // Get groups with student counts and merge status
    const groups = await query(
      `SELECT 
        sa.group_number,
        COUNT(sa.student_id) AS student_count,
        CASE WHEN mg_sec.id IS NOT NULL THEN 'secondary'
             WHEN mg_pri.id IS NOT NULL THEN 'primary'
             ELSE 'independent' END AS merge_status,
        CASE WHEN mg_sec.id IS NOT NULL OR mg_pri.id IS NOT NULL THEN 1 ELSE 0 END AS is_merged,
        mg_sec.primary_institution_school_id AS merged_with_school_id,
        mg_sec.primary_group_number AS merged_with_group_number
       FROM student_acceptances sa
       LEFT JOIN merged_groups mg_sec ON
         mg_sec.session_id = sa.session_id AND
         mg_sec.secondary_institution_school_id = sa.institution_school_id AND
         mg_sec.secondary_group_number = sa.group_number AND
         mg_sec.status = 'active'
       LEFT JOIN merged_groups mg_pri ON
         mg_pri.session_id = sa.session_id AND
         mg_pri.primary_institution_school_id = sa.institution_school_id AND
         mg_pri.primary_group_number = sa.group_number AND
         mg_pri.status = 'active'
       WHERE sa.institution_id = ?
         AND sa.institution_school_id = ?
         AND sa.session_id = ?
         AND sa.status = 'approved'
       GROUP BY sa.group_number, mg_sec.id, mg_pri.id,
                mg_sec.primary_institution_school_id, mg_sec.primary_group_number
       ORDER BY sa.group_number`,
      [parseInt(institutionId), parseInt(schoolId), parseInt(session_id)]
    );

    res.json({
      success: true,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign a student to a different group
 * POST /:institutionId/groups/assign-student
 */
const assignStudentGroup = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { student_id, school_id, group_number, session_id } = req.body;

    if (!student_id || !school_id || !group_number || !session_id) {
      throw new ValidationError('student_id, school_id, group_number, and session_id are required');
    }

    // Verify the acceptance exists
    const acceptances = await query(
      `SELECT id, group_number as old_group_number
       FROM student_acceptances
       WHERE institution_id = ? AND student_id = ? AND institution_school_id = ? AND session_id = ?`,
      [parseInt(institutionId), parseInt(student_id), parseInt(school_id), parseInt(session_id)]
    );

    if (acceptances.length === 0) {
      throw new NotFoundError('Student acceptance not found for this school and session');
    }

    const oldGroupNumber = acceptances[0].old_group_number;

    // Check if old group is a merged group and this is the last student
    const mergedCheck = await query(
      `SELECT mg.id, 
              (SELECT COUNT(*) FROM student_acceptances sa 
               WHERE sa.institution_school_id = ? AND sa.session_id = ? 
               AND sa.group_number = ? AND sa.status = 'approved') as student_count
       FROM merged_groups mg
       WHERE mg.session_id = ?
         AND ((mg.primary_institution_school_id = ? AND mg.primary_group_number = ?)
              OR (mg.secondary_institution_school_id = ? AND mg.secondary_group_number = ?))
         AND mg.status = 'active'`,
      [
        parseInt(school_id), parseInt(session_id), parseInt(oldGroupNumber),
        parseInt(session_id),
        parseInt(school_id), parseInt(oldGroupNumber),
        parseInt(school_id), parseInt(oldGroupNumber)
      ]
    );

    if (mergedCheck.length > 0 && mergedCheck[0].student_count <= 1) {
      throw new ValidationError(
        'Cannot move the last student from a merged group. Unmerge the group first.'
      );
    }

    // Update the student's group number
    await query(
      `UPDATE student_acceptances 
       SET group_number = ?, updated_at = NOW()
       WHERE institution_id = ? AND student_id = ? AND institution_school_id = ? AND session_id = ?`,
      [parseInt(group_number), parseInt(institutionId), parseInt(student_id), parseInt(school_id), parseInt(session_id)]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'student_regrouped', 'student_acceptance', ?, ?, ?)`,
      [
        parseInt(institutionId), 
        req.user.id, 
        acceptances[0].id,
        JSON.stringify({ 
          student_id, 
          school_id, 
          old_group: oldGroupNumber, 
          new_group: group_number 
        }),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: `Student moved from group ${oldGroupNumber} to group ${group_number}`,
      data: {
        student_id,
        school_id,
        old_group_number: oldGroupNumber,
        new_group_number: group_number
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all merged groups for a session
 * GET /:institutionId/groups/merged
 */
const getMergedGroups = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const mergedGroups = await query(
      `SELECT mg.*,
              ps.name AS primary_school_name, ps_isv.location_category AS primary_location,
              ss.name AS secondary_school_name, ss_isv.location_category AS secondary_location,
              u.name AS merged_by_name,
              (SELECT COUNT(*) FROM student_acceptances sa
               WHERE sa.session_id = mg.session_id
               AND sa.institution_school_id = mg.primary_institution_school_id
               AND sa.group_number = mg.primary_group_number
               AND sa.status = 'approved') AS primary_student_count,
              (SELECT COUNT(*) FROM student_acceptances sa
               WHERE sa.session_id = mg.session_id
               AND sa.institution_school_id = mg.secondary_institution_school_id
               AND sa.group_number = mg.secondary_group_number
               AND sa.status = 'approved') AS secondary_student_count
       FROM merged_groups mg
       JOIN institution_schools ps_isv ON mg.primary_institution_school_id = ps_isv.id
       JOIN master_schools ps ON ps_isv.master_school_id = ps.id
       JOIN institution_schools ss_isv ON mg.secondary_institution_school_id = ss_isv.id
       JOIN master_schools ss ON ss_isv.master_school_id = ss.id
       LEFT JOIN users u ON mg.merged_by = u.id
       WHERE mg.institution_id = ? AND mg.session_id = ? AND mg.status = 'active'
       ORDER BY ps.name, mg.primary_group_number`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    // Calculate total students for each merge
    const result = mergedGroups.map(mg => ({
      ...mg,
      total_students: (mg.primary_student_count || 0) + (mg.secondary_student_count || 0)
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get groups available for merging (have groups not yet merged as secondary)
 * GET /:institutionId/groups/available-for-merge
 */
const getAvailableForMerge = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      throw new ValidationError('Session ID is required');
    }

    const available = await query(
      `SELECT sa.institution_school_id, ms.name AS school_name, isv.location_category,
              r.name AS route_name,
              sa.group_number, COUNT(sa.student_id) AS student_count
       FROM student_acceptances sa
       JOIN institution_schools isv ON sa.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       LEFT JOIN merged_groups mg ON
         mg.session_id = sa.session_id AND
         mg.secondary_institution_school_id = sa.institution_school_id AND
         mg.secondary_group_number = sa.group_number AND
         mg.status = 'active'
       WHERE sa.institution_id = ? AND sa.session_id = ? AND sa.status = 'approved' AND mg.id IS NULL
       GROUP BY sa.institution_school_id, ms.name, isv.location_category, r.name, sa.group_number
       HAVING student_count > 0
       ORDER BY ms.name, sa.group_number`,
      [parseInt(institutionId), parseInt(session_id)]
    );

    res.json({
      success: true,
      data: available,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a group merge
 * POST /:institutionId/groups/merge
 */
const createMerge = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { 
      primary_school_id, 
      primary_group_number, 
      secondary_school_id, 
      secondary_group_number, 
      session_id 
    } = req.body;

    if (!primary_school_id || !primary_group_number || !secondary_school_id || !secondary_group_number || !session_id) {
      throw new ValidationError('All merge fields are required');
    }

    // Check if same group
    if (primary_school_id === secondary_school_id && primary_group_number === secondary_group_number) {
      throw new ValidationError('Cannot merge a group with itself');
    }

    // Check if secondary is already merged elsewhere
    const existingMerge = await query(
      `SELECT id FROM merged_groups
       WHERE session_id = ? AND secondary_institution_school_id = ? AND secondary_group_number = ?
       AND status = 'active'`,
      [parseInt(session_id), parseInt(secondary_school_id), parseInt(secondary_group_number)]
    );

    if (existingMerge.length > 0) {
      throw new ConflictError('Secondary group is already merged with another group');
    }

    // Check if this exact merge already exists
    const duplicateMerge = await query(
      `SELECT id FROM merged_groups
       WHERE session_id = ?
       AND ((primary_institution_school_id = ? AND primary_group_number = ? AND secondary_institution_school_id = ? AND secondary_group_number = ?)
            OR (primary_institution_school_id = ? AND primary_group_number = ? AND secondary_institution_school_id = ? AND secondary_group_number = ?))
       AND status = 'active'`,
      [
        parseInt(session_id),
        parseInt(primary_school_id), parseInt(primary_group_number), parseInt(secondary_school_id), parseInt(secondary_group_number),
        parseInt(secondary_school_id), parseInt(secondary_group_number), parseInt(primary_school_id), parseInt(primary_group_number)
      ]
    );

    if (duplicateMerge.length > 0) {
      throw new ConflictError('These groups are already merged');
    }

    // Get session config for max students
    const sessionConfig = await query(
      `SELECT max_students_per_merged_group FROM academic_sessions WHERE id = ? AND institution_id = ?`,
      [parseInt(session_id), parseInt(institutionId)]
    );

    const maxStudents = sessionConfig[0]?.max_students_per_merged_group || 6;

    // Count students in both groups
    const counts = await query(
      `SELECT
        (SELECT COUNT(*) FROM student_acceptances
         WHERE session_id = ? AND institution_school_id = ? AND group_number = ? AND status = 'approved') AS primary_count,
        (SELECT COUNT(*) FROM student_acceptances
         WHERE session_id = ? AND institution_school_id = ? AND group_number = ? AND status = 'approved') AS secondary_count`,
      [
        parseInt(session_id), parseInt(primary_school_id), parseInt(primary_group_number),
        parseInt(session_id), parseInt(secondary_school_id), parseInt(secondary_group_number)
      ]
    );

    const totalStudents = (counts[0]?.primary_count || 0) + (counts[0]?.secondary_count || 0);
    if (totalStudents > maxStudents) {
      throw new ValidationError(
        `Cannot merge ${totalStudents} students. Maximum allowed is ${maxStudents}`
      );
    }

    // Create the merge
    const result = await query(
      `INSERT INTO merged_groups
       (institution_id, session_id, primary_institution_school_id, primary_group_number,
        secondary_institution_school_id, secondary_group_number, merged_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        parseInt(institutionId),
        parseInt(session_id),
        parseInt(primary_school_id),
        parseInt(primary_group_number),
        parseInt(secondary_school_id),
        parseInt(secondary_group_number),
        req.user.id
      ]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'groups_merged', 'merged_group', ?, ?, ?)`,
      [
        parseInt(institutionId),
        req.user.id,
        result.insertId,
        JSON.stringify({
          primary_school_id,
          primary_group_number,
          secondary_school_id,
          secondary_group_number,
          total_students: totalStudents
        }),
        req.ip
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Groups merged successfully',
      data: { id: result.insertId, total_students: totalStudents }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel (unmerge) a group merge
 * DELETE /:institutionId/groups/merge/:mergeId
 */
const cancelMerge = async (req, res, next) => {
  try {
    const { institutionId, mergeId } = req.params;

    // Verify the merge exists and belongs to this institution
    const existing = await query(
      `SELECT id, primary_institution_school_id, primary_group_number, secondary_institution_school_id, secondary_group_number
       FROM merged_groups
       WHERE id = ? AND institution_id = ? AND status = 'active'`,
      [parseInt(mergeId), parseInt(institutionId)]
    );

    if (existing.length === 0) {
      throw new NotFoundError('Merged group not found');
    }

    // Cancel the merge
    await query(
      `UPDATE merged_groups
       SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW()
       WHERE id = ? AND institution_id = ?`,
      [req.user.id, parseInt(mergeId), parseInt(institutionId)]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (institution_id, user_id, user_type, action, resource_type, resource_id, details, ip_address)
       VALUES (?, ?, 'staff', 'groups_unmerged', 'merged_group', ?, ?, ?)`,
      [
        parseInt(institutionId),
        req.user.id,
        parseInt(mergeId),
        JSON.stringify(existing[0]),
        req.ip
      ]
    );

    res.json({
      success: true,
      message: 'Groups unmerged successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  schemas,
  getAll,
  getById,
  getSummary,
  getStudentsBySchool,
  getSchoolGroups,
  assignStudentGroup,
  getMergedGroups,
  getAvailableForMerge,
  createMerge,
  cancelMerge,
  create,
  update,
  remove,
  addStudents,
  removeStudents,
};
