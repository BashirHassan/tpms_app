/**
 * Check for school groups with supervisors but no students
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // Check Federal Government College specifically
  const [school] = await pool.query("SELECT * FROM master_schools WHERE name LIKE '%Federal Government College%' LIMIT 1");
  console.log('School:', school[0]?.name, 'ID:', school[0]?.id);

  if (!school[0]) {
    console.log('School not found');
    await pool.end();
    return;
  }

  // Check institution_schools for this master school
  const [instSchool] = await pool.query('SELECT * FROM institution_schools WHERE master_school_id = ?', [school[0]?.id]);
  console.log('Institution School ID:', instSchool[0]?.id);

  if (!instSchool[0]) {
    console.log('Institution school not found');
    await pool.end();
    return;
  }

  // Check supervisor postings for this school
  const [postings] = await pool.query("SELECT sp.*, u.name as supervisor_name FROM supervisor_postings sp JOIN users u ON sp.supervisor_id = u.id WHERE sp.institution_school_id = ? AND sp.status = 'active'", [instSchool[0]?.id]);
  console.log('\nSupervisor Postings:', postings.length);
  console.table(postings.map(p => ({id: p.id, group: p.group_number, visit: p.visit_number, supervisor: p.supervisor_name, session: p.session_id})));

  // Check student acceptances for this school
  const [acceptances] = await pool.query("SELECT sa.*, s.full_name FROM student_acceptances sa JOIN students s ON sa.student_id = s.id WHERE sa.institution_school_id = ? AND sa.status = 'approved'", [instSchool[0]?.id]);
  console.log('\nStudent Acceptances:', acceptances.length);
  console.table(acceptances.map(a => ({id: a.id, group: a.group_number, student: a.full_name, session: a.session_id})));

  await pool.end();
}

check().catch(console.error);
