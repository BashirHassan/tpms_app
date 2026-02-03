const { query } = require('./src/db/database');

async function test() {
  try {
    const institutionId = 1;
    const userId = 2; // Dr. James Okonkwo

    // Check current session
    const sessions = await query(
      'SELECT id, name, is_current, max_supervision_visits, inside_distance_threshold_km FROM academic_sessions WHERE institution_id = ? AND is_current = 1',
      [institutionId]
    );
    console.log('Current session:', sessions);

    if (!sessions.length) {
      console.log('No current session found');
      process.exit(0);
    }

    const sessionId = sessions[0].id;

    // Simulate the exact query from getMyPostingsPrintable
    const primaryPostings = await query(`
      SELECT sp.id as posting_id, sp.institution_school_id, sp.group_number, sp.visit_number,
             sp.distance_km, sp.is_primary_posting, sp.merged_with_posting_id,
             sp.transport, sp.dsa, sp.dta, sp.local_running, sp.tetfund,
             ms.name as school_name, ms.official_code as school_code, ms.address as school_address,
             ms.state as school_state, ms.lga as school_lga, ms.ward as school_ward,
             isv.distance_km as school_distance_km, isv.location_category,
             ms.principal_name, ms.principal_phone,
             r.id as route_id, r.name as route_name
      FROM supervisor_postings sp
      LEFT JOIN institution_schools isv ON sp.institution_school_id = isv.id
      LEFT JOIN master_schools ms ON isv.master_school_id = ms.id
      LEFT JOIN routes r ON isv.route_id = r.id
      WHERE sp.institution_id = ? AND sp.supervisor_id = ? AND sp.session_id = ? 
        AND sp.status = 'active' AND sp.is_primary_posting = 1
      ORDER BY sp.visit_number, ms.name
    `, [institutionId, userId, sessionId]);

    console.log('Primary postings found:', primaryPostings.length);
    console.log('Postings:', JSON.stringify(primaryPostings, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
