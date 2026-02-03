/**
 * Portal Controller (MedeePay Pattern)
 * 
 * Handles student portal access and status.
 * Uses direct SQL with institutionId from route params.
 * Note: req.student is populated by student authentication middleware.
 */

const { z } = require('zod');
const { query, transaction } = require('../db/database');
const { NotFoundError, ValidationError, AuthorizationError } = require('../utils/errors');

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  updateProfile: z.object({
    body: z.object({
      email: z.string().email().optional().nullable(),
      phone: z.string().max(20).optional().nullable(),
    }),
  }),

  logActivity: z.object({
    body: z.object({
      action: z.string().min(1).max(100),
      details: z.record(z.any()).optional(),
    }),
  }),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current active session for institution
 */
async function getCurrentSession(institutionId) {
  const [session] = await query(
    `SELECT * FROM academic_sessions 
     WHERE institution_id = ? AND is_current = 1 
     ORDER BY created_at DESC LIMIT 1`,
    [institutionId]
  );
  return session || null;
}

/**
 * Check if a window is currently open
 */
function isWindowOpen(window) {
  if (!window.start_date || !window.end_date) return false;
  const now = new Date();
  return now >= new Date(window.start_date) && now <= new Date(window.end_date);
}

/**
 * Get window status
 */
function getWindowStatus(startDate, endDate) {
  if (!startDate || !endDate) return { status: 'not_configured', open: false };

  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now < start) {
    return { status: 'upcoming', open: false, starts_in: start - now };
  } else if (now > end) {
    return { status: 'closed', open: false, closed_since: now - end };
  } else {
    return { status: 'open', open: true, remaining: end - now };
  }
}

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

/**
 * Helper to get institution ID
 * For student portal routes, institution comes from student profile, not URL
 * For admin routes, institution comes from URL params
 */
function getInstitutionId(req) {
  // First try URL params (for admin routes like /:institutionId/portal/students/:studentId/...)
  if (req.params.institutionId) {
    return parseInt(req.params.institutionId);
  }
  // Fall back to student/user profile (for student portal routes like /portal/status)
  const id = req.student?.institution_id || req.user?.institution_id;
  return id ? parseInt(id) : null;
}

/**
 * Get student profile
 * GET /portal/profile (student) or GET /:institutionId/portal/students/:studentId/profile (admin)
 */
