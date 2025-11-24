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
  if (!session.tempData) {
    session.tempData = {};
  }

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

    // If a pause prompt is already active, wait for it instead of spawning another
    if (session.tempData.flagPausePromise) {
      return session.tempData.flagPausePromise;
    }

    // Display pause prompt
    // express.e:28034
    const prompt = '\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32m(\x1b[33mf\x1b[32m)\x1b[36mlags, More\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m/\x1b[33mns\x1b[32m)\x1b[0m? ';
    let resolveFn: (val: boolean) => void;
    const pausePromise = new Promise<boolean>((resolve) => {
      resolveFn = resolve;
    });
    // Store promise immediately to avoid double prompt if flagPause is re-entered before setup finishes
    session.tempData.flagPausePromise = pausePromise;

    // Wait for user input
    const registerInput = () => {
      const registerListener = (handler: (input: string) => Promise<void> | void) => {
        // We rely on normal command handling; store handler on session so callers can
        // manually invoke it if they intercept input.
        (session as any).flagPauseHandler = handler;
        (session as any).flagPauseBuffer = '';
      };

      const promptAgain = () => {
        socket.emit('ansi-output', prompt);
        registerListener(handleInput);
      };

      const handleInput = async (input: string) => {
        const response = input.trim().toUpperCase();

        if (response === '' || response === 'Y') {
          socket.emit('ansi-output', '\x1b[1A\x1b[K');
          session.tempData.flagPausePromise = undefined;
          resolveFn!(true);
          return;
        }

        if (response === 'N') {
          socket.emit('ansi-output', '\r\n');
          session.tempData.flagPausePromise = undefined;
          resolveFn!(false);
          return;
        }

        if (response === 'NS') {
          session.tempData.nonStopDisplayFlag = true;
          socket.emit('ansi-output', '\x1b[1A\x1b[K');
          session.tempData.flagPausePromise = undefined;
          resolveFn!(true);
          return;
        }

        if (response.startsWith('F')) {
          const filename = response.substring(1).trim();
          const flagManager = session.flagManager || new FileFlagManager('', 0, session.nodeId || 0);
          session.flagManager = flagManager;

          if (filename) {
            flagManager.addFlag(filename, session.currentConf);
            await flagManager.save();
            socket.emit('ansi-output', `\r\n\x1b[32mFlagged: ${filename}\x1b[0m\r\n`);
            socket.emit('ansi-output', '\x1b[A\x1b[K');
            resolve(true);
            return;
          }

          socket.emit('ansi-output', '\r\nFilename to flag: ');
          registerListener(async (filenameInput: string) => {
            const trimmed = filenameInput.trim();
            if (trimmed) {
              flagManager.addFlag(trimmed, session.currentConf);
              await flagManager.save();
              socket.emit('ansi-output', `\x1b[32mFlagged: ${trimmed}\x1b[0m\r\n`);
            }
            socket.emit('ansi-output', '\x1b[A\x1b[K');
            session.tempData.flagPausePromise = undefined;
            resolveFn!(true);
          });
          return;
        }

        // Invalid input: re-prompt without clearing promise
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', prompt);
        registerListener(handleInput);
      };

      promptAgain();
    };

    registerInput();
    return pausePromise;
  }

  // No pause needed
  return true;
}

/**
 * Initialize pause state for a session
 */
export function initPauseState(session: Session): void {
  if (!session.tempData) {
    session.tempData = {};
  }
  session.tempData.lineCount = 0;
  session.tempData.nonStopDisplayFlag = false;
}

/**
 * Reset line count (for new screen/section)
 */
export function resetLineCount(session: Session): void {
  if (!session.tempData) {
    session.tempData = {};
  }
  session.tempData.lineCount = 0;
}

/**
 * Set non-stop mode
 */
export function setNonStopMode(session: Session, enabled: boolean): void {
  if (!session.tempData) {
    session.tempData = {};
  }
  session.tempData.nonStopDisplayFlag = enabled;
}
