# ASCII Video Enhancement Guide

## Overview

This document describes the comprehensive enhancements to the ASCII video conversion algorithm to achieve stunning, high-quality ASCII art from webcam streams.

## Current Implementation Analysis

### Strengths
- Two rendering modes: half-block (2x vertical resolution) and ASCII character mode
- Auto-gain normalization (adapts to lighting conditions)
- 16-color ANSI palette support
- Gamma correction for midtone boost

### Weaknesses
1. **No spatial processing** - Each pixel processed independently
2. **No dithering** - Banding in gradients
3. **Poor edge preservation** - Faces blur together
4. **Simplistic color quantization** - RGB Euclidean distance
5. **No temporal smoothing** - Flicker between frames
6. **Generic character set** - Not perceptually calibrated
7. **No local contrast enhancement** - Uniform treatment

## Enhancement Strategy

### 1. Perceptually-Calibrated Character Set

**Problem**: Current charset ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$' uses ASCII ordering, not perceptual luminance.

**Solution**: Use characters calibrated by actual visual weight (area coverage):

```
' .`-_\',^"~:;!>+<i|?/\\Il1)({}[]rtfjxnuvcz*XYUJCFLQ0OoZmwqpbdkhao#MW&8%N@$'
```

**Why**: Characters like 'o' vs 'O' have different visual weights. Proper ordering prevents false edges.

### 2. Edge Detection & Sharpening

**Problem**: Important features (eyes, nose, mouth) blur together.

**Solution**: Multi-pass approach:
1. Detect edges using Sobel operator
2. Boost contrast near edges
3. Use high-density characters at edges

**Algorithm**:
```typescript
// Sobel kernels for horizontal/vertical edge detection
const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

function detectEdges(lumaMap: Float32Array, width: number, height: number): Float32Array {
  const edges = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      // Convolve with Sobel kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const luma = lumaMap[idx];
          gx += luma * sobelX[ky + 1][kx + 1];
          gy += luma * sobelY[ky + 1][kx + 1];
        }
      }

      // Edge magnitude
      edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return edges;
}
```

### 3. Ordered Dithering (Bayer Matrix)

**Problem**: Smooth gradients show banding (posterization).

**Solution**: Use 4x4 Bayer threshold matrix to add controlled noise that smooths gradients.

**Implementation**:
```typescript
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
].map(row => row.map(v => (v / 16) - 0.5));

function applyDithering(luma: number, x: number, y: number): number {
  const threshold = BAYER_4X4[y % 4][x % 4];
  return luma + threshold * 0.05; // 5% dither strength
}
```

**Effect**: Skin tones, sky gradients, and shadows appear much smoother.

### 4. CLAHE (Contrast Limited Adaptive Histogram Equalization)

**Problem**: Global auto-gain doesn't adapt to local lighting (face in shadow, bright background).

**Solution**: Divide frame into tiles, equalize each tile separately, then interpolate.

**Algorithm**:
```typescript
function applyCLAHE(
  lumaMap: Float32Array,
  width: number,
  height: number,
  tileSize: number = 8,
  clipLimit: number = 2.0
): Float32Array {
  const enhanced = new Float32Array(width * height);
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);

  // Step 1: Build histograms for each tile
  const histograms: number[][][] = [];
  for (let ty = 0; ty < tilesY; ty++) {
    histograms[ty] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Array(256).fill(0);

      // Accumulate histogram for this tile
      for (let y = ty * tileSize; y < Math.min((ty + 1) * tileSize, height); y++) {
        for (let x = tx * tileSize; x < Math.min((tx + 1) * tileSize, width); x++) {
          const idx = y * width + x;
          const bin = Math.floor(lumaMap[idx] * 255);
          hist[bin]++;
        }
      }

      // Clip histogram to prevent over-enhancement
      const clipVal = clipLimit * (tileSize * tileSize) / 256;
      let clipped = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipVal) {
          clipped += hist[i] - clipVal;
          hist[i] = clipVal;
        }
      }

      // Redistribute clipped pixels evenly
      const redistribution = clipped / 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += redistribution;
      }

      histograms[ty][tx] = hist;
    }
  }

  // Step 2: Build CDFs and apply equalization
  // (Interpolate between neighboring tiles for smooth transitions)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const luma = lumaMap[idx];

      // Find tile coordinates (with sub-tile interpolation)
      const tileX = x / tileSize;
      const tileY = y / tileSize;
      const tx = Math.floor(tileX);
      const ty = Math.floor(tileY);
      const fx = tileX - tx;
      const fy = tileY - ty;

      // Bilinear interpolation between 4 neighboring tiles
      enhanced[idx] = interpolateCDF(histograms, tx, ty, fx, fy, luma);
    }
  }

  return enhanced;
}
```

**Impact**: Faces remain visible even in challenging lighting. 2-3x perceived detail improvement.

### 5. Temporal Smoothing

**Problem**: Frame-to-frame noise creates annoying flicker.

**Solution**: Exponential moving average (EMA) filter on luminance values.

**Implementation**:
```typescript
// Global cache (already exists in code)
const lumaCache = new Map<string, Float32Array>();

