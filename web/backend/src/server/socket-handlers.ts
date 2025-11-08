/**
 * Socket.IO Event Handlers
 *
 * NOTE: This file is imported by index.ts and is NOT meant to export the entire
 * socket.io setup. It only exports a function to register all socket handlers.
 *
 * Due to the large size of socket event handlers (~1000 lines), this module
 * provides a central location for all Socket.IO event registration.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '../config';
import { db } from '../database';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { sessions, getSession, setSession, deleteSession, createSession, getNextAvailableNodeId, checkConnectionLimit } from './session-manager';
import { callersLog, getRecentCallerActivity, displaySystemBulletins } from './database-helpers';
import { nodeManager, arexxEngine } from '../nodes';
import { nodeFileManager } from '../services/NodeFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import { displayScreen } from '../handlers/screen.handler';
import { handleCommand } from '../handlers/command.handler';
import { exitChat, sendChatMessage, acceptChat } from '../handlers/chat.handler';
import { initializeSecurity } from '../utils/security.util';

/**
 * Register all Socket.IO event handlers for a socket connection
 *
 * @param io - Socket.IO server instance
 * @param socket - Socket connection
 * @param chatState - Chat state (for legacy chat handlers)
 */
export function registerSocketHandlers(io: SocketIOServer, socket: Socket, chatState?: any) {
  const clientIp = socket.handshake.address;
  console.log(`Client connected from ${clientIp}`);

  // DEVELOPMENT: Force single connection per IP to prevent cache issues
  if (process.env.NODE_ENV !== 'production') {
    const existingSockets = Array.from(io.sockets.sockets.values()).filter(
      s => s.id !== socket.id && s.handshake.address === clientIp
    );

    if (existingSockets.length > 0) {
      console.warn(`⚠️ DEVELOPMENT: Disconnecting duplicate connection from ${clientIp}`);
      console.warn(`   Existing sockets: ${existingSockets.length}, disconnecting new connection`);
      // Disconnect OLD connections, keep the new one
      existingSockets.forEach(oldSocket => {
        console.warn(`   Disconnecting old socket: ${oldSocket.id}`);
        oldSocket.disconnect(true);
      });
    }
  }

  // Check connection rate limit
  if (!checkConnectionLimit(clientIp)) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${clientIp}`);
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mToo many connections from your IP.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease wait a moment and try again.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return;
  }

  // Initialize session with multi-node support
  initializeSession(socket).then(async (nodeSession) => {
    if (!nodeSession) {
      // Node assignment failed - socket already disconnected
      return;
    }

    const session = createSession(getNextAvailableNodeId());
    setSession(socket.id, session);

    // Display complete connection screen via AWAITSCREEN.TXT
    // reference-board BBS layout: everything shown via screen file with MCI codes
    // All messages, node list, etc. are in AWAITSCREEN.TXT
    await displayScreen(socket, session, 'AWAITSCREEN');

    // Show ANSI prompt immediately (reference-board style - no key wait)
    socket.emit('ansi-output', 'ANSI, RIP or No graphics (A/r/n)? ');

    // Set state to wait for ANSI response
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.tempData = { inputBuffer: '' };

    // Execute login trigger for AREXX scripts
    await arexxEngine.executeTrigger('login', {
      userId: undefined,
      sessionId: socket.id,
      environment: { nodeId: nodeSession.nodeId }
    });

    // Register all event handlers
    registerCommandHandler(socket);
    registerDisconnectHandler(socket);

    // Register modular socket handlers (imported from separate modules)
    // These handlers were extracted from index.ts for better code organization
    const { registerAuthHandlers } = await import('./auth-socket-handlers');
    const { registerFileHandlers } = await import('./file-socket-handlers');
    const { registerChatHandlers } = await import('./chat-socket-handlers');
    const { registerPreferenceHandlers } = await import('./preference-socket-handlers');

    registerAuthHandlers(socket);
    registerFileHandlers(socket);
    registerChatHandlers(socket, chatState);
    registerPreferenceHandlers(socket);
  }).catch(error => {
    console.error('Failed to initialize session:', error);
  });
}

/**
 * Initialize session and assign to node
 */
async function initializeSession(socket: Socket) {
  let nodeSession;
  try {
    nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);
    return nodeSession;
  } catch (error) {
    console.error('Failed to assign node to session:', error);
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mSorry, all nodes are busy.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease try again in a moment.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return null;
  }
}

/**
 * Register command handler
 */
function registerCommandHandler(socket: Socket) {
  console.log('[socket-handlers] registerCommandHandler called, registering door:input listener');

  // Handle door input (for TypeScript doors)
  socket.on('door:input', (data: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    console.log('[socket-handlers] door:input received:', JSON.stringify(data));

    if (session.inDoorManager && session.doorInputHandler) {
      console.log('[socket-handlers] Calling doorInputHandler from door:input');
      session.doorInputHandler(data);
    } else {
      console.log('[socket-handlers] door:input received but no handler - inDoorManager:', session.inDoorManager, 'handler:', !!session.doorInputHandler);
    }
  });

  // Handle mouse clicks (for ANSI editor and other mouse-enabled features)
  socket.on('mouse-click', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    console.log('[socket-handlers] mouse-click received:', data);

    // If door is active and has a mouse handler, call it
    if (session.inDoorManager && session.doorInputHandler) {
      console.log('[socket-handlers] Calling doorInputHandler with mouse data');
      // Pass mouse data as a special formatted string that the door can recognize
      session.doorInputHandler(JSON.stringify({ type: 'mouse-click', ...data }));
    }
  });

  // Handle mouse drag (for continuous drawing in ANSI editor)
  socket.on('mouse-drag', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    console.log('[socket-handlers] mouse-drag received:', data);

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      console.log('[socket-handlers] Calling doorInputHandler with mouse drag data');
      session.doorInputHandler(JSON.stringify({ type: 'mouse-drag', ...data }));
    }
  });

  // Handle mouse up (end of drag operation)
  socket.on('mouse-up', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    console.log('[socket-handlers] mouse-up received:', data);

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      console.log('[socket-handlers] Calling doorInputHandler with mouse up data');
      session.doorInputHandler(JSON.stringify({ type: 'mouse-up', ...data }));
    }
  });

  // Handle mouse hover (cursor follows mouse without clicking)
  socket.on('mouse-hover', (data: { x: number; y: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    // Don't send to regular doors as they expect text input, not mouse events
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      session.doorInputHandler(JSON.stringify({ type: 'mouse-hover', ...data }));
    }
  });

  socket.on('command', (data: string) => {
    console.log('=== COMMAND RECEIVED [v2024-FIXED] ===');
    console.log('Raw data:', JSON.stringify(data), 'length:', data.length, 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');

    const session = getSession(socket.id);
    if (!session) {
      console.error('No session found for socket:', socket.id);
      return;
    }

    console.log('Session state:', session.state, 'subState:', session.subState);
    console.log('Input buffer:', JSON.stringify(session.inputBuffer));

    // Special debug for Enter key
    if (data === '\r') {
      console.log('🎯 ENTER KEY DETECTED!');
      console.log('🎯 Current subState:', session.subState);
      console.log('🎯 Is POST_MESSAGE_SUBJECT?', session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT);
      console.log('🎯 Input buffer contents:', JSON.stringify(session.inputBuffer));
    }

    // Handle special chat keys (like F1 in AmiExpress)
    if ((session as any).inChat && data === '\x1b[OP') { // F1 key
      console.log('🎯 F1 pressed during chat - exiting chat');
      exitChat(socket, session);
      return;
    }

    // If a door is active, call the door's input handler
    console.log('[socket-handlers] ===== COMMAND EVENT HANDLER =====');
    console.log('[socket-handlers] Received data:', JSON.stringify(data));
    console.log('[socket-handlers] inDoorManager:', session.inDoorManager);
    console.log('[socket-handlers] doorInputHandler type:', typeof session.doorInputHandler);
    console.log('[socket-handlers] doorInputHandler exists:', !!session.doorInputHandler);

    if (session.inDoorManager) {
      if (session.doorInputHandler) {
        console.log('[socket-handlers] ✓ Calling doorInputHandler (door is active)');
        session.doorInputHandler(data);
        return;
      } else {
        console.log('[socket-handlers] ⚠️  WARNING: inDoorManager is true but no doorInputHandler set!');
        console.log('[socket-handlers] This means door cleanup failed - falling through to BBS handler');
        // Fall through to normal command handling
      }
    }
    console.log('[socket-handlers] ✗ NOT in door or no handler - routing to BBS command handler');
    console.log('[socket-handlers]   inDoorManager:', session.inDoorManager);
    console.log('[socket-handlers]   handler exists:', !!session.doorInputHandler);

    handleCommand(socket, session, data);
    console.log('=== COMMAND PROCESSED ===\n');
  });

  // Handle special chat commands
  socket.on('chat-message', (message: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  socket.on('accept-chat', (sessionId: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Sysop accepting chat request
    const { chatState } = require('./initialization');
    const chatSession = chatState.activeSessions.find((s: any) => s.id === sessionId);
    if (chatSession && session.user?.secLevel === 255) { // Sysop level
      acceptChat(socket, session, chatSession);
    }
  });
}

/**
 * Register disconnect handler
 */
function registerDisconnectHandler(socket: Socket) {
  socket.on('disconnect', async () => {
    console.log('Client disconnected');

    const session = getSession(socket.id);
    if (!session) return;

    // Handle internode chat cleanup if user was in chat
    if (session.subState === LoggedOnSubState.CHAT) {
      const { handleChatDisconnect } = require('../handlers/internode-chat.handler');
      await handleChatDisconnect(socket, session);
    }

    // Handle group chat room cleanup if user was in a room
    if (session.subState === LoggedOnSubState.CHAT_ROOM) {
      const { handleRoomDisconnect } = require('../handlers/group-chat.handler');
      await handleRoomDisconnect(socket, session);
    }

    // Log user logout if they were logged in (express.e:9493 callersLog)
    if (session.user) {
      await callersLog(session.user.id, session.user.username, 'Logged off');

      // CRITICAL: Delete node{n}.user files on logoff
      // express.e deletes these when user logs off so WHO doesn't show logged-off users
      const nodeId = session.nodeId || 0;
      try {
        // Write to CallersLog before cleanup
        callersLogManager.logLogoff(nodeId, session.user.username);

        nodeFileManager.deleteNodeFiles(nodeId);
        console.log(`[LOGOFF] Node files deleted for node ${nodeId}: ${session.user.username}`);
      } catch (error) {
        console.error(`[LOGOFF] Error deleting node files:`, error);
      }
    }

    // Release node back to available pool
    await nodeManager.releaseSession(socket.id);

    // Clean up session storage
    // Import socketToUser and userSessions from session-manager
    const { socketToUser, userSessions } = require('./session-manager');

    // If user was logged in, remove socket-to-user mapping
    const userId = socketToUser.get(socket.id);
    if (userId) {
      console.log(`[DISCONNECT] Removing socket ${socket.id} mapping for user ${userId}`);
      socketToUser.delete(socket.id);

      // Check if user has any other sockets connected
      const userHasOtherSockets = Array.from(socketToUser.values()).includes(userId);
      if (!userHasOtherSockets && session?.user) {
        // This was the last socket for this user - clean up user session
        console.log(`[DISCONNECT] Last socket for user ${userId} - removing user session`);
        userSessions.delete(userId);
      } else if (userHasOtherSockets) {
        console.log(`[DISCONNECT] User ${userId} still has other sockets connected - keeping user session`);
      }
    } else {
      // Pre-login socket - just remove from socket-based storage
      deleteSession(socket.id);
    }
  });
}

export default registerSocketHandlers;
