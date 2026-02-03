/**
 * SSO Routes
 *
 * Public routes for SSO authentication from partner systems.
 * These routes do not require authentication - they ARE the authentication.
 */

const express = require('express');
const router = express.Router();
const { handleStudentSSO, handleStaffSSO } = require('../controllers/ssoController');

/**
 * @route   GET /sso/student
 * @desc    SSO authentication for students
 * @access  Public (validated via token signature)
 * @query   token - Signed SSO token from partner system
 */
router.get('/student', handleStudentSSO);

/**
 * @route   GET /sso/staff
 * @desc    SSO authentication for staff members
 * @access  Public (validated via token signature)
 * @query   token - Signed SSO token from partner system
 */
router.get('/staff', handleStaffSSO);

module.exports = router;
