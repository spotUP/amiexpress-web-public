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
import { getBoardConfig } from '../services/bbs-config-file.service';
import { config as appConfig } from '../config';
import { installPetsciiModelChoke, disposePetsciiSessionModel } from '../utils/petscii-session-model';
import { reportPresence } from '../achievements/sites';

/**
 * Register authentication socket event handlers
 */
export function registerAuthHandlers(socket: Socket) {
  const initialSession = getSessionBySocketId(socket.id);
  if (!initialSession) return;
  let session: BBSSession = initialSession;

  // ANSI colour off (M) is filtered at each transport's innermost output
  // choke (AnsiUtil.forCaller: connection-emitter.ts for telnet/SSH,
  // socket-handlers.ts for the web socket), not by a wrapper installed here.

  const getMaxPasswordFails = () => {
    try {
      const sys = getBoardConfig(appConfig.get('dataDir'));
      if (typeof sys?.max_password_fails === 'number') {
        return sys.max_password_fails;
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
  socket.on('restore-session', async (sessionData: { token?: string; userId?: string; username?: string; nodeId?: number; savedAt?: number }) => {
    try {
console.log('[Session Restore] Attempting to restore session for user:', sessionData?.username);

      /*
       * WHO the browser is comes from its token, never from the ids it sends.
       * This took `userId` on the client's word, so any socket - a visitor at
       * the login prompt - could name a caller whose socket had just dropped
       * (or a telnet caller, whose socket is never in this namespace) and be
       * handed that caller's live session (open-surface audit, 2026-10-04).
       * The token is the one login-success gave this tab.
       */
      let verified: { userId: string } | null = null;
      if (typeof sessionData?.token === 'string' && sessionData.token) {
        try {
          verified = await db.verifyAccessToken(sessionData.token);
        } catch {
          verified = null;
        }
      }
      if (!verified?.userId) {
console.log('[Session Restore] No valid token - refusing restore');
        socket.emit('session-restore-failed', 'Invalid session data');
        return;
      }
      sessionData.userId = String(verified.userId);

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

        // A GUARANTEED no-op, kept as the invariant's marker rather than as
        // a working install (OC-3 review, I1). This handler can only run on a
        // socket that already went through `registerSocketHandlers`, which
        // installs the choke at `server/socket-handlers.ts:197` and only then
        // registers these auth handlers (`:273`); the marker is on the SOCKET,
        // so this second call returns immediately. It stays because it is the
        // one line that says a restored session must never reach an unwrapped
        // socket, and because its POSITION is load-bearing - ahead of
        // getModemEmulator(socket).install() below, which replaces socket.emit
        // with a wrapper the choke has to sit under. Should a future path ever
        // restore a session onto a socket that skipped registration, this is
        // what keeps that session's model fed.
        installPetsciiModelChoke(socket, () => getSessionBySocketId(socket.id));

        // The browser rebuilt its canvas and its own transducer from scratch
        // (BBSTerminal.tsx clearPetsciiSession/ensurePetsciiSession), so a
        // model still describing the pre-disconnect screen would encode the
        // first post-reconnect `.seq` value against a screen nobody has.
        // DISPOSE, not reset: a `~SP`-paused `.seq` parks its remaining
        // segments on `session.screenSegments` TOGETHER with a `petsciiCtx`
        // holding this very machine (`handlers/screen.handler.ts`). Homing the
        // machine while those segments stay parked would resume the pause
        // against a cursor the segments were never encoded for. Disposal drops
        // both; the model is recreated on next use.
        disposePetsciiSessionModel(existingSession);

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

        // Tell the browser the speed: above 0 it stands aside for the server pacer
        // Also track in session so doors can query it via bbs.getModemSpeed()
        console.log(`[SESSION RESTORE] Emitting modem-speed event with userBaud=${userBaud}`);
        (session as any).modemSpeed = userBaud;
        socket.emit('modem-speed', userBaud);
        console.log(`[SESSION RESTORE] modem-speed event emitted`);

        // Disable AnsiBuffer batching when modem emulation is enabled
        const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
        const ansiBuffer = getAnsiBuffer(socket);
        ansiBuffer.setFlushDelay(userBaud > 0 ? 0 : 16);

        // The door the browser was in, if it is still running.
        //
        // A phone that locks its screen drops the socket, and the session
        // survives the 3 s grace period with its door intact - but the
        // browser clears the door it thought was up the moment it reconnects
        // (BBSTerminal, 'socket connected'), and door:load-client never comes
        // again because the bundle is already loaded. Without this the player
        // is left on the generic BBS keyboard, with no pad and no gestures,
        // for the rest of the door. Re-announcing the id costs no bundle
        // fetch and no second client instance.
        if ((existingSession as any).clientDoorActive && (existingSession as any).clientDoorId) {
          socket.emit('door:active-client', {
            doorId: (existingSession as any).clientDoorId,
          });
        }

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
      } else {
        /**
         * THE USERNAME/PASSWORD ARM IS GONE (TP-9b).
         *
         * It was the second half of a login state machine the server already
         * had: the browser ran a line editor, collected a name and a
         * password, and posted them here, while telnet and SSH walked the
         * loop in command.handler.ts. TP-9a made that loop serve every
         * transport, so a browser now sends keystrokes as ordinary `command`
         * input like every other prompt on the board, and nothing emits this
         * arm any more.
         *
         * The TOKEN arm above stays: a saved JWT reconnecting is not a prompt
         * at all.
         *
         * A client that still posts credentials is REFUSED rather than
         * quietly authenticated - two ways to log in is the thing this task
         * removes, and a stale cached bundle must not keep one alive.
         */
        SysopDebugUtil.debug(
          socket,
          session,
          'AUTH',
          'login without a token - the credential arm was retired in TP-9b',
          { hasToken: !!data.token, hasUsername: !!data.username },
          DebugSeverity.WARNING
        );
        socket.emit('login-failed', 'Missing credentials');
        return;
      }

      // Preserve previous last login for conference scan (New Since Date)
      const lastLoginBeforeUpdate = user.lastLogin ? new Date(user.lastLogin) : new Date(0);

      // `login-success` is emitted by the shared pipeline below, for EVERY
      // web login (TP-9b). It used to be emitted twice - once in the
      // credential arm with a freshly minted token, once here for the token
      // path without one - and the browser's handler saves session state and
      // asks for the font preference each time it arrives.

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

  /**
   * FOUR HANDLERS RETIRED HERE (TP-9b): `check-username`,
   * `new-user-response`, `password-reset-input` and `forced-pwd-change-input`.
   *
   * Every one of them was the browser's login line editor reporting a
   * finished line, and every one had a server-side twin. The server prints
   * those prompts itself and reads the answers as ordinary `command` input
   * now, on every transport: the username and password loop in
   * command.handler.ts (TP-9a), the new-user question in the same loop, and
   * the password reset and forced change through the login-prompt adapters,
   * which no longer step aside for web.
   *
   * `startNewUserRegistration` had exactly ONE caller in the whole backend
   * and it was `new-user-response` - which is why a telnet or SSH caller who
   * typed an unknown name could never create an account. It has a caller on
   * every transport now.
   */
}
