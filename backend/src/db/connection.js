/**
 * Database Connection Pool
 * MySQL2 Promise-based connection with pooling
 */

const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Enable named placeholders for cleaner queries
  namedPlaceholders: true,
  // Return dates as strings to avoid timezone conversion issues
  dateStrings: true,
});

// Test connection on startup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
};

// Execute when module loads
testConnection();

module.exports = pool;
