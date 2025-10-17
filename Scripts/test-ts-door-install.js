#!/usr/bin/env node
/**
 * Test script for TypeScript door installation
 */

const path = require('path');
const { getAmigaDoorManager } = require('../backend/dist/doors/amigaDoorManager.js');

async function testTypeScriptDoorInstallation() {
  console.log('=== TypeScript Door Installation Test ===\n');

  const archivePath = path.join(__dirname, '../backend/doors/archives/hello-door.zip');
  const manager = getAmigaDoorManager();

  console.log('1. Analyzing archive...');
  const analysis = manager.analyzeDoorArchive(archivePath);

  if (analysis) {
    console.log(`   ✓ Archive: ${analysis.filename}`);
    console.log(`   ✓ Format: ${analysis.format}`);
    console.log(`   ✓ Files: ${analysis.files.length}`);
    console.log(`   ✓ Is TypeScript Door: ${analysis.isTypeScriptDoor ? 'YES' : 'NO'}`);

    if (analysis.packageJson) {
      console.log(`   ✓ Door Name: ${analysis.packageJson.name}`);
      console.log(`   ✓ Version: ${analysis.packageJson.version}`);
      console.log(`   ✓ Description: ${analysis.packageJson.description}`);
    }
    console.log('');
  } else {
    console.error('   ✗ Failed to analyze archive');
    return;
  }

  console.log('2. Installing TypeScript door...');
  const result = await manager.installDoor(archivePath);

  if (result.success) {
    console.log(`   ✓ ${result.message}`);

    if (result.doorPath) {
      console.log(`   ✓ Installed to: ${result.doorPath}`);
    }
  } else {
    console.error(`   ✗ ${result.message}`);
    return;
  }

  console.log('\n3. Scanning TypeScript doors...');
  const typeScriptDoors = await manager.scanTypeScriptDoors();

  console.log(`   ✓ Found ${typeScriptDoors.length} TypeScript door(s)`);

  for (const door of typeScriptDoors) {
    console.log(`\n   Door: ${door.name}`);
    console.log(`   - Display Name: ${door.displayName}`);
    console.log(`   - Description: ${door.description}`);
    console.log(`   - Version: ${door.version}`);
    console.log(`   - Author: ${door.author}`);
    console.log(`   - Main: ${door.main}`);
    console.log(`   - Path: ${door.path}`);
    console.log(`   - Installed: ${door.installed ? '✓' : '✗'}`);
  }

  console.log('\n=== Test Complete ===');
  process.exit(0);
}

testTypeScriptDoorInstallation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
