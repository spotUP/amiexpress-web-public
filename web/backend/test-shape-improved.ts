/**
 * Improved test with properly positioned geometric shapes
 */

import { renderShapeAscii } from './src/utils/shape-ascii.util';

// Create a CENTERED vertical line (for | character)
function createCenteredVerticalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Vertical line at pixels 3-4 (CENTER of 8-pixel cell)
      const cellX = x % 8;
      const isLine = (cellX >= 3 && cellX <= 4);

      if (isLine) {
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

// Create horizontal line (for - character)
function createHorizontalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Horizontal line at rows 5-6 (CENTER of 12-pixel cell)
      const cellY = y % 12;
      const isLine = (cellY >= 5 && cellY <= 6);

      if (isLine) {
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

// Create diagonal (for / character)
function createDiagonalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Diagonal line (upward slash: bottom-left to top-right)
      const cellX = x % 8;
      const cellY = y % 12;
      // y decreases as x increases
      const expectedX = 7 - (cellY * 8 / 12);
      const isLine = Math.abs(cellX - expectedX) < 1.5;

      if (isLine) {
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

// Run tests
async function runTests() {
  console.log('[Improved Test] Shape-Based ASCII Renderer');
  console.log('===========================================\n');

  const testWidth = 160;
  const testHeight = 120;

  // Test 1: CENTERED vertical line (should show |)
  console.log('Test 1: Centered Vertical Line (should show | characters)');
  console.log('-----------------------------------------------------------');
  const verticalPixels = createCenteredVerticalLine(testWidth, testHeight);
  const verticalAscii = renderShapeAscii(verticalPixels, testWidth, testHeight, {
    directionalContrast: false,
  });
  console.log(verticalAscii);
  const verticalCheck = verticalAscii.includes('|');
  console.log(`✓ Contains '|': ${verticalCheck}\n`);

  // Test 2: Horizontal line (should show -)
  console.log('Test 2: Horizontal Line (should show - characters)');
  console.log('----------------------------------------------------');
  const horizontalPixels = createHorizontalLine(testWidth, testHeight);
  const horizontalAscii = renderShapeAscii(horizontalPixels, testWidth, testHeight, {
    directionalContrast: false,
  });
  console.log(horizontalAscii);
  const horizontalCheck = horizontalAscii.includes('-');
  console.log(`✓ Contains '-': ${horizontalCheck}\n`);

  // Test 3: Diagonal line (should show / or \\)
  console.log('Test 3: Diagonal Line (should show / characters)');
  console.log('--------------------------------------------------');
  const diagonalPixels = createDiagonalLine(testWidth, testHeight);
  const diagonalAscii = renderShapeAscii(diagonalPixels, testWidth, testHeight, {
    directionalContrast: false,
  });
  console.log(diagonalAscii);
  const diagonalCheck = diagonalAscii.includes('/') || diagonalAscii.includes('\\');
  console.log(`✓ Contains '/' or '\\\\': ${diagonalCheck}\n`);

  // Summary
  console.log('===========================================');
  if (verticalCheck && horizontalCheck && diagonalCheck) {
    console.log('✅ ALL TESTS PASSED!');
    console.log('Shape-based rendering correctly identifies geometric patterns!');
  } else {
    console.log('⚠️  Some tests failed - review output above');
  }
}

runTests().catch(console.error);
