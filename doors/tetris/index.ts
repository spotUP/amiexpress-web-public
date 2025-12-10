/**
 * Tetris Door - Entry Point for BBS runtime
 * The full graphical tracker runs in hybrid mode (WebSocket + browser).
 * For telnet/SSH nodes we display a placeholder message.
 */

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;

  socket.emit('ansi-output', '\r\n\x1b[33mTETRIS is available in hybrid mode with a WebSocket client.\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mConnect via the web UI to play the graphical version.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to return to the menu...\x1b[0m');

  await new Promise<void>((resolve) => {
    const handler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve();
    };
    bbsSession.doorInputHandler = handler;
  });
}
