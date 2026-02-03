/**
 * Jest Configuration
 * Testing setup for DigitalTP Backend
 */

module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/index.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
  clearMocks: true,
  restoreMocks: true,
  // Allow unhandled rejections to surface
  forceExit: true,
  detectOpenHandles: true,
};
