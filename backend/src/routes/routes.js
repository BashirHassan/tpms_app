/**
 * Routes (Supervision Routes) - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

router.get('/:institutionId/routes', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), routeController.getAll);
router.get('/:institutionId/routes/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), routeController.getById);
router.get('/:institutionId/routes/:id/statistics', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), routeController.getStatistics);
router.post('/:institutionId/routes', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), validate(routeController.schemas.create), routeController.create);
router.put('/:institutionId/routes/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), validate(routeController.schemas.update), routeController.update);
router.delete('/:institutionId/routes/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), routeController.remove);
router.post('/:institutionId/routes/:id/assign-schools', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), routeController.assignSchools);
router.post('/:institutionId/routes/:id/remove-schools', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), routeController.removeSchools);

module.exports = router;
