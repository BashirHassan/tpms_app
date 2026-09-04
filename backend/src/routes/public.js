/**
 * Public Routes - MedeePay Pattern
 * Public endpoints (no auth required)
 */
const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const { resolveInstitutionIdParam } = require('../middleware/rbac');

// Institution lookup by subdomain (for tenant resolution)
router.get('/public/institution', publicController.getInstitutionBySubdomain);
router.get('/public/institution/:subdomain', publicController.getInstitutionBySubdomain);

// Resolve public_id → integer for all /public/institutions/:institutionId/* routes
router.param('institutionId', resolveInstitutionIdParam);

// Institution-scoped public endpoints
router.get('/public/institutions/:institutionId/schools', publicController.getSchools);
router.get('/public/institutions/:institutionId/features', publicController.getFeatureToggles);
router.get('/public/institutions/:institutionId/session', publicController.getCurrentSessionPublic);

// System health check
router.get('/public/health', publicController.healthCheck);

module.exports = router;
