/**
 * Student Routes - MedeePay Pattern
 * 
 * Institution ID is in the URL: /:institutionId/students
 * Uses requireInstitutionAccess middleware for access + permission checking
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const studentController = require('../controllers/studentController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');
const { uploadRateLimiter } = require('../middleware/rateLimiter');

// Configure multer for Excel file uploads
const uploadDir = path.join(__dirname, '../../uploads/students');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `students-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ];
  cb(null, allowedTypes.includes(file.mimetype));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// =============================================================================
// All routes use /:institutionId prefix
// Middleware: authenticate -> requireInstitutionAccess -> feature check
// =============================================================================

// Download template (no specific permission needed, just authenticated)
router.get(
  '/:institutionId/students/template',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  studentController.downloadTemplate
);

// Export students (HeadOfTP only)
router.get(
  '/:institutionId/students/export',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  studentController.exportStudents
);

// Get all students
router.get(
  '/:institutionId/students',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  studentController.getAll
);

// Get student by ID
router.get(
  '/:institutionId/students/:id',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  studentController.getById
);

// Create student (HeadOfTP only)
router.post(
  '/:institutionId/students',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  validate(studentController.schemas.create),
  studentController.create
);

// Update student (HeadOfTP only)
router.put(
  '/:institutionId/students/:id',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  validate(studentController.schemas.update),
  studentController.update
);

// Delete student (HeadOfTP only)
router.delete(
  '/:institutionId/students/:id',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  studentController.remove
);

// Reset student PIN (HeadOfTP only)
router.post(
  '/:institutionId/students/:id/reset-pin',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  studentController.resetPin
);

// Bulk detect programs
router.post(
  '/:institutionId/students/bulk-detect',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  validate(studentController.schemas.bulkDetect),
  studentController.bulkDetectPrograms
);

// Upload students from Excel (HeadOfTP only)
router.post(
  '/:institutionId/students/upload',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('student_management'),
  uploadRateLimiter,
  upload.single('file'),
  studentController.uploadFromExcel
);

module.exports = router;
