/**
 * Image to ASCII Converter with 16-color ANSI palette support
 *
 * Based on ascii-view algorithm (https://github.com/...)
 * - HSV color space for intelligent color/brightness separation
 * - Sobel edge detection for enhanced edges
 * - 16-color ANSI palette mapping
 *
 * The key insight: ASCII character controls perceived brightness,
 * ANSI color controls the hue. This gives us 12 brightness levels
 * per color = 192 effective shades from just 16 colors!
 */

// ASCII characters ordered by visual density (brightness)
const VALUE_CHARS = ' .-=+*x#$&X@';
const N_VALUES = VALUE_CHARS.length;

// Edge detection characters based on Sobel angle
const EDGE_CHARS = {
  VERTICAL: '|',
  HORIZONTAL: '_',
  DIAGONAL_UP: '/',
  DIAGONAL_DOWN: '\\',
};

// 16-color ANSI palette
export const ANSI_COLORS = {
  // Standard colors (0-7)
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  // Bright colors (8-15)
  lightblack: 8,   // gray
  lightred: 9,
  lightgreen: 10,
  lightyellow: 11,
  lightblue: 12,
  lightmagenta: 13,
  lightcyan: 14,
  lightwhite: 15,
} as const;

// Hue to color mapping (60-degree increments)
// Hue 0=red, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta
const HUE_TO_COLOR: Array<{ dark: number; bright: number }> = [
  { dark: ANSI_COLORS.red, bright: ANSI_COLORS.lightred },           // 0-59: Red
  { dark: ANSI_COLORS.yellow, bright: ANSI_COLORS.lightyellow },     // 60-119: Yellow
  { dark: ANSI_COLORS.green, bright: ANSI_COLORS.lightgreen },       // 120-179: Green
  { dark: ANSI_COLORS.cyan, bright: ANSI_COLORS.lightcyan },         // 180-239: Cyan
  { dark: ANSI_COLORS.blue, bright: ANSI_COLORS.lightblue },         // 240-299: Blue
  { dark: ANSI_COLORS.magenta, bright: ANSI_COLORS.lightmagenta },   // 300-359: Magenta
];

export interface HSV {
  hue: number;        // 0-360 degrees
  saturation: number; // 0-1
  value: number;      // 0-1 (brightness)
}

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface ImageData {
  width: number;
  height: number;
  channels: number;  // 1=grayscale, 3=RGB, 4=RGBA
  data: number[];    // Normalized to 0-1 range
}

export interface AsciiPixel {
  char: string;
  colorCode: number;  // ANSI color code (0-15)
}

export interface AsciiConvertOptions {
  edgeThreshold?: number;      // 0-4, higher = less edge detection (default: 4 = disabled)
  saturationThreshold?: number; // Below this, treat as grayscale (default: 0.25)
  brightnessBoost?: boolean;   // Use value^2 for better contrast (default: true)
}

/**
 * Convert RGB to HSV color space
 */
export function rgbToHsv(r: number, g: number, b: number): HSV {
  // Normalize to 0-1 if needed
  const red = r > 1 ? r / 255 : r;
  const green = g > 1 ? g / 255 : g;
  const blue = b > 1 ? b / 255 : b;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;

  // Value
  const value = max;

  // Saturation
  let saturation = 0;
  if (Math.abs(value) > 1e-4) {
    saturation = chroma / value;
  }

  // Hue
  let hue = 0;
  if (chroma >= 1e-4) {
    if (max === red) {
      hue = 60 * (((green - blue) / chroma) % 6);
      if (hue < 0) hue += 360;
    } else if (max === green) {
      hue = 60 * (2 + (blue - red) / chroma);
    } else {
      hue = 60 * (4 + (red - green) / chroma);
    }
  }

  return { hue, saturation, value };
}

/**
 * Convert HSV to RGB color space
 */
export function hsvToRgb(hsv: HSV): RGB {
  const c = hsv.value * hsv.saturation;
  const hPrime = hsv.hue / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));

  let r1 = 0, g1 = 0, b1 = 0;

  if (hPrime >= 0 && hPrime < 1) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hPrime >= 1 && hPrime < 2) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hPrime >= 2 && hPrime < 3) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hPrime >= 3 && hPrime < 4) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hPrime >= 4 && hPrime < 5) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  const m = hsv.value - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/**
 * Calculate grayscale value from HSV
 * Uses value^2 for better contrast in ASCII representation
 */
function calculateGrayscale(hsv: HSV, boost: boolean): number {
  return boost ? hsv.value * hsv.value : hsv.value;
}

/**
 * Get ASCII character based on brightness (0-1)
 */
function getAsciiChar(grayscale: number): string {
  let index = Math.floor(grayscale * N_VALUES);
  if (index >= N_VALUES) index = N_VALUES - 1;
  if (index < 0) index = 0;
  return VALUE_CHARS[index];
}

/**
 * Get edge character based on Sobel angle
 */
