/**
 * Results Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const resultController = require('../controllers/resultController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');
const { uploadRateLimiter } = require('../middleware/rateLimiter');

// Multer config
const uploadDir = path.join(__dirname, '../../uploads/results');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `results-${Date.now()}${path.extname(file.originalname)}`),
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/:institutionId/results', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getAll);
router.get('/:institutionId/results/template', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.downloadTemplate);
router.get('/:institutionId/results/export', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.exportResults);
router.get('/:institutionId/results/export/excel', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.exportExcel);
router.get('/:institutionId/results/export/pdf', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.exportPDF);
router.get('/:institutionId/results/stats', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getStats);
router.get('/:institutionId/results/admin-students', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getAdminStudentsWithResults);
router.get('/:institutionId/results/scoring-criteria', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getScoringCriteria);
router.get('/:institutionId/results/assigned-groups', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getAssignedGroups);
router.get('/:institutionId/results/students-for-scoring', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getStudentsForScoring);
router.post('/:institutionId/results/scoring-criteria', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.createCriteria);
router.post('/:institutionId/results/scoring-criteria/initialize', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.initializeDefaultCriteria);
router.put('/:institutionId/results/scoring-criteria/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.updateCriteria);
router.delete('/:institutionId/results/scoring-criteria/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.deleteCriteria);
router.post('/:institutionId/results/admin-bulk-submit', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.adminBulkSubmitResults);
router.post('/:institutionId/results/bulk-submit', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.submitBulkResults);
router.get('/:institutionId/results/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.getById);
router.post('/:institutionId/results', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), validate(resultController.schemas.create), resultController.create);
router.put('/:institutionId/results/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), validate(resultController.schemas.update), resultController.update);
router.delete('/:institutionId/results/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), resultController.remove);
router.post('/:institutionId/results/upload', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_results'), uploadRateLimiter, upload.single('file'), resultController.uploadResults);

module.exports = router;
