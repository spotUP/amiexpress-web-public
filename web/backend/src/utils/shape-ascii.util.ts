/**
 * Shape-Based ASCII Rendering Engine
 *
 * Based on Alex Harri's algorithm: https://alexharri.com/blog/ascii-rendering
 *
 * Key improvements over brightness-based ASCII:
 * - 5-10x sharper edges
 * - Characters follow geometric shapes (not just brightness)
 * - Directional density analysis via 6-dimensional shape vectors
 * - k-d tree for O(log n) lookups with O(1) quantization caching
 *
 * Algorithm:
 * 1. Pre-compute shape vectors for all ASCII characters (6 sampling regions)
 * 2. For each video frame cell, compute 6D shape vector by sampling:
 *    - Top-left, top-right, middle-left, middle-right, bottom-left, bottom-right
 * 3. Find nearest character in 6D space using k-d tree
 * 4. Apply contrast enhancement (global + directional)
 * 5. Combine with existing LAB color system for colored output
 */

// ========== TYPES ==========

export interface ShapeVector {
  char: string;
  vector: [number, number, number, number, number, number]; // Raw samples: TL, TR, ML, MR, BL, BR
  normalized: [number, number, number, number, number, number]; // Normalized for matching
}

export interface ShapeRenderOptions {
  /** Enable colored output using LAB color matching (default: false, not yet implemented) */
  colored?: boolean;
  /** Global contrast exponent (higher = sharper, default: 2.5) */
  contrastExponent?: number;
  /** Enable directional contrast with external sampling (default: false, causes issues with thin features) */
  directionalContrast?: boolean;
  /** External sampling suppression factor (default: 0.7) */
  suppressionFactor?: number;
  /** External sampling distance in cell units (default: 0.15, range: 0.1-0.5) */
  externalDistance?: number;
  /** Use quantization cache for performance (default: true) */
  useCache?: boolean;
}

// ========== K-D TREE IMPLEMENTATION ==========

interface KDNode {
  point: number[];
  char: string;
  axis: number;
  left: KDNode | null;
  right: KDNode | null;
}

class KDTree {
  private root: KDNode | null = null;
  private dimensions: number;

  constructor(points: Array<{ point: number[]; char: string }>, dimensions: number = 6) {
    this.dimensions = dimensions;
    this.root = this.build(points, 0);
  }

  private build(points: Array<{ point: number[]; char: string }>, depth: number): KDNode | null {
    if (points.length === 0) return null;

    const axis = depth % this.dimensions;

    // Sort points by current axis (create copy to avoid mutation)
    const sortedPoints = [...points].sort((a, b) => a.point[axis] - b.point[axis]);

    // Select median
    const median = Math.floor(sortedPoints.length / 2);
    const node: KDNode = {
      point: sortedPoints[median].point,
      char: sortedPoints[median].char,
      axis,
      left: null,
      right: null,
    };

    // Recursively build left and right subtrees
    node.left = this.build(sortedPoints.slice(0, median), depth + 1);
    node.right = this.build(sortedPoints.slice(median + 1), depth + 1);

    return node;
  }

  public nearest(target: number[]): { char: string; distance: number } {
    // Validate input
    if (target.length !== this.dimensions) {
      console.error(`[KDTree] Invalid target dimensions: expected ${this.dimensions}, got ${target.length}`);
      return { char: ' ', distance: Infinity };
    }

    let best: { node: KDNode | null; distance: number } = {
      node: null,
      distance: Infinity,
    };

    const search = (node: KDNode | null, depth: number = 0): void => {
      if (!node) return;

      // Calculate distance to current node
      const dist = this.distance(target, node.point);
      if (dist < best.distance) {
        best = { node, distance: dist };
      }

      const axis = depth % this.dimensions;
      const diff = target[axis] - node.point[axis];

      // Search the side of the tree that target is on
      const near = diff < 0 ? node.left : node.right;
      const far = diff < 0 ? node.right : node.left;

      search(near, depth + 1);

      // If there's a chance of a closer point on the other side, search it
      if (diff * diff < best.distance) {
        search(far, depth + 1);
      }
    };

    search(this.root);

    return {
      char: best.node?.char || ' ',
      distance: best.distance,
    };
  }

