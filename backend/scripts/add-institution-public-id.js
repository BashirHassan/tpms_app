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

async function randomPublicId() {
  return crypto.randomBytes(16).toString('hex');
}

async function run() {
  console.log('Adding public_id column to institutions table...');

  await query(`
    ALTER TABLE institutions
    ADD COLUMN public_id VARCHAR(32) NULL
  `).catch((err) => {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('  Column public_id already exists, skipping ALTER.');
    } else {
      throw err;
    }
  });

  const rows = await query(`
    SELECT id FROM institutions
    WHERE public_id IS NULL OR public_id = ''
  `);

  if (rows.length === 0) {
    console.log('  All institutions already have a public_id.');
  } else {
    console.log(`  Backfilling ${rows.length} institution(s)...`);

    for (const { id } of rows) {
      let publicId;
      let updated = false;

      while (!updated) {
        publicId = await randomPublicId();

        try {
          await query(
            'UPDATE institutions SET public_id = ? WHERE id = ?',
            [publicId, id]
          );
          updated = true;
          console.log(`  institution ${id} → ${publicId}`);
        } catch (err) {
          if (err.code !== 'ER_DUP_ENTRY') throw err;
        }
      }
    }
  }

  await query(`
    ALTER TABLE institutions
    MODIFY public_id VARCHAR(32) NOT NULL
  `);

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

  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});