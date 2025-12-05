/**
 * EXTREME case-insensitivity test - verify ALL characters in filenames
 * Test cases like aMiGa.eXe, amIGA.eXE should find amiga.exe
 */

import * as amigafs from '../../web/backend/src/utils/amigafs';
import * as path from 'path';

const bbsRoot = path.join(__dirname, '..', '..');

console.log('[TEST] EXTREME Case-Insensitivity Test - Every Character\n');

// Test with AquaScan.000 file using EVERY possible case variation
const testCases = [
  'AquaScan.000',     // Original
  'aquascan.000',     // All lowercase
  'AQUASCAN.000',     // All uppercase
  'aQuAscan.000',     // Mixed case 1
  'AqUaScAn.000',     // Mixed case 2
  'aquaSCAN.000',     // Mixed case 3
  'AQUASCAN.000',     // All caps
  'aQuAscan.000',     // Random mix
  'AquaScan.000',     // Original again
  'aMiGa.eXe',        // Example from user (doesn't exist but tests algorithm)
];

console.log('Test 1: Extreme filename variations for AquaScan.000');
console.log('Real file on disk: Doors/aquascan/AquaScan.000\n');

for (const testCase of testCases) {
  const testPath = path.join(bbsRoot, 'Doors', 'aquascan', testCase);
  const exists = amigafs.existsSync(testPath);
  const status = exists ? '[OK]' : '[FAIL]';
  console.log(`  ${status} ${testCase.padEnd(20)} -> ${exists}`);
}

// Test with full path case variations
console.log('\nTest 2: Full path with mixed case in EVERY component');
const extremePaths = [
  'Doors/aquascan/AquaScan.000',       // Original
  'doors/AQUASCAN/aquascan.000',       // All variations
  'DoOrS/aQuAscan/AqUaScAn.000',       // Mixed everything
  'DOORS/AQUASCAN/AQUASCAN.000',       // All caps
  'DoOrs/AquAscan/AqUaScAn.000',       // Random mix
  'dOoRs/aQuAsCaN/aQuAsCaN.000',       // Crazy mix
];

for (const testPath of extremePaths) {
  const fullPath = path.join(bbsRoot, testPath);
  const exists = amigafs.existsSync(fullPath);
  const status = exists ? '[OK]' : '[FAIL]';
  console.log(`  ${status} ${testPath}`);
}

// Test readFile with mixed case
console.log('\nTest 3: Read file with mixed case path');
try {
  const data = amigafs.readFileSync(
    path.join(bbsRoot, 'DoOrS', 'aQuAscan', 'AqUaScAn.000')
  );
  console.log(`  [OK] Successfully read ${data.length} bytes with mixed case path`);
} catch (error: any) {
  console.log(`  [FAIL] ${error.message}`);
}

// Test readdirSync with mixed case
console.log('\nTest 4: List directory with mixed case path');
try {
  const files = amigafs.readdirSync(path.join(bbsRoot, 'DoOrS', 'aQuAscan'));
  console.log(`  [OK] Found ${files.length} files using mixed case directory path`);
} catch (error: any) {
  console.log(`  [FAIL] ${error.message}`);
}

// Test statSync with mixed case
console.log('\nTest 5: Stat file with mixed case');
try {
  const stats = amigafs.statSync(
    path.join(bbsRoot, 'DOORS', 'AQUASCAN', 'aquascan.000')
  );
  console.log(`  [OK] Got stats: ${stats.size} bytes, isFile=${stats.isFile()}`);
} catch (error: any) {
  console.log(`  [FAIL] ${error.message}`);
}

console.log('\n[COMPLETE] If all tests show [OK], then EVERY character is case-insensitive');
