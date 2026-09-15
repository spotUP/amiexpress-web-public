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
import { beginLogoff } from '../server/logoff';

/**
 * What an unset daily time limit resolves to, in seconds.
 *
 * One hour. NOT because express.e says so for a user record - it does not -
 * but because it is what this board has effectively been giving every timed
 * caller for as long as the -1 has been in the data, and a fix that silently
 * changed how long people can stay online would be a different change from
 * the one asked for.
 *
 * A caller whose ACCESS LEVEL grants ACS.OVERRIDE_TIMELIMIT never reaches
 * this: express.e:557 checks the permission, not the number.
 */
export const DEFAULT_DAILY_TIME_LIMIT_SECONDS = 3600;

/**
 * Which AmiExpress day a moment belongs to (express.e:529).
 *
 *     currDay := Div(currTime-21600,86400)
 *
 * A day turns at 06:00 UTC. That 21600 is not decoration: a board's "daily"
 * limits are meant to reset while the board is QUIET, not at midnight when
 * somebody is mid-download. We compared `toDateString()` values instead,
 * which rolls at the SERVER's local midnight - a different instant, and one
 * that moves when the host's timezone does.
 */
export function amiExpressDay(unixSeconds: number): number {
  return Math.floor((unixSeconds - 21600) / 86400);
}

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

    /*
     * A STORED LIMIT OF ZERO OR LESS MEANS "NOBODY SET ONE".
     *
     * The citation this used to carry was wrong, and worth correcting rather
     * than deleting: express.e:7660/7684/7740 set the GLOBAL `timeLimit` to
     * 3600 when the sysop logs on at the LOCAL CONSOLE. They are not a
     * default for a stored user record, and express.e has no coercion of this
     * kind anywhere - a user's timeLimit is whatever the user file and the
     * preset put there.
     *
     * We need one anyway, because this board's data has no other answer:
     * every account carries -1, a sentinel from the old "negative means
     * unlimited" convention that nothing honours any more (see the Time limit
     * column in UsersPage.tsx, where it was removed). Left to arithmetic, -1
     * reads as a limit already spent.
     *
     * So the rule is named rather than a literal buried in a branch, and the
     * migration in database.ts writes the same number into the rows - so what
     * a sysop reads in the admin is what the board actually uses.
     */
    if (!session.user.timeLimit || session.user.timeLimit <= 0) {
      session.user.timeLimit = DEFAULT_DAILY_TIME_LIMIT_SECONDS;
    }

    // Initialize timeTotal from timeLimit (express.e:534)
    // Both are in seconds (not minutes) - express.e:5345,7684 confirms this
    if (session.user.timeTotal === 0 || session.user.timeTotal < session.user.timeUsed) {
      session.user.timeTotal = session.user.timeLimit;
    }
  }

  // Check if new day (express.e:531-542), by express.e's OWN day number
  // rather than the server's local calendar - see amiExpressDay().
  const currDay = amiExpressDay(currTime);
  if (session.lastAccountingDay === undefined) {
    session.lastAccountingDay = amiExpressDay(session.logonTime);
  }

  if (session.lastAccountingDay !== currDay) {
    // New day - give the allowances back (express.e:534-541)
    // timeTotal := timeLimit (both in seconds)
    session.user.timeTotal = session.user.timeLimit;
    session.user.timeUsed = 0;
    // express.e:537 gives the chat allowance back with the time allowance.
    // This board counts chatUsed UP where express.e counts chatRemain DOWN,
    // so `chatRemain := chatLimit` is `chatUsed := 0` here. Without it the
    // allowance below could only ever run out.
    session.user.chatUsed = 0;
    /*
     * AND THE DOWNLOAD ALLOWANCE (express.e:535, `dailyBytesDld:=0`).
     *
     * Nothing in this codebase reset it. The only assignments to zero are in
     * the user.data serialisers, which hardcode it on every write - so the
     * counter only ever grew, and `file-status.handler.ts:154` computes
     * `bytesAvail = todaysBytesLimit - dailyBytesDld`. A caller who reached
     * their daily download limit was blocked by it FOR EVER, with no way
     * back short of a sysop editing the account.
     */
    session.user.dailyBytesDld = 0;
    session.lastAccountingDay = currDay;
    /*
     * `logonTime` STAYS PUT, where express.e:540 moves it to the day start.
     * Ours is read by two other things as the real moment this caller logged
     * on - mci-dispatch.ts:261 renders it to them, clean-playpen.util.ts:44
     * attributes playpen files by it - and a logon time of 06:00 would
     * misreport the first and make the second claim files that are not his.
     * The day itself is tracked above instead.
     */
    session.lastTimeUpdate = currTime;
  }

  // Update time used based on elapsed time (express.e:543-553)
  const elapsed = currTime - (session.lastTimeUpdate || currTime);
  if (elapsed > 0) {
    /*
     * CHAT IS NOT THE CALLER'S TIME (express.e:543-553).
     *
     * `chatFlag=0` means "not in chat", and only then does express.e bill
     * timeUsed. In chat it spends the CHAT allowance instead, and only for a
     * user who has one (`chatLimit>0`) - a user with no allowance is charged
     * nothing at all rather than falling back to his session time.
     *
     * `session.inChat` is this board's chatFlag (index.ts:575, the flag
     * terminal-input.ts:246 routes keystrokes on). This used to bill the
     * caller regardless, with "chat time tracking can be added later" in
     * place of the ELSE branch, so a caller the sysop kept talking to paid
     * for the sysop's conversation and a long chat could log him off.
     */
    if (!session.inChat) {
      session.user.timeUsed += elapsed;
    } else if (session.user.chatLimit > 0) {
      session.user.chatUsed += elapsed;
    }
    // Advanced in every branch, exactly as express.e:552 does it outside the
    // IF - otherwise the chat's seconds are still owed and get billed to the
    // caller the moment he leaves it.
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

    // express.e:565-566 saveFlagged() + saveHistory() — persist the caller's
    // flagged-file list and command history BEFORE the line drops. The normal
    // Goodbye path (system-commands.handler.ts:85-93,129-133) does the same and
    // notes that leaving it to disconnect-time cleanup loses history to a race.
    // A timed-out caller must not lose either.
    try {
      session.flagManager?.save();
    } catch {
      // Non-fatal; never block the logoff on a persistence hiccup.
    }
    if (session.user.id) {
      try {
        const { saveHistory } = require('../utils/command-history.util');
        await saveHistory(session, session.user.id);
      } catch {
        // Non-fatal.
      }
    }

    // express.e:563 modemOffHook() — DROP THE CARRIER. The port previously
    // stopped at the subState above, but no dispatcher in this codebase turns
    // subState=LOGOFF into a disconnect, so the line stayed open forever after
    // the LOGON24 screen (telnet callers hung). beginLogoff() is the canonical
    // teardown (server/logoff.ts): it sets session.state=LOGGING_OFF and
    // force-closes the transport (telnet emitter's disconnect/end/destroy all
    // call connection.close()). The read delay lets the LOGON24 screen render
    // before the drop, matching the ~2s window the normal Goodbye path uses.
    beginLogoff(socket, session, { readDelayMs: 2000 });

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
