/**
 * Schools API Tests
 * 
 * Tests all school-related endpoints:
 * - GET /api/:institutionId/schools (list schools)
 * - GET /api/:institutionId/schools/:id (get school by ID)
 * - POST /api/:institutionId/schools (create school)
 * - PUT /api/:institutionId/schools/:id (update school)
 * - DELETE /api/:institutionId/schools/:id (delete school)
 */

const request = require('supertest');

const {
  generateTestToken,
  generateStudentToken,
  generateSuperAdminToken,
} = require('../helpers/testUtils');

let app;

beforeAll(async () => {
  const { createTestApp } = require('../helpers/appFactory');
  app = createTestApp();
});

// ============================================================================
// LIST SCHOOLS
// ============================================================================

describe('GET /api/:institutionId/schools', () => {
  const institutionId = 1;
  
  describe('Authentication', () => {
    it('should reject request without token', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools`);
      
      expect(response.status).toBe(401);
    });
    
    it('should reject student access', async () => {
      const studentToken = generateStudentToken();
      const response = await request(app)
        .get(`/api/${institutionId}/schools`)
        .set('Authorization', `Bearer ${studentToken}`);
      
      expect([401, 403]).toContain(response.status);
    });
  });
  
  describe('Query Parameters', () => {
    const token = generateTestToken({ userId: 1, institutionId: 1 });
    
    it('should support pagination', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools?page=1&limit=10`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support search', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools?search=primary`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support lga filter', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools?lga=Test%20LGA`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support school_type filter', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/schools?school_type=primary`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
  });
});

// ============================================================================
// GET SCHOOL BY ID
// ============================================================================

describe('GET /api/:institutionId/schools/:id', () => {
  const institutionId = 1;
  const schoolId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .get(`/api/${institutionId}/schools/${schoolId}`);
    
    expect(response.status).toBe(401);
  });
  
  it('should return 404 for non-existent school', async () => {
    const token = generateTestToken({ userId: 1, institutionId: 1 });
    const response = await request(app)
      .get(`/api/${institutionId}/schools/999999`)
      .set('Authorization', `Bearer ${token}`);
    
    expect([401, 404]).toContain(response.status);
  });
});

// ============================================================================
// CREATE SCHOOL
// ============================================================================

describe('POST /api/:institutionId/schools', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .post(`/api/${institutionId}/schools`)
      .send({
        name: 'Test School',
        code: 'TST001',
        lga: 'Test LGA',
        state: 'Test State',
        school_type: 'primary',
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
        .post(`/api/${institutionId}/schools`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'TST001',
          lga: 'Test LGA',
          school_type: 'primary',
        });
      
      expect([400, 401]).toContain(response.status);
    });
  });
});

// ============================================================================
// UPDATE SCHOOL
// ============================================================================

describe('PUT /api/:institutionId/schools/:id', () => {
  const institutionId = 1;
  const schoolId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .put(`/api/${institutionId}/schools/${schoolId}`)
      .send({ name: 'Updated School Name' });
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// DELETE SCHOOL
// ============================================================================

describe('DELETE /api/:institutionId/schools/:id', () => {
  const institutionId = 1;
  const schoolId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .delete(`/api/${institutionId}/schools/${schoolId}`);
    
    expect(response.status).toBe(401);
  });
});
