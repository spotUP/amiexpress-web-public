/**
 * Socket.IO Event Handlers for Chat System
 * Integrates ChatManager, ChatRoomManager, and MultiNodeManager
 */

import { Socket } from 'socket.io';
import { chatManager } from './chat';
import { chatRoomManager } from './chatroom';
import { multiNodeManager } from './multinode';

/**
 * Setup chat event handlers for a socket
 * Call this from the main connection handler
 */
export function setupChatHandlers(socket: Socket, session: any) {

  // ====================================================================
  // SYSOP CHAT (from ChatManager) - 1:1 port of express.e chat()
  // ====================================================================

  /**
   * User pages sysop (Press 'P' command)
   * From express.e: Page sysop functionality
   */
  socket.on('page-sysop', async () => {
    if (!session.user) {
      socket.emit('chat-error', { error: 'Must be logged in' });
      return;
    }

    try {
      console.log(`[SYSOP-CHAT] ${session.user.username} paging sysop`);

      const chatSession = chatManager.pageRequest(
        session.user.id,
        session.user.username,
        session.nodeNumber || 1,
        socket
      );

      socket.emit('page-sent', {
        sessionId: chatSession.sessionId,
        sysopAvailable: chatSession.sysopAvailable
      });

      // TODO: Notify sysop clients via broadcast to sysop room
      // io.to('sysop-room').emit('page-notification', { ... });

    } catch (error) {
      console.error('[SYSOP-CHAT] Page error:', error);
      socket.emit('chat-error', { error: 'Failed to page sysop' });
    }
  });

  /**
   * Sysop answers page
   * From express.e: Enters chat() function
   */
  socket.on('answer-page', async (data: { sessionId: string }) => {
    if (!session.user || session.user.secLevel !== 255) {
      socket.emit('chat-error', { error: 'Only sysop can answer pages' });
      return;
    }

    try {
      const success = chatManager.answerPage(
        data.sessionId,
        session.user.username,
        socket
      );

      if (success) {
        console.log(`[SYSOP-CHAT] Sysop answered page session ${data.sessionId}`);
        session.sysopChatSessionId = data.sessionId;
      } else {
        socket.emit('chat-error', { error: 'Failed to answer page' });
      }
    } catch (error) {
      console.error('[SYSOP-CHAT] Answer error:', error);
      socket.emit('chat-error', { error: 'Failed to answer page' });
    }
  });

  /**
   * Send message in sysop chat
   * From express.e: Chat loop character echoing
   */
  socket.on('sysop-chat-message', async (data: { sessionId: string; message: string }) => {
    if (!session.user) {
      socket.emit('chat-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const isSysop = session.user.secLevel === 255;
      chatManager.sendMessage(
        data.sessionId,
        session.user.id,
        data.message,
        isSysop
      );
    } catch (error) {
      console.error('[SYSOP-CHAT] Message error:', error);
      socket.emit('chat-error', { error: 'Failed to send message' });
    }
  });

  /**
   * End sysop chat
   * From express.e: Display EndChat.txt, run CHATOUT
   */
  socket.on('end-sysop-chat', async (data: { sessionId: string }) => {
    try {
      chatManager.endChat(data.sessionId);
      session.sysopChatSessionId = undefined;
      console.log(`[SYSOP-CHAT] Ended session ${data.sessionId}`);
    } catch (error) {
      console.error('[SYSOP-CHAT] End error:', error);
    }
  });

  /**
   * Set sysop availability
   * From express.e: sysopAvail flag, sendChatFlag()
   */
  socket.on('set-sysop-available', async (data: { available: boolean }) => {
    if (!session.user || session.user.secLevel !== 255) {
      socket.emit('chat-error', { error: 'Only sysop can set availability' });
      return;
    }

    try {
      chatManager.setSysopAvailable(data.available);
      console.log(`[SYSOP-CHAT] Sysop availability set to ${data.available}`);
    } catch (error) {
      console.error('[SYSOP-CHAT] Availability error:', error);
    }
  });

  // ====================================================================
  // CHAT ROOMS (from ChatRoomManager) - Extended feature
  // ====================================================================

  /**
   * Create chat room
   */
  socket.on('room-create', async (data: {
    roomId: string;
    name: string;
    topic: string;
    isPublic: boolean;
    maxUsers: number;
    minSecurityLevel: number;
  }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const room = await chatRoomManager.createRoom(
        data.roomId,
        data.name,
        data.topic,
        session.user.id,
        data.isPublic,
        data.maxUsers,
        data.minSecurityLevel
      );

      socket.emit('room-created', {
        roomId: room.roomId,
        name: room.name
      });

      console.log(`[ROOM] ${session.user.username} created room "${room.name}"`);
    } catch (error) {
      console.error('[ROOM] Create error:', error);
      socket.emit('room-error', { error: 'Failed to create room' });
    }
  });

  /**
   * Delete chat room
   */
  socket.on('room-delete', async (data: { roomId: string }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const success = await chatRoomManager.deleteRoom(data.roomId, session.user.id);
      if (success) {
        socket.emit('room-deleted', { roomId: data.roomId });
        console.log(`[ROOM] ${session.user.username} deleted room ${data.roomId}`);
      } else {
        socket.emit('room-error', { error: 'Permission denied or room not found' });
      }
    } catch (error) {
      console.error('[ROOM] Delete error:', error);
      socket.emit('room-error', { error: 'Failed to delete room' });
    }
  });

  /**
   * Join chat room
   */
  socket.on('room-join', async (data: { roomId: string }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const success = await chatRoomManager.joinRoom(
        data.roomId,
        session.user.id,
        session.user.username,
        session.user.secLevel || 0,
        socket
      );

      if (success) {
        session.currentRoomId = data.roomId;
        console.log(`[ROOM] ${session.user.username} joined room ${data.roomId}`);
      }
    } catch (error) {
      console.error('[ROOM] Join error:', error);
      socket.emit('room-error', { error: 'Failed to join room' });
    }
  });

  /**
   * Leave chat room
   */
  socket.on('room-leave', async (data: { roomId: string }) => {
    if (!session.user) {
      return;
    }

    try {
      await chatRoomManager.leaveRoom(data.roomId, session.user.id);
      session.currentRoomId = undefined;
      console.log(`[ROOM] ${session.user.username} left room ${data.roomId}`);
    } catch (error) {
      console.error('[ROOM] Leave error:', error);
    }
  });

  /**
   * Send message to room
   */
  socket.on('room-send-message', async (data: { message: string }) => {
    if (!session.user || !session.currentRoomId) {
      socket.emit('room-error', { error: 'Not in a room' });
      return;
    }

    try {
      await chatRoomManager.sendToRoom(
        session.currentRoomId,
        session.user.id,
        data.message
      );
    } catch (error) {
      console.error('[ROOM] Message error:', error);
      socket.emit('room-error', { error: 'Failed to send message' });
    }
  });

  /**
   * Kick user from room (moderator only)
   */
  socket.on('room-kick', async (data: { roomId: string; userId: string; reason: string }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const success = await chatRoomManager.kickUser(
        data.roomId,
        data.userId,
        data.reason,
        session.user.id
      );

      if (success) {
        console.log(`[ROOM] ${session.user.username} kicked user from ${data.roomId}`);
      } else {
        socket.emit('room-error', { error: 'Permission denied' });
      }
    } catch (error) {
      console.error('[ROOM] Kick error:', error);
      socket.emit('room-error', { error: 'Failed to kick user' });
    }
  });

  /**
   * Ban user from room (moderator only)
   */
  socket.on('room-ban', async (data: { roomId: string; userId: string; reason: string }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const success = await chatRoomManager.banUser(
        data.roomId,
        data.userId,
        data.reason,
        session.user.id
      );

      if (success) {
        console.log(`[ROOM] ${session.user.username} banned user from ${data.roomId}`);
      } else {
        socket.emit('room-error', { error: 'Permission denied' });
      }
    } catch (error) {
      console.error('[ROOM] Ban error:', error);
      socket.emit('room-error', { error: 'Failed to ban user' });
    }
  });

  /**
   * Update room topic (moderator only)
   */
  socket.on('room-update-topic', async (data: { roomId: string; topic: string }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const success = await chatRoomManager.updateTopic(
        data.roomId,
        data.topic,
        session.user.id
      );

      if (success) {
        console.log(`[ROOM] ${session.user.username} updated topic in ${data.roomId}`);
      } else {
        socket.emit('room-error', { error: 'Permission denied' });
      }
    } catch (error) {
      console.error('[ROOM] Topic update error:', error);
      socket.emit('room-error', { error: 'Failed to update topic' });
    }
  });

  /**
   * List available rooms
   */
  socket.on('room-list', async () => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const rooms = await chatRoomManager.listRooms(session.user.secLevel || 0);
      socket.emit('room-list-response', { rooms });
    } catch (error) {
      console.error('[ROOM] List error:', error);
      socket.emit('room-error', { error: 'Failed to list rooms' });
    }
  });

  /**
   * Get room info
   */
  socket.on('room-info', async (data: { roomId: string }) => {
    if (!session.user) {
      socket.emit('room-error', { error: 'Must be logged in' });
      return;
    }

    try {
      const room = await chatRoomManager.getRoom(data.roomId);
      if (room) {
        socket.emit('room-info-response', { room });
      } else {
        socket.emit('room-error', { error: 'Room not found' });
      }
    } catch (error) {
      console.error('[ROOM] Info error:', error);
      socket.emit('room-error', { error: 'Failed to get room info' });
    }
  });
}

