/**
 * Authentication Socket Event Handlers
 * Handles login, username check, and new user registration events
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { nodeFileManager } from '../services/NodeFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import { initializeSecurity } from '../utils/security.util';
import { getSessionBySocketId, sessions, userSessions, socketToUser } from './session-manager';
import { callersLog } from './database-helpers';
import { triggerSamiLogRefresh } from '../services/SamiLogService';
import { sanitizeInput } from '../utils/input-normalizer.util';
import { displayScreen, doPause } from '../handlers/screen.handler';

/**
 * Register authentication socket event handlers
 */
export function registerAuthHandlers(socket: Socket) {
  const session = getSessionBySocketId(socket.id);
  if (!session) return;

  // Handle login with JWT token or username/password
  socket.on('login', async (data: { token?: string; username?: string; password?: string }) => {
    try {
      // Note: We don't check session state here because there can be race conditions
      // between the frontend sending 'login' and the backend processing the Enter key
      // that transitions from AWAIT → LOGON. The authentication itself is the real security check.

      let user;

      // Check if login is with JWT token or username/password
      if (data.token) {
        console.log('Socket login attempt with JWT token');

        // Verify JWT token
        const decoded = await db.verifyAccessToken(data.token);

        // Get user from database
        user = await db.getUserById(decoded.userId);
        if (!user) {
          socket.emit('login-failed', 'User not found');
          return;
        }
      } else if (data.username && data.password) {
        const safeUsername = sanitizeInput(data.username);
        console.log('Socket login attempt with username/password:', safeUsername);

        // express.e:29627-29628 - Empty username counts as retry
        if (safeUsername.length === 0) {
          session.loginRetryCount++;
          console.log(`Login retry count: ${session.loginRetryCount}/5 (empty username)`);

          // express.e:29633-29637 - Check if too many errors
          if (session.loginRetryCount >= 5) {
            console.log('Too many login errors, disconnecting');
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          socket.emit('login-failed', 'Username cannot be empty');
          return;
        }

        // express.e:29605-29631 - Check if user exists first, then authenticate
        const existingUser = await db.getUserByUsername(safeUsername);

        if (!existingUser) {
          // User not found - express.e:29608-29622
          // Prompt: "[R]etry your name or [C]ontinue as a new user?"
          console.log('User not found, prompting for new user creation');
          socket.emit('user-not-found', {
            username: safeUsername,
            prompt: safeUsername.toUpperCase() === 'NEW'
              ? '[C]ontinue as a new user? '
              : `\r\nThe name ${safeUsername} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
          });
          return;
        }

        // User exists, authenticate with password
        console.log('[LOGIN] Authenticating user:', safeUsername);
        user = await db.authenticateUser(safeUsername, data.password);
        console.log('[LOGIN] Authentication result:', user ? 'SUCCESS' : 'FAILED');
        if (!user) {
          // express.e:29209 & 29343 - Invalid password message with linebreak
          session.loginRetryCount++;
          console.log(`Login retry count: ${session.loginRetryCount}/5 (invalid password)`);

          // express.e:29633-29637 - Check if too many errors
          if (session.loginRetryCount >= 5) {
            console.log('Too many login errors, disconnecting');
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          // express.e:29209 - aePuts('Invalid PassWord\b\n')
          socket.emit('login-failed', 'Invalid PassWord\r\n');
          return;
        }
        console.log('[LOGIN] User authenticated successfully, proceeding with login flow');

        // Reset retry counter on successful login
        session.loginRetryCount = 0;

        // Generate JWT tokens for this session
        const accessToken = await db.generateAccessToken(user);
        const refreshToken = await db.generateRefreshToken(user);

        // Send tokens to client for future use
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
      await db.updateUser(user.id, { lastLogin: new Date(), calls: user.calls + 1, callsToday: user.callsToday + 1 });

      // Set session user data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // CRITICAL SESSION MIGRATION: Move session from socket-based to user-based storage
      // This fixes the multi-socket connection issue where new sockets get fresh sessions
      console.log(`[SESSION-MIGRATION] User ${user.id} logged in on socket ${socket.id}`);
      console.log(`[SESSION-MIGRATION] Migrating session from socket-based to user-based storage`);

      // Remove from socket-based pre-login storage
      sessions.delete(socket.id);

      // Store in user-based post-login storage
      userSessions.set(user.id, session);

      // Map this socket to the user
      socketToUser.set(socket.id, user.id);

      console.log(`[SESSION-MIGRATION] Session now keyed by user ID: ${user.id}`);

      // CRITICAL: Write node{n}.user and node{n}.userkeys files for WHO door compatibility
      // express.e:2935-2950 createNodeUserFiles()
      const nodeId = session.nodeId || 0;
      try {
        nodeFileManager.writeNodeUserFile(nodeId, user);
        nodeFileManager.writeNodeUserKeysFile(nodeId, user);
        console.log(`[LOGIN] Node files created for node ${nodeId}: ${user.username}`);

        // Write to CallersLog
        callersLogManager.logLogin(nodeId, user.username);
      } catch (error) {
        console.error(`[LOGIN] Error writing node files:`, error);
      }

      // Phase 9: Initialize security system (express.e:447-455)
      initializeSecurity(session);

      // Log successful login (express.e:9493 callersLog)
      await callersLog(user.id, user.username, 'Logged on');

      // Track system stats for ~SC MCI code (system calls today)
      try {
        const { systemStats } = await import('../services/SystemStatsService');
        await systemStats.incrementCalls(user.id);
      } catch (error) {
        console.error('[SystemStats] Error tracking login:', error);
      }

      // Trigger webhook for user login (skip for sysops to reduce noise)
      if (user.secLevel < 255) {
        try {
          const { webhookService, WebhookTrigger } = await import('../services/webhook.service');
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
      session.msgBaseRJoin = 1; // Default message base
      // Like express.e:394 - default cmdShortcuts to FALSE (line input mode)
      // This will be set to TRUE if .keys file exists when displaying menu (express.e:6567-6573)
      session.cmdShortcuts = false;

      // If we already sent login-success for username/password, don't send again
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

      // express.e:29854 - IF (displayScreen(SCREEN_LOGON)) THEN doPause()
      const logonDisplayed = await displayScreen(socket, session, 'LOGON', false);
      if (logonDisplayed) {
        doPause(socket, session);
      }

      // Begin bulletin flow: BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      triggerSamiLogRefresh();
    } catch (error) {
      console.error('Socket login error:', error);
      socket.emit('login-failed', 'Invalid credentials');
    }
  });

  // Check if username exists (called before password prompt)
  socket.on('check-username', async (data: { username: string }) => {
    try {
      const safeUsername = sanitizeInput(data.username);
      console.log('🔍 Checking if username exists:', safeUsername);

      // Empty username check
      if (safeUsername.length === 0) {
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

      const existingUser = await db.getUserByUsername(safeUsername);

      if (!existingUser) {
        // User not found - prompt for new user creation
        console.log('User not found, prompting for new user creation');
        socket.emit('user-not-found', {
          username: safeUsername,
          prompt: safeUsername.toUpperCase() === 'NEW'
            ? '[C]ontinue as a new user? '
            : `\r\nThe name ${safeUsername} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
        });
      } else {
        // User exists - prompt for password
        console.log('User exists, requesting password');
        socket.emit('prompt-password');
      }
    } catch (error) {
      console.error('Username check error:', error);
      socket.emit('login-failed', 'Error checking username');
      socket.emit('retry-login');
    }
  });

  // express.e:29622 - Handle new user response (R=retry, C=continue as new user)
  socket.on('new-user-response', async (data: { response: string; username: string }) => {
    try {
      const response = data.response.toUpperCase().trim();
      const safeUsername = sanitizeInput(data.username);

      if (response === 'C' || response === '') {
        // Continue as new user - express.e:29646-29651
        console.log('User chose to create new account:', safeUsername);

        // Start new user account creation flow
        session.state = BBSState.REGISTERING;
        session.tempData = { newUsername: safeUsername };

        // Import and call new user handler
        const { startNewUserRegistration } = require('../handlers/new-user.handler');
        await startNewUserRegistration(socket, session, safeUsername);
      } else {
        // express.e:29622 - Retry login increments retry counter
        session.loginRetryCount++;
        console.log(`Login retry count: ${session.loginRetryCount}/5 (user chose retry)`);

        // express.e:29633-29637 - Check if too many errors
        if (session.loginRetryCount >= 5) {
          console.log('Too many login errors, disconnecting');
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }

        // Retry login - send back to login screen
        console.log('User chose to retry login');
        socket.emit('retry-login');
      }
    } catch (error) {
      console.error('New user response error:', error);
      socket.emit('login-failed', 'Registration error');
    }
  });
}
