/**
 * Location Tracking Routes
 *
 * Routes for supervisor location verification (geofencing).
 * Requires 'supervisor_location_tracking' feature to be enabled.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/locationTrackingController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isSupervisor, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// =====================================================
// Supervisor endpoints (require location tracking feature)
// =====================================================

/**
 * POST /:institutionId/location/verify
 * Verify supervisor's location for a posting
 */
router.post(
  '/:institutionId/location/verify',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_location_tracking'),
  validate(controller.schemas.verifyLocation),
  controller.verifyLocation
);

/**
 * GET /:institutionId/location/my-postings
 * Get all postings with their location verification status
 */
router.get(
  '/:institutionId/location/my-postings',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_location_tracking'),
  controller.getMyPostingsLocationStatus
);

/**
 * GET /:institutionId/location/check/:postingId
 * Check location verification status for a specific posting
 */
router.get(
  '/:institutionId/location/check/:postingId',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_location_tracking'),
  controller.checkLocationVerification
);

// =====================================================
// Admin endpoints (Head of TP and above)
// =====================================================

/**
 * GET /:institutionId/location/admin/logs
 * Get all location verification logs for review
 */
router.get(
  '/:institutionId/location/admin/logs',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  controller.getLocationLogs
);

/**
 * GET /:institutionId/location/admin/stats
 * Get location verification statistics
 */
router.get(
  '/:institutionId/location/admin/stats',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  controller.getLocationStats
);

module.exports = router;
