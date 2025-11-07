/**
 * Chat Socket Event Handlers
 * Handles internode (user-to-user) and room (multi-user) chat events
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { getSessionBySocketId } from './session-manager';
import { sendChatMessage, acceptChat } from '../handlers/chat.handler';

/**
 * Register chat socket event handlers
 */
export function registerChatHandlers(socket: Socket, chatState: any) {
  const session = getSessionBySocketId(socket.id);
  if (!session) return;

  // ===== LEGACY CHAT HANDLERS (Sysop pager) =====

  // Handle special chat commands (legacy sysop chat)
  socket.on('chat-message', (message: string) => {
    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  // Handle sysop accepting chat request (legacy)
  socket.on('accept-chat', (sessionId: string) => {
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

    const { handleChatRequest } = require('../handlers/internode-chat.handler');
    await handleChatRequest(socket, session, data);
  });

  socket.on('chat:accept', async (data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatAccept } = require('../handlers/internode-chat.handler');
    await handleChatAccept(socket, session, data);
  });

  socket.on('chat:decline', async (data: { sessionId: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatDecline } = require('../handlers/internode-chat.handler');
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

    const { handleChatMessage } = require('../handlers/internode-chat.handler');
    await handleChatMessage(socket, session, data);
    console.log('📨 [SOCKET.IO] handleChatMessage completed');
  });

  socket.on('chat:end', async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleChatEnd } = require('../handlers/internode-chat.handler');
    await handleChatEnd(socket, session);
  });

  // ===== GROUP CHAT ROOM EVENTS (Multi-User) =====

  socket.on('room:create', async (data: { roomName: string; topic?: string; isPublic?: boolean; password?: string; maxUsers?: number }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomCreate } = require('../handlers/group-chat.handler');
    await handleRoomCreate(socket, session, data);
  });

  socket.on('room:join', async (data: { roomId?: string; roomName?: string; password?: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomJoin } = require('../handlers/group-chat.handler');
    await handleRoomJoin(socket, session, data);
  });

  socket.on('room:leave', async () => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomLeave } = require('../handlers/group-chat.handler');
    await handleRoomLeave(socket, session);
  });

  socket.on('room:message', async (data: { message: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomMessage } = require('../handlers/group-chat.handler');
    await handleRoomMessage(socket, session, data);
  });

  socket.on('room:list', async (data?: { showPrivate?: boolean }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomList } = require('../handlers/group-chat.handler');
    await handleRoomList(socket, session, data);
  });

  socket.on('room:kick', async (data: { targetUsername: string }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomKick } = require('../handlers/group-chat.handler');
    await handleRoomKick(socket, session, data);
  });

  socket.on('room:mute', async (data: { targetUsername: string; mute: boolean }) => {
    const session = getSessionBySocketId(socket.id);
    if (!session) return;

    const { handleRoomMute } = require('../handlers/group-chat.handler');
    await handleRoomMute(socket, session, data);
  });
}
