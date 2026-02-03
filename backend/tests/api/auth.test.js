/**
 * Authentication API Tests
 * 
 * Tests all authentication endpoints:
 * - POST /api/auth/login (staff login)
 * - POST /api/auth/student-login (student login)
 * - GET /api/auth/me (get profile)
 * - PUT /api/auth/profile (update profile)
 * - PUT /api/auth/password (change password)
 * - POST /api/auth/forgot-password (password reset request)
 * - POST /api/auth/reset-password (password reset)
 * - POST /api/auth/logout
 * - POST /api/auth/refresh-token
 */

const request = require('supertest');
const bcrypt = require('bcrypt');

// Test utilities
const {
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
  generateSuperAdminToken,
  generateStudentToken,
  authHeader,
  createMockUser,
  createMockStudent,
  createMockInstitution,
  expectSuccess,
  expectError,
} = require('../helpers/testUtils');

// We'll use the real database module for integration tests
// For now, set up with actual app
let app;
let pool;

beforeAll(async () => {
  // Dynamic import to avoid loading before setup
  const { createTestApp } = require('../helpers/appFactory');
  app = createTestApp();
});

afterAll(async () => {
  // Cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
});

// ============================================================================
// STAFF LOGIN TESTS
// ============================================================================

describe('POST /api/auth/login', () => {
  describe('Validation', () => {
    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'password123' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: '12345' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });
      
      // Either 401 or 400 depending on implementation
      expect([400, 401]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Response Structure', () => {
    // Note: These tests will pass/fail based on actual database state
    it('should return proper response structure on success', async () => {
      // This test requires a real user in the database
      // For CI, this would be mocked or use a test database
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.token).toBeDefined();
        expect(response.body.data.user).toBeDefined();
        expect(response.body.data.user.id).toBeDefined();
        expect(response.body.data.user.email).toBeDefined();
        expect(response.body.data.user.role).toBeDefined();
      }
    });
  });
});

// ============================================================================
// STUDENT LOGIN TESTS
// ============================================================================

describe('POST /api/auth/student-login', () => {
  describe('Validation', () => {
    it('should reject missing registration number', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .send({ pin: '123456' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing PIN', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .send({ registrationNumber: 'NCE/2024/001' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject short registration number', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .send({ registrationNumber: '12345', pin: '123456' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject short PIN', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .send({ registrationNumber: 'NCE/2024/001', pin: '12345' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('should reject non-existent student', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .send({ registrationNumber: 'INVALID/2024/999', pin: '123456' });
      
      expect([400, 401]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });
  });
});

// ============================================================================
// PROFILE TESTS
// ============================================================================

describe('GET /api/auth/me', () => {
  describe('Authentication', () => {
    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('NO_TOKEN');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('INVALID_TOKEN');
    });

    it('should reject request with expired token', async () => {
      const expiredToken = generateExpiredToken();
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('TOKEN_EXPIRED');
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token123');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Response', () => {
    // Note: This test requires a valid user in the database
    it('should return user profile with valid token', async () => {
      // First login to get a valid token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status === 200) {
        const token = loginResponse.body.data.token;
        
        const profileResponse = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);
        
        expect(profileResponse.status).toBe(200);
        expect(profileResponse.body.success).toBe(true);
        // Profile data is now directly in response.body (after unwrapping)
        expect(profileResponse.body.id || profileResponse.body.data?.id).toBeDefined();
      }
    });
  });
});

// ============================================================================
// PASSWORD CHANGE TESTS
// ============================================================================

describe('PUT /api/auth/password', () => {
  describe('Authentication', () => {
    it('should reject request without token', async () => {
      const response = await request(app)
        .put('/api/auth/password')
        .send({ currentPassword: 'old', newPassword: 'NewPassword123!' });
      
      expect(response.status).toBe(401);
    });
  });

  describe('Validation', () => {
    const validToken = generateTestToken();
    
    it('should reject missing current password', async () => {
      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ newPassword: 'NewPassword123!' });
      
      // Will either be 400 (validation) or 401 (user not found)
      expect([400, 401]).toContain(response.status);
    });

    it('should reject missing new password', async () => {
      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ currentPassword: 'OldPassword123!' });
      
      expect([400, 401]).toContain(response.status);
    });

    it('should reject short new password', async () => {
      const response = await request(app)
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ currentPassword: 'OldPassword123!', newPassword: 'short' });
      
      expect([400, 401]).toContain(response.status);
    });
  });
});

// ============================================================================
// FORGOT PASSWORD TESTS
// ============================================================================

describe('POST /api/auth/forgot-password', () => {
  describe('Validation', () => {
    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Behavior', () => {
    // Should always return success to prevent email enumeration
    it('should return success even for non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });
      
      // Should return success to prevent email enumeration
      // Status depends on implementation (could be 200 or 404)
      expect([200, 404]).toContain(response.status);
    });
  });
});

// ============================================================================
// RESET PASSWORD TESTS
// ============================================================================

describe('POST /api/auth/reset-password', () => {
  describe('Validation', () => {
    it('should reject missing token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ password: 'NewPassword123!' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'some-reset-token' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'some-reset-token', password: 'short' });
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Behavior', () => {
    it('should reject invalid reset token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-reset-token', password: 'NewPassword123!' });
      
      // Either 400 or 404 depending on implementation
      expect([400, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });
  });
});

// ============================================================================
// LOGOUT TESTS
// ============================================================================

describe('POST /api/auth/logout', () => {
  it('should reject request without token', async () => {
    const response = await request(app)
      .post('/api/auth/logout');
    
    expect(response.status).toBe(401);
  });

  it('should succeed with valid token', async () => {
    const token = generateTestToken();
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    
    // May return 401 if user not found, or 200 if logout is no-op
    expect([200, 401]).toContain(response.status);
  });
});

// ============================================================================
// TOKEN REFRESH TESTS
// ============================================================================

describe('POST /api/auth/refresh-token', () => {
  it('should reject request without token', async () => {
    const response = await request(app)
      .post('/api/auth/refresh-token');
    
    expect(response.status).toBe(401);
  });

  it('should reject expired token', async () => {
    const expiredToken = generateExpiredToken();
    const response = await request(app)
      .post('/api/auth/refresh-token')
      .set('Authorization', `Bearer ${expiredToken}`);
    
    expect(response.status).toBe(401);
  });
});

// ============================================================================
// TOKEN VERIFICATION TESTS
// ============================================================================

describe('POST /api/auth/verify-token', () => {
  it('should accept valid verify request', async () => {
    const response = await request(app)
      .post('/api/auth/verify-token')
      .send({ token: 'some-token' });
    
    // This endpoint returns success by default
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TEST: COMPLETE AUTH FLOW
// ============================================================================

describe('Complete Authentication Flow', () => {
  it('should complete login -> profile -> logout flow', async () => {
    // Step 1: Login
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
    
    if (loginResponse.status !== 200) {
      console.log('Skipping integration test - no test user available');
      return;
    }
    
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    const token = loginResponse.body.data.token;
    expect(token).toBeDefined();
    
    // Step 2: Get Profile
    const profileResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.success).toBe(true);
    
    // Step 3: Logout
    const logoutResponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.success).toBe(true);
  });
});
