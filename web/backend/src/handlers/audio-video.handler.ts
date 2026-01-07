/**
 * Audio and Video Socket Handlers
 * 
 * Server-side implementation for real-time media streaming events.
 * Handles audio/video start/stop, subscription, and broadcasting.
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { BBSSession } from '../index';

// Global cache for temporal smoothing (stabilizes flickering pixels)
const lumaCache = new Map<string, Float32Array>();

// 4x4 Bayer Threshold Matrix for ordered dithering
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
].map(row => row.map(v => (v / 16) - 0.5)); // Normalized and centered around 0

// ========== LAB COLOR SPACE CONVERSION (Global) ==========
// CIE L*a*b* provides perceptually uniform color space
const rgbToLab = (r: number, g: number, b: number): [number, number, number] => {
  // 1. Gamma correction (sRGB -> linear RGB)
  r = r / 255; g = g / 255; b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // 2. RGB -> XYZ (D65 illuminant, sRGB primaries)
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  // 3. Normalize by reference white (D65)
  x = x / 0.95047; y = y / 1.00000; z = z / 1.08883;

  // 4. XYZ -> LAB
  const f = (t: number) => t > 0.008856 ? Math.pow(t, 1/3) : (7.787 * t) + (16/116);
  x = f(x); y = f(y); z = f(z);

  const L = (116 * y) - 16;
  const A = 500 * (x - y);
  const B = 200 * (y - z);

  return [L, A, B];
};

// ========== COLOR PALETTE (Pre-computed globally for performance) ==========
const PALETTE_RGB: { name: string; r: number; g: number; b: number }[] = [
  // Dark colors (0-7)
  { name: 'black', r: 0, g: 0, b: 0 },
  { name: 'red', r: 170, g: 0, b: 0 },
  { name: 'green', r: 0, g: 170, b: 0 },
  { name: 'yellow', r: 170, g: 85, b: 0 },
  { name: 'blue', r: 0, g: 0, b: 170 },
  { name: 'magenta', r: 170, g: 0, b: 170 },
  { name: 'cyan', r: 0, g: 170, b: 170 },
  { name: 'white', r: 170, g: 170, b: 170 },
  // Bright colors (8-15)
  { name: 'lightblack', r: 85, g: 85, b: 85 },
  { name: 'lightred', r: 255, g: 85, b: 85 },
  { name: 'lightgreen', r: 85, g: 255, b: 85 },
  { name: 'lightyellow', r: 255, g: 255, b: 85 },
  { name: 'lightblue', r: 85, g: 85, b: 255 },
  { name: 'lightmagenta', r: 255, g: 85, b: 255 },
  { name: 'lightcyan', r: 85, g: 255, b: 255 },
  { name: 'lightwhite', r: 255, g: 255, b: 255 },
];

// Pre-compute LAB values ONCE at module load (not per-frame!)
// This saves ~800 operations per frame (16 colors × 50 ops each)
const PALETTE_LAB = PALETTE_RGB.map(c => ({
  name: c.name,
  lab: rgbToLab(c.r, c.g, c.b)
}));

export function registerAudioVideoHandlers(socket: Socket, io: SocketIOServer, sessions: Map<string, BBSSession>): void {
  
  // Cleanup cache on disconnect
  socket.on('disconnect', () => {
    lumaCache.delete(socket.id);
  });

  // ========== AUDIO HANDLERS ==========

  socket.on('audio:start-streaming', (options: any, callback?: (response: any) => void) => {
    const session = sessions.get(socket.id);
    if (!session) {
      callback?.({ success: false, error: 'Session not found' });
      return;
    }

    // Support standalone mic testing (for demos, settings, etc.) without requiring a voice channel
    const testMode = options?.testMode === true;
    const roomId = session.currentVoiceChannelId || session.currentRoomId;

    if (!testMode && !roomId) {
      callback?.({ success: false, error: 'Not in a voice channel or chat room (use testMode: true for standalone testing)' });
      return;
    }

    const streamId = `audio-${socket.id}`;
    if (testMode) {
      console.log(`[Audio] User ${session.user?.username} starting TEST audio stream: ${streamId} (standalone mic test)`);
    } else {
      console.log(`[Audio] User ${session.user?.username} starting audio stream: ${streamId} in room ${roomId}`);
    }

    // Notify the client (frontend) to start audio capture
    socket.emit('audio:start-streaming', { options, streamId });

    // Notify others in the room (only if NOT in test mode)
    if (!testMode && roomId) {
      const voiceRoomId = `voice:${roomId}`;
      socket.to(voiceRoomId).emit('audio:stream-started', {
        userId: session.user?.id,
        username: session.user?.username,
        streamId,
        options
      });
    }

    callback?.({ success: true, streamId });
  });

  socket.on('audio:stop-streaming', (callback?: () => void) => {
    const session = sessions.get(socket.id);
    if (!session) {
      callback?.();
      return;
    }

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (roomId) {
      const voiceRoomId = `voice:${roomId}`;
      socket.to(voiceRoomId).emit('audio:stream-stopped', {
        userId: session.user?.id
      });
    }

console.log(`[Audio] User ${session.user?.username} stopped audio streaming`);
    callback?.();
  });

  socket.on('audio:mute', (data: { muted: boolean }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (roomId) {
      const voiceRoomId = `voice:${roomId}`;
      socket.to(voiceRoomId).emit('audio:muted', {
        userId: session.user?.id,
        muted: data.muted
      });
    }
  });

  // ========== VIDEO HANDLERS ==========

  socket.on('video:start-stream', (data: { source: any, options: any }, callback?: (response: any) => void) => {
    const session = sessions.get(socket.id);
    if (!session) {
      callback?.({ success: false, error: 'Session not found' });
      return;
    }

    const streamId = `video-${socket.id}`;
    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    console.log(`[Video] User ${session.user?.username} starting video stream: ${streamId}${roomId ? ` in room ${roomId}` : ' (standalone)'}`);

    // Notify the client (frontend) to actually start capturing from the camera
    socket.emit('video:start-stream', { source: data.source, options: data.options, streamId });

    // Notify others in the room if in one
    if (roomId) {
      const voiceRoomId = `voice:${roomId}`;
      socket.to(voiceRoomId).emit('video:stream-started', {
        userId: session.user?.id,
        username: session.user?.username,
        streamId,
        options: data.options
      });
    }

    callback?.({ success: true, streamId });
  });

  socket.on('video:stop-stream', (data: { streamId: string }, callback?: (response: any) => void) => {
    const session = sessions.get(socket.id);
    if (!session) {
      callback?.({ success: false, error: 'Session not found' });
      return;
    }

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (roomId) {
      const voiceRoomId = `voice:${roomId}`;
      socket.to(voiceRoomId).emit('video:stream-stopped', {
        userId: session.user?.id,
        streamId: data.streamId
      });
    }

console.log(`[Video] User ${session.user?.username} stopped video stream: ${data.streamId}`);
    callback?.({ success: true });
  });

  // ========== DATA RELAY HANDLERS ==========

  // Relay audio levels from client (calculated by AnalyserNode in MediaHandler)
  socket.on('audio:levels', (levels: { input: number; output: number }) => {
    // Simply relay the audio levels back to the door
    // Frontend MediaHandler calculates RMS from raw audio using AnalyserNode
    socket.emit('audio:levels', levels);
  });

  // Relay audio chunks to other participants
  socket.on('audio:data', (chunk: ArrayBuffer) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    // Echo back to originating socket for local VU meters/demos
    socket.emit('audio:data', {
      userId: session.user?.id,
      chunk
    });

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const voiceRoomId = `voice:${roomId}`;
    // Broadcast to everyone else in the voice room
    socket.to(voiceRoomId).emit('audio:data', {
      userId: session.user?.id,
      chunk
    });
  });

  // Handle raw video data and convert to ASCII art
  // Inspired by Python/Pillow ASCII art techniques with calibrated characters
  // Modes: 'braille' (8x resolution), 'superres'/'halfblock' (4x rich mode with 10-level shading), 'ascii' (character-based)
  socket.on('video:data', (data: { width: number, height: number, colored?: boolean, mode?: 'braille' | 'superres' | 'halfblock' | 'ascii', data: ArrayBuffer }) => {
    const session = sessions.get(socket.id);

    const { width, height, colored, mode = 'halfblock', data: buffer } = data;
    const pixels = new Uint8Array(buffer);

    // ========== COLOR CONVERSION (using global pre-computed LAB palette) ==========
    // CIEDE2000 color distance (simplified for performance)
    // Full CIEDE2000 is very complex; this is the core delta-E formula
    const rgbToBlessed = (r: number, g: number, b: number, isBackground: boolean = false): string => {
      const [L1, A1, B1] = rgbToLab(r, g, b);

      let minDist = Infinity;
      let bestColor = 'white';

      for (const color of PALETTE_LAB) {
        const [L2, A2, B2] = color.lab;

        // CIEDE2000 simplified (core formula)
        // Weighting: L (lightness) matters most, then chroma, then hue
        const dL = L1 - L2;
        const dA = A1 - A2;
        const dB = B1 - B2;

        // Chroma components
        const C1 = Math.sqrt(A1 * A1 + B1 * B1);
        const C2 = Math.sqrt(A2 * A2 + B2 * B2);
        const dC = C1 - C2;

        // Hue component (simplified)
        const dH = Math.sqrt(Math.max(0, dA * dA + dB * dB - dC * dC));

        // Weighted distance (kL=1, kC=1, kH=1 for speed)
        let dist = Math.sqrt(dL * dL + dC * dC + dH * dH);

        // AGGRESSIVE COLOR PRESERVATION for backgrounds
        if (isBackground && color.name === 'black' && (r > 10 || g > 10 || b > 10)) {
          dist *= 12.0; // 12x penalty for black (stronger than before)
        }

        if (dist < minDist) {
          minDist = dist;
          bestColor = color.name;
        }
      }

      return bestColor;
    };

    // Color transformation functions (IMPROVED for better contrast)
    const dimColor = (r: number, g: number, b: number): [number, number, number] => {
      // More aggressive dimming to allow true black for very dark areas
      const luma = getLuminance(r, g, b);

      // If very dark (luma < 30), allow true black background
      if (luma < 30) {
        return [0, 0, 0]; // Pure black for very dark areas
      }

      // Otherwise dim to 50% for background (more aggressive than 70%)
      return [Math.floor(r * 0.5), Math.floor(g * 0.5), Math.floor(b * 0.5)];
    };

    const brightenColor = (r: number, g: number, b: number): [number, number, number] => {
      // Less aggressive brightening to prevent washing out (was 1.4, now 1.2)
      return [
        Math.min(255, Math.floor(r * 1.2)),
        Math.min(255, Math.floor(g * 1.2)),
        Math.min(255, Math.floor(b * 1.2))
      ];
    };

    // ========== EDGE DETECTION (Sobel Operator) ==========
    const detectEdges = (lumaMap: Float32Array, w: number, h: number): Float32Array => {
      const edges = new Float32Array(w * h);

      // Sobel kernels for gradient detection
      const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
      const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let gx = 0, gy = 0;

          // Convolve with Sobel kernels
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = (y + ky) * w + (x + kx);
              const luma = lumaMap[idx];
              gx += luma * sobelX[ky + 1][kx + 1];
              gy += luma * sobelY[ky + 1][kx + 1];
            }
          }

          // Edge magnitude (gradient strength)
          edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
        }
      }

      return edges;
    };

    // ========== CLAHE (Contrast Limited Adaptive Histogram Equalization) ==========
    const applyCLAHE = (
      lumaMap: Float32Array,
      w: number,
      h: number,
      tileSize: number = 8,
      clipLimit: number = 2.5
    ): Float32Array => {
      const enhanced = new Float32Array(w * h);
      const tilesX = Math.ceil(w / tileSize);
      const tilesY = Math.ceil(h / tileSize);

      // Build histogram for each tile
      const cdfs: number[][][] = [];
      for (let ty = 0; ty < tilesY; ty++) {
        cdfs[ty] = [];
        for (let tx = 0; tx < tilesX; tx++) {
          const hist = new Array(256).fill(0);

          // Accumulate histogram
          let count = 0;
          for (let y = ty * tileSize; y < Math.min((ty + 1) * tileSize, h); y++) {
            for (let x = tx * tileSize; x < Math.min((tx + 1) * tileSize, w); x++) {
              const bin = Math.floor(lumaMap[y * w + x] * 255);
              hist[bin]++;
              count++;
            }
          }

          // Clip histogram to prevent over-enhancement
          const clipVal = clipLimit * count / 256;
          let clipped = 0;
          for (let i = 0; i < 256; i++) {
            if (hist[i] > clipVal) {
              clipped += hist[i] - clipVal;
              hist[i] = clipVal;
            }
          }

          // Redistribute clipped pixels
          const redistribution = clipped / 256;
          for (let i = 0; i < 256; i++) {
            hist[i] += redistribution;
          }

          // Build CDF
          const cdf = new Array(256);
          cdf[0] = hist[0];
          for (let i = 1; i < 256; i++) {
            cdf[i] = cdf[i - 1] + hist[i];
          }

          // Normalize CDF
          for (let i = 0; i < 256; i++) {
            cdf[i] = cdf[i] / count;
          }

          cdfs[ty][tx] = cdf;
        }
      }

      // Apply equalization with bilinear interpolation
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const luma = lumaMap[idx];
          const bin = Math.floor(luma * 255);

          // Find tile coordinates (with sub-tile position for interpolation)
          const tileX = x / tileSize;
          const tileY = y / tileSize;
          const tx = Math.min(tilesX - 1, Math.floor(tileX));
          const ty = Math.min(tilesY - 1, Math.floor(tileY));
          const fx = tileX - tx;
          const fy = tileY - ty;

          // Bilinear interpolation between 4 neighboring tiles
          const tx1 = Math.min(tilesX - 1, tx + 1);
          const ty1 = Math.min(tilesY - 1, ty + 1);

          const v00 = cdfs[ty][tx][bin];
          const v10 = cdfs[ty][tx1][bin];
          const v01 = cdfs[ty1][tx][bin];
          const v11 = cdfs[ty1][tx1][bin];

          const v0 = v00 * (1 - fx) + v10 * fx;
          const v1 = v01 * (1 - fx) + v11 * fx;

          enhanced[idx] = v0 * (1 - fy) + v1 * fy;
        }
      }

      return enhanced;
    };

    // ========== TEMPORAL SMOOTHING (Exponential Moving Average) ==========
    const applyTemporalSmoothing = (
      currentLuma: Float32Array,
      socketId: string,
      alpha: number = 0.65 // 65% current, 35% previous (reduces flicker)
    ): Float32Array => {
      const cached = lumaCache.get(socketId);

      if (!cached || cached.length !== currentLuma.length) {
        // First frame or size changed - just cache and return
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
    };

    // ========== UNSHARP MASKING (Extreme Sharpness) ==========
    const applyUnsharpMask = (
      lumaMap: Float32Array,
      w: number,
      h: number,
      amount: number = 1.5, // Sharpening strength
      radius: number = 1 // Blur radius for mask
    ): Float32Array => {
      const sharpened = new Float32Array(w * h);

      // Simple 3x3 Gaussian blur for the mask
      const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
      ];
      const kernelSum = 16;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;

          // Apply Gaussian blur
          let blurred = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const ny = Math.max(0, Math.min(h - 1, y + ky));
              const nx = Math.max(0, Math.min(w - 1, x + kx));
              blurred += lumaMap[ny * w + nx] * kernel[ky + 1][kx + 1];
            }
          }
          blurred /= kernelSum;

          // Unsharp mask: sharpened = original + amount * (original - blurred)
          const original = lumaMap[idx];
          sharpened[idx] = Math.max(0, Math.min(1, original + amount * (original - blurred)));
        }
      }

      return sharpened;
    };

    // ========== LANCZOS RESAMPLING (High-Quality Downsampling) ==========
    const lanczosKernel = (x: number, a: number = 3): number => {
      if (x === 0) return 1;
      if (Math.abs(x) >= a) return 0;
      const piX = Math.PI * x;
      return (a * Math.sin(piX) * Math.sin(piX / a)) / (piX * piX);
    };

    const lanczosDownsample = (
      lumaMap: Float32Array,
      srcW: number,
      srcH: number,
      dstW: number,
      dstH: number
    ): Float32Array => {
      const downsampled = new Float32Array(dstW * dstH);
      const scaleX = srcW / dstW;
      const scaleY = srcH / dstH;
      const a = 3; // Lanczos-3

      for (let y = 0; y < dstH; y++) {
        for (let x = 0; x < dstW; x++) {
          const srcX = (x + 0.5) * scaleX;
          const srcY = (y + 0.5) * scaleY;

          let sum = 0;
          let weightSum = 0;

          // Sample a x a neighborhood
          for (let j = Math.floor(srcY - a); j <= Math.ceil(srcY + a); j++) {
            for (let i = Math.floor(srcX - a); i <= Math.ceil(srcX + a); i++) {
              if (i >= 0 && i < srcW && j >= 0 && j < srcH) {
                const weight = lanczosKernel((srcX - i) / scaleX, a) * lanczosKernel((srcY - j) / scaleY, a);
                sum += lumaMap[j * srcW + i] * weight;
                weightSum += weight;
              }
            }
          }

          downsampled[y * dstW + x] = weightSum > 0 ? sum / weightSum : 0;
        }
      }

      return downsampled;
    };


    // ========== CHARACTER SETS ==========
    // PERCEPTUALLY-CALIBRATED charset - ordered by actual visual weight (area coverage)
    // Each character measured for luminance contribution, NOT ASCII order
    // This prevents false edges and improves gradient smoothness
    const CHARSET_CALIBRATED = ' .`\'-_,^":;~!>+<i|?/\\Il1)(}{[]tfjrxnuvcz*XYUJCLQ0OoZmwqpbdkhao#MW&8%N@$';
    const charset = CHARSET_CALIBRATED;
    const charCount = charset.length;

    // Get pixel RGB at position (with horizontal flip to un-mirror webcam)
    const getPixel = (x: number, y: number): [number, number, number] => {
      const flippedX = width - 1 - x;  // Mirror horizontally
      const idx = y * width + flippedX;
      if (colored) {
        return [pixels[idx * 3], pixels[idx * 3 + 1], pixels[idx * 3 + 2]];
      } else {
        const gray = pixels[idx];
        return [gray, gray, gray];
      }
    };

    // Calculate luminance with Gamma correction for midtone boost (face visibility)
    const getLuminance = (r: number, g: number, b: number): number => {
      const linear = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // Gamma 1.5 boosts midtones significantly
      return Math.pow(linear, 1.0 / 1.5) * 255;
    };

    let asciiFrame = '';
    let lastFg = '';
    let lastBg = '';

    if (mode === 'braille') {
      // ========== BRAILLE MODE (8x Resolution via Braille Patterns) ==========
      // Uses 2x4 Braille patterns for 8x effective resolution (highest quality)
      // Unicode Braille: U+2800-U+28FF (256 patterns)
      //
      // Braille dot positions:  Pattern bits:
      //   1 4                   0x01 0x08
      //   2 5                   0x02 0x10
      //   3 6                   0x04 0x20
      //   7 8                   0x40 0x80

      const BRAILLE_BASE = 0x2800;

      // Build luminance map for temporal smoothing
      const lumaMap = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const [r, g, b] = getPixel(i % width, Math.floor(i / width));
        lumaMap[i] = getLuminance(r, g, b) / 255;
      }

      // Apply temporal smoothing
      const smoothedLuma = applyTemporalSmoothing(lumaMap, socket.id);

      // Process in 2x4 blocks
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 2) {
          // Sample 2x4 pixel block (8 dots)
          const dots: number[] = [];
          const colors: Array<[number, number, number]> = [];

          for (let dy = 0; dy < 4; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const px = Math.min(x + dx, width - 1);
              const py = Math.min(y + dy, height - 1);
              const idx = py * width + px;

              dots.push(smoothedLuma[idx]);
              colors.push(getPixel(px, py));
            }
          }

          // Apply Bayer dithering for smooth gradients
          const threshold = 0.5; // Base threshold
          let pattern = 0;

          // Map dots to Braille pattern bits
          // Left column (x): dots 0,1,2,3 -> bits 0,1,2,6
          // Right column (x+1): dots 4,5,6,7 -> bits 3,4,5,7
          if (dots[0] + BAYER_4X4[(y+0) % 4][(x+0) % 4] * 0.12 > threshold) pattern |= 0x01; // Dot 1
          if (dots[2] + BAYER_4X4[(y+1) % 4][(x+0) % 4] * 0.12 > threshold) pattern |= 0x02; // Dot 2
          if (dots[4] + BAYER_4X4[(y+2) % 4][(x+0) % 4] * 0.12 > threshold) pattern |= 0x04; // Dot 3
          if (dots[6] + BAYER_4X4[(y+3) % 4][(x+0) % 4] * 0.12 > threshold) pattern |= 0x40; // Dot 7
          if (dots[1] + BAYER_4X4[(y+0) % 4][(x+1) % 4] * 0.12 > threshold) pattern |= 0x08; // Dot 4
          if (dots[3] + BAYER_4X4[(y+1) % 4][(x+1) % 4] * 0.12 > threshold) pattern |= 0x10; // Dot 5
          if (dots[5] + BAYER_4X4[(y+2) % 4][(x+1) % 4] * 0.12 > threshold) pattern |= 0x20; // Dot 6
          if (dots[7] + BAYER_4X4[(y+3) % 4][(x+1) % 4] * 0.12 > threshold) pattern |= 0x80; // Dot 8

          const char = String.fromCharCode(BRAILLE_BASE + pattern);

          // Average color across 2x4 block
          let avgR = 0, avgG = 0, avgB = 0;
          for (const [r, g, b] of colors) {
            avgR += r; avgG += g; avgB += b;
          }
          avgR /= 8; avgG /= 8; avgB /= 8;

          const fgColor = rgbToBlessed(avgR, avgG, avgB);

          if (fgColor !== lastFg) {
            if (lastFg) asciiFrame += '{/}';
            asciiFrame += `{${fgColor}-fg}`;
            lastFg = fgColor;
          }

          asciiFrame += char;
        }

        if (lastFg) {
          asciiFrame += '{/}';
          lastFg = '';
        }
        if (y + 4 < height) asciiFrame += '\n';
      }
    } else if (mode === 'superres' || mode === 'halfblock') {
      // ========== RICH BLOCK MODE (Enhanced 4x Resolution with 10-Level Shading) ==========
      // Combines superres spatial detail (2x2 blocks) with graduated shading (10 levels)
      // Provides both fine spatial resolution AND smooth tonal transitions

      // 10-level graduated shading (darkest to brightest)
      // Each level represents ~10% brightness increments
      const SHADE_CHARS = [
        ' ',           // Level 0: 0-10% (empty/black)
        '\u2591',      // Level 1: 10-20% (░ light shade)
        '\u2592',      // Level 2: 20-30% (▒ medium shade)
        '\u2593',      // Level 3: 30-40% (▓ dark shade)
        '\u2596',      // Level 4: 40-50% (▖ lower left quadrant)
        '\u2584',      // Level 5: 50-60% (▄ lower half block)
        '\u258C',      // Level 6: 60-70% (▌ left half block)
        '\u259B',      // Level 7: 70-80% (▛ upper half and lower left)
        '\u2593',      // Level 8: 80-90% (▓ dark shade with bright fg)
        '\u2588',      // Level 9: 90-100% (█ full block)
      ];

      // Build luminance map for temporal smoothing
      const lumaMap = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const [r, g, b] = getPixel(i % width, Math.floor(i / width));
        lumaMap[i] = getLuminance(r, g, b) / 255;
      }

      // Apply temporal smoothing to reduce flicker
      const smoothedLuma = applyTemporalSmoothing(lumaMap, socket.id);

      // Process in 2x2 blocks for 4x effective resolution
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          // Sample 2x2 pixel block
          const pixels2x2: Array<[number, number, number]> = [];
          const lumas2x2: number[] = [];

          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const px = Math.min(x + dx, width - 1);
              const py = Math.min(y + dy, height - 1);
              const idx = py * width + px;

              pixels2x2.push(getPixel(px, py));
              lumas2x2.push(smoothedLuma[idx]);
            }
          }

          // Calculate average luminance across 2x2 block
          const avgLuma = (lumas2x2[0] + lumas2x2[1] + lumas2x2[2] + lumas2x2[3]) / 4;

          // Apply Bayer dithering for smoother gradients
          const bayerOffset = BAYER_4X4[y % 4][x % 4] * 0.08;
          const ditheredLuma = Math.max(0, Math.min(1, avgLuma + bayerOffset));

          // Map luminance to one of 10 shade levels
          const shadeLevel = Math.min(9, Math.floor(ditheredLuma * 10));
          const char = SHADE_CHARS[shadeLevel];

          // Average color across 2x2 block for realistic tinting
          let avgR = 0, avgG = 0, avgB = 0;
          for (const [r, g, b] of pixels2x2) {
            avgR += r; avgG += g; avgB += b;
          }
          avgR = Math.round(avgR / 4);
          avgG = Math.round(avgG / 4);
          avgB = Math.round(avgB / 4);

          // For higher shade levels (darker chars), boost foreground color for visibility
          const colorBoost = shadeLevel > 5 ? 1.2 : 1.0;
          const boostedR = Math.min(255, Math.round(avgR * colorBoost));
          const boostedG = Math.min(255, Math.round(avgG * colorBoost));
          const boostedB = Math.min(255, Math.round(avgB * colorBoost));

          const fgColor = rgbToBlessed(boostedR, boostedG, boostedB);

          if (fgColor !== lastFg) {
            if (lastFg) asciiFrame += '{/}';
            asciiFrame += `{${fgColor}-fg}`;
            lastFg = fgColor;
          }

          asciiFrame += char;
        }

        if (lastFg) {
          asciiFrame += '{/}';
          lastFg = '';
        }
        if (y + 2 < height) asciiFrame += '\n';
      }
    } else {
      // ========== ASCII CHARACTER MODE (WORLD-CLASS ENHANCED) ==========

      // PASS 1: Build initial luminance map
      const lumaMap = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const [r, g, b] = getPixel(i % width, Math.floor(i / width));
        lumaMap[i] = getLuminance(r, g, b) / 255;
      }

      // PASS 2: Apply temporal smoothing to reduce flicker
      const smoothedLuma = applyTemporalSmoothing(lumaMap, socket.id);

      // PASS 2.5: Histogram-based contrast stretching for better black usage
      // Find min/max luminance (ignore extreme outliers)
      const sortedLuma = Array.from(smoothedLuma).sort((a, b) => a - b);
      const minLuma = sortedLuma[Math.floor(sortedLuma.length * 0.02)]; // 2nd percentile
      const maxLuma = sortedLuma[Math.floor(sortedLuma.length * 0.98)]; // 98th percentile
      const lumaRange = maxLuma - minLuma;

      // Stretch contrast to use full 0-1 range
      const stretchedLuma = new Float32Array(width * height);
      for (let i = 0; i < smoothedLuma.length; i++) {
        if (lumaRange > 0) {
          stretchedLuma[i] = Math.max(0, Math.min(1, (smoothedLuma[i] - minLuma) / lumaRange));
        } else {
          stretchedLuma[i] = smoothedLuma[i];
        }
      }

      // PASS 3: Apply CLAHE for local contrast enhancement (REDUCED clip limit to preserve shadows)
      // (Makes faces visible even in challenging lighting)
      const contrastEnhanced = applyCLAHE(stretchedLuma, width, height, 8, 1.5); // Reduced from 2.5 to 1.5

      // PASS 4: Apply unsharp masking for extreme sharpness
      // (Amount=1.5 for strong sharpening without artifacts)
      const sharpenedLuma = applyUnsharpMask(contrastEnhanced, width, height, 1.5);

      // PASS 5: Detect edges for detail preservation
      const edgeMap = detectEdges(sharpenedLuma, width, height);

      // Find max edge strength for normalization
      let maxEdge = 0;
      for (let i = 0; i < edgeMap.length; i++) {
        if (edgeMap[i] > maxEdge) maxEdge = edgeMap[i];
      }

      // PASS 6: Render with edge-aware character selection
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const [r, g, b] = getPixel(x, y);
          let luma = sharpenedLuma[idx];

          // Apply Bayer dithering for smooth gradients
          const threshold = BAYER_4X4[y % 4][x % 4];
          luma = Math.max(0, Math.min(1, luma + threshold * 0.06)); // 6% dither (reduced for sharper image)

          // Edge-aware character boosting (ULTRA-AGGRESSIVE for maximum sharpness)
          // At strong edges, bias heavily toward denser characters
          const edgeStrength = maxEdge > 0 ? edgeMap[idx] / maxEdge : 0;
          if (edgeStrength > 0.20) {
            // Strong edge boost (makes eyes/nose/mouth ultra-sharp)
            luma = Math.pow(luma, 0.70); // Darken VERY significantly for dense chars (was 0.80)
          } else if (edgeStrength > 0.10) {
            // Medium edge boost
            luma = Math.pow(luma, 0.85); // (was 0.90)
          }

          // Additional gamma adjustment for more contrast
          // Push mid-tones toward extremes for better character differentiation
          luma = luma < 0.5 ? Math.pow(luma, 1.2) : Math.pow(luma, 0.8);

          // Map to character index
          const charIndex = Math.max(0, Math.min(charCount - 1, Math.floor(luma * (charCount - 1))));
          const char = charset[charIndex];

          // Color selection with LAB-based brightness adjustment
          const [fr, fg, fb] = brightenColor(r, g, b);
          const fgColor = rgbToBlessed(fr, fg, fb);

          const [br, bg2, bb] = dimColor(r, g, b);
          const bgColor = rgbToBlessed(br, bg2, bb, true);

          // Optimize tag output (only emit when colors change)
          if (fgColor !== lastFg || bgColor !== lastBg) {
            if (lastFg || lastBg) asciiFrame += '{/}';
            asciiFrame += `{${fgColor}-fg}{${bgColor}-bg}`;
            lastFg = fgColor;
            lastBg = bgColor;
          }

          asciiFrame += char;
        }

        // Close tags at line end
        if (lastFg || lastBg) {
          asciiFrame += '{/}';
          lastFg = '';
          lastBg = '';
        }

        if (y < height - 1) {
          asciiFrame += '\n';
        }
      }
    }

    // DEBUG: Count lines in frame to diagnose scrolling
    const lineCount = (asciiFrame.match(/\n/g) || []).length + 1;
    const hasTrailingNewline = asciiFrame.endsWith('\n');
    if (lineCount > height || hasTrailingNewline) {
      console.warn(`[VIDEO] Frame line mismatch: generated=${lineCount}, expected=${height}, trailingNewline=${hasTrailingNewline}, mode=${mode}`);
    }

    // Strip any trailing newlines that would cause extra scrolling
    const trimmedFrame = asciiFrame.replace(/\n+$/, '');

    const frameData = {
      userId: session?.user?.id,
      streamId: `video-${socket.id}`,
      frame: trimmedFrame
    };

    // Always send frame back to originating socket (for standalone demos)
    socket.emit('video:frame', frameData);

    // Also broadcast to voice room if in one
    if (session) {
      const roomId = session.currentVoiceChannelId || session.currentRoomId;
      if (roomId) {
        const voiceRoomId = `voice:${roomId}`;
        socket.to(voiceRoomId).emit('video:frame', frameData);
      }
    }
  });

  // Relay pre-rendered video frames (ASCII) to other participants
  socket.on('video:frame', (data: { streamId: string, frame: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const voiceRoomId = `voice:${roomId}`;
    // Broadcast to everyone in the voice room (including sender)
    io.to(voiceRoomId).emit('video:frame', {
      userId: session.user?.id,
      streamId: data.streamId,
      frame: data.frame
    });
  });

  // Relay speaking status to all participants (including sender for local UI sync)
  socket.on('voice:speaking', (data: { isSpeaking: boolean, audioLevel: number }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const voiceRoomId = `voice:${roomId}`;
    // Use the event name LiveChat is listening for
    io.to(voiceRoomId).emit('audio-speaking-status', {
      userId: session.user?.id,
      username: session.user?.username,
      isSpeaking: data.isSpeaking,
      audioLevel: data.audioLevel
    });
  });
}
