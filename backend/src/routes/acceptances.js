/**
 * Acceptances Routes - MedeePay Pattern
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const acceptanceController = require('../controllers/acceptanceController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly, isHeadOfTP } = require('../middleware/rbac');
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
router.get('/:institutionId/acceptances/filter-options', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.getFilterOptions);
// Institution-wide placement spread by state/LGA is head_of_teaching_practice+ only,
// matching the Distribution page guard - supervisors and field monitors have no
// cross-institution overview. Registered before /:id so Express does not parse
// "distribution" as an acceptance id.
router.get('/:institutionId/acceptances/distribution', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('student_management'), acceptanceController.getDistribution);
router.get('/:institutionId/acceptances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.getById);
router.post('/:institutionId/acceptances', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), validate(acceptanceController.schemas.create), acceptanceController.create);
router.put('/:institutionId/acceptances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), validate(acceptanceController.schemas.update), acceptanceController.update);
router.put('/:institutionId/acceptances/:id/review', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), validate(acceptanceController.schemas.review), acceptanceController.update);
router.delete('/:institutionId/acceptances/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.remove);
router.post('/:institutionId/acceptances/:id/upload', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), uploadRateLimiter, upload.single('file'), acceptanceController.uploadImage);
router.post('/:institutionId/acceptances/:id/upload-image', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), uploadRateLimiter, upload.single('image'), acceptanceController.uploadImage);
router.post('/:institutionId/acceptances/bulk', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('student_management'), acceptanceController.bulkCreate);

module.exports = router;
