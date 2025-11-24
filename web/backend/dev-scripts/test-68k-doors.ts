#!/usr/bin/env node

/**
 * Test 68K Door Execution Pipeline
 * Tests the B, WHO, and RTW doors mentioned in documentation
 */

const { getAmigaDoorManager } = require('./src/doors/amigaDoorManager');
const { loadCommands } = require('./src/handlers/command-execution.handler');
const path = require('path');

async function test68KDoors() {
  console.log('🧪 Testing 68K Door Execution Pipeline');
  console.log('='.repeat(50));

  try {
    // 1. Test Amiga Door Manager scanning
    console.log('\n1️⃣ Testing AmigaDoorManager.scanInstalledDoors()...');
    const manager = getAmigaDoorManager(process.cwd());
    const doors = await manager.scanInstalledDoors();
    
    console.log(`Found ${doors.length} doors:`);
    doors.forEach(door => {
      console.log(`  ${door.command}: ${door.type} @ ${door.resolvedPath} (${door.installed ? 'INSTALLED' : 'MISSING'})`);
    });

    // 2. Check for specific doors mentioned in documentation
    const targetDoors = ['B', 'WHO', 'RTW'];
    console.log('\n2️⃣ Checking target doors from documentation...');
    
    targetDoors.forEach(cmd => {
      const door = doors.find(d => d.command.toLowerCase() === cmd.toLowerCase());
      if (door) {
        console.log(`  ✅ ${cmd} door found: ${door.type}, ${door.installed ? 'INSTALLED' : 'MISSING'}`);
        console.log(`     Location: ${door.location}`);
        console.log(`     Resolved: ${door.resolvedPath}`);
      } else {
        console.log(`  ❌ ${cmd} door NOT found in scan`);
      }
    });

    // 3. Test command cache loading
    console.log('\n3️⃣ Testing command cache loading...');
    loadCommands(process.cwd(), 1, 0);
    
    const { getCommandCache } = require('../src/handlers/command-execution.handler');
    const cache = getCommandCache();
    
    console.log(`Loaded ${cache.bbscmd.length} BBS commands:`);
    targetDoors.forEach(cmd => {
      const found = cache.bbscmd.find(([name]) => name.toLowerCase() === cmd.toLowerCase());
      if (found) {
        console.log(`  ✅ ${cmd} in command cache: ${found[1].type} @ ${found[1].location}`);
      } else {
        console.log(`  ❌ ${cmd} NOT in command cache`);
      }
    });

    // 4. Check if door executables exist
    console.log('\n4️⃣ Verifying door executables exist...');
    const fs = require('fs');
    
    targetDoors.forEach(cmd => {
      const door = doors.find(d => d.command.toLowerCase() === cmd.toLowerCase());
      if (door) {
        const exists = fs.existsSync(door.resolvedPath);
        console.log(`  ${cmd}: ${exists ? '✅' : '❌'} ${door.resolvedPath}`);
        
        if (!exists) {
          // Try alternate locations
          const altPaths = [
            path.join(process.cwd(), 'Doors', cmd.toLowerCase(), cmd.toLowerCase()),
            path.join(process.cwd(), 'Doors', cmd, cmd),
            path.join(process.cwd(), 'Doors', cmd.toUpperCase(), cmd.toUpperCase())
          ];
          
          altPaths.forEach(altPath => {
            if (fs.existsSync(altPath)) {
              console.log(`     Found at alternate path: ${altPath}`);
            }
          });
        }
      }
    });

    console.log('\n' + '='.repeat(50));
    console.log('✅ 68K Door test completed');
    
    return {
      doorsFound: doors.length,
      targetDoorsFound: targetDoors.filter(cmd => 
        doors.find(d => d.command.toLowerCase() === cmd.toLowerCase())
      ).length,
      commandsInCache: cache.bbscmd.length
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return { error: error.message };
  }
}

// Run test if called directly
if (require.main === module) {
  test68KDoors().then(result => {
    console.log('\n📊 Test Results:', result);
    process.exit(0);
  }).catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { test68KDoors };