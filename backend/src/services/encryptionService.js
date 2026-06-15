/**
 * Encryption Service
 *
 * Two encryption modes:
 * 1. AES-256-GCM (strong) - For payment data and sensitive financial info
 * 2. AES-128-GCM (fast)   - For PINs; authenticated so tampering is detected
 *
 * PIN format history (DigitalTP):
 *   legacy (bare iv:ct) / v2: AES-128-CBC with an MD5-derived key (no auth tag).
 *                             Decrypted for backward compat only.
 *   v3:                       AES-128-GCM with a scrypt-derived key (auth tag).
 *                             Current format for all new PINs.
 */

const crypto = require('crypto');
const config = require('../config');

// Strong encryption (AES-256-GCM) - for payments
const STRONG_ALGORITHM = 'aes-256-gcm';
const STRONG_IV_LENGTH = 16;
const STRONG_AUTH_TAG_LENGTH = 16;
const STRONG_KEY_LENGTH = 32;

// Fast encryption (AES-128-GCM) - for PINs
const FAST_ALGORITHM = 'aes-128-gcm';
const FAST_IV_LENGTH = 12;         // GCM standard 96-bit nonce
const FAST_AUTH_TAG_LENGTH = 16;
const FAST_KEY_LENGTH = 16;

// Legacy CBC algorithm kept only for decrypting old DigitalTP rows during migration
const LEGACY_FAST_ALGORITHM = 'aes-128-cbc';
const LEGACY_FAST_IV_LENGTH = 16;

/**
 * Ordered list of raw key source strings: primary first, then any legacy keys.
 *   ENCRYPTION_KEY         - primary; used for ALL new encryption.
 *   ENCRYPTION_KEY_LEGACY  - comma-separated old keys; used for decryption only.
 * New encryption always uses sources[0]; decryption tries each source in order.
 *
 * The legacy list exists only to support a one-time re-encryption (key rotation)
 * and as a safety net. Once all data is re-encrypted, remove ENCRYPTION_KEY_LEGACY
 * from the environment and the service is single-key again.
 */
function keySources() {
  const primary = process.env.ENCRYPTION_KEY;
  const legacy = (process.env.ENCRYPTION_KEY_LEGACY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!primary) {
    if (config.isProduction) {
      throw new Error('ENCRYPTION_KEY environment variable is required in production');
    }
    console.warn('⚠️  WARNING: Deriving encryption key from JWT secret. Set ENCRYPTION_KEY in production!');
    return [config.jwt.secret, ...legacy];
  }

  return [primary, ...legacy];
}

/**
 * Derive a 32-byte strong key from a source string. A proper base64 32-byte
 * value is used directly (production keys); anything else is stretched with
 * scrypt (preserves the historical dev fallback from the JWT secret).
 */
function toStrongKey(source) {
  const buf = Buffer.from(source, 'base64');
  if (buf.length === STRONG_KEY_LENGTH) return buf;
  return crypto.scryptSync(source, 'digitaltp-salt', STRONG_KEY_LENGTH);
}

// Cache scrypt-derived PIN keys per source string (scrypt is intentionally slow).
const _fastKeyCache = new Map();

/**
 * Derive the 128-bit scrypt PIN key for a source string (v3 GCM PINs).
 */
function toFastKey(source) {
  if (!_fastKeyCache.has(source)) {
    _fastKeyCache.set(
      source,
      crypto.scryptSync(source, 'digitaltp-pin-salt-v2', FAST_KEY_LENGTH, { N: 16384, r: 8, p: 1 })
    );
  }
  return _fastKeyCache.get(source);
}

/**
 * Legacy MD5-derived PIN key for a source string (pre-v3 AES-128-CBC rows only).
 */
function toLegacyMd5Key(source) {
  return crypto.createHash('md5').update(source + 'pin-salt').digest();
}

/**
 * Strong encrypt - AES-256-GCM for payment data. Always uses the primary key.
 */