  private distance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return sum; // Return squared distance (faster, still correct for comparisons)
  }
}

// ========== CHARACTER RASTER GENERATION ==========

/**
 * Convert character raster (8x12 pixel grid) to RGBA pixel array
 * # = white pixel (255), . = black pixel (0)
 */
function rasterToPixels(raster: string): Uint8Array {
  const lines = raster.trim().split('\n').map(l => l.trim());
  const width = 8;
  const height = 12;
  const pixels = new Uint8Array(width * height * 4); // RGBA

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const char = lines[y]?.[x] || '.';
      const value = char === '#' ? 255 : 0;
      const idx = (y * width + x) * 4;
      pixels[idx] = value;     // R
      pixels[idx + 1] = value; // G
      pixels[idx + 2] = value; // B
      pixels[idx + 3] = 255;   // A
    }
  }

  return pixels;
}

/**
 * Generate vertical line character (|, :, ;, !, 1)
 */
function generateVerticalLine(thickness: number = 2): string {
  const padding = Math.floor((8 - thickness) / 2);
  const line = '.'.repeat(padding) + '#'.repeat(thickness) + '.'.repeat(8 - padding - thickness);
  return Array(12).fill(line).join('\n');
}

/**
 * Generate horizontal line character (-, =, _)
 */
function generateHorizontalLine(row: number, thickness: number = 2): string {
  const line = '########';
  const empty = '........';
  const lines = Array(12).fill(empty);
  for (let i = 0; i < thickness; i++) {
    if (row + i < 12) {
      lines[row + i] = line;
    }
  }
  return lines.join('\n');
}

/**
 * Generate diagonal line (/ or \)
 */
