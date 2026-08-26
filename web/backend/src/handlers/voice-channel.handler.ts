/**
 * Voice Channel Handler
 *
 * Discord-style voice channels for livechat
 * - Join/leave voice channels
 * - Track participants
 * - Broadcast speaking status
 * - Handle video toggles
 * - Integrate with audio streaming service
 */

import type { Socket } from 'socket.io';
import { getSessionBySocketId } from '../server/session-manager';
import type { BBSSession } from '../index';
import { getSystemTime } from '../utils/date-time.util';

interface VoiceParticipant {
  userId: number | string;
  username: string;
  socketId: string;
  isMuted: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
  joinedAt: Date;
}

// Map of roomId -> Map of userId -> VoiceParticipant
const voiceChannels = new Map<string, Map<number | string, VoiceParticipant>>();

/**
 * Get voice channel participants for a room
 */
function getVoiceParticipants(roomId: string): VoiceParticipant[] {
  const participants = voiceChannels.get(roomId);
  if (!participants) return [];
  return Array.from(participants.values());
}

/**
 * Add participant to voice channel
 */
function addVoiceParticipant(
  roomId: string,
  userId: number | string,
  username: string,
  socketId: string
): VoiceParticipant {
  if (!voiceChannels.has(roomId)) {
    voiceChannels.set(roomId, new Map());
  }

  const participant: VoiceParticipant = {
    userId,
    username,
    socketId,
    isMuted: false,
    hasVideo: false,
    hasScreenShare: false,
    joinedAt: getSystemTime(),
  };

  voiceChannels.get(roomId)!.set(userId, participant);
  return participant;
}

/**
 * Remove participant from voice channel
 */
function removeVoiceParticipant(roomId: string, userId: number | string): boolean {
  const participants = voiceChannels.get(roomId);
  if (!participants) return false;

  const removed = participants.delete(userId);

  // Clean up empty channels
  if (participants.size === 0) {
    voiceChannels.delete(roomId);
  }

  return removed;
}

/**
 * Get participant from voice channel
 */
function getVoiceParticipant(roomId: string, userId: number | string): VoiceParticipant | undefined {
  const participants = voiceChannels.get(roomId);
  if (!participants) return undefined;
  return participants.get(userId);
}

/**
 * Register voice channel handlers on a socket
 */
/**
 * NOTE ON SESSION LOOKUPS
 *
 * These handlers are handed the `sessions` map, which is keyed by NODE ID -
 * so `sessions.get(socket.id)` never found anything, and every
 * voice:join-channel answered "Session not found". Nobody ever joined a
 * voice channel: two people in the same room each saw a grid containing only
 * themselves, which is why "I am connected with two users and still see only
 * one video" (2026-08-26). getSessionBySocketId walks socket.id -> nodeId ->
 * session, which is the lookup that works.
 */
/**
 * Join a voice channel, and tell everybody already in it.
 *
 * Exported because a DOOR cannot reach the socket handlers above. A door
 * runs inside this process and talks over a wrapped socket whose `emit`
 * goes server->CLIENT; emitting 'voice:join-channel' there sent the request
 * to the browser, which has no handler for it. The backend never saw a
 * single join - which is why voice "never worked" while the protocol
 * itself was fine. The door wrapper calls this directly instead, exactly
 * as it already does for room:join.
 */
export function joinVoiceChannel(
  socket: Socket,
  data: { channelId?: string; channelName?: string } | undefined
): { success: boolean; error?: string; channelId?: string; participants?: any[] } {
  const session = getSessionBySocketId(socket.id);
  if (!session) return { success: false, error: 'Session not found' };

  const userId = session.user?.id;
  const username = session.user?.username || 'Unknown';
  if (!userId) return { success: false, error: 'User not authenticated' };

  const channelId = data?.channelId || data?.channelName || 'default-voice';

  const participant = addVoiceParticipant(channelId, userId, username, socket.id);
  session.currentVoiceChannelId = channelId;

  const voiceRoomId = `voice:${channelId}`;
  socket.join(voiceRoomId);

console.log(`[Voice Channel] User ${username} joined voice channel: ${channelId}`);

  const participants = getVoiceParticipants(channelId);

  socket.to(voiceRoomId).emit('voice:joined', {
    userId,
    username,
    channelId,
    isMuted: participant.isMuted,
    hasVideo: participant.hasVideo,
    hasScreenShare: participant.hasScreenShare,
  });

  return {
    success: true,
    channelId,
    participants: participants.map(p => ({
      userId: p.userId,
      username: p.username,
      isMuted: p.isMuted,
      hasVideo: p.hasVideo,
      hasScreenShare: p.hasScreenShare,
    })),
  };
}

