/**
 * Chat Socket Event Handlers
 * Handles internode (user-to-user) and room (multi-user) chat events
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { getSessionBySocketId } from './session-manager';
import { sendChatMessage, acceptChat } from '../handlers/chat/chat.handler';

/**
 * Register chat socket event handlers
 */
export function registerChatHandlers(socket: Socket, chatState: any) {
  console.log('[CHAT DEBUG] registerChatHandlers called for socket:', socket.id);
  // NOTE: Don't return early if no session - handlers check session themselves
  // The session may not exist when handlers are registered but will exist when called

  // Debug: Log ALL events on this socket
  socket.onAny((eventName, ...args) => {
    if (eventName.startsWith('room:') || eventName.startsWith('chat:')) {
      console.log('[CHAT DEBUG] Socket received event:', eventName, JSON.stringify(args));
    }
  });

  // ===== LEGACY CHAT HANDLERS (Sysop pager) =====

  // Handle special chat commands (legacy sysop chat)
  socket.on('chat-message', (message: string) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  // Handle sysop accepting chat request (legacy)
  socket.on('accept-chat', (sessionId: string) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;
    // Sysop accepting chat request
    const chatSession = chatState.activeSessions.find((s: any) => s.id === sessionId);
    if (chatSession && session.user?.secLevel === 255) { // Sysop level
      acceptChat(socket, session, chatSession);
    }
  });

  // ===== INTERNODE CHAT EVENTS (User-to-User) =====

  socket.on('chat:request', async (data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatRequest } = require('../handlers/chat/internode-chat.handler');
    await handleChatRequest(socket, session, data);
  });

  socket.on('chat:accept', async (data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatAccept } = require('../handlers/chat/internode-chat.handler');
    await handleChatAccept(socket, session, data);
  });

  socket.on('chat:decline', async (data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatDecline } = require('../handlers/chat/internode-chat.handler');
    await handleChatDecline(socket, session, data);
  });

  socket.on('chat:message', async (data: { message: string }) => {
    console.log('📨 [SOCKET.IO] Received chat:message event from client');
    console.log('📨 [SOCKET.IO] Data:', data);
    console.log('📨 [SOCKET.IO] Socket ID:', socket.id);
    const session = getSessionBySocketId(socket.id);
    if (!session) {
      console.log('❌ [SOCKET.IO] No session found for socket:', socket.id);
      return;
    }
    console.log('📨 [SOCKET.IO] Session found, user:', session.user?.username);

    const { handleChatMessage } = require('../handlers/chat/internode-chat.handler');
    await handleChatMessage(socket, session, data);
    console.log('📨 [SOCKET.IO] handleChatMessage completed');
  });

  socket.on('chat:end', async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatEnd } = require('../handlers/chat/internode-chat.handler');
    await handleChatEnd(socket, session);
  });

  // ===== GROUP CHAT ROOM EVENTS (Multi-User) =====

  socket.on('room:create', async (data: { roomName: string; topic?: string; isPublic?: boolean; password?: string; maxUsers?: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomCreate } = require('../handlers/chat/group-chat.handler');
    await handleRoomCreate(socket, session, data);
  });

  socket.on('room:join', async (data: { roomId?: string; roomName?: string; password?: string }) => {
    console.log('[CHAT DEBUG] room:join received:', data);
    const session = getSessionBySocketId(socket.id);
    if (!session) {
      console.log('[CHAT DEBUG] No session found for socket:', socket.id);
      return;
    }
    console.log('[CHAT DEBUG] Session found - userId:', session.userId, 'username:', session.username, 'currentRoomId:', session.currentRoomId);

    const { handleRoomJoin } = require('../handlers/chat/group-chat.handler');
    await handleRoomJoin(socket, session, data);
  });

  socket.on('room:leave', async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomLeave } = require('../handlers/chat/group-chat.handler');
    await handleRoomLeave(socket, session);
  });

  socket.on('room:message', async (data: { message: string }) => {
    console.log('[CHAT DEBUG] room:message received:', data);
    const session = getSessionBySocketId(socket.id);
    if (!session) {
      console.log('[CHAT DEBUG] No session for room:message');
      return;
    }
    console.log('[CHAT DEBUG] Message from:', session.username, 'in room:', session.currentRoomId);

    const { handleRoomMessage } = require('../handlers/chat/group-chat.handler');
    await handleRoomMessage(socket, session, data);
  });

  socket.on('room:list', async (data?: { showPrivate?: boolean }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomList } = require('../handlers/chat/group-chat.handler');
    await handleRoomList(socket, session, data);
  });

  socket.on('room:kick', async (data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomKick } = require('../handlers/chat/group-chat.handler');
    await handleRoomKick(socket, session, data);
  });

  socket.on('room:mute', async (data: { targetUsername: string; mute: boolean }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomMute } = require('../handlers/chat/group-chat.handler');
    await handleRoomMute(socket, session, data);
  });

  // ===== LIVE TYPING PREVIEW (Keystroke relaying) =====

  socket.on('chat:keystroke', (data: { channelId: string; userId: number; char: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.currentRoomId) return;

    // Broadcast keystroke to other users in the same room (not back to sender)
    const socketRoom = 'room:' + session.currentRoomId;
    socket.to(socketRoom).emit('chat:keystroke', {
      channelId: session.currentRoomId,
      userId: data.userId,
      username: session.username,
      char: data.char
    });
  });

  socket.on('chat:keystroke-submit', (data: { channelId: string; userId: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.currentRoomId) return;

    // Notify other users that this user submitted their message (stopped typing)
    const socketRoom = 'room:' + session.currentRoomId;
    socket.to(socketRoom).emit('chat:keystroke-submit', {
      channelId: session.currentRoomId,
      userId: data.userId,
      username: session.username
    });
  });

  socket.on('chat:keystroke-clear', (data: { channelId: string; userId: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session || !session.currentRoomId) return;

    // Notify other users that this user cleared their input
    const socketRoom = 'room:' + session.currentRoomId;
    socket.to(socketRoom).emit('chat:keystroke-clear', {
      channelId: session.currentRoomId,
      userId: data.userId,
      username: session.username
    });
  });
}
