/**
 * Emit a bold red notice to the Sysop terminal when something critical goes wrong.
 * Session may not have a socket on its surface type, so we reach into the
 * socket if present. This keeps notifications consistent and avoids sprinkling
 * raw ANSI strings everywhere.
 */
export function notifySysop(session: any | undefined, message: string): void {
  const socket = session?.socket;
  if (!socket || typeof socket.emit !== "function") {
    return;
  }

  socket.emit("ansi-output", `\r\n\x1b[31m${message}\x1b[0m\r\n`);
}
