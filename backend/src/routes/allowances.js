/**
 * Allowances Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const allowanceController = require('../controllers/allowanceController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');

router.get('/:institutionId/allowances/statistics', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getStatistics);
router.get('/:institutionId/allowances/by-supervisor', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAllowancesBySupervisor);
router.get('/:institutionId/allowances/by-visit', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAllowancesByVisit);
router.get('/:institutionId/allowances/by-supervisor-visit', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAllowancesBySupervisorAndVisit);

module.exports = router;
