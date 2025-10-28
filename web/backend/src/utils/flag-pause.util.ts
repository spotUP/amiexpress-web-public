/**
 * Flag Pause Utility
 * Port from express.e:28025-28063 flagPause()
 *
 * Handles pagination during file listings with options to:
 * - Continue (Y/Enter)
 * - Stop (N)
 * - Non-stop mode (NS)
 * - Flag files (F filename)
 */

import { Socket } from 'socket.io';
// Session type - using any for now since BBSSession is defined in index.ts
type Session = any;
import { LoggedOnSubState } from '../constants/bbs-states';
import { FileFlagManager } from './file-flag.util';

/**
 * Display pause prompt and handle user response
 * Port from express.e:28025-28063
 *
 * @param socket Socket connection
 * @param session User session
 * @param count Number of lines to add to lineCount
 * @returns Promise<boolean> - true to continue, false to stop
 */
export async function flagPause(
  socket: Socket,
  session: Session,
  count: number = 1
): Promise<boolean> {
  // Increment line count if not in non-stop mode
  // express.e:28029
  if (!session.tempData.nonStopDisplayFlag) {
    session.tempData.lineCount = (session.tempData.lineCount || 0) + count;
  }

  const userLineLen = session.user?.pageLength || 23;

  // Check if we need to pause
  // express.e:28031
  if (!session.tempData.nonStopDisplayFlag &&
      (session.tempData.lineCount || 0) >= userLineLen) {

    session.tempData.lineCount = 0;

    // Display pause prompt
    // express.e:28034
    const prompt = '\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32m(\x1b[33mf\x1b[32m)\x1b[36mlags, More\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m/\x1b[33mns\x1b[32m)\x1b[0m? ';
    socket.emit('ansi-output', prompt);

    // Wait for user input
    return new Promise((resolve) => {
      const inputHandler = async (input: string) => {
        socket.off('line-input', inputHandler);

        const response = input.trim().toUpperCase();

        // Y or Enter - continue
        // express.e:28038
        if (response === '' || response === 'Y') {
          // Clear prompt line
          socket.emit('ansi-output', '\x1b[1A\x1b[K');
          resolve(true);
          return;
        }

        // N - stop
        // express.e:28044
        if (response === 'N') {
          socket.emit('ansi-output', '\r\n');
          resolve(false);
          return;
        }

        // NS - non-stop mode
        // express.e:28045
        if (response === 'NS') {
          session.tempData.nonStopDisplayFlag = true;
          // Clear prompt line
          socket.emit('ansi-output', '\x1b[1A\x1b[K');
          resolve(true);
          return;
        }

        // F [filename] - flag files
        // express.e:28053
        if (response.startsWith('F')) {
          const filename = response.substring(1).trim();

          // Flag the file
          const flagManager = new FileFlagManager();
          if (filename) {
            flagManager.addFlag(session, filename);
            socket.emit('ansi-output', `\r\n\x1b[32mFlagged: ${filename}\x1b[0m\r\n`);
          } else {
            // Prompt for filename
            socket.emit('ansi-output', '\r\nFilename to flag: ');
            const filenameHandler = (filenameInput: string) => {
              socket.off('line-input', filenameHandler);
              if (filenameInput.trim()) {
                flagManager.addFlag(session, filenameInput.trim());
                socket.emit('ansi-output', `\x1b[32mFlagged: ${filenameInput.trim()}\x1b[0m\r\n`);
              }
              // Clear prompt lines
              socket.emit('ansi-output', '\x1b[A\x1b[K');
              resolve(true);
            };
            socket.once('line-input', filenameHandler);
            return;
          }

          // Clear prompt line
          socket.emit('ansi-output', '\x1b[A\x1b[K');
          resolve(true);
          return;
        }

        // Invalid input - show prompt again
        socket.emit('ansi-output', prompt);
        socket.once('line-input', inputHandler);
      };

      socket.once('line-input', inputHandler);
    });
  }

  // No pause needed
  return true;
}

/**
 * Initialize pause state for a session
 */
export function initPauseState(session: Session): void {
  session.tempData.lineCount = 0;
  session.tempData.nonStopDisplayFlag = false;
}

/**
 * Reset line count (for new screen/section)
 */
export function resetLineCount(session: Session): void {
  session.tempData.lineCount = 0;
}

/**
 * Set non-stop mode
 */
export function setNonStopMode(session: Session, enabled: boolean): void {
  session.tempData.nonStopDisplayFlag = enabled;
}
