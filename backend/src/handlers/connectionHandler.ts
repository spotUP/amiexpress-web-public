/**
 * Connection Handler Module
 *
 * This module sets up all socket event handlers for a new BBS connection.
 * It centralizes the connection initialization logic that was previously in index.ts.
 *
 * Responsibilities:
 * - Initialize new BBSSession with default values
 * - Display BBSTITLE screen on connect
 * - Setup authentication handlers (login, register, etc)
 * - Setup door handlers (Amiga door integration)
 * - Setup chat handlers (multinode chat system)
 * - Setup command handler (BBS command processing)
 * - Setup file upload handler
 * - Setup error handlers
 * - Setup disconnect handler with proper cleanup
 *
 * Based on express.e connection flow and the io.on('connection') callback in index.ts
 *
 * @module handlers/connectionHandler
 */

import { Socket, Server } from 'socket.io';
import { BBSSession, BBSState, LoggedOnSubState } from '../bbs/session';
import { loadScreen } from '../bbs/screens';
import { setupAuthHandlers } from './authHandlers';
import { setupDoorHandlers } from '../amiga-emulation/doorHandler';
import { setupChatHandlers, releaseNodeFromSession } from '../chatHandlers';
import { db } from '../database';
import { formatFileSize } from '../bbs/utils';
import { handleCommand } from './commandHandler';
import { displayDoorManager } from './doorHandlers';
import { RedisSessionStore } from '../server/sessionStore';
import { chatState, conferences, messageBases, fileAreas, doors, messages } from '../server/dataStore';

/**
 * Setup all BBS connection handlers for a new socket connection
 *
 * This function is called for each new client connection and sets up:
 * 1. Session initialization with default state
 * 2. BBSTITLE screen display
 * 3. Authentication event handlers
 * 4. Door system handlers
 * 5. Chat system handlers
 * 6. Command handler
 * 7. File upload handler
 * 8. Error handlers
 * 9. Disconnect handler
 *
 * @param socket - The socket.io socket instance for this connection
 * @param io - The socket.io server instance
 * @param sessions - Redis session store for managing BBS sessions
 */
