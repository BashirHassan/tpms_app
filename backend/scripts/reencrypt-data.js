/**
 * One-time re-encryption: migrate all encrypted data from the OLD key to the NEW key.
 *
 * Run with BOTH keys present in the environment:
 *   ENCRYPTION_KEY        = NEW primary key (all data is rewritten under this)
 *   ENCRYPTION_KEY_LEGACY = OLD key (so existing data can still be decrypted)
 *
 * For every encrypted value it decrypts (dual-key resolves old or new) and
 * re-encrypts under the new primary key. Idempotent — running it again decrypts
 * the now-new value and re-encrypts it to new again.
 *
 * After it completes successfully and you have verified the app, REMOVE
 * ENCRYPTION_KEY_LEGACY from the environment so the system is single-key again.
 *
 *   node backend/scripts/reencrypt-data.js
 *
 * Columns covered:
 *   students.pin_encrypted                         (fast AES-128, v3 GCM)
 *   institutions.paystack_secret_key               (strong AES-256-GCM)
 *   institutions.paystack_public_key               (strong AES-256-GCM)
 *   institutions.smtp_password                     (strong AES-256-GCM)
 *   sso_partners.secret_key_encrypted              (strong; plaintext -> encrypted)
 */

const { query } = require('../src/db/database');
const enc = require('../src/services/encryptionService');

function assertDualKeys() {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY (new primary) must be set');
  }
  if (!process.env.ENCRYPTION_KEY_LEGACY) {
    console.warn(
      '⚠️  ENCRYPTION_KEY_LEGACY is not set. If existing data was encrypted with a different key, this run will fail to decrypt it. Continue only if the current ENCRYPTION_KEY already encrypted all data.'
    );
  }
}

async function reencryptStudentPins() {
  const rows = await query(
    `SELECT id, pin_encrypted FROM students WHERE pin_encrypted IS NOT NULL AND pin_encrypted <> ''`
  );
  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    const plain = enc.decryptStudentPin(row.pin_encrypted);
    if (plain === null) {
      skipped += 1;
      console.warn(`  [students] id=${row.id} could not be decrypted — skipped`);
      continue;
    }
    await query('UPDATE students SET pin_encrypted = ? WHERE id = ?', [
      enc.encryptStudentPin(plain),
      row.id,
    ]);
    done += 1;
  }
  console.log(`students.pin_encrypted: re-encrypted ${done}, skipped ${skipped} (of ${rows.length})`);
}

async function reencryptInstitutionField(column) {
  const rows = await query(
    `SELECT id, \`${column}\` AS val FROM institutions WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''`
  );
  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    let plain;
    try {
      plain = enc.decrypt(row.val);
    } catch (error) {
      skipped += 1;
      console.warn(`  [institutions.${column}] id=${row.id} could not be decrypted — skipped`);
      continue;
    }
    await query(`UPDATE institutions SET \`${column}\` = ? WHERE id = ?`, [enc.encrypt(plain), row.id]);
    done += 1;
  }
  console.log(`institutions.${column}: re-encrypted ${done}, skipped ${skipped} (of ${rows.length})`);
}

async function reencryptSsoSecrets() {
  const rows = await query(
    `SELECT id, secret_key_encrypted FROM sso_partners WHERE secret_key_encrypted IS NOT NULL AND secret_key_encrypted <> ''`
  );
  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    const stored = row.secret_key_encrypted;
    let plain;
    if (enc.isEncryptedString(stored)) {
      try {
        plain = enc.decrypt(stored);
      } catch (error) {
        skipped += 1;
        console.warn(`  [sso_partners] id=${row.id} could not be decrypted — skipped`);
        continue;
      }
    } else {
      // Legacy plaintext secret (pre-encryption)
      plain = stored;
    }
    await query('UPDATE sso_partners SET secret_key_encrypted = ? WHERE id = ?', [
      enc.encrypt(plain),
      row.id,
    ]);
    done += 1;
  }
  console.log(`sso_partners.secret_key_encrypted: re-encrypted ${done}, skipped ${skipped} (of ${rows.length})`);
}

async function run() {
  assertDualKeys();
  console.log('Re-encrypting all data under the new ENCRYPTION_KEY...');

  await reencryptStudentPins();
  await reencryptInstitutionField('paystack_secret_key');
  await reencryptInstitutionField('paystack_public_key');
  await reencryptInstitutionField('smtp_password');
  await reencryptSsoSecrets();

  console.log('Done. Verify the app, then REMOVE ENCRYPTION_KEY_LEGACY from the environment.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Re-encryption failed:', err);
  process.exit(1);
});
