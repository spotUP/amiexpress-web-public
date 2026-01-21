/**
 * Debug test to inspect detected shape vectors
 */

import { getShapeRenderer } from './src/utils/shape-ascii.util';

// Create a vertical line test
function createVerticalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const centerX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Thick vertical line in center
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

// Expose computeShapeVector for debugging by creating a test renderer
const renderer = getShapeRenderer();

// Access private method via prototype (for debugging only)
const computeShapeVector = (renderer as any).computeShapeVector.bind(renderer);
const sampleRegion = (renderer as any).sampleRegion.bind(renderer);

const width = 160;
const height = 120;
const pixels = createVerticalLine(width, height);

const cellWidth = 8;
const cellHeight = 12;
const gridWidth = Math.floor(width / cellWidth);
const gridHeight = Math.floor(height / cellHeight);

console.log('[Debug] Image dimensions:', width, 'x', height);
console.log('[Debug] Grid dimensions:', gridWidth, 'x', gridHeight);
console.log('[Debug] Cell dimensions:', cellWidth, 'x', cellHeight);
console.log('[Debug] Center X pixel:', Math.floor(width / 2));
console.log('[Debug] Center X cell:', Math.floor(width / 2 / cellWidth));
console.log('');

// Test the center cell (where the vertical line should be)
const centerCellX = Math.floor(gridWidth / 2);
const centerCellY = Math.floor(gridHeight / 2);

console.log(`[Debug] Sampling center cell (${centerCellX}, ${centerCellY}):`);
console.log('');

// Sample the 6 internal positions
const samples = [
  { name: 'TL', relX: 0.25, relY: 0.25 },
  { name: 'TR', relX: 0.75, relY: 0.25 },
  { name: 'ML', relX: 0.25, relY: 0.50 },
  { name: 'MR', relX: 0.75, relY: 0.50 },
  { name: 'BL', relX: 0.25, relY: 0.75 },
  { name: 'BR', relX: 0.75, relY: 0.75 },
];

for (const { name, relX, relY } of samples) {
  const value = sampleRegion(
    pixels,
    width,
    height,
    centerCellX,
    centerCellY,
    cellWidth,
    cellHeight,
    relX,
    relY
  );
  const pixelX = Math.floor((centerCellX + relX) * cellWidth);
  const pixelY = Math.floor((centerCellY + relY) * cellHeight);
  console.log(`  ${name} (${relX}, ${relY}) -> pixel (${pixelX}, ${pixelY}): ${value.toFixed(3)}`);
}

console.log('');

// Compute full shape vector WITH directional contrast
console.log('[Debug] WITH directional contrast:');
const shapeVector1 = computeShapeVector(
  pixels,
  width,
  height,
  centerCellX,
  centerCellY,
  cellWidth,
  cellHeight,
  {
    contrastExponent: 2.5,
    directionalContrast: true,
    suppressionFactor: 0.7,
  }
);
console.log('  Shape vector:', shapeVector1.map((v: number) => v.toFixed(3)).join(', '));
console.log('');

// Compute full shape vector WITHOUT directional contrast
console.log('[Debug] WITHOUT directional contrast:');
const shapeVector = computeShapeVector(
  pixels,
  width,
  height,
  centerCellX,
  centerCellY,
  cellWidth,
  cellHeight,
  {
    contrastExponent: 2.5,
    directionalContrast: false,
    suppressionFactor: 0.7,
  }
);

console.log('  Shape vector:', shapeVector.map((v: number) => v.toFixed(3)).join(', '));
console.log('');

// Show expected shape vector for "|" character
console.log('[Debug] Expected shape vector for "|" character:');
console.log('  Pre-computed: [0.40, 0.40, 0.80, 0.80, 0.40, 0.40]');
console.log('  After normalization (max=0.80): [0.50, 0.50, 1.00, 1.00, 0.50, 0.50]');
console.log('');

// Render to see what character is selected (without directional contrast)
const ascii = renderer.render(pixels, width, height, { directionalContrast: false });
const centerLine = ascii.split('\n')[centerCellY];
const centerChar = centerLine.charAt(centerCellX);
console.log('[Debug] Selected character (no directional contrast):', `"${centerChar}"`, `(expected: "|")`);
