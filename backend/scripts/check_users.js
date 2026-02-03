require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkUsers() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'digitaltp',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    const [columns] = await pool.query('SHOW COLUMNS FROM users');
    console.log('Users table columns:');
    columns.forEach(col => console.log(`  - ${col.Field} (${col.Type})`));
    
    // Test the EXACT query from sessionController line 107-112
    const testSql = `
      SELECT s.*, u.name as created_by_name,
             (SELECT COUNT(*) FROM students st WHERE st.session_id = s.id) as student_count,
             (SELECT COUNT(*) FROM supervisor_postings p WHERE p.session_id = s.id) as posting_count
      FROM academic_sessions s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.institution_id = 1
      ORDER BY s.is_current DESC, s.start_date DESC LIMIT 50 OFFSET 0
    `;
    
    console.log('\nTesting EXACT query from sessionController...');
    const [result] = await pool.query(testSql);
    console.log('SUCCESS! Rows returned:', result.length);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkUsers();
