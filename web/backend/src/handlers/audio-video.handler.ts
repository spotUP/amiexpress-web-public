/**
 * Audio and Video Socket Handlers
 * 
 * Server-side implementation for real-time media streaming events.
 * Handles audio/video start/stop, subscription, and broadcasting.
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import { getSessionBySocketId } from '../server/session-manager';
import type { BBSSession } from '../index';
import {
  AMIGA16_NAMES,
  BAYER_4X4,
  applyTemporalSmoothing as smoothLuma,
  cellsToBlessedTags,
  frameToAnsiCells,
  getLuminance,
  nearestPaletteIndex,
  type TemporalState,
} from '@amiexpress/bbs-door-sdk/media/ascii';
import { renderShapeAscii } from '../utils/shape-ascii.util';

/**
 * The render modes a client may ask for on `video:data`.
 *
 * `'color'` was missing from this union while the livechat door had been
 * sending it all along (`video-cells.ts` maps it to MODE_ASCII_COLOR). It
 * worked only because an unrecognised mode falls through every branch below
 * to the ASCII one, which is what coloured ASCII wants - so the protocol was
 * right by accident and the type was wrong. Naming it here makes the
 * fall-through a decision instead of a coincidence.
 *
 * `'superres'` is an alias of `'halfblock'`, and `'hsv'` and `'shape'` are
 * backend-only modes the door does not offer.
 */
export type VideoMode =
  | 'braille' | 'superres' | 'halfblock' | 'ascii' | 'hsv' | 'shape' | 'color';

/**
 * What a client that names no mode gets.
 *
 * Coloured ASCII, matching `DEFAULT_RENDER_MODE` in
 * `Doors/livechat/video-cells.ts`. These two cannot share a constant - the
 * backend deliberately imports nothing from `Doors/` - so
 * `web/backend/tests/doors/livechat-default-render-mode.test.ts` asserts they
 * still render the same thing. Change one and that test names the other.
 */
export const DEFAULT_VIDEO_MODE: VideoMode = 'color';

// Per-stream temporal smoothing state (stabilizes flickering pixels).
// Keyed by the socket object, not socket.id: a web session's link keeps
// its object across a resume while its id moves to the new raw socket
// (session-parking.ts), so an id key would orphan the entry.
const temporalStates = new WeakMap<object, TemporalState>();
const stateFor = (key: object): TemporalState => {
  let st = temporalStates.get(key);
  if (!st) { st = { luma: null }; temporalStates.set(key, st); }
  return st;
};
const rgbToBlessed = (r: number, g: number, b: number): string =>
  AMIGA16_NAMES[nearestPaletteIndex(r, g, b, 'amiga16')];

