/**
 * Feature Toggles Routes - MedeePay Pattern
 * 
 * 🔒 SECURITY: Feature toggle management requires head_of_teaching_practice or super_admin
 */
const express = require('express');
const router = express.Router();
const featureToggleController = require('../controllers/featureToggleController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly, isHeadOfTP } = require('../middleware/rbac');
const validate = require('../middleware/validate');

// Read operations - view by staff, enabled list is semi-public (needs auth + institution)
router.get('/:institutionId/features', authenticate, requireInstitutionAccess(), staffOnly, featureToggleController.getAll);
router.get('/:institutionId/features/enabled', authenticate, requireInstitutionAccess(), featureToggleController.getEnabled);
router.get('/:institutionId/features/:id', authenticate, requireInstitutionAccess(), staffOnly, featureToggleController.getById);
router.get('/:institutionId/features/key/:key', authenticate, requireInstitutionAccess(), staffOnly, featureToggleController.getByKey);

// Write operations - HeadOfTP required (feature toggles control system behavior)
router.post('/:institutionId/features', authenticate, requireInstitutionAccess(), isHeadOfTP, validate(featureToggleController.schemas.create), featureToggleController.create);
router.put('/:institutionId/features/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, validate(featureToggleController.schemas.update), featureToggleController.update);
router.patch('/:institutionId/features/:id/toggle', authenticate, requireInstitutionAccess(), isHeadOfTP, featureToggleController.toggle);
router.delete('/:institutionId/features/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, featureToggleController.remove);
router.post('/:institutionId/features/bulk-update', authenticate, requireInstitutionAccess(), isHeadOfTP, featureToggleController.bulkUpdate);

module.exports = router;
