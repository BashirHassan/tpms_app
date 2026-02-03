/**
 * Document Templates Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const documentTemplateController = require('../controllers/documentTemplateController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const validate = require('../middleware/validate');

router.get('/:institutionId/document-templates', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.getAll);
router.get('/:institutionId/document-templates/placeholders', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.getPlaceholders);
router.get('/:institutionId/document-templates/:id', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.getById);
router.get('/:institutionId/document-templates/:id/versions', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.getVersions);
router.post('/:institutionId/document-templates', authenticate, requireInstitutionAccess(), staffOnly, validate(documentTemplateController.schemas.create), documentTemplateController.create);
router.put('/:institutionId/document-templates/:id', authenticate, requireInstitutionAccess(), staffOnly, validate(documentTemplateController.schemas.update), documentTemplateController.update);
router.delete('/:institutionId/document-templates/:id', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.remove);
router.get('/:institutionId/document-templates/:id/preview', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.previewTemplate);
router.post('/:institutionId/document-templates/:id/generate', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.generateDocument);
router.post('/:institutionId/document-templates/:id/publish', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.publish);
router.post('/:institutionId/document-templates/:id/archive', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.archive);
router.post('/:institutionId/document-templates/:id/duplicate', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.duplicate);
router.post('/:institutionId/document-templates/:id/rollback', authenticate, requireInstitutionAccess(), staffOnly, documentTemplateController.rollback);

module.exports = router;
