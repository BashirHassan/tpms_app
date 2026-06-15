/**
 * Backfill: encrypt legacy plaintext SSO partner secret keys at rest.
 *
 * After migration 047 renamed sso_partners.secret_key_hash -> secret_key_encrypted,
 * existing rows still hold the secret in PLAINTEXT. This script encrypts any row
 * whose value is not already AES-256-GCM ciphertext. Safe to run multiple times.
 *
 * Run AFTER migration 047 and AFTER setting ENCRYPTION_KEY:
 *   node backend/scripts/encrypt-sso-secrets.js
 */

const { query } = require('../src/db/database');
const encryptionService = require('../src/services/encryptionService');

async function run() {
  console.log('Encrypting legacy SSO partner secret keys...');

  const rows = await query('SELECT id, secret_key_encrypted FROM sso_partners');

  if (rows.length === 0) {
    console.log('  No SSO partners found.');
    process.exit(0);
  }

  let encrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (encryptionService.isEncryptedString(row.secret_key_encrypted)) {
      skipped += 1;
      continue;
    }

    const ciphertext = encryptionService.encrypt(row.secret_key_encrypted);
    await query('UPDATE sso_partners SET secret_key_encrypted = ? WHERE id = ?', [
      ciphertext,
      row.id,
    ]);
    encrypted += 1;
    console.log(`  partner ${row.id} → encrypted`);
  }

  console.log(`Done. Encrypted ${encrypted}, already-encrypted ${skipped}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('SSO secret encryption failed:', err);
  process.exit(1);
});
