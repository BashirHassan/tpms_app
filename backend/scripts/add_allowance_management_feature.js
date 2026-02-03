/**
 * Add allowance_management feature toggle and enable for institution 1
 */
const { query } = require('../src/db/database');

async function main() {
  try {
    // Check if feature already exists
    const existing = await query(
      "SELECT id FROM feature_toggles WHERE feature_key = 'allowance_management'"
    );
    
    let featureId;
    
    if (existing.length > 0) {
      featureId = existing[0].id;
      console.log('Feature already exists with id:', featureId);
    } else {
      // Create the feature toggle
      const result = await query(
        `INSERT INTO feature_toggles (feature_key, name, description, is_enabled, is_premium, default_enabled, scope, module) 
         VALUES ('allowance_management', 'Allowance Management', 'Manage and view supervisor allowance calculations', 1, 0, 0, 'institution', 'finance')`
      );
      featureId = result.insertId;
      console.log('Created feature_toggles entry with id:', featureId);
    }
    
    // Check if already enabled for institution 1
    const existingInst = await query(
      'SELECT id FROM institution_feature_toggles WHERE institution_id = 1 AND feature_toggle_id = ?',
      [featureId]
    );
    
    if (existingInst.length > 0) {
      console.log('Feature already enabled for institution 1');
    } else {
      // Enable for institution 1
      const enable = await query(
        'INSERT INTO institution_feature_toggles (institution_id, feature_toggle_id, is_enabled) VALUES (1, ?, 1)',
        [featureId]
      );
      console.log('Enabled for institution 1, row id:', enable.insertId);
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
