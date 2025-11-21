#!/usr/bin/env node
/**
 * Add "runtime": "client" to SDK Example Doors
 *
 * SDK example doors that use the Door class are client-side doors
 * that run in the browser, not server-side doors with runDoor().
 *
 * This script adds "runtime": "client" to their package.json so
 * the BBS backend knows to execute them as client doors.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const sdkExamplesDir = path.join(projectRoot, 'sdk/doors');

console.log('[CONFIG] Fixing SDK door runtime declarations...\n');

// Get all SDK example doors
const doors = fs.readdirSync(sdkExamplesDir).filter(name => {
  const doorPath = path.join(sdkExamplesDir, name);
  const pkgPath = path.join(doorPath, 'package.json');
  return fs.statSync(doorPath).isDirectory() && fs.existsSync(pkgPath);
});

let fixed = 0;
let skipped = 0;

for (const doorName of doors) {
  try {
    const doorPath = path.join(sdkExamplesDir, doorName);
    const pkgPath = path.join(doorPath, 'package.json');
    const indexPath = path.join(doorPath, 'index.ts');

    // Read package.json
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Check if it's a client door (uses SDK Door class)
    let isClientDoor = false;
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf8');
      // Client doors use: new Door({ ... }) and door.start()
      isClientDoor = content.includes('new Door(') && content.includes('door.start()');
    }

    if (!isClientDoor) {
      console.log(`⚪ ${doorName} - Server-side door (has runDoor export)`);
      skipped++;
      continue;
    }

    // Check if already has runtime field
    if (pkg.runtime === 'client') {
      console.log(`✓ ${doorName} - Already has runtime: client`);
      skipped++;
      continue;
    }

    // Add runtime: client field
    pkg.runtime = 'client';

    // Write back to package.json (preserving formatting)
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    console.log(`[OK] ${doorName} - Added runtime: client`);
    fixed++;

  } catch (error) {
    console.error(`[ERROR] ${doorName} - Error: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`[OK] Fixed: ${fixed}`);
console.log(`⚪ Skipped: ${skipped}`);
console.log('='.repeat(60));

if (fixed > 0) {
  console.log('\n⚡ Restart BBS or type command in BBS terminal to test.');
}