/** Leave a voice channel, and tell the people still in it. */
export function leaveVoiceChannel(
  socket: Socket,
  data?: { channelId?: string }
): { success: boolean; channelId?: string } {
  const session = getSessionBySocketId(socket.id);
  if (!session) return { success: false };

  const userId = session.user?.id;
  if (!userId) return { success: false };

  const channelId = data?.channelId || session.currentVoiceChannelId || session.currentRoomId;
  if (!channelId) return { success: false };

  const removed = removeVoiceParticipant(channelId, userId);
  if (!removed) return { success: false, channelId };

  delete session.currentVoiceChannelId;
  const voiceRoomId = `voice:${channelId}`;
  socket.leave(voiceRoomId);

  socket.to(voiceRoomId).emit('voice:left', {
    userId,
    channelId,
  });

console.log(`[Voice Channel] User ${session.user?.username} left voice channel: ${channelId}`);

  return { success: true, channelId };
}

/** Mute or unmute, and tell the channel. Callable by a door (see above). */
export function setVoiceMute(socket: Socket, data: { isMuted: boolean }): boolean {
  const session = getSessionBySocketId(socket.id);
  if (!session) return false;

  const roomId = session.currentVoiceChannelId || session.currentRoomId;
  if (!roomId) return false;

  const userId = session.user?.id;
  if (!userId) return false;

  const participant = getVoiceParticipant(roomId, userId);
  if (!participant) return false;

  participant.isMuted = data.isMuted;

  socket.to(`voice:${roomId}`).emit('voice:mute', {
    userId,
    isMuted: data.isMuted,
  });
  return true;
}

/** Turn video on or off, and tell the channel. Callable by a door. */
export function setVoiceVideo(socket: Socket, data: { hasVideo: boolean }): boolean {
  const session = getSessionBySocketId(socket.id);
  if (!session) return false;

  const roomId = session.currentVoiceChannelId || session.currentRoomId;
  if (!roomId) return false;

  const userId = session.user?.id;
  if (!userId) return false;

  const participant = getVoiceParticipant(roomId, userId);
  if (!participant) return false;

  participant.hasVideo = data.hasVideo;

  socket.to(`voice:${roomId}`).emit('voice:video-toggle', {
    userId,
    hasVideo: data.hasVideo,
  });

console.log(`[Voice Channel] User ${session.user?.username} ${data.hasVideo ? 'enabled' : 'disabled'} video`);
  return true;
}

