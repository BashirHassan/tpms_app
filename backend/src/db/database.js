/**
 * Database Utilities
 * 
 * Simple query helper with transaction support.
 * Institution scoping is handled at the controller level via route params.
 * 
 * Pattern: Direct SQL with explicit institution_id filter
 * Example:
 *   const { query } = require('../db/database');
 *   const students = await query(
 *     'SELECT * FROM students WHERE institution_id = ?',
 *     [institutionId]
 *   );
 */

const pool = require('./connection');

/**
 * Execute a SQL query
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
async function query(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('Database query error:', error.message);
    console.error('Query:', sql);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute a single query and get the first row
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} First row or null
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Execute multiple statements in a transaction
 * @param {Function} callback - Async function receiving connection
 * @returns {Promise<any>} Transaction result
 * 
 * Usage:
 *   await transaction(async (conn) => {
 *     await conn.execute('INSERT INTO ...', [params]);
 *     await conn.execute('UPDATE ...', [params]);
 *     return { success: true };
 *   });
 */
async function transaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get a single row by ID with institution scoping
 * Convenience helper for common pattern
 * @param {string} table - Table name
 * @param {number} id - Record ID
 * @param {number} institutionId - Institution ID for scoping
 * @returns {Promise<Object|null>} Record or null
 */
async function findById(table, id, institutionId) {
  const rows = await query(
    `SELECT * FROM \`${table}\` WHERE id = ? AND institution_id = ?`,
    [id, institutionId]
  );
  return rows[0] || null;
}

/**
 * Check if a record exists
 * @param {string} table - Table name
 * @param {Object} conditions - WHERE conditions as key-value pairs
 * @returns {Promise<boolean>} True if exists
 */
async function exists(table, conditions) {
  const keys = Object.keys(conditions);
  const whereClause = keys.map(key => `\`${key}\` = ?`).join(' AND ');
  const params = keys.map(key => conditions[key]);
  
  const rows = await query(
    `SELECT 1 FROM \`${table}\` WHERE ${whereClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

/**
 * Count records in a table
 * @param {string} table - Table name
 * @param {Object} conditions - WHERE conditions as key-value pairs
 * @returns {Promise<number>} Count
 */
async function count(table, conditions = {}) {
  const keys = Object.keys(conditions);
  let sql = `SELECT COUNT(*) as total FROM \`${table}\``;
  const params = [];

  if (keys.length > 0) {
    const whereClause = keys.map(key => `\`${key}\` = ?`).join(' AND ');
    sql += ` WHERE ${whereClause}`;
    params.push(...keys.map(key => conditions[key]));
  }

  const rows = await query(sql, params);
  return rows[0].total;
}

/**
 * Insert a record and return the inserted ID
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise<{insertId: number}>} Insert result
 */
async function insert(table, data) {
  const keys = Object.keys(data);
  const columns = keys.map(k => `\`${k}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map(k => data[k]);

  const result = await query(
    `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`,
    values
  );
  return { insertId: result.insertId };
}

/**
 * Update a record by ID with institution scoping
 * @param {string} table - Table name
 * @param {number} id - Record ID
 * @param {number} institutionId - Institution ID for scoping
 * @param {Object} data - Data to update
 * @returns {Promise<{affectedRows: number}>} Update result
 */
async function updateById(table, id, institutionId, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return { affectedRows: 0 };
  }

  const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
  const values = [...keys.map(k => data[k]), id, institutionId];

  const result = await query(
    `UPDATE \`${table}\` SET ${setClause} WHERE id = ? AND institution_id = ?`,
    values
  );
  return { affectedRows: result.affectedRows };
}

/**
 * Delete a record by ID with institution scoping
 * @param {string} table - Table name
 * @param {number} id - Record ID
 * @param {number} institutionId - Institution ID for scoping
 * @returns {Promise<{affectedRows: number}>} Delete result
 */
async function deleteById(table, id, institutionId) {
  const result = await query(
    `DELETE FROM \`${table}\` WHERE id = ? AND institution_id = ?`,
    [id, institutionId]
  );
  return { affectedRows: result.affectedRows };
}

module.exports = {
  query,
  queryOne,
  transaction,
  findById,
  exists,
  count,
  insert,
  updateById,
  deleteById,
  pool,
};
