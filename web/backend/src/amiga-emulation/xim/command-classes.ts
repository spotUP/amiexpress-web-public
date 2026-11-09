/**
 * Which class of XIM command is this?
 *
 * Pure predicates, lifted out of XIMProtocol.ts (2026-09-20) when that file
 * reached the 2000-line gate - the same move `wait-budget.ts` was, for the
 * same reason. They consult nothing but the command number, which is why
 * they can live here: the dispatcher still owns what to DO with each class.
 */
import { XIMCommand } from './types';
import { debugLog } from '../../utils/debug-log';

/**
 * Check if command is an I/O command
 */
export function isIOCommand(command: number): boolean {
  const ioList = [
    XIMCommand.JH_LI,
    XIMCommand.JH_WRITE,
    XIMCommand.JH_SM,
    XIMCommand.JH_SMPTR,
    XIMCommand.JH_PM,
    XIMCommand.JH_HK,
    XIMCommand.JH_SG,
    XIMCommand.JH_SF,
    XIMCommand.JH_MCI,
    XIMCommand.JH_ExtHK,
    XIMCommand.JH_FetchKey,
    XIMCommand.JH_CO,
    XIMCommand.JH_SO,
    XIMCommand.JH_20,
    XIMCommand.QUICK_KEY,
    XIMCommand.GETKEY,
    XIMCommand.DISPLAY_FILE,
    XIMCommand.CHECK_TO_DISPLAY,
    // THIS BOARD'S OWN, above express.e's MAX_CMD (1003).
    //
    // THIS LINE IS THE STEP THAT GETS FORGOTTEN. AEW_THEME was implemented
    // in xim/data-query.ts and left out of `isDataQueryCommand`, so the C
    // theme picker asked on every open, got "UNHANDLED COMMAND: 10100" and
    // an empty reply, and drew every theme in the classic palette. The
    // handler was fine; the route was missing.
    // A handler that AWAITS needs a second line too: ASYNC_OUTPUT_COMMANDS in
    // session/lifecycle/door-message-callbacks.ts, or the door is released early.
    // AEW_SETPOINTER writes the caller's pointer through loadMsgPointers /
    // saveMsgPointers, so it is asynchronous too and belongs here for the
    // same reason - and this is the line the comment above warns about.
    XIMCommand.AEW_SETPOINTER,
    // AEW_POSTMSG saves a message, which is asynchronous for the same reason.
    XIMCommand.AEW_POSTMSG,
    // AEW_USERFIELD saves the account and reads the user files - async, like
    // the two above, and the line the comment at the top of this list warns about.
    XIMCommand.AEW_USERFIELD,
    // AEW_SCREEN plays a wipe (awaits the frames) and AEW_MENU writes the
    // catalogue file - both asynchronous, both need ASYNC_OUTPUT_COMMANDS too.
    XIMCommand.AEW_SCREEN,
    XIMCommand.AEW_MENU,
    // AEW_USERNOTE looks the user up and writes the notes file - async.
    XIMCommand.AEW_USERNOTE,
    // AEW_CHATPREFS reads and writes the prefs row - async like the commands above.
    XIMCommand.AEW_CHATPREFS,
    // Note: PG_SM, PG_UD, PG_US were removed - they don't exist in axcommon.e
    // and conflicted with JH_REGISTER (1), JH_FLAGFILE (13), JH_SHOWFLAGS (14)
  ];
  if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
debugLog(
      `[XIMProtocol][IOCheckDebug] command=${command} inIO=${ioList.includes(
        command
      )}`
    );
  }
  return ioList.includes(command);
}

/**
 * Check if command is a data query command
 */
export function isDataQueryCommand(command: number): boolean {
  // BB_* commands in 126-146 range should NOT be treated as data queries
  // They are BBS info commands handled by bbsInfoHandler
  // Also exclude MULTICOM (531) which is in the 527-548 range but handled by bbsInfoHandler
  const isBBSInfo = [
    XIMCommand.BB_CONFNAME,    // 126
    XIMCommand.BB_CONFLOCAL,   // 127
    XIMCommand.BB_LOCAL,       // 128
    XIMCommand.BB_MAINLINE,    // 131
    XIMCommand.BB_TASKPRI,     // 140
    XIMCommand.BB_CHATFLAG,    // 142
    XIMCommand.BB_PCONFNAME,   // 146
    XIMCommand.BB_PCONFLOCAL,  // 147
    XIMCommand.MULTICOM,       // 531
  ].includes(command);

  if (isBBSInfo) {
    return false; // Not a data query - let it fall through to BBS info handler
  }

  const inRange =
    (command >= 100 && command <= 146) ||
    (command >= 527 && command <= 548) ||  // Extended to include MOD_TYPE, EDITOR_STRUCT, BYPASS_CSI_CHECK, SENTBY
    command === 606 ||                      // DT_REALNAME
    (command >= 637 && command <= 639) ||   // DT_INTERNETNAME, DT_TRANSLATOR, DT_HOST_LANGUAGE
    (command >= 700 && command <= 704) ||   // DT_HOSTNAME, DT_HOSTIP, DT_GEOGRAPHIC, DT_SIZEUPLOAD, DT_SIZEDOWNLOAD
    (command >= 900 && command <= 906) ||   // DT_CONFACCESS2, DT_CBYTESUPLOAD, DT_CBYTESDOWNLOAD, DT_CFILESUPLOAD, DT_CFILESDOWNLOAD, DT_CALLEDTODAY
    (command >= 1000 && command <= 1002) || // DT_ADDBIT, DT_REMBIT, DT_QUERYBIT
    // THIS BOARD'S OWN user fields, above express.e's MAX_CMD (1003).
    //
    // AEW_THEME reads and writes user.themePreference, which is what every
    // DT_* case in data-query.ts does, so it is routed there. It was
    // implemented in that handler and never added here, and this predicate
    // is the only thing that reaches it: the C theme picker asked for the
    // caller's theme on every open, got "UNHANDLED COMMAND: 10100" and an
    // empty reply, and drew all seven themes in the classic palette with
    // nothing marked (sysop, 2026-09-06: "themec is not using our themes").
    command === XIMCommand.AEW_THEME ||
    // The same route, and the same warning as above: a handler nothing
    // reaches is a handler that does not exist.
    command === XIMCommand.AEW_DISPLAYMODE ||
    command === XIMCommand.AEW_ANIMATIONS ||
    command === XIMCommand.AEW_CHARSET;
  if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
debugLog(
      `[XIMProtocol][DataCheckDebug] command=${command} inDQ=${inRange}`
    );
  }
  return inRange;
}
