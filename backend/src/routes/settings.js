/**
 * Settings Routes - MedeePay Pattern
 * 
 * 🔒 SECURITY: Settings require head_of_teaching_practice or super_admin role
 */
const express = require('express');
const router = express.Router();
const institutionController = require('../controllers/institutionController');
const apiKeysController = require('../controllers/apiKeysController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isHeadOfTP } = require('../middleware/rbac');

// Settings routes - restricted to HeadOfTP and SuperAdmin only
router.get('/:institutionId/settings', authenticate, requireInstitutionAccess(), isHeadOfTP, institutionController.getSettings);
router.put('/:institutionId/settings', authenticate, requireInstitutionAccess(), isHeadOfTP, institutionController.updateSettings);
router.get('/:institutionId/settings/smtp', authenticate, requireInstitutionAccess(), isHeadOfTP, institutionController.getSmtpSettings);
router.put('/:institutionId/settings/smtp', authenticate, requireInstitutionAccess(), isHeadOfTP, institutionController.updateSmtpSettings);
router.post('/:institutionId/settings/smtp/test', authenticate, requireInstitutionAccess(), isHeadOfTP, institutionController.testSmtpConnection);
router.get('/:institutionId/settings/dashboard', authenticate, requireInstitutionAccess(), isHeadOfTP, institutionController.getDashboardStats);

// API Keys / SSO Integration routes
router.get('/:institutionId/settings/api-keys', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.getAPIKeys);
router.post('/:institutionId/settings/api-keys', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.createAPIKeys);
router.post('/:institutionId/settings/api-keys/regenerate', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.regenerateSecretKey);
router.patch('/:institutionId/settings/api-keys/toggle', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.toggleSSO);
router.patch('/:institutionId/settings/api-keys/origins', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.updateAllowedOrigins);
router.delete('/:institutionId/settings/api-keys', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.deleteAPIKeys);
router.get('/:institutionId/settings/api-keys/logs', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.getSSOLogs);
router.get('/:institutionId/settings/api-keys/stats', authenticate, requireInstitutionAccess(), isHeadOfTP, apiKeysController.getSSOStats);

module.exports = router;
