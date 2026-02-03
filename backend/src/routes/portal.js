/**
 * Portal Routes - MedeePay Pattern
 * Student portal access (uses studentOnly middleware)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const portalController = require('../controllers/portalController');
const acceptanceController = require('../controllers/acceptanceController');
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { studentOnly, requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// Configure multer for file uploads (memory storage for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG images are allowed.'), false);
    }
  },
});

// Student portal routes - use studentOnly middleware
// Note: For student portal, institution comes from their profile, not URL
router.get('/portal/status', authenticate, studentOnly, portalController.getPortalStatus);
router.get('/portal/profile', authenticate, studentOnly, portalController.getStudentProfile);
router.get('/portal/posting', authenticate, studentOnly, portalController.getStudentPosting);
router.get('/portal/results', authenticate, studentOnly, portalController.getStudentResults);
router.get('/portal/payments', authenticate, studentOnly, portalController.getStudentPayments);
router.get('/portal/documents/:documentType', authenticate, studentOnly, portalController.renderDocument);
router.put('/portal/profile', authenticate, studentOnly, validate(portalController.schemas.updateProfile), portalController.updateProfile);

// Student acceptance form endpoints
router.get('/portal/acceptance/status', authenticate, studentOnly, acceptanceController.getStudentStatus);
router.get('/portal/acceptance/schools', authenticate, studentOnly, acceptanceController.getAvailableSchools);
router.post('/portal/acceptance/submit', authenticate, studentOnly, upload.single('signed_form'), acceptanceController.submitAcceptance);

// Student payment endpoints
router.get('/portal/payments/status', authenticate, studentOnly, paymentController.getStudentPaymentStatus);
router.post('/portal/payments/initialize', authenticate, studentOnly, paymentController.initializeStudentPayment);
router.post('/portal/payments/verify', authenticate, studentOnly, paymentController.verifyStudentPayment);

// Institution-scoped portal endpoints (for admin access to student data)
// 🔒 SECURITY: These require authentication, institution access check, and staff role
router.get('/:institutionId/portal/students/:studentId/profile', authenticate, requireInstitutionAccess(), staffOnly, portalController.getStudentProfileById);
router.get('/:institutionId/portal/students/:studentId/posting', authenticate, requireInstitutionAccess(), staffOnly, portalController.getStudentPostingById);
router.get('/:institutionId/portal/students/:studentId/results', authenticate, requireInstitutionAccess(), staffOnly, portalController.getStudentResultsById);

// Multer error handler
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 1MB.',
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  next(error);
});

module.exports = router;
