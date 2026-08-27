/**
 * Biometric (WebAuthn) Routes
 *
 * Platform-authenticator enrollment and assertion for supervisor location
 * check-ins. Requires the 'supervisor_biometric_verification' feature.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/biometricController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isSupervisor, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const { createRateLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const biometricRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 20,
  keyGenerator: (req) => `biometric:${req.user?.id || req.ip}`,
  message: 'Too many biometric attempts. Please wait a few minutes and try again.',
});

/**
 * POST /:institutionId/biometric/register/options
 */
router.post(
  '/:institutionId/biometric/register/options',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_biometric_verification'),
  biometricRateLimiter,
  controller.getRegistrationOptions
);

/**
 * POST /:institutionId/biometric/register/verify
 */
router.post(
  '/:institutionId/biometric/register/verify',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_biometric_verification'),
  biometricRateLimiter,
  validate(controller.schemas.verifyRegistration),
  controller.verifyRegistration
);

/**
 * POST /:institutionId/biometric/auth/options
 */
router.post(
  '/:institutionId/biometric/auth/options',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_biometric_verification'),
  biometricRateLimiter,
  controller.getAuthenticationOptions
);

/**
 * POST /:institutionId/biometric/auth/verify
 */
router.post(
  '/:institutionId/biometric/auth/verify',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_biometric_verification'),
  biometricRateLimiter,
  validate(controller.schemas.verifyAuthentication),
  controller.verifyAuthentication
);

/**
 * GET /:institutionId/biometric/credentials
 * Self-only status check (used to gate the check-in UI), not full device
 * management - see the admin/* routes below for that.
 */
router.get(
  '/:institutionId/biometric/credentials',
  authenticate,
  requireInstitutionAccess(),
  isSupervisor,
  requireFeature('supervisor_biometric_verification'),
  controller.listCredentials
);

// =====================================================
// Admin endpoints (Head of TP and above) - device management
// =====================================================

/**
 * GET /:institutionId/biometric/admin/credentials
 * List enrolled biometric devices across all supervisors in the institution.
 */
router.get(
  '/:institutionId/biometric/admin/credentials',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('supervisor_biometric_verification'),
  validate(controller.schemas.adminListCredentials),
  controller.adminListCredentials
);

/**
 * DELETE /:institutionId/biometric/admin/credentials/:credentialId
 * Revoke any supervisor's enrolled device (lost/compromised phone, offboarding).
 */
router.delete(
  '/:institutionId/biometric/admin/credentials/:credentialId',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('supervisor_biometric_verification'),
  validate(controller.schemas.adminRevokeCredential),
  controller.adminRevokeCredential
);

/**
 * GET /:institutionId/biometric/admin/exemptions
 * List supervisors with their biometric exemption status - for supervisors
 * with no WebAuthn-capable device.
 */
router.get(
  '/:institutionId/biometric/admin/exemptions',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('supervisor_biometric_verification'),
  controller.adminListExemptions
);

/**
 * PATCH /:institutionId/biometric/admin/exemptions/:supervisorId
 * Grant or revoke a supervisor's exemption from the biometric check-in gate.
 */
router.patch(
  '/:institutionId/biometric/admin/exemptions/:supervisorId',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('supervisor_biometric_verification'),
  validate(controller.schemas.adminSetExemption),
  controller.adminSetExemption
);

module.exports = router;
