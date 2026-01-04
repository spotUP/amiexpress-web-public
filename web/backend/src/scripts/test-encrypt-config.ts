/**
 * Test script to encrypt existing bbsConfig credentials
 *
 * This will:
 * 1. Read current bbsConfig.info
 * 2. Extract sensitive fields (SMTP_PASSWORD, etc.)
 * 3. Store them encrypted in the database
 * 4. Verify decryption works
 *
 * Run: npx tsx src/scripts/test-encrypt-config.ts
 */

import * as path from 'path';
import { loadBBSConfig, stripSecretsFromConfigFile } from '../services/bbs-config-file.service';
import { encryptSecret, decryptSecret, isSensitiveField } from '../utils/secrets-encryption.util';
import { db } from '../database';

const BBS_ROOT = path.resolve(__dirname, '../../../..');

async function main() {
console.log('=== Testing Config Encryption ===\n');
console.log(`BBS Root: ${BBS_ROOT}`);

  // 1. Load current bbsConfig.info
console.log('\n1. Loading bbsConfig.info...');
  const config = loadBBSConfig(BBS_ROOT);

  // Show what sensitive fields we found
console.log('\n2. Sensitive fields found:');
  const sensitiveFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && value && isSensitiveField(key)) {
      // Mask the value for display
      const masked = value.length > 4
        ? value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2)
        : '****';
console.log(`   - ${key}: ${masked}`);
      sensitiveFields[key] = value;
    }
  }

  if (Object.keys(sensitiveFields).length === 0) {
console.log('   (no sensitive fields found with values)');
  }

  // 3. Test encryption/decryption
console.log('\n3. Testing encryption/decryption:');
  for (const [key, value] of Object.entries(sensitiveFields)) {
    const encrypted = encryptSecret(value);
    const decrypted = decryptSecret(encrypted);
    const match = decrypted === value;
console.log(`   - ${key}: encrypt/decrypt ${match ? '[OK]' : '[FAIL]'}`);
    if (!match) {
console.log(`     Original: ${value}`);
console.log(`     Decrypted: ${decrypted}`);
    }
  }

  // 4. Store in database
console.log('\n4. Storing encrypted values in database...');
  const configRepo = db.getConfigRepository();

  // Build updates from bbsConfig fields
  const updates: Record<string, any> = {};
  if (config.smtp_server) updates.smtp_server = config.smtp_server;
  if (config.smtp_port) updates.smtp_port = config.smtp_port;
  if (config.smtp_username) updates.smtp_username = config.smtp_username;
  if (config.smtp_password) updates.smtp_password = config.smtp_password;
  if (config.smtp_ssl !== undefined) updates.smtp_ssl = config.smtp_ssl;
  if (config.smtp_from_email) updates.smtp_from_email = config.smtp_from_email;
  if (config.sysop_email) updates.sysop_email = config.sysop_email;
  if (config.bbs_email) updates.bbs_email = config.bbs_email;
  if (config.reg_key) updates.reg_key = config.reg_key;

  if (Object.keys(updates).length > 0) {
    configRepo.updateSystemConfig(updates);
console.log(`   Stored ${Object.keys(updates).length} config values`);
  }

  // 5. Verify database storage
console.log('\n5. Verifying database storage...');
  const dbConfig = configRepo.getSystemConfig();

  // Check that sensitive fields are decrypted correctly
  let allMatch = true;
  if (config.smtp_password && dbConfig) {
    const match = dbConfig.smtp_password === config.smtp_password;
console.log(`   - smtp_password: ${match ? '[OK]' : '[FAIL]'}`);
    if (!match) {
console.log(`     Expected: ${config.smtp_password}`);
console.log(`     Got: ${dbConfig.smtp_password}`);
      allMatch = false;
    }
  }
  if (config.smtp_username && dbConfig) {
    const match = dbConfig.smtp_username === config.smtp_username;
console.log(`   - smtp_username: ${match ? '[OK]' : '[FAIL]'}`);
    if (!match) allMatch = false;
  }
  if (config.reg_key && dbConfig) {
    const match = dbConfig.reg_key === config.reg_key;
console.log(`   - reg_key: ${match ? '[OK]' : '[FAIL]'}`);
    if (!match) allMatch = false;
  }

  // 6. Show raw database value to confirm it's encrypted
console.log('\n6. Raw database check (should show enc:... format):');
  const rawStmt = (db as any).db.prepare('SELECT smtp_password, smtp_username, reg_key FROM system_config WHERE id = 1');
  const rawRow = rawStmt.get() as any;
  if (rawRow) {
    if (rawRow.smtp_password) {
      const isEnc = rawRow.smtp_password.startsWith('enc:');
console.log(`   - smtp_password in DB: ${isEnc ? '[ENCRYPTED]' : '[PLAINTEXT]'}`);
      if (isEnc) {
console.log(`     ${rawRow.smtp_password.slice(0, 60)}...`);
      }
    }
    if (rawRow.smtp_username) {
      const isEnc = rawRow.smtp_username.startsWith('enc:');
console.log(`   - smtp_username in DB: ${isEnc ? '[ENCRYPTED]' : '[PLAINTEXT]'}`);
    }
    if (rawRow.reg_key) {
      const isEnc = rawRow.reg_key.startsWith('enc:');
console.log(`   - reg_key in DB: ${isEnc ? '[ENCRYPTED]' : '[PLAINTEXT]'}`);
    }
  }

console.log('\n=== Test Complete ===');
console.log(`\nResult: ${allMatch ? 'All tests passed!' : 'Some tests failed'}`);

  // Option to strip secrets
  if (process.argv.includes('--strip')) {
console.log('\n--- Stripping secrets from .info files ---');
    const result = stripSecretsFromConfigFile(BBS_ROOT);
    if (result.success) {
console.log(`[OK] Stripped ${result.strippedCount} sensitive fields`);
console.log(`     Backup: ${result.backupPath}`);
    } else {
console.log(`[FAIL] ${result.error}`);
    }
  } else {
console.log('\n--- To also strip secrets from .info files, run with --strip ---');
  }

  process.exit(allMatch ? 0 : 1);
}

main().catch(err => {
console.error('Error:', err);
  process.exit(1);
});