const getStudentProfile = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    const [student] = await query(
      `SELECT s.id, s.registration_number, s.full_name,
              s.program_id, s.session_id, s.status, s.payment_status,
              s.department_code, s.created_at, s.last_login_at,
              p.name as program_name, p.code as program_code,
              d.name as department_name,
              f.name as faculty_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN faculties f ON d.faculty_id = f.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [studentId, parseInt(institutionId)]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get institution info
    const [institution] = await query(
      `SELECT id, name, code, email, phone, address, logo_url, primary_color, tp_unit_name
       FROM institutions WHERE id = ?`,
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        student,
        institution,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's posting information
 * GET /portal/posting (student) or GET /:institutionId/portal/students/:studentId/posting (admin)
 */
const getStudentPosting = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    // Get current session
    const session = await getCurrentSession(parseInt(institutionId));

    if (!session) {
      return res.json({
        success: true,
        data: null,
        message: 'No active session',
      });
    }

    // Get student's acceptance (which contains school info)
    const [acceptance] = await query(
      `SELECT sa.*, 
              ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
              ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
              ms.principal_name, ms.principal_phone,
              ST_X(ms.location) as school_longitude, ST_Y(ms.location) as school_latitude,
              r.name as route_name
       FROM student_acceptances sa
       INNER JOIN institution_schools isv ON sa.institution_school_id = isv.id
       INNER JOIN master_schools ms ON isv.master_school_id = ms.id
       LEFT JOIN routes r ON isv.route_id = r.id
       WHERE sa.student_id = ? AND sa.session_id = ? AND sa.institution_id = ?
       ORDER BY sa.created_at DESC LIMIT 1`,
      [studentId, session.id, parseInt(institutionId)]
    );

    if (!acceptance) {
      return res.json({
        success: true,
        data: null,
        message: 'No posting found for current session',
      });
    }

    // Get supervisors assigned to this school
    const supervisors = await query(
      `SELECT sp.*, u.name as supervisor_name, u.phone as supervisor_phone, u.email as supervisor_email
       FROM supervisor_postings sp
       INNER JOIN users u ON sp.supervisor_id = u.id
       WHERE sp.institution_school_id = ? AND sp.session_id = ? AND sp.status = 'active'
         AND sp.group_number = ?
       ORDER BY sp.visit_number`,
      [acceptance.institution_school_id, session.id, acceptance.group_number || 1]
    );

    res.json({
      success: true,
      data: {
        acceptance,
        school: {
          id: acceptance.institution_school_id,
          name: acceptance.school_name,
          code: acceptance.school_code,
          address: acceptance.school_address,
          state: acceptance.school_state,
          lga: acceptance.school_lga,
          ward: acceptance.school_ward,
          principal_name: acceptance.principal_name,
          principal_phone: acceptance.principal_phone,
          latitude: acceptance.school_latitude,
          longitude: acceptance.school_longitude,
          route_name: acceptance.route_name,
        },
        supervisors,
        session: {
          id: session.id,
          name: session.name,
          tp_start_date: session.tp_start_date,
          tp_end_date: session.tp_end_date,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's results
 * GET /portal/results (student) or GET /:institutionId/portal/students/:studentId/results (admin)
 */
const getStudentResults = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const { session_id } = req.query;
    const studentId = req.student?.id || req.user?.id;

    // Get session (current or specified)
    let session;
    if (session_id) {
      [session] = await query(
        'SELECT * FROM academic_sessions WHERE id = ? AND institution_id = ?',
        [parseInt(session_id), parseInt(institutionId)]
      );
    } else {
      session = await getCurrentSession(parseInt(institutionId));
    }

    if (!session) {
      return res.json({
        success: true,
        data: {
          results: [],
          session: null,
          summary: null,
        },
        message: 'No active session',
      });
    }

    // Check if results are released
    const resultsReleased = session.results_release_date && 
                           new Date() >= new Date(session.results_release_date);

    if (!resultsReleased) {
      return res.json({
        success: true,
        data: {
          results: [],
          session: {
            id: session.id,
            name: session.name,
          },
          released: false,
          release_date: session.results_release_date,
        },
        message: 'Results have not been released yet',
      });
    }

    // Get results
    const results = await query(
      `SELECT sr.*, 
              sc.name as assessment_category,
              u.name as supervisor_name,
              ms.name as school_name
       FROM student_results sr
       LEFT JOIN scoring_criteria sc ON sr.criteria_id = sc.id
       LEFT JOIN users u ON sr.supervisor_id = u.id
       LEFT JOIN student_acceptances sa ON sr.student_id = sa.student_id AND sr.session_id = sa.session_id
       LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sr.student_id = ? AND sr.session_id = ? AND sr.institution_id = ?
       ORDER BY sr.visit_number, sr.created_at`,
      [studentId, session.id, parseInt(institutionId)]
    );

    // Calculate summary
    const summary = {
      total_assessments: results.length,
      average_score: results.length > 0 
        ? results.reduce((sum, r) => sum + parseFloat(r.score || 0), 0) / results.length 
        : 0,
      max_score: results.length > 0 ? Math.max(...results.map(r => parseFloat(r.score || 0))) : 0,
      min_score: results.length > 0 ? Math.min(...results.map(r => parseFloat(r.score || 0))) : 0,
    };

    // Get grade based on average
    const averageScore = summary.average_score;
    let grade = 'F';
    if (averageScore >= 70) grade = 'A';
    else if (averageScore >= 60) grade = 'B';
    else if (averageScore >= 50) grade = 'C';
    else if (averageScore >= 45) grade = 'D';
    else if (averageScore >= 40) grade = 'E';

    summary.grade = grade;

    res.json({
      success: true,
      data: {
        results,
        session: {
          id: session.id,
          name: session.name,
        },
        released: true,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's payment history
 * GET /portal/payments
 */
const getStudentPayments = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    // Get student with program info
    const [student] = await query(
      'SELECT id, payment_status, program_id FROM students WHERE id = ? AND institution_id = ?',
      [studentId, parseInt(institutionId)]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get all payments for the student
    const payments = await query(
      `SELECT p.*, sess.name as session_name
       FROM student_payments p
       LEFT JOIN academic_sessions sess ON p.session_id = sess.id
       WHERE p.student_id = ? AND p.institution_id = ?
       ORDER BY p.created_at DESC`,
      [studentId, parseInt(institutionId)]
    );

    // Calculate totals
    const totalPaid = payments
      .filter(p => p.status === 'success')
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    // Get institution payment settings
    const [institution] = await query(
      'SELECT payment_base_amount, payment_program_pricing FROM institutions WHERE id = ?',
      [parseInt(institutionId)]
    );

    // Get required amount - check program-specific pricing first
    let requiredAmount = parseFloat(institution?.payment_base_amount || 0);
    
    if (student.program_id && institution?.payment_program_pricing) {
      let programPricing = institution.payment_program_pricing;
      if (typeof programPricing === 'string') {
        try {
          programPricing = JSON.parse(programPricing);
        } catch (e) {
          programPricing = {};
        }
      }
      const programAmount = parseFloat(programPricing[student.program_id]);
      if (programAmount > 0) {
        requiredAmount = programAmount;
      }
    }

    res.json({
      success: true,
      data: {
        payments,
        summary: {
          total_paid: totalPaid,
          required_amount: requiredAmount,
          balance: requiredAmount - totalPaid,
          payment_status: student?.payment_status || 'pending',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update student profile
 * PUT /portal/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;
    const validation = schemas.updateProfile.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { email, phone } = validation.data.body;

    // Check if student exists
    const [existing] = await query(
      'SELECT * FROM students WHERE id = ? AND institution_id = ?',
      [studentId, parseInt(institutionId)]
    );

    if (!existing) {
      throw new NotFoundError('Student not found');
    }

    // Update profile
    const updates = [];
    const params = [];

    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updates.push('updated_at = NOW()');
    params.push(studentId, parseInt(institutionId));

    await query(
      `UPDATE students SET ${updates.join(', ')} WHERE id = ? AND institution_id = ?`,
      params
    );

    // Get updated profile
    const [updated] = await query(
      `SELECT id, registration_number, full_name, email, phone, program_id, status, payment_status
       FROM students WHERE id = ?`,
      [studentId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get portal status (comprehensive)
 * GET /portal/status
 */
const getPortalStatus = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    // Get student info
    const [student] = await query(
      `SELECT s.*, p.name as program_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [studentId, parseInt(institutionId)]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get current session
    const session = await getCurrentSession(parseInt(institutionId));

    if (!session) {
      return res.json({
        success: true,
        data: {
          active_session: false,
          message: 'No active teaching practice session',
        },
      });
    }

    // Get payment status info
    const [institution] = await query(
      'SELECT payment_enabled, payment_base_amount, payment_program_pricing FROM institutions WHERE id = ?',
      [parseInt(institutionId)]
    );

    // Get ALL payments for history display
    const allPayments = await query(
      `SELECT id, reference, amount, status, created_at
       FROM student_payments 
       WHERE student_id = ? AND session_id = ? AND institution_id = ?
       ORDER BY created_at DESC`,
      [parseInt(studentId), parseInt(session.id), parseInt(institutionId)]
    );

    // Calculate total from successful payments
    const totalPaid = allPayments
      .filter(p => p.status === 'success')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    // Get required amount - check program-specific pricing first
    let requiredAmount = parseFloat(institution?.payment_base_amount || 0);
    
    // If student has a program and program-specific pricing is configured, use that
    if (student.program_id && institution?.payment_program_pricing) {
      let programPricing = institution.payment_program_pricing;
      // Parse JSON if needed
      if (typeof programPricing === 'string') {
        try {
          programPricing = JSON.parse(programPricing);
        } catch (e) {
          programPricing = {};
        }
      }
      const programAmount = parseFloat(programPricing[student.program_id]);
      if (programAmount > 0) {
        requiredAmount = programAmount;
      }
    }
    
    const remaining = Math.max(0, requiredAmount - totalPaid);

    let paymentStatus = 'pending';
    if (!institution?.payment_enabled || requiredAmount === 0) {
      paymentStatus = 'not_required';
    } else if (totalPaid >= requiredAmount) {
      paymentStatus = 'completed';
    } else if (totalPaid > 0) {
      paymentStatus = 'partial';
    }

    const payment = {
      required: institution?.payment_enabled && requiredAmount > 0,
      status: paymentStatus,
      amount: requiredAmount,
      paid: totalPaid,
      remaining: remaining,
      can_pay: (institution?.payment_enabled && requiredAmount > 0 && paymentStatus !== 'completed'),
      currency: 'NGN',
      payments: allPayments.map(p => ({
        id: p.id,
        reference: p.reference,
        amount: parseFloat(p.amount),
        status: p.status,
        created_at: p.created_at,
      })),
    };

    // Check acceptance status
    const [acceptanceRecord] = await query(
      `SELECT sa.*, ms.name as school_name, ms.official_code as school_code
       FROM student_acceptances sa
       LEFT JOIN institution_schools isv ON sa.institution_school_id = isv.id
       LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sa.student_id = ? AND sa.session_id = ? AND sa.institution_id = ?`,
      [studentId, session.id, parseInt(institutionId)]
    );

    // Build window statuses with frontend-expected format
    const now = new Date();
    const acceptanceStart = session.acceptance_form_start_date ? new Date(session.acceptance_form_start_date) : null;
    const acceptanceEnd = session.acceptance_form_end_date ? new Date(session.acceptance_form_end_date) : null;
    const acceptanceWindowOpen = acceptanceStart && acceptanceEnd && now >= acceptanceStart && now <= acceptanceEnd;

    const postingLetterDate = session.posting_letter_available_date ? new Date(session.posting_letter_available_date) : null;
    const postingLetterAvailable = postingLetterDate && now >= postingLetterDate;

    const windows = {
      acceptance: {
        is_open: acceptanceWindowOpen,
        open: acceptanceWindowOpen,
        starts_at: session.acceptance_form_start_date,
        ends_at: session.acceptance_form_end_date,
        message: acceptanceWindowOpen 
          ? 'Acceptance window is open' 
          : acceptanceStart && now < acceptanceStart 
            ? `Opens on ${acceptanceStart.toLocaleDateString()}`
            : 'Acceptance window closed',
      },
      // Payment window uses the same dates as acceptance window
      payment: {
        is_open: acceptanceWindowOpen,
        starts_at: session.acceptance_form_start_date,
        ends_at: session.acceptance_form_end_date,
        message: acceptanceWindowOpen 
          ? 'Payment window is open' 
          : acceptanceStart && now < acceptanceStart 
            ? `Opens on ${acceptanceStart.toLocaleDateString()}`
            : 'Payment window closed',
      },
      posting_letter: {
        is_open: postingLetterAvailable,
        starts_at: session.posting_letter_available_date,
        message: postingLetterAvailable 
          ? 'Posting letters are available'
          : postingLetterDate
            ? `Available from ${postingLetterDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            : 'Not yet available',
      },
      result_viewing: getWindowStatus(session.results_release_date, session.tp_end_date),
      session: {
        is_locked: session.is_locked,
      },
    };

    // Build acceptance object with frontend-expected properties
    const paymentCompleted = paymentStatus === 'completed' || paymentStatus === 'not_required';
    const canSubmitAcceptance = acceptanceWindowOpen && !acceptanceRecord && paymentCompleted;

    const acceptance = {
      submitted: !!acceptanceRecord,
      status: acceptanceRecord?.status || null,
      can_submit: canSubmitAcceptance,
      school_id: acceptanceRecord?.institution_school_id || null,
      school_name: acceptanceRecord?.school_name || null,
      school_code: acceptanceRecord?.school_code || null,
      id: acceptanceRecord?.id || null,
      uploaded_at: acceptanceRecord?.created_at || null,
    };

    // Build posting_letter object
    const posting_letter = {
      available: postingLetterAvailable,
      can_download: postingLetterAvailable && !!acceptanceRecord,
      message: postingLetterAvailable 
        ? (acceptanceRecord 
            ? 'Your posting letter is ready for download'
            : 'Posting letters are available. Please submit your acceptance form first.')
        : (postingLetterDate
            ? `Available from ${postingLetterDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            : 'Not yet available'),
    };

    res.json({
      success: true,
      data: {
        active_session: true,
        session: {
          id: session.id,
          name: session.name,
          code: session.code,
          coordinator_name: session.coordinator_name,
          coordinator_phone: session.coordinator_phone,
          coordinator_email: session.coordinator_email,
          tp_start_date: session.tp_start_date,
          tp_end_date: session.tp_end_date,
        },
        student: {
          id: student.id,
          full_name: student.full_name,
          name: student.full_name, // alias for frontend compatibility
          registration_number: student.registration_number,
          program_name: student.program_name,
          program: student.program_name, // alias for frontend compatibility
          payment_status: student.payment_status,
        },
        acceptance,
        posting_letter,
        windows,
        payment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get session windows status
 * GET /portal/windows
 */
const getWindowsStatus = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);

    const session = await getCurrentSession(parseInt(institutionId));

    if (!session) {
      return res.json({
        success: true,
        data: {
          active_session: false,
          message: 'No active teaching practice session',
        },
      });
    }

    const windows = {
      acceptance: {
        name: 'Acceptance Upload Window',
        ...getWindowStatus(session.acceptance_window_start, session.acceptance_window_end),
        start_date: session.acceptance_window_start,
        end_date: session.acceptance_window_end,
      },
      tp_period: {
        name: 'Teaching Practice Period',
        ...getWindowStatus(session.tp_start_date, session.tp_end_date),
        start_date: session.tp_start_date,
        end_date: session.tp_end_date,
      },
      posting_letter: {
        name: 'Posting Letter Availability',
        ...getWindowStatus(session.posting_letter_available_date, session.tp_end_date),
        available_from: session.posting_letter_available_date,
      },
      results: {
        name: 'Results Release',
        ...getWindowStatus(session.results_release_date, null),
        release_date: session.results_release_date,
      },
    };

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          name: session.name,
          code: session.code,
        },
        windows,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log portal activity
 * POST /portal/activity
 */
const logActivity = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;
    const validation = schemas.logActivity.safeParse({ body: req.body });

    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.flatten().fieldErrors);
    }

    const { action, details } = validation.data.body;

    await query(
      `INSERT INTO portal_access_logs 
       (institution_id, student_id, action, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        parseInt(institutionId),
        studentId,
        action,
        details ? JSON.stringify(details) : null,
        req.ip,
        req.get('user-agent') || null,
      ]
    );

    res.json({
      success: true,
      message: 'Activity logged',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's activity logs
 * GET /portal/activity-logs
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const { limit = 50 } = req.query;
    const studentId = req.student?.id || req.user?.id;

    const logs = await query(
      `SELECT * FROM portal_access_logs 
       WHERE student_id = ? AND institution_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [studentId, parseInt(institutionId), parseInt(limit)]
    );

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};

