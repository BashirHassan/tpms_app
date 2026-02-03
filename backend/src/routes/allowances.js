/**
 * Allowances Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const allowanceController = require('../controllers/allowanceController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

router.get('/:institutionId/allowances', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAll);
router.get('/:institutionId/allowances/statistics', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getStatistics);
router.get('/:institutionId/allowances/by-supervisor', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAllowancesBySupervisor);
router.get('/:institutionId/allowances/by-visit', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAllowancesByVisit);
router.get('/:institutionId/allowances/by-supervisor-visit', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getAllowancesBySupervisorAndVisit);
router.get('/:institutionId/allowances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.getById);
router.post('/:institutionId/allowances', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), validate(allowanceController.schemas.create), allowanceController.create);
router.put('/:institutionId/allowances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), validate(allowanceController.schemas.update), allowanceController.update);
router.delete('/:institutionId/allowances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.remove);
router.post('/:institutionId/allowances/calculate', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('allowance_management'), allowanceController.calculateAllowance);

module.exports = router;
