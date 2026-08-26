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
const { createRateLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const locationVerifyRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 15,
  keyGenerator: (req) => `location-verify:${req.user?.id || req.ip}`,
  message: 'Too many location verification attempts. Please wait a few minutes and try again.',
});

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
  locationVerifyRateLimiter,
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

/**
 * PATCH /:institutionId/location/admin/logs/:logId/override
 * Approve or reject a pending/rejected location log
 */
router.patch(
  '/:institutionId/location/admin/logs/:logId/override',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  validate(controller.schemas.overrideLocation),
  controller.overrideLocationValidation
);

module.exports = router;
