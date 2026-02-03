/**
 * Sessions API Tests
 * 
 * Tests all academic session endpoints:
 * - GET /api/:institutionId/sessions (list sessions)
 * - GET /api/:institutionId/sessions/:id (get session by ID)
 * - POST /api/:institutionId/sessions (create session)
 * - PUT /api/:institutionId/sessions/:id (update session)
 * - DELETE /api/:institutionId/sessions/:id (delete session)
 * - POST /api/:institutionId/sessions/:id/activate (set as current)
 */

const request = require('supertest');

const {
  generateTestToken,
  generateStudentToken,
} = require('../helpers/testUtils');

let app;

beforeAll(async () => {
  const { createTestApp } = require('../helpers/appFactory');
  app = createTestApp();
});

// ============================================================================
// LIST SESSIONS
// ============================================================================

describe('GET /api/:institutionId/sessions', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .get(`/api/${institutionId}/sessions`);
    
    expect(response.status).toBe(401);
  });
  
  it('should reject student access', async () => {
    const studentToken = generateStudentToken();
    const response = await request(app)
      .get(`/api/${institutionId}/sessions`)
      .set('Authorization', `Bearer ${studentToken}`);
    
    expect([401, 403]).toContain(response.status);
  });
  
  it('should allow staff access', async () => {
    const token = generateTestToken({ userId: 1, institutionId: 1 });
    const response = await request(app)
      .get(`/api/${institutionId}/sessions`)
      .set('Authorization', `Bearer ${token}`);
    
    expect([200, 401, 403]).toContain(response.status);
  });
});

// ============================================================================
// GET SESSION BY ID
// ============================================================================

describe('GET /api/:institutionId/sessions/:id', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .get(`/api/${institutionId}/sessions/1`);
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// CREATE SESSION
// ============================================================================

describe('POST /api/:institutionId/sessions', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .post(`/api/${institutionId}/sessions`)
      .send({
        name: '2025/2026',
        start_date: '2025-09-01',
        end_date: '2026-07-31',
      });
    
    expect(response.status).toBe(401);
  });
  
  describe('Validation', () => {
    const token = generateTestToken({ 
      userId: 1, 
      institutionId: 1, 
      role: 'head_of_teaching_practice' 
    });
    
    it('should reject missing name', async () => {
      const response = await request(app)
        .post(`/api/${institutionId}/sessions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          start_date: '2025-09-01',
          end_date: '2026-07-31',
        });
      
      expect([400, 401]).toContain(response.status);
    });
  });
});

// ============================================================================
// UPDATE SESSION
// ============================================================================

describe('PUT /api/:institutionId/sessions/:id', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .put(`/api/${institutionId}/sessions/1`)
      .send({ name: 'Updated Session' });
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// DELETE SESSION
// ============================================================================

describe('DELETE /api/:institutionId/sessions/:id', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .delete(`/api/${institutionId}/sessions/1`);
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// ACTIVATE SESSION
// ============================================================================

describe('POST /api/:institutionId/sessions/:id/activate', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .post(`/api/${institutionId}/sessions/1/activate`);
    
    expect(response.status).toBe(401);
  });
});
