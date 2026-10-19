/**
 * Authentication Socket Event Handlers
 * Refuses the retired socket `login` event (see below)
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { getSessionBySocketId } from './session-manager';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';

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

  /**
   * THE `login` SOCKET EVENT LOGS NOBODY IN ANY MORE.
   *
   * It had two arms. The username/password arm went in TP-9b: the server
   * prints the name and password prompts itself and reads the answers as
   * ordinary `command` input on every transport (command.handler.ts).
   *
   * The JWT arm went next. A browser holding a saved token was logged in
   * during the name prompt with no password - without the refusal gates the
   * typed login runs, without a state check (it could run the post-login
   * pipeline again on a session that was already logged in, as another
   * user), and with a token that logoff never revoked. A dropped socket is
   * covered by the resume token (server/resume-tokens.ts), which reopens
   * THIS session instead of starting a new login. A fresh login asks for a
   * name and a password, the same as telnet.
   *
   * Any payload is REFUSED rather than ignored, so a stale cached bundle
   * that still posts a token gets an answer and falls back to the prompt.
   */
  socket.on('login', (data: { token?: string; username?: string } | undefined) => {
    SysopDebugUtil.debug(
      socket,
      session,
      'AUTH',
      'socket login refused - the board logs in through its own name and password prompt',
      { hasToken: !!data?.token, hasUsername: !!data?.username },
      DebugSeverity.WARNING
    );
    socket.emit('login-failed', 'Token login is retired');
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
