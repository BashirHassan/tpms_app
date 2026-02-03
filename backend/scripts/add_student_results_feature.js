/**
 * Script to add student_results feature toggle and enable it for all institutions
 */

const { query } = require('../src/db/database');

async function run() {
  try {
    console.log('Adding student_results feature toggle...');
    
    // Check if feature already exists
    const existing = await query(
      'SELECT * FROM feature_toggles WHERE feature_key = ?',
      ['student_results']
    );
    
    let featureId;
    
    if (existing.length > 0) {
      featureId = existing[0].id;
      console.log('Feature already exists with id:', featureId);
    } else {
      // Add the feature toggle definition
      const result = await query(
        `INSERT INTO feature_toggles 
         (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'student_results',
          'Student Results',
          'Enable student result management and supervisor scoring',
          1,  // is_enabled globally
          0,  // not premium
          1,  // default enabled for new institutions
          'institution',
          'results'
        ]
      );
      featureId = result.insertId;
      console.log('Feature toggle added with id:', featureId);
    }
    
    // Get all institutions
    const institutions = await query('SELECT id, code FROM institutions');
    console.log(`Found ${institutions.length} institutions`);
    
    // Enable the feature for each institution
    for (const inst of institutions) {
      // Check if already enabled
      const existingMapping = await query(
        'SELECT * FROM institution_feature_toggles WHERE institution_id = ? AND feature_toggle_id = ?',
        [inst.id, featureId]
      );
      
      if (existingMapping.length > 0) {
        console.log(`Feature already enabled for institution ${inst.code} (id: ${inst.id})`);
      } else {
        await query(
          `INSERT INTO institution_feature_toggles 
           (institution_id, feature_toggle_id, is_enabled) 
           VALUES (?, ?, ?)`,
          [inst.id, featureId, 1]
        );
        console.log(`Feature enabled for institution ${inst.code} (id: ${inst.id})`);
      }
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