function generateDiagonalLine(direction: 'forward' | 'backward'): string {
  const lines = [];
  for (let y = 0; y < 12; y++) {
    let line = '';
    for (let x = 0; x < 8; x++) {
      const pos = direction === 'forward' ? (11 - y) : y;
      const isOn = Math.abs(x - pos * 8 / 12) < 1.5;
      line += isOn ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Generate circle/rounded shape (O, 0, C, D, (, ))
 */
function generateCircle(hollow: boolean = false, side?: 'left' | 'right'): string {
  const cx = 4;
  const cy = 6;
  const outerRadius = 3.5;
  const innerRadius = hollow ? 2.0 : 0;

  const lines = [];
  for (let y = 0; y < 12; y++) {
    let line = '';
    for (let x = 0; x < 8; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let isOn = dist <= outerRadius && dist >= innerRadius;

      // Apply side mask for ( and )
      if (side === 'left' && x > cx) isOn = false;
      if (side === 'right' && x < cx) isOn = false;

      line += isOn ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Character raster database - maps each character to its 8x12 pixel raster
 * Characters are measured by rendering and sampling, ensuring vectors match detection
 */
const CHARACTER_RASTERS: Record<string, string> = {
  // Empty and sparse
  ' ': Array(12).fill('........').join('\n'),
  '.': generateHorizontalLine(10, 1).replace(/########/g, '...##...'),
  ',': `
........
........
........
........
........
........
........
........
........
...##...
...##...
..##....
  `.trim(),
  "'": `
...##...
...##...
........
........
........
........
........
........
........
........
........
........
  `.trim(),
  '`': `
..##....
...##...
........
........
........
........
........
........
........
........
........
........
  `.trim(),

  // Lines
  '|': generateVerticalLine(2),
  '-': generateHorizontalLine(6, 2),
  '_': generateHorizontalLine(11, 1),
  '=': generateHorizontalLine(5, 1) + '\n' + generateHorizontalLine(7, 1),
  ':': generateVerticalLine(2).replace(/(.*\n){5}/, Array(6).fill('........').join('\n') + '\n'),
  ';': generateVerticalLine(2).replace(/(.*\n){5}/, Array(6).fill('........').join('\n') + '\n').replace(/##\.\./g, '##..') + '\n..##....\n.##.....',
  '~': `
........
........
........
........
.##..##.
#..##...
........
........
........
........
........
........
  `.trim(),

  // Diagonals
  '/': generateDiagonalLine('forward'),
  '\\': generateDiagonalLine('backward'),

  // Brackets and parentheses
  '(': generateCircle(true, 'left'),
  ')': generateCircle(true, 'right'),
  '<': `
....##..
...##...
..##....
.##.....
..##....
...##...
....##..
........
........
........
........
........
  `.trim(),
  '>': `
..##....
...##...
....##..
.....##.
....##..
...##...
..##....
........
........
........
........
........
  `.trim(),
  '[': `
.####...
.##.....
.##.....
.##.....
.##.....
.##.....
.##.....
.##.....
.##.....
.##.....
.####...
........
  `.trim(),
  ']': `
...####.
.....##.
.....##.
.....##.
.....##.
.....##.
.....##.
.....##.
.....##.
.....##.
...####.
........
  `.trim(),
  '{': `
...###..
..##....
..##....
..##....
.##.....
..##....
..##....
..##....
..##....
..##....
...###..
........
  `.trim(),
  '}': `
..###...
....##..
....##..
....##..
.....##.
....##..
....##..
....##..
....##..
....##..
..###...
........
  `.trim(),

  // Letters with distinctive shapes
  'O': generateCircle(true),
  '0': generateCircle(true),
  'C': `
..####..
.##..##.
##......
##......
##......
##......
##......
##......
.##..##.
..####..
........
........
  `.trim(),
  'D': `
####....
##.##...
##..##..
##..##..
##..##..
##..##..
##..##..
##.##...
####....
........
........
........
  `.trim(),
  'L': `
##......
##......
##......
##......
##......
##......
##......
##......
##......
######..
........
........
  `.trim(),
  'T': `
########
...##...
...##...
...##...
...##...
...##...
...##...
...##...
...##...
........
........
........
  `.trim(),
  'V': `
##....##
##....##
##....##
.##..##.
.##..##.
..####..
..####..
...##...
........
........
........
........
  `.trim(),
  'A': `
...##...
..####..
.##..##.
.##..##.
##....##
########
##....##
##....##
##....##
........
........
........
  `.trim(),
  'Y': `
##....##
##....##
.##..##.
..####..
...##...
...##...
...##...
...##...
........
........
........
........
  `.trim(),
  'X': `
##....##
##....##
.##..##.
..####..
..####..
.##..##.
##....##
##....##
........
........
........
........
  `.trim(),
  'P': `
#####...
##..##..
##..##..
#####...
##......
##......
##......
##......
........
........
........
........
  `.trim(),
  'S': `
.#####..
##...##.
##......
.####...
.....##.
.....##.
##...##.
.#####..
........
........
........
........
  `.trim(),

  // Special symbols
  '+': `
........
...##...
...##...
...##...
########
########
...##...
...##...
...##...
........
........
........
  `.trim(),
  '*': `
........
...##...
.#.##.#.
..####..
########
..####..
.#.##.#.
...##...
........
........
........
........
  `.trim(),
  'x': `
........
........
........
##....##
.##..##.
..####..
..####..
.##..##.
##....##
........
........
........
  `.trim(),
  '#': `
..##.##.
..##.##.
########
..##.##.
..##.##.
########
..##.##.
..##.##.
........
........
........
........
  `.trim(),
  '$': `
...##...
.######.
##.##...
##.##...
.######.
...##.##
...##.##
.######.
...##...
........
........
........
  `.trim(),
  '&': `
..###...
.##.##..
.##.##..
..###...
.###.##.
##.####.
##..##..
.###.##.
........
........
........
........
  `.trim(),
  '@': `
..####..
.##..##.
##.##.##
##.##.##
##.#####
##......
.##.....
..#####.
........
........
........
........
  `.trim(),
  '1': `
...##...
..###...
...##...
...##...
...##...
...##...
...##...
..####..
........
........
........
........
  `.trim(),
  '7': `
########
.....##.
....##..
...##...
..##....
.##.....
##......
........
........
........
........
........
  `.trim(),
};

// ========== COMPUTED CHARACTER SHAPE DATABASE ==========

/**
 * Character shape database computed from rasters at initialization.
 * This ensures shape vectors exactly match what the sampling algorithm detects.
 * Populated by computeShapeVectorsFromRasters() in initialize().
 */
let COMPUTED_SHAPES: Array<{ char: string; vector: [number, number, number, number, number, number] }> = [];

// ========== SHAPE-BASED RENDERER ==========

export class ShapeAsciiRenderer {
  private shapeDatabase: ShapeVector[] = [];
  private kdTree: KDTree | null = null;
  private cache = new Map<number, string>();
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (this.initialized) return;

    // CRITICAL: Compute shape vectors from actual character rasters
    // This ensures vectors match what the sampling algorithm detects
    // (instead of using hand-crafted estimates that don't match reality)
    this.computeShapeVectorsFromRasters();

    // Build shape database with computed vectors
    this.shapeDatabase = COMPUTED_SHAPES.map(({ char, vector }) => {
      // Normalize vector: divide by max component
      const maxVal = Math.max(...vector, 0.001); // Avoid div/0
      const normalized: [number, number, number, number, number, number] = vector.map(
        (v) => v / maxVal
      ) as [number, number, number, number, number, number];

      return { char, vector, normalized };
    });

    // Build k-d tree for efficient nearest neighbor search
    this.kdTree = new KDTree(
      this.shapeDatabase.map((s) => ({ point: Array.from(s.normalized), char: s.char })),
      6
    );

    this.initialized = true;
    // Initialization complete (logging removed for production)
  }

  /**
   * Compute shape vectors from character rasters
   *
   * This is the CRITICAL improvement over hand-crafted vectors:
   * - Renders each character at 8x12 pixels
   * - Samples it using the SAME algorithm we use for video frames
   * - Ensures detected vectors match pre-computed vectors EXACTLY
   *
   * Result: Vertical lines show '|' instead of ')(' because the vector
   * we detect from video [1,0,1,0,1,0] now matches '|' in database.
   */
  private computeShapeVectorsFromRasters(): void {
    COMPUTED_SHAPES = [];

    for (const [char, raster] of Object.entries(CHARACTER_RASTERS)) {
      // Convert raster to pixel array
      const pixels = rasterToPixels(raster);
      const width = 8;
      const height = 12;

      // Sample the character using the SAME algorithm as video frames
      const shapeVector = this.computeShapeVector(
        pixels,
        width,
        height,
        0, // gridX = 0 (single cell)
        0, // gridY = 0
        width,  // cellWidth = 8
        height, // cellHeight = 12
        {
          contrastExponent: 2.5,
          directionalContrast: false, // Don't use directional contrast for character measurement
          suppressionFactor: 0.7,
          externalDistance: 0.15,
        }
      );

      // Store the measured vector
      COMPUTED_SHAPES.push({
        char,
        vector: shapeVector as [number, number, number, number, number, number],
      });
    }
  }

  /**
   * Render video frame to shape-based ASCII art
   */
  public render(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: ShapeRenderOptions = {}
  ): string {
    // Validate input
    if (!pixels || pixels.length === 0) {
      console.error('[ShapeASCII] Empty pixel buffer');
      return '';
    }

    const expectedSize = width * height * 4; // RGBA
    if (pixels.length !== expectedSize) {
      console.error(`[ShapeASCII] Invalid pixel buffer size: expected ${expectedSize}, got ${pixels.length}`);
      return '';
    }

    if (width <= 0 || height <= 0) {
      console.error(`[ShapeASCII] Invalid dimensions: ${width}x${height}`);
      return '';
    }

    const {
      colored = false, // Default to grayscale for now (color integration comes later)
      contrastExponent = 2.5,
      directionalContrast = false, // Default to false (causes issues with thin features)
      suppressionFactor = 0.7,
      externalDistance = 0.15, // Distance for external sampling in cell units
      useCache = true,
    } = options;

    // Calculate grid dimensions (monospace chars are ~1.5x taller than wide)
    const cellWidth = 8;
    const cellHeight = 12;
    const gridWidth = Math.floor(width / cellWidth);
    const gridHeight = Math.floor(height / cellHeight);

    if (gridWidth <= 0 || gridHeight <= 0) {
      console.error(`[ShapeASCII] Invalid grid dimensions: ${gridWidth}x${gridHeight}`);
      return '';
    }

    const lines: string[] = [];

    for (let gy = 0; gy < gridHeight; gy++) {
      let line = '';
      for (let gx = 0; gx < gridWidth; gx++) {
        // Compute shape vector for this cell
        const shapeVector = this.computeShapeVector(
          pixels,
          width,
          height,
          gx,
          gy,
          cellWidth,
          cellHeight,
          {
            contrastExponent,
            directionalContrast,
            suppressionFactor,
            externalDistance,
          }
        );

        // Find nearest character
        const char = this.findNearestCharacter(shapeVector, useCache);

        line += char;
      }
      lines.push(line);
    }

    // Join lines with newlines (no trailing newline)
    return lines.join('\n');
  }

  /**
   * Compute 6-dimensional shape vector for a cell in the video frame
   */
  private computeShapeVector(
    pixels: Uint8Array,
    width: number,
    height: number,
    gridX: number,
    gridY: number,
    cellWidth: number,
    cellHeight: number,
    options: {
      contrastExponent: number;
      directionalContrast: boolean;
      suppressionFactor: number;
      externalDistance: number;
    }
  ): number[] {
    const { contrastExponent, directionalContrast, suppressionFactor, externalDistance } = options;

    // Sample 6 internal regions (inside cell boundary)
    const internal = [
      this.sampleRegion(pixels, width, height, gridX, gridY, cellWidth, cellHeight, 0.25, 0.25), // TL
      this.sampleRegion(pixels, width, height, gridX, gridY, cellWidth, cellHeight, 0.75, 0.25), // TR
      this.sampleRegion(pixels, width, height, gridX, gridY, cellWidth, cellHeight, 0.25, 0.50), // ML
      this.sampleRegion(pixels, width, height, gridX, gridY, cellWidth, cellHeight, 0.75, 0.50), // MR
      this.sampleRegion(pixels, width, height, gridX, gridY, cellWidth, cellHeight, 0.25, 0.75), // BL
      this.sampleRegion(pixels, width, height, gridX, gridY, cellWidth, cellHeight, 0.75, 0.75), // BR
    ];

    let enhanced = internal;

    // Apply directional contrast if enabled
    if (directionalContrast) {
      // Sample 6 external regions (outside cell boundary)
      const external = [
        this.sampleRegion(pixels, width, height, gridX - externalDistance, gridY - externalDistance, cellWidth, cellHeight, 0.25, 0.25),
        this.sampleRegion(pixels, width, height, gridX + externalDistance, gridY - externalDistance, cellWidth, cellHeight, 0.75, 0.25),
        this.sampleRegion(pixels, width, height, gridX - externalDistance, gridY, cellWidth, cellHeight, 0.25, 0.50),
        this.sampleRegion(pixels, width, height, gridX + externalDistance, gridY, cellWidth, cellHeight, 0.75, 0.50),
        this.sampleRegion(pixels, width, height, gridX - externalDistance, gridY + externalDistance, cellWidth, cellHeight, 0.25, 0.75),
        this.sampleRegion(pixels, width, height, gridX + externalDistance, gridY + externalDistance, cellWidth, cellHeight, 0.75, 0.75),
      ];

      // Directional contrast: If external is bright, suppress corresponding internal
      enhanced = internal.map((intVal, i) => {
        const extVal = external[i];
        const suppression = extVal * suppressionFactor;
        return Math.max(0, intVal - suppression);
      });
    }

    // Global contrast enhancement (normalize + power function)
    const maxVal = Math.max(...enhanced, 0.001); // Avoid div/0
    const normalized = enhanced.map((v) => {
      const norm = v / maxVal;
      return Math.pow(norm, contrastExponent); // Sharpen: dark→darker, bright→preserved
    });

    return normalized;
  }

  /**
   * Sample a circular region in the video frame and return average luminance
   */
  private sampleRegion(
    pixels: Uint8Array,
    width: number,
    height: number,
    gridX: number,
    gridY: number,
    cellWidth: number,
    cellHeight: number,
    relX: number, // 0-1 relative position in cell
    relY: number  // 0-1 relative position in cell
  ): number {
    // Calculate pixel coordinates (can be outside grid for external sampling)
    const cx = Math.floor((gridX + relX) * cellWidth);
    const cy = Math.floor((gridY + relY) * cellHeight);
    const radius = 2; // Sampling circle radius in pixels

    let sum = 0;
    let count = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Check if within circle
        if (dx * dx + dy * dy > radius * radius) continue;

        // Clamp to image bounds
        const x = Math.min(width - 1, Math.max(0, cx + dx));
        const y = Math.min(height - 1, Math.max(0, cy + dy));
        const idx = (y * width + x) * 4; // RGBA

        // Calculate luminance (ITU-R BT.601)
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        sum += luma;
        count++;
      }
    }

    return count > 0 ? sum / count / 255 : 0; // Normalize to 0-1
  }

  /**
   * Find nearest character in 6D shape space
   */
  private findNearestCharacter(shapeVector: number[], useCache: boolean): string {
    if (!this.kdTree) {
      console.error('[ShapeASCII] k-d tree not initialized');
      return ' ';
    }

    // Quantization caching for O(1) lookups
    if (useCache) {
      const key = this.quantizeShapeVector(shapeVector);

      if (this.cache.has(key)) {
        return this.cache.get(key)!;
      }

      // Cache miss: compute via k-d tree
      const result = this.kdTree.nearest(shapeVector);
      this.cache.set(key, result.char);

      return result.char;
    }

    // Direct k-d tree lookup (no caching)
    const result = this.kdTree.nearest(shapeVector);
    return result.char;
  }

  /**
   * Quantize 6D shape vector to 30-bit integer for cache key
   * Each component quantized to 5 bits (0-31)
   */
  private quantizeShapeVector(vector: number[]): number {
    let key = 0;
    for (let i = 0; i < 6; i++) {
      const quantized = Math.floor(vector[i] * 31) & 0x1F; // 5 bits
      key |= quantized << (i * 5); // Pack into 30-bit integer
    }
    return key;
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   */
  public getCacheStats(): { size: number; hitRate: number } {
    // Simple cache size for now; hit rate tracking would require counters
    return {
      size: this.cache.size,
      hitRate: 0, // TODO: Track hits/misses if needed
    };
  }

  /**
   * Clear cache (useful for memory management)
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

// ========== SINGLETON INSTANCE ==========

let rendererInstance: ShapeAsciiRenderer | null = null;

/**
 * Get singleton renderer instance (lazy initialization)
 */
export function getShapeRenderer(): ShapeAsciiRenderer {
  if (!rendererInstance) {
    rendererInstance = new ShapeAsciiRenderer();
  }
  return rendererInstance;
}

/**
 * Quick render function for simple use cases
 */
export function renderShapeAscii(
  pixels: Uint8Array,
  width: number,
  height: number,
  options?: ShapeRenderOptions
): string {
  const renderer = getShapeRenderer();
  return renderer.render(pixels, width, height, options);
}
