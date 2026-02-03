/**
 * Monitoring Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// Dashboard
router.get('/:institutionId/monitoring/dashboard', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getDashboard);

// My assignments
router.get('/:institutionId/monitoring/my-assignments', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getMyAssignments);

// Available monitors and unassigned schools
router.get('/:institutionId/monitoring/available-monitors', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getAvailableMonitors);
router.get('/:institutionId/monitoring/unassigned-schools', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getUnassignedSchools);

// Assignments
router.get('/:institutionId/monitoring/assignments', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getAllAssignments);
router.get('/:institutionId/monitoring/assignments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getAssignment);
router.post('/:institutionId/monitoring/assignments', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), validate(monitoringController.schemas.createAssignment), monitoringController.createAssignment);
router.post('/:institutionId/monitoring/assignments/bulk', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.createAssignments);
router.put('/:institutionId/monitoring/assignments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), validate(monitoringController.schemas.updateAssignment), monitoringController.updateAssignment);
router.delete('/:institutionId/monitoring/assignments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.removeAssignment);

// Reports
router.get('/:institutionId/monitoring/reports', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getAllReports);
router.get('/:institutionId/monitoring/reports/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.getReport);
router.post('/:institutionId/monitoring/reports', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), validate(monitoringController.schemas.createReport), monitoringController.createReport);
router.put('/:institutionId/monitoring/reports/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), validate(monitoringController.schemas.updateReport), monitoringController.updateReport);
router.delete('/:institutionId/monitoring/reports/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('monitoring'), monitoringController.removeReport);

module.exports = router;
