/**
 * Letters Routes - MedeePay Pattern
 * 
 * 🔒 SECURITY: Letter management requires head_of_teaching_practice for write operations
 */
const express = require('express');
const router = express.Router();
const letterController = require('../controllers/letterController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// Read operations - staff can view and download
router.get('/:institutionId/letters', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('letter_management'), letterController.getAll);
router.get('/:institutionId/letters/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('letter_management'), letterController.getById);
router.get('/:institutionId/letters/:id/download', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('letter_management'), letterController.downloadLetter);

// Write operations - HeadOfTP required
router.post('/:institutionId/letters', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('letter_management'), validate(letterController.schemas.create), letterController.create);
router.put('/:institutionId/letters/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('letter_management'), validate(letterController.schemas.update), letterController.update);
router.delete('/:institutionId/letters/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('letter_management'), letterController.remove);
router.post('/:institutionId/letters/:id/generate', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('letter_management'), letterController.generateLetter);

module.exports = router;
