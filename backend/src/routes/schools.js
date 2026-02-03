/**
 * School Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const schoolController = require('../controllers/schoolController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');
const { uploadRateLimiter } = require('../middleware/rateLimiter');

// Multer config
const uploadDir = path.join(__dirname, '../../uploads/schools');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `schools-${Date.now()}${path.extname(file.originalname)}`),
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/:institutionId/schools/template', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.downloadTemplate);
router.get('/:institutionId/schools/export', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.exportSchools);
router.get('/:institutionId/schools/with-capacity', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.getSchoolsWithCapacity);

// NEW: Master schools search for linking existing schools
router.get('/:institutionId/schools/search-master', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.searchMasterSchools);

// NEW: Link existing master school to institution
router.post('/:institutionId/schools/link', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), validate(schoolController.schemas.linkSchool), schoolController.linkSchool);

// CRUD
router.get('/:institutionId/schools', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.getAll);
router.get('/:institutionId/schools/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.getById);
router.get('/:institutionId/schools/:id/capacity', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.getCapacity);
router.post('/:institutionId/schools', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), validate(schoolController.schemas.create), schoolController.create);
router.put('/:institutionId/schools/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), validate(schoolController.schemas.update), schoolController.update);
router.patch('/:institutionId/schools/:id/status', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.updateStatus);
router.delete('/:institutionId/schools/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), schoolController.remove);
router.post('/:institutionId/schools/upload', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('school_management'), uploadRateLimiter, upload.single('file'), schoolController.uploadFromExcel);

module.exports = router;
