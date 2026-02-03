/**
 * Sessions Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const validate = require('../middleware/validate');

router.get('/:institutionId/sessions', authenticate, requireInstitutionAccess(), staffOnly, sessionController.getAll);
router.get('/:institutionId/sessions/current', authenticate, requireInstitutionAccess(), staffOnly, sessionController.getCurrentSession);
router.get('/:institutionId/sessions/:id', authenticate, requireInstitutionAccess(), staffOnly, sessionController.getById);
router.post('/:institutionId/sessions', authenticate, requireInstitutionAccess(), staffOnly, validate(sessionController.schemas.create), sessionController.create);
router.put('/:institutionId/sessions/:id', authenticate, requireInstitutionAccess(), staffOnly, validate(sessionController.schemas.update), sessionController.update);
router.delete('/:institutionId/sessions/:id', authenticate, requireInstitutionAccess(), staffOnly, sessionController.remove);
router.post('/:institutionId/sessions/:id/set-current', authenticate, requireInstitutionAccess(), staffOnly, sessionController.setCurrentSession);

// Supervision visit timelines
router.get('/:institutionId/sessions/:id/supervision-timelines', authenticate, requireInstitutionAccess(), staffOnly, sessionController.getSupervisionTimelines);
router.put('/:institutionId/sessions/:id/supervision-timelines', authenticate, requireInstitutionAccess(), staffOnly, sessionController.saveSupervisionTimelines);

module.exports = router;
