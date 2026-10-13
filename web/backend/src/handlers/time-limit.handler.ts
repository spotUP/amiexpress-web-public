/**
 * The time limit's end: express.e:556-566 checkTimeUsed.
 *
 * It lives with the handlers, not in utils/time-tracking.util, because it
 * shows a screen and drops the line. When it sat in the util, the util
 * imported screen.handler, and screen.handler reaches the util through
 * mci-dispatch (~TR, ~TL) - a cycle that left screen.handler half-loaded for
 * whoever imported it first.
 */
import { BBSSession } from '../index';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { LoggedOnSubState } from '../constants/bbs-states';
import { displayScreen } from './screen.handler';
import { beginLogoff } from '../server/logoff';
import { AUTOSAVE_FLAGS_BANNER } from '../utils/file-flag.util';

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
      socket.emit('ansi-output', AUTOSAVE_FLAGS_BANNER);
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
