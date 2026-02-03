/**
 * Token Verification Debug Test
 * 
 * This test specifically debugs why the profile endpoint returns 401
 * after a successful login
 */

const request = require('supertest');
const { createTestApp } = require('../helpers/appFactory');
const pool = require('../../src/db/connection');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const { User } = require('../../src/models');

describe('Token Verification Debug', () => {
  let app;

  beforeAll(async () => {
    app = createTestApp();
  });

  afterAll(async () => {
    const { emailQueueService } = require('../../src/services');
    if (emailQueueService.stopProcessing) {
      emailQueueService.stopProcessing();
    }
    await pool.end();
  });

  test('should trace token through the entire auth flow', async () => {
    // Step 1: Login
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'jest-test@digitaltp.test',
        password: 'TestPassword123!'
      });

    console.log('\n=== STEP 1: LOGIN ===');
    console.log('Status:', loginResponse.status);
    console.log('Success:', loginResponse.body.success);

    if (!loginResponse.body.success) {
      console.log('Login failed:', loginResponse.body.message);
      return;
    }

    const token = loginResponse.body.data.token;
    console.log('Token:', token.substring(0, 50) + '...');
    
    // Step 2: Decode the token manually to verify its contents
    console.log('\n=== STEP 2: DECODE TOKEN ===');
    const decoded = jwt.decode(token);
    console.log('Decoded token:', JSON.stringify(decoded, null, 2));
    
    // Step 3: Verify the token with the config secret
    console.log('\n=== STEP 3: VERIFY TOKEN WITH CONFIG ===');
    console.log('JWT Secret from config:', config.jwt.secret ? '[SET]' : '[NOT SET]');
    console.log('JWT Secret length:', config.jwt.secret?.length || 0);
    
    try {
      const verified = jwt.verify(token, config.jwt.secret);
      console.log('Token verification: SUCCESS');
      console.log('Verified payload:', JSON.stringify(verified, null, 2));
    } catch (error) {
      console.log('Token verification: FAILED');
      console.log('Error:', error.message);
    }
    
    // Step 4: Check if user exists in database
    console.log('\n=== STEP 4: FIND USER IN DATABASE ===');
    const user = await User.findById(decoded.userId);
    console.log('User found:', user ? 'YES' : 'NO');
    if (user) {
      console.log('User ID:', user.id);
      console.log('User email:', user.email);
      console.log('User status:', user.status);
      console.log('Institution ID:', user.institution_id);
    }
    
    // Step 5: Call profile endpoint with token
    console.log('\n=== STEP 5: CALL PROFILE ENDPOINT ===');
    const profileResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    
    console.log('Profile Status:', profileResponse.status);
    console.log('Profile Body:', JSON.stringify(profileResponse.body, null, 2));
    
    // Step 6: Check environment variables
    console.log('\n=== STEP 6: ENVIRONMENT CHECK ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('JWT_SECRET from env:', process.env.JWT_SECRET ? '[SET]' : '[NOT SET]');
    console.log('JWT_SECRET from config.jwt.secret:', config.jwt?.secret ? '[SET]' : '[NOT SET]');
    
    // Step 7: Verify token with environment secret directly
    console.log('\n=== STEP 7: VERIFY WITH ENV SECRET ===');
    try {
      const envSecret = process.env.JWT_SECRET;
      if (envSecret) {
        const verifiedWithEnv = jwt.verify(token, envSecret);
        console.log('Verification with env secret: SUCCESS');
      }
    } catch (error) {
      console.log('Verification with env secret: FAILED -', error.message);
    }
    
    expect(loginResponse.status).toBe(200);
  });

  test('should check if the test is using different config than auth middleware', async () => {
    // Generate a token the same way the auth controller does
    console.log('\n=== COMPARING TOKEN GENERATION ===');
    
    const user = await User.findById(21); // jest-test user
    if (!user) {
      console.log('Test user not found');
      return;
    }
    
    console.log('User found:', user.email);
    
    // Generate token like auth controller
    const payload = {
      userId: user.id,
      role: user.role,
      institutionId: user.institution_id,
      authType: 'staff',
    };
    
    console.log('\nPayload:', JSON.stringify(payload, null, 2));
    
    const expiresIn = config.jwt.expiresIn || '24h';
    const secret = config.jwt.secret;
    
    console.log('Config expiresIn:', expiresIn);
    console.log('Config secret length:', secret?.length);
    
    const testToken = jwt.sign(payload, secret, { expiresIn });
    console.log('Test token generated:', testToken.substring(0, 50) + '...');
    
    // Now use this test token to call the profile endpoint
    const profileResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${testToken}`);
    
    console.log('\nProfile with test token:');
    console.log('Status:', profileResponse.status);
    console.log('Body:', JSON.stringify(profileResponse.body, null, 2));
    
    expect(profileResponse.status).toBe(200);
  });

  test('should dump the config object', async () => {
    console.log('\n=== CONFIG DUMP ===');
    console.log('Full config.jwt:', JSON.stringify({
      secret: config.jwt?.secret ? `[${config.jwt.secret.length} chars]` : '[NOT SET]',
      expiresIn: config.jwt?.expiresIn || '[NOT SET]',
    }, null, 2));
    
    console.log('\nProcess.env JWT vars:');
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? `[${process.env.JWT_SECRET.length} chars]` : '[NOT SET]');
    console.log('JWT_EXPIRES_IN:', process.env.JWT_EXPIRES_IN || '[NOT SET]');
    
    // Compare secrets
    const configSecret = config.jwt?.secret;
    const envSecret = process.env.JWT_SECRET;
    
    console.log('\nSecrets match:', configSecret === envSecret);
    
    expect(config.jwt?.secret).toBeDefined();
  });
});
