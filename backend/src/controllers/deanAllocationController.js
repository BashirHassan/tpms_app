/**
 * Dean Posting Allocation Controller - MedeePay Pattern
 * 
 * Manages posting allocations for deans.
 * Deans can be allocated a number of postings to create for supervisors within their faculty.
 */

const { query, transaction } = require('../db/database');
const { ValidationError, NotFoundError, AuthorizationError } = require('../utils/errors');
const { z } = require('zod');

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const schemas = {
  allocate: z.object({
    body: z.object({
      dean_user_id: z.number().int().positive('Dean user ID is required'),
      allocated_postings: z.number().int().min(0, 'Allocated postings must be 0 or greater'),
      notes: z.string().optional(),
    }),
  }),
  
  update: z.object({
    body: z.object({
      allocated_postings: z.number().int().min(0, 'Allocated postings must be 0 or greater'),
      notes: z.string().optional(),
    }),
  }),
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get current session for institution
 */
const getCurrentSession = async (institutionId) => {
  const [session] = await query(
    `SELECT id, name, max_supervision_visits FROM academic_sessions 
     WHERE institution_id = ? AND is_current = 1 LIMIT 1`,
    [parseInt(institutionId)]
  );
  return session;
};

/**
 * Get posting stats for the current session
 * Total postings = unique groups (from student_acceptances) × max_supervision_visits
 * Primary postings = total postings - merged groups
 */
const getPostingStats = async (institutionId, sessionId) => {
  // Get max supervision visits
  const [session] = await query(
    'SELECT max_supervision_visits FROM academic_sessions WHERE id = ? AND institution_id = ?',
    [parseInt(sessionId), parseInt(institutionId)]
  );
  const maxVisits = session?.max_supervision_visits || 3;

  // Count unique groups (school + group_number combinations) from approved acceptances
  const [groupStats] = await query(
    `SELECT COUNT(DISTINCT CONCAT(institution_school_id, '-', group_number)) as unique_groups 
     FROM student_acceptances 
     WHERE institution_id = ? AND session_id = ? AND status = 'approved'`,
    [parseInt(institutionId), parseInt(sessionId)]
  );

  // Count merged groups (secondary groups that are merged into primary groups)
  const [mergedStats] = await query(
    `SELECT COUNT(*) as merged_count FROM merged_groups 
     WHERE institution_id = ? AND session_id = ? AND status = 'active'`,
    [parseInt(institutionId), parseInt(sessionId)]
  );

  const uniqueGroups = groupStats?.unique_groups || 0;
  const mergedCount = mergedStats?.merged_count || 0;
  const totalExpected = uniqueGroups * maxVisits;
  const primaryPostings = totalExpected - (mergedCount * maxVisits);

  return {
    total_postings: totalExpected,
    primary_postings: primaryPostings,
    merged_postings: mergedCount * maxVisits,
    unique_groups: uniqueGroups,
    max_supervision_visits: maxVisits,
  };
};

/**
 * Get total allocated postings across all deans for a session
 */
const getTotalAllocatedPostings = async (institutionId, sessionId, excludeDeanId = null) => {
  let sql = `SELECT COALESCE(SUM(allocated_postings), 0) as total_allocated 
             FROM dean_posting_allocations 
             WHERE institution_id = ? AND session_id = ?`;
  const params = [parseInt(institutionId), parseInt(sessionId)];
  
  if (excludeDeanId) {
    sql += ' AND dean_user_id != ?';
    params.push(parseInt(excludeDeanId));
  }
  
  const [result] = await query(sql, params);
  return result?.total_allocated || 0;
};

// =============================================================================
// CONTROLLER METHODS
// =============================================================================

/**
 * Get posting allocation stats and summary
 * GET /:institutionId/dean-allocations/stats
 */
const getStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const session = await getCurrentSession(institutionId);
    
    if (!session) {
      throw new ValidationError('No active session found');
    }

    const postingStats = await getPostingStats(institutionId, session.id);
    const totalAllocated = await getTotalAllocatedPostings(institutionId, session.id);

    // Get used postings count
    const [usedStats] = await query(
      `SELECT COALESCE(SUM(used_postings), 0) as total_used 
       FROM dean_posting_allocations 
       WHERE institution_id = ? AND session_id = ?`,
      [parseInt(institutionId), session.id]
    );

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
        },
        postings: {
          total_postings: postingStats.total_postings,
          primary_postings: postingStats.primary_postings,
          merged_postings: postingStats.merged_postings,
          unique_groups: postingStats.unique_groups,
          max_supervision_visits: postingStats.max_supervision_visits,
        },
        allocations: {
          total_allocated: totalAllocated,
          total_used: usedStats?.total_used || 0,
          available_to_allocate: postingStats.primary_postings - totalAllocated,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all dean allocations for current session
 * GET /:institutionId/dean-allocations
 */
const getAll = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;
    
    // Use provided session_id or get current session
    let sessionId = session_id;
    if (!sessionId) {
      const session = await getCurrentSession(institutionId);
      if (!session) {
        throw new ValidationError('No active session found');
      }
      sessionId = session.id;
    }

    const allocations = await query(
      `SELECT 
         dpa.id,
         dpa.institution_id,
         dpa.session_id,
         dpa.dean_user_id,
         dpa.allocated_postings,
         dpa.used_postings,
         dpa.notes,
         dpa.created_at,
         dpa.updated_at,
         u.name as dean_name,
         u.email as dean_email,
         u.phone as dean_phone,
         f.id as faculty_id,
         f.name as faculty_name,
         f.code as faculty_code,
         ab.name as allocated_by_name
       FROM dean_posting_allocations dpa
       JOIN users u ON dpa.dean_user_id = u.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       JOIN users ab ON dpa.allocated_by = ab.id
       WHERE dpa.institution_id = ? AND dpa.session_id = ?
       ORDER BY dpa.created_at DESC`,
      [parseInt(institutionId), parseInt(sessionId)]
    );

    res.json({ success: true, data: allocations });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available deans (users with is_dean = 1 who don't have allocation yet)
 * GET /:institutionId/dean-allocations/available-deans
 */
const getAvailableDeans = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { session_id } = req.query;
    
    let sessionId = session_id;
    if (!sessionId) {
      const session = await getCurrentSession(institutionId);
      if (!session) {
        throw new ValidationError('No active session found');
      }
      sessionId = session.id;
    }

    const deans = await query(
      `SELECT 
         u.id,
         u.name,
         u.email,
         u.phone,
         u.role,
         f.id as faculty_id,
         f.name as faculty_name,
         f.code as faculty_code
       FROM users u
       LEFT JOIN faculties f ON u.faculty_id = f.id
       WHERE u.institution_id = ? 
         AND u.is_dean = 1 
         AND u.status = 'active'
         AND u.id NOT IN (
           SELECT dean_user_id FROM dean_posting_allocations 
           WHERE institution_id = ? AND session_id = ?
         )
       ORDER BY u.name`,
      [parseInt(institutionId), parseInt(institutionId), parseInt(sessionId)]
    );

    res.json({ success: true, data: deans });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all deans (for allocation dropdown)
 * GET /:institutionId/dean-allocations/all-deans
 */
const getAllDeans = async (req, res, next) => {
  try {
    const { institutionId } = req.params;

    const deans = await query(
      `SELECT 
         u.id,
         u.name,
         u.email,
         u.phone,
         u.role,
         f.id as faculty_id,
         f.name as faculty_name,
         f.code as faculty_code
       FROM users u
       LEFT JOIN faculties f ON u.faculty_id = f.id
       WHERE u.institution_id = ? 
         AND u.is_dean = 1 
         AND u.status = 'active'
       ORDER BY u.name`,
      [parseInt(institutionId)]
    );

    res.json({ success: true, data: deans });
  } catch (error) {
    next(error);
  }
};

/**
 * Create or update dean allocation
 * POST /:institutionId/dean-allocations
 */
const allocate = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const { dean_user_id, allocated_postings, notes } = req.body;
    const allocatedBy = req.user.id;

    // Validate dean_user_id and allocated_postings
    if (!dean_user_id || typeof allocated_postings !== 'number') {
      throw new ValidationError('Dean user ID and allocation number are required');
    }

    // Get current session
    const session = await getCurrentSession(institutionId);
    if (!session) {
      throw new ValidationError('No active session found');
    }

    // Verify user is a dean
    const [dean] = await query(
      `SELECT id, name, is_dean, faculty_id FROM users 
       WHERE id = ? AND institution_id = ? AND status = 'active'`,
      [parseInt(dean_user_id), parseInt(institutionId)]
    );

    if (!dean) {
      throw new NotFoundError('User not found');
    }

    if (!dean.is_dean) {
      throw new ValidationError('User must be a dean to receive posting allocation');
    }

    // Get posting stats and validate allocation doesn't exceed primary postings
    const postingStats = await getPostingStats(institutionId, session.id);
    const currentTotalAllocated = await getTotalAllocatedPostings(institutionId, session.id, dean_user_id);
    
    const newTotalAllocated = currentTotalAllocated + allocated_postings;
    if (newTotalAllocated > postingStats.primary_postings) {
      throw new ValidationError(
        `Total allocations (${newTotalAllocated}) cannot exceed primary postings (${postingStats.primary_postings}). ` +
        `Available: ${postingStats.primary_postings - currentTotalAllocated}`
      );
    }

    // Check if allocation already exists
    const [existingAllocation] = await query(
      `SELECT id, used_postings FROM dean_posting_allocations 
       WHERE institution_id = ? AND session_id = ? AND dean_user_id = ?`,
      [parseInt(institutionId), session.id, parseInt(dean_user_id)]
    );

    let result;
    if (existingAllocation) {
      // Validate new allocation is not less than used
      if (allocated_postings < existingAllocation.used_postings) {
        throw new ValidationError(
          `Cannot reduce allocation below used postings (${existingAllocation.used_postings})`
        );
      }
      
      // Update existing
      await query(
        `UPDATE dean_posting_allocations 
         SET allocated_postings = ?, notes = ?, allocated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [allocated_postings, notes || null, allocatedBy, existingAllocation.id]
      );
      result = { id: existingAllocation.id, action: 'updated' };
    } else {
      // Create new
      const insertResult = await query(
        `INSERT INTO dean_posting_allocations 
         (institution_id, session_id, dean_user_id, allocated_postings, used_postings, allocated_by, notes)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [parseInt(institutionId), session.id, parseInt(dean_user_id), allocated_postings, allocatedBy, notes || null]
      );
      result = { id: insertResult.insertId, action: 'created' };
    }

    res.status(existingAllocation ? 200 : 201).json({
      success: true,
      message: `Allocation ${result.action} successfully`,
      data: {
        id: result.id,
        dean_user_id,
        dean_name: dean.name,
        allocated_postings,
        session_id: session.id,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update dean allocation
 * PUT /:institutionId/dean-allocations/:id
 */
const update = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;
    const { allocated_postings, notes } = req.body;
    const allocatedBy = req.user.id;

    // Get existing allocation
    const [allocation] = await query(
      `SELECT * FROM dean_posting_allocations WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!allocation) {
      throw new NotFoundError('Allocation not found');
    }

    // Validate new allocation is not less than used
    if (allocated_postings < allocation.used_postings) {
      throw new ValidationError(
        `Cannot reduce allocation below used postings (${allocation.used_postings})`
      );
    }

    // Get posting stats and validate total allocations
    const postingStats = await getPostingStats(institutionId, allocation.session_id);
    const currentTotalAllocated = await getTotalAllocatedPostings(
      institutionId, 
      allocation.session_id, 
      allocation.dean_user_id
    );
    
    const newTotalAllocated = currentTotalAllocated + allocated_postings;
    if (newTotalAllocated > postingStats.primary_postings) {
      throw new ValidationError(
        `Total allocations (${newTotalAllocated}) cannot exceed primary postings (${postingStats.primary_postings}). ` +
        `Available: ${postingStats.primary_postings - currentTotalAllocated}`
      );
    }

    await query(
      `UPDATE dean_posting_allocations 
       SET allocated_postings = ?, notes = ?, allocated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [allocated_postings, notes !== undefined ? notes : allocation.notes, allocatedBy, parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Allocation updated successfully',
      data: { id: parseInt(id), allocated_postings },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete dean allocation
 * DELETE /:institutionId/dean-allocations/:id
 */
const remove = async (req, res, next) => {
  try {
    const { institutionId, id } = req.params;

    // Get existing allocation
    const [allocation] = await query(
      `SELECT * FROM dean_posting_allocations WHERE id = ? AND institution_id = ?`,
      [parseInt(id), parseInt(institutionId)]
    );

    if (!allocation) {
      throw new NotFoundError('Allocation not found');
    }

    // Don't allow deletion if postings have been used
    if (allocation.used_postings > 0) {
      throw new ValidationError(
        `Cannot delete allocation with used postings (${allocation.used_postings} used). ` +
        `Set allocation to ${allocation.used_postings} instead.`
      );
    }

    await query(
      'DELETE FROM dean_posting_allocations WHERE id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Allocation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user's dean allocation (for dean users accessing multiposting)
 * GET /:institutionId/dean-allocations/my-allocation
 */
const getMyAllocation = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const userId = req.user.id;

    // Check if user is a dean
    const [user] = await query(
      'SELECT id, is_dean, faculty_id FROM users WHERE id = ? AND institution_id = ?',
      [userId, parseInt(institutionId)]
    );

    if (!user || !user.is_dean) {
      return res.json({
        success: true,
        data: null,
        message: 'User is not a dean',
      });
    }

    // Get current session
    const session = await getCurrentSession(institutionId);
    if (!session) {
      return res.json({
        success: true,
        data: null,
        message: 'No active session',
      });
    }

    // Get allocation
    const [allocation] = await query(
      `SELECT 
         dpa.*,
         f.id as faculty_id,
         f.name as faculty_name
       FROM dean_posting_allocations dpa
       LEFT JOIN users u ON dpa.dean_user_id = u.id
       LEFT JOIN faculties f ON u.faculty_id = f.id
       WHERE dpa.institution_id = ? AND dpa.session_id = ? AND dpa.dean_user_id = ?`,
      [parseInt(institutionId), session.id, userId]
    );

    res.json({
      success: true,
      data: allocation || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get postings created by the current dean
 * GET /:institutionId/dean-allocations/my-postings
 */
const getMyPostings = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const userId = req.user.id;
    const { session_id } = req.query;

    // Check if user is a dean
    const [user] = await query(
      'SELECT id, is_dean, faculty_id FROM users WHERE id = ? AND institution_id = ?',
      [userId, parseInt(institutionId)]
    );

    if (!user || !user.is_dean) {
      return res.json({
        success: true,
        data: [],
        message: 'User is not a dean',
      });
    }

    // Get session (use provided or current)
    let sessionId = session_id;
    if (!sessionId) {
      const session = await getCurrentSession(institutionId);
      if (!session) {
        return res.json({
          success: true,
          data: [],
          message: 'No active session',
        });
      }
      sessionId = session.id;
    }

    // Get postings created by this dean
    const postings = await query(
      `SELECT 
         sp.id,
         sp.institution_id,
         sp.session_id,
         sp.supervisor_id,
         sp.institution_school_id,
         sp.route_id,
         sp.group_number,
         sp.visit_number,
         sp.distance_km,
         sp.is_primary_posting,
         sp.status,
         sp.posted_at,
         sp.created_by_dean_id,
         u.name as supervisor_name,
         u.email as supervisor_email,
         ms.name as school_name,
         isv.distance_km as school_distance,
         r.name as route_name,
         ases.name as session_name
       FROM supervisor_postings sp
       JOIN users u ON sp.supervisor_id = u.id
       JOIN institution_schools isv ON sp.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON sp.route_id = r.id
       JOIN academic_sessions ases ON sp.session_id = ases.id
       WHERE sp.institution_id = ? 
         AND sp.session_id = ?
         AND sp.created_by_dean_id = ?
         AND sp.is_primary_posting = 1
         AND sp.status != 'cancelled'
       ORDER BY sp.posted_at DESC`,
      [parseInt(institutionId), parseInt(sessionId), userId]
    );

    // Get allocation for context
    const [allocation] = await query(
      `SELECT allocated_postings, used_postings 
       FROM dean_posting_allocations 
       WHERE institution_id = ? AND session_id = ? AND dean_user_id = ?`,
      [parseInt(institutionId), parseInt(sessionId), userId]
    );

    res.json({
      success: true,
      data: postings,
      allocation: allocation || null,
      total: postings.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a posting created by the current dean
 * DELETE /:institutionId/dean-allocations/my-postings/:postingId
 */
const deleteMyPosting = async (req, res, next) => {
  try {
    const { institutionId, postingId } = req.params;
    const userId = req.user.id;

    // Check if user is a dean
    const [user] = await query(
      'SELECT id, is_dean FROM users WHERE id = ? AND institution_id = ?',
      [userId, parseInt(institutionId)]
    );

    if (!user || !user.is_dean) {
      throw new AuthorizationError('User is not a dean');
    }

    // Get the posting and verify it was created by this dean
    const [posting] = await query(
      `SELECT sp.*, ases.is_current as session_is_current
       FROM supervisor_postings sp
       JOIN academic_sessions ases ON sp.session_id = ases.id
       WHERE sp.id = ? AND sp.institution_id = ? AND sp.created_by_dean_id = ?`,
      [parseInt(postingId), parseInt(institutionId), userId]
    );

    if (!posting) {
      throw new NotFoundError('Posting not found or not created by you');
    }

    // Only allow deletion for current session
    if (!posting.session_is_current) {
      throw new ValidationError('Cannot delete postings from past sessions');
    }

    // Delete the primary posting
    await query(
      `UPDATE supervisor_postings SET status = 'cancelled' WHERE id = ?`,
      [parseInt(postingId)]
    );

    // Delete any dependent (merged group) postings
    await query(
      `UPDATE supervisor_postings SET status = 'cancelled' 
       WHERE merged_with_posting_id = ? AND institution_id = ?`,
      [parseInt(postingId), parseInt(institutionId)]
    );

    // Decrement used_postings count in allocation
    await query(
      `UPDATE dean_posting_allocations 
       SET used_postings = GREATEST(0, used_postings - 1), updated_at = NOW()
       WHERE institution_id = ? AND session_id = ? AND dean_user_id = ?`,
      [parseInt(institutionId), posting.session_id, userId]
    );

    res.json({
      success: true,
      message: 'Posting deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  getAll,
  getAvailableDeans,
  getAllDeans,
  allocate,
  update,
  remove,
  getMyAllocation,
  getMyPostings,
  deleteMyPosting,
  schemas,
};
