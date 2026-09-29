/**
 * System Commands Handler - System operations and messaging
 *
 * Implements system commands from express.e:
 * - G: Goodbye/Logoff (internalCommandG - express.e:25047-25075)
 * - Q: Quiet Mode toggle (internalCommandQ - express.e:25504-25516)
 * - H: Help system (internalCommandH - express.e:25075-25087)
 * - R: Read messages (internalCommandR - express.e:25518-25532) - See messaging.handler.ts
 * - E: Enter message (internalCommandE - express.e:24860-24868) - See messaging.handler.ts
 */

import { MOUSE_REPORTING_OFF } from '../../utils/terminal-modes';
import { checkSecurity } from '../../utils/acs.util';
import * as path from 'path';
import { boardRoot } from '../../utils/board-root.util';
import { servesPetsciiArt } from '../screen.handler';
import { ACSPermission } from '../../constants/acs-permissions';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { BBSState, LoggedOnSubState } from '../../constants/bbs-states';
import type { BBSSession } from '../../index';
import { FileFlagManager } from '../../utils/file-flag.util';
import { config } from '../../config';
import { flushOutput } from '../../utils/output.util';
import { finalizeCommand } from '../../utils/command-response.util';
import { loginNamePrompt, loginPasswordPrompt } from '../../utils/node-tooltypes.util';

// Injected dependencies
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => Promise<boolean>;
// The injected function is screen-security.util's findSecurityScreen, which
// takes a texttvMode too; this declaration had been left a parameter short,
// so passing it was a type error rather than the fix it is.
let _findSecurityScreen: (screenDirAndName: string, userSecLevel?: number, userScreenTypeExt?: string | null, ripMode?: boolean, defScreens?: boolean, petsciiMode?: boolean, texttvMode?: boolean) => string | null;

// Injection function
export function setSystemCommandsDependencies(deps: {
  displayScreen: typeof _displayScreen;
  findSecurityScreen: typeof _findSecurityScreen;
}) {
  _displayScreen = deps.displayScreen;
  _findSecurityScreen = deps.findSecurityScreen;
}

/**
 * Handle G command - Goodbye/Logoff
 * 1:1 port from express.e:25047-25075 internalCommandG()
 */
/**
 * The caller's own unfinished uploads, as express counts them.
 *
 * cleanPlayPen files an aborted upload as `<name>@<slot>` in the conference's
 * PartUpload directory - or `@<node>-<slot>` when the sysop sets ownPartFiles -
 * and express.e:17583's `getUN()` reads that suffix back to decide whose it is.
 * Anything belonging to somebody else is not this caller's business.
 */
export function partUploadsForCaller(session: BBSSession): string[] {
  const slot = session.user?.slotNumber;
  if (!slot) return [];

  try {
    const fs = require('fs');
    const path = require('path');
    const { config } = require('../../config');
    const { getConferenceDir } = require('../../utils/file-hold.util');
    const dir = path.join(
      getConferenceDir(session.currentConf || 1, config.get('dataDir')),
      'PartUpload',
    );
    if (!fs.existsSync(dir)) return [];

    const mine = new RegExp(`@(?:\\d+-)?${slot}$`);
    return fs.readdirSync(dir).filter((name: string) => mine.test(name));
  } catch (err) {
    // A board with no PartUpload directory has no partial uploads, and a
    // failure to look must never block a logoff.
    console.warn('[GOODBYE] could not check PartUpload:', err);
    return [];
  }
}

/**
 * How long a logging-off caller waits for the LOGOFF sys-commands before the
 * line drops. Long enough for a logoff door that prints something; nowhere
 * near long enough for the batch, which is the point - see the note in
 * handleGoodbyeCommand.
 */
const LOGOFF_COMMAND_GRACE_MS = 3000;

