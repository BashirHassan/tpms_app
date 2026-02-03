/**
 * Public Routes - MedeePay Pattern
 * Public endpoints (no auth required)
 */
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const validate = require('../middleware/validate');

// Institution lookup by subdomain (for tenant resolution)
router.get('/public/institution', publicController.getInstitutionBySubdomain);
router.get('/public/institution/:subdomain', publicController.getInstitutionBySubdomain);

// Institution-scoped public endpoints
router.get('/public/institutions/:institutionId/schools', publicController.getSchools);
router.get('/public/institutions/:institutionId/schools/:schoolId/principal', publicController.getSchoolPrincipal);
router.get('/public/institutions/:institutionId/schools/:schoolId/location', publicController.getSchoolLocation);
router.post('/public/institutions/:institutionId/schools/principal-update', validate(publicController.schemas.principalUpdate), publicController.submitPrincipalUpdate);
router.post('/public/institutions/:institutionId/schools/location-update', validate(publicController.schemas.locationUpdate), publicController.submitLocationUpdate);
router.get('/public/institutions/:institutionId/features', publicController.getFeatureToggles);
router.get('/public/institutions/:institutionId/session', publicController.getCurrentSessionPublic);

// Legacy school data by code (deprecated)
router.get('/public/schools/:code', publicController.getSchoolByCode);
router.post('/public/schools/:code/location-update', validate(publicController.schemas.locationUpdate), publicController.requestLocationUpdate);
router.post('/public/schools/:code/principal-update', validate(publicController.schemas.principalUpdate), publicController.requestPrincipalUpdate);

// System health check
router.get('/public/health', publicController.healthCheck);

module.exports = router;
