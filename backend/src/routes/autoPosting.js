/**
 * Auto-Posting Routes - MedeePay Pattern
 * 
 * Routes for automated supervisor posting system
 * Includes preview, execute, history, and rollback operations
 * 
 * @see docs/AUTOMATED_POSTING_SYSTEM.md for full specification
 */
const express = require('express');
const router = express.Router();
const autoPostingController = require('../controllers/autoPostingController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isSuperAdmin } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');

// ============================================================================
// Auto-Posting Operations
// All routes require authentication, institution access, and super_admin role.
// Auto-posting creates postings in bulk across the whole institution, so it is
// deliberately restricted to super admins - heads of TP and deans post manually
// through the multiposting screen.
// ============================================================================

/**
 * Preview auto-posting results without creating
 * Returns projected assignments based on criteria
 */
router.post(
  '/:institutionId/auto-posting/preview',
  authenticate,
  requireInstitutionAccess(),
  isSuperAdmin,
  requireFeature('posting_management'),
  autoPostingController.previewAutoPosting
);

/**
 * Execute auto-posting
 * Creates actual postings based on criteria
 */
router.post(
  '/:institutionId/auto-posting/execute',
  authenticate,
  requireInstitutionAccess(),
  isSuperAdmin,
  requireFeature('posting_management'),
  autoPostingController.executeAutoPosting
);

/**
 * Get auto-posting history (batches)
 * Lists all auto-posting operations for audit
 */
router.get(
  '/:institutionId/auto-posting/history',
  authenticate,
  requireInstitutionAccess(),
  isSuperAdmin,
  requireFeature('posting_management'),
  autoPostingController.getAutoPostingHistory
);

/**
 * Rollback an auto-posting batch
 * Cancels all postings created by a specific batch
 */
router.post(
  '/:institutionId/auto-posting/:batchId/rollback',
  authenticate,
  requireInstitutionAccess(),
  isSuperAdmin,
  requireFeature('posting_management'),
  autoPostingController.rollbackAutoPosting
);

module.exports = router;
