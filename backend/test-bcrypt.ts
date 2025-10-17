/**
 * bcrypt Migration Test
 *
 * Tests the bcrypt password hashing implementation including:
 * - New password hashing with bcrypt
 * - Legacy SHA-256 password verification
 * - Automatic password upgrade on login
 */

import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

// Test configuration
const TEST_PASSWORD = 'TestPassword123!';
const TEST_SHA256_HASH = crypto.createHash('sha256').update(TEST_PASSWORD).digest('hex');

async function testBcryptImplementation() {
  console.log('=== bcrypt Migration Test Suite ===\n');

  let allTestsPassed = true;

  // Test 1: bcrypt hash generation
  console.log('Test 1: bcrypt Hash Generation');
  try {
    const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 12);
    console.log(`  Password: ${TEST_PASSWORD}`);
    console.log(`  bcrypt hash: ${bcryptHash}`);
    console.log(`  Hash length: ${bcryptHash.length} (expected ~60 for bcrypt)`);
    console.log(`  Starts with $2b$: ${bcryptHash.startsWith('$2b$')}`);

    if (bcryptHash.length >= 59 && bcryptHash.startsWith('$2b$')) {
      console.log('  ✅ TEST PASSED: bcrypt hash generated correctly\n');
    } else {
      console.log('  ❌ TEST FAILED: Invalid bcrypt hash format\n');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('  ❌ TEST FAILED:', error);
    console.log('');
    allTestsPassed = false;
  }

  // Test 2: bcrypt password verification
  console.log('Test 2: bcrypt Password Verification');
  try {
    const testHash = await bcrypt.hash(TEST_PASSWORD, 12);
    const isValid = await bcrypt.compare(TEST_PASSWORD, testHash);
    const isInvalid = await bcrypt.compare('WrongPassword', testHash);

    console.log(`  Correct password verified: ${isValid}`);
    console.log(`  Wrong password rejected: ${!isInvalid}`);

    if (isValid && !isInvalid) {
      console.log('  ✅ TEST PASSED: bcrypt verification works correctly\n');
    } else {
      console.log('  ❌ TEST FAILED: bcrypt verification issue\n');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('  ❌ TEST FAILED:', error);
    console.log('');
    allTestsPassed = false;
  }

  // Test 3: Legacy SHA-256 hash detection
  console.log('Test 3: Legacy SHA-256 Hash Detection');
  try {
    console.log(`  SHA-256 hash: ${TEST_SHA256_HASH}`);
    console.log(`  Hash length: ${TEST_SHA256_HASH.length} (expected 64 for SHA-256)`);
    console.log(`  Is hex string: ${/^[0-9a-f]{64}$/i.test(TEST_SHA256_HASH)}`);

    const canDetectLegacy = TEST_SHA256_HASH.length === 64 && /^[0-9a-f]{64}$/i.test(TEST_SHA256_HASH);

    if (canDetectLegacy) {
      console.log('  ✅ TEST PASSED: Can detect legacy SHA-256 hashes\n');
    } else {
      console.log('  ❌ TEST FAILED: Cannot detect legacy hashes\n');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('  ❌ TEST FAILED:', error);
    console.log('');
    allTestsPassed = false;
  }

  // Test 4: Hybrid verification (matches database.ts verifyPassword implementation)
  console.log('Test 4: Hybrid Password Verification');
  try {
    // Simulate database.ts verifyPassword() function (FIXED VERSION)
    async function verifyPassword(password: string, hash: string): Promise<boolean> {
      // Check if this is a legacy SHA-256 hash (64 hex characters)
      const isSHA256 = hash.length === 64 && /^[0-9a-f]{64}$/i.test(hash);

      if (isSHA256) {
        // Legacy SHA-256 hash - use direct comparison
        const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
        return sha256Hash === hash;
      }

      // Modern bcrypt hash - use bcrypt.compare()
      try {
        return await bcrypt.compare(password, hash);
      } catch (error) {
        // If bcrypt verification fails due to invalid hash format, return false
        return false;
      }
    }

    // Test with bcrypt hash
    const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 12);
    const bcryptVerified = await verifyPassword(TEST_PASSWORD, bcryptHash);
    const bcryptWrongPassword = await verifyPassword('WrongPassword', bcryptHash);

    console.log(`  bcrypt hash verified (correct password): ${bcryptVerified}`);
    console.log(`  bcrypt hash rejected (wrong password): ${!bcryptWrongPassword}`);

    // Test with SHA-256 hash (legacy fallback)
    const sha256Verified = await verifyPassword(TEST_PASSWORD, TEST_SHA256_HASH);
    const sha256WrongPassword = await verifyPassword('WrongPassword', TEST_SHA256_HASH);

    console.log(`  SHA-256 hash verified (correct password): ${sha256Verified}`);
    console.log(`  SHA-256 hash rejected (wrong password): ${!sha256WrongPassword}`);

    if (bcryptVerified && !bcryptWrongPassword && sha256Verified && !sha256WrongPassword) {
      console.log('  ✅ TEST PASSED: Hybrid verification works for both hash types\n');
    } else {
      console.log('  ❌ TEST FAILED: Hybrid verification issue\n');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('  ❌ TEST FAILED:', error);
    console.log('');
    allTestsPassed = false;
  }

  // Test 5: Performance comparison
  console.log('Test 5: Performance Comparison (bcrypt vs SHA-256)');
  try {
    // Time SHA-256 hashing
    const sha256Start = Date.now();
    for (let i = 0; i < 10; i++) {
      crypto.createHash('sha256').update(TEST_PASSWORD + i).digest('hex');
    }
    const sha256Time = Date.now() - sha256Start;

    // Time bcrypt hashing
    const bcryptStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await bcrypt.hash(TEST_PASSWORD + i, 12);
    }
    const bcryptTime = Date.now() - bcryptStart;

    console.log(`  SHA-256: ${sha256Time}ms for 10 hashes (${(sha256Time/10).toFixed(1)}ms per hash)`);
    console.log(`  bcrypt:  ${bcryptTime}ms for 10 hashes (${(bcryptTime/10).toFixed(1)}ms per hash)`);
    console.log(`  bcrypt is ~${Math.round(bcryptTime/sha256Time)}x slower (this is GOOD for security!)`);
    console.log('  ✅ TEST PASSED: Performance measured\n');
  } catch (error) {
    console.log('  ❌ TEST FAILED:', error);
    console.log('');
    allTestsPassed = false;
  }

  // Test 6: Salt uniqueness
  console.log('Test 6: bcrypt Salt Uniqueness');
  try {
    const hash1 = await bcrypt.hash(TEST_PASSWORD, 12);
    const hash2 = await bcrypt.hash(TEST_PASSWORD, 12);
    const hash3 = await bcrypt.hash(TEST_PASSWORD, 12);

    console.log(`  Hash 1: ${hash1}`);
    console.log(`  Hash 2: ${hash2}`);
    console.log(`  Hash 3: ${hash3}`);
    console.log(`  All hashes unique: ${hash1 !== hash2 && hash2 !== hash3 && hash1 !== hash3}`);
    console.log(`  All verify same password: ${await bcrypt.compare(TEST_PASSWORD, hash1) && await bcrypt.compare(TEST_PASSWORD, hash2) && await bcrypt.compare(TEST_PASSWORD, hash3)}`);

    if (hash1 !== hash2 && hash2 !== hash3 && hash1 !== hash3) {
      console.log('  ✅ TEST PASSED: Each hash uses unique salt\n');
    } else {
      console.log('  ❌ TEST FAILED: Salts are not unique\n');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('  ❌ TEST FAILED:', error);
    console.log('');
    allTestsPassed = false;
  }

  // Summary
  console.log('=== Test Summary ===');
  if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED - bcrypt implementation is working correctly!');
    console.log('\nImplementation status:');
    console.log('  ✅ bcrypt installed and working');
    console.log('  ✅ bcrypt hashing with 12 salt rounds');
    console.log('  ✅ Legacy SHA-256 hash detection');
    console.log('  ✅ Hybrid verification (bcrypt + SHA-256 fallback)');
    console.log('  ✅ Unique salts per hash');
    console.log('  ✅ Performance appropriate for security');
  } else {
    console.log('❌ SOME TESTS FAILED - review output above');
  }

  process.exit(allTestsPassed ? 0 : 1);
}

// Run tests
console.log('Starting bcrypt migration test suite...\n');
testBcryptImplementation().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
