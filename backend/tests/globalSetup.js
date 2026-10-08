/**
 * Jest Global Setup
 *
 * The HTTP-level suites run against the real development database, so they
 * need an institution and staff users that actually exist in it. This looks
 * them up once (read-only) and hands them to the tests through environment
 * variables - see TEST_* in tests/helpers/testUtils.js.
 *
 * Nothing is created: a database with no institution, or no database at all,
 * just leaves the defaults in place and the mocked suites still run.
 */

module.exports = async () => {
  let connection;
  try {
    require('dotenv').config();
    const mysql = require('mysql2/promise');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 5000,
    });

    // The active institution with a head of teaching practice to act as
    const [[staff]] = await connection.query(
      `SELECT u.id, u.email, i.id AS institution_id, i.subdomain
       FROM users u
       JOIN institutions i ON i.id = u.institution_id
       WHERE i.status = 'active' AND u.status = 'active' AND u.role = 'head_of_teaching_practice'
       ORDER BY i.id, u.id
       LIMIT 1`
    );
    if (staff) {
      process.env.TEST_INSTITUTION_ID = String(staff.institution_id);
      process.env.TEST_INSTITUTION_SUBDOMAIN = staff.subdomain;
      process.env.TEST_STAFF_USER_ID = String(staff.id);
      process.env.TEST_STAFF_EMAIL = staff.email;
    }

    const [[superAdmin]] = await connection.query(
      `SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' ORDER BY id LIMIT 1`
    );
    if (superAdmin) process.env.TEST_SUPER_ADMIN_ID = String(superAdmin.id);
  } catch (error) {
    console.warn(`[tests] No test institution resolved from the database (${error.message}); using defaults.`);
  } finally {
    if (connection) await connection.end();
  }
};
