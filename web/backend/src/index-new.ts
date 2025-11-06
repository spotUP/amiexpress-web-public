/**
 * AmiExpress-Web Backend Server
 *
 * Main entry point for the BBS backend server.
 * This file has been modularized to improve maintainability.
 *
 * Architecture:
 * - server/app.ts - Express setup and middleware
 * - server/api-routes.ts - REST API endpoints
 * - server/file-routes.ts - File upload/download routes
 * - server/session-manager.ts - BBS session management
 * - server/database-helpers.ts - Database utility functions
 * - server/initialization.ts - Data loading and dependency injection
 * - server/socket-handlers/* - Socket.IO event handlers (kept in index.ts due to size)
 *
 * Original file: 2,801 lines
 * Refactored file: ~500 lines (socket handlers) + modules
 */

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { db } from './database';

// Import Express app and routes
import app from './server/app';
import apiRouter from './server/api-routes';
import fileRouter from './server/file-routes';

// Import initialization
import { initializeData } from './server/initialization';

// Import session management
import {
  sessions,
  getSession,
  setSession,
  deleteSession,
  createSession,
  getNextAvailableNodeId,
  checkConnectionLimit
} from './server/session-manager';

// Import database helpers
import {
  callersLog,
  displaySystemBulletins
} from './server/database-helpers';

// Import required handlers and utilities
import { BBSState, LoggedOnSubState } from './constants/bbs-states';
import { nodeManager, arexxEngine } from './nodes';
import { nodeFileManager } from './services/NodeFileManager';
import { callersLogManager } from './services/CallersLogManager';
import { displayScreen } from './handlers/screen.handler';
import { handleCommand } from './handlers/command.handler';
import { exitChat, sendChatMessage, acceptChat } from './handlers/chat.handler';
import { initializeSecurity } from './utils/security.util';
import { setEnvStat } from './utils/security.util';
import { extractAndReadDiz, getNodeWorkDir, getPlaypenDir } from './utils/file-diz.util';
import { testFile, TestResult } from './utils/file-test.util';
import { moveUploadedFile, getConferenceDir } from './utils/file-hold.util';
import { writeUploadToDirFile } from './utils/dir-file.util';
import { updateSysopUploadStats, doUploadNotify } from './utils/upload-notify.util';
import * as fs from 'fs';
import * as path from 'path';

// Export BBSSession interface and LoggedOnSubState for external use
export { LoggedOnSubState };
export interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  user?: any;
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  lastActivity: number;
  confRJoin: number;
  msgBaseRJoin: number;
  commandBuffer: string;
  commandText?: string;
  menuPause: boolean;
  messageSubject?: string;
  messageBody?: string;
  messageRecipient?: string;
  inputBuffer: string;
  relConfNum: number;
  currentConfName: string;
  cmdShortcuts: boolean;
  doorExpertMode: boolean;
  tempData?: any;
  flagManager?: any;
  inDoorManager?: boolean;
  ansiEnabled?: boolean;
  currentRoomId?: string;
  acsLevel: number;
  securityFlags: string;
  secOverride: string;
  overrideDefaultAccess: boolean;
  userSpecificAccess: boolean;
  currentStat: number;
  quietFlag: boolean;
  blockOLM: boolean;
  loginTime: number;
  nodeStartTime: number;
  nodeId: number;
  loginRetryCount: number;
  callerNum?: number;
  lastMsgReadConf: number;
  lastNewReadConf: number;
  livechatUserList?: any[];
  livechatSelectedIndex?: number;
  chatWithUsername?: string;
  chatWithUserId?: string;
  pendingChatSessionId?: string;
  chatSessionId?: string;
  pagingInterval?: NodeJS.Timeout;
  inChat?: boolean;
  chatSession?: any;
  socketId?: string;
  lastTypingTime?: number;
  partnerTypingBuffer?: string;
  typingBlinkTimer?: NodeJS.Timeout;
  userId?: string;
  username?: string;
  previousState?: BBSState;
  previousSubState?: LoggedOnSubState;
  currentRoomName?: string;
  flaggedFiles?: any[];
  expertMode?: boolean;
  bulletinContext?: any;
  lastOlmNode?: number;
  olmMessageLines?: string[];
  olmNodeTarget?: number;
  olmBuffer?: string[];
  olmQueue?: string[];
  ansiMode?: boolean;
  pagesAllowed?: number;
  quietMode?: boolean;
  relogon?: boolean;
}

// Mount API routes
app.use('/', apiRouter);
app.use('/api', fileRouter);

// Create HTTP server
const server = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: config.get('corsOrigins'),
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  perMessageDeflate: false,
  httpCompression: false,
  connectTimeout: 45000,
});

const port = process.env.PORT || config.get('port');

// ===== SOCKET.IO EVENT HANDLERS =====
// These handlers are kept in index.ts due to their size and interdependencies
// Future refactoring could extract them to server/socket-handlers/*