function applyTemporalSmoothing(
  currentLuma: Float32Array,
  socketId: string,
  alpha: number = 0.6
): Float32Array {
  const cached = lumaCache.get(socketId);

  if (!cached) {
    // First frame - just cache and return
    lumaCache.set(socketId, new Float32Array(currentLuma));
    return currentLuma;
  }

  // Blend: smoothed = alpha * current + (1-alpha) * previous
  const smoothed = new Float32Array(currentLuma.length);
  for (let i = 0; i < currentLuma.length; i++) {
    smoothed[i] = alpha * currentLuma[i] + (1 - alpha) * cached[i];
  }

  // Update cache
  lumaCache.set(socketId, new Float32Array(smoothed));

  return smoothed;
}
```

**Effect**: Video appears much more stable, less "crawling ants" effect.

### 6. LAB Color Space Quantization

**Problem**: RGB Euclidean distance doesn't match human color perception.

**Solution**: Convert to CIE LAB color space for perceptually-uniform color matching.

**Algorithm**:
```typescript
// RGB -> XYZ -> LAB conversion
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // 1. Gamma correction (sRGB -> linear)
  r = r / 255; g = g / 255; b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // 2. RGB -> XYZ (D65 illuminant)
  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  // Reference white D65
  x = x / 0.95047; y = y / 1.00000; z = z / 1.08883;

  // 3. XYZ -> LAB
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + (16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + (16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + (16/116);

  const L = (116 * y) - 16;
  const A = 500 * (x - y);
  const B = 200 * (y - z);

  return [L, A, B];
}

// Pre-compute LAB values for all palette colors
const PALETTE_LAB = PALETTE.map(c => ({
  name: c.name,
  lab: rgbToLab(c.r, c.g, c.b)
}));

// Perceptually-accurate color matching
function rgbToBlessedLAB(r: number, g: number, b: number): string {
  const [L, A, B] = rgbToLab(r, g, b);

  let minDist = Infinity;
  let bestColor = 'white';

  for (const color of PALETTE_LAB) {
    const [L2, A2, B2] = color.lab;

    // CIEDE2000 simplified (full formula is complex)
    const dL = L - L2;
    const dA = A - A2;
    const dB = B - B2;

    const dist = Math.sqrt(dL * dL + dA * dA + dB * dB);

    if (dist < minDist) {
      minDist = dist;
      bestColor = color.name;
    }
  }

  return bestColor;
}
```

**Impact**: Skin tones are more natural, reds/oranges don't collapse to yellow.

### 7. Multi-Resolution Processing

**Problem**: Downsampling from camera resolution (640x480) to ASCII (80x24) loses critical details.

**Solution**: Use Lanczos or bicubic resampling instead of nearest-neighbor.

**Alternative**: Process at higher resolution, then selectively sample key features.

## Implementation Priority

### Phase 1: Quick Wins (Immediate Impact)
1. Perceptually-calibrated character set (5 min)
2. Edge detection character boost (30 min)
3. Bayer dithering (20 min)

### Phase 2: Major Enhancement (Big Quality Jump)
4. CLAHE local contrast (2 hrs)
5. Temporal smoothing (30 min)

### Phase 3: Refinement (Polish)
6. LAB color space (1 hr)
7. Multi-resolution downsampling (1 hr)

## Expected Results

### Before
- Blurry faces, poor edge definition
- Banding in gradients (skin, shadows)
- Flicker and instability
- Washed-out colors in mixed lighting

### After
- Sharp facial features (eyes, nose, mouth clearly visible)
- Smooth gradients in skin tones
- Stable video with minimal flicker
- Accurate color reproduction
- 3-5x perceived quality improvement

## Validation Metrics

1. **Structural Similarity (SSIM)**: Measure how well edges are preserved
2. **Peak Signal-to-Noise Ratio (PSNR)**: Overall fidelity
3. **Temporal Coherence**: Frame-to-frame difference variance
4. **Subjective Quality**: Human assessment (1-10 scale)

Target: 8/10 subjective quality score ("Wow, that actually looks good!")

## Performance Considerations

- CLAHE is most expensive (~5-10ms per frame)
- Edge detection adds ~2ms
- Temporal smoothing is negligible (~0.5ms)
- Target: 60ms total budget for 15 FPS

## References

- CLAHE: Zuiderveld, Karel (1994). "Contrast Limited Adaptive Histogram Equalization"
- LAB Color: CIE 1976 (L*a*b*) color space specification
- Bayer Dithering: Bayer, B. E. (1973). "Ordered dither array"
- Sobel Operator: Sobel, I. (1968). "Edge detection"
