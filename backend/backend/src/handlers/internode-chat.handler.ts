/**
 * Internode Chat Handler
 * Real-time user-to-user chat system
 *
 * Based on INTERNODE_CHAT_COMPLETE.md documentation
 * Implements Socket.io event handlers for real-time messaging
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState, BBSState } from '../constants/bbs-states';

// Session type
interface BBSSession {
  user?: any;
  state?: string;
  subState?: string;
  socketId?: string;
  chatSessionId?: string;
  chatWithUserId?: string;
  chatWithUsername?: string;
  previousState?: string;
  previousSubState?: string;
  [key: string]: any;
}

// Dependencies (injected)
let db: any;
let sessions: Map<string, BBSSession>;
let io: any;

export function setInternodeChatDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
}

/**
 * Handle chat:request - User requests chat with another user
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 47-131
 */
export async function handleChatRequest(socket: Socket, session: BBSSession, data: { targetUsername: string }) {
  try {
    const { targetUsername } = data;

    // Validation 1: Check if user is logged in
    if (!session.user) {
      socket.emit('chat:error', 'You must be logged in to use chat');
      return;
    }

    // Validation 2: Check if initiator is available for chat
    if (!session.user.availableForChat) {
      socket.emit('chat:error', 'You must toggle your chat availability first (CHAT TOGGLE)');
      return;
    }

    // Validation 3: Check if initiator is already in chat
    if (session.subState === LoggedOnSubState.CHAT) {
      socket.emit('chat:error', 'You are already in a chat session');
      return;
    }

    // Validation 4: Find target user in database
    const targetUser = await db.getUserByUsernameForOLM(targetUsername);
    if (!targetUser) {
      socket.emit('chat:error', `User "${targetUsername}" not found`);
      return;
    }

    // Validation 5: Cannot chat with self
    if (targetUser.id === session.user.id) {
      socket.emit('chat:error', 'You cannot chat with yourself');
      return;
    }

    // Validation 6: Check if target is online
    let targetSession: BBSSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === targetUser.id) {
        targetSession = sess;
        break;
      }
    }

    if (!targetSession) {
      socket.emit('chat:error', `${targetUsername} is not currently online`);
      return;
    }

    // Validation 7: Check if target is available for chat
    if (!targetUser.availableForChat) {
      socket.emit('chat:error', `${targetUsername} is not available for chat`);
      return;
    }

    // Validation 8: Check if target is already in chat
    if (targetSession.subState === LoggedOnSubState.CHAT) {
      socket.emit('chat:error', `${targetUsername} is currently in another chat`);
      return;
    }

    // Create chat session in database
    const sessionId = `chat_${Date.now()}_${session.user.id}_${targetUser.id}`;
    await db.createChatSession({
      sessionId,
      initiatorId: session.user.id,
      recipientId: targetUser.id,
      initiatorUsername: session.user.username,
      recipientUsername: targetUser.username,
      initiatorSocket: socket.id,
      recipientSocket: targetSession.socketId!,
      status: 'requesting'
    });

    // Send confirmation to initiator
    socket.emit('chat:request-sent', {
      sessionId,
      to: targetUsername
    });

    // Send invite to target user
    io.to(targetSession.socketId!).emit('chat:invite', {
      sessionId,
      from: session.user.username,
      fromId: session.user.id
    });

    // Set 30-second timeout
    setTimeout(async () => {
      const chatSession = await db.getChatSession(sessionId);
      if (chatSession && chatSession.status === 'requesting') {
        // Timeout - cancel invite
        await db.updateChatSessionStatus(sessionId, 'timeout');

        // Notify initiator
        socket.emit('chat:timeout', {
          username: targetUsername
        });

        // Notify recipient (cancel invite)
        io.to(targetSession!.socketId!).emit('chat:invite-cancelled', {
          from: session.user.username
        });
      }
    }, 30000);

  } catch (error) {
    console.error('[INTERNODE CHAT] Error handling chat request:', error);
    socket.emit('chat:error', 'Failed to send chat request');
  }
}

/**
 * Handle chat:accept - User accepts incoming chat request
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 133-218
 */
