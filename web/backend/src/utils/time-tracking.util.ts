/**
 * Time Tracking Utilities
 * Based on express.e:525-554 (updateTimeUsed, checkTimeUsed)
 *
 * Handles session time tracking and daily time limit enforcement
 */

import { BBSSession } from '../index';

/**
 * Update time used in session based on elapsed time since last update.
 * Based on express.e:525-554 (PROC updateTimeUsed)
 *
 * Express.e logic:
 * - Gets current time
 * - Checks if new day (resets timeUsed to 0, sets timeTotal to timeLimit)
 * - Updates timeUsed += (currTime - lastTimeUpdate)
 * - Updates lastTimeUpdate = currTime
 *
 * @param socket Socket for user session
 * @param session BBSSession object
 */
export function updateTimeUsed(socket: any, session: BBSSession): void {
  if (!session.user) return;

  const currTime = Math.floor(Date.now() / 1000); // Current time in seconds (Unix timestamp)

  // Initialize logonTime and lastTimeUpdate on first call
  if (!session.logonTime) {
    session.logonTime = currTime;
    session.lastTimeUpdate = currTime;

    // Initialize timeTotal from timeLimit (express.e:534)
    // Both are in seconds (not minutes) - express.e:5345,7684 confirms this
    if (session.user.timeTotal === 0 || session.user.timeTotal < session.user.timeUsed) {
      session.user.timeTotal = session.user.timeLimit;
    }
  }

  // Check if new day (express.e:531-542)
  // Amiga uses "day since epoch minus 6 hours" to handle timezone
  // For simplicity, we check if calendar day changed
  const logonDay = new Date(session.logonTime * 1000).toDateString();
  const currDay = new Date(currTime * 1000).toDateString();

  if (logonDay !== currDay) {
    // New day - reset time used (express.e:534-541)
    // timeTotal := timeLimit (both in seconds)
    session.user.timeTotal = session.user.timeLimit;
    session.user.timeUsed = 0;
    session.logonTime = currTime;
    session.lastTimeUpdate = currTime;
  }

  // Update time used based on elapsed time (express.e:543-553)
  const elapsed = currTime - (session.lastTimeUpdate || currTime);
  if (elapsed > 0) {
    // Only update if not in chat (chatFlag=0 in express.e:544)
    // For now, always update - chat time tracking can be added later
    session.user.timeUsed += elapsed;
    session.lastTimeUpdate = currTime;
  }
}

/**
 * Check if user has exceeded time limit and force logoff if needed.
 * Based on express.e:556-566 (PROC checkTimeUsed)
 *
 * Express.e logic:
 * - If timeLimit < 0 and no override access, show SCREEN_LOGON24 and logoff
 *
 * @param socket Socket for user session
 * @param session BBSSession object
 * @returns true if time exceeded, false otherwise
 */
export function checkTimeUsed(socket: any, session: BBSSession): boolean {
  if (!session.user) return false;

  const timeLimit = session.user.timeTotal - session.user.timeUsed;

  if (timeLimit < 0) {
    // TODO: Check ACS_OVERRIDE_TIMELIMIT security flag (express.e:557)
    // TODO: Display SCREEN_LOGON24 or fallback message (express.e:558-560)

    // For now, just emit a message and return true
    socket.emit('ansi-output', '\r\nYou have exceeded your time limit\r\n');
    socket.emit('ansi-output', 'Goodbye\r\n\r\n');

    return true;
  }

  return false;
}

/**
 * Calculate time remaining in minutes for display.
 * Based on express.e:28417,28419 - Div((loggedOnUser.timeTotal-loggedOnUser.timeUsed),60)
 *
 * @param session BBSSession object
 * @returns Time remaining in minutes
 */
export function getTimeRemainingMinutes(session: BBSSession): number {
  if (!session.user) return 60; // Default fallback

  const timeRemaining = session.user.timeTotal - session.user.timeUsed;
  return Math.floor(timeRemaining / 60); // Convert seconds to minutes
}
