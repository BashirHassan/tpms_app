/**
 * Jest Setup File
 * Runs before all tests - sets up environment and global fixtures
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing';
process.env.JWT_EXPIRES_IN = '1h';

// Mock console.error for cleaner test output (comment out to debug)
// const originalError = console.error;
// console.error = (...args) => {
//   if (args[0]?.includes?.('Database') || args[0]?.includes?.('[AUTH]')) {
//     return;
//   }
//   originalError.call(console, ...args);
// };

// Global teardown
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});
