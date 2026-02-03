/**
 * Academic Routes - MedeePay Pattern
 * Faculty, Department, Program CRUD
 */
const express = require('express');
const router = express.Router();
const academicController = require('../controllers/academicController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// Faculties
router.get('/:institutionId/academic/faculties', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.getAllFaculties);
router.get('/:institutionId/academic/faculties/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.getFacultyById);
router.post('/:institutionId/academic/faculties', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.createFaculty), academicController.createFaculty);
router.put('/:institutionId/academic/faculties/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.updateFaculty), academicController.updateFaculty);
router.delete('/:institutionId/academic/faculties/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.deleteFaculty);

// Departments
router.get('/:institutionId/academic/departments', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.getAllDepartments);
router.get('/:institutionId/academic/departments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.getDepartmentById);
router.post('/:institutionId/academic/departments', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.createDepartment), academicController.createDepartment);
router.put('/:institutionId/academic/departments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.updateDepartment), academicController.updateDepartment);
router.delete('/:institutionId/academic/departments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.deleteDepartment);

// Programs
router.get('/:institutionId/academic/programs', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.getAllPrograms);
router.get('/:institutionId/academic/programs/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.getProgramById);
router.post('/:institutionId/academic/programs', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.createProgram), academicController.createProgram);
router.put('/:institutionId/academic/programs/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.updateProgram), academicController.updateProgram);
router.delete('/:institutionId/academic/programs/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), academicController.deleteProgram);
router.post('/:institutionId/academic/programs/detect', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('academic_structure'), validate(academicController.schemas.detectProgram), academicController.detectProgram);

module.exports = router;
