/**
 * Audio and Video Socket Handlers
 * 
 * Server-side implementation for real-time media streaming events.
 * Handles audio/video start/stop, subscription, and broadcasting.
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { BBSSession } from '../index';

export function registerAudioVideoHandlers(socket: Socket, io: SocketIOServer, sessions: Map<string, BBSSession>): void {
  
  // ========== AUDIO HANDLERS ==========

  socket.on('audio:start-streaming', (options: any, callback?: (response: any) => void) => {
    const session = sessions.get(socket.id);
    if (!session) {
      callback?.({ success: false, error: 'Session not found' });
      return;
    }

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) {
      callback?.({ success: false, error: 'Not in a voice channel or chat room' });
      return;
    }

    const streamId = `audio-${socket.id}`;
console.log(`[Audio] User ${session.user?.username} starting audio stream: ${streamId} in room ${roomId}`);

    // Notify the client (frontend) to start audio capture
    socket.emit('audio:start-streaming', { options, streamId });

    // Notify others in the room
    const voiceRoomId = `voice:${roomId}`;
    socket.to(voiceRoomId).emit('audio:stream-started', {
      userId: session.user?.id,
      username: session.user?.username,
      streamId,
      options
    });

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

  // Relay audio chunks to other participants
  socket.on('audio:data', (chunk: ArrayBuffer) => {
    const session = sessions.get(socket.id);
    if (!session) return;

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
  socket.on('video:data', (data: { width: number, height: number, colored?: boolean, mode?: 'halfblock' | 'ascii', data: ArrayBuffer }) => {
    const session = sessions.get(socket.id);

    const { width, height, colored, mode = 'halfblock', data: buffer } = data;
    const pixels = new Uint8Array(buffer);

    // ========== COLOR PALETTE ==========
    // Full 16-color ANSI palette with RGB values for distance calculation
    // Uses standard CGA/VGA color values
    const PALETTE: { name: string; r: number; g: number; b: number }[] = [
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
      { name: 'lightblack', r: 85, g: 85, b: 85 },  // gray
      { name: 'lightred', r: 255, g: 85, b: 85 },
      { name: 'lightgreen', r: 85, g: 255, b: 85 },
      { name: 'lightyellow', r: 255, g: 255, b: 85 },
      { name: 'lightblue', r: 85, g: 85, b: 255 },
      { name: 'lightmagenta', r: 255, g: 85, b: 255 },
      { name: 'lightcyan', r: 85, g: 255, b: 255 },
      { name: 'lightwhite', r: 255, g: 255, b: 255 },
    ];

    // Find nearest palette color index using weighted Euclidean distance
    const getClosestColorIndex = (r: number, g: number, b: number): number => {
      let minDist = Infinity;
      let bestIndex = 7; // Default to white

      for (let i = 0; i < PALETTE.length; i++) {
        const color = PALETTE[i];
        // Weighted distance (perception-based)
        const dr = (r - color.r) * 0.30;
        const dg = (g - color.g) * 0.59;
        const db = (b - color.b) * 0.11;
        const dist = dr * dr + dg * dg + db * db;

        if (dist < minDist) {
          minDist = dist;
          bestIndex = i;
        }
      }

      return bestIndex;
    };

    const getAnsiColorName = (index: number): string => PALETTE[index].name;

    // ========== CHARACTER SETS ==========
    // Characters sorted by visual density (calibrated - darkest to lightest)
    const CHARSET_FULL = ' `.-\':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@';
    const CHARSET_SYMBOLS = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
    const CHARSET_SIMPLE = ' .-:=+*#%@';
    const CHARSET_BLOCK = ' ░▒▓█';

    // Use the rich character set
    const charset = CHARSET_SYMBOLS;
    const charCount = charset.length;

    // Get pixel RGB at position
    const getPixel = (x: number, y: number): [number, number, number] => {
      const idx = y * width + x;
      if (colored) {
        return [pixels[idx * 3], pixels[idx * 3 + 1], pixels[idx * 3 + 2]];
      } else {
        const gray = pixels[idx];
        return [gray, gray, gray];
      }
    };

    // Calculate luminance for character selection
    const getLuminance = (r: number, g: number, b: number): number => {
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    let asciiFrame = '';
    let lastFg = '';
    let lastBg = '';

    if (mode === 'halfblock') {
      // ========== HALF-BLOCK MODE ==========
      // Uses ▀ character with fg+bg colors for 2x vertical resolution
      const UPPER_HALF = '\u2580'; // ▀

      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x++) {
          // Top pixel -> foreground color
          const [r1, g1, b1] = getPixel(x, y);
          const fgIndex = getClosestColorIndex(r1, g1, b1);
          const fgColor = getAnsiColorName(fgIndex);

          // Bottom pixel -> background color
          let bgColor: string;
          if (y + 1 < height) {
            const [r2, g2, b2] = getPixel(x, y + 1);
            const bgIndex = getClosestColorIndex(r2, g2, b2);
            bgColor = getAnsiColorName(bgIndex);
          } else {
            bgColor = fgColor;
          }

          // Optimize: only emit color tags when they change
          if (fgColor !== lastFg || bgColor !== lastBg) {
            if (lastFg || lastBg) asciiFrame += '{/}';
            asciiFrame += `{${fgColor}-fg}{${bgColor}-bg}`;
            lastFg = fgColor;
            lastBg = bgColor;
          }

          asciiFrame += UPPER_HALF;
        }

        if (lastFg || lastBg) {
          asciiFrame += '{/}';
          lastFg = '';
          lastBg = '';
        }
        if (y + 2 < height) asciiFrame += '\n';
      }
    } else {
      // ========== ASCII CHARACTER MODE (ENHANCED 4-SHADE) ==========
      // Maps luminance to 4 contrast zones for maximum dynamic range
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const [r, g, b] = getPixel(x, y);

          // 1. Calculate Standard Luminance
          const luma = getLuminance(r, g, b); // 0-255
          const lumaNorm = luma / 255; // 0.0-1.0

          // 2. Determine Base Hue (0-7)
          const colorIndex = getClosestColorIndex(r, g, b);
          const baseHue = colorIndex % 8; // Collapse bright/dim to base hue

          let fgName: string;
          let bgName: string;
          let charIndex: number;

          // 3. Apply 4-Zone Logic
          if (lumaNorm < 0.25) {
            // Zone 1: Deep Shadows (0% - 25%)
            // BG: Black, FG: Dark Color
            // Char: Density increases with luma
            bgName = 'black';
            fgName = getAnsiColorName(baseHue); // Dark version
            const zoneProgress = lumaNorm / 0.25;
            charIndex = Math.floor(zoneProgress * (charCount - 1));
          } 
          else if (lumaNorm < 0.50) {
            // Zone 2: Mid-Shadows (25% - 50%)
            // BG: Black, FG: Light Color
            // Char: Density increases with luma
            bgName = 'black';
            fgName = getAnsiColorName(baseHue + 8); // Light version
            const zoneProgress = (lumaNorm - 0.25) / 0.25;
            charIndex = Math.floor(zoneProgress * (charCount - 1));
          } 
          else if (lumaNorm < 0.75) {
            // Zone 3: Mid-Highlights (50% - 75%)
            // BG: Light Color, FG: Dark Color
            // Char: INVERTED density (starts full, thins out to reveal BG)
            // This creates the "Dark on Light" effect
            bgName = getAnsiColorName(baseHue + 8); // Light BG
            fgName = getAnsiColorName(baseHue);     // Dark FG
            const zoneProgress = (lumaNorm - 0.50) / 0.25;
            // Invert character index
            charIndex = (charCount - 1) - Math.floor(zoneProgress * (charCount - 1));
          } 
          else {
            // Zone 4: Highlights (75% - 100%)
            // BG: Light Color, FG: White
            // Char: Density increases with luma (adding White to Light BG)
            bgName = getAnsiColorName(baseHue + 8); // Light BG
            fgName = 'white';                       // White FG
            const zoneProgress = (lumaNorm - 0.75) / 0.25;
            charIndex = Math.floor(zoneProgress * (charCount - 1));
          }

          // Clamp charIndex
          charIndex = Math.max(0, Math.min(charCount - 1, charIndex));
          const char = charset[charIndex];

          // Optimize: only emit color tags when they change
          if (fgName !== lastFg || bgName !== lastBg) {
            if (lastFg || lastBg) asciiFrame += '{/}';
            asciiFrame += `{${fgName}-fg}{${bgName}-bg}`;
            lastFg = fgName;
            lastBg = bgName;
          }

          asciiFrame += char;
        }

        if (lastFg || lastBg) {
          asciiFrame += '{/}';
          lastFg = '';
          lastBg = '';
        }
        if (y < height - 1) asciiFrame += '\n';
      }
    }

    const frameData = {
      userId: session?.user?.id,
      streamId: `video-${socket.id}`,
      frame: asciiFrame
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
