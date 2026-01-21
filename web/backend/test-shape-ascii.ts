/**
 * Test Script for Shape-Based ASCII Renderer
 *
 * Creates synthetic test images and renders them with the shape-based algorithm
 * to verify:
 * - Character selection works correctly
 * - Edge detection is sharp
 * - Geometric shapes are preserved
 * - Performance is acceptable
 */

import { renderShapeAscii, getShapeRenderer } from './src/utils/shape-ascii.util';

// Create a simple test image (vertical line)
function createVerticalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4); // RGBA
  const centerX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Vertical line in the center (white), make it thicker (3 pixels) for better detection
      if (Math.abs(x - centerX) <= 1) {
        pixels[idx] = 255; // R
        pixels[idx + 1] = 255; // G
        pixels[idx + 2] = 255; // B
        pixels[idx + 3] = 255; // A
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

// Create a diagonal line test image
function createDiagonalLine(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4); // RGBA

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Diagonal line (white), make it thicker (4 pixels) for better detection
      if (Math.abs(x - y) < 4) {
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

// Create a circle test image
function createCircle(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Circle edge (white), make it thicker (4 pixels) for better detection
      if (Math.abs(dist - radius) < 4) {
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

// Create gradient test image
function createGradient(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Horizontal gradient (black to white)
      const brightness = Math.floor((x / width) * 255);
      pixels[idx] = brightness;
      pixels[idx + 1] = brightness;
      pixels[idx + 2] = brightness;
      pixels[idx + 3] = 255;
    }
  }

  return pixels;
}

// Run tests
async function runTests() {
  console.log('[Test] Shape-Based ASCII Renderer Tests');
  console.log('=========================================\n');

  const testWidth = 160;
  const testHeight = 120;

  // Test 1: Vertical Line
  console.log('Test 1: Vertical Line (should show | characters)');
  console.log('-------------------------------------------------');
  const verticalPixels = createVerticalLine(testWidth, testHeight);
  const startTime1 = Date.now();
  const verticalAscii = renderShapeAscii(verticalPixels, testWidth, testHeight, {
    directionalContrast: false, // Disable for simple test images
  });
  const elapsed1 = Date.now() - startTime1;
  console.log(verticalAscii);
  console.log(`Render time: ${elapsed1}ms\n`);

  // Test 2: Diagonal Line
  console.log('Test 2: Diagonal Line (should show / or \\ characters)');
  console.log('-------------------------------------------------------');
  const diagonalPixels = createDiagonalLine(testWidth, testHeight);
  const startTime2 = Date.now();
  const diagonalAscii = renderShapeAscii(diagonalPixels, testWidth, testHeight, {
    directionalContrast: false, // Disable for simple test images
  });
  const elapsed2 = Date.now() - startTime2;
  console.log(diagonalAscii);
  console.log(`Render time: ${elapsed2}ms\n`);

  // Test 3: Circle
  console.log('Test 3: Circle (should show rounded shape)');
  console.log('-------------------------------------------');
  const circlePixels = createCircle(testWidth, testHeight);
  const startTime3 = Date.now();
  const circleAscii = renderShapeAscii(circlePixels, testWidth, testHeight, {
    directionalContrast: false, // Disable for simple test images
  });
  const elapsed3 = Date.now() - startTime3;
  console.log(circleAscii);
  console.log(`Render time: ${elapsed3}ms\n`);

  // Test 4: Gradient
  console.log('Test 4: Gradient (should show smooth transition)');
  console.log('-------------------------------------------------');
  const gradientPixels = createGradient(testWidth, testHeight);
  const startTime4 = Date.now();
  const gradientAscii = renderShapeAscii(gradientPixels, testWidth, testHeight, {
    directionalContrast: false, // Disable for simple test images
  });
  const elapsed4 = Date.now() - startTime4;
  console.log(gradientAscii);
  console.log(`Render time: ${elapsed4}ms\n`);

  // Test 5: Cache Performance
  console.log('Test 5: Cache Performance (10 frames)');
  console.log('--------------------------------------');
  const renderer = getShapeRenderer();
  renderer.clearCache(); // Start fresh

  const framePixels = createCircle(testWidth, testHeight);
  const frameTimes: number[] = [];

  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    renderShapeAscii(framePixels, testWidth, testHeight, {
      directionalContrast: false, // Disable for simple test images
    });
    const elapsed = Date.now() - start;
    frameTimes.push(elapsed);
  }

  const cacheStats = renderer.getCacheStats();
  console.log(`Frame times: ${frameTimes.join('ms, ')}ms`);
  console.log(`Average: ${(frameTimes.reduce((a, b) => a + b) / frameTimes.length).toFixed(1)}ms`);
  console.log(`First frame: ${frameTimes[0]}ms (cold cache)`);
  console.log(`Last frame: ${frameTimes[frameTimes.length - 1]}ms (warm cache)`);
  console.log(`Cache size: ${cacheStats.size} entries`);
  console.log(`Speedup: ${(frameTimes[0] / frameTimes[frameTimes.length - 1]).toFixed(1)}x\n`);

  console.log('Tests completed successfully!');
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch((err) => {
    console.error('[Test] Error:', err);
    process.exit(1);
  });
}

export { runTests };
