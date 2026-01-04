#!/usr/bin/env ts-node
/**
 * Test .info file parser
 */

import { parseInfoFile, writeInfoFile, toggleTooltypeComment } from '../utils/info-file.util.js';
import * as path from 'path';

const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const testFile = args.find(a => !a.startsWith('--')) || '~/Code/amiexpress-web/Commands/BBSCmd/j.info';

console.log(`Testing .info parser with: ${testFile}`);
if (writeMode) {
console.log(`[WRITE MODE ENABLED]\n`);
} else {
console.log(`[READ-ONLY MODE]\n`);
}

try {
  // Parse the file
console.log('[1] Parsing .info file...');
  const info = parseInfoFile(testFile);

console.log(`\n[2] Found ${info.tooltypes.length} tooltypes:`);
  for (const tt of info.tooltypes) {
    const status = tt.commented ? '[DISABLED]' : '[ENABLED] ';
console.log(`  ${status} ${tt.key}=${tt.value}`);
  }

console.log(`\n[3] DiskObject size: ${info.diskObject.length} bytes`);
console.log(`[4] Icon data size: ${info.iconData.length} bytes`);
console.log(`[5] Total file size: ${info.rawBuffer.length} bytes`);

  // Test toggle
  const locationTT = info.tooltypes.find(tt => tt.key === 'LOCATION');
  if (locationTT) {
console.log(`\n[6] LOCATION tooltype is currently ${locationTT.commented ? 'DISABLED' : 'ENABLED'}`);
console.log(`    Value: ${locationTT.value}`);

    if (locationTT.commented) {
console.log('\n[7] Would uncomment LOCATION to enable the door');
console.log('    Run with --write flag to actually modify the file');
    }
  }

  if (process.argv.includes('--write')) {
console.log('\n[8] Writing modified file...');

    // Toggle LOCATION
    const modifiedInfo = toggleTooltypeComment(info, 'LOCATION');

    // Create backup first
    const fs = require('fs');
    const backupPath = testFile + '.test-backup';
    fs.copyFileSync(testFile, backupPath);
console.log(`    Backup created: ${backupPath}`);

    // Write modified file
    writeInfoFile(modifiedInfo);
console.log(`    File written: ${testFile}`);

    // Re-parse to verify
    const verifyInfo = parseInfoFile(testFile);
    const verifyTT = verifyInfo.tooltypes.find(tt => tt.key === 'LOCATION');
    if (verifyTT) {
console.log(`\n[9] Verification: LOCATION is now ${verifyTT.commented ? 'DISABLED' : 'ENABLED'}`);
    }
  }

console.log('\n[OK] Test completed successfully');
} catch (error) {
console.error('\n[ERROR] Test failed:', error);
console.error((error as Error).stack);
  process.exit(1);
}
