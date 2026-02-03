/**
 * Postings Routes - MedeePay Pattern
 * 
 * Includes all methods from legacy SupervisorPosting model:
 * - CRUD operations
 * - Statistics & summaries
 * - Supervisor posting counts with location breakdown
 * - Allowance summaries
 * - School postings
 * - Multiposting support
 */
const express = require('express');
const router = express.Router();
const postingController = require('../controllers/postingController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// ============================================================================
// Statistics & Summaries
// ============================================================================
router.get('/:institutionId/postings/statistics', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getPostingStatistics);
router.get('/:institutionId/postings/allowance-summary', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSessionAllowanceSummary);
router.get('/:institutionId/postings/supervisor-counts', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getAllSupervisorPostingCounts);

// ============================================================================
// Display & Printable Views
// ============================================================================
router.get('/:institutionId/postings/printable', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getPrintablePostings);
router.get('/:institutionId/postings/display', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getPostingsForDisplay);
router.get('/:institutionId/postings/preposting-template', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getPrepostingTemplate);

// ============================================================================
// Schools & Students Related
// ============================================================================
router.get('/:institutionId/postings/schools-students', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSchoolsWithStudents);
router.get('/:institutionId/postings/schools-supervisors', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSchoolsWithSupervisors);
router.get('/:institutionId/postings/schools-with-groups', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSchoolsWithGroups);
router.get('/:institutionId/postings/available-schools', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getAvailableSchools);
router.get('/:institutionId/postings/available-supervisors', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getAvailableSupervisors);

// ============================================================================
// School-specific routes (must be before /:id to avoid conflicts)
// ============================================================================
router.get('/:institutionId/postings/school/:schoolId', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSchoolPostings);
router.get('/:institutionId/postings/school/:schoolId/groups', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSchoolGroups);

// ============================================================================
// Supervisor-specific routes (must be before /:id to avoid conflicts)
// ============================================================================
router.get('/:institutionId/postings/supervisor/:supervisorId', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSupervisorPostings);
router.get('/:institutionId/postings/supervisor/:supervisorId/count', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSupervisorPostingCountDetailed);
router.get('/:institutionId/postings/supervisor/:supervisorId/allowances', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getSupervisorPostingsWithAllowances);

// ============================================================================
// Session-specific routes
// ============================================================================
router.get('/:institutionId/postings/session/:sessionId', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getBySession);

// ============================================================================
// Current User's Postings (for supervisors)
// ============================================================================
router.get('/:institutionId/postings/my-postings', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getMyPostings);
router.get('/:institutionId/postings/my-postings-printable', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getMyPostingsPrintable);
router.get('/:institutionId/postings/my-invitation-letter', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getMyInvitationLetter);

// ============================================================================
// CRUD Operations
// ============================================================================
router.get('/:institutionId/postings', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getAll);
router.get('/:institutionId/postings/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.getById);
router.post('/:institutionId/postings', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), validate(postingController.schemas.create), postingController.create);
router.put('/:institutionId/postings/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), validate(postingController.schemas.update), postingController.update);
router.delete('/:institutionId/postings/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.remove);

// ============================================================================
// Bulk & Automated Operations
// ============================================================================
router.post('/:institutionId/postings/validate', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.validatePosting);
router.post('/:institutionId/postings/multi', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.createMultiPostings);
router.post('/:institutionId/postings/bulk', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.bulkCreate);
router.post('/:institutionId/postings/auto-post', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.autoPost);
router.post('/:institutionId/postings/clear', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('posting_management'), postingController.clearPostings);

module.exports = router;