io.on('connection', async (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`Client connected from ${clientIp}`);

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
  let nodeSession;
  try {
    nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);
  } catch (error) {
    console.error('Failed to assign node to session:', error);
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mSorry, all nodes are busy.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease try again in a moment.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return;
  }

  const session = createSession(getNextAvailableNodeId());
  setSession(socket.id, session);

  // Display connection screen
  await displayScreen(socket, session, 'AWAITSCREEN');
  socket.emit('ansi-output', 'ANSI, RIP or No graphics (A/r/n)? ');

  session.subState = LoggedOnSubState.ANSI_PROMPT;
  session.tempData = { inputBuffer: '' };

  // Execute login trigger for AREXX scripts
  await arexxEngine.executeTrigger('login', {
    userId: undefined,
    sessionId: socket.id,
    environment: { nodeId: nodeSession.nodeId }
  });

  // ===== AUTHENTICATION HANDLERS =====
  // Import the full login handler from the original index.ts
  // Lines 769-943 of original file
  socket.on('login', async (data: { token?: string; username?: string; password?: string }) => {
    try {
      const session = getSession(socket.id);
      if (!session) return;

      // Enforce connection screen flow
      if (session.state === BBSState.AWAIT) {
        console.log('Login attempt blocked - user must view connection screens first');
        socket.emit('login-failed', 'Please view connection screens first');
        return;
      }

      let user;

      // JWT token login
      if (data.token) {
        console.log('Socket login attempt with JWT token');
        const decoded = await db.verifyAccessToken(data.token);
        user = await db.getUserById(decoded.userId);
        if (!user) {
          socket.emit('login-failed', 'User not found');
          return;
        }
      }
      // Username/password login
      else if (data.username && data.password) {
        console.log('Socket login attempt with username/password:', data.username);

        // Empty username check
        if (data.username.trim().length === 0) {
          session.loginRetryCount++;
          console.log(`Login retry count: ${session.loginRetryCount}/5 (empty username)`);

          if (session.loginRetryCount >= 5) {
            console.log('Too many login errors, disconnecting');
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          socket.emit('login-failed', 'Username cannot be empty');
          return;
        }

        // Check if user exists
        const existingUser = await db.getUserByUsername(data.username);

        if (!existingUser) {
          console.log('User not found, prompting for new user creation');
          socket.emit('user-not-found', {
            username: data.username,
            prompt: data.username.toUpperCase() === 'NEW'
              ? '[C]ontinue as a new user? '
              : `\r\nThe name ${data.username} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
          });
          return;
        }

        // Authenticate
        user = await db.authenticateUser(data.username, data.password);
        if (!user) {
          session.loginRetryCount++;
          console.log(`Login retry count: ${session.loginRetryCount}/5 (invalid password)`);

          if (session.loginRetryCount >= 5) {
            console.log('Too many login errors, disconnecting');
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          socket.emit('login-failed', 'Invalid password');
          return;
        }

        // Reset retry counter
        session.loginRetryCount = 0;

        // Generate tokens
        const accessToken = await db.generateAccessToken(user);
        const refreshToken = await db.generateRefreshToken(user);

        socket.emit('login-success', {
          user: {
            id: user.id,
            username: user.username,
            realname: user.realname,
            secLevel: user.secLevel,
            expert: user.expert,
            ansi: user.ansi
          },
          token: accessToken,
          refreshToken: refreshToken
        });
      } else {
        socket.emit('login-failed', 'Missing credentials');
        return;
      }

      // Update last login
      await db.updateUser(user.id, {
        lastLogin: new Date(),
        calls: user.calls + 1,
        callsToday: user.callsToday + 1
      });

      // Set session user data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Write node files for WHO door compatibility
      const nodeId = session.nodeId || 0;
      try {
        nodeFileManager.writeNodeUserFile(nodeId, user);
        nodeFileManager.writeNodeUserKeysFile(nodeId, user);
        console.log(`[LOGIN] Node files created for node ${nodeId}: ${user.username}`);

        callersLogManager.logLogin(nodeId, user.username);
      } catch (error) {
        console.error(`[LOGIN] Error writing node files:`, error);
      }

      // Initialize security system
      initializeSecurity(session);

      // Log successful login
      await callersLog(user.id, user.username, 'Logged on');

      // Trigger webhook for user login (skip sysops to reduce noise)
      if (user.secLevel < 255) {
        try {
          const { webhookService, WebhookTrigger } = await import('./services/webhook.service');
          await webhookService.sendWebhook(WebhookTrigger.USER_LOGIN, {
            username: user.username,
            userId: user.id,
            secLevel: user.secLevel,
            calls: user.calls + 1
          });
        } catch (error) {
          console.error('[Webhook] Error sending user login webhook:', error);
        }
      }

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1;
      session.cmdShortcuts = false;

      if (data.token) {
        socket.emit('login-success', {
          user: {
            id: user.id,
            username: user.username,
            realname: user.realname,
            secLevel: user.secLevel,
            expert: user.expert,
            ansi: user.ansi
          }
        });
      }

      // Start the proper AmiExpress flow: bulletins first
      displaySystemBulletins(socket, session);
    } catch (error) {
      console.error('Socket login error:', error);
      socket.emit('login-failed', 'Invalid credentials');
    }
  });

  // Check username handler (lines 946-984)
  socket.on('check-username', async (data: { username: string }) => {
    try {
      const session = getSession(socket.id);
      if (!session) return;

      console.log('🔍 Checking if username exists:', data.username);

      if (data.username.trim().length === 0) {
        session.loginRetryCount++;
        if (session.loginRetryCount >= 5) {
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }
        socket.emit('login-failed', 'Username cannot be empty');
        socket.emit('retry-login');
        return;
      }

      const existingUser = await db.getUserByUsername(data.username);

      if (!existingUser) {
        console.log('User not found, prompting for new user creation');
        socket.emit('user-not-found', {
          username: data.username,
          prompt: data.username.toUpperCase() === 'NEW'
            ? '[C]ontinue as a new user? '
            : `\r\nThe name ${data.username} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
        });
      } else {
        console.log('User exists, requesting password');
        socket.emit('prompt-password');
      }
    } catch (error) {
      console.error('Username check error:', error);
      socket.emit('login-failed', 'Error checking username');
      socket.emit('retry-login');
    }
  });

  // New user response handler (lines 987-1023)
  socket.on('new-user-response', async (data: { response: string; username: string }) => {
    try {
      const session = getSession(socket.id);
      if (!session) return;

      const response = data.response.toUpperCase().trim();

      if (response === 'C' || response === '') {
        console.log('User chose to create new account:', data.username);

        session.state = BBSState.REGISTERING;
        session.tempData = { newUsername: data.username };

        const { startNewUserRegistration } = require('./handlers/new-user.handler');
        await startNewUserRegistration(socket, session, data.username);
      } else {
        session.loginRetryCount++;
        console.log(`Login retry count: ${session.loginRetryCount}/5 (user chose retry)`);

        if (session.loginRetryCount >= 5) {
          console.log('Too many login errors, disconnecting');
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }

        console.log('User chose to retry login');
        socket.emit('retry-login');
      }
    } catch (error) {
      console.error('New user response error:', error);
      socket.emit('login-failed', 'Registration error');
    }
  });

  // Command handler (lines 1025-1050)
  socket.on('command', (data: string) => {
    console.log('=== COMMAND RECEIVED ===');
    console.log('Raw data:', JSON.stringify(data), 'length:', data.length, 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');

    const session = getSession(socket.id);
    if (!session) {
      console.error('No session found for socket:', socket.id);
      return;
    }

    console.log('Session state:', session.state, 'subState:', session.subState);
    console.log('Input buffer:', JSON.stringify(session.inputBuffer));

    if (data === '\r') {
      console.log('🎯 ENTER KEY DETECTED!');
      console.log('🎯 Current subState:', session.subState);
    }

    // Handle special chat keys
    if ((session as any).inChat && data === '\x1b[OP') { // F1 key
      console.log('🎯 F1 pressed during chat - exiting chat');
      exitChat(socket, session);
      return;
    }

    handleCommand(socket, session, data);
    console.log('=== COMMAND PROCESSED ===\n');
  });

  // Chat message handler (lines 1053-1057)
  socket.on('chat-message', (message: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  // Accept chat handler (lines 1059-1065)
  socket.on('accept-chat', (sessionId: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    const { chatState } = require('./server/initialization');
    const chatSession = chatState.activeSessions.find((s: any) => s.id === sessionId);
    if (chatSession && session.user?.secLevel === 255) {
      acceptChat(socket, session, chatSession);
    }
  });

  // NOTE: The following handlers are extracted from the original index.ts
  // Due to their large size (lines 1068-1437 for file-uploaded alone),
  // they remain in this file but could be extracted to separate modules in future refactoring.

  // - file-uploaded (lines 1068-1437)
  // - file-download-started (lines 1440-1515)
  // - chat:* handlers (lines 1520-1566)
  // - room:* handlers (lines 1571-1625)
  // - font preference handlers (lines 1628-1650)
  // - disconnect handler (lines 1652-1693)

  // For brevity and to avoid duplication, these handlers are included from the original file
  // Import the complete handlers from the backup file
  require('./server/socket-handlers/remaining-handlers').registerRemainingHandlers(socket, io, sessions);

  console.log('[Socket] All handlers registered for socket:', socket.id);
});

// ===== SERVER STARTUP =====
(async () => {
  try {
    console.log('Initializing database and loading data...');
    await initializeData();
    console.log('✅ Database initialization complete');

    server.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`🌐 BBS accessible at http://localhost:${port}/`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();
