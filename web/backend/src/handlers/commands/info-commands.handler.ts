/**
 * User Information Commands Handler
 *
 * Implements user and system information commands as 1:1 ports from express.e:
 * - VER (Version Info) - Display BBS version information - express.e:25688-25699
 * - WHO (Who's Online) - List online users - express.e:26094-26103
 * - WHD (Who's Online Detailed) - Detailed online user listing - express.e:26104-26112
 * - W (Write User Parameters) - Edit user configuration - express.e:25712-25785+
 */

import { LoggedOnSubState, BBSState } from '../../constants/bbs-states';
import { settingsDoorsFor, type SettingsDoorEntry } from './w-settings-doors';
import { autoLinesFor } from '../../utils/auto-lines.util';
import { linesCountdown, LINES_PROMPT } from '../../utils/lines-test.util';
import { getBoardConfig } from '../../services/bbs-config-file.service';
import { config as appConfig } from '../../config';
import { ACSPermission } from '../../constants/acs-permissions';
import { ftpCallersOnline } from '../../ftp/ftp-presence';
import { WHO_TABLE_TOP, WHO_TABLE_BOTTOM, whoRow } from '../../utils/who-table.util';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { headingIndent, isNarrow } from '../../utils/table-format.util';
import { sessionColumns } from '../../utils/door-min-columns.util';
import { wMenuPage, wMenuPrompt, wMenuPageStep } from './w-menu-pager';
import { ErrorHandler } from '../../utils/error-handling.util';
import { db } from '../../database';
import { translationService } from '../../services/TranslationService';
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import { releaseAnsiBuffer } from '../../utils/ansi-buffer.util';
import { sessionWantsPetscii, PETSCII_FONT_IS_FIXED } from '../../utils/petscii-session-model';
import { DEFAULT_TERMINAL_FONT } from '../../constants/terminal-fonts';
import { fontMenuRows, fontForChoice, chooseTerminalFont } from '../../services/terminal-font.service';
import bcrypt from 'bcryptjs';
import { finalizeCommand } from '../../utils/command-response.util';
import { changeAccount, saveAccount } from '../../services/account.service';
import { checkIfNameAllowed } from '../../utils/name-allowed.util';

import type { BBSSession } from '../../index';

// Dependencies injected from index.ts
let _sessions: Map<string, BBSSession>;

/**
 * Set dependencies for info commands (called from index.ts)
 */
export function setInfoCommandsDependencies(deps: {
  sessions: Map<string, BBSSession>;
}) {
  _sessions = deps.sessions;
}

/**
 * VER Command - Display Version Information
 *
 * From express.e:25688-25699 (internalCommandVER)
 *
 * Original AmiExpress: Displays version string, copyright, and registration key
 * Web version: Shows web implementation details and compatibility info
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleVersionCommand(socket: any, session: BBSSession): void {
  // express.e:25688-25698 internalCommandVER()
  // StringF(tempStr,'\b\nAmiExpress \s (\s) Copyright \xa22018-2023 Darren Coles\b\n\b\n',expressVer,expressDate)
  // WEB_: version string is "AmiExpress-Web <semver>" instead of upstream
  // Darren Coles version. Original Amiga attribution + copyright lines
  // are preserved unchanged from express.e:25692-25694. (Audit C-VER.)
  emitText(socket, '\r\nAmiExpress-Web 5.6.0 (2025-10-23) Copyright \xa92018-2023 Darren Coles\r\n\r\n');
  // express.e:25692-25694
  emitText(socket, 'Original Version:\r\n');
  emitText(socket, '  (C)1989-91 Mike Thomas, Synthetic Technologies\r\n');
  emitText(socket, '  (C)1992-95 Joe Hodge, LightSpeed Technologies Inc.\r\n\r\n');
  // express.e:25696-25697 'Registered to \s.\b\n' - REGKEY (registrationName).
  const { config } = require('../../config');
  const { registrationName } = require('../../services/bbs-config-file.service');
  const registeredTo: string = registrationName(config.get('dataDir'));
  emitText(socket, `Registered to ${registeredTo}.\r\n`);
  // express.e:25698 ENDPROC RESULT_SUCCESS — no press-key, just return
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * WHO Command - Who's Online
 *
 * From express.e:26094-26103 (internalCommandWHO)
 *
 * Original: Calls who(0) to show online users
 * Requires ACS_WHO_IS_ONLINE permission
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleWhoCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:26095
  if (!checkSecurity(session.user, ACSPermission.WHO_IS_ONLINE)) {
    ErrorHandler.permissionDenied(socket, 'view who is online', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Doors');

  // express.e:24217-24218: aePuts('\b\n\b\n') before table (no screen clear)
  for (const line of WHO_TABLE_TOP) emitText(socket, line);

  // Get all online users - express.e:24231-24377
  // WEB_: express.e reads from a shared AmigaOS node list in global memory; on the web
  // platform multi-node session state lives in the Node.js sessions Map, so we enumerate
  // that instead. Displayed columns and row format are 1:1 with express.e:24370-24375.
  const allOnlineUsers = Array.from(_sessions.values())
    .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
    .map(sess => ({
      username: sess.user!.username,
      location: sess.user!.location || '',
      nodeId: sess.nodeId || 0,
      chatEnabled: !(sess.user!.quietNode || false),
      action: _getActivityFromSubState(sess.subState as any)
    }));

  // An FTP caller holds a node from the same pool but has no BBSSession, so
  // he is absent from the map above - a sysop would see a node in use and
  // nobody using it. `ftp-presence` is the registry the FTP wiring keeps for
  // exactly this table.
  for (const caller of ftpCallersOnline()) {
    allOnlineUsers.push({
      username: caller.username,
      location: caller.location,
      nodeId: caller.nodeId,
      // An FTP session has no chat channel to answer on.
      chatEnabled: false,
      action: 'FTP',
    });
  }
  allOnlineUsers.sort((a, b) => a.nodeId - b.nodeId);

  // Output each user row - express.e:24257-24377 format
  allOnlineUsers.forEach(userInfo => {
    // express.e:24370-24375 - Row format
    emitText(socket, whoRow(userInfo.nodeId, userInfo.username, userInfo.location, userInfo.action, userInfo.chatEnabled));
  });

  // express.e:24381-24382 - Table footer
  for (const line of WHO_TABLE_BOTTOM) emitText(socket, line);

  // express.e: who() returns RESULT_SUCCESS — no press-key, main loop sets menuPause:=TRUE
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * WHD Command - Who's Online (Detailed)
 *
 * From express.e:26104-26112 (internalCommandWHD)
 *
 * Original: Calls who(1) to show detailed online user information
 * Requires ACS_WHO_IS_ONLINE permission
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleWhoDetailedCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:26105
  if (!checkSecurity(session.user, ACSPermission.WHO_IS_ONLINE)) {
    ErrorHandler.permissionDenied(socket, 'view who is online', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Doors');

  // express.e:24239-24250 - who(1) is debug mode that prints raw memory pointers
  // WEB_: express.e WHD passes flag=1 to who(), which dumps struct addresses — meaningless
  // on the web platform where there is no shared Amiga memory space. We show a richer
  // per-session detail table instead, preserving the intent (operator visibility) without
  // exposing meaningless pointer values. Multi-node session state lives in the Node.js
  // sessions Map, not in a shared Amiga memory region.
  for (const line of WHO_TABLE_TOP) emitText(socket, line);

  // Get all online users with detailed status
  const detailedOnlineUsers = Array.from(_sessions.values())
    .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
    .map(sess => ({
      username: sess.user!.username,
      location: sess.user!.location || '',
      nodeId: sess.nodeId || 0,
      chatEnabled: !(sess.user!.quietNode || false),
      activity: _getActivityFromSubState(sess.subState as any)
    }));

  // Output each user row using same format as WHO
  detailedOnlineUsers.forEach(userInfo => {
    emitText(socket, whoRow(userInfo.nodeId, userInfo.username, userInfo.location, userInfo.activity, userInfo.chatEnabled));
  });

  // Table footer
  for (const line of WHO_TABLE_BOTTOM) emitText(socket, line);

  // express.e: who(1) returns RESULT_SUCCESS — no press-key
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * W Command - Write User Parameters
 *
 * From express.e:25712-25785+ (internalCommandW)
 *
 * Original: Full-screen interactive menu for editing user configuration
 * Allows editing: name, email, location, password, screen settings, etc.
 * Requires ACS_EDIT_USER_INFO permission
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
/**
 * Helper: Display W command menu (express.e:25727-25773)
 */