export async function handleGoodbyeCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // express.e:25050-25055 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  let auto = false;

  if (parsedParams.length > 0) {
    // Check for 'Y' parameter (auto-logout without prompts)
    auto = ParamsUtil.hasFlag(parsedParams, 'Y');
  }

  // Ensure flag manager exists (Partdownload/flagged slot files)
  if (!session.flagManager) {
    const dataDir = config.get('dataDir');
    const slot = session.user?.slotNumber || 0;
    session.flagManager = new FileFlagManager(dataDir, slot, session.nodeId || 0);
  }

  if (!auto) {
    /**
     * express.e:25056 - `IF partUploadOK(0)=RESULT_ABORT THEN RETURN`, before
     * the flagged-files question.
     *
     * `partUploadOK` (express.e:17525) walks `<conf>/PartUpload/`, matches each
     * name's `@<slot>` suffix against the caller, and on a hit says "There are
     * some incompleted uploads of yours" and asks whether to leave anyway.
     *
     * The note that used to sit here - "For web version, we don't have partial
     * uploads" - was true only because nothing ever created them: cleanPlayPen,
     * which is what files a partial upload into PartUpload, had no callers
     * until it was wired into the post-upload pipeline. Now that aborted
     * uploads land there, this question has something to ask about, and a
     * caller who hangs up without it silently abandons a resumable upload.
     */
    if (!session.tempData?.partUploadAcknowledged && partUploadsForCaller(session).length > 0) {
      session.tempData = session.tempData || {};
      session.tempData.pendingGoodbye = true;
      session.tempData.pendingGoodbyePartUpload = true;
      session.tempData.pendingGoodbyeParams = params;
      socket.emit('ansi-output', '\r\nThere are some incompleted uploads of yours\r\n');
      socket.emit('ansi-output', 'Would you like to leave anyway (Y/N)? ');
      session.subState = LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM;
      return;
    }

    // express.e:25057-25064 - checkFlagged(): flagged files not downloaded.

    const flaggedCount = session.flagManager?.getCount
      ? session.flagManager.getCount()
      : (session.flaggedFiles ? session.flaggedFiles.length : 0);

    if (flaggedCount > 0) {
      // express.e:12670-12672: '\r\nYou have flagged files still not downloaded.\r\nDo you leave without them? '
      // then yesNo(2) — Y=yes leave (proceed logoff), N/CR=no cancel logoff
      session.tempData = session.tempData || {};
      session.tempData.pendingGoodbye = true;
      socket.emit('ansi-output', '\r\nYou have flagged files still not downloaded.\r\nDo you leave without them? \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
      session.subState = LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM;
      return;
    }
  }

  // express.e:25064 - saveFlagged()
  // Save flagged files list (for web version, this is handled in session)

  // express.e:25065 - saveHistory()
  // CRITICAL: Save command history NOW, before disconnect, per express.e
  // Previously this was only in disconnect cleanup, causing a race condition
  // where history was lost if user logged in again within 15 seconds
  if (session.user?.id) {
    try {
      const { saveHistory } = require('../../utils/command-history.util');
      await saveHistory(session, session.user.id);
console.log(`[LOGOFF] Saved command history for user ${session.user.username}`);
    } catch (err) {
console.error('[LOGOFF] Failed to save command history:', err);
    }
  }

  // express.e:25066 - reqState:=REQ_STATE_LOGOFF
  // express.e:25069 - setEnvStat(ENV_LOGOFF)
console.log('[ENV] Logoff');

  // express.e:8213 — StrCopy(reservedName,'') after logoff. Drop the
  // per-node reservation so the next caller isn't blocked by a stale
  // entry pointing at the user who just logged off. (Audit A-3.)
  if (typeof session.nodeId === 'number') {
    const { clearNodeReservation } = require('../../services/node-reservation.service');
    clearNodeReservation(session.nodeId);
  }

  // Set session state to logoff
  session.subState = LoggedOnSubState.LOGOFF;

  // express.e:8187 - displayScreen(SCREEN_LOGOFF)
  // Display Logoff.txt screen file which contains ~XIDOORS:who/No
console.log('[LOGOFF] Displaying Logoff screen with NO door execution');
  // Reset shortcuts on exit (express.e:8124)
  session.cmdShortcuts = false;
  if (session.shortcuts) session.shortcuts.clear();
  session.doorExpertMode = false;
  session.menuPause = true; // ensure next displayMainMenu shows if invoked during logoff edge cases
  const logoffDisplayed = await _displayScreen(socket, session, 'Logoff');

  /*
   * THE ART GOES OUT NOW, WHILE THERE IS STILL A LINE TO PUT IT ON.
   *
   * Screen art is written with `emitText`, which batches into the ANSI buffer
   * and flushes on a 16 ms timer. Everything below writes with a direct
   * `socket.emit` - which does NOT go through that buffer and therefore
   * overtakes it - and ends by telling the client to disconnect. So the last
   * unflushed rows of the logo were still in the buffer when the socket
   * closed on top of them: the caller got the first rows, then
   * "Click... NO CARRIER", and nothing in between.
   *
   * Reported twice by the sysop on 2026-09-14, the second time after a
   * different cause had been ruled out: "logoff is still cut off".
   */
  flushOutput(socket);

  if (!logoffDisplayed) {
    // Fallback if Logoff.txt doesn't exist
    // express.e:25047 internalCommandG - no header, just processes logoff
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Thank you for calling ' + (session.user?.bbsName || 'AmiExpress BBS') + '\r\n');
    socket.emit('ansi-output', '\r\n');
  }

  // Persist flagged list (express.e saveFlagged) before dropping carrier
  try {
    session.flagManager?.save();
  } catch (err) {
console.error('[LOGOFF] Failed to save flagged files:', err);
  }

  // express.e:8234-8293 - Check relogon flag to determine next state
  // IF (relogon)
  //   processSysCommand('RELOGON')
  //   StringF(tempstr,'RELOGON\d',node)
  //   processSysCommand(tempstr)
  // ...
  // IF (relogon=FALSE)
  //   state:=STATE_AWAIT
  //   modemOffHook()
  // ELSE
  //   state:=STATE_LOGON
  //   relogon:=FALSE
  // ENDIF
  if (session.relogon) {
    // Relogon requested - run RELOGON commands and return to login
    console.log('[LOGOFF] Relogon requested - processing RELOGON commands');

    // express.e:8235-8237 - Run RELOGON and RELOGONn system commands
    try {
      // Renamed/moved: processSysCommand → runSysCommand in command-execution.handler.
      const { runSysCommand: processSysCommand } = require('../command-execution.handler');
      await processSysCommand(socket, session, 'RELOGON');
      await processSysCommand(socket, session, `RELOGON${session.nodeId || 0}`);
    } catch (err) {
      console.error('[LOGOFF] Error processing RELOGON commands:', err);
    }

    // express.e:8291-8292 - Set state to LOGON and clear relogon flag
    session.state = BBSState.LOGON;
    session.relogon = false;

    console.log('[LOGOFF] Relogon complete - returning to login state');
    socket.emit('ansi-output', '\r\n');

    // Return to login flow (don't disconnect).
    //
    // This used to require('../login.handler') for handleLoginPrompt, which
    // is exported nowhere in the tree - so relogon threw here every time and
    // the re-login it exists to perform never ran. There is no such module
    // to point at; the login state is entered directly, the way a fresh
    // connection enters it (index.ts:1863).
    session.subState = undefined;
    session.tempData = session.tempData || {};
    session.tempData.loginPhase = 'username';
    session.tempData.inputBuffer = '';

    // Every transport is served by the LOGON branch in handleCommand (TP-9a),
    // which buffers the username itself and needs the prompt on screen. A
    // web caller used to be sent `retry-login` for a browser login editor
    // that TP-9b retired, and was left with no prompt at all.
    socket.emit('ansi-output', `\r\n${loginNamePrompt(session.nodeId ?? 0)} `);
    return;
  }

  // Normal logout - express.e:8284-8289
  // Deliberate goodbye, not a drop: the disconnect handler skips both
  // grace periods for this session (ghostlogoff 2026-09-10 - a G caller
  // who re-logs within 15 s met his own not-yet-cleaned session).
  session.cleanLogoff = true;
  session.state = BBSState.AWAIT;

  // express.e:8222 + 8230-8231 — sysop lifecycle hooks on disconnect.
  // Fire 'LOGOFF' (global) then 'LOGOFF<nodeId>' (per-node). Sysops use
  // these to run cleanup scripts, rotate logs, etc. The same command
  // resolver handles both global and per-node by suffixing the node.
  try {
    // Renamed/moved: processSysCommand → runSysCommand in command-execution.handler.
    const { runSysCommand: processSysCommand } = require('../command-execution.handler');
    // These ARE the logoff batches on this board: LOGOFF<n> resolves to
    // BBS:Batch<n>. The disconnect handler runs a mirror of them for a
    // caller whose carrier drops and never reaches here; mark the session
    // BEFORE they start so it stands down rather than running the same
    // script beside this one (services/batch-scheduler.ts
    // `logoffBatchesAlreadyRan`). Before, the mark came after the await -
    // harmless while the commands finished instantly, a second set of
    // emulators once they did not.
    (session as any).logoffBatchesRan = true;
    /*
     * OFF THE BOARD FIRST, THEN THE PAPERWORK - the deliberate goodbye too.
     *
     * express.e:8222/8231 runs these before the line drops, and this port
     * awaited them. Once LOGOFF<n> actually executes BBS:Batch<n> (it did
     * not until 6b2506a02 - it was dispatched as a 68K door and exited at
     * once) that is seven emulators with a 300 s budget each, and the caller
     * sat at `Click...` for as long as they took, with the session still
     * counted on the board. That is the "batch doors never exit" shape this
     * board has been bitten by before, and the disconnect handler was
     * rewritten to avoid it. The commands are SILENT on this board, so the
     * caller loses nothing by leaving before they finish.
     *
     * The grace is for the quick case - a real logoff door that prints a
     * line - not for the batch. Whatever is still running when it ends
     * carries on in the background, serialised by the batch queue, and says
     * so in the log.
     */
    const { settleWithin } = require('../../utils/settle-within');
    const commands = (async () => {
      await processSysCommand(socket, session, 'LOGOFF');
      await processSysCommand(socket, session, `LOGOFF${session.nodeId || 0}`);
    })().catch(err => {
      console.error('[LOGOFF] Error processing LOGOFF sys-commands:', err);
    });
    const finished = await settleWithin(commands, LOGOFF_COMMAND_GRACE_MS);
    if (!finished) {
      console.log(`[LOGOFF] LOGOFF sys-commands for node ${session.nodeId || 0} outlived the caller; continuing in the background`);
    }
  } catch (err) {
    console.error('[LOGOFF] Error processing LOGOFF sys-commands:', err);
  }

  // express.e:8191 aePuts('\b\nClick...') — express.e relies on the modem to print
  // "NO CARRIER" when the line drops. WEB_: there's no modem in our path, so we
  // append the conventional "NO CARRIER" string ourselves so users get the same
  // retro disconnect feel.
  // Anything written since the screen - the fallback goodbye, a relogon
  // notice - goes out before the goodbye lines, for the same reason.
  flushOutput(socket);
  // The line drops with the caller's terminal as the board found it: a mouse
  // mode a door left on outlives the connection, and his shell then prints
  // the reports ("35;6;8M35;6;8M" after "Connection closed by foreign host",
  // sysop, 2026-09-29). Door exit already resets it; this covers a door the
  // line dropped out of.
  socket.emit('ansi-output', MOUSE_REPORTING_OFF + '\r\nClick...\r\nNO CARRIER\r\n');

  // Emit disconnect event to close connection (give time for screen to display and door to run)
  setTimeout(() => {
    socket.emit('force-disconnect', { reason: 'User logged off' });
    // socket may be a socket.io client or a raw telnet/ssh socket
    if (typeof (socket as any).disconnect === 'function') {
      (socket as any).disconnect(true);
    } else if (typeof (socket as any).end === 'function') {
      (socket as any).end();
    } else if (typeof (socket as any).destroy === 'function') {
      (socket as any).destroy();
    }
  }, 2000);
}

