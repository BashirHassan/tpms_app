/**
 * Migration: Add public_id column to institutions table
 *
 * Replaces the sequential integer ID in API URLs with a 32-char random hex
 * string so institution IDs are opaque and non-enumerable.
 *
 * Run BEFORE deploying the code changes:
 *   node backend/scripts/add-institution-public-id.js
 */

const crypto = require('crypto');
const { query } = require('../src/db/database');

async function run() {
  console.log('Adding public_id column to institutions table...');

  // Add column — silently skip if it already exists
  await query(`
    ALTER TABLE institutions
    ADD COLUMN public_id VARCHAR(32) NOT NULL DEFAULT ''
  `).catch((err) => {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('  Column public_id already exists, skipping ALTER.');
    } else {
      throw err;
    }
  });

  // Add unique index — silently skip if already exists
  await query(`
    ALTER TABLE institutions
    ADD UNIQUE KEY uq_institutions_public_id (public_id)
  `).catch((err) => {
    if (err.code === 'ER_DUP_KEYNAME') {
      console.log('  Unique key uq_institutions_public_id already exists, skipping.');
    } else {
      throw err;
    }
  });

  // Backfill existing rows that have no public_id yet
  const rows = await query(
    "SELECT id FROM institutions WHERE public_id = '' OR public_id IS NULL"
  );

  if (rows.length === 0) {
    console.log('  All institutions already have a public_id.');
  } else {
    console.log(`  Backfilling ${rows.length} institution(s)...`);
    for (const { id } of rows) {
      const publicId = crypto.randomBytes(16).toString('hex');
      await query('UPDATE institutions SET public_id = ? WHERE id = ?', [publicId, id]);
      console.log(`  institution ${id} → ${publicId}`);
    }
  }

  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
