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
import { DEFAULT_PAUSE_LINES } from '../screens/screen-rows';
// Session type - using any for now since BBSSession is defined in index.ts
type Session = any;
import { LoggedOnSubState } from '../constants/bbs-states';
import { flagManagerOf } from './file-flag.util';
import { config } from '../config';
// Every write here goes through the board's ordered output: a pause prompt
// sent straight to the socket overtook the rows still in the 16 ms buffer
// and stood ABOVE the text it was pausing (the logon scan, 2026-09-30).
import { emitPrompt } from './output.util';

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

  const userLineLen = sessionLineLen(session);

  // Check if we need to pause
  // express.e:28031
  if (!session.tempData.nonStopDisplayFlag &&
      (session.tempData.lineCount || 0) >= userLineLen) {

    session.tempData.lineCount = 0;

    // If a pause prompt is already active, wait for it instead of spawning another
    if (session.tempData.flagPausePromise) {
      return session.tempData.flagPausePromise;
    }

    /*
     * The prompt owns its row, and the row it owns is the one to erase.
     *
     * express.e:28034/5193 print this prompt with no leading newline and then
     * read a LINE, so the caller's RETURN puts the cursor at column 0 of the
     * row below and `[1A[K` lands back on the prompt's row and clears it.
     * This port's accumulator submits with `echo: null` (terminal-input.ts) -
     * no RETURN is echoed - so the cursor is still at the END of the prompt,
     * and `[1A`, which preserves the column, erased the tail of the line
     * ABOVE instead. Same fault the sysop reported against the paginated
     * bull6 on 2026-09-14; see handlePaginatedScreenInput.
     */
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
        emitPrompt(socket, prompt);
        registerListener(handleInput);
      };

      const handleInput = async (input: string) => {
        const response = input.trim().toUpperCase();

        if (response === '' || response === 'Y') {
          emitPrompt(socket, '\r\x1b[K');
          session.tempData.flagPausePromise = undefined;
          resolveFn!(true);
          return;
        }

        // Q / N / X / Escape all stop the listing. Q-as-quit isn't in
        // express.e's flagPause prompt, but every modern BBS terminal
        // user (and every other Amiga BBS that ported flagPause) maps
        // Q to "stop scrolling, return to menu". Without this branch,
        // Q fell through to the re-prompt path and the listing got
        // stuck forever — surfaced on live by FR + Q.
        if (response === 'N' || response === 'Q') {
          // lineInput's line break, then express.e:28047's aePuts('\b\n').
          emitPrompt(socket, '\r\n\r\n');
          session.tempData.flagPausePromise = undefined;
          resolveFn!(false);
          return;
        }

        if (response === 'NS') {
          session.tempData.nonStopDisplayFlag = true;
          emitPrompt(socket, '\r\x1b[K');
          session.tempData.flagPausePromise = undefined;
          resolveFn!(true);
          return;
        }

        if (response.startsWith('F')) {
          const filename = response.substring(1).trim();
          const flagManager = await flagManagerOf(session, config.get('dataDir'));

          if (filename) {
            flagManager.addFlag(filename, session.currentConf);
            await flagManager.save();
            emitPrompt(socket, `\r\n\x1b[32mFlagged: ${filename}\x1b[0m\r\n`);
            emitPrompt(socket, '\x1b[A\x1b[K');
            resolveFn!(true);
            return;
          }

          emitPrompt(socket, '\r\nFilename to flag: ');
          registerListener(async (filenameInput: string) => {
            const trimmed = filenameInput.trim();
            if (trimmed) {
              flagManager.addFlag(trimmed, session.currentConf);
              await flagManager.save();
              emitPrompt(socket, `\x1b[32mFlagged: ${trimmed}\x1b[0m\r\n`);
            }
            emitPrompt(socket, '\x1b[A\x1b[K');
            session.tempData.flagPausePromise = undefined;
            resolveFn!(true);
          });
          return;
        }

        // Invalid input: re-prompt without clearing promise
        emitPrompt(socket, '\r\n');
        emitPrompt(socket, prompt);
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
 * Check if pause is needed and display simple pause prompt
 * Port from express.e:5181-5196 checkForPause()
 *
 * Simpler than flagPause() - no file flagging, just continue/stop/nonstop
 * Used during confScan (express.e:27934-27938)
 *
 * @param socket Socket connection
 * @param session User session
 * @returns Promise<boolean> - true to continue, false to stop
 */
export async function checkForPause(
  socket: Socket,
  session: Session
): Promise<boolean> {
  if (!session.tempData) {
    session.tempData = {};
  }

  // Increment line count by 1 (express.e:5190)
  if (!session.tempData.nonStopDisplayFlag) {
    session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;
  }

  const userLineLen = sessionLineLen(session);

  // Check if we need to pause (express.e:5191)
  if (!session.tempData.nonStopDisplayFlag &&
      (session.tempData.lineCount || 0) >= userLineLen) {

    session.tempData.lineCount = 0;

    // If a pause prompt is already active, wait for it
    if (session.tempData.checkPausePromise) {
      return session.tempData.checkPausePromise;
    }

    // Display simpler pause prompt (express.e:5193)
    const prompt = '(Pause)...More(y/n/ns)? ';
    let resolveFn: (val: boolean) => void;
    const pausePromise = new Promise<boolean>((resolve) => {
      resolveFn = resolve;
    });
    session.tempData.checkPausePromise = pausePromise;

    // Wait for user input
    const registerInput = () => {
      const registerListener = (handler: (input: string) => Promise<void> | void) => {
        (session as any).checkPauseHandler = handler;
        (session as any).checkPauseBuffer = '';
      };

      const promptAgain = () => {
        emitPrompt(socket, prompt);
        registerListener(handleInput);
      };

      const handleInput = async (input: string) => {
        const response = input.trim().toUpperCase();

        // Y or Enter = continue (express.e:5196)
        if (response === '' || response === 'Y') {
          emitPrompt(socket, '\r\n');
          session.tempData.checkPausePromise = undefined;
          resolveFn!(true);
          return;
        }

        // N or Q = stop (see flagPause for Q-quit rationale)
        if (response === 'N' || response === 'Q') {
          emitPrompt(socket, '\r\n');
          session.tempData.checkPausePromise = undefined;
          resolveFn!(false);
          return;
        }

        // NS = non-stop mode
        if (response === 'NS') {
          session.tempData.nonStopDisplayFlag = true;
          emitPrompt(socket, '\r\n');
          session.tempData.checkPausePromise = undefined;
          resolveFn!(true);
          return;
        }

        // Invalid input: re-prompt
        emitPrompt(socket, '\r\n');
        emitPrompt(socket, prompt);
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

/**
 * express.e userLineLen (1327, 3659: loggedOnUser.lineLength; 2405-2408: the
 * terminal's reported height, never under 10): the rows a page holds.
 */
export function sessionLineLen(session: Session): number {
  const rawLineLen =
    session.wireHeight ||
    session.screenHeight ||
    session.user?.linesPerScreen ||
    session.user?.lineLength ||
    session.user?.pageLength ||
    DEFAULT_PAUSE_LINES;
  return Math.min(Math.max(rawLineLen, 10), 40);
}
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
 * Set non-stop mode.
 *
 * express has ONE flag, `nonStopDisplayFlag` (express.e:120). The pager tests
 * it - `IF(nonStopDisplayFlag=FALSE) THEN lineCount++` (express.e:5190) - and
 * the door API both sets it and reports it back (BB_NONSTOPTEXT,
 * express.e:3875-3876 and :4037).
 *
 * This port split that in two: `session.tempData.nonStopDisplayFlag` for the
 * pager, `session.nonStopText` for doors, XIM and AREXX. They are one flag in
 * express and they must move together, so this function owns both - which is
 * how `~NS` came to suppress nothing: it set the door-facing half while every
 * pause prompt read the other.
 */
export function setNonStopMode(session: Session, enabled: boolean): void {
  if (!session.tempData) {
    session.tempData = {};
  }
  session.tempData.nonStopDisplayFlag = enabled;
  (session as unknown as { nonStopText?: boolean }).nonStopText = enabled;
}
