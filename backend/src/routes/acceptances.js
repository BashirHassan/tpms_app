/**
 * Acceptances Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const acceptanceController = require('../controllers/acceptanceController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');
const { uploadRateLimiter } = require('../middleware/rateLimiter');

// Use memory storage for Cloudinary upload
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.get('/:institutionId/acceptances', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.getAll);
router.get('/:institutionId/acceptances/statistics', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.getStatistics);
router.get('/:institutionId/acceptances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.getById);
router.post('/:institutionId/acceptances', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), validate(acceptanceController.schemas.create), acceptanceController.create);
router.put('/:institutionId/acceptances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), validate(acceptanceController.schemas.update), acceptanceController.update);
router.put('/:institutionId/acceptances/:id/review', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), validate(acceptanceController.schemas.review), acceptanceController.update);
router.delete('/:institutionId/acceptances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.remove);
router.post('/:institutionId/acceptances/:id/upload', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), uploadRateLimiter, upload.single('file'), acceptanceController.uploadImage);
router.post('/:institutionId/acceptances/:id/upload-image', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), uploadRateLimiter, upload.single('image'), acceptanceController.uploadImage);
router.post('/:institutionId/acceptances/bulk', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.bulkCreate);

module.exports = router;
