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

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) {
      callback?.({ success: false, error: 'Not in a voice channel or chat room' });
      return;
    }

    const streamId = `video-${socket.id}`;
    console.log(`[Video] User ${session.user?.username} starting video stream: ${streamId} in room ${roomId}`);

    // Notify others in the room
    const voiceRoomId = `voice:${roomId}`;
    socket.to(voiceRoomId).emit('video:stream-started', {
      userId: session.user?.id,
      username: session.user?.username,
      streamId,
      options: data.options
    });

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

  // Handle raw video data and convert to ASCII
  socket.on('video:data', (data: { width: number, height: number, data: ArrayBuffer }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const { width, height, data: buffer } = data;
    const pixels = new Uint8Array(buffer);
    
    // Convert to ASCII
    const chars = ' .:-=+*#%@';
    let asciiFrame = '';
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const luminance = pixels[y * width + x];
        const charIdx = Math.floor((luminance / 255) * (chars.length - 1));
        const char = chars[charIdx];
        
        // Simple ANSI grayscale mapping using 16 colors
        // 0-63: black, 64-127: dark gray, 128-191: light gray, 192-255: white
        let colorCode = '37'; // Default white
        if (luminance < 64) colorCode = '30';
        else if (luminance < 128) colorCode = '90';
        else if (luminance < 192) colorCode = '37';
        else colorCode = '97';
        
        asciiFrame += `\x1b[${colorCode}m${char}`;
      }
      if (y < height - 1) asciiFrame += '\r\n';
    }

    const voiceRoomId = `voice:${roomId}`;
    // Broadcast the ASCII frame to everyone else in the voice room
    socket.to(voiceRoomId).emit('video:frame', {
      userId: session.user?.id,
      streamId: `video-${socket.id}`,
      frame: asciiFrame
    });
  });

  // Relay pre-rendered video frames (ASCII) to other participants
  socket.on('video:frame', (data: { streamId: string, frame: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const voiceRoomId = `voice:${roomId}`;
    // Broadcast to everyone else in the voice room
    socket.to(voiceRoomId).emit('video:frame', {
      userId: session.user?.id,
      streamId: data.streamId,
      frame: data.frame
    });
  });
}
