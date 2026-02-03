/**
 * Ranks Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const rankController = require('../controllers/rankController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const validate = require('../middleware/validate');

router.get('/:institutionId/ranks', authenticate, requireInstitutionAccess(), staffOnly, rankController.getAll);
router.get('/:institutionId/ranks/:id', authenticate, requireInstitutionAccess(), staffOnly, rankController.getById);
router.post('/:institutionId/ranks', authenticate, requireInstitutionAccess(), staffOnly, validate(rankController.schemas.create), rankController.create);
router.put('/:institutionId/ranks/:id', authenticate, requireInstitutionAccess(), staffOnly, validate(rankController.schemas.update), rankController.update);
router.delete('/:institutionId/ranks/:id', authenticate, requireInstitutionAccess(), staffOnly, rankController.remove);

module.exports = router;