function getSobelAngleChar(angle: number): string {
  // angle is in degrees (-180 to 180)
  if ((angle >= 22.5 && angle <= 67.5) || (angle >= -157.5 && angle <= -112.5)) {
    return EDGE_CHARS.DIAGONAL_DOWN;
  } else if ((angle >= 67.5 && angle <= 112.5) || (angle >= -112.5 && angle <= -67.5)) {
    return EDGE_CHARS.HORIZONTAL;
  } else if ((angle >= 112.5 && angle <= 157.5) || (angle >= -67.5 && angle <= -22.5)) {
    return EDGE_CHARS.DIAGONAL_UP;
  } else {
    return EDGE_CHARS.VERTICAL;
  }
}

/**
 * Map HSV color to 16-color ANSI palette
 *
 * Strategy:
 * - Low saturation (< threshold): grayscale based on value
 * - High saturation: quantize hue to 6 colors, use bright/dark based on value
 */
export function hsvToAnsiColor(hsv: HSV, saturationThreshold = 0.25): number {
  // Low saturation = grayscale
  if (hsv.saturation < saturationThreshold) {
    // Map value to grayscale: black, gray, white, bright white
    if (hsv.value < 0.2) return ANSI_COLORS.black;
    if (hsv.value < 0.4) return ANSI_COLORS.lightblack; // gray
    if (hsv.value < 0.7) return ANSI_COLORS.white;
    return ANSI_COLORS.lightwhite;
  }

  // High saturation = colored
  // Quantize hue to 60-degree buckets
  const hueIndex = Math.round(hsv.hue / 60) % 6;
  const colorPair = HUE_TO_COLOR[hueIndex];

  // Use dark color for low value, bright for high value
  // Threshold at 0.5 for good separation
  return hsv.value >= 0.5 ? colorPair.bright : colorPair.dark;
}

/**
 * Calculate 3x3 convolution at a point
 */
function convolve3x3(
  data: number[],
  width: number,
  x: number,
  y: number,
  kernel: number[]
): number {
  let result = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const idx = (y + j) * width + (x + i);
      const kIdx = (j + 1) * 3 + (i + 1);
      result += data[idx] * kernel[kIdx];
    }
  }
  return result;
}

/**
 * Apply Sobel edge detection
 * Returns arrays of x and y gradients
 */
function applySobel(
  grayscaleData: number[],
  width: number,
  height: number
): { sobelX: number[]; sobelY: number[] } {
  const Gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const Gy = [1, 2, 1, 0, 0, 0, -1, -2, -1];

  const sobelX = new Array(width * height).fill(0);
  const sobelY = new Array(width * height).fill(0);

  // Skip edges (1 pixel border)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      sobelX[idx] = convolve3x3(grayscaleData, width, x, y, Gx);
      sobelY[idx] = convolve3x3(grayscaleData, width, x, y, Gy);
    }
  }

  return { sobelX, sobelY };
}

/**
 * Convert a single pixel to ASCII representation
 */
export function pixelToAscii(
  r: number,
  g: number,
  b: number,
  options: AsciiConvertOptions = {}
): AsciiPixel {
  const {
    saturationThreshold = 0.25,
    brightnessBoost = true,
  } = options;

  const hsv = rgbToHsv(r, g, b);
  const grayscale = calculateGrayscale(hsv, brightnessBoost);
  const char = getAsciiChar(grayscale);
  const colorCode = hsvToAnsiColor(hsv, saturationThreshold);

  return { char, colorCode };
}

/**
 * Convert image data to ASCII art with 16-color palette
 *
 * @param image - Image data (width, height, channels, normalized data)
 * @param options - Conversion options
 * @returns 2D array of AsciiPixels
 */
export function imageToAscii(
  image: ImageData,
  options: AsciiConvertOptions = {}
): AsciiPixel[][] {
  const {
    edgeThreshold = 4.0,
    saturationThreshold = 0.25,
    brightnessBoost = true,
  } = options;

  const { width, height, channels, data } = image;
  const result: AsciiPixel[][] = [];

  // Create grayscale version for edge detection
  const grayscaleData: number[] = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (channels === 1) {
        grayscaleData[y * width + x] = data[idx];
      } else {
        // Luminance-weighted grayscale
        grayscaleData[y * width + x] =
          0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      }
    }
  }

  // Apply Sobel edge detection if enabled
  let sobelX: number[] | null = null;
  let sobelY: number[] | null = null;
  if (edgeThreshold < 4.0) {
    const sobel = applySobel(grayscaleData, width, height);
    sobelX = sobel.sobelX;
    sobelY = sobel.sobelY;
  }

  // Convert each pixel
  for (let y = 0; y < height; y++) {
    const row: AsciiPixel[] = [];
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * channels;
      const sobelIdx = y * width + x;

      let r: number, g: number, b: number;

      if (channels <= 2) {
        // Grayscale
        r = g = b = data[pixelIdx];
      } else {
        // RGB(A)
        r = data[pixelIdx];
        g = data[pixelIdx + 1];
        b = data[pixelIdx + 2];
      }

      const hsv = rgbToHsv(r, g, b);
      const grayscale = calculateGrayscale(hsv, brightnessBoost);
      let char = getAsciiChar(grayscale);

      // Check for edge
      if (sobelX && sobelY) {
        const sx = sobelX[sobelIdx];
        const sy = sobelY[sobelIdx];
        const magnitude2 = sx * sx + sy * sy;

        if (magnitude2 >= edgeThreshold * edgeThreshold) {
          const angle = Math.atan2(sy, sx) * (180 / Math.PI);
          char = getSobelAngleChar(angle);
        }
      }

      const colorCode = hsvToAnsiColor(hsv, saturationThreshold);
      row.push({ char, colorCode });
    }
    result.push(row);
  }

  return result;
}

