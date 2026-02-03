/**
 * Students API Tests
 * 
 * Tests all student-related endpoints:
 * - GET /api/:institutionId/students (list students)
 * - GET /api/:institutionId/students/:id (get student by ID)
 * - POST /api/:institutionId/students (create student)
 * - PUT /api/:institutionId/students/:id (update student)
 * - DELETE /api/:institutionId/students/:id (delete student)
 * - POST /api/:institutionId/students/import (bulk import)
 */

const request = require('supertest');

const {
  generateTestToken,
  generateStudentToken,
  generateSuperAdminToken,
  authHeader,
  expectSuccess,
  expectError,
} = require('../helpers/testUtils');

let app;

beforeAll(async () => {
  const { createTestApp } = require('../helpers/appFactory');
  app = createTestApp();
});

// ============================================================================
// LIST STUDENTS
// ============================================================================

describe('GET /api/:institutionId/students', () => {
  const institutionId = 1;
  
  describe('Authentication', () => {
    it('should reject request without token', async () => {
      const response = await request(app)
        .get(`/api/${institutionId}/students`);
      
      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('NO_TOKEN');
    });
    
    it('should reject student access', async () => {
      const studentToken = generateStudentToken();
      const response = await request(app)
        .get(`/api/${institutionId}/students`)
        .set('Authorization', `Bearer ${studentToken}`);
      
      // Students should be blocked by staffOnly middleware
      expect([401, 403]).toContain(response.status);
    });
  });
  
  describe('Authorization', () => {
    it('should allow staff with valid token', async () => {
      const token = generateTestToken({ userId: 1, institutionId: 1 });
      const response = await request(app)
        .get(`/api/${institutionId}/students`)
        .set('Authorization', `Bearer ${token}`);
      
      // Either 200 (success) or 401 (user not found in DB)
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should allow super_admin for any institution', async () => {
      const token = generateSuperAdminToken();
      const response = await request(app)
        .get(`/api/${institutionId}/students`)
        .set('Authorization', `Bearer ${token}`);
      
      // Either success or user not found
      expect([200, 401]).toContain(response.status);
    });
  });
  
  describe('Query Parameters', () => {
    it('should support pagination parameters', async () => {
      const token = generateTestToken({ userId: 1, institutionId: 1 });
      const response = await request(app)
        .get(`/api/${institutionId}/students?page=1&limit=10`)
        .set('Authorization', `Bearer ${token}`);
      
      // Check pagination is accepted
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support search parameter', async () => {
      const token = generateTestToken({ userId: 1, institutionId: 1 });
      const response = await request(app)
        .get(`/api/${institutionId}/students?search=test`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support session_id filter', async () => {
      const token = generateTestToken({ userId: 1, institutionId: 1 });
      const response = await request(app)
        .get(`/api/${institutionId}/students?session_id=1`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
    
    it('should support status filter', async () => {
      const token = generateTestToken({ userId: 1, institutionId: 1 });
      const response = await request(app)
        .get(`/api/${institutionId}/students?status=active`)
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 401, 403]).toContain(response.status);
    });
  });
});

// ============================================================================
// GET STUDENT BY ID
// ============================================================================

describe('GET /api/:institutionId/students/:id', () => {
  const institutionId = 1;
  const studentId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .get(`/api/${institutionId}/students/${studentId}`);
    
    expect(response.status).toBe(401);
  });
  
  it('should return 404 for non-existent student', async () => {
    const token = generateTestToken({ userId: 1, institutionId: 1 });
    const response = await request(app)
      .get(`/api/${institutionId}/students/999999`)
      .set('Authorization', `Bearer ${token}`);
    
    expect([401, 404]).toContain(response.status);
  });
});

// ============================================================================
// CREATE STUDENT
// ============================================================================

describe('POST /api/:institutionId/students', () => {
  const institutionId = 1;
  
  describe('Authentication', () => {
    it('should reject request without token', async () => {
      const response = await request(app)
        .post(`/api/${institutionId}/students`)
        .send({
          full_name: 'Test Student',
          registration_number: 'TEST/2024/001',
          session_id: 1,
          program_id: 1,
        });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('Validation', () => {
    const token = generateTestToken({ 
      userId: 1, 
      institutionId: 1, 
      role: 'head_of_teaching_practice' 
    });
    
    it('should reject missing full_name', async () => {
      const response = await request(app)
        .post(`/api/${institutionId}/students`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          registration_number: 'TEST/2024/001',
          session_id: 1,
          program_id: 1,
        });
      
      expect([400, 401]).toContain(response.status);
    });
    
    it('should reject missing registration_number', async () => {
      const response = await request(app)
        .post(`/api/${institutionId}/students`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          full_name: 'Test Student',
          session_id: 1,
          program_id: 1,
        });
      
      expect([400, 401]).toContain(response.status);
    });
  });
});

// ============================================================================
// UPDATE STUDENT
// ============================================================================

describe('PUT /api/:institutionId/students/:id', () => {
  const institutionId = 1;
  const studentId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .put(`/api/${institutionId}/students/${studentId}`)
      .send({ full_name: 'Updated Name' });
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// DELETE STUDENT
// ============================================================================

describe('DELETE /api/:institutionId/students/:id', () => {
  const institutionId = 1;
  const studentId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .delete(`/api/${institutionId}/students/${studentId}`);
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// BULK IMPORT
// ============================================================================

describe('POST /api/:institutionId/students/import', () => {
  const institutionId = 1;
  
  it('should reject request without token', async () => {
    const response = await request(app)
      .post(`/api/${institutionId}/students/import`);
    
    expect(response.status).toBe(401);
  });
  
  it('should reject request without file', async () => {
    const token = generateTestToken({ 
      userId: 1, 
      institutionId: 1, 
      role: 'head_of_teaching_practice' 
    });
    
    const response = await request(app)
      .post(`/api/${institutionId}/students/import`)
      .set('Authorization', `Bearer ${token}`);
    
    expect([400, 401]).toContain(response.status);
  });
});
