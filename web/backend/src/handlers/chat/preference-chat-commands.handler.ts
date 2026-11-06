/**
 * Preference & Chat Commands Handler
 *
 * Implements user preference toggles and chat/communication commands as 1:1 ports from express.e:
 * - M (ANSI Mode Toggle) - Toggle ANSI color on/off - express.e:25239-25248
 * - X (Expert Mode Toggle) - Toggle expert mode on/off - express.e:26113-26122
 * - C (Comment to Sysop) - Leave comment for sysop - express.e:24658-24670
 * - O (Page Sysop) - Request chat with sysop - express.e:25372-25404
 * - OLM (Online Message) - Send node-to-node message - express.e:25406-25470
 */

import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity, setEnvStat } from '../../utils/acs.util';
import { EnvStat } from '../../constants/env-codes';
import { AnsiUtil } from '../../utils/ansi.util';
import { emitText } from '../../utils/output.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { changeAccount } from '../../services/account.service';
import { displayMainMenu } from '../command-handler/menu';

import type { BBSSession } from '../../index';
import type { Database } from '../../database';

// Dependencies injected from index.ts
let _startSysopPage: (socket: any, session: BBSSession) => void;
let _db: Database | undefined;

/**
 * Set dependencies for preference/chat commands (called from index.ts)
 */
export function setPreferenceChatCommandsDependencies(deps: {
  startSysopPage: typeof _startSysopPage;
  db?: Database;
}) {
  _startSysopPage = deps.startSysopPage;
  if (deps.db) _db = deps.db;
}

/**
 * M Command - ANSI Mode Toggle
 *
 * From express.e:25239-25248:
 * PROC internalCommandM()
 *   IF(ansiColour)
 *     ansiColour:=FALSE
 *     aePuts('\b\nAnsi Color Off\b\n')
 *   ELSE
 *     ansiColour:=TRUE
 *     aePuts('\b\nAnsi Color On\b\n')
 *   ENDIF
 * ENDPROC RESULT_SUCCESS
 *
 * Toggles ANSI color output for the current session.
 */
export function handleAnsiModeCommand(socket: any, session: BBSSession): void {
  // express.e:25241-25246 flips ONE global, `ansiColour`, for the rest of this
  // call: it is not the account's ANSI flag and is never saved (it is set
  // TRUE again at every logon, express.e:8273/29072). The strip itself is the
  // output choke's (AnsiUtil.forCaller, applied where each transport writes),
  // not this command's. The message below is sent AFTER the flip, so it is
  // the first text a caller who just turned colour off receives plain.
  const next = !(session.ansiMode ?? session.user?.ansi ?? true);
  session.ansiMode = next;

  // express.e:25241-25246 - plain text, no color codes, no pause
  socket.emit('ansi-output', next ? '\r\nAnsi Color On\r\n' : '\r\nAnsi Color Off\r\n');

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * X Command - Expert Mode Toggle
 *
 * From express.e:26113-26122:
 * PROC internalCommandX()
 *   IF loggedOnUser.expert="X"
 *     aePuts('\b\nExpert mode disabled\b\n')
 *     loggedOnUser.expert:="N"
 *   ELSE
 *     aePuts('\b\nExpert mode enabled\b\n')
 *     loggedOnUser.expert:="X"
 *   ENDIF
 * ENDPROC RESULT_SUCCESS
 *
 * Toggles expert mode (hides menu, single-key commands).
 */
export async function handleExpertModeCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:26113-26122 - Toggle expert mode flag
  const before = session.user.expert === 'X';

  // express.e:26113-26121 — '\b\nExpert mode disabled\b\n' or '\b\nExpert mode enabled\b\n'
  if (before) {
    session.user.expert = 'N';
    socket.emit('ansi-output', '\r\nExpert mode disabled\r\n');
  } else {
    session.user.expert = 'X';
    socket.emit('ansi-output', '\r\nExpert mode enabled\r\n');
  }

  // In memory, as express.e's X does (24595 / 26116); the record is saved
  // with the account (logoff 8207, W 25893).
  await changeAccount(session, { expert: session.user.expert });

  // Return directly to the menu (express.e does not add an extra pause here)
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  await displayMainMenu(socket, session);
}