/**
 * Convert AsciiPixel array to ANSI-colored string
 */
export function asciiToAnsiString(pixels: AsciiPixel[][]): string {
  let result = '';
  let lastColor = -1;

  for (const row of pixels) {
    for (const pixel of row) {
      if (pixel.colorCode !== lastColor) {
        // Use SGR code 38;5;N for 256-color mode (our 16 colors fit in 0-15)
        result += `\x1b[38;5;${pixel.colorCode}m`;
        lastColor = pixel.colorCode;
      }
      result += pixel.char;
    }
    result += '\n';
  }

  // Reset color at end
  result += '\x1b[0m';
  return result;
}

/**
 * Convert AsciiPixel array to blessed-compatible tagged string
 * Uses blessed color tags like {red-fg}, {lightgreen-fg}, etc.
 */
export function asciiToBlessedString(pixels: AsciiPixel[][]): string {
  const COLOR_NAMES = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'lightblack', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
  ];

  let result = '';
  let lastColor = -1;

  for (const row of pixels) {
    for (const pixel of row) {
      if (pixel.colorCode !== lastColor) {
        if (lastColor !== -1) {
          result += '{/}';
        }
        result += `{${COLOR_NAMES[pixel.colorCode]}-fg}`;
        lastColor = pixel.colorCode;
      }
      // Escape braces in char
      const char = pixel.char === '{' ? '{{' : pixel.char === '}' ? '}}' : pixel.char;
      result += char;
    }
    result += '\n';
  }

  if (lastColor !== -1) {
    result += '{/}';
  }

  return result;
}

/**
 * Resize image data by area averaging
 */
export function resizeImage(
  image: ImageData,
  maxWidth: number,
  maxHeight: number,
  characterRatio = 2.0
): ImageData {
  const { width: origWidth, height: origHeight, channels, data } = image;

  // Calculate new dimensions maintaining aspect ratio
  // Account for character aspect ratio (chars are typically 2:1 height:width)
  let newWidth: number;
  let newHeight: number;

  const proposedHeight = Math.floor((origHeight * maxWidth) / (characterRatio * origWidth));
  if (proposedHeight <= maxHeight) {
    newWidth = maxWidth;
    newHeight = proposedHeight;
  } else {
    newWidth = Math.floor((characterRatio * origWidth * maxHeight) / origHeight);
    newHeight = maxHeight;
  }

  // Ensure at least 1x1
  newWidth = Math.max(1, newWidth);
  newHeight = Math.max(1, newHeight);

  const newData: number[] = new Array(newWidth * newHeight * channels).fill(0);

  // Area averaging for each output pixel
  for (let j = 0; j < newHeight; j++) {
    const y1 = Math.floor((j * origHeight) / newHeight);
    const y2 = Math.floor(((j + 1) * origHeight) / newHeight);

    for (let i = 0; i < newWidth; i++) {
      const x1 = Math.floor((i * origWidth) / newWidth);
      const x2 = Math.floor(((i + 1) * origWidth) / newWidth);

      // Average all pixels in the source region
      const avg = new Array(channels).fill(0);
      let count = 0;

      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const srcIdx = (y * origWidth + x) * channels;
          for (let c = 0; c < channels; c++) {
            avg[c] += data[srcIdx + c];
          }
          count++;
        }
      }

      const dstIdx = (j * newWidth + i) * channels;
      for (let c = 0; c < channels; c++) {
        newData[dstIdx + c] = count > 0 ? avg[c] / count : 0;
      }
    }
  }

  return {
    width: newWidth,
    height: newHeight,
    channels,
    data: newData,
  };
}

/**
 * Load image from raw RGBA buffer (e.g., from sharp or canvas)
 */
export function loadImageFromRGBA(
  buffer: Buffer | Uint8Array,
  width: number,
  height: number
): ImageData {
  const channels = 4;
  const data: number[] = new Array(width * height * channels);

  for (let i = 0; i < buffer.length; i++) {
    data[i] = buffer[i] / 255; // Normalize to 0-1
  }

  return { width, height, channels, data };
}

/**
 * Load image from raw RGB buffer
 */
export function loadImageFromRGB(
  buffer: Buffer | Uint8Array,
  width: number,
  height: number
): ImageData {
  const channels = 3;
  const data: number[] = new Array(width * height * channels);

  for (let i = 0; i < buffer.length; i++) {
    data[i] = buffer[i] / 255; // Normalize to 0-1
  }

  return { width, height, channels, data };
}
