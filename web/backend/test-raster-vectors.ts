/**
 * Test to see what vectors our character rasters actually produce
 */

import { getShapeRenderer } from './src/utils/shape-ascii.util';

const renderer = getShapeRenderer();
const db = (renderer as any).shapeDatabase;

console.log('[Test] Character Raster Vectors');
console.log('=================================\n');

// Show vectors for key characters
const testChars = ['|', '[', ']', '(', ')', '/', '\\', '-', '_', 'O', '0', ' ', '.'];

for (const char of testChars) {
  const entry = db.find((e: any) => e.char === char);
  if (entry) {
    const vec = entry.vector.map((v: number) => v.toFixed(3)).join(', ');
    const norm = entry.normalized.map((v: number) => v.toFixed(3)).join(', ');
    console.log(`'${char}' -> raw: [${vec}] normalized: [${norm}]`);
  } else {
    console.log(`'${char}' -> NOT FOUND`);
  }
}

console.log('\n[Test] Expected vertical line vector from test image:');
console.log('Detected: [1.000, 0.000, 1.000, 0.000, 1.000, 0.000]');
console.log('');
console.log('The closest match should be |, not [');
