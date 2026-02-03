/**
 * Institutions Routes - MedeePay Pattern
 * Super admin operations on institutions (global scope)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const institutionController = require('../controllers/institutionController');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin, requireInstitutionAccess, staffOnly } = require('../middleware/rbac');

// Configure multer for logo uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB max
});

// Global routes (super_admin only)
// Note: specific routes must come before :id to avoid matching as an id
router.get('/global/institutions/stats', authenticate, isSuperAdmin, institutionController.getAllStats);
router.post('/global/institutions/provision', authenticate, isSuperAdmin, institutionController.provision);
router.post('/global/institutions/upload-logo', authenticate, isSuperAdmin, upload.single('logo'), institutionController.uploadLogo);
router.get('/global/institutions', authenticate, isSuperAdmin, institutionController.getAll);
router.get('/global/institutions/:id', authenticate, isSuperAdmin, institutionController.getById);
router.post('/global/institutions', authenticate, isSuperAdmin, upload.single('logo'), institutionController.create);
router.put('/global/institutions/:id', authenticate, isSuperAdmin, upload.single('logo'), institutionController.update);
router.patch('/global/institutions/:id/status', authenticate, isSuperAdmin, institutionController.updateStatus);
router.post('/global/institutions/:id/smtp/test', authenticate, isSuperAdmin, institutionController.testSmtpGlobal);
router.delete('/global/institutions/:id', authenticate, isSuperAdmin, institutionController.remove);

// Users management - these methods don't exist in the controller, use auth controller instead
// Note: User management should be added to institutionController or use authController
// For now, commenting out these routes that reference non-existent methods

module.exports = router;
