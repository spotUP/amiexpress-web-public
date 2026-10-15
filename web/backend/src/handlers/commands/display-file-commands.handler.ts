/**
 * Display and File Commands Handler
 *
 * Implements display and file-related commands as 1:1 ports from express.e:
 * - ? (Question Mark) - Show menu in expert mode - express.e:24594-24599
 * - F (File Listings) - Display file list - express.e:24877-24881
 * - FR (File Listings Raw) - Display file list with full details - express.e:24883-24887
 * - A (Alter Flags) - Flag files for download - express.e:24601-24605
 * - FS (File Status) - Show file statistics - express.e:24872-24875
 * - B (Read Bulletin) - Read specific bulletin - express.e:24607-24656
 */

import { conferenceSubdir } from '../../conferences/conference-paths';
import { servesPetsciiArt } from '../screen.handler';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity, UserFlags, setEnvStat } from '../../utils/acs.util';
import { EnvStat } from '../../constants/env-codes';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { InternalCommandResult } from '../../constants/command-results';
import { ParamsUtil } from '../../utils/params.util';
import path from 'path';
import fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import { finalizeCommand } from '../../utils/command-response.util';
import { displayMainMenu } from '../command-handler/menu';
import { config } from '../../config';
import { conferenceHasBulletins } from '../../services/bulletin-list';
import { userScreenTypeExtension } from '../../screens/screen-metadata';

/**
 * checkScreenClear - express.e:2013-2018
 *
 * PROC checkScreenClear()
 *   IF((loggedOnUserKeys.userFlags AND USER_SCRNCLR))
 *     sendCLS()
 *     RETURN TRUE
 *   ENDIF
 * ENDPROC FALSE
 *
 * Sends form feed (ASCII 12) if user has screen clear flag enabled.
 * Returns true if screen was cleared, false otherwise.
 */
function checkScreenClear(socket: any, session: BBSSession): boolean {
  const userFlags = session.user?.userFlags || 0;
  if (userFlags & UserFlags.SCRNCLR) {
    /*
     * sendCLS() - express.e:5224-5228 sends ASCII 12 (form feed).
     *
     * A real Amiga terminal CLEARS on a form feed. xterm.js does not - it
     * treats 0x0C as a line feed - so every `checkScreenClear()` this port
     * makes, at every site express.e calls it (the menu at express.e:28585
     * included), has been asking for a clear that never happened. The board
     * was right and the wire was wrong.
     *
     * The `~f` MCI sentinel already knew this (`mci-dispatch.ts:420` maps it
     * to the ANSI clear, or 0x93 for PETSCII); sendCLS never got the same
     * treatment. `clearTheScreen` is that mapping, in one place.
     */
    emitText(socket, clearTheScreen(socket));
    return true;
  }
  return false;
}
import { formatBytesCompact } from '../../utils/byte-format.util';
import { formatDateSlash } from '../../utils/date-format.util';

import { emitText, clearTheScreen } from '../../utils/output.util';

import type { BBSSession } from '../../index';
import { reportBulletinRead } from '../../achievements/sites';

// Dependencies injected from index.ts
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => void;
let _findSecurityScreen: (screenDirAndName: string, userSecLevel?: number, userScreenTypeExt?: string | null, ripMode?: boolean, defScreens?: boolean, petsciiMode?: boolean, texttvMode?: boolean) => string | null;
let _confScreenDir: string;
let _db: any;
let _hasKeysFile: any;

/**
 * Set dependencies for display/file commands (called from index.ts)
 */
export function setDisplayFileCommandsDependencies(deps: {
  displayScreen: typeof _displayScreen;
  findSecurityScreen: typeof _findSecurityScreen;
  confScreenDir: string;
  db: any;
  hasKeysFile: any;
}) {
  _displayScreen = deps.displayScreen;
  _findSecurityScreen = deps.findSecurityScreen;
  _confScreenDir = deps.confScreenDir;
  _db = deps.db;
  _hasKeysFile = deps.hasKeysFile;
}

