/**
 * Auth Routes - MedeePay Pattern
 * Authentication endpoints (mixed auth requirements)
 * 
 * 🔒 MULTI-ACCOUNT: Includes session management endpoints for tab isolation
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireValidSession } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimiter');

// Public endpoints (no auth required)
router.post('/auth/login', authRateLimiter, validate(authController.schemas.login), authController.login);
router.post('/auth/student-login', authRateLimiter, validate(authController.schemas.studentLogin), authController.studentLogin);
router.post('/auth/forgot-password', authRateLimiter, validate(authController.schemas.forgotPassword), authController.forgotPassword);
router.post('/auth/reset-password', authRateLimiter, validate(authController.schemas.resetPassword), authController.resetPassword);
router.post('/auth/verify-token', authController.verifyToken);

// SSO endpoints for cross-subdomain navigation
router.post('/auth/sso/generate', authenticate, authController.generateSsoToken);
router.post('/auth/sso/exchange', authController.exchangeSsoToken); // No auth - token is the auth

// Protected endpoints (auth required)
router.get('/auth/me', authenticate, authController.getProfile);
router.put('/auth/profile', authenticate, validate(authController.schemas.updateProfile), authController.updateProfile);
router.put('/auth/password', authenticate, requireValidSession, validate(authController.schemas.changePassword), authController.changePassword);
router.post('/auth/logout', authenticate, authController.logout);
router.post('/auth/refresh-token', authenticate, authController.refreshToken);

// 🔒 MULTI-ACCOUNT: Session management endpoints
router.get('/auth/sessions', authenticate, authController.getActiveSessions);
router.delete('/auth/sessions/:sessionId', authenticate, authController.revokeSession);
router.post('/auth/sessions/revoke-all', authenticate, authController.revokeAllOtherSessions);

module.exports = router;