/**
 * Handle Q command - Quiet Mode Toggle
 * 1:1 port from express.e:25504-25516 internalCommandQ()
 */
export function handleQuietModeCommand(socket: any, session: BBSSession): void {
  // express.e:25505 - Check ACS_QUIET_NODE permission
  if (!checkSecurity(session.user, ACSPermission.QUIET_NODE)) {
    ErrorHandler.permissionDenied(socket, 'toggle quiet mode', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25506-25512 - Toggle quiet mode flag
  session.quietMode = !session.quietMode;

  // Send quiet flag to other systems (for web version, this is just local)
  // sendQuietFlag(quietFlag) - express.e:25507

  // express.e:25508-25511 — plain text, no decoration, no press-key
  if (session.quietMode) {
    socket.emit('ansi-output', '\r\nQuiet Mode On\r\n');
  } else {
    socket.emit('ansi-output', '\r\nQuiet Mode Off\r\n');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle H command - Help System
 * 1:1 port from express.e:25075-25087 internalCommandH()
 */
export function handleHelpCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25079-25081 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  // express.e:25076 - nonStopDisplayFlag:=paramsContains('NS')
  ParamsUtil.hasFlag(parsedParams, 'NS'); // consumed; no CLS emitted (express.e:25071-25087 has none)

  // express.e:25083 - Find help file
  // StringF(tempstr,'\sBBSHelp',cmds.bbsLoc)
  //
  // cmds.bbsLoc IS THE BOARD, and this was a bare 'BBSHelp' - resolved
  // against whatever directory the process happens to be started in, which
  // on the live board is not where BBSHelp.txt lives. The screen could not
  // be found from there, so this command answered "Sorry Help is unavailable
  // at this time" however well the board was set up.
  const helpBasePath = path.join(boardRoot(), 'BBSHelp');

  // express.e:25084 - findSecurityScreen()
  // NOTE: previously passed session.petsciiMode into the userScreenTypeExt
  // slot (a mistyped shim masked by `as any` at the injection site in
  // initialization.ts) - this was never live PETSCII logic, just a no-op
  // (".true" was never a real extension). Fixed to call the real,
  // petsciiMode-aware findSecurityScreen (screen-security.util.ts).
  // texttvMode as well - the sibling call in utility-commands passes it, and
  // a teletext caller asking for help got the ANSI screen without it.
  const helpScreenPath = _findSecurityScreen(helpBasePath, session.user?.secLevel || 0, null, session.ripMode, false, servesPetsciiArt(session), session.texttvMode === true);

  if (helpScreenPath) {
    // express.e:25085 - displayFile(screen)
    _displayScreen(socket, session, helpScreenPath);

  } else {
    // express.e:25083: '\b\n\b\nSorry Help is unavailable at this time.\b\n\b\n'
    socket.emit('ansi-output', '\r\n\r\nSorry Help is unavailable at this time.\r\n\r\n');
  }

  finalizeCommand(socket, session, 'Help information displayed');
}

/**
 * Handle R command - Read Messages
 * 1:1 port from express.e:25518-25532 internalCommandR()
 * Implementation in messaging.handler.ts
 */
export async function handleReadMessagesCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // CJS require, not ESM import(): tsx keeps ESM and CJS caches separate,
  // so a dynamic import() would resolve messaging.handler to a different
  // module instance than initialization.ts's static-import-compiled-to-
  // require, leaving _db undefined on the wrong instance (2026-04-24 bug).
  const { handleReadMessagesFullCommand } = require('../message/messaging.handler');
  await handleReadMessagesFullCommand(socket, session, params);
}

/**
 * Handle E command - Enter Message
 * 1:1 port from express.e:24860-24868 internalCommandE() -> express.e:10749+ enterMSG()
 *
 * NOTE: this is a thin shim that delegates to messaging.handler.ts'
 * handleEnterMessageFullCommand. Earlier versions of this function had
 * an inline copy of the enterMSG flow, but it silently skipped the
 * skipEntry chain (EALL exact-match, sysop loadAccount, chooseAName
 * canonical name, checkConfAccess, checkToForward) when params were
 * pre-filled. The canonical implementation lives in messaging.handler.ts;
 * keep this export so existing imports keep resolving.
 */
export function handleEnterMessageCommand(socket: any, session: BBSSession, params: string = ''): void {
  const { handleEnterMessageFullCommand } = require('../message/messaging.handler');
  handleEnterMessageFullCommand(socket, session, params);
}
