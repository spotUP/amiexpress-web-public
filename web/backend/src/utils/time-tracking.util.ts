/**
 * Time Tracking Utilities
 * Based on express.e:525-554 (updateTimeUsed, checkTimeUsed)
 *
 * Handles session time tracking and daily time limit enforcement
 */

import { BBSSession } from '../index';
import { checkSecurity } from './acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { LoggedOnSubState } from '../constants/bbs-states';
import { displayScreen } from '../handlers/screen.handler';

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

    // express.e:7684 defaults timeLimit to 3600 (seconds = 60 minutes).
    // Guard against 0 or negative values from DB (imported users, missing fields).
    if (!session.user.timeLimit || session.user.timeLimit <= 0) {
      session.user.timeLimit = 3600; // 1 hour default per express.e:7684
    }

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
 * Express.e logic (line 557):
 *   IF (timeLimit<0) AND (state<>STATE_LOGOFF) AND (checkSecurity(ACS_OVERRIDE_TIMELIMIT)=FALSE)
 *     IF displayScreen(SCREEN_LOGON24)=FALSE
 *       aePuts('You have exceeded your time limit\b\n')
 *       aePuts('Goodbye\b\n\b\n')
 *       aePuts('Disconnecting..\b\n')
 *     ENDIF
 *     state:=STATE_LOGOFF
 *
 * @param socket Socket for user session
 * @param session BBSSession object
 * @returns true if time exceeded and user should be logged off, false otherwise
 */
export async function checkTimeUsed(socket: any, session: BBSSession): Promise<boolean> {
  if (!session.user) return false;

  const timeLimit = session.user.timeTotal - session.user.timeUsed;

  // express.e:557 - Check if time exceeded
  if (timeLimit < 0) {
    // express.e:557 - Skip if already logging off
    if (session.subState === LoggedOnSubState.LOGOFF) {
      return false;
    }

    // express.e:557 - Check ACS_OVERRIDE_TIMELIMIT permission
    // Sysops (level 255) and users with this permission are exempt from time limits
    if (checkSecurity(session.user, ACSPermission.OVERRIDE_TIMELIMIT)) {
      return false; // User has override - no time limit enforcement
    }

    // express.e:558-561 - Display SCREEN_LOGON24 or fallback message
    // Screen is optional -- suppress "Screen not found" sysop notification
    const screenDisplayed = await displayScreen(socket, session, 'LOGON24', true);
    if (!screenDisplayed) {
      socket.emit('ansi-output', '\r\nYou have exceeded your time limit\r\n');
      socket.emit('ansi-output', 'Goodbye\r\n\r\n');
      socket.emit('ansi-output', 'Disconnecting..\r\n');
    }

    // express.e:563 - Set state to logging off
    session.subState = LoggedOnSubState.LOGOFF;

    return true;
  }

  return false;
}

/**
 * Calculate time remaining in minutes for display.
 * Based on express.e:28417,28419 - Div((loggedOnUser.timeTotal-loggedOnUser.timeUsed),60)
 *
 * Users with ACS_OVERRIDE_TIMELIMIT (sysops) see 9999 for unlimited time.
 *
 * @param session BBSSession object
 * @returns Time remaining in minutes (9999 for unlimited)
 */
export function getTimeRemainingMinutes(session: BBSSession): number {
  if (!session.user) return 60; // Default fallback

  // express.e:557 - Users with OVERRIDE_TIMELIMIT have unlimited time
  if (checkSecurity(session.user, ACSPermission.OVERRIDE_TIMELIMIT)) {
    return 9999; // Display as unlimited
  }

  const timeRemaining = session.user.timeTotal - session.user.timeUsed;
  // Ensure we never return negative time remaining
  return Math.max(0, Math.floor(timeRemaining / 60)); // Convert seconds to minutes
}