export async function handleChatAccept(socket: Socket, session: BBSSession, data: { sessionId: string }) {
  try {
    const { sessionId } = data;

    // Get chat session from database
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      socket.emit('chat:error', 'Chat session not found');
      return;
    }

    // Validate recipient
    if (chatSession.recipientId !== session.user?.id) {
      socket.emit('chat:error', 'You are not the recipient of this chat');
      return;
    }

    // Validate status
    if (chatSession.status !== 'requesting') {
      socket.emit('chat:error', 'Chat request is no longer valid');
      return;
    }

    // Update session status to active
    await db.updateChatSessionStatus(sessionId, 'active');

    // Get initiator session
    let initiatorSession: BBSSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === chatSession.initiatorId) {
        initiatorSession = sess;
        break;
      }
    }

    if (!initiatorSession) {
      socket.emit('chat:error', 'Initiator is no longer online');
      await db.updateChatSessionStatus(sessionId, 'ended');
      return;
    }

    // Create Socket.io room for this chat
    const roomName = `chat:${sessionId}`;
    socket.join(roomName);
    io.sockets.sockets.get(initiatorSession.socketId!)?.join(roomName);

    // Save previous states for both users
    initiatorSession.previousState = initiatorSession.state;
    initiatorSession.previousSubState = initiatorSession.subState;
    initiatorSession.chatSessionId = sessionId;
    initiatorSession.chatWithUserId = session.user?.id;
    initiatorSession.chatWithUsername = session.user?.username;

    session.previousState = session.state;
    session.previousSubState = session.subState;
    session.chatSessionId = sessionId;
    session.chatWithUserId = chatSession.initiatorId;
    session.chatWithUsername = chatSession.initiatorUsername;

    // Set both users to CHAT substate
    initiatorSession.subState = LoggedOnSubState.CHAT;
    session.subState = LoggedOnSubState.CHAT;

    // Notify both users that chat has started
    io.to(roomName).emit('chat:started', {
      sessionId,
      withUsername: session.user?.username,
      withUserId: session.user?.id
    });

    // Send chat started message to initiator
    io.to(initiatorSession.socketId!).emit('ansi-output',
      '\r\n\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      `\x1b[36m                CHAT SESSION WITH ${session.user?.username.toUpperCase()}\x1b[0m\r\n` +
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\r\n' +
      'Type your messages and press ENTER to send.\r\n' +
      'Type /END to exit chat.\r\n' +
      '\r\n' +
      '\x1b[32m───────────────────────────────────────────────────────────────\x1b[0m\r\n'
    );

    // Send chat started message to recipient
    socket.emit('ansi-output',
      '\r\n\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      `\x1b[36m                CHAT SESSION WITH ${chatSession.initiatorUsername.toUpperCase()}\x1b[0m\r\n` +
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\r\n' +
      'Type your messages and press ENTER to send.\r\n' +
      'Type /END to exit chat.\r\n' +
      '\r\n' +
      '\x1b[32m───────────────────────────────────────────────────────────────\x1b[0m\r\n'
    );

  } catch (error) {
    console.error('[INTERNODE CHAT] Error accepting chat:', error);
    socket.emit('chat:error', 'Failed to accept chat');
  }
}

/**
 * Handle chat:decline - User declines incoming chat request
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 220-258
 */
export async function handleChatDecline(socket: Socket, session: BBSSession, data: { sessionId: string }) {
  try {
    const { sessionId } = data;

    // Get chat session from database
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      socket.emit('chat:error', 'Chat session not found');
      return;
    }

    // Validate recipient
    if (chatSession.recipientId !== session.user?.id) {
      socket.emit('chat:error', 'You are not the recipient of this chat');
      return;
    }

    // Update session status to declined
    await db.updateChatSessionStatus(sessionId, 'declined');

    // Notify initiator
    io.to(chatSession.initiatorSocket).emit('chat:declined', {
      username: chatSession.recipientUsername
    });

    // Confirm to decliner
    socket.emit('ansi-output', `\r\n\x1b[33mChat request from ${chatSession.initiatorUsername} declined.\x1b[0m\r\n`);

  } catch (error) {
    console.error('[INTERNODE CHAT] Error declining chat:', error);
    socket.emit('chat:error', 'Failed to decline chat');
  }
}

/**
 * Handle chat:message - User sends message during active chat
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 260-316
 */
export async function handleChatMessage(socket: Socket, session: BBSSession, data: { message: string }) {
  try {
    const { message } = data;

    // Validation 1: Check if in chat mode
    if (session.subState !== LoggedOnSubState.CHAT) {
      socket.emit('chat:error', 'You are not in a chat session');
      return;
    }

    // Validation 2: Check if chat session exists
    if (!session.chatSessionId) {
      socket.emit('chat:error', 'No active chat session');
      return;
    }

    // Validation 3: Get chat session from database
    const chatSession = await db.getChatSession(session.chatSessionId);
    if (!chatSession || chatSession.status !== 'active') {
      socket.emit('chat:error', 'Chat session is not active');
      return;
    }

    // Validation 4: Message length
    if (message.length > 500) {
      socket.emit('chat:error', 'Message too long (max 500 characters)');
      return;
    }

    if (message.trim().length === 0) {
      return; // Ignore empty messages
    }

    // Sanitize message (remove ANSI escape codes)
    const sanitized = message.replace(/\x1b/g, '');

    // Save message to database
    await db.saveChatMessage({
      sessionId: session.chatSessionId,
      senderId: session.user!.id,
      senderUsername: session.user!.username,
      message: sanitized
    });

    // Broadcast message to room (both users)
    const roomName = `chat:${session.chatSessionId}`;
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    io.to(roomName).emit('chat:message-received', {
      sessionId: session.chatSessionId,
      from: session.user!.username,
      fromId: session.user!.id,
      message: sanitized,
      timestamp
    });

    // Also emit as ANSI output for terminal display
    io.to(roomName).emit('ansi-output',
      `\x1b[32m[${timestamp}] ${session.user!.username}:\x1b[0m ${sanitized}\r\n`
    );

  } catch (error) {
    console.error('[INTERNODE CHAT] Error sending message:', error);
    socket.emit('chat:error', 'Failed to send message');
  }
}

