/**
 * Complete Authentication Flow Test
 * 
 * This test simulates the exact login flow and identifies where auto-logout occurs
 */

const request = require('supertest');
const { createTestApp } = require('../helpers/appFactory');
const pool = require('../../src/db/connection');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { query } = require('../../src/db/database');

describe('Complete Authentication Flow Debug', () => {
  let app;

  beforeAll(async () => {
    app = createTestApp();
  });

  afterAll(async () => {
    // Clear the email queue interval
    const { emailQueueService } = require('../../src/services');
    if (emailQueueService.stopProcessing) {
      emailQueueService.stopProcessing();
    }
    await pool.end();
  });

  describe('Database State Verification', () => {
    test('should verify test users exist', async () => {
      const users = await query(`
        SELECT id, email, role, institution_id, password_hash IS NOT NULL as has_password
        FROM users
        LIMIT 10
      `);
      
      console.log('\n=== USERS IN DATABASE ===');
      users.forEach(u => {
        console.log(`  - ${u.email} (${u.role}) - Institution: ${u.institution_id || 'NONE'} - Has Password: ${u.has_password}`);
      });
      
      expect(users.length).toBeGreaterThan(0);
    });

    test('should verify we can hash and compare passwords correctly', async () => {
      const testPassword = 'password123';
      const hash = await bcrypt.hash(testPassword, 10);
      const isMatch = await bcrypt.compare(testPassword, hash);
      
      console.log('\n=== PASSWORD VERIFICATION ===');
      console.log(`  Test password: ${testPassword}`);
      console.log(`  Hash: ${hash.substring(0, 20)}...`);
      console.log(`  Match result: ${isMatch}`);
      
      expect(isMatch).toBe(true);
    });

    test('should get a user and check password format', async () => {
      const users = await query(`
        SELECT id, email, password_hash, role, institution_id
        FROM users
        WHERE email IN ('bashhassan2020@gmail.com', 'head@democoe.edu.ng')
        LIMIT 2
      `);
      
      console.log('\n=== USER PASSWORD HASHES ===');
      for (const user of users) {
        console.log(`  - ${user.email}:`);
        console.log(`    Hash starts with: ${user.password_hash ? user.password_hash.substring(0, 20) : 'NULL'}`);
        console.log(`    Hash length: ${user.password_hash?.length || 0}`);
        console.log(`    Looks like bcrypt: ${user.password_hash?.startsWith('$2') ? 'YES' : 'NO'}`);
      }
      
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('Login with Real Database Credentials', () => {
    test('should try login with existing users', async () => {
      // Get a user from database
      const users = await query(`
        SELECT id, email, password_hash, role, institution_id
        FROM users
        WHERE password_hash IS NOT NULL
        LIMIT 5
      `);

      if (users.length === 0) {
        console.log('No users with passwords found - creating test user');
        
        // Create a test user
        const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
        const result = await query(`
          INSERT INTO users (email, password_hash, role, full_name, institution_id, status)
          VALUES (?, ?, 'head_of_teaching_practice', 'Test User', 1, 'active')
        `, ['testuser@test.com', hashedPassword]);
        
        console.log('Created test user:', result.insertId);
      }

      // Try to understand the password format
      console.log('\n=== ATTEMPTING LOGIN WITH KNOWN PASSWORDS ===');
      
      const testPasswords = ['admin123', 'password', 'Password123!', 'password123', 'Admin@123'];
      
      for (const password of testPasswords) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: users[0]?.email || 'bashhassan2020@gmail.com',
            password: password
          });
        
        if (response.body.success) {
          console.log(`  ✓ Password "${password}" worked for ${users[0]?.email}`);
          console.log(`  Token received: ${response.body.data.token.substring(0, 30)}...`);
          break;
        }
      }
    });

    test('should create a test user and login successfully', async () => {
      // Check if test user exists
      const existingUser = await query(`
        SELECT id FROM users WHERE email = 'jest-test@digitaltp.test'
      `);

      if (existingUser.length === 0) {
        // Create test user with known password
        const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
        await query(`
          INSERT INTO users (email, password_hash, role, name, institution_id, status)
          VALUES ('jest-test@digitaltp.test', ?, 'head_of_teaching_practice', 'Jest Test User', 1, 'active')
        `, [hashedPassword]);
        console.log('Created jest test user');
      }

      // Now login with the test user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jest-test@digitaltp.test',
          password: 'TestPassword123!'
        });

      console.log('\n=== LOGIN WITH JEST TEST USER ===');
      console.log('Status:', loginResponse.status);
      console.log('Success:', loginResponse.body.success);
      
      if (loginResponse.body.success) {
        console.log('Token received:', loginResponse.body.data.token.substring(0, 30) + '...');
        console.log('User:', JSON.stringify(loginResponse.body.data.user, null, 2));
        
        // Now test the complete flow
        const token = loginResponse.body.data.token;
        const institutionId = loginResponse.body.data.user.institution?.id;
        
        // Step 2: Get profile
        const profileResponse = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);
        
        console.log('\n=== PROFILE CHECK ===');
        console.log('Status:', profileResponse.status);
        console.log('Success:', profileResponse.body.success);
        
        // Step 3: Get features (the endpoint that may cause auto-logout)
        if (institutionId) {
          const featuresResponse = await request(app)
            .get(`/api/${institutionId}/features/enabled`)
            .set('Authorization', `Bearer ${token}`);
          
          console.log('\n=== FEATURES CHECK ===');
          console.log('Status:', featuresResponse.status);
          console.log('Success:', featuresResponse.body.success);
          console.log('Features:', featuresResponse.body.data?.length || 0);
        } else {
          console.log('\n=== FEATURES CHECK SKIPPED - NO INSTITUTION ===');
        }
        
        expect(loginResponse.body.success).toBe(true);
      } else {
        console.log('Login failed:', loginResponse.body.message);
        fail('Login should have succeeded');
      }
    });
  });

  describe('Super Admin Flow (No Institution)', () => {
    test('should test super_admin login and flow', async () => {
      // Create super_admin test user
      const existingUser = await query(`
        SELECT id FROM users WHERE email = 'jest-super@digitaltp.test'
      `);

      if (existingUser.length === 0) {
        const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10);
        await query(`
          INSERT INTO users (email, password_hash, role, name, institution_id, status)
          VALUES ('jest-super@digitaltp.test', ?, 'super_admin', 'Jest Super Admin', NULL, 'active')
        `, [hashedPassword]);
        console.log('Created jest super_admin user');
      }

      // Login as super_admin
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jest-super@digitaltp.test',
          password: 'SuperAdmin123!'
        });

      console.log('\n=== SUPER ADMIN LOGIN ===');
      console.log('Status:', loginResponse.status);
      console.log('Success:', loginResponse.body.success);
      
      if (loginResponse.body.success) {
        const token = loginResponse.body.data.token;
        const user = loginResponse.body.data.user;
        
        console.log('User role:', user.role);
        console.log('User institution:', user.institution);
        
        // Super admin should have no institution
        expect(user.institution).toBeNull();
        
        // Test profile endpoint
        const profileResponse = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);
        
        console.log('\n=== SUPER ADMIN PROFILE ===');
        console.log('Status:', profileResponse.status);
        console.log('Success:', profileResponse.body.success);
        
        // Test getting switch list (super_admin should see all institutions)
        const switchListResponse = await request(app)
          .get('/api/global/institutions/switch-list')
          .set('Authorization', `Bearer ${token}`);
        
        console.log('\n=== INSTITUTION SWITCH LIST ===');
        console.log('Status:', switchListResponse.status);
        console.log('Institutions:', switchListResponse.body.data?.length || 0);
        
        if (switchListResponse.body.data?.length > 0) {
          const firstInstitution = switchListResponse.body.data[0];
          console.log('First institution:', firstInstitution.id, firstInstitution.name);
          
          // Now test features with the selected institution
          const featuresResponse = await request(app)
            .get(`/api/${firstInstitution.id}/features/enabled`)
            .set('Authorization', `Bearer ${token}`);
          
          console.log('\n=== FEATURES WITH INSTITUTION ===');
          console.log('Status:', featuresResponse.status);
          console.log('Success:', featuresResponse.body.success);
        }
        
        expect(loginResponse.body.success).toBe(true);
      } else {
        console.log('Super admin login failed:', loginResponse.body.message);
        fail('Super admin login should have succeeded');
      }
    });
  });

  describe('Token Validation and Expiry', () => {
    test('should verify token expiry is reasonable', async () => {
      const jwtSecret = process.env.JWT_SECRET || 'test-secret';
      const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
      
      console.log('\n=== JWT CONFIGURATION ===');
      console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);
      console.log('JWT_EXPIRES_IN:', expiresIn);
      
      // Create a test token
      const token = jwt.sign({ userId: 1 }, jwtSecret, { expiresIn });
      const decoded = jwt.decode(token);
      
      console.log('Token created at:', new Date(decoded.iat * 1000).toISOString());
      console.log('Token expires at:', new Date(decoded.exp * 1000).toISOString());
      
      const expiryMs = (decoded.exp - decoded.iat) * 1000;
      const expiryHours = expiryMs / (1000 * 60 * 60);
      
      console.log('Token valid for:', expiryHours.toFixed(2), 'hours');
      
      expect(expiryHours).toBeGreaterThanOrEqual(1); // At least 1 hour
    });
  });

  describe('API Error Responses', () => {
    test('should verify 401 responses have correct error codes', async () => {
      // No token
      const noTokenResponse = await request(app)
        .get('/api/auth/me');
      
      console.log('\n=== NO TOKEN RESPONSE ===');
      console.log('Status:', noTokenResponse.status);
      console.log('Error code:', noTokenResponse.body.errorCode);
      
      expect(noTokenResponse.status).toBe(401);
      expect(noTokenResponse.body.errorCode).toBeDefined();

      // Invalid token
      const invalidTokenResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      console.log('\n=== INVALID TOKEN RESPONSE ===');
      console.log('Status:', invalidTokenResponse.status);
      console.log('Error code:', invalidTokenResponse.body.errorCode);
      
      expect(invalidTokenResponse.status).toBe(401);
    });
  });
});
