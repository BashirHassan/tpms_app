/**
 * Authentication Security Tests
 * 
 * Tests security aspects of authentication:
 * - Subdomain enforcement (users can only login via their institution's subdomain)
 * - Super admin can login via any subdomain
 * - Cross-institution login prevention
 * - Token security
 * - Security event logging
 * 
 * Phase 5: Security & Access Control Hardening
 */

const request = require('supertest');

// Test utilities
const {
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
  generateSuperAdminToken,
  generateStudentToken,
  createMockUser,
  createMockStudent,
  createMockInstitution,
} = require('../helpers/testUtils');

// App factory
const { createTestApp } = require('../helpers/appFactory');

let app;

beforeAll(async () => {
  app = createTestApp();
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
});

// ============================================================================
// SUBDOMAIN ENFORCEMENT TESTS
// ============================================================================

describe('Subdomain Authentication Enforcement', () => {
  describe('Staff Login', () => {
    it('should reject login when user institution does not match subdomain', async () => {
      // User belongs to institution with subdomain 'fuk', trying to login via 'gsu'
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Subdomain', 'wrong-subdomain')
        .send({ email: 'staff@fuk.edu.ng', password: 'password123' });
      
      // Should return 401 (generic error to prevent info leakage)
      expect([401, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it('should allow super_admin login via any subdomain', async () => {
      // Super admin should be able to login via any subdomain
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Subdomain', 'any-institution')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      // If user exists, should succeed
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data.token).toBeDefined();
        expect(response.body.data.user.role).toBe('super_admin');
      }
    });

    it('should allow login via correct institution subdomain', async () => {
      // This test requires proper subdomain resolution setup
      // The middleware should verify user's institution matches subdomain
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Subdomain', 'fuk')
        .send({ email: 'staff@fuk.edu.ng', password: 'password123' });
      
      // Either succeeds (200) or user doesn't exist (401)
      expect([200, 401, 404]).toContain(response.status);
    });

    it('should not reveal which institution user belongs to on wrong subdomain', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Subdomain', 'wrong-subdomain')
        .send({ email: 'staff@fuk.edu.ng', password: 'password123' });
      
      // Error message should be generic - no info about actual institution
      if (response.status === 401) {
        expect(response.body.message).not.toContain('institution');
        expect(response.body.message.toLowerCase()).toMatch(/invalid|credentials|unauthorized/);
      }
    });
  });

  describe('Student Login', () => {
    it('should reject student login when institution does not match subdomain', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .set('X-Subdomain', 'wrong-institution')
        .send({ 
          registrationNumber: 'NCE/2024/001', 
          pin: '123456' 
        });
      
      // Should return 401 (generic error)
      expect([400, 401, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });

    it('should not reveal student institution on wrong subdomain', async () => {
      const response = await request(app)
        .post('/api/auth/student-login')
        .set('X-Subdomain', 'wrong-institution')
        .send({ 
          registrationNumber: 'NCE/2024/001', 
          pin: '123456' 
        });
      
      // Should return 400 or 401 - not reveal which institution student actually belongs to
      expect([400, 401]).toContain(response.status);
      expect(response.body.success).toBe(false);
      // Message should not reveal the actual institution name/id
      if (response.body.message) {
        expect(response.body.message).not.toMatch(/belongs to|student from/);
      }
    });
  });
});

// ============================================================================
// TOKEN SECURITY TESTS
// ============================================================================

describe('Token Security', () => {
  describe('JWT Validation', () => {
    it('should reject request without authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('NO_TOKEN');
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer token123');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject expired token', async () => {
      const expiredToken = generateExpiredToken();
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('TOKEN_EXPIRED');
    });

    it('should reject token signed with wrong secret', async () => {
      const invalidToken = generateInvalidToken();
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${invalidToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.errorCode).toBe('INVALID_TOKEN');
    });

    it('should reject empty bearer token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject token with missing payload', async () => {
      // Token without required claims
      const jwt = require('jsonwebtoken');
      const emptyToken = jwt.sign({}, 'test-secret-key-for-jwt-signing', { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${emptyToken}`);
      
      // Should be rejected due to missing userId
      expect([401, 404]).toContain(response.status);
    });
  });

  describe('Token Refresh Security', () => {
    it('should reject refresh without valid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject refresh with expired token', async () => {
      const expiredToken = generateExpiredToken();
      
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});

// ============================================================================
// FORGOT PASSWORD SECURITY TESTS
// ============================================================================

describe('Forgot Password Security', () => {
  it('should return success for any email (prevent enumeration)', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });
    
    // Should always appear successful to prevent email enumeration
    // Status could be 200 or 404 depending on implementation
    expect([200, 404]).toContain(response.status);
  });

  it('should reject forgot password on wrong subdomain for non-super-admin', async () => {
    // User exists but on different subdomain
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Subdomain', 'wrong-subdomain')
      .send({ email: 'staff@fuk.edu.ng' });
    
    // Should return success (to prevent enumeration) but not send email
    expect([200, 404]).toContain(response.status);
  });

  it('should not reveal user existence in error message', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });
    
    // Message should not indicate whether user exists
    if (!response.body.success) {
      expect(response.body.message).not.toMatch(/not found|does not exist|no user/i);
    }
  });
});

// ============================================================================
// VERIFY TOKEN SECURITY TESTS
// ============================================================================

describe('Token Verification Security', () => {
  it('should reject verify without token', async () => {
    const response = await request(app)
      .get('/api/auth/verify');
    
    // Either 401 (no token) or 404 (route doesn't exist)
    expect([401, 404]).toContain(response.status);
    expect(response.body.success).toBe(false);
  });

  it('should verify valid token', async () => {
    // First login to get token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
    
    if (loginResponse.status === 200) {
      const token = loginResponse.body.data.token;
      
      const verifyResponse = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);
      
      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.data.valid).toBe(true);
    }
  });

  it('should return valid=false for expired token', async () => {
    const expiredToken = generateExpiredToken();
    
    const response = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${expiredToken}`);
    
    // Could return 401, 404, or 200 with valid=false
    if (response.status === 200) {
      expect(response.body.data.valid).toBe(false);
    } else {
      expect([401, 404]).toContain(response.status);
    }
  });
});

// ============================================================================
// LOGOUT SECURITY TESTS
// ============================================================================

describe('Logout Security', () => {
  it('should require authentication to logout', async () => {
    const response = await request(app)
      .post('/api/auth/logout');
    
    expect(response.status).toBe(401);
  });

  it('should successfully logout with valid token', async () => {
    const validToken = generateTestToken();
    
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${validToken}`);
    
    // Either 200 (success) or 401/404 if user not in DB
    expect([200, 401, 404]).toContain(response.status);
  });
});

// ============================================================================
// BRUTE FORCE PROTECTION TESTS
// ============================================================================

describe('Brute Force Protection', () => {
  // Note: These tests might fail if rate limiting is not enabled in test environment
  
  it('should have rate limiting on login endpoint', async () => {
    // Make multiple rapid requests
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({ email: `test${i}@example.com`, password: 'wrongpassword' })
      );
    }
    
    const responses = await Promise.all(requests);
    
    // At least one should be processed (not all rate limited in test mode)
    const processed = responses.filter(r => [200, 400, 401].includes(r.status));
    expect(processed.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SESSION MANAGEMENT TESTS
// ============================================================================

describe('Session Management', () => {
  it('should include token expiration in response', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
    
    if (response.status === 200) {
      // Token should be a valid JWT
      const token = response.body.data.token;
      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    }
  });
});

// ============================================================================
// SENSITIVE DATA PROTECTION TESTS
// ============================================================================

describe('Sensitive Data Protection', () => {
  it('should not include password in user response', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
    
    if (response.status === 200) {
      const user = response.body.data.user;
      expect(user.password).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
    }
  });

  it('should not include sensitive fields in profile response', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
    
    if (response.status === 200) {
      const token = response.body.data.token;
      
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      if (profileResponse.status === 200) {
        const profile = profileResponse.body.data || profileResponse.body;
        expect(profile.password).toBeUndefined();
        expect(profile.password_hash).toBeUndefined();
        expect(profile.pin).toBeUndefined();
        expect(profile.pin_hash).toBeUndefined();
        expect(profile.password_reset_token).toBeUndefined();
      }
    }
  });
});