/**
 * Handle chat:end - User ends active chat session
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 318-382
 */
export async function handleChatEnd(socket: Socket, session: BBSSession) {
  try {
    // Validation 1: Check if in chat mode
    if (session.subState !== LoggedOnSubState.CHAT) {
      socket.emit('chat:error', 'You are not in a chat session');
      return;
    }

    // Validation 2: Check if chat session exists
    if (!session.chatSessionId) {
      socket.emit('chat:error', 'No active chat session');
      return;
    }

    const sessionId = session.chatSessionId;

    // Get chat session from database
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      // Session doesn't exist, just clean up local state
      await cleanupChatSession(socket, session);
      return;
    }

    // End session in database
    await db.endChatSession(sessionId);

    // Get statistics
    const messageCount = await db.getChatMessageCount(sessionId);
    const duration = Math.floor((Date.now() - new Date(chatSession.startedAt).getTime()) / 60000);

    // Get partner session
    const partnerId = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientId
      : chatSession.initiatorId;

    let partnerSession: BBSSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === partnerId) {
        partnerSession = sess;
        break;
      }
    }

    const roomName = `chat:${sessionId}`;

    // Notify both users
    io.to(roomName).emit('chat:ended', {
      sessionId,
      messageCount,
      duration
    });

    // Send end message to both users
    io.to(roomName).emit('ansi-output',
      '\r\n\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\x1b[36m                     CHAT SESSION ENDED\x1b[0m\r\n' +
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\r\n' +
      `Chat with ${session.chatWithUsername} has ended.\r\n` +
      `Duration: ${duration} minute(s)\r\n` +
      `Messages exchanged: ${messageCount}\r\n` +
      '\r\n'
    );

    // Clean up both users
    await cleanupChatSession(socket, session);
    if (partnerSession) {
      const partnerSocket = io.sockets.sockets.get(partnerSession.socketId!);
      if (partnerSocket) {
        await cleanupChatSession(partnerSocket, partnerSession);
      }
    }

    // Leave Socket.io room
    socket.leave(roomName);
    if (partnerSession?.socketId) {
      io.sockets.sockets.get(partnerSession.socketId)?.leave(roomName);
    }

  } catch (error) {
    console.error('[INTERNODE CHAT] Error ending chat:', error);
    socket.emit('chat:error', 'Failed to end chat');
  }
}

/**
 * Handle chat disconnect - User disconnects during active chat
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 384-436
 */
export async function handleChatDisconnect(socket: Socket, session: BBSSession) {
  try {
    if (session.subState !== LoggedOnSubState.CHAT || !session.chatSessionId) {
      return; // Not in chat, nothing to clean up
    }

    const sessionId = session.chatSessionId;

    // Get chat session
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      return;
    }

    // End session in database
    await db.endChatSession(sessionId);

    // Get partner
    const partnerId = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientId
      : chatSession.initiatorId;

    const partnerUsername = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientUsername
      : chatSession.initiatorUsername;

    // Find partner session
    let partnerSession: BBSSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === partnerId) {
        partnerSession = sess;
        break;
      }
    }

    if (partnerSession) {
      // Notify partner
      io.to(partnerSession.socketId!).emit('chat:partner-disconnected', {
        username: session.user!.username
      });

      io.to(partnerSession.socketId!).emit('ansi-output',
        `\r\n\x1b[33m${session.user!.username} has disconnected. Chat ended.\x1b[0m\r\n`
      );

      // Clean up partner session
      const partnerSocket = io.sockets.sockets.get(partnerSession.socketId!);
      if (partnerSocket) {
        await cleanupChatSession(partnerSocket, partnerSession);
      }
    }

    // Leave room
    const roomName = `chat:${sessionId}`;
    socket.leave(roomName);

  } catch (error) {
    console.error('[INTERNODE CHAT] Error handling chat disconnect:', error);
  }
}

/**
 * Cleanup chat session - Restore user to previous state
 */
async function cleanupChatSession(socket: Socket, session: BBSSession) {
  // Restore previous state
  if (session.previousSubState) {
    session.subState = session.previousSubState;
  } else {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  // Clear chat fields
  delete session.chatSessionId;
  delete session.chatWithUserId;
  delete session.chatWithUsername;
  delete session.previousState;
  delete session.previousSubState;

  // Return to menu (handled by main command loop)
  socket.emit('ansi-output', '\r\n');
}