/**
 * ? Command - Show Menu in Expert Mode
 *
 * From express.e:24594-24599:
 * PROC internalCommandQuestionMark()
 *   IF (loggedOnUser.expert="X")
 *     checkScreenClear()
 *     displayScreen(SCREEN_MENU)
 *   ENDIF
 * ENDPROC RESULT_SUCCESS
 *
 * In expert mode, displays the menu screen.
 * In normal mode, does nothing (menu is always visible).
 */
export async function handleQuestionMarkCommand(socket: any, session: BBSSession): Promise<void> {
  const isExpert = session.user?.expert === 'X';
  if (!isExpert) {
    // In non-expert mode the menu is already visible; nothing to do.
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:24596 - checkScreenClear() sends CLS if user has SCRNCLR flag
  checkScreenClear(socket, session);

  // In expert mode, explicitly redraw the menu and reset input state.
  session.menuPause = false;
  await displayMainMenu(socket, session, true);
}

/**
 * F Command - File Listings
 *
 * From express.e:24877-24881:
 * PROC internalCommandF(params)
 *   IF checkSecurity(ACS_FILE_LISTINGS)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_FILES)
 * ENDPROC displayFileList(params);
 *
 * Displays file listings for the current conference.
 * Supports parameters for filtering (wildcards, etc.)
 */
export async function handleFileListCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.FILE_LISTINGS)) {
    ErrorHandler.permissionDenied(socket, 'view file listings', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

setEnvStat(session, EnvStat.FILES);

  // Import and use the new FileListingHandler
  const { FileListingHandler } = require('../file/file-listing.handler');
  await FileListingHandler.handleFileList(socket, session, params, false);
}

/**
 * FR Command - File Listings (Raw/Full Details)
 *
 * From express.e:24883-24887:
 * PROC internalCommandFR(params)
 *   IF checkSecurity(ACS_FILE_LISTINGS)=FALSE THEN RETURN RESULT_ALLOWED
 *   setEnvStat(ENV_FILES)
 * ENDPROC displayFileList(params,TRUE);
 *
 * Displays file listings with full details (raw format).
 * Shows more information than the F command.
 */
export async function handleFileListRawCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.FILE_LISTINGS)) {
    ErrorHandler.permissionDenied(socket, 'view file listings', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

setEnvStat(session, EnvStat.FILES);

  // Import and use the new FileListingHandler
  const { FileListingHandler } = require('../file/file-listing.handler');
  await FileListingHandler.handleFileList(socket, session, params, true);
}

// formatDate imported from '../../utils/date-format.util' as formatDateSlash
const formatDate = formatDateSlash;

/**
 * A Command - Alter File Flags (Flag for Download)
 *
 * From express.e:24601-24605:
 * PROC internalCommandA(params)
 *   IF checkSecurity(ACS_DOWNLOAD)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_FILES)
 *   alterFlags(params)
 * ENDPROC RESULT_SUCCESS
 *
 * Allows users to flag files for download.
 * Interactive flag management system.
 */
export async function handleAlterFlagsCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): Promise<InternalCommandResult> {
  // Use the new AlterFlagsHandler. The result is RETURNED, not swallowed:
  // express.e:24602's RESULT_NOT_ALLOWED has to reach processBBSCommand
  // (express.e:28400) or the refusal is silent. This wrapper dropping it is
  // exactly how the A command lost its refusal the first time.
  const { AlterFlagsHandler } = require('../operations/alter-flags.handler');
  return await AlterFlagsHandler.handleAlterFlagsCommand(socket, session, params);
}

/**
 * FS Command - File Status
 *
 * From express.e:24872-24875:
 * PROC internalCommandFS()
 *   IF checkSecurity(ACS_CONFERENCE_ACCOUNTING)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   fileStatus(0)
 * ENDPROC RESULT_SUCCESS
 *
 * Displays file upload/download statistics per conference.
 */
export async function handleFileStatusCommand(socket: any, session: BBSSession): Promise<InternalCommandResult> {
  // Use FileStatusHandler via DI container
  const { container } = await import('../../container');
  const { FileStatusHandler } = await import('../file/file-status.handler');
  const handler = container.resolve(FileStatusHandler);
  return await handler.handleFileStatusCommand(socket, session);
}

