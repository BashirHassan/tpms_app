/**
 * Test Utilities
 * Common helper functions for testing
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-signing';

// ============================================================================
// TOKEN GENERATION
// ============================================================================

/**
 * Generate a valid JWT token for testing
 * @param {Object} payload - Token payload
 * @param {string} expiresIn - Token expiration time
 * @returns {string} JWT token
 */
function generateTestToken(payload = {}, expiresIn = '1h') {
  const defaultPayload = {
    userId: 1,
    institutionId: 1,
    role: 'head_of_teaching_practice',
    authType: 'staff',
    ...payload,
  };
  
  return jwt.sign(defaultPayload, JWT_SECRET, { expiresIn });
}

/**
 * Generate an expired token for testing token expiration handling
 * @param {Object} payload - Token payload
 * @returns {string} Expired JWT token
 */
function generateExpiredToken(payload = {}) {
  const defaultPayload = {
    userId: 1,
    institutionId: 1,
    role: 'head_of_teaching_practice',
    authType: 'staff',
    ...payload,
  };
  
  return jwt.sign(defaultPayload, JWT_SECRET, { expiresIn: '-1s' });
}

/**
 * Generate an invalid token (wrong secret)
 * @param {Object} payload - Token payload
 * @returns {string} Invalid JWT token
 */
function generateInvalidToken(payload = {}) {
  const defaultPayload = {
    userId: 1,
    institutionId: 1,
    role: 'head_of_teaching_practice',
    authType: 'staff',
    ...payload,
  };
  
  return jwt.sign(defaultPayload, 'wrong-secret', { expiresIn: '1h' });
}

/**
 * Generate a super admin token
 * @returns {string} JWT token for super admin
 */
function generateSuperAdminToken() {
  return generateTestToken({
    userId: 1,
    institutionId: null,
    role: 'super_admin',
    authType: 'staff',
  });
}

/**
 * Generate a student token
 * @param {number} studentId - Student ID
 * @param {number} institutionId - Institution ID
 * @returns {string} JWT token for student
 */
function generateStudentToken(studentId = 1, institutionId = 1) {
  return generateTestToken({
    userId: studentId,
    institutionId,
    role: 'student',
    authType: 'student',
  });
}

// ============================================================================
// PASSWORD UTILITIES
// ============================================================================

/**
 * Hash a password for test fixtures
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

/**
 * Create mock user data
 * @param {Object} overrides - Properties to override
 * @returns {Object} User object
 */
function createMockUser(overrides = {}) {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@institution.edu.ng',
    role: 'head_of_teaching_practice',
    institution_id: 1,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock institution data
 * @param {Object} overrides - Properties to override
 * @returns {Object} Institution object
 */
function createMockInstitution(overrides = {}) {
  return {
    id: 1,
    name: 'Test Institution',
    code: 'TESTINST',
    subdomain: 'test',
    institution_type: 'college_of_education',
    email: 'info@testinst.edu.ng',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock student data
 * @param {Object} overrides - Properties to override
 * @returns {Object} Student object
 */
function createMockStudent(overrides = {}) {
  return {
    id: 1,
    institution_id: 1,
    full_name: 'Test Student',
    registration_number: 'NCE/2024/001',
    email: 'student@test.edu.ng',
    phone: '08012345678',
    status: 'active',
    payment_status: 'pending',
    program_id: 1,
    session_id: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock school data
 * @param {Object} overrides - Properties to override
 * @returns {Object} School object
 */
function createMockSchool(overrides = {}) {
  return {
    id: 1,
    institution_id: 1,
    name: 'Test Primary School',
    code: 'TPS001',
    lga: 'Test LGA',
    state: 'Test State',
    address: '123 Test Street',
    school_type: 'primary',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock session data
 * @param {Object} overrides - Properties to override
 * @returns {Object} Session object
 */
function createMockSession(overrides = {}) {
  return {
    id: 1,
    institution_id: 1,
    name: '2024/2025',
    start_date: '2024-09-01',
    end_date: '2025-07-31',
    is_current: true,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ============================================================================
// REQUEST/RESPONSE HELPERS
// ============================================================================

/**
 * Create auth header object
 * @param {string} token - JWT token
 * @returns {Object} Headers object
 */
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Create full headers with auth and content-type
 * @param {string} token - JWT token
 * @returns {Object} Headers object
 */
function fullHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// RESPONSE ASSERTIONS
// ============================================================================

/**
 * Assert successful API response
 * @param {Object} response - Supertest response object
 * @param {number} statusCode - Expected status code
 */
function expectSuccess(response, statusCode = 200) {
  expect(response.status).toBe(statusCode);
  expect(response.body.success).toBe(true);
}

/**
 * Assert error API response
 * @param {Object} response - Supertest response object
 * @param {number} statusCode - Expected status code
 * @param {string} errorCode - Expected error code
 */
function expectError(response, statusCode, errorCode = null) {
  expect(response.status).toBe(statusCode);
  expect(response.body.success).toBe(false);
  if (errorCode) {
    expect(response.body.errorCode).toBe(errorCode);
  }
}

/**
 * Assert paginated response
 * @param {Object} response - Supertest response object
 */
function expectPaginated(response) {
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.data).toBeDefined();
  expect(response.body.pagination).toBeDefined();
  expect(typeof response.body.pagination.total).toBe('number');
  expect(typeof response.body.pagination.page).toBe('number');
  expect(typeof response.body.pagination.limit).toBe('number');
}

module.exports = {
  // Token utilities
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
  generateSuperAdminToken,
  generateStudentToken,
  
  // Password utilities
  hashPassword,
  
  // Mock data factories
  createMockUser,
  createMockInstitution,
  createMockStudent,
  createMockSchool,
  createMockSession,
  
  // Request helpers
  authHeader,
  fullHeaders,
  
  // Assertions
  expectSuccess,
  expectError,
  expectPaginated,
};
