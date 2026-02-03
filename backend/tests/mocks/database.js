/**
 * Database Mock
 * Provides mock database functions for testing without a real database connection
 */

// Store for mock query results
let mockResults = [];
let queryHistory = [];
let shouldThrowError = false;
let errorToThrow = null;

/**
 * Mock query function
 * Returns configured results or empty array
 */
async function query(sql, params = []) {
  queryHistory.push({ sql, params, timestamp: new Date() });
  
  if (shouldThrowError && errorToThrow) {
    const error = errorToThrow;
    errorToThrow = null;
    shouldThrowError = false;
    throw error;
  }
  
  // Check if we have a matching result
  for (const result of mockResults) {
    if (result.pattern && sql.includes(result.pattern)) {
      const matched = mockResults.splice(mockResults.indexOf(result), 1)[0];
      return matched.value;
    }
  }
  
  // Default: return empty array
  return [];
}

/**
 * Mock transaction function
 * Executes callback with mock connection
 */
async function transaction(callback) {
  const mockConnection = {
    execute: async (sql, params) => {
      queryHistory.push({ sql, params, type: 'transaction', timestamp: new Date() });
      return [{ insertId: 1, affectedRows: 1 }];
    },
    query: async (sql, params) => {
      queryHistory.push({ sql, params, type: 'transaction', timestamp: new Date() });
      return [[]];
    },
  };
  
  return callback(mockConnection);
}

/**
 * Mock findById helper
 */
async function findById(table, id, institutionId) {
  const sql = `SELECT * FROM ${table} WHERE id = ? AND institution_id = ?`;
  queryHistory.push({ sql, params: [id, institutionId], timestamp: new Date() });
  
  for (const result of mockResults) {
    if (result.pattern && sql.includes(result.pattern)) {
      return result.value;
    }
  }
  
  return null;
}

// ============================================================================
// TEST CONTROL FUNCTIONS
// ============================================================================

/**
 * Set up mock result for specific query pattern
 * @param {string} pattern - SQL pattern to match
 * @param {any} value - Value to return
 */
function setMockResult(pattern, value) {
  mockResults.push({ pattern, value });
}

/**
 * Set up mock to throw error on next query
 * @param {Error} error - Error to throw
 */
function setMockError(error) {
  shouldThrowError = true;
  errorToThrow = error;
}

/**
 * Get all queries executed since last reset
 * @returns {Array} Query history
 */
function getQueryHistory() {
  return [...queryHistory];
}

/**
 * Reset all mocks and history
 */
function resetMocks() {
  mockResults = [];
  queryHistory = [];
  shouldThrowError = false;
  errorToThrow = null;
}

/**
 * Verify a query was executed
 * @param {string} pattern - SQL pattern to find
 * @returns {boolean} True if query was executed
 */
function wasQueryExecuted(pattern) {
  return queryHistory.some(q => q.sql.includes(pattern));
}

/**
 * Get queries matching a pattern
 * @param {string} pattern - SQL pattern to find
 * @returns {Array} Matching queries
 */
function getQueriesMatching(pattern) {
  return queryHistory.filter(q => q.sql.includes(pattern));
}

module.exports = {
  query,
  transaction,
  findById,
  pool: {
    query: async (sql, params) => {
      return [await query(sql, params)];
    },
    getConnection: async () => ({
      query: async (sql, params) => [await query(sql, params)],
      execute: async (sql, params) => [await query(sql, params)],
      release: () => {},
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
    }),
  },
  // Test control functions
  setMockResult,
  setMockError,
  getQueryHistory,
  resetMocks,
  wasQueryExecuted,
  getQueriesMatching,
};
