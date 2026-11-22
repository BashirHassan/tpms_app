/**
 * School Capture Routes - MedeePay Pattern
 *
 * Supervisor school data capture: the Head of TP bulk-assigns supervisors to
 * schools missing a verified location / principal details; supervisors record
 * them and the submissions go to School Update Requests as pending.
 *
 * Every route sits behind the `school_data_capture` feature toggle, which is
 * off by default and opted into per institution.
 */
const express = require('express');
const router = express.Router();
const controller = require('../controllers/schoolCaptureController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isHeadOfTP, isSupervisor } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

const FEATURE = 'school_data_capture';
const base = '/:institutionId/school-capture';

// Common stacks
const admin = [authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature(FEATURE)];
const supervisor = [authenticate, requireInstitutionAccess(), isSupervisor, requireFeature(FEATURE)];

// ============================================================================
// Head of TP - assign, review, export, roll back
// ============================================================================

router.get(`${base}/options`, ...admin, controller.getOptions);
router.get(`${base}/eligible-schools`, ...admin, controller.getEligibleSchoolList);
router.post(`${base}/preview`, ...admin, validate(controller.schemas.preview), controller.previewPlan);
router.post(`${base}/execute`, ...admin, validate(controller.schemas.execute), controller.executePlan);

router.post(`${base}/assignments/bulk`, ...admin, validate(controller.schemas.manualBulk), controller.manualBulkAssign);
router.get(`${base}/assignments`, ...admin, controller.getAssignments);
router.get(`${base}/assignments/:id/timeline`, ...admin, controller.getAssignmentTimeline);
router.get(`${base}/activity`, ...admin, controller.getActivityLog);
router.patch(`${base}/assignments/:id`, ...admin, validate(controller.schemas.reassign), controller.reassignAssignment);
router.delete(`${base}/assignments/:id`, ...admin, controller.cancelAssignment);

router.get(`${base}/batches`, ...admin, controller.getBatches);
router.post(`${base}/batches/:batchId/rollback`, ...admin, controller.rollbackBatch);

// ============================================================================
// Supervisor - my allocated schools
// ============================================================================

router.get(`${base}/my-schools`, ...supervisor, controller.getMySchools);
router.post(
  `${base}/my-schools/:assignmentId/location`,
  ...supervisor,
  validate(controller.schemas.submitLocation),
  controller.submitLocation
);
router.post(
  `${base}/my-schools/:assignmentId/principal`,
  ...supervisor,
  validate(controller.schemas.submitPrincipal),
  controller.submitPrincipal
);

module.exports = router;
