/**
 * Groups Routes - MedeePay Pattern
 * 
 * 🔒 SECURITY: Group management requires head_of_teaching_practice for write operations
 */
const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// Read operations - staff can view
router.get('/:institutionId/groups', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getAll);
router.get('/:institutionId/groups/summary', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getSummary);

// School-specific group endpoints - read by staff, write by HeadOfTP
router.get('/:institutionId/groups/schools/:schoolId/students', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getStudentsBySchool);
router.get('/:institutionId/groups/schools/:schoolId/groups', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getSchoolGroups);
router.post('/:institutionId/groups/assign-student', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), groupController.assignStudentGroup);

// Merge-related endpoints - read by staff, write by HeadOfTP
router.get('/:institutionId/groups/merged', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getMergedGroups);
router.get('/:institutionId/groups/available-for-merge', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getAvailableForMerge);
router.post('/:institutionId/groups/merge', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), groupController.createMerge);
router.delete('/:institutionId/groups/merge/:mergeId', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), groupController.cancelMerge);

// CRUD operations
router.get('/:institutionId/groups/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), groupController.getById);
router.post('/:institutionId/groups', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), validate(groupController.schemas.create), groupController.create);
router.put('/:institutionId/groups/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), validate(groupController.schemas.update), groupController.update);
router.delete('/:institutionId/groups/:id', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), groupController.remove);
router.post('/:institutionId/groups/:id/add-students', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), groupController.addStudents);
router.post('/:institutionId/groups/:id/remove-students', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), groupController.removeStudents);

module.exports = router;
