/**
 * Emit a bold red notice to the Sysop terminal when something critical goes wrong.
 * Session may not have a socket on its surface type, so we reach into the
 * socket if present. This keeps notifications consistent and avoids sprinkling
 * raw ANSI strings everywhere.
 *
 * ONLY THE SYSOP'S TERMINAL. The session is whoever's call hit the problem;
 * written to unconditionally, a caller read the board's own trouble (a missing
 * ROM, a missing library) in the middle of their call. The same gate the
 * sysop debug lines use decides (SysopDebugUtil.isSysop).
 */
import { SysopDebugUtil } from './sysop-debug.util';

export function notifySysop(session: any | undefined, message: string): void {
  const socket = session?.socket;
  if (!socket || typeof socket.emit !== "function") {
    return;
  }
  if (!SysopDebugUtil.isSysop(session)) {
    console.error(`[sysop-alert] ${message}`);
    return;
  }

  socket.emit("ansi-output", `\r\n\x1b[31m${message}\x1b[0m\r\n`);
}