/**
 * Setup multinode integration
 * Assigns node to user on login, releases on disconnect
 */
export async function assignNodeToSession(
  session: any,
  userId: string,
  username: string,
  location: string = ''
): Promise<number | null> {
  try {
    // Get available node
    const nodeId = await multiNodeManager.getAvailableNode();
    if (!nodeId) {
      console.error('[MULTINODE] No available nodes');
      return null;
    }

    // Assign node
    const success = await multiNodeManager.assignNode(nodeId, username, userId, location);
    if (success) {
      session.nodeNumber = nodeId;
      console.log(`[MULTINODE] Assigned node ${nodeId} to ${username}`);
      return nodeId;
    }

    return null;
  } catch (error) {
    console.error('[MULTINODE] Assignment error:', error);
    return null;
  }
}

/**
 * Release node from session
 * Call on disconnect
 */
export async function releaseNodeFromSession(session: any): Promise<void> {
  if (session.nodeNumber) {
    try {
      await multiNodeManager.releaseNode(session.nodeNumber);
      console.log(`[MULTINODE] Released node ${session.nodeNumber}`);
      session.nodeNumber = undefined;
    } catch (error) {
      console.error('[MULTINODE] Release error:', error);
    }
  }
}

/**
 * Get online users from multinode manager
 */
export async function getOnlineUsers(): Promise<any[]> {
  try {
    const nodes = await multiNodeManager.getOnlineUsers();
    return nodes.map(node => ({
      nodeId: node.nodeId,
      username: node.handle,
      location: node.location,
      chatColor: node.chatColor,
      offHook: node.offHook,
      private: node.private
    }));
  } catch (error) {
    console.error('[MULTINODE] Get online users error:', error);
    return [];
  }
}
