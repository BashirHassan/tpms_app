require('dotenv').config();
const pool = require('../src/db/connection');

async function check() {
  const conn = await pool.getConnection();
  
  // Get session settings
  const [sessions] = await conn.execute('SELECT id, name, inside_distance_threshold_km, dsa_enabled, dsa_min_distance_km, dsa_max_distance_km, dsa_percentage FROM academic_sessions WHERE is_current = 1 LIMIT 1');
  console.log('Session settings:', JSON.stringify(sessions[0], null, 2));
  
  const threshold = parseFloat(sessions[0]?.inside_distance_threshold_km) || 10;
  console.log('\nInside Distance Threshold:', threshold, 'km');
  
  // Find postings where distance > threshold but only local_running is set
  const [postings] = await conn.execute(`
    SELECT sp.id, sp.supervisor_id, sp.institution_school_id, sp.distance_km, 
           sp.local_running, sp.transport, sp.dsa, sp.dta, sp.tetfund,
           sp.is_primary_posting, ms.name as school_name,
           u.name as supervisor_name
    FROM supervisor_postings sp
    JOIN institution_schools isv ON sp.institution_school_id = isv.id
    JOIN master_schools ms ON isv.master_school_id = ms.id
    JOIN users u ON sp.supervisor_id = u.id
    WHERE sp.distance_km > ?
      AND sp.local_running > 0
      AND sp.transport = 0
      AND sp.status != 'cancelled'
    LIMIT 10
  `, [threshold]);
  
  console.log('\nPostings with distance > threshold but only local_running:', postings.length);
  postings.forEach(p => {
    console.log(`ID: ${p.id}, School: ${p.school_name}, Distance: ${p.distance_km}km`);
    console.log(`  local_running: ${p.local_running}, transport: ${p.transport}, dsa: ${p.dsa}, dta: ${p.dta}, tetfund: ${p.tetfund}`);
  });
  
  // Also check all postings to see the distribution
  const [allPostings] = await conn.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN distance_km <= ? THEN 1 ELSE 0 END) as inside_count,
      SUM(CASE WHEN distance_km > ? THEN 1 ELSE 0 END) as outside_count,
      SUM(CASE WHEN local_running > 0 AND transport = 0 THEN 1 ELSE 0 END) as only_local_running,
      SUM(CASE WHEN transport > 0 THEN 1 ELSE 0 END) as has_transport
    FROM supervisor_postings
    WHERE status != 'cancelled'
  `, [threshold, threshold]);
  
  console.log('\nPosting distribution:', JSON.stringify(allPostings[0], null, 2));
  
  // Show ALL postings with their details
  const [allDetails] = await conn.execute(`
    SELECT sp.id, sp.supervisor_id, sp.institution_school_id, sp.distance_km, 
           sp.local_running, sp.transport, sp.dsa, sp.dta, sp.tetfund,
           sp.is_primary_posting, ms.name as school_name,
           u.name as supervisor_name, sp.status
    FROM supervisor_postings sp
    JOIN institution_schools isv ON sp.institution_school_id = isv.id
    JOIN master_schools ms ON isv.master_school_id = ms.id
    JOIN users u ON sp.supervisor_id = u.id
    ORDER BY sp.id DESC
    LIMIT 20
  `);
  
  console.log('\nAll postings (most recent first):');
  allDetails.forEach(p => {
    const isInside = parseFloat(p.distance_km) <= threshold;
    console.log(`\nID: ${p.id}, School: ${p.school_name}`);
    console.log(`  Distance: ${p.distance_km}km (${isInside ? 'INSIDE' : 'OUTSIDE'} threshold ${threshold}km)`);
    console.log(`  Allowances: local_running=${p.local_running}, transport=${p.transport}, dsa=${p.dsa}, dta=${p.dta}, tetfund=${p.tetfund}`);
    console.log(`  Status: ${p.status}, Primary: ${p.is_primary_posting}`);
  });
  
  conn.release();
}

check().catch(console.error);