/**
 * Get introduction letter data
 * GET /portal/documents/introduction-letter
 */
const getIntroductionLetterData = async (req, res, next) => {
  try {
    const institutionId = getInstitutionId(req);
    const studentId = req.student?.id || req.user?.id;

    const [student] = await query(
      `SELECT s.*, p.name as program_name, d.name as department_name, f.name as faculty_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN faculties f ON d.faculty_id = f.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [studentId, parseInt(institutionId)]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    const session = await getCurrentSession(parseInt(institutionId));
    if (!session) {
      throw new ValidationError('No active session');
    }

    const [institution] = await query(
      'SELECT * FROM institutions WHERE id = ?',
      [parseInt(institutionId)]
    );

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          full_name: student.full_name,
          registration_number: student.registration_number,
          program_name: student.program_name,
          department_name: student.department_name,
          faculty_name: student.faculty_name,
        },
        session: {
          id: session.id,
          name: session.name,
          code: session.code,
          tp_duration_weeks: session.tp_duration_weeks,
          coordinator_name: session.coordinator_name,
          coordinator_phone: session.coordinator_phone,
          coordinator_email: session.coordinator_email,
        },
        institution: {
          id: institution.id,
          name: institution.name,
          address: institution.address,
          email: institution.email,
          phone: institution.phone,
          logo_url: institution.logo_url,
          primary_color: institution.primary_color,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// DOCUMENT RENDERING
// ============================================================================

/**
 * Helper to format dates
 */
function formatDate(date, format = 'long') {
  if (!date) return '';
  const d = new Date(date);
  if (format === 'short') {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Render document for current student
 * GET /portal/documents/:documentType
 */
const renderDocument = async (req, res, next) => {
  try {
    const { documentType } = req.params;
    const studentId = req.student?.id || req.user?.id;
    const institutionId = req.student?.institution_id || req.user?.institution_id;

    if (!studentId || !institutionId) {
      throw new AuthorizationError('Student authentication required');
    }

    // Map document types
    const typeMap = {
      'posting_letter': 'posting_letter',
      'introduction_letter': 'introduction_letter',
      'acceptance_form': 'acceptance_form',
    };

    const dbDocumentType = typeMap[documentType];
    if (!dbDocumentType) {
      throw new ValidationError(`Invalid document type: ${documentType}`);
    }

    // Get current session
    const session = await getCurrentSession(institutionId);
    if (!session) {
      throw new NotFoundError('No active session found');
    }

    // Check access based on document type
    if (documentType === 'posting_letter') {
      // Check if posting letter window is open
      if (session.posting_letter_available_date) {
        const availableDate = new Date(session.posting_letter_available_date);
        if (new Date() < availableDate) {
          return res.status(403).json({
            success: false,
            message: 'Posting letter is not yet available',
            data: { available_from: session.posting_letter_available_date }
          });
        }
      }
      
      // Check if student has submitted acceptance form
      const [acceptance] = await query(
        `SELECT * FROM student_acceptances 
         WHERE student_id = ? AND session_id = ?`,
        [studentId, session.id]
      );
      if (!acceptance) {
        return res.status(404).json({
          success: false,
          message: 'You must submit your acceptance form to view the posting letter'
        });
      }
    }

    // Get template
    const [template] = await query(
      `SELECT * FROM document_templates 
       WHERE institution_id = ? 
       AND document_type = ? 
       AND status = 'published'
       AND (session_id IS NULL OR session_id = ?)
       ORDER BY session_id DESC, version DESC 
       LIMIT 1`,
      [institutionId, dbDocumentType, session.id]
    );

    if (!template) {
      throw new NotFoundError(`No published template found for ${documentType}`);
    }

    // Get student data
    const [student] = await query(
      `SELECT s.*, 
              p.name as program_name,
              d.name as department_name,
              f.name as faculty_name
       FROM students s
       LEFT JOIN programs p ON s.program_id = p.id
       LEFT JOIN departments d ON p.department_id = d.id
       LEFT JOIN faculties f ON d.faculty_id = f.id
       WHERE s.id = ? AND s.institution_id = ?`,
      [studentId, institutionId]
    );

    if (!student) {
      throw new NotFoundError('Student not found');
    }

    // Get institution data
    const [institution] = await query(
      'SELECT * FROM institutions WHERE id = ?',
      [institutionId]
    );

    // Get school data from acceptance
    let school = null;
    let acceptance = null;
    const [acceptanceRow] = await query(
      `SELECT sa.*, ms.name as school_name, ms.address as school_address, 
              ms.ward as school_ward, ms.lga as school_lga, ms.state as school_state,
              ms.principal_name, ms.principal_phone
       FROM student_acceptances sa
       JOIN institution_schools isv ON sa.institution_school_id = isv.id
       JOIN master_schools ms ON isv.master_school_id = ms.id
       WHERE sa.student_id = ? AND sa.session_id = ? AND sa.status = 'approved'`,
      [studentId, session.id]
    );
    if (acceptanceRow) {
      school = {
        name: acceptanceRow.school_name,
        address: acceptanceRow.school_address,
        ward: acceptanceRow.school_ward,
        lga: acceptanceRow.school_lga,
        state: acceptanceRow.school_state,
        principal_name: acceptanceRow.principal_name,
        principal_phone: acceptanceRow.principal_phone,
      };
      acceptance = acceptanceRow;
    }

    // Build placeholder data
    const placeholderData = {
      // Student
      student_name: student.full_name,
      student_fullname: student.full_name,
      student_title: student.gender === 'male' ? 'Mr.' : student.gender === 'female' ? 'Ms.' : '',
      student_regno: student.registration_number,
      matric_number: student.registration_number,
      student_registration_number: student.registration_number,
      student_program: student.program_name || '',
      student_course: student.program_name || '',
      student_department: student.department_name || '',
      student_faculty: student.faculty_name || '',
      // Institution
      institution_name: institution?.name || '',
      institution_short_name: institution?.code || '',
      institution_address: institution?.address || '',
      institution_phone: institution?.phone || '',
      institution_email: institution?.email || '',
      institution_logo: institution?.logo_url ? `<img src="${institution.logo_url}" alt="Logo" height="80">` : '',
      // Session
      session_name: session?.name || '',
      current_session: session?.name || '',
      session_code: session?.code || '',
      tp_start_date: session?.tp_start_date ? formatDate(session.tp_start_date) : '',
      tp_end_date: session?.tp_end_date ? formatDate(session.tp_end_date) : '',
      tp_duration_weeks: session?.tp_duration_weeks?.toString() || '12',
      tp_duration: `${session?.tp_duration_weeks || 12} weeks`,
      coordinator_name: session?.coordinator_name || '',
      coordinator_phone: session?.coordinator_phone || '',
      coordinator_email: session?.coordinator_email || '',
      // School
      school_name: school?.name || '',
      school_address: school?.address || '',
      school_state: school?.state || '',
      school_lga: school?.lga || '',
      school_ward: school?.ward || '',
      principal_name: school?.principal_name || '',
      principal_phone: school?.principal_phone || '',
      // Posting specific
      group_number: acceptance?.group_number?.toString() || '',
      // Dates
      today: formatDate(new Date()),
      today_date: formatDate(new Date()),
      posting_date: formatDate(new Date()),
      current_date: formatDate(new Date()),
      current_date_short: formatDate(new Date(), 'short'),
      current_year: new Date().getFullYear().toString(),
    };

    // Replace placeholders in content
    let renderedContent = template.content;
    for (const [key, value] of Object.entries(placeholderData)) {
      const regex = new RegExp(`\\{${key}(?::[a-z]+)?(?:\\|[^}]+)?\\}`, 'gi');
      renderedContent = renderedContent.replace(regex, value);
    }

    let renderedHeader = template.header_content;
    if (renderedHeader) {
      for (const [key, value] of Object.entries(placeholderData)) {
        const regex = new RegExp(`\\{${key}(?::[a-z]+)?(?:\\|[^}]+)?\\}`, 'gi');
        renderedHeader = renderedHeader.replace(regex, value);
      }
    }

    let renderedFooter = template.footer_content;
    if (renderedFooter) {
      for (const [key, value] of Object.entries(placeholderData)) {
        const regex = new RegExp(`\\{${key}(?::[a-z]+)?(?:\\|[^}]+)?\\}`, 'gi');
        renderedFooter = renderedFooter.replace(regex, value);
      }
    }

    res.json({
      success: true,
      data: {
        html: renderedContent,
        header_html: renderedHeader,
        footer_html: renderedFooter,
        css_styles: template.css_styles,
        page_size: template.page_size,
        page_orientation: template.page_orientation,
        page_margins: template.page_margins ? JSON.parse(template.page_margins) : null,
        template: {
          id: template.id,
          name: template.name,
          document_type: template.document_type,
          version: template.version,
        },
        student: {
          id: student.id,
          full_name: student.full_name,
          registration_number: student.registration_number,
          program_name: student.program_name,
          department_name: student.department_name,
          faculty_name: student.faculty_name,
        },
        session: {
          id: session.id,
          name: session.name,
          code: session.code,
          coordinator_name: session.coordinator_name,
          coordinator_phone: session.coordinator_phone,
          coordinator_email: session.coordinator_email,
        },
        school: school,
        institution: {
          id: institution?.id,
          name: institution?.name,
          code: institution?.code,
          logo_url: institution?.logo_url,
          address: institution?.address,
          email: institution?.email,
          phone: institution?.phone,
        },
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
  // Schema for validation
  schemas,
  
  // Portal methods
  getStudentProfile,
  getStudentPosting,
  getStudentResults,
  getStudentPayments,
  updateProfile,
  getPortalStatus,
  getWindowsStatus,
  logActivity,
  getActivityLogs,
  getIntroductionLetterData,
  renderDocument,
  
  // Admin access to student data (aliases for route compatibility)
  getStudentProfileById: getStudentProfile,
  getStudentPostingById: getStudentPosting,
  getStudentResultsById: getStudentResults,
};
