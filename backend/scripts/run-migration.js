/**
 * Run Migration Script
 * Executes SQL migration files and tracks which ones have been applied.
 *
 * Usage:
 *   npm run migrate            - show status (applied vs pending)
 *   npm run migrate -- <file>     - run a specific migration (skips if already applied)
 *   npm run migrate -- --pending  - run all pending migrations in order
 *   npm run migrate -- --force <file> - re-run a migration even if already applied
 *   npm run migrate -- --backfill - mark ALL migrations as applied without running them
 *                                   (use once on a DB that already has all migrations applied)
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');

const TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
    \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    \`filename\` VARCHAR(255) NOT NULL,
    \`applied_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_filename\` (\`filename\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function ensureTrackingTable(pool) {
  await pool.query(TRACKING_TABLE_SQL);
}

async function getAppliedMigrations(pool) {
  const [rows] = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY applied_at ASC'
  );
  return new Set(rows.map(r => r.filename));
}

async function recordMigration(pool, filename) {
  await pool.query(
    'INSERT INTO schema_migrations (filename) VALUES (?)',
    [filename]
  );
}

async function runFile(pool, filename, force = false) {
  const applied = await getAppliedMigrations(pool);

  if (applied.has(filename) && !force) {
    console.log(`⏭  Skipping (already applied): ${filename}`);
    return;
  }

  const filePath = path.join(MIGRATIONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Migration file not found: ${filename}`);
    process.exit(1);
  }

  console.log(`▶  Running migration: ${filename}`);
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);

  if (!force) {
    await recordMigration(pool, filename);
  } else {
    // Upsert so --force on an already-tracked migration updates its timestamp
    await pool.query(
      `INSERT INTO schema_migrations (filename) VALUES (?)
       ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP`,
      [filename]
    );
  }

  console.log(`✅ Migration completed: ${filename}`);
}

async function runPending(pool) {
  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations(pool);
  const pending = allFiles.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date.');
    return;
  }

  console.log(`Running ${pending.length} pending migration(s)...\n`);
  for (const file of pending) {
    await runFile(pool, file);
  }
  console.log('\n✅ All pending migrations applied.');
}

async function backfill(pool) {
  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let marked = 0;
  for (const file of allFiles) {
    const [result] = await pool.query(
      'INSERT IGNORE INTO schema_migrations (filename) VALUES (?)',
      [file]
    );
    if (result.affectedRows > 0) {
      console.log(`  ✅ Marked: ${file}`);
      marked++;
    } else {
      console.log(`  ⏭  Already recorded: ${file}`);
    }
  }
  console.log(`\n✅ Backfill complete. ${marked} migration(s) newly recorded.`);
}

async function showStatus(pool) {
  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await getAppliedMigrations(pool);
  const pending = allFiles.filter(f => !applied.has(f));

  if (applied.size > 0) {
    console.log(`Applied (${applied.size}):`);
    allFiles.filter(f => applied.has(f)).forEach(f => console.log(`  ✅ ${f}`));
  }

  if (pending.length > 0) {
    console.log(`\nPending (${pending.length}):`);
    pending.forEach(f => console.log(`  ⏳ ${f}`));
    console.log('\nTo apply all pending:  npm run migrate -- --pending');
    console.log('To apply one:          npm run migrate -- <filename>');
    console.log('To mark all applied:   npm run migrate -- --backfill  (use on a DB that already has all migrations)');
  } else {
    console.log('\n✅ Database is up to date.');
  }
}

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digitaltp',
    multipleStatements: true,
  });

  try {
    await ensureTrackingTable(pool);

    const args = process.argv.slice(2);

    if (args[0] === '--backfill') {
      await backfill(pool);
    } else if (args[0] === '--pending') {
      await runPending(pool);
    } else if (args[0] === '--force') {
      const filename = args[1];
      if (!filename) {
        console.error('❌ --force requires a filename: npm run migrate -- --force <filename>');
        process.exit(1);
      }
      await runFile(pool, filename, true);
    } else if (args[0]) {
      await runFile(pool, args[0]);
    } else {
      await showStatus(pool);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
