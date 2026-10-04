/**
 * Page Sysop Command Handler (O command)
 * express.e:25372-25405 (internalCommandO)
 *
 * Allows users to page the sysop for chat.
 * Matches express.e behavior exactly.
 */

import { isSysopAvailable } from '../../services/sysop-availability';
import { getBoardConfig } from '../../services/bbs-config-file.service';
import { config } from '../../config';
import { emitText } from '../../utils/output.util';
import { Socket } from 'socket.io';
import { BBSSession } from '../../index';
import { handlePageSysop } from '../operator-chat.handler';
import { db } from '../../database';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { handleCommentToSysopCommand } from '../chat/preference-chat-commands.handler';
import { ErrorHandler } from '../../utils/error-handling.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { callersLogManager } from '../../services/CallersLogManager';
import { formatLongDateTime, getSystemTime } from '../../utils/date-time.util';

/**
 * Handle O command - Page Sysop
 *
 * express.e:25372-25404, internalCommandO():
 *
 *     IF pagesAllowed = 0
 *       IF checkSecurity(ACS_COMMENT_TO_SYSOP) = FALSE THEN RETURN NOT_ALLOWED
 *       RETURN commentToSYSOP()
 *     ENDIF
 *     IF pagesAllowed <> -1 THEN pagesAllowed--
 *     IF checkSecurity(ACS_PAGE_SYSOP) = FALSE THEN RETURN NOT_ALLOWED
 *
 * The lines that used to sit here claimed all of that was implemented
 * "(our: cooldown check)". None of it was - this function went straight to
 * handlePageSysop - so a caller whose ACS level allows ZERO pages could page
 * the sysop as often as he liked, and no page budget was ever spent.
 *
 * A correct copy of the gate existed in chat/preference-chat-commands.handler.ts
 * exporting a function of THE SAME NAME; command.handler.ts imports that module
 * on line 96 and this one on line 97, so this one shadowed it and the correct
 * copy never ran. That duplicate is gone.
 *
 * What remains ours is the plumbing after the gate: handlePageSysop is the
 * modern operator-chat pipeline (PageRequest rows, notifications, accept),
 * which is what sysopPaged()/ccom() amount to here.
 * 5. Set ENV_REQ_CHAT (our: OPERATOR_CHAT_WAITING state)
 * 6. Set pagedFlag:=1 (our: create PageRequest)
 * 7. Call sysopPaged() (our: sendPageNotifications)
 * 8. Check sysopAvail and call ccom() (our: wait for accept)
 */
export async function handlePageSysopCommand(
  socket: Socket,
  session: BBSSession,
  io: any
): Promise<void> {
  // express.e:25376 - out of pages: leave a comment instead.
  if (session.pagesAllowed === 0) {
    if (!checkSecurity(session.user, ACSPermission.COMMENT_TO_SYSOP)) {
      ErrorHandler.permissionDenied(socket as any, 'leave comments for sysop', {
        nextState: LoggedOnSubState.DISPLAY_MENU,
      });
      return;
    }
    handleCommentToSysopCommand(socket as any, session);
    return;
  }

  // express.e:25385 - spend one, unless the level is unlimited (-1).
  if (typeof session.pagesAllowed === 'number' && session.pagesAllowed !== -1) {
    session.pagesAllowed -= 1;
  }

  // express.e:25387 - no chat unless validated.
  if (!checkSecurity(session.user, ACSPermission.PAGE_SYSOP)) {
    ErrorHandler.permissionDenied(socket as any, 'page the sysop', {
      nextState: LoggedOnSubState.DISPLAY_MENU,
    });
    return;
  }

  // express.e:25396-25400 - an away sysop is not chatted with, unless the
  // caller's level may override it: say so, and point at C. The port never
  // refused (parity survey, 2026-09-29) - a caller waited on a page to
  // someone the board already knew was not there.
  if (!isSysopAvailable() && !checkSecurity(session.user, ACSPermission.OVERRIDE_CHAT)) {
    const sysopName = getBoardConfig(config.get('dataDir'))?.sysop_name || 'Sysop';
    emitText(socket as any, `\r\nSorry, ${sysopName}, is not around right now\r\n`);
    emitText(socket as any, "You can use 'C' to leave a comment.\r\n\r\n");
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:20343-20345 - ccom() logs the page before anything else:
  //   formatLongDateTime(getSystemTime(),display_time)
  //   StringF(str,'\tOperator Paged at (\s)',display_time)
  // SAmiLog flags the call's page from it.
  callersLogManager.logActivity(
    session.nodeId || 1,
    `\tOperator Paged at (${formatLongDateTime(getSystemTime())})`,
  );

  try {
    // Get operator chat repository
    const operatorChatRepo = db.getOperatorChatRepository();

    // Call main page handler
    const response = await handlePageSysop(socket as any, session, io, operatorChatRepo);

    if (!response.success) {
      // Show error message from handler
      socket.emit('ansi-output', `${response.message}\r\n`);
    }

    // Note: Success messages are already sent by handlePageSysop
  } catch (error) {
console.error('[Page Sysop Command] Error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError paging sysop. Please try again later.\x1b[0m\r\n');
  }
}
