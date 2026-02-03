/**
 * Dashboard Controller - MedeePay Pattern
 * 
 * Provides role-specific dashboard statistics:
 * 1. Global Dashboard (super_admin) - Cross-institution stats
 * 2. Institution Dashboard (head_of_teaching_practice) - Institution stats
 * 3. Supervisor Dashboard (supervisor, field_monitor) - Assignment stats
 */

const { query } = require('../db/database');
const { NotFoundError, ValidationError } = require('../utils/errors');

/**
 * Get global dashboard statistics (super_admin only)
 * Cross-institution overview for platform administrators
 */
const getGlobalStats = async (req, res, next) => {
  try {
    // Institution overview
    const [institutionStats] = await query(`
      SELECT 
        COUNT(*) as total_institutions,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_institutions,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_institutions
      FROM institutions
    `);

    // User overview across all institutions
    const [userStats] = await query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'head_of_teaching_practice' THEN 1 ELSE 0 END) as heads_of_tp,
        SUM(CASE WHEN role = 'supervisor' THEN 1 ELSE 0 END) as supervisors,
        SUM(CASE WHEN role = 'field_monitor' THEN 1 ELSE 0 END) as field_monitors
      FROM users
      WHERE status = 'active' AND role != 'super_admin'
    `);

    // Student overview across all institutions
    const [studentStats] = await query(`
      SELECT 
        COUNT(*) as total_students,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_students,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_students,
        SUM(CASE WHEN acceptance_status = 'approved' THEN 1 ELSE 0 END) as approved_students
      FROM students
    `);

    // School overview across all institutions
    const [schoolStats] = await query(`
      SELECT 
        COUNT(*) as total_schools,
        SUM(CASE WHEN isv.status = 'active' THEN 1 ELSE 0 END) as active_schools
      FROM institution_schools isv
    `);

    // Session overview
    const [sessionStats] = await query(`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END) as current_sessions
      FROM academic_sessions
    `);

    // Posting overview
    const [postingStats] = await query(`
      SELECT 
        COUNT(*) as total_postings,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_postings,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_postings
      FROM supervisor_postings
    `);

    // Institution list with basic stats
    const institutions = await query(`
      SELECT 
        i.id,
        i.name,
        i.code,
        i.subdomain,
        i.status,
        i.logo_url,
        (SELECT COUNT(*) FROM students s WHERE s.institution_id = i.id AND s.status = 'active') as student_count,
        (SELECT COUNT(*) FROM users u WHERE u.institution_id = i.id AND u.status = 'active') as user_count,
        (SELECT COUNT(*) FROM institution_schools isv WHERE isv.institution_id = i.id AND isv.status = 'active') as school_count
      FROM institutions i
      ORDER BY i.name
      LIMIT 20
    `);

    // Recent activity across all institutions (audit logs)
    const recentActivity = await query(`
      SELECT 
        a.action,
        a.resource_type,
        a.user_type,
        a.created_at,
        i.name as institution_name,
        CASE 
          WHEN a.user_type = 'staff' THEN (SELECT name FROM users WHERE id = a.user_id)
          WHEN a.user_type = 'student' THEN (SELECT full_name FROM students WHERE id = a.user_id)
          ELSE 'System'
        END as user_name
      FROM audit_logs a
      LEFT JOIN institutions i ON a.institution_id = i.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        summary: {
          institutions: institutionStats,
          users: userStats,
          students: studentStats,
          schools: schoolStats,
          sessions: sessionStats,
          postings: postingStats,
        },
        institutions,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get institution dashboard statistics (head_of_teaching_practice)
 * Institution-specific overview with detailed stats
 */
const getInstitutionStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const parsedInstitutionId = parseInt(institutionId);

    if (!parsedInstitutionId) {
      throw new ValidationError('Institution ID is required');
    }

    // Get current session for the institution (including max_supervision_visits)
    const [currentSession] = await query(
      `SELECT id, name, code, is_current, tp_start_date, tp_end_date, max_supervision_visits 
       FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 
       LIMIT 1`,
      [parsedInstitutionId]
    );

    const sessionId = currentSession?.id;
    const maxSupervisionVisits = currentSession?.max_supervision_visits || 3;

    // Student statistics (simplified acceptance status: submitted vs not submitted)
    const [studentStats] = await query(`
      SELECT 
        COUNT(*) as total_students,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_students,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_students
      FROM students
      WHERE institution_id = ? AND session_id = ?
    `, [parsedInstitutionId, sessionId]);

    // Staff statistics
    const [staffStats] = await query(`
      SELECT 
        COUNT(*) as total_staff,
        SUM(CASE WHEN role = 'supervisor' THEN 1 ELSE 0 END) as supervisors,
        SUM(CASE WHEN role = 'field_monitor' THEN 1 ELSE 0 END) as field_monitors,
        SUM(CASE WHEN role = 'head_of_teaching_practice' THEN 1 ELSE 0 END) as heads_of_tp
      FROM users
      WHERE institution_id = ? AND status = 'active'
    `, [parsedInstitutionId]);

    // School statistics
    const [schoolStats] = await query(`
      SELECT 
        COUNT(*) as total_schools,
        SUM(CASE WHEN isv.status = 'active' THEN 1 ELSE 0 END) as active_schools,
        SUM(CASE WHEN isv.location_category = 'inside' THEN 1 ELSE 0 END) as inside_schools,
        SUM(CASE WHEN isv.location_category = 'outside' THEN 1 ELSE 0 END) as outside_schools
      FROM institution_schools isv
      WHERE isv.institution_id = ?
    `, [parsedInstitutionId]);

    // Acceptance statistics (for calculating total postings)
    // Submitted = any record exists in student_acceptances for the student
    const [acceptanceStats] = await query(`
      SELECT 
        COUNT(*) as total_submitted
      FROM student_acceptances
      WHERE institution_id = ? AND session_id = ?
    `, [parsedInstitutionId, sessionId]);

    // Merged groups count (secondary groups that are merged to primary)
    const [mergedGroupsStats] = await query(`
      SELECT 
        COUNT(*) as merged_count
      FROM merged_groups
      WHERE institution_id = ? AND session_id = ? AND status = 'active'
    `, [parsedInstitutionId, sessionId]);

    // Calculate posting statistics
    // Total expected postings = acceptances submitted × max_supervision_visits
    const totalAcceptancesSubmitted = acceptanceStats?.total_submitted || 0;
    const mergedCount = mergedGroupsStats?.merged_count || 0;
    const totalExpectedPostings = totalAcceptancesSubmitted * maxSupervisionVisits;
    // Primary postings = total expected - merged (since merged groups reduce required postings)
    const primaryPostings = totalExpectedPostings - mergedCount;
    // Secondary = merged groups count
    const secondaryPostings = mergedCount;

    const postingStats = {
      total_postings: totalExpectedPostings,
      primary_postings: primaryPostings,
      secondary_postings: secondaryPostings,
      max_supervision_visits: maxSupervisionVisits,
    };

    // Payment statistics (kept for super_admin visibility)
    const [paymentStats] = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) as successful_amount
      FROM student_payments
      WHERE institution_id = ? AND session_id = ?
    `, [parsedInstitutionId, sessionId]);

    // Acceptance breakdown for student status card (submitted vs not submitted)
    const [acceptanceBreakdown] = await query(`
      SELECT 
        (SELECT COUNT(DISTINCT sa.student_id) FROM student_acceptances sa 
         WHERE sa.institution_id = ? AND sa.session_id = ?) as submitted,
        (SELECT COUNT(*) FROM students s 
         WHERE s.institution_id = ? AND s.session_id = ? 
         AND s.id NOT IN (
           SELECT DISTINCT sa2.student_id FROM student_acceptances sa2 
           WHERE sa2.institution_id = s.institution_id AND sa2.session_id = s.session_id
         )) as not_submitted
    `, [parsedInstitutionId, sessionId, parsedInstitutionId, sessionId]);

    // Result statistics (with compliance calculation)
    const [resultStats] = await query(`
      SELECT 
        COUNT(*) as total_results,
        COUNT(DISTINCT student_id) as students_assessed,
        MAX(total_score) as highest_score,
        MIN(total_score) as lowest_score
      FROM student_results
      WHERE institution_id = ? AND session_id = ?
    `, [parsedInstitutionId, sessionId]);

    // Calculate compliance percentage: (total_results / total_expected_postings) * 100
    const totalResults = resultStats?.total_results || 0;
    const compliancePercentage = totalExpectedPostings > 0 
      ? Math.round((totalResults / totalExpectedPostings) * 100 * 10) / 10 
      : 0;

    // Students by program
    const studentsByProgram = await query(`
      SELECT 
        p.name as program_name,
        p.code as program_code,
        COUNT(s.id) as student_count
      FROM programs p
      LEFT JOIN students s ON s.program_id = p.id AND s.session_id = ?
      WHERE p.institution_id = ?
      GROUP BY p.id, p.name, p.code
      ORDER BY student_count DESC
      LIMIT 10
    `, [sessionId, parsedInstitutionId]);

    // Recent activity
    const recentActivity = await query(`
      SELECT 
        action,
        resource_type,
        user_type,
        created_at,
        CASE 
          WHEN user_type = 'staff' THEN (SELECT name FROM users WHERE id = user_id)
          WHEN user_type = 'student' THEN (SELECT full_name FROM students WHERE id = user_id)
          ELSE 'System'
        END as user_name
      FROM audit_logs
      WHERE institution_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [parsedInstitutionId]);

    // Pending school update requests
    const [pendingUpdateRequests] = await query(`
      SELECT 
        (SELECT COUNT(*) FROM school_location_update_requests 
         WHERE institution_id = ? AND status = 'pending') as pending_location_updates,
        (SELECT COUNT(*) FROM school_principal_update_requests 
         WHERE institution_id = ? AND status = 'pending') as pending_principal_updates
    `, [parsedInstitutionId, parsedInstitutionId]);

    res.json({
      success: true,
      data: {
        currentSession,
        summary: {
          students: studentStats,
          staff: staffStats,
          schools: schoolStats,
          postings: postingStats,
          payments: paymentStats,
          acceptances: {
            submitted: acceptanceBreakdown?.submitted || 0,
            not_submitted: acceptanceBreakdown?.not_submitted || 0,
          },
          results: {
            ...resultStats,
            compliance_percentage: compliancePercentage,
          },
          pendingRequests: pendingUpdateRequests,
        },
        charts: {
          studentsByProgram,
        },
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get supervisor dashboard statistics
 * For supervisors, lead monitors, and field monitors
 */
const getSupervisorStats = async (req, res, next) => {
  try {
    const { institutionId } = req.params;
    const parsedInstitutionId = parseInt(institutionId);
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!parsedInstitutionId) {
      throw new ValidationError('Institution ID is required');
    }

    // Get current session for the institution
    const [currentSession] = await query(
      `SELECT id, name, code, is_current, tp_start_date, tp_end_date 
       FROM academic_sessions 
       WHERE institution_id = ? AND is_current = 1 
       LIMIT 1`,
      [parsedInstitutionId]
    );

    const sessionId = currentSession?.id;

    // Different stats based on role
    let myPostings = [];
    let myAssignments = [];
    let myResults = [];
    let myReports = [];

    if (userRole === 'supervisor') {
      // Supervisor postings
      myPostings = await query(`
        SELECT 
          sp.id,
          sp.institution_school_id,
          ms.name as school_name,
          sp.group_number,
          sp.visit_number,
          sp.status,
          sp.distance_km,
          sp.local_running,
          sp.transport,
          sp.dsa,
          sp.dta,
          sp.tetfund,
          sp.created_at,
          (SELECT COUNT(*) FROM student_acceptances sa 
           WHERE sa.institution_school_id = sp.institution_school_id 
           AND sa.group_number = sp.group_number 
           AND sa.session_id = sp.session_id
           AND sa.status = 'approved') as student_count
        FROM supervisor_postings sp
        JOIN institution_schools isv ON sp.institution_school_id = isv.id
        JOIN master_schools ms ON isv.master_school_id = ms.id
        WHERE sp.institution_id = ? 
          AND sp.session_id = ? 
          AND sp.supervisor_id = ?
          AND sp.status != 'cancelled'
        ORDER BY sp.created_at DESC
        LIMIT 20
      `, [parsedInstitutionId, sessionId, userId]);

      // Results submitted by this supervisor
      myResults = await query(`
        SELECT 
          sr.id,
          sr.student_id,
          s.full_name as student_name,
          s.registration_number,
          ms.name as school_name,
          sr.group_number,
          sr.visit_number,
          sr.total_score,
          sr.created_at
        FROM student_results sr
        JOIN students s ON sr.student_id = s.id
        JOIN institution_schools isv ON sr.institution_school_id = isv.id
        JOIN master_schools ms ON isv.master_school_id = ms.id
        WHERE sr.institution_id = ? 
          AND sr.session_id = ? 
          AND sr.supervisor_id = ?
        ORDER BY sr.created_at DESC
        LIMIT 20
      `, [parsedInstitutionId, sessionId, userId]);

    } else if (userRole === 'field_monitor') {
      // Monitor assignments
      myAssignments = await query(`
        SELECT 
          ma.id,
          ma.institution_school_id,
          ms.name as school_name,
          ma.monitoring_type,
          ma.priority,
          ma.status,
          ma.notes,
          ma.assigned_at
        FROM monitor_assignments ma
        JOIN institution_schools isv ON ma.institution_school_id = isv.id
        JOIN master_schools ms ON isv.master_school_id = ms.id
        WHERE ma.institution_id = ? 
          AND ma.session_id = ? 
          AND ma.monitor_id = ?
          AND ma.status != 'cancelled'
        ORDER BY ma.assigned_at DESC
        LIMIT 20
      `, [parsedInstitutionId, sessionId, userId]);

      // Reports submitted by this monitor
      myReports = await query(`
        SELECT 
          mr.id,
          mr.institution_school_id,
          ms.name as school_name,
          mr.visit_date,
          mr.supervisor_present,
          mr.students_observed,
          mr.overall_rating,
          mr.status,
          mr.created_at
        FROM monitoring_reports mr
        JOIN institution_schools isv ON mr.institution_school_id = isv.id
        JOIN master_schools ms ON isv.master_school_id = ms.id
        WHERE mr.institution_id = ? 
          AND mr.session_id = ? 
          AND mr.monitor_id = ?
        ORDER BY mr.created_at DESC
        LIMIT 20
      `, [parsedInstitutionId, sessionId, userId]);
    }

    // Summary statistics based on role
    let summaryStats = {};

    if (userRole === 'supervisor') {
      // Get session's inside distance threshold for inside/outside calculation
      const [sessionConfig] = await query(
        'SELECT inside_distance_threshold_km FROM academic_sessions WHERE id = ?',
        [sessionId]
      );
      const threshold = parseFloat(sessionConfig?.inside_distance_threshold_km) || 10;

      // Enhanced postings summary with inside/outside counts and allowances
      const [postingsSummary] = await query(`
        SELECT 
          COUNT(*) as total_postings,
          SUM(CASE WHEN is_primary_posting = 1 THEN 1 ELSE 0 END) as primary_postings,
          SUM(CASE WHEN is_primary_posting = 0 OR is_primary_posting IS NULL THEN 1 ELSE 0 END) as merged_postings,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_postings,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_postings,
          SUM(CASE WHEN COALESCE(distance_km, 0) <= ? THEN 1 ELSE 0 END) as inside_count,
          SUM(CASE WHEN COALESCE(distance_km, 0) > ? THEN 1 ELSE 0 END) as outside_count,
          COALESCE(SUM(CASE WHEN is_primary_posting = 1 THEN local_running + transport + dsa + dta ELSE 0 END), 0) +
          (SELECT COALESCE(MAX(tetfund), 0) FROM supervisor_postings 
           WHERE institution_id = ? AND session_id = ? AND supervisor_id = ? AND is_primary_posting = 1) as total_allowances
        FROM supervisor_postings
        WHERE institution_id = ? AND session_id = ? AND supervisor_id = ?
      `, [threshold, threshold, parsedInstitutionId, sessionId, userId, parsedInstitutionId, sessionId, userId]);

      // Get total students assigned to this supervisor's postings
      const [studentsSummary] = await query(`
        SELECT COUNT(DISTINCT sa.student_id) as total_students
        FROM student_acceptances sa
        JOIN supervisor_postings sp ON sa.institution_school_id = sp.institution_school_id 
          AND sa.group_number = sp.group_number 
          AND sa.session_id = sp.session_id
        WHERE sp.institution_id = ? AND sp.session_id = ? AND sp.supervisor_id = ?
      `, [parsedInstitutionId, sessionId, userId]);

      const [resultsSummary] = await query(`
        SELECT 
          COUNT(*) as total_results,
          COUNT(DISTINCT student_id) as students_assessed,
          ROUND(AVG(total_score), 2) as average_score
        FROM student_results
        WHERE institution_id = ? AND session_id = ? AND supervisor_id = ?
      `, [parsedInstitutionId, sessionId, userId]);

      summaryStats = {
        postings: {
          ...postingsSummary,
          total_students: studentsSummary?.total_students || 0,
        },
        results: resultsSummary,
      };
    } else {
      const [assignmentsSummary] = await query(`
        SELECT 
          COUNT(*) as total_assignments,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_assignments,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_assignments
        FROM monitor_assignments
        WHERE institution_id = ? AND session_id = ? AND monitor_id = ?
      `, [parsedInstitutionId, sessionId, userId]);

      const [reportsSummary] = await query(`
        SELECT 
          COUNT(*) as total_reports,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_reports,
          SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as submitted_reports
        FROM monitoring_reports
        WHERE institution_id = ? AND session_id = ? AND monitor_id = ?
      `, [parsedInstitutionId, sessionId, userId]);

      summaryStats = {
        assignments: assignmentsSummary,
        reports: reportsSummary,
      };
    }

    // Upcoming deadlines / important dates
    const upcomingDates = [];
    if (currentSession?.tp_start_date) {
      upcomingDates.push({
        type: 'tp_start',
        title: 'TP Start Date',
        date: currentSession.tp_start_date,
      });
    }
    if (currentSession?.tp_end_date) {
      upcomingDates.push({
        type: 'tp_end',
        title: 'TP End Date',
        date: currentSession.tp_end_date,
      });
    }

    // Fetch supervision visit timelines if user is supervisor
    if (userRole === 'supervisor' && sessionId) {
      const timelines = await query(
        `SELECT visit_number, title, start_date, end_date 
         FROM supervision_visit_timelines
         WHERE session_id = ? AND institution_id = ?
         ORDER BY visit_number ASC`,
        [sessionId, parsedInstitutionId]
      );

      timelines.forEach(timeline => {
        upcomingDates.push({
          type: 'supervision_visit',
          title: timeline.title || `Visit ${timeline.visit_number}`,
          date: timeline.start_date,
          end_date: timeline.end_date,
          visit_number: timeline.visit_number,
        });
      });
    }

    res.json({
      success: true,
      data: {
        currentSession,
        role: userRole,
        summary: summaryStats,
        postings: myPostings,
        assignments: myAssignments,
        results: myResults,
        reports: myReports,
        upcomingDates,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getGlobalStats,
  getInstitutionStats,
  getSupervisorStats,
};
