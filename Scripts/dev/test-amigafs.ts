/**
 * Test case-insensitive file operations with amigafs module
 */

import * as amigafs from '../../web/backend/src/utils/amigafs';
import * as path from 'path';

const bbsRoot = path.join(__dirname, '..', '..');

console.log('[TEST] AmigaFS Case-Insensitivity Test\n');

// Test 1: Directory with capital D
console.log('Test 1: Doors directory (capital D)');
const doorsPath1 = path.join(bbsRoot, 'Doors');
const doorsPath2 = path.join(bbsRoot, 'doors');
const doorsPath3 = path.join(bbsRoot, 'DOORS');

console.log(`  Checking: ${doorsPath1}`);
console.log(`  Exists: ${amigafs.existsSync(doorsPath1)}`);

console.log(`  Checking: ${doorsPath2}`);
console.log(`  Exists: ${amigafs.existsSync(doorsPath2)}`);

console.log(`  Checking: ${doorsPath3}`);
console.log(`  Exists: ${amigafs.existsSync(doorsPath3)}`);

// Test 2: AquaScan directory
console.log('\nTest 2: AquaScan directory');
const aquascanPath1 = path.join(bbsRoot, 'Doors', 'aquascan');
const aquascanPath2 = path.join(bbsRoot, 'doors', 'AquaScan');
const aquascanPath3 = path.join(bbsRoot, 'DOORS', 'AQUASCAN');

console.log(`  Checking: ${aquascanPath1}`);
console.log(`  Exists: ${amigafs.existsSync(aquascanPath1)}`);

console.log(`  Checking: ${aquascanPath2}`);
console.log(`  Exists: ${amigafs.existsSync(aquascanPath2)}`);

console.log(`  Checking: ${aquascanPath3}`);
console.log(`  Exists: ${amigafs.existsSync(aquascanPath3)}`);

// Test 3: AquaScan binary
console.log('\nTest 3: AquaScan binary (AquaScan.000)');
const binaryPath1 = path.join(bbsRoot, 'Doors', 'aquascan', 'AquaScan.000');
const binaryPath2 = path.join(bbsRoot, 'doors', 'aquascan', 'aquascan.000');
const binaryPath3 = path.join(bbsRoot, 'DOORS', 'AQUASCAN', 'AQUASCAN.000');

console.log(`  Checking: ${binaryPath1}`);
console.log(`  Exists: ${amigafs.existsSync(binaryPath1)}`);

console.log(`  Checking: ${binaryPath2}`);
console.log(`  Exists: ${amigafs.existsSync(binaryPath2)}`);

console.log(`  Checking: ${binaryPath3}`);
console.log(`  Exists: ${amigafs.existsSync(binaryPath3)}`);

// Test 4: Read directory with case variations
console.log('\nTest 4: Read directory contents');
try {
  const files = amigafs.readdirSync(path.join(bbsRoot, 'doors', 'aquascan'));
  console.log(`  Found ${files.length} files in doors/aquascan (lowercase)`);
  console.log(`  Files: ${files.slice(0, 5).join(', ')}...`);
} catch (error: any) {
  console.log(`  ERROR: ${error.message}`);
}

console.log('\n[OK] Test complete');
