/**
 * School Update Requests Routes - MedeePay Pattern
 * 
 * Routes for managing school principal and location update requests
 */
const express = require('express');
const router = express.Router();
const schoolUpdateRequestController = require('../controllers/schoolUpdateRequestController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');

// Common middleware stack for all routes
const middleware = [authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management')];

// ============================================================================
// PRINCIPAL UPDATE REQUESTS
// ============================================================================

// GET all principal update requests
router.get('/:institutionId/school-update-requests/principal', ...middleware, schoolUpdateRequestController.getPrincipalRequests);

// GET principal update request statistics
router.get('/:institutionId/school-update-requests/principal/statistics', ...middleware, schoolUpdateRequestController.getPrincipalStatistics);

// GET principal requests by school
router.get('/:institutionId/school-update-requests/principal/by-school/:schoolId', ...middleware, schoolUpdateRequestController.getPrincipalRequestsBySchool);

// GET principal update request by ID
router.get('/:institutionId/school-update-requests/principal/:id', ...middleware, schoolUpdateRequestController.getPrincipalRequestById);

// POST approve principal update request
router.post('/:institutionId/school-update-requests/principal/:id/approve', ...middleware, schoolUpdateRequestController.approvePrincipalRequest);

// POST reject principal update request
router.post('/:institutionId/school-update-requests/principal/:id/reject', ...middleware, schoolUpdateRequestController.rejectPrincipalRequest);

// ============================================================================
// LOCATION UPDATE REQUESTS
// ============================================================================

// GET all location update requests
router.get('/:institutionId/school-update-requests/location', ...middleware, schoolUpdateRequestController.getLocationRequests);

// GET location update request statistics
router.get('/:institutionId/school-update-requests/location/statistics', ...middleware, schoolUpdateRequestController.getLocationStatistics);

// GET location requests by school
router.get('/:institutionId/school-update-requests/location/by-school/:schoolId', ...middleware, schoolUpdateRequestController.getLocationRequestsBySchool);

// GET location update request by ID
router.get('/:institutionId/school-update-requests/location/:id', ...middleware, schoolUpdateRequestController.getLocationRequestById);

// POST approve location update request
router.post('/:institutionId/school-update-requests/location/:id/approve', ...middleware, schoolUpdateRequestController.approveLocationRequest);

// POST reject location update request
router.post('/:institutionId/school-update-requests/location/:id/reject', ...middleware, schoolUpdateRequestController.rejectLocationRequest);

// ============================================================================
// GENERIC ROUTES (combined principal + location)
// ============================================================================

// GET all update requests (both types)
router.get('/:institutionId/school-update-requests', ...middleware, schoolUpdateRequestController.getAll);

// GET requests by school (both types)
router.get('/:institutionId/school-update-requests/school/:schoolId', ...middleware, schoolUpdateRequestController.getBySchool);

// GET update request by ID (auto-detect type)
router.get('/:institutionId/school-update-requests/:id', ...middleware, schoolUpdateRequestController.getById);

// POST create update request
router.post('/:institutionId/school-update-requests', ...middleware, schoolUpdateRequestController.create);

// POST approve update request (auto-detect type)
router.post('/:institutionId/school-update-requests/:id/approve', ...middleware, schoolUpdateRequestController.approve);

// POST reject update request (auto-detect type)
router.post('/:institutionId/school-update-requests/:id/reject', ...middleware, schoolUpdateRequestController.reject);

module.exports = router;
