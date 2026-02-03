/**
 * API Routes Index - MedeePay Pattern
 * Central router for all API endpoints
 * 
 * ARCHITECTURE (MedeePay Pattern):
 * Routes are organized into clear categories:
 * 
 * 1. PUBLIC ROUTES (/api/public/*)
 *    - No authentication required
 *    - No tenant context required
 *    - Examples: institution lookup, public forms, health check
 * 
 * 2. AUTH ROUTES (/api/auth/*)
 *    - No authentication required (for login)
 *    - Authentication required (for profile, password change)
 *    - No tenant context required
 * 
 * 3. GLOBAL ROUTES (/api/global/*)
 *    - Authentication required (super_admin only)
 *    - No tenant context required
 *    - Cross-tenant operations
 *    - Examples: platform analytics, institution management
 * 
 * 4. TENANT-SCOPED ROUTES (/api/:institutionId/*)
 *    - Authentication required
 *    - Institution ID in URL path (MedeePay pattern)
 *    - All data operations scoped to institution
 *    - Examples: students, schools, postings
 * 
 * KEY DIFFERENCE FROM OLD PATTERN:
 * - OLD: Institution resolved from X-Tenant-Id header or subdomain via middleware
 * - NEW: Institution ID explicit in URL path (/api/:institutionId/students)
 */

const express = require('express');
const router = express.Router();

// =============================================================================
// ROUTE IMPORTS (New Pattern)
// =============================================================================

// Public routes (no auth)
const publicRoutes = require('./public');

// SSO routes (public - validation via token signature)
const ssoRoutes = require('./sso');

// Auth routes (mixed - some need auth, some don't)
const authRoutes = require('./auth');

// Global routes (super_admin only - admin subdomain)
const globalRoutes = require('./global');

// Institution management (global + tenant-scoped)
const institutionRoutes = require('./institutions');

// Settings routes (tenant-scoped)
const settingsRoutes = require('./settings');

// Tenant-scoped routes (all use /:institutionId prefix)
const featureToggleRoutes = require('./featureToggles');
const academicRoutes = require('./academic');
const rankRoutes = require('./ranks');
const studentRoutes = require('./students');
const routeRoutes = require('./routes');
const schoolRoutes = require('./schools');
const sessionRoutes = require('./sessions');
const paymentRoutes = require('./payments');
const acceptanceRoutes = require('./acceptances');
const portalRoutes = require('./portal');
const postingRoutes = require('./postings');
const allowanceRoutes = require('./allowances');
const letterRoutes = require('./letters');
const monitoringRoutes = require('./monitoring');
const groupRoutes = require('./groups');
const resultRoutes = require('./results');
const schoolUpdateRequestRoutes = require('./schoolUpdateRequests');
const documentTemplateRoutes = require('./documentTemplates');
const userRoutes = require('./users');
const dashboardRoutes = require('./dashboard');
const deanAllocationRoutes = require('./deanAllocations');
const locationTrackingRoutes = require('./locationTracking');

// =============================================================================
// API INFO ENDPOINT (no auth)
// =============================================================================

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DigitalTP API - Teaching Practice Management System',
    version: '3.0.0',
    pattern: 'MedeePay - Institution ID in URL path',
    architecture: {
      public: 'No auth required - /api/public/*',
      auth: 'Authentication endpoints - /api/auth/*',
      global: 'Super admin cross-tenant - /api/global/*',
      tenant: 'Tenant-scoped operations - /api/:institutionId/*',
    },
    endpoints: {
      auth: '/api/auth/*',
      public: '/api/public/*',
      global: '/api/global/* (super_admin only)',
      users: '/api/:institutionId/users',
      features: '/api/:institutionId/features',
      settings: '/api/:institutionId/settings',
      academic: '/api/:institutionId/academic/*',
      ranks: '/api/:institutionId/ranks',
      students: '/api/:institutionId/students',
      routes: '/api/:institutionId/routes',
      schools: '/api/:institutionId/schools',
      sessions: '/api/:institutionId/sessions',
      payments: '/api/:institutionId/payments',
      acceptances: '/api/:institutionId/acceptances',
      portal: '/api/portal/* (student auth)',
      postings: '/api/:institutionId/postings',
      allowances: '/api/:institutionId/allowances',
      letters: '/api/:institutionId/letters',
      monitoring: '/api/:institutionId/monitoring/*',
      groups: '/api/:institutionId/groups',
      results: '/api/:institutionId/results',
      schoolUpdateRequests: '/api/:institutionId/school-update-requests',
      documentTemplates: '/api/:institutionId/document-templates',
      locationTracking: '/api/:institutionId/location/* (supervisor geofencing)',
    },
  });
});

// =============================================================================
// 1. PUBLIC ROUTES (no authentication)
// =============================================================================

router.use('/', publicRoutes);

// =============================================================================
// 1.5. SSO ROUTES (public - validation via token signature)
// =============================================================================

router.use('/sso', ssoRoutes);

// =============================================================================
// 2. AUTH ROUTES (mixed - login doesn't need auth, profile does)
// =============================================================================

router.use('/', authRoutes);

// =============================================================================
// 3. GLOBAL ROUTES (super_admin only - admin subdomain)
// =============================================================================

router.use('/', globalRoutes);

// =============================================================================
// 4. INSTITUTION MANAGEMENT & USER ROUTES
// Includes /api/global/* (super_admin) and /api/:institutionId/users (user management)
// =============================================================================

router.use('/', institutionRoutes);

// Users management (tenant-scoped)
router.use('/', userRoutes);

// =============================================================================
// 4. TENANT-SCOPED ROUTES
// All routes use /:institutionId prefix for explicit tenant context
// Individual route files handle their own authentication and RBAC middleware
// =============================================================================

// Settings (tenant-scoped)
router.use('/', settingsRoutes);

// Feature toggles (tenant-scoped)
router.use('/', featureToggleRoutes);

// Academic structure (faculties, departments, programs)
router.use('/', academicRoutes);

// Ranks (staff ranks)
router.use('/', rankRoutes);

// Students
router.use('/', studentRoutes);

// Routes (supervision routes)
router.use('/', routeRoutes);

// Schools (practice schools)
router.use('/', schoolRoutes);

// Academic sessions
router.use('/', sessionRoutes);

// Student portal - MUST be before /:institutionId routes to avoid path collision
// (e.g., /portal/payments/status would match /:institutionId/payments with institutionId='portal')
router.use('/', portalRoutes);

// Payments
router.use('/', paymentRoutes);

// Acceptances
router.use('/', acceptanceRoutes);

// Supervisor postings
router.use('/', postingRoutes);

// Allowances
router.use('/', allowanceRoutes);

// Letters
router.use('/', letterRoutes);

// Monitoring
router.use('/', monitoringRoutes);

// Groups
router.use('/', groupRoutes);

// Results
router.use('/', resultRoutes);

// School update requests
router.use('/', schoolUpdateRequestRoutes);

// Document templates
router.use('/', documentTemplateRoutes);

// Dean posting allocations
router.use('/', deanAllocationRoutes);

// Location tracking (supervisor geofencing)
router.use('/', locationTrackingRoutes);

// Dashboard (global and institution-scoped)
router.use('/', dashboardRoutes);

// =============================================================================
// 404 HANDLER
// =============================================================================

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} does not exist`,
    hint: 'Check the API documentation at /api for available endpoints',
  });
});

module.exports = router;
