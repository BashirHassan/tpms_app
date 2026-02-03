/**
 * Login Flow Trace Test
 * Traces exact login flow to find auto-logout cause
 */

const request = require('supertest');

describe('Login Flow Trace', () => {
  let app;

  beforeAll(() => {
    app = require('../helpers/appFactory').createTestApp();
  });

  describe('Login Response Structure Analysis', () => {
    it('should verify login response has correct structure for frontend', async () => {
      // Test with a known user - skip if no test user
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123'
        });

      console.log('Raw login response status:', response.status);
      console.log('Raw login response body keys:', Object.keys(response.body));
      console.log('Full login response:', JSON.stringify(response.body, null, 2));

      // Check the structure expected by frontend AuthContext:
      // response.data after interceptor unwrapping should be { token, user: { id, name, email, role, institution: { id, name } } }
      
      if (response.body.success && response.body.data) {
        console.log('Response data keys:', Object.keys(response.body.data));
        console.log('User object keys:', response.body.data.user ? Object.keys(response.body.data.user) : 'no user');
        console.log('Institution:', response.body.data.user?.institution);
        
        // This is what getCurrentInstitutionId() needs:
        const institutionId = response.body.data.user?.institution?.id;
        console.log('Institution ID for API calls:', institutionId);
        
        if (!institutionId) {
          console.log('⚠️ WARNING: No institution ID in login response - this could cause auto-logout!');
        }
      }
    });

    it('should verify profile endpoint returns institution context', async () => {
      // First login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123'
        });

      if (!loginResponse.body.success) {
        console.log('Login failed - skipping profile test');
        return;
      }

      const token = loginResponse.body.data.token;
      
      // Then get profile
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      console.log('Profile response status:', profileResponse.status);
      console.log('Profile response body:', JSON.stringify(profileResponse.body, null, 2));
      
      if (profileResponse.body.success && profileResponse.body.data) {
        const institutionId = profileResponse.body.data.institution?.id;
        console.log('Institution ID from profile:', institutionId);
        
        if (!institutionId) {
          console.log('⚠️ WARNING: No institution ID in profile - this could cause auto-logout!');
        }
      }
    });
  });

  describe('Feature Toggle API Call After Login', () => {
    it('should test what happens when features API is called without institution context', async () => {
      // This simulates what happens when getCurrentInstitutionId() returns null
      const response = await request(app)
        .get('/api/features/enabled')  // No institution ID in path
        .set('Authorization', `Bearer test-token`);

      console.log('Features without institution - Status:', response.status);
      console.log('Features without institution - Body:', JSON.stringify(response.body, null, 2));
    });

    it('should test features API with proper institution context', async () => {
      // First login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123'
        });

      if (!loginResponse.body.success) {
        console.log('Login failed - skipping features test');
        return;
      }

      const token = loginResponse.body.data.token;
      const institutionId = loginResponse.body.data.user?.institution?.id;

      if (!institutionId) {
        console.log('No institution ID in login response - cannot test features');
        return;
      }

      // Now test features API with institution ID
      const featuresResponse = await request(app)
        .get(`/api/${institutionId}/features/enabled`)
        .set('Authorization', `Bearer ${token}`);

      console.log('Features with institution - Status:', featuresResponse.status);
      console.log('Features with institution - Body:', JSON.stringify(featuresResponse.body, null, 2));
    });
  });

  describe('Database User Check', () => {
    it('should check if test users exist in database', async () => {
      const pool = require('../../src/db/connection');
      
      try {
        const [users] = await pool.query(
          `SELECT u.id, u.email, u.name, u.role, u.status, u.institution_id, i.name as institution_name
           FROM users u
           LEFT JOIN institutions i ON u.institution_id = i.id
           WHERE u.role IN ('super_admin', 'head_of_teaching_practice')
           LIMIT 5`
        );

        console.log('Users found in database:', users.length);
        users.forEach(user => {
          console.log(`  - ${user.email} (${user.role}) - Institution: ${user.institution_name || 'NONE'}`);
        });

        if (users.length === 0) {
          console.log('⚠️ No test users in database!');
        }
      } catch (error) {
        console.log('Database error:', error.message);
      }
    });

    it('should check institutions table', async () => {
      const pool = require('../../src/db/connection');
      
      try {
        const [institutions] = await pool.query(
          'SELECT id, name, status FROM institutions LIMIT 5'
        );

        console.log('Institutions in database:', institutions.length);
        institutions.forEach(inst => {
          console.log(`  - ID: ${inst.id}, Name: ${inst.name}, Status: ${inst.status}`);
        });
      } catch (error) {
        console.log('Database error:', error.message);
      }
    });
  });
});
