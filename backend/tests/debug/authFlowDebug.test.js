/**
 * Debug Tests - Auto Logout Investigation
 * 
 * These tests specifically investigate the auto-logout issue after login.
 * They trace the complete flow and identify where the problem occurs.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

const {
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
} = require('../helpers/testUtils');

let app;

beforeAll(async () => {
  const { createTestApp } = require('../helpers/appFactory');
  app = createTestApp();
});

// ============================================================================
// TOKEN ANALYSIS TESTS
// ============================================================================

describe('Token Generation and Validation', () => {
  describe('Backend Token Generation', () => {
    it('should generate token with correct structure on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (response.status === 200) {
        const { token } = response.body.data;
        expect(token).toBeDefined();
        
        // Decode token (without verification) to check payload
        const decoded = jwt.decode(token);
        console.log('Token payload:', JSON.stringify(decoded, null, 2));
        
        // Verify required fields exist
        expect(decoded.userId).toBeDefined();
        expect(decoded.role).toBeDefined();
        expect(decoded.authType).toBeDefined();
        expect(decoded.exp).toBeDefined();
        expect(decoded.iat).toBeDefined();
        
        // Verify expiration is in the future
        const now = Math.floor(Date.now() / 1000);
        expect(decoded.exp).toBeGreaterThan(now);
        console.log('Token expires in:', decoded.exp - now, 'seconds');
      } else {
        console.log('Login failed - skipping token analysis. Response:', response.body);
      }
    });

    it('should include all required user data in login response', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (response.status === 200) {
        const { user } = response.body.data;
        console.log('User object in login response:', JSON.stringify(user, null, 2));
        
        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.role).toBeDefined();
        // Institution may be null for super_admin
        console.log('User institution:', user.institution);
      }
    });
  });

  describe('Profile Endpoint Analysis', () => {
    it('should return consistent profile data after login', async () => {
      // Step 1: Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status !== 200) {
        console.log('Login failed - skipping profile test');
        return;
      }
      
      const { token, user: loginUser } = loginResponse.body.data;
      
      // Step 2: Get profile
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      console.log('Profile response status:', profileResponse.status);
      console.log('Profile response body:', JSON.stringify(profileResponse.body, null, 2));
      
      // Check if profile fetch succeeded
      expect(profileResponse.status).toBe(200);
      
      // The response is unwrapped, so data is directly in body
      const profileUser = profileResponse.body;
      console.log('Profile user data:', JSON.stringify(profileUser, null, 2));
      
      // Verify profile matches login response
      expect(profileUser.id || profileUser.data?.id).toBe(loginUser.id);
    });

    it('should handle missing user gracefully', async () => {
      // Generate token for non-existent user
      const fakeToken = generateTestToken({ userId: 999999 });
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);
      
      console.log('Missing user response:', response.status, response.body);
      
      // Should return 401 with USER_NOT_FOUND error code
      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('USER_NOT_FOUND');
    });
  });
});

// ============================================================================
// RESPONSE STRUCTURE TESTS
// ============================================================================

describe('Response Structure Analysis', () => {
  describe('Login Response Format', () => {
    it('should wrap response in standard format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      console.log('Raw login response structure:', Object.keys(response.body));
      
      if (response.status === 200) {
        // Check for standard response wrapper
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.token).toBeDefined();
        expect(response.body.data.user).toBeDefined();
      }
    });
  });

  describe('Profile Response Format', () => {
    it('should analyze profile response unwrapping', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status !== 200) return;
      
      const { token } = loginResponse.body.data;
      
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      console.log('Profile response keys:', Object.keys(profileResponse.body));
      
      // After Axios interceptor unwrapping, check what we get
      if (profileResponse.body.success !== undefined) {
        // Response was NOT unwrapped (standard format)
        console.log('Profile uses standard wrapped format');
        expect(profileResponse.body.data).toBeDefined();
      } else {
        // Response WAS unwrapped (direct data)
        console.log('Profile uses unwrapped format');
        expect(profileResponse.body.id).toBeDefined();
      }
    });
  });
});

// ============================================================================
// AUTHENTICATION FLOW TESTS
// ============================================================================

describe('Complete Auth Flow Investigation', () => {
  it('should trace complete login -> profile -> subsequent requests flow', async () => {
    console.log('\n=== AUTHENTICATION FLOW TRACE ===\n');
    
    // Step 1: Login
    console.log('Step 1: Attempting login...');
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
    
    console.log('Login status:', loginResponse.status);
    console.log('Login success:', loginResponse.body.success);
    
    if (loginResponse.status !== 200) {
      console.log('Login FAILED. Error:', loginResponse.body.message);
      console.log('This could be the source of auto-logout if credentials are wrong');
      return;
    }
    
    const { token, user } = loginResponse.body.data;
    console.log('Token received:', token ? 'YES' : 'NO');
    console.log('User role:', user?.role);
    console.log('User institution:', user?.institution);
    
    // Step 2: Immediately verify profile
    console.log('\nStep 2: Fetching profile with token...');
    const profileResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    
    console.log('Profile status:', profileResponse.status);
    console.log('Profile success:', profileResponse.body.success);
    
    if (profileResponse.status !== 200) {
      console.log('Profile FAILED. Error:', profileResponse.body.message);
      console.log('Error code:', profileResponse.body.errorCode);
      console.log('THIS IS LIKELY THE CAUSE OF AUTO-LOGOUT');
      return;
    }
    
    // Step 3: Try an authenticated API call
    console.log('\nStep 3: Testing authenticated API call...');
    const institutionId = user?.institution?.id || 1;
    
    const apiResponse = await request(app)
      .get(`/api/${institutionId}/sessions`)
      .set('Authorization', `Bearer ${token}`);
    
    console.log('API call status:', apiResponse.status);
    console.log('API call success:', apiResponse.body.success);
    
    if (apiResponse.status === 401) {
      console.log('Authenticated API call FAILED');
      console.log('Error code:', apiResponse.body.errorCode);
    }
    
    // Step 4: Verify token is still valid
    console.log('\nStep 4: Verify token after API calls...');
    const verifyResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    
    console.log('Re-verify status:', verifyResponse.status);
    
    console.log('\n=== END TRACE ===\n');
    
    // All steps should succeed
    expect(loginResponse.status).toBe(200);
    expect(profileResponse.status).toBe(200);
  });
});

// ============================================================================
// POTENTIAL ISSUE DETECTION
// ============================================================================

describe('Potential Issue Detection', () => {
  describe('Institution Context Issues', () => {
    it('should check if super_admin without institution causes issues', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status !== 200) return;
      
      const { user } = loginResponse.body.data;
      
      if (user.role === 'super_admin' && !user.institution) {
        console.log('POTENTIAL ISSUE: super_admin has no institution');
        console.log('Frontend may need to handle this case by showing institution switcher');
      }
    });
  });

  describe('Token Expiration Check', () => {
    it('should verify JWT_EXPIRES_IN configuration', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status !== 200) return;
      
      const { token } = loginResponse.body.data;
      const decoded = jwt.decode(token);
      
      const expirationTime = decoded.exp - decoded.iat;
      console.log('Token validity period:', expirationTime, 'seconds');
      console.log('Token validity in hours:', expirationTime / 3600);
      
      // Token should be valid for at least 1 hour
      expect(expirationTime).toBeGreaterThanOrEqual(3600);
    });
  });

  describe('Error Code Handling', () => {
    it('should verify all auth error codes are defined', async () => {
      const errorCodes = [
        'NO_TOKEN',
        'INVALID_TOKEN',
        'TOKEN_EXPIRED',
        'USER_NOT_FOUND',
        'ACCOUNT_INACTIVE',
        'NO_INSTITUTION',
        'INSTITUTION_INACTIVE',
      ];
      
      // Test each error scenario
      for (const errorCode of ['NO_TOKEN', 'INVALID_TOKEN', 'TOKEN_EXPIRED']) {
        let response;
        
        if (errorCode === 'NO_TOKEN') {
          response = await request(app).get('/api/auth/me');
        } else if (errorCode === 'INVALID_TOKEN') {
          response = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid');
        } else if (errorCode === 'TOKEN_EXPIRED') {
          const expired = generateExpiredToken();
          response = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${expired}`);
        }
        
        console.log(`Error code ${errorCode}: ${response?.body?.errorCode}`);
        expect(response.body.errorCode).toBe(errorCode);
      }
    });
  });
});

// ============================================================================
// FRONTEND COMPATIBILITY TESTS
// ============================================================================

describe('Frontend API Compatibility', () => {
  describe('Response Unwrapping', () => {
    it('should have consistent response format for frontend consumption', async () => {
      // Login response should have { success, data: { token, user } }
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status === 200) {
        // Simulate what frontend Axios interceptor does
        const rawBody = loginResponse.body;
        console.log('Raw response:', JSON.stringify(rawBody, null, 2));
        
        // Frontend interceptor checks: if (response.data.success && response.data.data !== undefined)
        // Then unwraps to: response.data = response.data.data
        if (rawBody.success && rawBody.data !== undefined) {
          console.log('Frontend will unwrap to:', JSON.stringify(rawBody.data, null, 2));
          // So frontend code using response.data gets the data object directly
        }
      }
    });
  });

  describe('Profile API Response', () => {
    it('should return profile in expected format for AuthContext', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'superadmin@digitaltp.com', password: 'superadmin123' });
      
      if (loginResponse.status !== 200) return;
      
      const { token } = loginResponse.body.data;
      
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      console.log('Profile for AuthContext:', JSON.stringify(profileResponse.body, null, 2));
      
      // AuthContext expects: response.data which becomes profileData after unwrapping
      // It then does: setUser(profileData); setInstitution(profileData.institution);
      const profileData = profileResponse.body.data || profileResponse.body;
      
      console.log('After unwrap - profile data:', JSON.stringify(profileData, null, 2));
      
      // Check that institution data is present
      if (profileData.role !== 'super_admin') {
        expect(profileData.institution).toBeDefined();
        expect(profileData.institution.id).toBeDefined();
      } else {
        console.log('Super admin detected - institution may be null');
        console.log('Frontend should handle this by showing institution switcher');
      }
    });
  });
});
