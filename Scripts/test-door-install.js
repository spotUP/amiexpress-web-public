#!/usr/bin/env node
/**
 * Test script for AmigaDoorManager installation
 *
 * Tests door installation with CAL-WEEK.LHA
 */

const path = require('path');
const { getAmigaDoorManager } = require('../backend/dist/doors/amigaDoorManager.js');

async function testDoorInstallation() {
  console.log('=== Amiga Door Manager Installation Test ===\n');

  const archivePath = path.join(__dirname, '../backend/doors/archives/CAL-WEEK.LHA');
  const manager = getAmigaDoorManager();

  console.log('1. Analyzing archive...');
  const analysis = manager.analyzeDoorArchive(archivePath);

  if (analysis) {
    console.log(`   ✓ Archive: ${analysis.filename}`);
    console.log(`   ✓ Format: ${analysis.format}`);
    console.log(`   ✓ Files: ${analysis.files.length}`);
    console.log(`   ✓ .info files: ${analysis.infoFiles.length}`);
    console.log(`   ✓ Executables: ${analysis.executables.length}\n`);
  } else {
    console.error('   ✗ Failed to analyze archive');
    return;
  }

  console.log('2. Installing door...');
  const result = await manager.installDoor(archivePath);

  if (result.success) {
    console.log(`   ✓ ${result.message}`);

    if (result.door) {
      console.log('\n   Door Details:');
      console.log(`   - Command: ${result.door.command}`);
      console.log(`   - Location: ${result.door.location}`);
      console.log(`   - Type: ${result.door.type}`);
      console.log(`   - Access: ${result.door.access}`);
      console.log(`   - Installed: ${result.door.installed ? 'YES' : 'NO'}`);
    }
  } else {
    console.error(`   ✗ ${result.message}`);
    return;
  }

  console.log('\n3. Scanning installed doors...');
  const installedDoors = await manager.scanInstalledDoors();

  console.log(`   ✓ Found ${installedDoors.length} installed door(s)`);

  for (const door of installedDoors) {
    console.log(`\n   Door: ${door.command}`);
    console.log(`   - Name: ${door.name || '(none)'}`);
    console.log(`   - Location: ${door.location}`);
    console.log(`   - Resolved: ${door.resolvedPath}`);
    console.log(`   - Type: ${door.type}`);
    console.log(`   - Access: ${door.access}`);
    console.log(`   - Installed: ${door.installed ? '✓' : '✗'}`);
  }

  console.log('\n=== Test Complete ===');
  process.exit(0);
}

testDoorInstallation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
