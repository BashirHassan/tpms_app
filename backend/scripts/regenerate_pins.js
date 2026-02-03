/**
 * Regenerate PINs Script
 * 
 * This script regenerates and re-encrypts PINs for all students
 * when the encryption key has changed.
 * 
 * Usage: node scripts/regenerate_pins.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Replicate the encryption logic
const FAST_ALGORITHM = 'aes-128-cbc';
const FAST_IV_LENGTH = 16;

function getFastKey() {
  const envKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  return crypto.createHash('md5').update(envKey + 'pin-salt').digest();
}

function encryptStudentPin(plaintext) {
  if (!plaintext) return null;
  const key = getFastKey();
  const iv = crypto.randomBytes(FAST_IV_LENGTH);
  const cipher = crypto.createCipheriv(FAST_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('base64')}:${encrypted}`;
}

function generatePin() {
  // Generate 10-digit PIN for enhanced security
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

async function regeneratePins() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digitaltp',
  });

  try {
    console.log('🔐 Starting PIN regeneration...\n');

    // Get all students
    const [students] = await connection.query(
      'SELECT id, registration_number, full_name FROM students WHERE status != "deleted"'
    );

    console.log(`Found ${students.length} students to process\n`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const student of students) {
      try {
        // Generate new PIN
        const pin = generatePin();
        
        // Hash for authentication
        const pinHash = await bcrypt.hash(pin, 10);
        
        // Encrypt for display
        const pinEncrypted = encryptStudentPin(pin);

        // Update student
        await connection.query(
          'UPDATE students SET pin_hash = ?, pin_encrypted = ? WHERE id = ?',
          [pinHash, pinEncrypted, student.id]
        );

        results.push({
          id: student.id,
          registration_number: student.registration_number,
          full_name: student.full_name,
          new_pin: pin,
        });

        successCount++;
        process.stdout.write(`\rProcessed: ${successCount}/${students.length}`);
      } catch (error) {
        errorCount++;
        console.error(`\nError for ${student.registration_number}: ${error.message}`);
      }
    }

    console.log('\n\n✅ PIN regeneration complete!');
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);

    // Output new PINs to a file for distribution
    if (results.length > 0) {
      const fs = require('fs');
      const outputPath = `./scripts/new_pins_${new Date().toISOString().split('T')[0]}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n📄 New PINs saved to: ${outputPath}`);
      console.log('   ⚠️  IMPORTANT: Distribute these PINs to students securely and then DELETE this file!');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Prompt for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('⚠️  WARNING: This will regenerate ALL student PINs!');
console.log('   Students will need new PINs to log in.\n');

rl.question('Type "REGENERATE" to confirm: ', async (answer) => {
  if (answer === 'REGENERATE') {
    await regeneratePins();
  } else {
    console.log('Cancelled.');
  }
  rl.close();
  process.exit(0);
});
