/**
 * Comprehensive System Tests
 * 
 * Tests all major endpoints and functionality starting from login
 */

const request = require('supertest');
const { createTestApp } = require('../helpers/appFactory');
const pool = require('../../src/db/connection');

describe('DigitalTP System Tests', () => {
  let app;
  let staffToken;
  let superAdminToken;
  let institutionId = 1;

  beforeAll(async () => {
    app = createTestApp();
    
    // Get staff token (institution 1 / "demo" subdomain - required since staff
    // logins are subdomain-scoped, see src/middleware/subdomainResolver.js)
    const staffLogin = await request(app)
      .post('/api/auth/login')
      .set('X-Subdomain', 'demo')
      .send({
        email: 'jest-test@sitpms.test',
        password: 'TestPassword123!'
      });
    
    if (staffLogin.body.success) {
      staffToken = staffLogin.body.data.token;
      institutionId = staffLogin.body.data.user.institution?.id || 1;
    }
    
    // Get super admin token
    const superAdminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'jest-super@sitpms.test',
        password: 'SuperAdmin123!'
      });
    
    if (superAdminLogin.body.success) {
      superAdminToken = superAdminLogin.body.data.token;
    }
  });

  afterAll(async () => {
    const { emailQueueService } = require('../../src/services');
    if (emailQueueService.stopProcessing) {
      emailQueueService.stopProcessing();
    }
    await pool.end();
  });

  // ============================================================================
  // AUTHENTICATION TESTS
  // ============================================================================
  describe('Authentication', () => {
    test('POST /api/auth/login - should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Subdomain', 'demo')
        .send({
          email: 'jest-test@sitpms.test',
          password: 'TestPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user).toBeDefined();
    });

    test('POST /api/auth/login - should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Subdomain', 'demo')
        .send({
          email: 'jest-test@sitpms.test',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('GET /api/auth/me - should get profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('jest-test@sitpms.test');
    });

    test('GET /api/auth/me - should fail without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('NO_TOKEN');
    });
  });

  // ============================================================================
  // PUBLIC ENDPOINTS TESTS
  // ============================================================================
  describe('Public Endpoints', () => {
    test('GET /api - should return API info', async () => {
      const response = await request(app).get('/api');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('DigitalTP');
    });

    test('GET /api/public/institution/:subdomain - should lookup institution by subdomain', async () => {
      const response = await request(app)
        .get('/api/public/institution/demo');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // ACADEMIC ENDPOINTS TESTS
  // ============================================================================
  describe('Academic Endpoints', () => {
    test('GET /:institutionId/academic/faculties - should get faculties', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/academic/faculties`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/academic/departments - should get departments', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/academic/departments`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/academic/programs - should get programs', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/academic/programs`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // SESSIONS TESTS
  // ============================================================================
  describe('Academic Sessions', () => {
    test('GET /:institutionId/sessions - should get sessions', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/sessions`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/sessions/current - should get current session', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/sessions/current`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // STUDENTS TESTS
  // ============================================================================
  describe('Students', () => {
    test('GET /:institutionId/students - should get students list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/students`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/students - should support pagination', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/students`)
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/students - should support search', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/students`)
        .query({ search: 'test' })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // SCHOOLS TESTS
  // ============================================================================
  describe('Schools', () => {
    test('GET /:institutionId/schools - should get schools list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/schools/with-capacity - should get schools with capacity', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools/with-capacity`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // ROUTES TESTS
  // ============================================================================
  describe('Routes', () => {
    test('GET /:institutionId/routes - should get routes list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/routes`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // RANKS TESTS
  // ============================================================================
  describe('Ranks', () => {
    test('GET /:institutionId/ranks - should get ranks list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/ranks`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // FEATURE TOGGLES TESTS
  // ============================================================================
  describe('Feature Toggles', () => {
    test('GET /:institutionId/features/enabled - should get enabled features', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/features/enabled`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('GET /:institutionId/features - should get all features (staff only)', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/features`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // POSTINGS TESTS
  // ============================================================================
  describe('Postings', () => {
    test('GET /:institutionId/postings - should get postings list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/postings`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /:institutionId/postings/statistics - should get posting statistics', async () => {
      const sessionResponse = await request(app)
        .get(`/api/${institutionId}/sessions/current`)
        .set('Authorization', `Bearer ${staffToken}`);

      const sessionId = sessionResponse.body.data?.id;
      if (!sessionId) return;

      const response = await request(app)
        .get(`/api/${institutionId}/postings/statistics`)
        .query({ session_id: sessionId })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // MONITORING TESTS
  // ============================================================================
  describe('Monitoring', () => {
    test('GET /:institutionId/monitoring/assignments - should get monitor assignments', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/monitoring/assignments`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // RESULTS TESTS
  // ============================================================================
  describe('Results', () => {
    test('GET /:institutionId/results - should get results list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/results`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // ALLOWANCES TESTS
  // ============================================================================
  describe('Allowances', () => {
    test('GET /:institutionId/allowances/by-supervisor - should get allowances grouped by supervisor', async () => {
      const sessionsResponse = await request(app)
        .get(`/api/${institutionId}/sessions`)
        .set('Authorization', `Bearer ${staffToken}`);

      const sessions = sessionsResponse.body.data || [];
      if (sessions.length === 0) return;

      const response = await request(app)
        .get(`/api/${institutionId}/allowances/by-supervisor`)
        .query({ session_id: sessions[0].id })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // GROUPS TESTS
  // ============================================================================
  describe('Groups', () => {
    test('GET /:institutionId/groups - should get groups list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/groups`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // DOCUMENT TEMPLATES TESTS
  // ============================================================================
  describe('Document Templates', () => {
    test('GET /:institutionId/document-templates - should get templates list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/document-templates`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================================================
  // SETTINGS TESTS
  // ============================================================================
  describe('Settings', () => {
    test('GET /:institutionId/settings/smtp - should get SMTP settings', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/settings/smtp`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
