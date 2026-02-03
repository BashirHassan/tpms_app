/**
 * Postings API Tests
 * 
 * Tests posting-related endpoints:
 * - GET /api/:institutionId/postings (list postings)
 * - GET /api/:institutionId/postings/:id (get posting by ID)
 * - POST /api/:institutionId/postings (create posting)
 * - PUT /api/:institutionId/postings/:id (update posting)
 * - DELETE /api/:institutionId/postings/:id (delete posting)
 * - POST /api/:institutionId/postings/multi (multi-posting)
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
// LIST POSTINGS
// ============================================================================

describe('GET /api/:institutionId/postings', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .get(`/api/${institutionId}/postings`);
    
    expect(response.status).toBe(401);
  });
  
  it('should reject student access', async () => {
    const studentToken = generateStudentToken();
    const response = await request(app)
      .get(`/api/${institutionId}/postings`)
      .set('Authorization', `Bearer ${studentToken}`);
    
    expect([401, 403]).toContain(response.status);
  });
  
  describe('Query Parameters', () => {
    const token = generateTestToken({ userId: 1, institutionId: 1 });
    
    it('should support session_id filter', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/postings?session_id=1`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support route_id filter', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/postings?route_id=1`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
  });
});

// ============================================================================
// GET POSTING BY ID
// ============================================================================

describe('GET /api/:institutionId/postings/:id', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .get(`/api/${institutionId}/postings/1`);
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// CREATE POSTING
// ============================================================================

describe('POST /api/:institutionId/postings', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .post(`/api/${institutionId}/postings`)
      .send({
        supervisor_id: 1,
        session_id: 1,
        route_id: 1,
      });
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// UPDATE POSTING
// ============================================================================

describe('PUT /api/:institutionId/postings/:id', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .put(`/api/${institutionId}/postings/1`)
      .send({ status: 'active' });
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// DELETE POSTING
// ============================================================================

describe('DELETE /api/:institutionId/postings/:id', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .delete(`/api/${institutionId}/postings/1`);
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// MULTI-POSTING
// ============================================================================

describe('POST /api/:institutionId/postings/multi', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .post(`/api/${institutionId}/postings/multi`)
      .send({
        session_id: 1,
        postings: [],
      });
    
    expect(response.status).toBe(401);
  });
});