function encrypt(plaintext) {
  if (!plaintext) return null;

  const key = toStrongKey(keySources()[0]);
  const iv = crypto.randomBytes(STRONG_IV_LENGTH);

  const cipher = crypto.createCipheriv(STRONG_ALGORITHM, key, iv, {
    authTagLength: STRONG_AUTH_TAG_LENGTH
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Strong decrypt - AES-256-GCM. Tries the primary key, then each legacy key
 * (the GCM auth tag tells us which key is correct).
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null;

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Failed to decrypt data');
  }

  const [ivBase64, authTagBase64, ciphertext] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  let lastError;
  for (const source of keySources()) {
    try {
      const decipher = crypto.createDecipheriv(STRONG_ALGORITHM, toStrongKey(source), iv, {
        authTagLength: STRONG_AUTH_TAG_LENGTH
      });
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('Decryption failed:', lastError?.message);
  throw new Error('Failed to decrypt data');
}

/**
 * Fast encrypt - AES-128-GCM for PINs. Always uses the primary key.
 * Output format: "v3:<iv_b64>:<tag_b64>:<ct_b64>"
 */
function encryptStudentPin(plaintext) {
  if (!plaintext) return null;

  const key = toFastKey(keySources()[0]);
  const iv = crypto.randomBytes(FAST_IV_LENGTH);

  const cipher = crypto.createCipheriv(FAST_ALGORITHM, key, iv, {
    authTagLength: FAST_AUTH_TAG_LENGTH,
  });
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `v3:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Fast decrypt for PINs. Tries every key source so data encrypted under an old
 * key still decrypts during rotation. Handles:
 *   v3:<iv>:<tag>:<ct>  - AES-128-GCM, scrypt key (current)
 *   v2:<iv>:<ct>        - AES-128-CBC, MD5 key (legacy, read-only)
 *   <iv>:<ct>           - AES-128-CBC, MD5 key (pre-v3 DigitalTP legacy)
 */
function decryptStudentPin(encryptedData) {
  if (!encryptedData) return null;

  const sources = keySources();

  // Current AES-128-GCM format (scrypt-derived key)
  if (encryptedData.startsWith('v3:')) {
    const parts = encryptedData.slice(3).split(':');
    if (parts.length !== 3) return null;
    const [ivBase64, tagBase64, ciphertext] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');

    for (const source of sources) {
      try {
        const decipher = crypto.createDecipheriv(FAST_ALGORITHM, toFastKey(source), iv, {
          authTagLength: FAST_AUTH_TAG_LENGTH,
        });
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        // try next key
      }
    }
    console.error('Fast decryption failed: no key matched v3 PIN');
    return null;
  }

  // Legacy AES-128-CBC (v2 or pre-v3) - try the MD5-derived key for each source.
  const payload = encryptedData.startsWith('v2:') ? encryptedData.slice(3) : encryptedData;
  const parts = payload.split(':');
  if (parts.length !== 2) return null;
  const [ivBase64, ciphertext] = parts;
  const iv = Buffer.from(ivBase64, 'base64');

  for (const source of sources) {
    try {
      const decipher = crypto.createDecipheriv(LEGACY_FAST_ALGORITHM, toLegacyMd5Key(source), iv);
      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      // try next key (wrong key usually fails PKCS7 padding)
    }
  }
  console.error('Fast decryption failed: no key matched legacy PIN');
  return null;
}

/**
 * Generate a new random encryption key
 */
function generateKey() {
  const key = crypto.randomBytes(STRONG_KEY_LENGTH);
  return key.toString('base64');
}

/**
 * Heuristic: does this string look like AES-256-GCM ciphertext from encrypt()
 * (i.e. "iv:tag:ciphertext")? Used to distinguish encrypted values from legacy
 * plaintext secrets during backward-compatible migrations.
 */
function isEncryptedString(value) {
  return typeof value === 'string' && value.split(':').length === 3;
}

module.exports = {
  // Strong encryption for payments
  encrypt,
  decrypt,
  // Fast encryption for PINs
  encryptStudentPin,
  decryptStudentPin,
  generateKey,
  isEncryptedString,
  ALGORITHM: STRONG_ALGORITHM,
  KEY_LENGTH: STRONG_KEY_LENGTH,
};
