/**
 * Authentication Socket Event Handlers
 * Handles login, username check, and new user registration events
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { userFileManager } from '../services/UserFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import { getSessionBySocketId } from './session-manager';
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