export function registerVoiceChannelHandlers(socket: Socket, io: any, sessions: Map<string, BBSSession>): void {
  /**
   * Join voice channel (legacy - joins current room's voice)
   */
  socket.on('voice:join', (callback?: (response: any) => void) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) {
      callback?.({ success: false, error: 'Session not found' });
      return;
    }

    const roomId = session.currentRoomId;
    if (!roomId) {
      callback?.({ success: false, error: 'Not in a chat room' });
      return;
    }

    const userId = session.user?.id;
    const username = session.user?.username || 'Unknown';

    if (!userId) {
      callback?.({ success: false, error: 'User not authenticated' });
      return;
    }

    // Add participant to voice channel
    const participant = addVoiceParticipant(roomId, userId, username, socket.id);
    session.currentVoiceChannelId = roomId;

    // Join voice room (separate from chat room)
    const voiceRoomId = `voice:${roomId}`;
    socket.join(voiceRoomId);

console.log(`[Voice Channel] User ${username} joined voice channel in room ${roomId}`);

    // Get all participants
    const participants = getVoiceParticipants(roomId);

    // Notify others in voice channel
    // The CHANNEL travels with it, exactly as voice:leave-channel does. A
    // door keys its roster by channel; without one the joiner was filed
    // under `undefined` and the real channel's count never moved.
    socket.to(voiceRoomId).emit('voice:joined', {
      userId,
      username,
      channelId: roomId,
      isMuted: participant.isMuted,
      hasVideo: participant.hasVideo,
      hasScreenShare: participant.hasScreenShare,
    });

    // Send response with existing participants
    callback?.({
      success: true,
      roomId,
      participants: participants.map(p => ({
        userId: p.userId,
        username: p.username,
        isMuted: p.isMuted,
        hasVideo: p.hasVideo,
        hasScreenShare: p.hasScreenShare,
      })),
    });
  });

  /**
   * Leave voice channel
   */
  socket.on('voice:leave', () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const roomId = session.currentRoomId;
    if (!roomId) return;

    const userId = session.user?.id;
    if (!userId) return;

    // Remove from voice channel
    const removed = removeVoiceParticipant(roomId, userId);

    if (removed) {
      delete session.currentVoiceChannelId;
      const voiceRoomId = `voice:${roomId}`;
      socket.leave(voiceRoomId);

      // Notify others. The CHANNEL travels with it: the door keys its
      // roster by channel, and a voice:left without one matched nothing, so
      // people who left stayed in the list for ever.
      socket.to(voiceRoomId).emit('voice:left', {
        userId,
        channelId: roomId,
      });

console.log(`[Voice Channel] User ${session.user?.username} left voice channel in room ${roomId}`);
    }
  });

  /**
   * Join specific voice channel (Discord-style - by channel ID/name)
   */
  socket.on('voice:join-channel', (data: { channelId?: string; channelName?: string }, callback?: (response: any) => void) => {
    callback?.(joinVoiceChannel(socket, data));
  });

  /**
   * Leave specific voice channel
   */
  socket.on('voice:leave-channel', (data?: { channelId?: string }) => {
    leaveVoiceChannel(socket, data);
  });

  /**
   * Toggle mute status
   */
  socket.on('voice:mute', (data: { isMuted: boolean }) => {
    setVoiceMute(socket, data);
  });

  /**
   * Toggle video
   */
  socket.on('voice:video-toggle', (data: { hasVideo: boolean }) => {
    setVoiceVideo(socket, data);
  });

  /**
   * Toggle screen share
   */
  socket.on('voice:screenshare-toggle', (data: { hasScreenShare: boolean }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const userId = session.user?.id;
    if (!userId) return;

    const participant = getVoiceParticipant(roomId, userId);
    if (!participant) return;

    participant.hasScreenShare = data.hasScreenShare;

    // Broadcast screen share status
    const voiceRoomId = `voice:${roomId}`;
    socket.to(voiceRoomId).emit('voice:screenshare-toggle', {
      userId,
      hasScreenShare: data.hasScreenShare,
    });

console.log(`[Voice Channel] User ${session.user?.username} ${data.hasScreenShare ? 'started' : 'stopped'} screen share`);
  });

  /**
   * Relay speaking status (from audio streaming VAD)
   */
  socket.on('voice:speaking', (data: { isSpeaking: boolean; audioLevel: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const userId = session.user?.id;
    if (!userId) return;

    const participant = getVoiceParticipant(roomId, userId);
    if (!participant || participant.isMuted) return;

    // Broadcast speaking status
    const voiceRoomId = `voice:${roomId}`;
    socket.to(voiceRoomId).emit('voice:speaking', {
      userId,
      isSpeaking: data.isSpeaking,
      audioLevel: data.audioLevel,
    });
  });

  /**
   * Handle disconnect - clean up voice channel
   */
  socket.on('disconnect', () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const roomId = session.currentVoiceChannelId || session.currentRoomId;
    if (!roomId) return;

    const userId = session.user?.id;
    if (!userId) return;

    // Remove from voice channel
    const removed = removeVoiceParticipant(roomId, userId);

    if (removed) {
      const voiceRoomId = `voice:${roomId}`;
      socket.to(voiceRoomId).emit('voice:left', {
        userId,
        channelId: roomId,
      });

console.log(`[Voice Channel] User ${session.user?.username} disconnected from voice channel`);
    }
  });
}

/**
 * Get voice channel statistics
 */
export function getVoiceChannelStats(): {
  totalChannels: number;
  totalParticipants: number;
  channels: Array<{
    roomId: string;
    participantCount: number;
    participants: Array<{
      username: string;
      isMuted: boolean;
      hasVideo: boolean;
      hasScreenShare: boolean;
    }>;
  }>;
} {
  const channels = [];
  let totalParticipants = 0;

  for (const [roomId, participants] of voiceChannels.entries()) {
    totalParticipants += participants.size;

    channels.push({
      roomId,
      participantCount: participants.size,
      participants: Array.from(participants.values()).map(p => ({
        username: p.username,
        isMuted: p.isMuted,
        hasVideo: p.hasVideo,
        hasScreenShare: p.hasScreenShare,
      })),
    });
  }

  return {
    totalChannels: voiceChannels.size,
    totalParticipants,
    channels,
  };
}
