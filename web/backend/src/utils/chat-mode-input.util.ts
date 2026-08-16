/**
 * Chat-mode keystroke routing (task 18, review round 3).
 *
 * Extracted from socket-handlers.ts's main per-character input dispatch so
 * this logic is directly unit-testable without booting the whole server
 * (socket-handlers.ts pulls in the full BBS/session-manager stack — see
 * the same rationale in door-chain-menu-leak.test.ts / door.handler.ts's
 * grep-style tests).
 *
 * Consolidating the F1-exit check and the buffer/echo/flush-on-Enter
 * routing into ONE function also closes the round-3 review finding: the
 * F1 branch used to `return` before ever reaching the (separate) buffering
 * branch, so a mid-line F1 press skipped whatever inputBuffer cleanup that
 * branch would have done. There is now only one exit for "handled a
 * keystroke while inChat" — session.inputBuffer is cleared by
 * enterChatMode()/exitChat() themselves (chat.handler.ts), not by this
 * routing function, so entry and exit are both covered from a single spot
 * regardless of which key ends the chat.
 */
import type { BBSSession } from '../index';
import { exitChat, sendChatMessage } from '../handlers/chat/chat.handler';

/**
 * Route a single raw keystroke while `session.inChat` is true.
 *
 * Returns `true` when the byte was consumed as chat input/control — the
 * caller MUST `return` immediately, not fall through to normal BBS command
 * routing. Returns `false` when the session isn't in chat mode at all (the
 * caller should route `data` normally).
 */
export function handleChatModeInput(socket: any, session: BBSSession, data: string): boolean {
  if (!session.inChat) return false;

  // F1 exits chat mode (like the sysop's local F1 in classic AmiExpress).
  if (data === '\x1b[OP') {
    exitChat(socket, session);
    return true;
  }

  if (data === '\r' || data === '\n') {
    const message = session.inputBuffer || '';
    session.inputBuffer = '';
    socket.emit('ansi-output', '\r\n');
    if (message.length > 0) {
      sendChatMessage(socket, session, message);
    }
    return true;
  }

  if (data === '\x7f' || data === '\b') {
    if (session.inputBuffer.length > 0) {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
      socket.emit('ansi-output', '\b \b');
    }
    return true;
  }

  // Printable characters only — ignore other escape sequences/control
  // bytes (e.g. arrow keys) rather than buffering them into the message.
  if (data.length === 1 && data >= ' ' && data <= '~') {
    session.inputBuffer += data;
    socket.emit('ansi-output', data);
  }
  return true;
}
