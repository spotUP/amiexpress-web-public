/**
 * Visualize the actual pixel layout of test images
 */

// Create vertical line (same as test)
function createVerticalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const centerX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      if (Math.abs(x - centerX) <= 1) {
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = 255;
      } else {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 255;
      }
    }
  }

  return pixels;
}

const width = 160;
const height = 120;
const pixels = createVerticalLine(width, height);

console.log('[Visualization] Test Image Pixel Layout');
console.log('========================================\n');

// Show one 8x12 cell from the center
const centerCellX = Math.floor(width / 2 / 8);
const centerCellY = Math.floor(height / 2 / 12);

console.log(`Center cell: grid (${centerCellX}, ${centerCellY})`);
console.log(`Pixel range: x=${centerCellX * 8}-${centerCellX * 8 + 7}, y=${centerCellY * 12}-${centerCellY * 12 + 11}\n`);

const startX = centerCellX * 8;
const startY = centerCellY * 12;

console.log('Cell pixels (# = white, . = black):\n');
for (let y = 0; y < 12; y++) {
  let line = '';
  for (let x = 0; x < 8; x++) {
    const idx = ((startY + y) * width + (startX + x)) * 4;
    const val = pixels[idx];
    line += val > 127 ? '#' : '.';
  }
  console.log(`  ${line}`);
}

console.log('\nExpected shape vector for this pattern:');
console.log('TL (x~2, y~3): left side, should detect line = 1.0');
console.log('TR (x~6, y~3): right side, no line = 0.0');
console.log('Result: [1,0,1,0,1,0] which matches "[" character\n');

console.log('This is CORRECT behavior! The line is positioned LEFT in the cell.');
console.log('If we want "|", the line should be CENTERED (pixels 3-4).');
console.log('If we want "]", the line should be RIGHT (pixels 5-6).\n');

console.log('Shape-based rendering is position-aware, which is the whole point!');