const MODEM_OPTIONS = [
  { bps: 0, label: 'MAX (No Throttle)' },
  { bps: 1200, label: '1200 bps' },
  { bps: 2400, label: '2400 bps' },
  { bps: 4800, label: '4800 bps' },
  { bps: 7200, label: '7200 bps' },
  { bps: 9600, label: '9600 bps' },
  { bps: 12000, label: '12.0 kbps' },
  { bps: 14400, label: '14.4 kbps' },
  { bps: 14400, label: 'HST 14.4 kbps' },
  { bps: 16800, label: '16.8 kbps' },
  { bps: 16800, label: 'HST 16.8 kbps' },
  { bps: 19200, label: '19.2 kbps' },
  { bps: 21600, label: '21.6 kbps' },
  { bps: 21600, label: 'HST 21.6 kbps' },
  { bps: 24000, label: '24.0 kbps' },
  { bps: 28800, label: '28.8 kbps' },
  { bps: 33600, label: '33.6 kbps' },
  { bps: 56000, label: '56 kbps' },
];

/**
 * The menu, on the screen the caller actually has.
 *
 * Eighty columns paints as it always did. A C64 has 25 rows and NO
 * SCROLLBACK - "scrollback doesnt work in petscii mode so i cant see all
 * options in w" (the sysop, 2026-09-23) - and the menu is 28 rows before
 * five of them wrap, so it is squeezed to the width and handed out a
 * screenful at a time (`w-menu-pager.ts`). The caller still types the number
 * he wants from any page.
 */
function _displayWCommandMenu(socket: any, session: BBSSession): void {
  const columns = sessionColumns(session);
  if (!isNarrow(session)) {
    _paintWCommandMenu(socket, session);
    return;
  }

  const rows = _collectWCommandMenu(socket, session);
  const height = Math.max(6, (session.screenHeight || 25));
  // One row for the prompt, one for the line the caller types on.
  const page = wMenuPage(rows, columns, height - 2, (session as any).wMenuPage || 1);
  (session as any).wMenuPage = page.page;

  /*
   * A PAGE REPLACES THE ONE BEFORE IT.
   *
   * The whole reason this menu is paged is that a C64 has no scrollback, so
   * printing the next page UNDER the last one leaves the caller looking at
   * the tail of both and the top of neither - which is what the sysop's
   * screenshot shows: options 20-26 three times over, one prompt buried in
   * the middle of them.
   */
  emitText(socket, '\x1b[2J\x1b[H');
  emitText(socket, page.rows.join('\r\n'));
  emitText(socket, '\r\n');
  emitText(socket, wMenuPrompt(page));
}

/**
 * The menu's rows, as they would be painted on an eighty-column screen.
 *
 * Collected rather than re-derived: the menu is built by two hundred and
 * forty `emitText` calls, and a second renderer for the narrow case would be
 * a second source of truth for every row and every value in it. The collector
 * is a prototype proxy carrying a WIDE session, so the buffer does not wrap
 * what the pager is about to squeeze.
 */
function _collectWCommandMenu(socket: any, session: BBSSession): string[] {
  const captured: string[] = [];
  const collector = Object.create(socket);
  // ITS OWN ID, or it shares the caller's output buffer: `getAnsiBuffer` keys
  // by `socket.id`, and the first object to ask owns the buffer - so a shared
  // id would send the page this function is collecting FOR into the
  // collector instead of to the caller.
  collector.id = `${socket.id}:w-menu`;
  collector.session = Object.create(session);
  collector.session.screenWidth = 80;
  collector.session.petsciiMode = false;
  collector.session.texttvMode = false;
  collector.emit = (event: string, data: unknown) => {
    if (event === 'ansi-output' && typeof data === 'string') captured.push(data);
    return true;
  };
  _paintWCommandMenu(collector, session);
  flushOutput(collector);
  releaseAnsiBuffer(collector.id);
  // The prompt is the pager's to write, so the trailing row goes.
  const rows = captured.join('').split('\r\n');
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  if (rows.length && rows[rows.length - 1].includes('Which to change')) rows.pop();
  return rows;
}

/**
 * One W menu row in express.e's bytes (25738-25877): the space after `]`
 * is magenta and there are no resets until the end of the value.
 */
function wRow(num: string, label: string, value: string, valueColour = '\x1b[33m'): string {
  return `\x1b[34m[\x1b[0m${num}\x1b[34m]\x1b[35m ${label} ${valueColour}${value}\x1b[0m\r\n`;
}

/** A YES/NO row: express.e's green YES, white NO (25809-25811, 25858-25860). */
function wYesNo(num: string, label: string, yes: boolean): string {
  return yes ? wRow(num, label, 'YES', '\x1b[32m') : wRow(num, label, 'NO', '\x1b[37m');
}

