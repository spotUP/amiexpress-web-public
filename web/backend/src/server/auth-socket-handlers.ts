/**
 * Authentication Socket Event Handlers
 * Handles login, username check, and new user registration events
 */

import { Socket } from 'socket.io';
import * as crypto from 'crypto';
import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { nodeFileManager } from '../services/NodeFileManager';
import { userFileManager } from '../services/UserFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import { initializeSecurity, setEnvStat } from '../utils/security.util';
import { EnvStat } from '../constants/env-codes';
import { AnsiUtil } from '../utils/ansi.util';
import {
  getSessionBySocketId,
  sessions,
  userSessions,
  socketToUser,
  socketToNodeId,
  pendingDisconnects,
  clearPendingDisconnect,
  setSession,
  deleteSession
} from './session-manager';
import { callersLog } from './database-helpers';
import { triggerSamiLogRefresh } from '../services/SamiLogService';
import { sanitizeInput } from '../utils/input-normalizer.util';
import { ipBanManager } from '../security/ip-ban-manager';
import { displayScreen, doPause } from '../handlers/screen.handler';
import { runLoginBatches, runExecuteOn } from '../services/batch-scheduler';
import { mailOnLogon, mailOnPwdFail, isMailEventEnabled, isSmtpConfigured } from '../services/mail-notification.service';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { sessionLogManager } from '../services/SessionLogManager';
import { emitUserLogin } from '../services/bbs-event-emitter';
import { getSystemTime } from '../utils/date-time.util';

/**
 * Register authentication socket event handlers
 */