/**
 * C Command - Comment to Sysop
 *
 * From express.e:24658-24670:
 * PROC internalCommandC(params)
 *   DEF res
 *   IF checkSecurity(ACS_COMMENT_TO_SYSOP)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_MAIL)
 *   parseParams(params)
 *   mciViewSafe:=FALSE
 *   IF checkToolTypeExists(TOOLTYPE_CONF,currentConf,'CUSTOM')=FALSE
 *     res:=commentToSYSOP()
 *   ELSE
 *     customMsgbaseCmd(MAIL_SYSOP_COMMENT,currentConf,1)
 *   ENDIF
 *   mciViewSafe:=TRUE
 * ENDPROC res
 *
 * Allows user to leave a private comment/message for the sysop.
 */
export function handleCommentToSysopCommand(socket: any, session: BBSSession, params: string = ''): void {
  if (!checkSecurity(session.user, ACSPermission.COMMENT_TO_SYSOP)) {
    ErrorHandler.permissionDenied(socket, 'leave comments for sysop', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24662 setEnvStat(ENV_MAIL)
  setEnvStat(session, EnvStat.MAIL);

  // express.e:8762 stat:=captureRealAndInternetNames(currentConf,currentMsgBase)
  // - a missing real / internet name is asked for here, and the comment
  // carries on once it is given.
  const { captureRealAndInternetNames } = require('../message/message-entry.handler');
  if (!captureRealAndInternetNames(socket, session, () => commentToSysop(socket, session))) return;
  commentToSysop(socket, session);
}

/**
 * express.e:8765-8785 commentToSYSOP after the name capture: the sysop is
 * account 1, addressed the way this conference names people (8765-8776),
 * then the header box and To: line, checkToForward(str,toName,0), Subject.
 * express.e:8792-8793 status "R" and comment:=1 - no Private or Quote
 * question; the Subject handler reads isComment for that.
 */
function commentToSysop(socket: any, session: BBSSession): void {
  const { loadAccount, sysopNameForConf, checkToForward } = require('../message/msg-names');
  // express.e:8765 stat:=loadAccount(1,...) ; IF(stat<0) THEN RETURN stat
  if (!loadAccount(1)) return;
  const sysopName: string = sysopNameForConf(session);

  emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');
  emitText(socket, `     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m ${sysopName}\r\n`);

  // express.e:8782 checkToForward(str,mailHeader.toName,0) - with check=0 the
  // FORWARDMAIL account takes the comment whoever it was addressed to.
  const fwd = checkToForward(socket, session, sysopName, false);

  session.inputBuffer = '';
  session.tempData = {
    isPrivate: true,
    messageEntry: {
      toUser: fwd.name,
      toSlot: fwd.account ? fwd.account.slot : 1,
      isComment: true,
      isPrivate: true,  // express.e:8792 status='R'
    }
  };

  emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}

/**
 * The O command lives in `command-handler/page-sysop-command.ts`.
 *
 * A `handlePageSysopCommand` used to be exported from here as well, with the
 * correct express.e:25372-25404 gate in it - and it never ran. command.handler.ts
 * imports this module on line 96 and page-sysop-command.ts on line 97, and the
 * second import of the same name wins, so the copy WITHOUT the gate was the one
 * the board used. The gate now lives in that single surviving handler, next to
 * the operator-chat plumbing it guards.
 *
 * `handleCommentToSysopCommand` below stays here: the page handler calls it for
 * express's out-of-pages redirect.
 */

// OLM (Online Message) system is fully implemented in handlers/transfer/olm.handler.ts
// express.e:25406-25503 - Complete 1:1 port with multi-node tracking, message editor,
// reply tracking (R command), quiet mode (Q command), and real-time delivery.
