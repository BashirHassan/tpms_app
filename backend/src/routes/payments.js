/**
 * Payments Routes - MedeePay Pattern
 * 
 * 🔒 SECURITY: Payment management requires head_of_teaching_practice for write operations
 */
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { requireInstitutionAccess, staffOnly, isHeadOfTP } = require('../middleware/rbac');
const { requireFeature } = require('../middleware/featureToggle');
const validate = require('../middleware/validate');

// Read operations - staff can view
router.get('/:institutionId/payments', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('payment_management'), paymentController.getAll);
router.get('/:institutionId/payments/stats', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('payment_management'), paymentController.getStats);
router.get('/:institutionId/payments/:id', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('payment_management'), paymentController.getById);

// Write operations - HeadOfTP required
router.post('/:institutionId/payments', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('payment_management'), validate(paymentController.schemas.create), paymentController.create);
router.post('/:institutionId/payments/:id/process', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('payment_management'), paymentController.processPayment);
router.post('/:institutionId/payments/verify-paystack', authenticate, requireInstitutionAccess(), staffOnly, requireFeature('payment_management'), paymentController.verifyPaystack);
router.post('/:institutionId/payments/:id/cancel', authenticate, requireInstitutionAccess(), isHeadOfTP, requireFeature('payment_management'), paymentController.cancelPayment);

// Paystack webhook (no auth - verified by signature)
router.post('/payments/webhook/paystack', paymentController.handleWebhook);

module.exports = router;
