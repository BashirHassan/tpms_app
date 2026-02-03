/**
 * Dashboard Routes - MedeePay Pattern
 * 
 * Provides role-specific dashboard endpoints:
 * 1. GET /api/global/dashboard - Super admin global stats
 * 2. GET /api/:institutionId/dashboard - Institution stats
 * 3. GET /api/:institutionId/dashboard/supervisor - Supervisor/monitor stats
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { 
  requireInstitutionAccess, 
  isSuperAdmin, 
  staffOnly 
} = require('../middleware/rbac');

// =============================================================================
// GLOBAL DASHBOARD (super_admin only)
// =============================================================================

/**
 * GET /api/global/dashboard
 * Get global platform statistics for super admin
 */
router.get(
  '/global/dashboard',
  authenticate,
  isSuperAdmin,
  dashboardController.getGlobalStats
);

// =============================================================================
// INSTITUTION DASHBOARD
// =============================================================================

/**
 * GET /api/:institutionId/dashboard
 * Get institution-specific statistics
 * For: head_of_teaching_practice, supervisor (limited view), super_admin (viewing institution)
 */
router.get(
  '/:institutionId/dashboard',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  dashboardController.getInstitutionStats
);

/**
 * GET /api/:institutionId/dashboard/supervisor
 * Get supervisor/monitor-specific statistics
 * For: supervisor, field_monitor
 */
router.get(
  '/:institutionId/dashboard/supervisor',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  dashboardController.getSupervisorStats
);

module.exports = router;
