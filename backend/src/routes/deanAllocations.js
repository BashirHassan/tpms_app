/**
 * Dean Allocation Routes - MedeePay Pattern
 * 
 * Manage posting allocations for deans within institution
 */
const express = require('express');
const router = express.Router();
const deanAllocationController = require('../controllers/deanAllocationController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, isHeadOfTP, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');

// All routes require authentication, institution access, and posting_management feature

// GET /:institutionId/dean-allocations/stats - Get allocation stats
router.get(
  '/:institutionId/dean-allocations/stats',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('posting_management'),
  deanAllocationController.getStats
);

// GET /:institutionId/dean-allocations/my-allocation - Get current user's allocation (for deans)
router.get(
  '/:institutionId/dean-allocations/my-allocation',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('posting_management'),
  deanAllocationController.getMyAllocation
);

// GET /:institutionId/dean-allocations/my-postings - Get postings created by current dean
router.get(
  '/:institutionId/dean-allocations/my-postings',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('posting_management'),
  deanAllocationController.getMyPostings
);

// DELETE /:institutionId/dean-allocations/my-postings/:postingId - Delete a posting created by dean
router.delete(
  '/:institutionId/dean-allocations/my-postings/:postingId',
  authenticate,
  requireInstitutionAccess(),
  staffOnly,
  requireFeature('posting_management'),
  deanAllocationController.deleteMyPosting
);

// GET /:institutionId/dean-allocations/available-deans - Get deans without allocation
router.get(
  '/:institutionId/dean-allocations/available-deans',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('posting_management'),
  deanAllocationController.getAvailableDeans
);

// GET /:institutionId/dean-allocations/all-deans - Get all deans
router.get(
  '/:institutionId/dean-allocations/all-deans',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('posting_management'),
  deanAllocationController.getAllDeans
);

// GET /:institutionId/dean-allocations - Get all allocations
router.get(
  '/:institutionId/dean-allocations',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('posting_management'),
  deanAllocationController.getAll
);

// POST /:institutionId/dean-allocations - Create allocation
router.post(
  '/:institutionId/dean-allocations',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('posting_management'),
  deanAllocationController.allocate
);

// PUT /:institutionId/dean-allocations/:id - Update allocation
router.put(
  '/:institutionId/dean-allocations/:id',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('posting_management'),
  deanAllocationController.update
);

// DELETE /:institutionId/dean-allocations/:id - Delete allocation
router.delete(
  '/:institutionId/dean-allocations/:id',
  authenticate,
  requireInstitutionAccess(),
  isHeadOfTP,
  requireFeature('posting_management'),
  deanAllocationController.remove
);

module.exports = router;
