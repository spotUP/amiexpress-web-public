/**
 * SCREEN Command Door
 *
 * Displays any screen file from the Screens/ directory
 * Usage: /SCREEN <filename>
 *
 * Examples:
 *   /SCREEN PETSCII_TEST
 *   /SCREEN WELCOME
 *   /SCREEN MENU
 */

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession: session, params } = doorSession;

  // Get screen name from params
  const screenName = params && params.length > 0 ? params[0] : null;

  if (!screenName) {
    socket.emit('ansi-output', '\r\n\x1b[0;33mUsage: /SCREEN <filename>\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[0;37mExample: /SCREEN PETSCII_TEST\x1b[0m\r\n\r\n');
    return;
  }

  // Display the screen using the screen handler
  const { displayScreen } = require('../../handlers/screen.handler');

  const success = await displayScreen(socket, session, screenName);

  if (!success) {
    socket.emit('ansi-output', `\r\n\x1b[0;31mScreen not found: ${screenName}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[0;37mCheck Screens/ directory for available screens.\x1b[0m\r\n\r\n');
  } else {
    // Position cursor at bottom of screen (row 24) and show prompt
    // This prevents scrolling the PETSCII content off screen
    socket.emit('ansi-output', '\x1b[24;1H\x1b[0;33mPress any key to continue...\x1b[0m');

    // Wait for user input by setting up doorInputHandler
    // This is the proper pattern for TypeScript doors
    await new Promise<void>((resolve) => {
      session.doorInputHandler = (data: string) => {
        // Any keypress exits
        delete session.doorInputHandler;
        resolve();
      };
    });
  }
}