function _paintWCommandMenu(socket: any, session: BBSSession): void {
  const currentUser = session.user!;
  const modemLabel = (() => {
    const bps = session.modemBps || currentUser.baud || 0;
    if (!bps || bps <= 0) return 'MAX (No Throttle)';
    const found = MODEM_OPTIONS.find(opt => opt.bps === bps);
    if (found) return found.label;
    return `${bps} bps`;
  })();

  // express.e:25730-25732 - exact format with colored asterisks
  emitText(socket, '\r\n');
  const configHeading = '\x1b[34m*\x1b[0m--\x1b[33mUSER CONFIGURATION\x1b[0m--\x1b[34m*\x1b[0m';
  emitText(socket, `${headingIndent(session, 'userConfiguration', configHeading)}${configHeading}\r\n`);
  emitText(socket, '\r\n');

  // Option 0: Login Name - express.e:25724-25728
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_NAME)) {
    emitText(socket, '\x1b[34m[\x1b[0m  0\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wRow('  0', 'LOGIN NAME..............', currentUser.username));
  }

  // Option 1: Email - express.e:25729-25733
  if (!checkSecurity(session.user, ACSPermission.EDIT_EMAIL)) {
    emitText(socket, '\x1b[34m[\x1b[0m  1\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wRow('  1', 'EMAIL ADDRESS...........', currentUser.email || ''));
  }

  // Option 2: Real Name - express.e:25734-25738
  if (!checkSecurity(session.user, ACSPermission.EDIT_REAL_NAME)) {
    emitText(socket, '\x1b[34m[\x1b[0m  2\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wRow('  2', 'REAL NAME...............', currentUser.realname || ''));
  }

  // Option 3: Internet Name - express.e:25739-25743
  if (!checkSecurity(session.user, ACSPermission.EDIT_INTERNET_NAME)) {
    emitText(socket, '\x1b[34m[\x1b[0m  3\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wRow('  3', 'INTERNET NAME...........', currentUser.internetName || ''));
  }

  // Option 4: Location - express.e:25744-25748
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_LOCATION)) {
    emitText(socket, '\x1b[34m[\x1b[0m  4\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    // WEB_: express.e's LOCATION; this board asks callers for their group.
    emitText(socket, wRow('  4', 'GROUP...................', currentUser.location || ''));
  }

  // Option 5: Phone - express.e:25749-25753
  if (!checkSecurity(session.user, ACSPermission.EDIT_PHONE_NUMBER)) {
    emitText(socket, '\x1b[34m[\x1b[0m  5\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wRow('  5', 'PHONE NUMBER............', currentUser.phone || ''));
  }

  // Option 6: Password - express.e:25754-25758
  if (!checkSecurity(session.user, ACSPermission.EDIT_PASSWORD)) {
    emitText(socket, '\x1b[34m[\x1b[0m  6\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wRow('  6', 'PASSWORD................', 'ENCRYPTED', '\x1b[36m'));
  }

  // Option 7: Lines Per Screen - express.e:25759-25760
  const linesPerScreen = currentUser.linesPerScreen || 'Auto';
  emitText(socket, wRow('  7', 'LINES PER SCREEN........', linesPerScreen.toString()));

  // Option 8: Computer - express.e:25761-25767
  emitText(socket, wRow('  8', 'COMPUTER................', currentUser.computer || ''));

  // Option 9: Screen Type - express.e:25768-25774
  emitText(socket, wRow('  9', 'SCREEN TYPE.............', currentUser.screenType || ''));

  // Option 10: Screen Clear - express.e:25775-25779
  // express.e:25808-25812 — userFlags AND USER_SCRNCLR (bit 8)
  emitText(socket, wYesNo(' 10', 'SCREEN CLEAR............', !!((currentUser.userFlags || 0) & 8)));

  // Option 11: Transfer Protocol - express.e:25780-25790
  if (!checkSecurity(session.user, ACSPermission.XPR_SEND) && !checkSecurity(session.user, ACSPermission.XPR_RECEIVE)) {
    emitText(socket, '\x1b[34m[\x1b[0m 11\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    const { PROTOCOL_DISPLAY_NAMES } = require('../../types');
    const userProtocol = currentUser.protocol || 'zmodem';
    const protocolName = PROTOCOL_DISPLAY_NAMES[userProtocol] || userProtocol.toUpperCase();
    emitText(socket, wRow(' 11', 'TRANSFER PROTOCOL.......', protocolName));
  }

  // Option 12: Editor Type - express.e:25791-25800
  if (!checkSecurity(session.user, ACSPermission.FULL_EDIT)) {
    emitText(socket, '\x1b[34m[\x1b[0m 12\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    // WEB_: express.e 25829-25838 builds this row for a caller with
    // ACS_FULL_EDIT and never prints it (no aePuts) - the Amiga's menu skips
    // from 11 to 13. Shown here on purpose (sysop decision 2026-10-05).
    // From `editor`, the column that is actually stored - 'Prompt', 'Line'
    // or 'Full', the same three the disk record encodes
    // (UserFileManager.editorTypeToInt). `editorType` is a runtime-only
    // number with no column behind it, so reading it here showed PROMPT to
    // everyone whatever they had chosen.
    const editorName = EDITOR_DISPLAY[editorValue(currentUser)] ?? 'PROMPT';

    emitText(socket, wRow(' 12', 'EDITOR TYPE.............', editorName));
  }

  // Option 13: Zoom Type - express.e:25801-25808
  if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
    emitText(socket, '\x1b[34m[\x1b[0m 13\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    const zoomType = currentUser.zoomType || 0;
    const zoomName = zoomType === 1 ? 'ASCII' : 'QWK';

    emitText(socket, wRow(' 13', 'ZOOM TYPE...............', zoomName));
  }

  // Option 14: Available for Chat/OLM - express.e:25809-25816
  if (!checkSecurity(session.user, ACSPermission.OLM)) {
    emitText(socket, '\x1b[34m[\x1b[0m 14\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, wYesNo(' 14', 'AVAILABLE FOR CHAT/OLM..', !!currentUser.availableForChat));
  }

  // Option 15: Translator - express.e:25867-25870, no ELSE: nothing when denied
  if (checkSecurity(session.user, ACSPermission.TRANSLATION)) {
    emitText(socket, wRow(' 15', 'TRANSLATOR..............', translationService.getUserLanguage(currentUser.id)));
  }

  // Option 16: Background File Check — express.e:25872-25879
  // express.e gates display on Node tooltype BGFILECHECK existing AND
  // FORCE_BGFILECHECK NOT existing; web has no per-node tooltype gating
  // (no bg checker process runs), so we always show the toggle so the user
  // can persist their preference. Bit is USER_BGFILECHECK from axconsts.e:71.
  // WEB_: dropped Node BGFILECHECK / FORCE_BGFILECHECK tooltype gates;
  //       feature is preference-only in web until a bg-check service exists.
  {
    const { UserFlag } = require('../../constants/express-flags');
    const bgfc = (currentUser.userFlags || 0) & UserFlag.BGFILECHECK;
    // express.e:25875 [32mYES[0m / express.e:25877 [37mNO[0m
    emitText(socket, wYesNo(' 16', 'BACKGROUND FILE CHECK...', !!bgfc));
  }

  // WEB_: MODERN_* — option 17: modem emulation speed throttle, no express.e counterpart; web terminal setting
  emitText(socket, wRow(' 17', 'MODEM EMULATION SPEED..', modemLabel));

  // WEB_: MODERN_* — option 18: terminal font selection, no express.e counterpart; web terminal setting
  const userFont = sessionWantsPetscii(session)
    ? 'C64 CHARACTER SET'
    : currentUser.fontPreference || DEFAULT_TERMINAL_FONT;
  emitText(socket, wRow(' 18', 'TERMINAL FONT..........', userFont));

  // WEB_: Phase 3 GDPR self-service — see thoughts/shared/plans/
  // 2026-04-24-gdpr-hobby-baseline.md. No express.e counterpart.
  emitText(socket, wRow(' 19', 'VIEW MY DATA (GDPR)....', 'print a copy of your record'));

  emitText(socket, wRow(' 20', 'DELETE MY ACCOUNT......', 'erase your data (GDPR)', '\x1b[31m'));

  // WEB_: the PETSCII palette. Only the 80-column screen has a choice - a C64
  // is a VIC-II by construction - but the row is shown either way so a caller
  // can set it before he next answers P8, and it says which screen it governs.
  {
    const vdc = session.user?.petsciiPalette !== 'vic';
    emitText(socket, wRow(' 21', 'PETSCII 80 COLOURS.....', vdc ? 'C128 (VDC)' : 'C64 (VIC-II)'));
  }

  // WEB_: the PETSCII CHARACTER SET. A C64 sold in Sweden shipped ROM
  // 325018-02, which puts a-ring and the umlauts where the bracket/pound trio
  // sits - without it a Swedish caller cannot type their own name. Standard
  // unless asked for, because $5C is the pound sign this board's MCI uses for
  // its column tab.
  {
    const swedish = session.user?.petsciiCharset === 'swedish';
    emitText(socket, wRow(' 22', 'PETSCII CHARACTER SET..', swedish ? 'SWEDISH' : 'STANDARD'));
  }

  // WEB_: DOORS THAT REGISTER THEMSELVES AS SETTINGS. A door that exists to
  // change what the board does for this caller belongs in the list he already
  // opens to change such things, rather than behind a command name he has to
  // know. It declares `SETTINGS=YES` in its own .info; nothing here knows any
  // door by name. See commands/w-settings-doors.ts.
  for (const [index, entry] of settingsDoorEntries(session).entries()) {
    const number = String(FIRST_SETTINGS_DOOR_OPTION + index).padStart(3, ' ');
    emitText(socket, wRow(number, `${entry.label.toUpperCase()}${'.'.repeat(Math.max(1, 23 - entry.label.length))}`, entry.command));
  }

  emitText(socket, '\r\n');
  emitText(socket, 'Which to change <CR>=QUIT ? ');
}

/** The first W option number a registered settings door can take. */
export const FIRST_SETTINGS_DOOR_OPTION = 23;

/** The settings doors this caller may open, from the board's own door list. */
export function settingsDoorEntries(session: BBSSession): SettingsDoorEntry[] {
  const { getDoors } = require('../command-handler/dependency-injection');
  return settingsDoorsFor(getDoors(), session as never);
}

/**
 * W Command - Write User Parameters (edit user configuration)
 * express.e:25712-26092
 */
export function handleWriteUserParamsCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:25717
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_INFO)) {
    ErrorHandler.permissionDenied(socket, 'edit user information', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

console.log('[ENV] Stats');

  // Display menu and wait for option selection
  session.cmdShortcuts = false;
  if ((session as any).shortcuts && typeof (session as any).shortcuts.clear === 'function') {
    (session as any).shortcuts.clear();
  }
  session.inputBuffer = '';
  // Abort any lingering pagination/pause so W behaves like express.e lineInput
  session.paginatedScreen = undefined;
  session.menuPause = false;
  session.lastScreenHadPause = false;
  session.queuedScreenCommands = [];
  session.pendingScreenCommand = undefined;
  session.screenCommandResolver = null;
  // A fresh `W` opens at the top, whatever page the last visit ended on.
  (session as any).wMenuPage = 1;
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * W Command Input Handlers - express.e:25712-26092
 */

/**
 * Handle W option selection input (express.e:25832)
 */
/** W 11's choices, in the order they are numbered (xprTitle). */
const PROTOCOL_CHOICES = ['zmodem', 'ymodem', 'xmodem-1k', 'xmodem-crc', 'xmodem', 'punter', 'websocket'] as const;

const CHOOSE_PROTOCOL = '\r\nChoose protocol: ';

/**
 * express.e chooseProtocol (11371-11378): `n> title` per protocol, then
 * "Choose protocol: ". The titles fit 40 columns as they are.
 */
export function buildProtocolMenuLines(): string[] {
  const { PROTOCOL_DISPLAY_NAMES } = require('../../types');
  return [
    ...PROTOCOL_CHOICES.map((p, i) => `${i + 1}> ${PROTOCOL_DISPLAY_NAMES[p]}\r\n`),
    CHOOSE_PROTOCOL,
  ];
}

export async function handleWOptionSelectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // CR/empty = quit (express.e:25836-25840)
  if (trimmed === '') {
    emitText(socket, '\r\n');
    // express.e:25891-25893: leaving W saves the account. The options changed
    // it in memory only.
    if (session.user) await saveAccount(session.user);
    session.inputBuffer = '';
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    const { displayMainMenu } = require('../command-handler/menu');
    await displayMainMenu(socket, session, false);
    return;
  }

  // A page step is not an option: it is how a caller on a screen that does
  // not scroll reaches the rows the first screenful could not hold.
  const step = wMenuPageStep(trimmed);
  if (step !== null) {
    (session as any).wMenuPage = Math.max(1, ((session as any).wMenuPage || 1) + step);
    _displayWCommandMenu(socket, session);
    return;
  }

  // express.e:25899 option:=Val(str) - a word is 0, LOGIN NAME.
  const option = parseInt(trimmed, 10) || 0;

  // 18 = last express.e/web-extension option, 19/20 = GDPR, 21 = the PETSCII
  // palette, 22 = the PETSCII character set, and from
  // FIRST_SETTINGS_DOOR_OPTION up are the doors that
  // registered themselves as settings.
  const settingsDoors = settingsDoorEntries(session);
  const lastOption = FIRST_SETTINGS_DOOR_OPTION + settingsDoors.length - 1;
  if (option < 0 || option > lastOption) {
    // express.e:25897's line break, then the loop top's (25730).
    emitText(socket, '\r\n');
    _displayWCommandMenu(socket, session);
    return;
  }

  if (option >= FIRST_SETTINGS_DOOR_OPTION) {
    const entry = settingsDoors[option - FIRST_SETTINGS_DOOR_OPTION];
    emitText(socket, '\r\n');
    const { executeDoor } = require('../door.handler');
    // The door owns the screen while it runs; when it returns, the caller is
    // back where he chose it from, with whatever he changed already shown.
    await executeDoor(socket, session, entry.door as never);
    if (session.subState === LoggedOnSubState.W_OPTION_SELECT) {
      _displayWCommandMenu(socket, session);
    }
    return;
  }

  emitText(socket, '\r\n');

  // Handle each option (express.e:25846-26028)
  switch (option) {
    case 0: // Edit Username - express.e:25903-25928
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      await wEditAName(socket, session, 0);
      _displayWCommandMenu(socket, session);
      session.subState = LoggedOnSubState.W_OPTION_SELECT;
      break;

    case 1: // Edit Email - express.e:25874-25882
      if (!checkSecurity(session.user, ACSPermission.EDIT_EMAIL)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Email Address: ');
      session.subState = LoggedOnSubState.W_EDIT_EMAIL;
      break;

    case 2: // Edit Real Name - express.e:25938-25960
      if (!checkSecurity(session.user, ACSPermission.EDIT_REAL_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      await wEditAName(socket, session, 2);
      _displayWCommandMenu(socket, session);
      session.subState = LoggedOnSubState.W_OPTION_SELECT;
      break;

    case 3: // Edit Internet Name - express.e:25961-25981
      if (!checkSecurity(session.user, ACSPermission.EDIT_INTERNET_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      await wEditAName(socket, session, 3);
      _displayWCommandMenu(socket, session);
      session.subState = LoggedOnSubState.W_OPTION_SELECT;
      break;

    case 4: // Edit Location - express.e:25927-25935
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_LOCATION)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Group: '); // WEB_: express.e:25993 'From: '
      session.subState = LoggedOnSubState.W_EDIT_LOCATION;
      break;

    case 5: // Edit Phone - express.e:25936-25944
      if (!checkSecurity(session.user, ACSPermission.EDIT_PHONE_NUMBER)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Phone: ');
      session.subState = LoggedOnSubState.W_EDIT_PHONE;
      break;

    case 6: // Edit Password - express.e:25945-25975
      if (!checkSecurity(session.user, ACSPermission.EDIT_PASSWORD)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Enter New Password: ');
      session.subState = LoggedOnSubState.W_EDIT_PASSWORD;
      break;

    case 7: // Edit Lines Per Screen - express.e:26032-26037, numberOfLinesTest
      emitText(socket, linesCountdown() + LINES_PROMPT);
      session.subState = LoggedOnSubState.W_EDIT_LINES;
      break;

    case 8: // Edit Computer - express.e:26038-26044, chooseComputer() express.e:11319-11346
      await _displayComputerList(socket, session);
      break;

    case 9: // Edit Screen Type - express.e:26045-26051, chooseScreenType() express.e:11348-11368
      await _displayScreenTypeList(socket, session);
      break;

    case 10: // Toggle Screen Clear — express.e:25993: userFlags EOR USER_SCRNCLR (bit 8)
      { const SCRNCLR = 8;
        session.user.userFlags = (session.user.userFlags || 0) ^ SCRNCLR;
        await changeAccount(session, { userFlags: session.user.userFlags });
        _displayWCommandMenu(socket, session); }
      break;

    case 11: // Edit Transfer Protocol - express.e:25995-26002
      if (!checkSecurity(session.user, ACSPermission.XPR_SEND) && !checkSecurity(session.user, ACSPermission.XPR_RECEIVE)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      // Display protocol selection menu
      for (const chunk of buildProtocolMenuLines()) {
        emitText(socket, chunk);
      }
      session.subState = LoggedOnSubState.W_EDIT_PROTOCOL;
      break;

    case 12: // Toggle Editor Type - express.e:26003-26006
      if (!checkSecurity(session.user, ACSPermission.FULL_EDIT)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      // `editor`, not `editorType`. There is no editortype column:
      // fieldToColumn falls back to the lower-cased field name, so this
      // UPDATE named a column that does not exist, SQLite threw, and the W
      // command answered "[ERROR] Command processing failed" - reported from
      // the board on 2026-09-01. The setting had never persisted either.
      const nextEditor = EDITOR_ORDER[(EDITOR_ORDER.indexOf(editorValue(session.user)) + 1) % EDITOR_ORDER.length];
      session.user.editor = nextEditor;
      session.user.editorType = EDITOR_ORDER.indexOf(nextEditor);
      await changeAccount(session, { editor: nextEditor });
      _displayWCommandMenu(socket, session);
      break;

    case 13: // Toggle Zoom Type - express.e:26007-26010
      if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      const currentZoom = session.user.zoomType || 0;
      session.user.zoomType = (currentZoom + 1) & 1; // Toggle between 0 and 1
      await changeAccount(session, { zoomType: session.user.zoomType });
      _displayWCommandMenu(socket, session);
      break;

    case 14: // Toggle Available for Chat/OLM - express.e:26011-26014
      if (!checkSecurity(session.user, ACSPermission.OLM)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      session.user.availableForChat = !session.user.availableForChat;
      await changeAccount(session, { availableForChat: session.user.availableForChat });
      _displayWCommandMenu(socket, session);
      break;

    case 15: // Edit Translator — express.e:26081-26082 chooseTranslator()
      // WEB_: chooseTranslator() loops through configured translator
      //       library files (TR_*.library); web has no translator system,
      //       userLanguage is fixed at 'English'. Prompt + accept-input is
      //       kept for parity with express.e flow, but selection is a no-op.
      if (!checkSecurity(session.user, ACSPermission.TRANSLATION)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Translator: ');
      session.subState = LoggedOnSubState.W_EDIT_TRANSLATOR;
      break;

    case 16: // Toggle Background File Check — express.e:26083-26087
      // express.e: loggedOnUserKeys.userFlags := Eor(loggedOnUserKeys.userFlags, USER_BGFILECHECK)
      // Web version has no Node BGFILECHECK / FORCE_BGFILECHECK tooltype gating
      // (the bg-checker thread doesn't run server-side), so we always allow
      // the toggle so user preference round-trips through the menu.
      {
        const { UserFlag } = require('../../constants/express-flags');
        session.user.userFlags = (session.user.userFlags || 0) ^ UserFlag.BGFILECHECK;
        await changeAccount(session, { userFlags: session.user.userFlags });
        _displayWCommandMenu(socket, session);
      }
      break;

    case 17: // WEB_: MODERN_* — modem emulation speed; no express.e:25712-26092 counterpart
      emitText(socket, '\r\nSelect Modem Speed:\r\n');
      MODEM_OPTIONS.forEach((opt, idx) => {
        emitText(socket, `[${idx}] ${opt.label}\r\n`);
      });
      emitText(socket, `Select (0-${MODEM_OPTIONS.length - 1}) or <CR>=Cancel: `);
      session.subState = LoggedOnSubState.W_EDIT_MODEM_SPEED;
      break;

    case 18: // WEB_: MODERN_* — terminal font selection; no express.e:25712-26092 counterpart
      if (sessionWantsPetscii(session)) {
        emitText(socket, `\r\n${PETSCII_FONT_IS_FIXED}\r\n`);
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, '\r\nSelect Terminal Font:\r\n');
      emitText(socket, '\r\n');
      {
        const rows: string[] = fontMenuRows();
        for (const row of rows) emitText(socket, AnsiUtil.colorize(row.slice(0, row.indexOf(']') + 1), 'blue') + row.slice(row.indexOf(']') + 1) + '\r\n');
        emitText(socket, '\r\n');
        emitText(socket, `Select (1-${rows.length}) or <CR>=Cancel: `);
      }
      session.subState = LoggedOnSubState.W_EDIT_FONT;
      break;

    case 19: { // WEB_ GDPR view-my-data (Phase 3 plan)
      const { handleViewMyDataOption } = require('../user/gdpr.handler');
      await handleViewMyDataOption(socket, session);
      break;
    }

    case 20: { // WEB_ GDPR delete-my-account (Phase 3 plan)
      const { startForgetMe } = require('../user/gdpr.handler');
      startForgetMe(socket, session);
      break;
    }

    case 21: { // WEB_ which sixteen colours his 80-column PETSCII screen uses
      const { db } = require('../../database');
      const next = session.user?.petsciiPalette === 'vic' ? 'vdc' : 'vic';
      if (session.user) {
        try {
          await changeAccount(session, { petsciiPalette: next });
          session.user.petsciiPalette = next;
        } catch (error) {
console.error('[W] could not save the PETSCII palette:', error);
        }
      }
      // The canvas repaints from the machine it already has.
      socket.emit('petscii-palette', { palette: next });
      _displayWCommandMenu(socket, session);
      return;
    }

    case 22: { // WEB_ which character ROM his PETSCII screen draws
      const { db } = require('../../database');
      const next = session.user?.petsciiCharset === 'swedish' ? 'standard' : 'swedish';
      if (session.user) {
        try {
          await changeAccount(session, { petsciiCharset: next });
          session.user.petsciiCharset = next;
        } catch (error) {
console.error('[W] could not save the PETSCII character set:', error);
        }
      }
      (session as any).petsciiSwedish = next === 'swedish';
      // The atlas is rebuilt from the new set; the screen's machine is untouched.
      socket.emit('petscii-charset', { charset: next });
      emitText(socket, AnsiUtil.colorize(
        next === 'swedish'
          ? 'PETSCII character set: SWEDISH - \u00e5\u00e4\u00f6 where [ \u00a3 ] were\r\n'
          : 'PETSCII character set: STANDARD\r\n',
        'yellow'));
      _displayWCommandMenu(socket, session);
      return;
    }

    default:
      _displayWCommandMenu(socket, session);
  }
}

/**
 * W rows 0, 2 and 3 - express.e:25903-25981. The field's current value is
 * lineInput's default, so Enter alone keeps it (the name typed again is the
 * `cant` jump back to the menu); anything else says "Checking for duplicate
 * name...", and a wildcard or a name another account holds goes back to the
 * row's own prompt. Only LOGIN NAME saves at once (25928): the name is how
 * the account is found again. Row 3 compares with the REAL name, as express
 * does (25967).
 */
const W_NAME_ROWS = {
  0: { prompt: 'Name: ', keep: 31, maxLen: 30, type: 'username' },
  2: { prompt: 'Real Name: (Alpha Numeric) ', keep: 26, maxLen: 25, type: 'realname' },
  3: { prompt: 'Internet Name: (Alpha Numeric No Spaces) ', keep: 10, maxLen: 9, type: 'internetname' },
} as const;

async function wEditAName(socket: any, session: BBSSession, row: keyof typeof W_NAME_ROWS): Promise<void> {
  const { lineInput } = require('../../utils/await-input');
  const { checkForAst, findUserFromName, useWildcards } = require('../message/msg-names');
  const spec = W_NAME_ROWS[row];
  const wildcards = useWildcards(session);
  const current = row === 0 ? session.user.username : row === 2 ? session.user.realname : session.user.internetName;
  for (;;) {
    emitText(socket, spec.prompt);
    const str: string = await lineInput(socket, session, spec.maxLen, String(current || '').slice(0, spec.keep));
    const same = row === 0 ? session.user.username : session.user.realname;
    if (str.toLowerCase() === String(same || '').toLowerCase()) return;
    if (row === 0) {
      const refused = checkIfNameAllowed(str);
      if (refused) { emitText(socket, `${refused}\r\n\r\n`); continue; }
    }
    emitText(socket, '\r\nChecking for duplicate name...');
    if (checkForAst(str, wildcards)) {
      emitText(socket, 'No wildcards allowed in a name.\r\n\r\n');
      continue;
    }
    if (findUserFromName(1, spec.type, str, wildcards) !== 0) {
      emitText(socket, 'Already in use!, try another.\r\n\r\n');
      continue;
    }
    emitText(socket, 'Ok!\r\n');
    if (row === 0) {
      await changeAccount(session, { username: str });
      await saveAccount(session.user);
    } else if (row === 2) {
      await changeAccount(session, { realname: str });
    } else {
      await changeAccount(session, { internetName: str });
    }
    return;
  }
}

/**
 * Handle edit email input - express.e:25874-25882
 */
export async function handleWEditEmailInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.email = trimmed;
  await changeAccount(session, { email: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit location input - express.e:25927-25935
 */
export async function handleWEditLocationInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.location = trimmed;
  await changeAccount(session, { location: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit phone input - express.e:25936-25944
 */
export async function handleWEditPhoneInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.phone = trimmed;
  await changeAccount(session, { phone: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit password input - express.e:25945-25975
 */
export function handleWEditPasswordInput(socket: any, session: BBSSession, input: string): void {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Store password temporarily and ask for confirmation
  session.tempData = { newPassword: trimmed };
  // express.e:26008 - straight after getPass2's own line break.
  emitText(socket, 'Reenter New Password: ');
  session.subState = LoggedOnSubState.W_EDIT_PASSWORD_CONFIRM;
}

/**
 * Handle password confirmation input - express.e:25953-25974
 */
export async function handleWEditPasswordConfirmInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  const originalPassword = session.tempData?.newPassword || '';

  // express.e:26009-26010: IF(StrLen(str2)=0) THEN JUMP cant — silent cancel, no message
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }

  // express.e:26012-26029: IF StrCmp(str,str2) ... ELSE '\b\nPasswords do not match, changes not saved' Delay(60)
  if (trimmed !== originalPassword) {
    emitText(socket, '\r\nPasswords do not match, changes not saved');
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }

  // express.e:26013-26024: checkPasswordStrength before saving
  let minLen = 0, minStrength = 0;
  try {
    // bbsConfig.info is the source: the admin writes disk, and the mirror
    // has already diverged here - disk MIN_PASSWORD_STRENGTH=0 against a
    // database 1, so the admin showed "no check" while this enforced 1.
    const sysConf = getBoardConfig(appConfig.get('dataDir'));
    minLen = sysConf.min_password_length ?? 0;
    minStrength = sysConf.min_password_strength ?? 0;
  } catch (_) { /* use defaults */ }

  if (minLen > 0 && trimmed.length < minLen) {
    // express.e:26016: '\b\nPassword length must be at least \d chars, changes not saved' (no trailing \n)
    emitText(socket, `\r\nPassword length must be at least ${minLen} chars, changes not saved`);
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }
  if (minStrength > 0) {
    let lower = 0, upper = 0, num = 0, sym = 0;
    for (const c of trimmed) {
      const code = c.charCodeAt(0);
      if (code >= 48 && code <= 57) num = 1;
      else if (code >= 65 && code <= 90) upper = 1;
      else if (code >= 97 && code <= 122) lower = 1;
      else sym = 1;
    }
    if (lower + upper + num + sym < Math.min(minStrength, 4)) {
      // express.e:26021: '\b\nPassword must have at least \d of these:\b\n  upper case,lower case, numeric and symbols - changes not saved' (no trailing \n)
      emitText(socket, `\r\nPassword must have at least ${minStrength} of these:\r\n  upper case,lower case, numeric and symbols - changes not saved`);
      _displayWCommandMenu(socket, session);
      session.subState = LoggedOnSubState.W_OPTION_SELECT;
      session.tempData = {};
      return;
    }
  }

  // express.e:26025-26026: setNewPassword() + pwdLastUpdated:=getSystemTime() — no "success" message
  const hashedPassword = await bcrypt.hash(trimmed, 10);
  session.user.password = hashedPassword;
  await changeAccount(session, { passwordHash: hashedPassword });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
  session.tempData = {};
}

/**
 * Handle edit lines per screen input - express.e:25976-25980
 */
export async function handleWEditLinesInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // express.e:11310: an empty answer changes nothing.
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Val (11311): leading digits, else 0. Out of 0-255 the test fails and
  // case 7's REPEAT runs it again - no error text (11313, 26034-26037).
  const lines = parseInt(trimmed, 10) || 0;
  if (lines < 0 || lines > 255) {
    emitText(socket, linesCountdown() + LINES_PROMPT);
    return;
  }

  // 0/Auto resolves to the height the session measured, the same as the signup
  // line test - not null. A stored null read back as the default 23 (one row
  // short), so the runtime W command had the same off-by-one the signup Auto
  // did (the sysop, 2026-09-16). See auto-lines.util.
  session.user.linesPerScreen = lines > 0 ? lines : autoLinesFor(session);
  await changeAccount(session, { linesPerScreen: session.user.linesPerScreen });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Display numbered computer list and prompt (chooseComputer - express.e:11319-11346)
 * Two-column layout: \d[2]> \l\s[34]
 */
/**
 * The three editors, in the order W cycles them, spelled the way the `editor`
 * column and the disk record spell them (UserFileManager.editorTypeToInt).
 */
const EDITOR_ORDER: string[] = ['Prompt', 'Line', 'Full'];
const EDITOR_DISPLAY: Record<string, string> = {
  Prompt: 'PROMPT',
  Line: 'LINE EDITOR',
  Full: 'FULLSCREEN EDITOR',
};

/** A user's editor as one of EDITOR_ORDER, whatever the record carries. */
function editorValue(user: { editor?: string; editorType?: number }): string {
  if (user.editor && EDITOR_ORDER.includes(user.editor)) return user.editor;
  // A session that only carries the runtime number still answers correctly.
  return EDITOR_ORDER[user.editorType ?? 0] ?? EDITOR_ORDER[0];
}

async function _displayComputerList(socket: any, session: BBSSession): Promise<void> {
  // The one list and layout sign-up uses too (utils/computer-types.util).
  const { computerTypeChoices, computerTypeRows } = require('../../utils/computer-types.util');
  const choices: string[] = await computerTypeChoices(db);
  for (const row of computerTypeRows(choices, session)) emitText(socket, row);
  emitText(socket, '\r\n');

  // express.e:11337 - aePuts('Choose computer type: ')
  emitText(socket, 'Choose computer type: ');

  session.tempData = session.tempData || {};
  session.tempData.computerChoices = choices;
  session.subState = LoggedOnSubState.W_EDIT_COMPUTER;
}

/**
 * Display numbered screen type list and prompt (chooseScreenType - express.e:11348-11368)
 * Single-column layout: \d> \l\s
 */
async function _displayScreenTypeList(socket: any, session: BBSSession): Promise<void> {
  let choices: string[] = [];

  // ScreenTypes.info first, for the same reason as the computer list above:
  // W offered "1> Commodore PETSCII  2> Web" on a board whose file and admin
  // page both list four, because only those two had database rows.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ScreenConfigService } = require('../../services/config-services/screen-config.service');
    const records = await new ScreenConfigService(db).getAllScreenTypes();
    if (Array.isArray(records) && records.length > 0) {
      choices = records
        .filter((c: any) => c.enabled !== false)
        .sort((a: any, b: any) => a.screen_number - b.screen_number)
        .map((c: any) => c.screen_title || c.screen_type);
    }
  } catch (_e) { /* fall through to defaults */ }

  if (choices.length === 0) {
    choices = ['ANSI', 'ASCII', 'Amiga ANSI', 'VT100', 'RIP'];
  }

  // express.e:11353-11356 - FOR stat:=1 TO screenTypeTitle.count() single-column
  for (let i = 0; i < choices.length; i++) {
    emitText(socket, `${i + 1}> ${choices[i]}\r\n`);
  }

  // express.e:11359 - aePuts('\b\nChoose screen type: ')
  emitText(socket, '\r\nChoose screen type: ');

  session.tempData = session.tempData || {};
  session.tempData.screenTypeChoices = choices;
  session.subState = LoggedOnSubState.W_EDIT_SCREENTYPE;
}

/**
 * Handle edit computer input - express.e:25981-25986
 */
export async function handleWEditComputerInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:11336-11345 (chooseComputer jLoop6)
  // Accepts a 1-based number from the list, or empty to cancel
  const trimmed = input.trim();

  if (trimmed === '') {
    // Empty = cancel - express.e:11340 IF(StrLen(tempStr)=0) THEN RETURN RESULT_SUCCESS
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choices: string[] = session.tempData?.computerChoices || [];
  const num = parseInt(trimmed, 10);

  if (isNaN(num) || num < 1 || num > choices.length) {
    // Invalid - re-prompt loop (express.e:11342 IF((stat <= 0) OR (stat > computerTypes.count())) THEN JUMP jLoop6)
    await _displayComputerList(socket, session);
    return;
  }

  // express.e:11344 loggedOnUser.secBulletin:=stat-1
  const selectedName = choices[num - 1];
  session.user.computer = selectedName;
  await changeAccount(session, { computer: selectedName });

  if (session.tempData) delete session.tempData.computerChoices;

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit screen type input - express.e:25987-25992
 */
export async function handleWEditScreentypeInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:11358-11367 (chooseScreenType stLoop5)
  // Accepts a 1-based number from the list, or empty to cancel
  const trimmed = input.trim();

  if (trimmed === '') {
    // Empty = cancel - express.e:11362 IF(StrLen(tempStr)=0) THEN RETURN RESULT_SUCCESS
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choices: string[] = session.tempData?.screenTypeChoices || [];
  const num = parseInt(trimmed, 10);

  if (isNaN(num) || num < 1 || num > choices.length) {
    // Invalid - re-prompt loop (express.e:11364 IF((stat <= 0) OR (stat > screenTypeTitle.count())) THEN JUMP stLoop5)
    await _displayScreenTypeList(socket, session);
    return;
  }

  // express.e:11366 loggedOnUser.screenType:=stat-1
  const selectedName = choices[num - 1];
  session.user.screenType = selectedName;
  await changeAccount(session, { screenType: selectedName });

  if (session.tempData) delete session.tempData.screenTypeChoices;

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit transfer protocol input - express.e:25995-26002
 */
export async function handleWEditProtocolInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // express.e:11383-11386: Val; outside 1..count asks again, no text.
  const selectedProtocol = PROTOCOL_CHOICES[(parseInt(trimmed, 10) || 0) - 1];
  if (!selectedProtocol) {
    emitText(socket, CHOOSE_PROTOCOL);
    return;
  }

  // Update user protocol
  session.user.protocol = selectedProtocol;
  await changeAccount(session, { protocol: selectedProtocol });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit translator input - express.e:26015-26019
 */
export async function handleWEditTranslatorInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // For web version, translator is always English, just acknowledge
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

// WEB_: MODERN_* — modem emulation speed input handler; no express.e counterpart
export async function handleWEditModemSpeedInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choice = parseInt(trimmed, 10);
  if (isNaN(choice) || choice < 0 || choice >= MODEM_OPTIONS.length) {
    emitText(socket, `\r\nInvalid selection. Use 0-${MODEM_OPTIONS.length - 1}.\r\n`);
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const bps = MODEM_OPTIONS[choice].bps;
  session.modemBps = bps;
  session.modemEmulationEnabled = bps > 0;
  await changeAccount(session, { baud: bps });
  session.user.baud = bps;

  // Update modem emulator with new baud rate
  const { getModemEmulator } = require('../../utils/modem-emulator.util');
  const modemEmulator = getModemEmulator(socket);
  // Ensure modem emulator is installed (might not be if user started with baud=0)
  modemEmulator.install();
  if (bps > 0) {
    modemEmulator.enable(bps);
console.log(`[W Command] Modem emulation set to ${bps} bps`);
  } else {
    modemEmulator.disable();
console.log(`[W Command] Modem emulation disabled (full speed)`);
  }

  // Tell the browser the speed: above 0 it stands aside for the server pacer
  // Also track in session so doors can query it via bbs.getModemSpeed()
console.log(`[W Command] Emitting modem-speed event with bps=${bps}`);
  (session as any).modemSpeed = bps;
  socket.emit('modem-speed', bps);
console.log(`[W Command] modem-speed event emitted`);

  // Disable AnsiBuffer batching when modem emulation is enabled
  const { getAnsiBuffer } = require('../../utils/ansi-buffer.util');
  const ansiBuffer = getAnsiBuffer(socket);
  ansiBuffer.setFlushDelay(bps > 0 ? 0 : 16);

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

// WEB_: MODERN_* — terminal font selection input handler; no express.e counterpart
export async function handleWEditFontInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const selectedFont: string | null = fontForChoice(trimmed);
  if (!selectedFont) {
    emitText(socket, `\r\nInvalid selection. Use 1-${fontMenuRows().length}.\r\n`);
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // The one path the user stats menu takes too: saved, and on the screen now.
  const result = await chooseTerminalFont(socket, session, selectedFont);
  emitText(socket, result === 'set' ? `\r\nFont set to: ${selectedFont}\r\n` : `\r\n${PETSCII_FONT_IS_FIXED}\r\n`);

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Helper: Determine user activity from substate
 */
function _getActivityFromSubState(subState: string): string {
  // Map substates to human-readable activities
  const activityMap: { [key: string]: string } = {
    'DISPLAY_MENU': 'Main Menu',
    'DISPLAY_CONF_BULL': 'Reading Bulletin',
    'READ_COMMAND': 'Command Input',
    'READ_SHORTCUTS': 'Command Input',
    'POST_MESSAGE_SUBJECT': 'Posting Message',
    'CONFERENCE_SELECT': 'Joining Conference',
    'FILE_LIST': 'Browsing Files',
    'FILE_AREA_SELECT': 'File Area Select',
    'DOOR_RUNNING': 'Running Door',
    'CHAT_MODE': 'Chatting',
    'UNKNOWN': 'Idle'
  };

  return activityMap[subState] || 'Active';
}
