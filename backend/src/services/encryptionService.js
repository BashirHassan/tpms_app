/**
 * Encryption Service
 * 
 * Two encryption modes:
 * 1. AES-256-GCM (strong) - For payment data and sensitive financial info
 * 2. AES-128-CBC (fast) - For PINs where speed matters more than maximum security
 */

const crypto = require('crypto');
const config = require('../config');

// Strong encryption (AES-256-GCM) - for payments
const STRONG_ALGORITHM = 'aes-256-gcm';
const STRONG_IV_LENGTH = 16;
const STRONG_AUTH_TAG_LENGTH = 16;
const STRONG_KEY_LENGTH = 32;

// Fast encryption (AES-128-CBC) - for PINs
const FAST_ALGORITHM = 'aes-128-cbc';
const FAST_IV_LENGTH = 16;
const FAST_KEY_LENGTH = 16;

/**
 * Get or generate the strong encryption key (for payments)
 */
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (!envKey) {
    if (config.isProduction) {
      throw new Error('ENCRYPTION_KEY environment variable is required in production');
    }
    console.warn('⚠️  WARNING: Using derived encryption key. Set ENCRYPTION_KEY in production!');
    return crypto.scryptSync(config.jwt.secret, 'digitaltp-salt', STRONG_KEY_LENGTH);
  }

  const keyBuffer = Buffer.from(envKey, 'base64');
  
  if (keyBuffer.length !== STRONG_KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be ${STRONG_KEY_LENGTH} bytes (${STRONG_KEY_LENGTH * 8} bits) encoded as base64`);
  }

  return keyBuffer;
}

/**
 * Get fast encryption key (derived, 128-bit for PINs)
 */
function getFastKey() {
  const envKey = process.env.ENCRYPTION_KEY || config.jwt.secret;
  // Derive a 128-bit key quickly using simple hash
  return crypto.createHash('md5').update(envKey + 'pin-salt').digest();
}

/**
 * Strong encrypt - AES-256-GCM for payment data
 */
function encrypt(plaintext) {
  if (!plaintext) return null;

  const key = getEncryptionKey();
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
 * Strong decrypt - AES-256-GCM for payment data
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null;

  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(STRONG_ALGORITHM, key, iv, {
      authTagLength: STRONG_AUTH_TAG_LENGTH
    });
    
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Fast encrypt - AES-128-CBC for PINs (much faster, still secure enough)
 */
function encryptStudentPin(plaintext) {
  if (!plaintext) return null;

  const key = getFastKey();
  const iv = crypto.randomBytes(FAST_IV_LENGTH);
  
  const cipher = crypto.createCipheriv(FAST_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Format: iv:ciphertext (no auth tag needed for CBC)
  return `${iv.toString('base64')}:${encrypted}`;
}

/**
 * Fast decrypt - AES-128-CBC for PINs
 */
function decryptStudentPin(encryptedData) {
  if (!encryptedData) return null;

  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted PIN format');
    }

    const [ivBase64, ciphertext] = parts;
    const key = getFastKey();
    const iv = Buffer.from(ivBase64, 'base64');

    const decipher = crypto.createDecipheriv(FAST_ALGORITHM, key, iv);
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Fast decryption failed:', error.message);
    return null;
  }
}

/**
 * Generate a new random encryption key
 */
function generateKey() {
  const key = crypto.randomBytes(STRONG_KEY_LENGTH);
  return key.toString('base64');
}

module.exports = {
  // Strong encryption for payments
  encrypt,
  decrypt,
  // Fast encryption for PINs
  encryptStudentPin,
  decryptStudentPin,
  generateKey,
  ALGORITHM: STRONG_ALGORITHM,
  KEY_LENGTH: STRONG_KEY_LENGTH,
};
