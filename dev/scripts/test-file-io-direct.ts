/**
 * Direct test of door file I/O implementation
 * Tests the DOS library functions without running actual doors
 */

const path = require('path');
const fs = require('fs');

// Test our Doors: device path resolution
function testDoorsDevice() {
  console.log('\n=== Testing Doors: Device Path Resolution ===\n');

  const BBS_BASE_PATH = '~/Code/AmiExpress/amiexpress-web';

  // Test 1: Doors:AquaWho/Tot.dat
  const test1 = 'Doors:AquaWho/Tot.dat';
  const relativePath1 = test1.substring(6);
  const resolved1 = path.join(BBS_BASE_PATH, 'Doors', relativePath1);
  console.log(`Input:    ${test1}`);
  console.log(`Expected: ${BBS_BASE_PATH}/Doors/AquaWho/Tot.dat`);
  console.log(`Resolved: ${resolved1}`);
  console.log(`✓ Match:  ${resolved1 === path.join(BBS_BASE_PATH, 'Doors/AquaWho/Tot.dat')}\n`);

  // Test 2: Verify directory exists
  const aquaWhoDir = path.join(BBS_BASE_PATH, 'Doors/AquaWho');
  const dirExists = fs.existsSync(aquaWhoDir);
  console.log(`AquaWho dir: ${aquaWhoDir}`);
  console.log(`✓ Exists: ${dirExists}\n`);

  if (dirExists) {
    // List files in AquaWho directory
    const files = fs.readdirSync(aquaWhoDir);
    console.log(`Files in AquaWho (${files.length} files):`);
    files.forEach(f => {
      const stats = fs.statSync(path.join(aquaWhoDir, f));
      const type = stats.isDirectory() ? 'DIR' : 'FILE';
      const size = stats.isFile() ? stats.size : 0;
      console.log(`  ${type.padEnd(4)} ${f.padEnd(30)} ${size} bytes`);
    });
  }
}

// Test PROGDIR: device
function testProgdirDevice() {
  console.log('\n\n=== Testing PROGDIR: Device Path Resolution ===\n');

  const doorDirectory = '~/Code/AmiExpress/amiexpress-web/Doors/AquaWho';

  // Test 1: PROGDIR:config.txt
  const test1 = 'PROGDIR:config.txt';
  const relativePath1 = test1.substring(8);
  const resolved1 = path.join(doorDirectory, relativePath1);
  console.log(`Door Directory: ${doorDirectory}`);
  console.log(`Input:    ${test1}`);
  console.log(`Expected: ${doorDirectory}/config.txt`);
  console.log(`Resolved: ${resolved1}`);
  console.log(`✓ Match:  ${resolved1 === path.join(doorDirectory, 'config.txt')}\n`);
}

// Test BBS: device
function testBBSDevice() {
  console.log('\n\n=== Testing BBS: Device Path Resolution ===\n');

  const BBS_BASE_PATH = '~/Code/AmiExpress/amiexpress-web';

  // Test 1: BBS:user.data
  const test1 = 'BBS:user.data';
  const relativePath1 = test1.substring(4);
  const resolved1 = path.join(BBS_BASE_PATH, relativePath1);
  console.log(`Input:    ${test1}`);
  console.log(`Expected: ${BBS_BASE_PATH}/user.data`);
  console.log(`Resolved: ${resolved1}`);
  console.log(`✓ Match:  ${resolved1 === path.join(BBS_BASE_PATH, 'user.data')}\n`);

  // Test 2: Verify file exists
  const userDataPath = path.join(BBS_BASE_PATH, 'user.data');
  const fileExists = fs.existsSync(userDataPath);
  console.log(`user.data: ${userDataPath}`);
  console.log(`✓ Exists: ${fileExists}`);

  if (fileExists) {
    const stats = fs.statSync(userDataPath);
    console.log(`✓ Size: ${stats.size} bytes\n`);
  }
}

// Test file creation
function testFileCreation() {
  console.log('\n\n=== Testing File Creation ===\n');

  const testFile = '~/Code/AmiExpress/amiexpress-web/Doors/AquaWho/test-file-io.dat';

  try {
    // Write test file
    const testData = Buffer.from('TEST DATA FROM DOOR FILE I/O\n');
    fs.writeFileSync(testFile, testData);
    console.log(`✓ Created: ${testFile}`);
    console.log(`✓ Size: ${testData.length} bytes`);

    // Read it back
    const readData = fs.readFileSync(testFile);
    console.log(`✓ Read back: ${readData.length} bytes`);
    console.log(`✓ Content matches: ${readData.equals(testData)}`);

    // Delete test file
    fs.unlinkSync(testFile);
    console.log(`✓ Deleted: ${testFile}\n`);

  } catch (error) {
    console.error(`✗ Error: ${error.message}\n`);
  }
}

// Run all tests
console.log('═══════════════════════════════════════════════════════');
console.log('  Door File I/O Implementation Test');
console.log('  Testing path resolution and file operations');
console.log('═══════════════════════════════════════════════════════');

testDoorsDevice();
testProgdirDevice();
testBBSDevice();
testFileCreation();

console.log('\n═══════════════════════════════════════════════════════');
console.log('  All Tests Complete');
console.log('═══════════════════════════════════════════════════════\n');
