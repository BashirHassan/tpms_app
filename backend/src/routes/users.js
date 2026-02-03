/**
 * Users Routes - MedeePay Pattern
 * User management within institution (staff CRUD)
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isHeadOfTP, staffOnly } = require('../middleware/rbac');
const validate = require('../middleware/validate');

// All routes require authentication and institution access
// User management requires head_of_teaching_practice or super_admin role

// GET /api/:institutionId/users - List all users
router.get(
  '/:institutionId/users',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  authController.getAllUsers
);

// GET /api/:institutionId/users/:id - Get user by ID
router.get(
  '/:institutionId/users/:id',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  authController.getUserById
);

// POST /api/:institutionId/users - Create new user
router.post(
  '/:institutionId/users',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  validate(authController.schemas.register),
  authController.register
);

// PUT /api/:institutionId/users/:id - Update user
router.put(
  '/:institutionId/users/:id',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  validate(authController.schemas.updateUser),
  authController.updateUser
);

// DELETE /api/:institutionId/users/:id - Delete user
router.delete(
  '/:institutionId/users/:id',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  authController.deleteUser
);

// POST /api/:institutionId/users/:id/resend-credentials - Resend login credentials
router.post(
  '/:institutionId/users/:id/resend-credentials',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  authController.resendCredentials
);

// POST /api/:institutionId/users/:id/hard-reset-password - Hard reset password (super_admin only)
router.post(
  '/:institutionId/users/:id/hard-reset-password',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  authController.hardResetPassword
);

module.exports = router;