// formatBytes now imported from '../../utils/byte-format.util' as formatBytesCompact
const formatBytes = formatBytesCompact;

/**
 * B Command - Read Bulletin
 *
 * From express.e:24607-24656:
 * PROC internalCommandB(params)
 *   - Check ACS_READ_BULLETINS permission
 *   - Check if BullHelp.txt exists
 *   - If params: parse bulletin number and NS flag
 *   - If no params: show BullHelp, prompt for bulletin number
 *   - Loop: display bulletin, prompt for next number
 *   - Allow "?" to re-show help, Enter to quit
 *
 * Interactive bulletin reading system.
 * Bulletins are stored in Bulletins/Bull1, Bull2, etc.
 */
/**
 * Where this board keeps its bulletins for the conference the caller is in.
 *
 * express.e:24616-24648 reads them out of `confScreenDir/Bulletins/`, and
 * that is still the first answer. This board does not use it: its bulletins
 * live in one `Bulletins/` directory at the board root (bull1..12 and
 * BullHelp beside them), which is where the Bulls door reads them from too -
 * `Conf1/Bulletins` is a 0-byte Amiga leftover from 2020.
 *
 * It never showed, because the Bulls door won the B command and read the
 * root itself. The moment a caller reached the board's OWN bulletin tier -
 * a teletext caller, 2026-09-14 - the conference-scoped path answered "no
 * bulletins are available in this conference" for a board with twelve of
 * them. So: the conference's own directory when it has one, the board's
 * otherwise.
 */
function bulletinDir(session: BBSSession): string {
  const dataDir = config.get('dataDir');
  const currentConf = session.currentConf || 1;
  const confDir = path.join(conferenceSubdir(dataDir, currentConf, 'Screens'), 'Bulletins');
  try {
    if (amigafs.existsSync(confDir) && amigafs.statSync(confDir).isDirectory()) return confDir;
  } catch {
    /* not a directory, or not readable: the board's own is the answer */
  }
  return path.join(dataDir, 'Bulletins');
}