export function registerAudioVideoHandlers(socket: Socket, io: SocketIOServer, sessions: Map<string, BBSSession>): void {
  
  // Cleanup cache on disconnect
  socket.on('disconnect', () => {
    temporalStates.delete(socket);
  });

  // ========== AUDIO HANDLERS ==========

  socket.on('audio:start-streaming', (options: any, callback?: (response: any) => void) => {
    const session = getSessionBySocketId(socket.id);
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
    const session = getSessionBySocketId(socket.id);
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
    const session = getSessionBySocketId(socket.id);
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
    const session = getSessionBySocketId(socket.id);
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
    const session = getSessionBySocketId(socket.id);
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

  // Which microphone the browser opened. Logged, not relayed: it answers
  // "are we even listening to the right device?" without a browser console.
  socket.on('audio:device', (info: any) => {
console.log('[Audio][device]', info?.label ?? 'unknown', JSON.stringify(info?.settings ?? {}));
  });

  // Stutter diagnostics from the browser. Logged, not relayed - the same
  // treatment as audio:device above, and for the same reason: it answers a
  // question about a live call without needing somebody's browser console.
  // A clean call sends nothing, so any line here is a real complaint.
  socket.on('audio:stats', (stats: any) => {
    const session = getSessionBySocketId(socket.id);
    const who = session?.user?.username ?? 'unknown';
console.log(`[Audio][stutter] ${who}`, JSON.stringify(stats ?? {}));
  });

  // Relay audio chunks to other participants
  socket.on('audio:data', (chunk: ArrayBuffer) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    // No echo back to the sender.
    //
    // This used to send your own audio to you "for local VU meters", which
    // was harmless only because nothing could decode it. Now that packets
    // actually play, echoing them means hearing yourself a fraction of a
    // second late - the single most disorienting thing a voice call can do.
    // The level meter comes from the local analyser, not from this, so
    // nothing needs the echo, and dropping it halves the traffic.
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
  // Modes: 'braille' (8x resolution), 'superres'/'halfblock' (4x rich mode with 10-level shading), 'ascii' (character-based), 'hsv' (16-color HSV-based), 'shape' (shape-based geometric rendering)
  socket.on('video:data', (data: { width: number, height: number, colored?: boolean, mode?: VideoMode, data: ArrayBuffer }) => {
    const session = getSessionBySocketId(socket.id);

    const { width, height, colored, mode = DEFAULT_VIDEO_MODE, data: buffer } = data;
    const pixels = new Uint8Array(buffer);

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
      const smoothedLuma = smoothLuma(lumaMap, stateFor(socket));

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
      const smoothedLuma = smoothLuma(lumaMap, stateFor(socket));

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
    } else if (mode === 'hsv') {
      // 16-colour retro ASCII: value-ramp characters, Sobel edge characters,
      // hue colour per cell. The SDK converter owns the algorithm.
      asciiFrame = cellsToBlessedTags(
        frameToAnsiCells(
          { data: pixels, width, height, channels: colored ? 3 : 1 },
          width, height,
          { palette: 'amiga16', mode: 'hsv', mirror: true },
        ),
        { background: false },
      );
    } else if (mode === 'shape') {
      // ========== SHAPE-BASED MODE (Alex Harri Algorithm) ==========
      // Uses 6-dimensional shape vectors for character selection instead of brightness-only
      // Provides 5-10x sharper edges and characters that follow geometric shapes
      //
      // Key features:
      // - 6D sampling (TL, TR, ML, MR, BL, BR) captures directional density
      // - k-d tree for O(log n) nearest neighbor search
      // - Quantization caching for O(1) performance after warmup
      // - Directional contrast enhancement (external sampling suppresses internal)
      // - Global contrast enhancement (power function sharpens edges)
      //
      // See: https://alexharri.com/blog/ascii-rendering

      asciiFrame = renderShapeAscii(pixels, width, height, {
        colored: false, // Grayscale for now (color integration TODO)
        contrastExponent: 2.5, // Higher = sharper edges
        directionalContrast: false, // Disabled by default (causes issues with thin features)
        suppressionFactor: 0.7, // 70% suppression for external regions (if enabled)
        externalDistance: 0.15, // External sampling distance in cell units
        useCache: true, // Enable quantization caching
      });
    } else {
      // Coloured ASCII: the SDK converter, with this socket's temporal state.
      asciiFrame = cellsToBlessedTags(
        frameToAnsiCells(
          { data: pixels, width, height, channels: colored ? 3 : 1 },
          width, height,
          { palette: 'amiga16', mode: 'ascii', state: stateFor(socket), mirror: true, bgLevels: 16 },
        ),
      );
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
      // The NAME travels too: a door that sees a frame from somebody it has
      // no tile for can then label the tile it makes for them.
      username: session?.user?.username,
      streamId: `video-${socket.id}`,
      frame: trimmedFrame
    };

    // No frame back to the sender: it costs exactly as much as somebody
    // else's picture and only shows you yourself.

    // Also broadcast to voice room if in one
    if (session) {
      const roomId = session.currentVoiceChannelId || session.currentRoomId;
      if (roomId) {
        const voiceRoomId = `voice:${roomId}`;
        socket.to(voiceRoomId).emit('video:frame', frameData);
      }
    }
  });

  // Relay compact binary frames - one byte per cell, deltas against the
  // previous frame. Same routing as the text frames below; the payload is
  // opaque here, since only the door that draws it needs to understand it.
  socket.on('video:cells', (packet: ArrayBuffer) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const cellFrame = {
      userId: session.user?.id,
      username: session.user?.username,
      packet,
    };

    socket.to(`voice:${roomId}`).emit('video:cells', cellFrame);

    // And back to the sender, so you can see your own camera.
    //
    // socket.to() excludes the sender by definition, and the video grid is
    // drawn by the SERVER-SIDE door rather than the browser, so nothing local
    // could show you yourself. Alone in a channel you therefore sent frames
    // and received none, and the tile sat on "WAITING FOR VIDEO" for ever -
    // reported 2026-08-26 as a camera that "just wouldn't work", by somebody
    // whose camera was working the whole time.
    //
    // Only this codec is echoed: a cell packet is under 2 KB at ~2.3 fps.
    // The ASCII video:frame path below still excludes the sender, because
    // that one carries a whole rendered screen of text.
    //
    // The door decides whether to draw it - own frames are gated on the local
    // camera being on - so this is a self view, not an unconditional tile.
    socket.emit('video:cells', cellFrame);
  });

  // Relay pre-rendered video frames (ASCII) to other participants
  socket.on('video:frame', (data: { streamId: string, frame: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const voiceRoomId = `voice:${roomId}`;
    // Everyone EXCEPT the sender.
    //
    // Sending a frame back to the browser that just produced it doubled the
    // video traffic to pay for a self-preview nobody asked for - you can
    // already see yourself in the mirror, and the picture cost the same as
    // everybody else's. `socket.to` excludes the sender; `io.to` did not.
    socket.to(voiceRoomId).emit('video:frame', {
      userId: session.user?.id,
      username: session.user?.username,
      streamId: data.streamId,
      frame: data.frame
    });
  });

  // Relay speaking status to all participants (including sender for local UI sync)
  socket.on('voice:speaking', (data: { isSpeaking: boolean, audioLevel: number }) => {
    const session = getSessionBySocketId(socket.id);
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
