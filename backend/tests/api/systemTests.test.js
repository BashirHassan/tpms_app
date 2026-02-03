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
    
    // Get staff token
    const staffLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'jest-test@digitaltp.test',
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
        email: 'jest-super@digitaltp.test',
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
        .send({
          email: 'jest-test@digitaltp.test',
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
        .send({
          email: 'jest-test@digitaltp.test',
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
      expect(response.body.data.email).toBe('jest-test@digitaltp.test');
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

    test('GET /api/public/institution/lookup - should lookup institution by subdomain', async () => {
      const response = await request(app)
        .get('/api/public/institution/lookup')
        .set('X-Subdomain', 'demo');

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

    test('GET /:institutionId/sessions/active - should get active session', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/sessions/active`)
        .set('Authorization', `Bearer ${staffToken}`);

      // May be 200 with data or 404 if no active session
      expect([200, 404]).toContain(response.status);
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

    test('GET /:institutionId/schools/summary - should get schools summary', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools/summary`)
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

    test('GET /:institutionId/postings/overview - should get postings overview', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/postings/overview`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect([200, 404]).toContain(response.status);
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
    test('GET /:institutionId/allowances - should get allowances list', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/allowances`)
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
    test('GET /:institutionId/settings - should get institution settings', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/settings`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