export function registerAuthHandlers(socket: Socket) {
  const initialSession = getSessionBySocketId(socket.id);
  if (!initialSession) return;
  let session: BBSSession = initialSession;

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

  // Handle session restoration after reconnect
  socket.on('restore-session', async (sessionData: { userId?: string; username?: string; nodeId?: number; savedAt?: number }) => {
    try {
console.log('[Session Restore] Attempting to restore session for user:', sessionData.username);

      if (!sessionData.userId || !sessionData.username) {
console.log('[Session Restore] Missing required session data');
        socket.emit('session-restore-failed', 'Invalid session data');
        return;
      }

      // Check if session is too old (should match frontend check)
      if (sessionData.savedAt && Date.now() - sessionData.savedAt > 120000) {
console.log('[Session Restore] Session expired (> 2 minutes old)');
        socket.emit('session-restore-failed', 'Session expired');
        return;
      }

      // Get user from database
      const user = await db.getUserById(sessionData.userId);
      if (!user) {
console.log('[Session Restore] User not found:', sessionData.userId);
        socket.emit('session-restore-failed', 'User not found');
        return;
      }

      // Check if there's an existing session for this user
      const existingSession = userSessions.get(String(user.id));
      if (existingSession) {
        // CRITICAL: only adopt the existing session if its old socket is gone.
        // If the old socket is still connected (a concurrent browser tab,
        // not a reload/reconnect), adopting it would rebind session.socketId
        // to this new socket and route all output here — the old tab would
        // receive the new tab's output and vice versa (cross-tab leak,
        // 2026-04-24). Refuse restore in that case; the new tab falls
        // through to a normal fresh login.
        const oldSocketId = existingSession.socketId;
        const oldSocketAlive = Boolean(
          oldSocketId &&
          oldSocketId !== socket.id &&
          (socket.nsp as any).sockets?.has?.(oldSocketId)
        );
        if (oldSocketAlive) {
console.log(`[Session Restore] Old socket ${oldSocketId} still alive — refusing restore, forcing fresh login on a new node`);
          socket.emit('session-restore-failed', 'Another tab or client is already signed in as this user.');
          return;
        }
console.log('[Session Restore] Found existing session for user, rebinding to new socket');

        // Update socket mappings
        socketToUser.set(socket.id, String(user.id));
        socketToNodeId.set(socket.id, existingSession.nodeId);

        // Update session with new socket ID
        existingSession.socketId = socket.id;
        setSession(socket.id, existingSession);

        // Clear any pending disconnect timer
        clearPendingDisconnect(String(user.id));

        // Load command history from database
        const { loadHistory } = require('../utils/command-history.util');
        loadHistory(existingSession, user.id).catch((err: any) => {
console.error('[Session Restore] Failed to load command history:', err);
        });

        // Re-apply modem emulation from restored session
        const userBaud = user.baud || 0;
        existingSession.modemBps = userBaud;
        existingSession.modemEmulationEnabled = userBaud > 0;

        // Re-install modem speed emulator on new socket
        const { getModemEmulator } = require('../utils/modem-emulator.util');
        const modemEmulator = getModemEmulator(socket);
        modemEmulator.install();
        if (userBaud > 0) {
          modemEmulator.enable(userBaud);
          console.log(`[SESSION RESTORE] Modem emulation re-enabled at ${userBaud} bps for ${user.username}`);
        }

        // Send modem speed to frontend for client-side emulation
        // Also track in session so doors can query it via bbs.getModemSpeed()
        console.log(`[SESSION RESTORE] Emitting modem-speed event with userBaud=${userBaud}`);
        (session as any).modemSpeed = userBaud;
        socket.emit('modem-speed', userBaud);
        console.log(`[SESSION RESTORE] modem-speed event emitted`);

        // Disable AnsiBuffer batching when modem emulation is enabled
        const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
        const ansiBuffer = getAnsiBuffer(socket);
        ansiBuffer.setFlushDelay(userBaud > 0 ? 0 : 16);

        // Notify client of successful restoration
        socket.emit('session-restored', {
          user: {
            id: user.id,
            username: user.username,
            realname: user.realname,
            secLevel: user.secLevel,
            expert: user.expert,
            ansi: user.ansi
          },
          userId: user.id,
          username: user.username,
          nodeId: existingSession.nodeId,
          currentConf: existingSession.currentConf,
        });

console.log('[Session Restore] Session restored successfully for user:', user.username);
      } else {
console.log('[Session Restore] No existing session found, falling back to normal login');
        socket.emit('session-restore-failed', 'No session found');
      }
    } catch (error) {
console.error('[Session Restore] Error restoring session:', error);
      socket.emit('session-restore-failed', 'Internal error');
    }
  });

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

            // express.e:29152-29177 - MAIL_ON_PWD_FAIL password reset flow
            // Check if password reset is available: MAIL_ON_PWD_FAIL enabled, SMTP configured, user has email
            const mailEnabled = await isMailEventEnabled('PWD_FAIL');
            const smtpConfigured = await isSmtpConfigured();
            const userEmail = existingUser?.email;

            if (mailEnabled && smtpConfigured && userEmail) {
              // express.e:29155-29160 - Prompt for password reset
              socket.emit('ansi-output', '\r\n\x1b[33mExcessive Password Failure\x1b[0m\r\n\r\n');
              socket.emit('ansi-output', 'Do you want to send a reset code to your email address? (Y/n): ');

              // Store state for password reset flow
              session.passwordResetUsername = safeUsername;
              session.passwordResetState = 'await_confirm';

              // Tell frontend to switch to password reset mode
              socket.emit('prompt-password-reset', { state: 'await_confirm' });
              return;
            }

            // No reset available - disconnect
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
          // Match express.e: immediately re-prompt for password without asking for username again
          // Pass retryFrom='password' so frontend knows to keep username and only retry password
          socket.emit('login-failed', { reason: 'Invalid PassWord', retryFrom: 'password' });
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
        if (user.slotNumber) {
          try {
            userFileManager.updateUserDataFile(user, user.slotNumber);
console.log(`[LOGIN] Synced user ${user.username} to disk files (slot ${user.slotNumber})`);
          } catch (error) {
console.error(`[LOGIN] Failed to sync user to disk:`, error);
            // Don't fail login - disk sync is best-effort
          }
        } else {
console.warn(`[LOGIN] User ${user.username} has no slot number, skipping disk sync`);
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

      // Preserve previous last login for conference scan (New Since Date)
      const lastLoginBeforeUpdate = user.lastLogin ? new Date(user.lastLogin) : new Date(0);
      
      // Update last login
      await db.updateUser(user.id, { lastLogin: getSystemTime(), calls: user.calls + 1, callsToday: user.callsToday + 1 });

      // Set session user data
      // ... (existing code continues) ...
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.EXEC_QUICKNEW;
      session.user = { ...user, lastLoginBeforeUpdate };
      session.ansiMode = user.ansi;
      installAnsiFilter(socket, session);

      // Apply modem emulation preference from user baud (0/undefined = full speed)
      const userBaud = user.baud || 0;
      session.modemBps = userBaud;
      session.modemEmulationEnabled = userBaud > 0;

      // Install modem speed emulator (wraps socket.emit for throttled output)
      const { getModemEmulator } = require('../utils/modem-emulator.util');
      const modemEmulator = getModemEmulator(socket);
      modemEmulator.install();
      if (userBaud > 0) {
        modemEmulator.enable(userBaud);
        console.log(`[WEB LOGIN] Modem emulation enabled at ${userBaud} bps for ${user.username}`);
      }

      // Send modem speed to frontend for client-side emulation (web terminal only)
      // Also track in session so doors can query it via bbs.getModemSpeed()
      console.log(`[WEB LOGIN] Emitting modem-speed event with userBaud=${userBaud}`);
      (session as any).modemSpeed = userBaud;
      socket.emit('modem-speed', userBaud);
      console.log(`[WEB LOGIN] modem-speed event emitted`);

      // Disable AnsiBuffer batching when modem emulation is enabled
      const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
      const ansiBuffer = getAnsiBuffer(socket);
      ansiBuffer.setFlushDelay(userBaud > 0 ? 0 : 16);

      // Register node with MULTICOM manager for WHO doors
      try {
        const { multicomManager, ENV_MENU } = await import('../nodes/MulticomManager.js');
        multicomManager.updateNode(
          session.nodeId,
          user.username,
          user.location || 'Unknown',
          ENV_MENU  // User just logged in, at menu
        );
        console.error(`[LOGIN] Registered node ${session.nodeId} with MULTICOM: ${user.username}`);
      } catch (error) {
        console.error(`[LOGIN] Failed to register node with MULTICOM:`, error);
      }

      // Load command history from database
      const { loadHistory } = require('../utils/command-history.util');
      loadHistory(session, user.id).catch((err: any) => {
console.error('[LOGIN] Failed to load command history:', err);
      });

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
      // NOTE: Don't await - run in background so login flow continues immediately
      runLoginBatches(session.nodeId || 0).catch((err) => {
console.error('[LOGIN] Batch scheduler failed:', err);
        SysopDebugUtil.debug(
          socket,
          session,
          'AUTH',
          'Login batch scheduler failed',
          { nodeId: session.nodeId, error: (err as Error).message },
          DebugSeverity.WARNING
        );
      });

      // Run EXECUTE_ON_LOGON command from bbsConfig.info (express.e:6715)
      runExecuteOn('LOGON', session.nodeId || 1, {
        username: user.username,
        location: user.location
      }).catch((err) => {
console.error('[LOGIN] EXECUTE_ON_LOGON failed:', err);
      });

      // MAIL_ON_LOGON tooltype - express.e:6716-6720
      mailOnLogon(user.username, user.location || '').catch((err) => {
console.error('[LOGIN] MAIL_ON_LOGON failed:', err);
      });

      // Run LOGON syscmds - mirroring express.e LOGOFF pattern (express.e:8222, 8231)
      // This allows sysops to define LOGON and LOGONn syscmds to run at login time
      try {
        const { runSysCommand } = require('../handlers/command-execution.handler');
        // Run generic LOGON syscmd (if exists)
        await runSysCommand(socket, session, 'LOGON', '');
        // Run node-specific LOGONn syscmd (if exists)
        await runSysCommand(socket, session, `LOGON${session.nodeId || 0}`, '');
      } catch (err) {
        console.error('[LOGIN] LOGON syscmd failed:', err);
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

      // Emit BBS event for LiveChat integration
      try {
        emitUserLogin({
          username: user.username,
          nodeId: session.nodeId || 1,
          location: user.location || 'Unknown',
          timestamp: Date.now()
        });
      } catch (error) {
console.error('[BBSEvent] Error emitting login event:', error);
      }

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
      // CRITICAL: Set currentConf for XIM doors (BB_CONFNUM query) - express.e sets this at login
      session.currentConf = user.autoRejoin || 1;
      session.currentConference = user.autoRejoin || 1;
      session.conferenceId = user.autoRejoin || 1;
      // Like express.e:394 - default cmdShortcuts to FALSE (line input mode)
      // This will be set to TRUE if .keys file exists when displaying menu (express.e:6567-6573)
      session.cmdShortcuts = false;
      session.inDoorManager = false;
      session.mouseEventsEnabled = false; // Ensure mouse events are disabled on login
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
        const { displayMainMenu } = require('../handlers/command-handler/menu');
        await displayMainMenu(socket, session);
        return;
      }

      // CHAT-ONLY MODE: Auto-launch LiveChat door for web chat connections
      // Detected by ?chatOnly=true query parameter or session.tempData.chatOnly flag
      const chatOnly = socket.handshake?.query?.chatOnly === 'true' || session.tempData?.chatOnly;
      if (chatOnly) {
console.log('[AUTH] Chat-only mode detected - auto-launching LiveChat door');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DOOR_RUNNING;

        // Import and execute the door handler to launch LiveChat
        const { executeDoor } = require('../handlers/door.handler');

        // Create a door object for LiveChat
        const liveChatDoor = {
          name: 'livechat',
          path: 'Doors/livechat',
          location: 'Doors/livechat',
          executable: 'livechat',
          type: 'typescript',
          category: 'Chat',
          args: [],
        };

        try {
          await executeDoor(socket, session, liveChatDoor, []);
        } catch (error) {
console.error('[AUTH] Failed to launch LiveChat door:', error);
          socket.emit('ansi-output', '\r\n\x1b[31mFailed to launch LiveChat. Please try again.\x1b[0m\r\n');
        }

        triggerSamiLogRefresh();
        return;
      }

      // TOKEN-BASED RECONNECTION: Show bulletins like a normal login
      // This matches AmiExpress behavior where bulletins are shown on each connection
      // Users can press 'Q' at ANSI prompt for quick logon to skip bulletins
      if (data.token) {
console.log('[AUTH] =============================================');
console.log('[AUTH] TOKEN-BASED LOGIN DETECTED');
console.log('[AUTH] Showing bulletins like normal login (AmiExpress behavior)');
console.log('[AUTH] =============================================');
        // Fall through to normal bulletin display flow below
      }

      // express.e:29853-29855 - IF (quickFlag=FALSE) IF (displayScreen(SCREEN_LOGON)) THEN doPause()
      // When quickFlag is set (user entered 'Q' at ANSI prompt), skip LOGON screen
      let logonDisplayed = false;
      if (!session.quickFlag) {
        logonDisplayed = await displayScreen(socket, session, 'LOGON', false);
      } else {
console.log('[LOGIN] Quick logon - skipping LOGON screen per express.e:29853');
      }

      // express.e:29859-29861 - After LOGON screen, state:=STATE_LOGGEDON (main loop processes it)
      // Begin bulletin flow: BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      triggerSamiLogRefresh();

      if (logonDisplayed) {
        // LOGON screen displayed - honor express.e doPause() (express.e:29854)
        // NOTE: We don't pass an onComplete callback because handleCommand (command.handler.ts:692-693)
        // automatically calls advanceDisplayFlow() when pagination completes in a display flow state.
        // Passing a callback that calls handleCommand would cause DOUBLE advancement (BULL displays twice).
        // CRITICAL: Only call doPause if displayScreen didn't already set up a pause (via ~SP MCI)
        if (!session.paginatedScreen) {
console.log('[LOGIN] LOGON displayed, adding pause per express.e:29854');
          doPause(socket, session);
        } else {
console.log('[LOGIN] LOGON displayed with built-in pause (~SP), skipping doPause');
        }
console.log('[LOGIN] Pause set up, waiting for user input to continue');
        return;
      }

      // No LOGON screen - immediately trigger the bulletin display flow
console.log('[AUTH] =============================================');
console.log('[AUTH] USERNAME/PASSWORD LOGIN - Showing bulletin flow');
console.log('[AUTH] subState:', session.subState);
console.log('[AUTH] LOGON screen displayed:', logonDisplayed);
console.log('[AUTH] =============================================');
      const { handleCommand } = require('../handlers/command.handler');
      await handleCommand(socket, session, '');
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
        // express.e prefills the previous username for convenience
console.log('User chose to retry login');
        socket.emit('ansi-output', `\r\nUsername: ${safeUsername}`);
        socket.emit('retry-login', { prefillUsername: safeUsername });
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

  // Password reset flow handler - express.e:29152-29213
  socket.on('password-reset-input', async (data: { input: string }) => {
    try {
      const input = (data.input || '').trim().toUpperCase();

      if (session.passwordResetState === 'await_confirm') {
        // express.e:29160-29167 - Handle Y/n confirmation
        if (input === 'Y' || input === 'YES' || input === '') {
          // Generate 10-char alphanumeric reset code - express.e:29168
          const resetCode = crypto.randomBytes(5).toString('hex').toUpperCase();
          session.passwordResetCode = resetCode;

          // Get user email
          const user = await db.getUserByUsername(session.passwordResetUsername || '');
          if (!user?.email) {
            socket.emit('ansi-output', '\r\n\x1b[31mNo email address on file.\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          // Send reset code via email - express.e:29169-29172
          const emailSent = await mailOnPwdFail(user.email, resetCode);
          if (!emailSent) {
            socket.emit('ansi-output', '\r\n\x1b[31mFailed to send reset code. Please contact the sysop.\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          socket.emit('ansi-output', '\r\n\x1b[32mReset code sent to your email address.\x1b[0m\r\n');
          socket.emit('ansi-output', '\r\nEnter reset code: ');
          session.passwordResetState = 'await_code';
        } else {
          // User declined - disconnect
          socket.emit('ansi-output', '\r\n\x1b[31mGoodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
        }
      } else if (session.passwordResetState === 'await_code') {
        // express.e:29173-29188 - Verify reset code
        const enteredCode = input.toUpperCase();
        if (enteredCode === session.passwordResetCode) {
          socket.emit('ansi-output', '\r\n\x1b[32mCode verified!\x1b[0m\r\n');
          socket.emit('ansi-output', '\r\nEnter new password: ');
          session.passwordResetState = 'await_new_password';
          // Tell client to mask input
          socket.emit('mask-input', true);
        } else {
          // express.e:29189-29195 - Wrong code, disconnect
          socket.emit('ansi-output', '\r\n\x1b[31mInvalid reset code.\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
        }
      } else if (session.passwordResetState === 'await_new_password') {
        // express.e:29196-29213 - Set new password
        const newPassword = data.input || ''; // Don't trim - password can have spaces

        if (newPassword.length < 4) {
          socket.emit('ansi-output', '\r\n\x1b[33mPassword must be at least 4 characters.\x1b[0m\r\n');
          socket.emit('ansi-output', 'Enter new password: ');
          return;
        }

        // Update password in database
        const user = await db.getUserByUsername(session.passwordResetUsername || '');
        if (!user) {
          socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }

        try {
          await db.updateUserPassword(user.id, newPassword);
          socket.emit('ansi-output', '\r\n\x1b[32mPassword updated successfully!\x1b[0m\r\n');
          socket.emit('ansi-output', '\r\nPlease login with your new password.\r\n\r\n');

          // Clear reset state
          session.passwordResetCode = undefined;
          session.passwordResetUsername = undefined;
          session.passwordResetState = undefined;
          session.loginRetryCount = 0;

          // Tell client to unmask input and return to login
          socket.emit('mask-input', false);
          socket.emit('retry-login', {});
        } catch (err) {
console.error('[AUTH] Failed to update password:', err);
          socket.emit('ansi-output', '\r\n\x1b[31mFailed to update password. Please try again later.\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
        }
      }
    } catch (error) {
console.error('Password reset error:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'AUTH',
        'Exception in password-reset-input handler',
        { error: (error as Error).message, state: session.passwordResetState },
        DebugSeverity.CRITICAL
      );
      socket.emit('ansi-output', '\r\n\x1b[31mPassword reset error. Goodbye!\x1b[0m\r\n');
      setTimeout(() => socket.disconnect(), 500);
    }
  });
}