export function handleReadBulletinCommand(socket: any, session: BBSSession, params: string = ''): void {
  if (!checkSecurity(session.user, ACSPermission.READ_BULLETINS)) {
    ErrorHandler.permissionDenied(socket, 'read bulletins', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

setEnvStat(session, EnvStat.BULLETINS);

  // express.e:24616-24621 - Check confScreenDir + 'Bulletins/BullHelp.txt'
  // confScreenDir = Conf{N}/Screens/ — per-conference screen directory
  // Any variant counts as "this conference has bulletins": a board whose
  // bulletin menu is authored as teletext has bulletins just as much as one
  // whose menu is a .txt.
  const hasBullHelp = conferenceHasBulletins(
    config.get('dataDir'),
    conferenceSubdir(config.get('dataDir'), session.currentConf || 1, 'Screens'),
  );
  if (!hasBullHelp) {
    // express.e:8544-8545 myError(ERR_NO_BULLS): '\b\nNo bulletins are available in this conference!\b\n\b\n'
    socket.emit('ansi-output', '\r\nNo bulletins are available in this conference!\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const parsedParams = ParamsUtil.parse(params);

  if (parsedParams.length > 0) {
    // Bulletin number provided as parameter
    const bulletinNum = ParamsUtil.extractNumber(parsedParams);
    const nonStopDisplay = ParamsUtil.hasFlag(parsedParams, 'NS');

    if (bulletinNum !== null) {
      _displayBulletin(socket, session, bulletinNum, nonStopDisplay);
      // Enter interactive loop
      session.subState = LoggedOnSubState.BULLETIN_INPUT;
      session.bulletinContext = { nonStopDisplay };
      return;
    }
  }

  // No params - show help and prompt
  _showBulletinHelp(socket, session);
}

/**
 * Helper: Show bulletin help screen and prompt for bulletin number
 */
function _showBulletinHelp(socket: any, session: BBSSession): void {
  // express.e:24630-24632 - StrCopy(str,confScreenDir); StrAdd(str,'Bulletins/BullHelp')
  // confScreenDir = Conf{N}/Screens/
  const bullHelpBasePath = path.join(bulletinDir(session), 'BullHelp');
  /*
   * WITH the caller's screen KIND, not just their level.
   *
   * This asked for a screen the way it has since express.e, and got the
   * `.txt` every time: the loader chooses `.seq` for a C64 and `.ttx` for a
   * teletext caller only when it is told which it is talking to. So a
   * teletext caller reading bulletins got the 80-column ANSI menu even with
   * a teletext one sitting beside it, and a C64 the same (2026-09-14). The
   * help command two files over has passed these two arguments all along.
   */
  const helpScreen = _findSecurityScreen(
    bullHelpBasePath,
    session.user?.secLevel || 0,
    userScreenTypeExtension(session.user, config.get('dataDir')),
    session.ripMode,
    false,
    servesPetsciiArt(session),
    session.texttvMode === true,
  );

  if (helpScreen) {
    _displayScreen(socket, session, helpScreen);
  }

  // express.e:24634: 'Which Bulletin (?)=List, (Enter)=none? ' — plain text, no ANSI
  socket.emit('ansi-output', 'Which Bulletin (?)=List, (Enter)=none? ');

  session.subState = LoggedOnSubState.BULLETIN_INPUT;
  session.bulletinContext = { showedHelp: true, nonStopDisplay: false };
}

/**
 * Helper: Display a specific bulletin
 */
function _displayBulletin(socket: any, session: BBSSession, bulletinNum: number, nonStopDisplay: boolean): void {
  // express.e:24648 - StringF(str,'\sBulletins/Bull\d',confScreenDir,stat)
  // confScreenDir = Conf{N}/Screens/
  const bulletins = bulletinDir(session);
  const bulletinBasePath = path.join(bulletins, `Bull${bulletinNum}`);
  const bulletinScreen = _findSecurityScreen(bulletinBasePath, session.user?.secLevel || 0, userScreenTypeExtension(session.user, config.get('dataDir')), session.ripMode);

  // express.e:24648-24655: displayFile, then straight back to the prompt -
  // no line break of its own either side (lineInput's is the caller's).
  if (bulletinScreen) {
    _displayScreen(socket, session, bulletinScreen);
    // Achievements (SP2): every bulletin read is bull.read.all, once. Non-throwing.
    reportBulletinRead(session as any, bulletinNum, bulletins);
  } else {
    // express.e:24652-24653: '\b\nSorry there is no bulletin #\d\b\n\b\n'
    socket.emit('ansi-output', `\r\nSorry there is no bulletin #${bulletinNum}\r\n\r\n`);
  }

  // express.e:24655 JUMP inputAgain — re-show prompt
  // express.e:24634: plain text prompt
  socket.emit('ansi-output', 'Which Bulletin (?)=List, (Enter)=none? ');
}

/**
 * Handle bulletin input (called from command handler when in BULLETIN_INPUT state)
 */
export function handleBulletinInput(socket: any, session: BBSSession, input: string): void {
  const trimmedInput = input.trim();

  // Enter key - quit bulletin mode
  if (trimmedInput === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.bulletinContext;
    return;
  }

  // ? - show help again
  if (trimmedInput === '?') {
    _showBulletinHelp(socket, session);
    return;
  }

  // Parse bulletin number
  const parsedParams = ParamsUtil.parse(trimmedInput);
  const nonStopDisplay = ParamsUtil.hasFlag(parsedParams, 'NS');
  const bulletinNum = ParamsUtil.extractNumber(parsedParams);

  // express.e:24646 stat:=Val(...) - a word that is not a number is 0, and
  // bulletin 0 is looked for like any other (usually "Sorry there is no
  // bulletin #0"). The port printed an invented "Invalid bulletin number".
  _displayBulletin(socket, session, bulletinNum ?? 0, nonStopDisplay);
  session.bulletinContext = { nonStopDisplay };
}
