/**
 * Run Migration Script
 * Executes SQL migration files in order
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../database/migrations');
  
  // Get database config from env
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digitaltp',
    multipleStatements: true, // Required for running migration files
  });

  try {
    // Get specific migration file if provided, otherwise run all
    const targetMigration = process.argv[2];
    
    if (targetMigration) {
      // Run specific migration
      const filePath = path.join(migrationsDir, targetMigration);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${targetMigration}`);
        process.exit(1);
      }
      
      console.log(`Running migration: ${targetMigration}`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await pool.query(sql);
      console.log(`✅ Migration completed: ${targetMigration}`);
    } else {
      // List available migrations
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      console.log('Available migrations:');
      files.forEach(f => console.log(`  - ${f}`));
      console.log('\nTo run a specific migration: node scripts/run-migration.js <filename>');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
