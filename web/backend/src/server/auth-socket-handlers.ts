/**
 * Authentication Socket Event Handlers
 * Handles login, username check, and new user registration events
 */

import { Socket } from 'socket.io';
import * as crypto from 'crypto';
import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { userFileManager } from '../services/UserFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import {
  getSessionBySocketId,
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
import { mailOnPwdFail, isMailEventEnabled, isSmtpConfigured } from '../services/mail-notification.service';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { sessionLogManager } from '../services/SessionLogManager';
import { getSystemTime } from '../utils/date-time.util';
import { beginLogoff } from './logoff';

/**
 * Check password strength against MIN_PASSWORD_LENGTH and MIN_PASSWORD_STRENGTH tooltypes.
 * express.e:908-933
 *
 * Returns:
 *   true  — password meets all criteria
 *   1     — password too short (fails MIN_PASSWORD_LENGTH)
 *   2     — password lacks enough character classes (fails MIN_PASSWORD_STRENGTH)
 */
function checkPasswordStrength(newPass: string, minLength: number, minStrength: number): true | 1 | 2 {
  // express.e:910-912 — MIN_PASSWORD_LENGTH check
  if (minLength > 0 && newPass.length < minLength) return 1;

  // express.e:915-932 — MIN_PASSWORD_STRENGTH check (how many character classes are present)
  if (minStrength > 0) {
    const cap = Math.min(minStrength, 4);
    let lower = 0, upper = 0, num = 0, sym = 0;
    for (let i = 0; i < newPass.length; i++) {
      const c = newPass.charCodeAt(i);
      if (c >= 48 && c <= 57)       num   = 1;
      else if (c >= 65 && c <= 90)  upper = 1;
      else if (c >= 97 && c <= 122) lower = 1;
      else                          sym   = 1;
    }
    if (lower + upper + num + sym < cap) return 2;
  }

  return true;
}

/**
 * Register authentication socket event handlers
 */