export async function setupBBSConnection(
  socket: Socket,
  io: Server,
  sessions: RedisSessionStore
): Promise<void> {
  // Import shared state for command handling
  console.log('> BBS Client connected from:', socket.handshake.address || 'unknown', `(${socket.conn.transport.name})`);

  // ====================================================================
  // SESSION INITIALIZATION
  // ====================================================================
  // Initialize session (mirroring processAwait in AmiExpress)
  const session: BBSSession = {
    state: BBSState.AWAIT,
    currentConf: 0,
    currentMsgBase: 0,
    timeRemaining: 60, // 60 minutes default
    timeLimit: 3600, // 60 minutes in seconds (like AmiExpress timeLimit)
    lastActivity: Date.now(),
    confRJoin: 1, // Default to General conference
    msgBaseRJoin: 1, // Default to Main message base
    commandBuffer: '', // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: '', // Buffer for line-based input
    relConfNum: 0, // Relative conference number
    currentConfName: 'Unknown', // Current conference name
    cmdShortcuts: false // Like AmiExpress - default to line input mode, not hotkeys
  };
  await sessions.set(socket.id, session);

  // ====================================================================
  // DISPLAY BBSTITLE SCREEN
  // ====================================================================
  // Display BBS title screen on connect (will pause until login)
  const titleScreen = loadScreen('BBSTITLE', session);
  if (titleScreen) {
    socket.emit('ansi-output', titleScreen);
  } else {
    // Fallback welcome message
    socket.emit('ansi-output', '\x1b[2J\x1b[H\x1b[0;36mWelcome to AmiExpress-Web BBS\x1b[0m\r\n\r\n');
  }

  // ====================================================================
  // SETUP EVENT HANDLERS
  // ====================================================================

  // Setup authentication handlers (login, register, new-user-response, login-with-token)
  setupAuthHandlers(socket, io, sessions);

  // Setup Amiga door handlers (door:launch, door:status-request, door:input)
  setupDoorHandlers(socket);

  // Setup multinode chat handlers (page-sysop, chat:*, multinode:*, chatroom:*)
  setupChatHandlers(socket, session);

  // ====================================================================
  // COMMAND HANDLER
  // ====================================================================
  /**
   * Handle BBS commands from the client
   *
   * This is the main command processing handler that routes all user input
   * to the appropriate command processor based on the current session state.
   *
   * Commands are processed differently based on:
   * - Current BBS state (AWAIT, LOGON, LOGGEDON)
   * - Current substate (DISPLAY_BULL, READ_COMMAND, etc)
   * - Command shortcuts mode (expert mode)
   *
   * This handler is imported from the main index.ts file where it's defined.
   * In a future refactoring, this could be moved to its own module.
   */
  socket.on('command', async (data: string) => {
    // Performance optimization: Reduced logging for faster keystroke processing
    // Uncomment for debugging: console.log('=== COMMAND RECEIVED ===');
    // Uncomment for debugging: console.log('Raw data:', JSON.stringify(data), 'length:', data.length);

    try {
      const currentSession = await sessions.get(socket.id);
      if (!currentSession) {
        console.error('No session found for socket:', socket.id);
        return;
      }

      // Uncomment for debugging: console.log('Session state:', currentSession.state, 'subState:', currentSession.subState);
      // Uncomment for debugging: console.log('Input buffer:', JSON.stringify(currentSession.inputBuffer));

      // Handle command processing with all required parameters
      await handleCommand(socket, currentSession, data, sessions, io, chatState, conferences, messageBases, fileAreas, doors, messages);

      // Save session after command processing
      await sessions.set(socket.id, currentSession);
    } catch (error) {
      console.error('Error handling command:', error);
    }
  });

  // ====================================================================
  // FILE UPLOAD HANDLER
  // ====================================================================
  /**
   * Handle file uploads from the client
   *
   * This handler is specifically for the door manager upload functionality,
   * where sysops can upload new door programs to the BBS.
   *
   * The file is received after being processed by the multer middleware
   * on the REST API endpoint. This handler just updates the UI.
   */
  socket.on('file-uploaded', async (data: { filename: string; originalname: string; size: number }) => {
    console.log('> File uploaded:', data.originalname);

    // Check if user is in door manager upload mode
    const currentSession = await sessions.get(socket.id);
    if (!currentSession || currentSession.subState !== LoggedOnSubState.DOOR_MANAGER || currentSession.tempData?.doorManagerMode !== 'upload') {
      console.log('X File upload received but not in upload mode');
      return;
    }

    socket.emit('ansi-output', `\r\n\x1b[32m- File received: ${data.originalname}\x1b[0m\r\n`);
    socket.emit('ansi-output', `\x1b[36mSize: ${formatFileSize(data.size)}\x1b[0m\r\n`);
    socket.emit('ansi-output', 'Processing...\r\n');

    try {
      // Re-scan doors to include new upload
      await displayDoorManager(socket, currentSession);

      // Find the newly uploaded door
      const { doorList } = currentSession.tempData;
      const newDoor = doorList.find((d: any) => d.filename === data.filename || d.filename === data.originalname);

      if (newDoor) {
        socket.emit('ansi-output', `\r\n\x1b[32m- Door detected: ${newDoor.name}\x1b[0m\r\n`);
        socket.emit('ansi-output', `\x1b[36mVersion: ${newDoor.version || 'Unknown'}\x1b[0m\r\n`);
      }

      // Save session
      await sessions.set(socket.id, currentSession);
    } catch (error) {
      console.error('Error processing uploaded door:', error);
      socket.emit('ansi-output', `\r\n\x1b[31mX Error processing door: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m\r\n`);
    }
  });

  // ====================================================================
  // ERROR HANDLERS
  // ====================================================================
  /**
   * Handle socket errors gracefully
   * These are Socket.IO protocol errors, not application errors
   */
  socket.on('error', (error: Error) => {
    console.error('X BBS Socket error for client:', socket.id, error);
  });

  socket.on('connect_error', (error: Error) => {
    console.error('X BBS Connection error for client:', socket.id, error);
  });

  // ====================================================================
  // DISCONNECT HANDLER
  // ====================================================================
  /**
   * Handle client disconnect with proper cleanup
   *
   * This handler ensures proper cleanup when a user disconnects:
   * 1. End any active chat sessions
   * 2. Notify chat partners
   * 3. Release multinode assignment
   * 4. Leave any chat rooms
   * 5. Delete session from store
   *
   * Based on express.e disconnect handling
   */
  socket.on('disconnect', async (reason: string) => {
    console.log('> BBS Client disconnected:', socket.id, 'reason:', reason);

    try {
      const currentSession = await sessions.get(socket.id);
      if (!currentSession) {
        console.log('No session found for disconnect cleanup');
        return;
      }

      // Handle active chat session if user was in chat
      if (currentSession.chatSessionId) {
        try {
          const chatSession = await db.getChatSession(currentSession.chatSessionId);
          if (chatSession && chatSession.status === 'active') {
            // End the chat session
            await db.endChatSession(currentSession.chatSessionId);

            // Notify the other user
            const otherSocketId = chatSession.initiator_socket === socket.id
              ? chatSession.recipient_socket
              : chatSession.initiator_socket;

            const otherUsername = chatSession.initiator_socket === socket.id
              ? chatSession.recipient_username
              : chatSession.initiator_username;

            io.to(otherSocketId).emit('chat:partner-disconnected', {
              username: currentSession.user?.username || 'User'
            });

            // Restore other user's state
            const otherSession = await sessions.get(otherSocketId);
            if (otherSession) {
              otherSession.state = otherSession.previousState || BBSState.LOGGEDON;
              otherSession.subState = otherSession.previousSubState || LoggedOnSubState.DISPLAY_MENU;
              otherSession.chatSessionId = undefined;
              otherSession.chatWithUserId = undefined;
              otherSession.chatWithUsername = undefined;
              otherSession.previousState = undefined;
              otherSession.previousSubState = undefined;
              await sessions.set(otherSocketId, otherSession);
            }

            // Leave room
            const roomName = `chat:${currentSession.chatSessionId}`;
            socket.leave(roomName);
            io.sockets.sockets.get(otherSocketId)?.leave(roomName);

            console.log(`[CHAT] Session ${currentSession.chatSessionId} ended due to disconnect of ${currentSession.user?.username}`);
          }
        } catch (error) {
          console.error('[CHAT] Error handling disconnect for chat session:', error);
        }
      }

      // Release multinode assignment
      await releaseNodeFromSession(currentSession);

      // Leave any chat rooms
      if (currentSession.currentRoomId) {
        const { chatRoomManager } = await import('../chatroom');
        await chatRoomManager.leaveRoom(currentSession.currentRoomId, currentSession.user?.id);
      }

      // Delete session from store
      await sessions.delete(socket.id);
    } catch (error) {
      console.error('Error during disconnect cleanup:', error);
    }
  });
}
