/**
 * Authentication Socket Event Handlers
 * Handles login, username check, and new user registration events
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { nodeFileManager } from '../services/NodeFileManager';
import { userFileManager } from '../services/UserFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import { initializeSecurity, setEnvStat } from '../utils/security.util';
import { EnvStat } from '../constants/env-codes';
import { AnsiUtil } from '../utils/ansi.util';
import { getSessionBySocketId, sessions, userSessions, socketToUser } from './session-manager';
import { callersLog } from './database-helpers';
import { triggerSamiLogRefresh } from '../services/SamiLogService';
import { sanitizeInput } from '../utils/input-normalizer.util';
import { ipBanManager } from '../security/ip-ban-manager';
import { displayScreen, doPause } from '../handlers/screen.handler';
import { runLoginBatches } from '../services/batch-scheduler';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { sessionLogManager } from '../services/SessionLogManager';

/**
 * Register authentication socket event handlers
 */
export function registerAuthHandlers(socket: Socket) {
  const session = getSessionBySocketId(socket.id);
  if (!session) return;

  const installAnsiFilter = (sock: Socket, sess: any) => {
    if ((sock as any)._ansiFilterInstalled) return;
    const originalEmit = sock.emit.bind(sock);
    sock.emit = ((event: string, ...args: any[]) => {
      if (event === 'ansi-output' && (sess.ansiMode === false || sess.user?.ansi === false)) {
        const filtered = args.map((arg) =>
          typeof arg === 'string' ? AnsiUtil.stripAnsiForPlainText(arg) : arg
        );
        return originalEmit(event, ...filtered);
      }
      return originalEmit(event, ...args);
    }) as any;
    (sock as any)._ansiFilterInstalled = true;
  };

  const getMaxPasswordFails = () => {
    try {
      if (db && typeof db.getConfigRepository === 'function') {
        const repo = db.getConfigRepository();
        if (repo && typeof repo.getSystemConfig === 'function') {
          const sys = repo.getSystemConfig();
          if (typeof sys?.max_password_fails === 'number') {
            return sys.max_password_fails;
          }
        }
      }
    } catch (error) {
      console.warn('[AUTH] Unable to load max_password_fails from config:', error);
    }
    return 5;
  };

  // Handle login with JWT token or username/password
  socket.on('login', async (data: { token?: string; username?: string; password?: string }) => {
    try {
      // Note: We don't check session state here because there can be race conditions
      // between the frontend sending 'login' and the backend processing the Enter key
      // that transitions from AWAIT → LOGON. The authentication itself is the real security check.

      let user: any;
      const remoteAddress = session?.remoteAddress || (socket as any).handshake?.address || 'unknown';
      const handleFailure = () => {
        const stillAllowed = ipBanManager.recordFailure(remoteAddress);
        if (!stillAllowed) {
          socket.emit('ansi-output', '\r\nToo many invalid attempts. Please wait a few minutes and try again.\r\n');
          socket.disconnect();
        }
        return stillAllowed;
      };

      // Check if login is with JWT token or username/password
      if (data.token) {
        console.log('Socket login attempt with JWT token');

        // Verify JWT token
        const decoded = await db.verifyAccessToken(data.token);

        // Get user from database
        user = await db.getUserById(decoded.userId);
        if (!user) {
          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'JWT authentication failed - user not found',
            { userId: decoded.userId },
            DebugSeverity.WARNING
          );
          socket.emit('login-failed', 'User not found');
          return;
        }
      } else if (data.username && typeof data.password === 'string') {
        const safeUsername = sanitizeInput(data.username);
        console.log('Socket login attempt with username/password:', safeUsername);

        // express.e:29627-29628 - Empty username counts as retry
        if (safeUsername.length === 0) {
          session.loginRetryCount++;
          const maxFails = getMaxPasswordFails();
          console.log(`Login retry count: ${session.loginRetryCount}/${maxFails} (empty username)`);

          if (maxFails >= 0 && session.loginRetryCount >= maxFails) {
            console.log('Too many login errors, disconnecting');
            SysopDebugUtil.debug(
              socket,
              session,
              'AUTH',
              'Too many login errors - disconnecting',
              { reason: 'empty username', retries: session.loginRetryCount, maxFails },
              DebugSeverity.CRITICAL
            );
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Login attempt with empty username',
            { retries: session.loginRetryCount, maxFails },
            DebugSeverity.WARNING
          );
          socket.emit('login-failed', 'Username cannot be empty');
          if (!handleFailure()) return;
          return;
        }

        // express.e:29605-29631 - Check if user exists first, then authenticate
        const passwordValue = data.password ?? '';
        const existingUser = await db.getUserByUsername(safeUsername);

        if (!existingUser) {
          console.log('User not found, prompting for new user creation');
          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'User not found - prompting for new user creation',
            { attemptedUsername: safeUsername },
            DebugSeverity.INFO
          );
          socket.emit('user-not-found', {
            username: safeUsername,
            prompt: safeUsername.toUpperCase() === 'NEW'
              ? '[C]ontinue as a new user? '
              : `\r\nThe name ${safeUsername} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
          });
          if (!handleFailure()) return;
          return;
        }

        if (passwordValue.length === 0) {
          // Empty password counts as invalid attempt (express.e re-prompts with error)
          session.loginRetryCount++;
          const maxFails = getMaxPasswordFails();
          console.log(`Login retry count: ${session.loginRetryCount}/${maxFails} (empty password)`);

          if (maxFails >= 0 && session.loginRetryCount >= maxFails) {
            console.log('Too many login errors, disconnecting');
            SysopDebugUtil.debug(
              socket,
              session,
              'AUTH',
              'Too many login errors - disconnecting',
              { reason: 'empty password', username: safeUsername, retries: session.loginRetryCount, maxFails },
              DebugSeverity.CRITICAL
            );
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Login attempt with empty password',
            { username: safeUsername, retries: session.loginRetryCount, maxFails },
            DebugSeverity.WARNING
          );
          socket.emit('ansi-output', '\r\nInvalid PassWord\r\n');
          socket.emit('prompt-password');
          if (!handleFailure()) return;
          return;
        }

        console.log('[LOGIN] Authenticating user:', safeUsername);
        user = await db.authenticateUser(safeUsername, passwordValue);
        console.log('[LOGIN] Authentication result:', user ? 'SUCCESS' : 'FAILED');
        if (!user) {
          // express.e:29209 & 29343 - Invalid password message with linebreak
          session.loginRetryCount++;
          const maxFails = getMaxPasswordFails();
          console.log(`Login retry count: ${session.loginRetryCount}/${maxFails} (invalid password)`);

          if (maxFails >= 0 && session.loginRetryCount >= maxFails) {
            console.log('Too many login errors, disconnecting');
            SysopDebugUtil.debug(
              socket,
              session,
              'AUTH',
              'Too many login errors - disconnecting',
              { reason: 'invalid password', username: safeUsername, retries: session.loginRetryCount, maxFails },
              DebugSeverity.CRITICAL
            );
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Invalid password',
            { username: safeUsername, retries: session.loginRetryCount, maxFails },
            DebugSeverity.WARNING
          );
          // express.e:29209 - aePuts('Invalid PassWord\b\n')
          socket.emit('login-failed', 'Invalid PassWord\r\n');
          // Match express.e: immediately re-prompt for password without asking for username again
          socket.emit('ansi-output', '\r\nInvalid PassWord\r\n');
          socket.emit('prompt-password');
          if (!handleFailure()) return;
          return;
        }
        console.log('[LOGIN] User authenticated successfully, proceeding with login flow');

        // Reset retry counter on successful login
        session.loginRetryCount = 0;
        ipBanManager.resetFailures(remoteAddress);

        // CRITICAL: Sync user to disk files for 68K door compatibility
        // 68K doors use XIM protocol and read from user.data, not database
        try {
          // Get all users to determine slot number (sorted by creation date)
          const allUsers = await db.getUsers({});
          const slotNumber = allUsers.findIndex((u: any) => u.id === user.id);

          if (slotNumber >= 0) {
            // Write/update user.data, user.keys, user.misc
            userFileManager.updateUserDataFile(user, slotNumber + 1); // Slots are 1-indexed in AmiExpress
            console.log(`[LOGIN] Synced user ${user.username} to disk files (slot ${slotNumber + 1})`);
          } else {
            console.error(`[LOGIN] Failed to find slot number for user ${user.username}`);
          }
        } catch (error) {
          console.error(`[LOGIN] Failed to sync user to disk:`, error);
          // Don't fail login - disk sync is best-effort
        }

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
        SysopDebugUtil.debug(
          socket,
          session,
          'AUTH',
          'Login attempt with missing credentials',
          { hasToken: !!data.token, hasUsername: !!data.username, hasPassword: !!data.password },
          DebugSeverity.WARNING
        );
        socket.emit('login-failed', 'Missing credentials');
        return;
      }

      // Update last login
      await db.updateUser(user.id, { lastLogin: new Date(), calls: user.calls + 1, callsToday: user.callsToday + 1 });

      // Set session user data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;
      session.ansiMode = user.ansi;
      installAnsiFilter(socket, session);

      // Test sysop debug system
      SysopDebugUtil.debug(
        socket,
        session,
        'AUTH',
        'Login successful - sysop debug system active',
        { username: user.username, secLevel: user.secLevel },
        DebugSeverity.INFO
      );

      // Update session log with user info
      sessionLogManager.updateSession(socket.id, user.id, user.username, session.nodeId);

      // Run daily batch for this node (once per calendar day, per node) to mirror AmiExpress batch runner
      try {
        await runLoginBatches(session.nodeId || 0);
      } catch (err) {
        console.error('[LOGIN] Batch scheduler failed:', err);
        SysopDebugUtil.debug(
          socket,
          session,
          'AUTH',
          'Login batch scheduler failed',
          { nodeId: session.nodeId, error: (err as Error).message },
          DebugSeverity.WARNING
        );
      }

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
        SysopDebugUtil.debugFileError(
          socket,
          session,
          'write',
          `Node${nodeId}.user / Node${nodeId}.userkeys`,
          error as Error,
          DebugSeverity.CRITICAL
        );
      }

      // Phase 9: Initialize security system (express.e:447-455)
      initializeSecurity(session);
      setEnvStat(session, EnvStat.IDLE);

      // Log successful login (express.e:9493 callersLog)
      await callersLog(user.id, user.username, 'Logged on');

      // Track system stats for ~SC MCI code (system calls today)
      try {
        const { systemStats } = await import('../services/SystemStatsService');
        await systemStats.incrementCalls(user.id);
      } catch (error) {
        console.error('[SystemStats] Error tracking login:', error);
        SysopDebugUtil.debug(
          socket,
          session,
          'AUTH',
          'SystemStats tracking failed',
          { userId: user.id, error: (error as Error).message },
          DebugSeverity.WARNING
        );
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
          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Webhook service failed',
            { userId: user.id, username: user.username, error: (error as Error).message },
            DebugSeverity.WARNING
          );
        }
      }

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1; // Default message base
      // Like express.e:394 - default cmdShortcuts to FALSE (line input mode)
      // This will be set to TRUE if .keys file exists when displaying menu (express.e:6567-6573)
      session.cmdShortcuts = false;
      session.inDoorManager = false;
      session.doorInputHandler = undefined;
      if (session.shortcuts) session.shortcuts.clear();

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

      // QuickLogon ('Q' at ANSI prompt) skips LOGON/BULL/CONF_BULL and jumps to menu
      if (session.tempData?.quickLogon) {
        session.tempData.quickLogon = false;
        session.menuPause = true;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        const { displayMainMenu } = require('./command-handler/menu');
        await displayMainMenu(socket, session);
        return;
      }

      // express.e:29854 - IF (displayScreen(SCREEN_LOGON)) THEN doPause()
      const logonDisplayed = await displayScreen(socket, session, 'LOGON', false);
      // If the screen didn't set up its own pause, add one so the user can read it
      if (logonDisplayed && !session.paginatedScreen) {
        doPause(socket, session);
      }

      // Begin bulletin flow: BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      triggerSamiLogRefresh();
    } catch (error) {
      console.error('Socket login error:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'AUTH',
        'Login exception caught',
        { error: (error as Error).message, stack: (error as Error).stack },
        DebugSeverity.CRITICAL
      );
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
          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Too many login errors in check-username - disconnecting',
            { reason: 'empty username', retries: session.loginRetryCount },
            DebugSeverity.CRITICAL
          );
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }
        SysopDebugUtil.debug(
          socket,
          session,
          'AUTH',
          'Empty username in check-username handler',
          { retries: session.loginRetryCount },
          DebugSeverity.WARNING
        );
        // Don't emit login-failed for empty username - just show prompt again
        // login-failed clears saved credentials which is annoying for typos
        socket.emit('ansi-output', '\r\n\x1b[33mUsername cannot be empty\x1b[0m\r\nUsername: ');
        socket.emit('retry-login');
        return;
      }

        const existingUser = await db.getUserByUsername(safeUsername);

      if (!existingUser) {
        // User not found - prompt for new user creation (express.e:29622-29651)
        console.log('User not found, prompting for new user creation');
        const prompt =
          safeUsername.toUpperCase() === 'NEW'
            ? '[C]ontinue as a new user? '
            : `\r\nThe name ${safeUsername} is not used on this BBS.\r\n[R]etry your name or [C]ontinue as a new user?\r\n\r\n`;
        socket.emit('user-not-found', {
          username: safeUsername,
          prompt
        });
      } else {
        // User exists - prompt for password
        console.log('User exists, requesting password');
        socket.emit('prompt-password');
      }
    } catch (error) {
      console.error('Username check error:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'AUTH',
        'Exception in check-username handler',
        { error: (error as Error).message },
        DebugSeverity.CRITICAL
      );
      // Don't clear credentials for server errors - just retry
      socket.emit('ansi-output', '\r\n\x1b[31mError checking username, please try again\x1b[0m\r\nUsername: ');
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
        const { startNewUserRegistration } = require('../handlers/user/new-user.handler');
        await startNewUserRegistration(socket, session, safeUsername);
      } else {
        // express.e:29622 - Retry login increments retry counter
        session.loginRetryCount++;
        console.log(`Login retry count: ${session.loginRetryCount}/5 (user chose retry)`);

        // express.e:29633-29637 - Check if too many errors
        if (session.loginRetryCount >= 5) {
          console.log('Too many login errors, disconnecting');
          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Too many login errors in new-user-response - disconnecting',
            { reason: 'retry limit exceeded', retries: session.loginRetryCount },
            DebugSeverity.CRITICAL
          );
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }

        // Retry login - send back to login screen with username prompt
        console.log('User chose to retry login');
        socket.emit('ansi-output', '\r\nUsername: ');
        socket.emit('retry-login');
      }
    } catch (error) {
      console.error('New user response error:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'AUTH',
        'Exception in new-user-response handler',
        { error: (error as Error).message },
        DebugSeverity.CRITICAL
      );
      socket.emit('login-failed', 'Registration error');
    }
  });
}