export function registerAuthHandlers(socket: Socket) {
  const initialSession = getSessionBySocketId(socket.id);
  if (!initialSession) return;
  let session: BBSSession = initialSession;

  // installAnsiFilter moved to services/login-post.service.ts so both web
  // and telnet/SSH wrap their emit() identically. Kept the AnsiUtil
  // import for other handlers in this file that strip ANSI for plain
  // displays.

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
    // express.e:29637 — passwordRetries:=3 is the canonical default.
    // Audit A-6 flagged that we returned 5 here; that was the username-
    // retry constant accidentally reused (A-5 split them today, see
    // session.usernameRetryCount).
    return 3;
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

        // WEB_: token-based session restore preserves most session fields
        // but does NOT carry quickFlag forward (express.e:29853-29855
        // sets quickFlag from the ANSI prompt at connect time). On
        // reconnect the user goes through DISPLAY_BULL/etc. like a fresh
        // login, which is the closer match to express.e behavior than
        // re-binding a previous quickFlag. (Audit A-12.)

        // Update socket mappings
        socketToUser.set(socket.id, String(user.id));
        socketToNodeId.set(socket.id, existingSession.nodeId);

        // Multi-tab fanout: every authenticated socket joins user:<id> room.
        // Lets DM/invite handlers io.to('user:'+id).emit() reach all tabs.
        try { socket.join('user:' + String(user.id)); } catch (_) {}

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

        // express.e:29629-29637 — empty username is a USERNAME failure,
        // not a password failure. Counts against the fixed 5-try
        // username budget; password budget is untouched.
        if (safeUsername.length === 0) {
          session.usernameRetryCount = (session.usernameRetryCount || 0) + 1;
          const USERNAME_MAX = 5;
console.log(`Username retry count: ${session.usernameRetryCount}/${USERNAME_MAX} (empty username)`);

          if (session.usernameRetryCount >= USERNAME_MAX) {
console.log('Too many username errors, disconnecting');
            SysopDebugUtil.debug(
              socket,
              session,
              'AUTH',
              'Too many username errors - disconnecting',
              { reason: 'empty username', retries: session.usernameRetryCount, max: USERNAME_MAX },
              DebugSeverity.CRITICAL
            );
            // express.e:29634: plain text — STATE_LOGGING_OFF; RETURN.
            beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
            return;
          }

          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Login attempt with empty username',
            { retries: session.usernameRetryCount, max: USERNAME_MAX },
            DebugSeverity.WARNING
          );
          socket.emit('login-failed', 'Username cannot be empty');
          if (!handleFailure()) return;
          return;
        }

        // express.e:29605-29631 - Check if user exists first, then authenticate.
        // express.e:29598-29602 — when USERNUMBER_LOGIN node tooltype is set
        // AND the input is a positive integer, treat it as a slot number and
        // load that account directly (loadAccount(userNum)) instead of by name.
        const passwordValue = data.password ?? '';
        let existingUser: any = null;
        const userNumMatch = /^\d+$/.exec(safeUsername);
        if (userNumMatch) {
          try {
            const fsSync = require('fs');
            const path = require('path');
            const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../..');
            const nodeIconPath = path.join(bbsRoot, `Node${session.nodeId || 0}.info`);
            let userNumberLogin = false;
            if (fsSync.existsSync(nodeIconPath)) {
              const buf = fsSync.readFileSync(nodeIconPath);
              if (buf.includes(Buffer.from('USERNUMBER_LOGIN'))) userNumberLogin = true;
            }
            if (userNumberLogin) {
              const slotNum = parseInt(safeUsername, 10);
              if (slotNum > 0) {
                // Look up by slot number — most repos expose this via a custom getter.
                if (typeof (db as any).getUserBySlotNumber === 'function') {
                  existingUser = await (db as any).getUserBySlotNumber(slotNum);
                }
              }
            }
          } catch { /* tooltype probe / lookup failed — fall through to name lookup */ }
        }
        if (!existingUser) {
          existingUser = await db.getUserByUsername(safeUsername);
        }

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
              : `\r\nThe name ${safeUsername} is not used on this BBS.\r\n[R]etry your name or [C]ontinue as a new user? `
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
            // express.e:29634: plain text — STATE_LOGGING_OFF; RETURN.
            beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
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

            // No reset available — express.e:29193-29195: runSysCommand('PWFAIL',
            // '') then JUMP logoffErr (writes '\t* Password Failure *' to
            // CallersLog and returns FAILURE). Show banner first.
            socket.emit('ansi-output', '\r\n\x1b[33mExcessive Password Failure\x1b[0m\r\n\r\n');
            try {
              const { runSysCommand } = require('../handlers/command-execution.handler');
              await runSysCommand(socket, session, 'PWFAIL', '');
            } catch (err) {
              console.error('[LOGIN] PWFAIL syscmd failed:', err);
            }
            // express.e:29263-29264 logoffErr.
            callersLogManager.logActivity(session.nodeId || 1, '\t* Password Failure *');
            beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
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
          // express.e:29207-29208 — callersLog('\tPassword Failure (\s)', tempStr).
          // Mask the password attempt as 'xxxx'; express.e shows the real
          // attempt only when the per-node tooltype SHOWPWFAIL is set, which
          // we don't honour yet (intentional — passwords in logs is a foot-gun).
          // AquaPWFail (the PWFAIL syscmd door) reads these lines to render
          // the recent-failures display.
          callersLogManager.logActivity(session.nodeId || 1, '\tPassword Failure (xxxx)');
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

        // express.e:29624 — userNum:=tempUser.slotNumber; deleted accounts have slotNumber=0.
        // A-DEV-10: reject login for deleted/invalid accounts (slotNumber=0).
        if (!user.slotNumber || user.slotNumber === 0) {
          session.loginRetryCount++;
          const maxFails = getMaxPasswordFails();
console.warn(`[LOGIN] User ${safeUsername} has slotNumber=0 (deleted account) — rejecting login`);
          // express.e:29703: 'That account has been deleted.\b\n'
          socket.emit('ansi-output', 'That account has been deleted.\r\n');
          if (maxFails >= 0 && session.loginRetryCount >= maxFails) {
            // express.e:29634: '\b\nToo Many Errors, Goodbye!\b\n' — STATE_LOGGING_OFF.
            beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
            return;
          }
          socket.emit('login-failed', { reason: 'deleted account', retryFrom: 'username' });
          if (!handleFailure()) return;
          return;
        }

        // TODO(unify): the post-auth block that begins here (through
        // ~line 1000+) is mirrored, with drift, in
        // web/backend/src/handlers/command.handler.ts:1700+ for
        // telnet/SSH. Right answer is to extract both into
        // services/login-post.service.ts and have both transports call
        // it as a 3-line wrapper. ~400 lines of careful refactor — not
        // done yet. Until then, keep the two blocks behaviourally in
        // sync (any new step here must also land in command.handler.ts).

        // Reset retry counter on successful login
        session.loginRetryCount = 0;
        ipBanManager.resetFailures(remoteAddress);

        // express.e:28734-28738 / 29129-29135 — Reserved-node bump.
        // Sysop reserves a node via POST /api/nodes/:nodeId/reserve (Audit
        // A-3, services/node-reservation.service). Authenticated users whose
        // username doesn't match the reservation get the express.e:28736
        // message and disconnect. Case-insensitive match (StriCmp at 29131).
        // Both auth paths (token + username/password) converge here so a
        // single check guards both. The reservation itself is cleared on
        // logoff via handleGoodbyeCommand (express.e:8213).
        if (typeof session.nodeId === 'number') {
          const { isReservationMatch } = require('../services/node-reservation.service');
          if (!isReservationMatch(session.nodeId, user.username)) {
            // express.e:28736-28742 — telnetSend + STATE_LOGGING_OFF; RETURN.
            beginLogoff(socket, session, {
              message: '\r\n420 Node is currently reserved for another user.\r\n',
            });
            return;
          }
        }

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

      // JWT-path login-success: u/p path already emitted at the
      // success branch above (line ~564); JWT path emits here so the
      // frontend sees a login-success for both paths before the
      // shared post-auth pipeline runs. Without this, JWT-token-only
      // reconnects would never see the event.
      if (data.token) {
        socket.emit('login-success', {
          user: {
            id: user.id,
            username: user.username,
            realname: user.realname,
            secLevel: user.secLevel,
            expert: user.expert,
            ansi: user.ansi,
          },
        });
      }

      // Shared post-auth pipeline (see services/login-post.service.ts).
      // Same call used by telnet/SSH at command.handler.ts after the
      // line-buffered username/password handler completes.
      const { runPostAuthLogin } = await import('../services/login-post.service');
      const postAuthResult = await runPostAuthLogin(socket, session, user, {
        lastLoginBeforeUpdate,
      });
      if (!postAuthResult.ok) {
        // Pipeline already handled the terminating side-effects
        // (logoff, comment-door, forced-pwd-change prompt, etc.).
        return;
      }
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

      // Empty username check — counts against the username retry
      // budget (5 fixed) per express.e:29629-29637. See A-5 in audit.
      if (safeUsername.length === 0) {
        session.usernameRetryCount = (session.usernameRetryCount || 0) + 1;
        if (session.usernameRetryCount >= 5) {
          SysopDebugUtil.debug(
            socket,
            session,
            'AUTH',
            'Too many login errors in check-username - disconnecting',
            { reason: 'empty username', retries: session.usernameRetryCount },
            DebugSeverity.CRITICAL
          );
          // express.e:29634: plain text — STATE_LOGGING_OFF; RETURN.
          beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
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
            : `\r\nThe name ${safeUsername} is not used on this BBS.\r\n[R]etry your name or [C]ontinue as a new user? `;
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
          // express.e:29634: plain text — STATE_LOGGING_OFF; RETURN.
          beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
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
  // The PWFAIL-on-rejection helper lives in services/login-post.service.ts
  // (`runPwfailAndLogoff`) so telnet/SSH share the same disconnect+log
  // semantics. Locally we just bind socket + session to it.
  const runPwfailAndLogoff = async (message: string): Promise<void> => {
    const { runPwfailAndLogoff: sharedRun } = await import('../services/login-post.service');
    return sharedRun(socket, session, message);
  };

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
            await runPwfailAndLogoff('\r\n\x1b[31mNo email address on file.\x1b[0m\r\n');
            return;
          }

          // Send reset code via email - express.e:29169-29172
          const emailSent = await mailOnPwdFail(user.email, resetCode);
          if (!emailSent) {
            await runPwfailAndLogoff(
              '\r\n\x1b[31mFailed to send reset code. Please contact the sysop.\x1b[0m\r\n',
            );
            return;
          }

          socket.emit('ansi-output', '\r\n\x1b[32mReset code sent to your email address.\x1b[0m\r\n');
          socket.emit('ansi-output', '\r\nEnter reset code: ');
          session.passwordResetState = 'await_code';
        } else {
          // express.e:29193-29195 — user declined reset → PWFAIL + logoffErr.
          await runPwfailAndLogoff('\r\n\x1b[31mGoodbye!\x1b[0m\r\n');
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
          // express.e:29189-29195 — wrong code → PWFAIL + logoffErr.
          await runPwfailAndLogoff('\r\n\x1b[31mInvalid reset code.\x1b[0m\r\n');
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
          beginLogoff(socket, session, { message: '\r\n\x1b[31mUser not found.\x1b[0m\r\n' });
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
          beginLogoff(socket, session, {
            message: '\r\n\x1b[31mFailed to update password. Please try again later.\x1b[0m\r\n',
          });
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
      beginLogoff(socket, session, { message: '\r\n\x1b[31mPassword reset error. Goodbye!\x1b[0m\r\n' });
    }
  });

  // Forced password change flow - express.e:29804-29844
  // Fired by the frontend when the user submits a password in the forced-change dialog.
  // The dialog goes: await_new -> await_confirm -> (success | retry | disconnect)
  socket.on('forced-pwd-change-input', async (data: { input: string }) => {
    try {
      if (!session.forcedPwdChangeState) return; // stale event, ignore

      const newPass = data.input || ''; // do not trim — passwords may have leading/trailing spaces

      if (session.forcedPwdChangeState === 'await_new') {
        // express.e:29807-29808 — getPass2('Enter New Password: ') — check not empty
        if (newPass.length === 0) {
          // Empty entry — increment retry and loop
          session.forcedPwdChangeRetry = (session.forcedPwdChangeRetry ?? 0) + 1;
          if ((session.forcedPwdChangeRetry ?? 0) > 3) {
            // express.e:29840-29844 — exceeded 3 retries, disconnect.
            socket.emit('mask-input', false);
            beginLogoff(socket, session, {
              message: '\r\nYou have not updated your password so you will now be disconnected...\r\n\r\n',
              finalState: BBSState.AWAIT,
              readDelayMs: 1500,
            });
            return;
          }
          socket.emit('ansi-output', 'Enter New Password: ');
          return;
        }

        // express.e:29812 — checkUserPassword: new password must differ from old
        const sameAsOld = await db.verifyPassword(newPass, session.forcedPwdChangePwdHash ?? '');
        if (sameAsOld) {
          socket.emit('ansi-output', '\r\nYour new password must be different from your old password...\r\n\r\n');
          session.forcedPwdChangeRetry = (session.forcedPwdChangeRetry ?? 0) + 1;
          if ((session.forcedPwdChangeRetry ?? 0) > 3) {
            socket.emit('mask-input', false);
            beginLogoff(socket, session, {
              message: 'You have not updated your password so you will now be disconnected...\r\n\r\n',
              finalState: BBSState.AWAIT,
              readDelayMs: 1500,
            });
            return;
          }
          socket.emit('ansi-output', 'Enter New Password: ');
          return;
        }

        // express.e:29815-29825 — checkPasswordStrength
        const minLen      = session.forcedPwdChangeMinLen      ?? 0;
        const minStrength = session.forcedPwdChangeMinStrength ?? 0;
        const strengthResult = checkPasswordStrength(newPass, minLen, minStrength);
        if (strengthResult !== true) {
          if (strengthResult === 1) {
            socket.emit('ansi-output', `\r\nPassword length must be at least ${minLen} chars, try again..\r\n\r\n`);
          } else {
            socket.emit('ansi-output', `\r\nPassword must have at least ${minStrength} of these:\r\n  upper case,lower case, numeric and symbols, try again..\r\n\r\n`);
          }
          session.forcedPwdChangeRetry = (session.forcedPwdChangeRetry ?? 0) + 1;
          if ((session.forcedPwdChangeRetry ?? 0) > 3) {
            socket.emit('mask-input', false);
            beginLogoff(socket, session, {
              message: 'You have not updated your password so you will now be disconnected...\r\n\r\n',
              finalState: BBSState.AWAIT,
              readDelayMs: 1500,
            });
            return;
          }
          socket.emit('ansi-output', 'Enter New Password: ');
          return;
        }

        // First entry passed all checks — ask for confirmation
        session.forcedPwdChangeNewPass = newPass;
        session.forcedPwdChangeState = 'await_confirm';
        socket.emit('ansi-output', 'Reenter New Password: ');

      } else if (session.forcedPwdChangeState === 'await_confirm') {
        // express.e:29809-29834 — compare first and second entries
        const firstPass = session.forcedPwdChangeNewPass ?? '';

        if (newPass !== firstPass) {
          // express.e:29832-29834 — mismatch, loop back to await_new
          socket.emit('ansi-output', '\r\nPasswords do not match, please try again.\r\n\r\n');
          session.forcedPwdChangeRetry = (session.forcedPwdChangeRetry ?? 0) + 1;
          if ((session.forcedPwdChangeRetry ?? 0) > 3) {
            socket.emit('mask-input', false);
            beginLogoff(socket, session, {
              message: 'You have not updated your password so you will now be disconnected...\r\n\r\n',
              finalState: BBSState.AWAIT,
              readDelayMs: 1500,
            });
            return;
          }
          session.forcedPwdChangeState = 'await_new';
          session.forcedPwdChangeNewPass = undefined;
          socket.emit('ansi-output', 'Enter New Password: ');
          return;
        }

        // Passwords match — save
        // express.e:29827-29829 — setNewPassword + pwdLastUpdated + forcePwdReset:=FALSE
        const userId   = session.forcedPwdChangeUserId   ?? '';
        const slotNum  = session.forcedPwdChangeSlot     ?? 0;

        await db.updateUserPassword(userId, firstPass, slotNum);
console.log(`[AUTH] Forced password change completed for user ${session.forcedPwdChangeUsername}`);

        // Clear forced-change state
        session.forcedPwdChangeState        = undefined;
        session.forcedPwdChangeUsername     = undefined;
        session.forcedPwdChangeUserId       = undefined;
        session.forcedPwdChangeSlot         = undefined;
        session.forcedPwdChangeRetry        = undefined;
        session.forcedPwdChangePwdHash      = undefined;
        session.forcedPwdChangeNewPass      = undefined;
        session.forcedPwdChangeMinLen       = undefined;
        session.forcedPwdChangeMinStrength  = undefined;

        // Stop masking input on the frontend
        socket.emit('mask-input', false);

        // Reload the updated user record so the session has the new hash
        const updatedUser = await db.getUserById(userId);
        if (updatedUser && session.user) {
          session.user.passwordHash = updatedUser.passwordHash;
        }

        // Run the post-login steps that were deferred while waiting for the password change.
        const savedUsername = session.forcedPwdChangeUsername ?? '';

        // express.e:9493 — callersLog
        await callersLog(userId, savedUsername, 'Logged on').catch((_e: any) => { /* non-fatal */ });

        // System stats (~SC MCI)
        try {
          const { systemStats } = await import('../services/SystemStatsService');
          await systemStats.incrementCalls(userId as any);
        } catch (_e) { /* non-fatal */ }

        // Webhook (skip sysops)
        const sessionUserObj = session.user as any;
        if (sessionUserObj && sessionUserObj.secLevel < 255) {
          try {
            const { webhookService, WebhookTrigger } = await import('../services/webhook.service');
            await webhookService.sendWebhook(WebhookTrigger.USER_LOGIN, {
              username: savedUsername,
              userId,
              secLevel: sessionUserObj.secLevel,
              calls: (sessionUserObj.calls ?? 0) + 1
            });
          } catch (_e) { /* non-fatal */ }
        }

        // Session preferences (confRJoin, currentConf etc.) normally set between
        // callersLog and the bulletin flow in the regular login handler.
        if (sessionUserObj) {
          session.confRJoin          = sessionUserObj.autoRejoin || 1;
          session.msgBaseRJoin       = 1;
          session.currentConf        = sessionUserObj.autoRejoin || 1;
          session.currentConference  = sessionUserObj.autoRejoin || 1;
          session.conferenceId       = sessionUserObj.autoRejoin || 1;
          session.cmdShortcuts       = false;
          session.inDoorManager      = false;
          session.mouseEventsEnabled = false;
          session.doorInputHandler   = undefined;
          if (session.shortcuts) session.shortcuts.clear();
        }

        // Tell frontend the forced-change is done — loginState -> 'loggedin'
        // so regular terminal key events (pause prompts, bulletin nav, etc.) resume normally.
        socket.emit('forced-pwd-change-complete');

        // Begin bulletin flow (BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU)
        session.subState = LoggedOnSubState.DISPLAY_BULL;
        triggerSamiLogRefresh();

        // GDPR gate
        if (!(session.user as any)?.gdprConsentAt) {
          const { promptGdprBackfill } = require('../handlers/user/gdpr.handler');
          await promptGdprBackfill(socket, session);
          return;
        }

        // Display LOGON screen then drive the bulletin flow.
        let pwdChangeLogonDisplayed = false;
        if (!session.quickFlag) {
          pwdChangeLogonDisplayed = await displayScreen(socket, session, 'LOGON', false);
        }

        const { handleCommand } = require('../handlers/command.handler');
        if (pwdChangeLogonDisplayed) {
          if (!session.paginatedScreen) {
            doPause(socket, session);
          }
          // handleCommand called when the pause resolves (advanceDisplayFlow in command.handler)
        } else {
          await handleCommand(socket, session, '');
        }
      }
    } catch (error) {
console.error('[AUTH] forced-pwd-change-input error:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'AUTH',
        'Exception in forced-pwd-change-input handler',
        { error: (error as Error).message, state: session.forcedPwdChangeState },
        DebugSeverity.CRITICAL
      );
      socket.emit('mask-input', false);
      beginLogoff(socket, session, {
        message: '\r\n\x1b[31mPassword change error. Goodbye!\x1b[0m\r\n',
      });
    }
  });
}
