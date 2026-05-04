/**
 * Utility Commands Handler
 *
 * Implements miscellaneous utility commands as 1:1 ports from express.e:
 * - RL (Relogon) - Disconnect and return to login - express.e:25534-25539
 * - V (View File) - View a text file - express.e:25675-25687
 * - VS (View Statistics) - Alias for V command - express.e:28376
 * - Z (Zippy Search) - Search file descriptions - express.e:26123-26213
 * - ZOOM (Zoo Mail) - Download offline mail package - express.e:26215-26240
 * - ^ (Help Files) - View help files - express.e:25089-25111
 */

import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import path from 'path';
import fs from 'fs';
import { formatDateSlash } from '../../utils/date-format.util';

import type { BBSSession } from '../../index';

// Dependencies injected from index.ts
let _handleGoodbyeCommand: (socket: any, session: BBSSession, params?: string) => void;
let _messages: any[] = [];
let _confScreenDir: string;
let _findSecurityScreen: (screenDirAndName: string, userSecLevel?: number, userScreenTypeExt?: string | null, ripMode?: boolean, defScreens?: boolean) => string | null;
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => boolean;
let _searchFileDescriptions: (searchPattern: string, conferenceId: number) => Promise<any[]>;

/**
 * Set dependencies for utility commands (called from index.ts)
 */
export function setUtilityCommandsDependencies(deps: {
  handleGoodbyeCommand: typeof _handleGoodbyeCommand;
  messages: any[];
  confScreenDir: string;
  findSecurityScreen: typeof _findSecurityScreen;
  displayScreen: typeof _displayScreen;
  searchFileDescriptions: typeof _searchFileDescriptions;
}) {
  _handleGoodbyeCommand = deps.handleGoodbyeCommand;
  _messages = deps.messages;
  _confScreenDir = deps.confScreenDir;
  _findSecurityScreen = deps.findSecurityScreen;
  _displayScreen = deps.displayScreen;
  _searchFileDescriptions = deps.searchFileDescriptions;
}

/**
 * RL Command - Relogon
 *
 * From express.e:25534-25539 (internalCommandRL)
 *
 * Original: Sets relogon=TRUE and calls goodbye command (internalCommandG)
 * Effect: Disconnects user and returns them to login prompt
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Optional parameters to pass to goodbye command
 */
export function handleRelogonCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25535 - checkSecurity(ACS_RELOGON)
  if (!checkSecurity(session.user, ACSPermission.RELOGON)) {
    ErrorHandler.permissionDenied(socket, 'relogon', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25536-25537 internalCommandRL - no confirmation prompt; set flag and call G immediately
  // WEB_: express.e sets relogon:=TRUE then calls internalCommandG directly (no "Are you sure?")
  session.relogon = true;
  _handleGoodbyeCommand(socket, session, params);
}

/**
 * Handle RL confirmation input
 * WEB_: This state is no longer entered (RL no longer prompts for confirmation per express.e:25534-25538).
 * Kept for safe state-router backward-compat; remove once RL_CONFIRM is purged from bbs-states.
 */
export function handleRelogonConfirm(socket: any, session: BBSSession, _input: string): void {
  // Fallthrough: treat any input as confirmed since we should not reach this state anymore.
  session.relogon = true;
  _handleGoodbyeCommand(socket, session, session.tempData?.params || '');
  delete session.tempData;
}

/**
 * V Command - View a Text File
 *
 * From express.e:25675-25687 (internalCommandV)
 *
 * Forwards to ViewFileHandler in content/view-file.handler.ts which is the
 * canonical implementation: searches BBS file areas via DLPATH (Dir1..DirN),
 * emits RIP-mode bracket sequences (express.e:25679-25685), validates
 * filename/binary/restricted-path, and paginates with flagPause.
 *
 * The legacy implementation here used to search a flat BBS:TEXT/ directory
 * and emit no RIP brackets. It is unreachable today (every dispatcher routes
 * through ViewFileHandler) but kept as a forwarder so the export contract
 * stays stable for downstream importers and so an accidental re-wire can
 * never silently regress to the old, narrower behavior. (Audit C-V, 2026-05-04.)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Optional filename parameter
 */
export async function handleViewFileCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  const { ViewFileHandler } = await import('../content/view-file.handler');
  await ViewFileHandler.handleViewFileCommand(socket, session, params);
}

/**
 * Handle V command input — forwards to ViewFileHandler.handleFilenameInput.
 * See handleViewFileCommand above for the rationale.
 */
export async function handleViewFileInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const { ViewFileHandler } = await import('../content/view-file.handler');
  await ViewFileHandler.handleFilenameInput(socket, session, input);
}

/**
 * Z Command - Zippy Text Search
 *
 * From express.e:26123-26213 (internalCommandZ)
 *
 * Forwards to ZippySearchHandler in content/zippy-search.handler.ts which
 * is the canonical implementation: prompts via getDirSpan
 * (express.e:26162-26168), iterates DIR1..DIRN per conference emitting
 * "Scanning directory N" headers (express.e:26185-26192), and uses
 * context-buffered output to display the full file-description block on
 * any line that matches the search pattern (express.e:27574-27586).
 *
 * The legacy implementation here did a flat database search via
 * _searchFileDescriptions, ignored the dir-span param, and never emitted
 * the per-directory headers. It is unreachable today (every dispatcher
 * routes through ZippySearchHandler) but kept as a forwarder so the
 * export contract stays stable for downstream importers and so an
 * accidental re-wire can never silently regress to the flatter,
 * non-paginated database query. (Audit C-Z, 2026-05-04.)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Search pattern and optional directory range
 */
export async function handleZippySearchCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  const { ZippySearchHandler } = await import('../content/zippy-search.handler');
  await ZippySearchHandler.handleZippySearchCommand(socket, session, params);
}

/**
 * Handle Z command input — forwards to ZippySearchHandler.handleSearchInput.
 * See handleZippySearchCommand above for the rationale.
 */
export async function handleZippySearchInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const { ZippySearchHandler } = await import('../content/zippy-search.handler');
  await ZippySearchHandler.handleSearchInput(socket, session, input);
}

/**
 * ZOOM Command - Zoo Mail (Offline Mail)
 *
 * From express.e:26215-26240 (internalCommandZOOM)
 *
 * Original: Downloads messages in QWK or ASCII format for offline reading
 * Uses qwkZoom() or asciiZoom() based on user preference. The transfer
 * itself is ZMODEM and the LHA-vs-ZIP pack method is an interactive
 * prompt (express.e:26244).
 *
 * **WEB_**: divergence (audit C-ZOOM, P1).
 *   1. Transfer protocol is HTTP (download URL emitted at line ~390),
 *      not ZMODEM. The browser doesn't speak ZMODEM and recreating
 *      that experience over WebSocket adds no value over a click-to-
 *      download — sysops familiar with ZOOM still get a QWK packet.
 *   2. Pack method auto-selects ZIP (no LHA binary in the web stack).
 *      The express.e prompt is preserved as a status line so the
 *      user-visible flow still mirrors AmiExpress, but the interactive
 *      LHA / ZIP choice has been removed (the answer is always ZIP).
 *   3. CONTROL.DAT QWK packet completeness is checked by qwk.service.ts
 *      when generating the packet — see the QWK utility tests for
 *      coverage.
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export async function handleZoomCommand(socket: any, session: BBSSession): Promise<void> {
  // Check security - express.e:26221
  if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
    ErrorHandler.permissionDenied(socket, 'download offline mail', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Zoom');

  // express.e ZOOM command - no decorative header
  socket.emit('ansi-output', '\r\n');

  // Check if user has any unread messages
  const unreadMessages = _messages.filter(msg =>
    msg.timestamp > (session.user?.lastLogin || new Date(0)) &&
    (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
  );

  if (unreadMessages.length === 0) {
    socket.emit('ansi-output', 'No unread messages to download.\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  socket.emit('ansi-output', AnsiUtil.colorize(`You have ${unreadMessages.length} unread message(s).`, 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');

  try {
    // Import QWKManager (lazy load to avoid circular dependency)
    const { QWKManager } = await import('../../services/qwk.service');
    const qwkManager = new QWKManager();

    // Generate QWK packet for all conferences user has flagged for ZOOM
    // express.e:26227-26238, 26552 - uses user's zoomType and checks ZOOM_SCAN_MASK
    const userConferences = await getZoomFlaggedConferences(session.user.id);

    if (userConferences.length === 0) {
      socket.emit('ansi-output', AnsiUtil.colorize('No conferences flagged for ZOOM.', 'yellow'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', 'Use CF command to flag conferences for QWK download.\r\n');
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    socket.emit('ansi-output', AnsiUtil.colorize('Generating QWK packet...', 'cyan'));
    socket.emit('ansi-output', '\r\n');

    const filename = await qwkManager.generateOutgoingPacket(
      session.user.id.toString(),
      userConferences
    );

    socket.emit('ansi-output', AnsiUtil.colorize(`QWK packet generated: ${filename}`, 'green'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `Download URL: /api/qwk/download/${filename}\r\n`);
    socket.emit('ansi-output', '\r\n');

    // express.e:26244: '\r\n[32mPack Method [0m1) LHA, 2) ZIP ?>'
    // WEB_: auto-selects ZIP; no interactive prompt possible during transfer setup
    socket.emit('ansi-output', '\r\n\x1b[32mPack Method \x1b[0m1) LHA, 2) ZIP ?>\r\n');
    socket.emit('ansi-output', '\x1b[33mPrepare for ZoomMail Zmodem Download:\x1b[0m\r\n');

    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

  } catch (error) {
console.error('[ZOOM] QWK generation error:', error);
    socket.emit('ansi-output', AnsiUtil.errorLine('Error generating QWK packet'));
    socket.emit('ansi-output', (error as Error).message + '\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * ^ Command - Help Files
 *
 * From express.e:25089-25111 (internalCommandUpHat)
 *
 * Original: Progressive search for help files
 * Searches BBS:Help/ directory for files matching pattern
 * If not found, removes last character and searches again
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Help topic to search for
 */
export function handleHelpFilesCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25089-25111 internalCommandUpHat
  // express.e:25106-25108: empty params → RETURN RESULT_SUCCESS (no output at all)
  if (!params.trim()) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Progressive search — express.e:25094-25109: try BBS:help/{params}, strip last char, repeat
  let searchTerm = params.trim();
  let foundFile: string | null = null;

  while (searchTerm.length > 0) {
    const helpBasePath = path.join('help', searchTerm);
    foundFile = _findSecurityScreen(helpBasePath, session.user?.secLevel || 0, null, session.ripMode);
    if (foundFile) break;
    searchTerm = searchTerm.slice(0, -1);
  }

  if (foundFile) {
    // express.e:25096-25101: displayFile(screen); doPause(); '\b\n'; RETURN RESULT_SUCCESS
    _displayScreen(socket, session, foundFile);
    // doPause equivalent — main loop handles via menuPause=true
    session.menuPause = true;
  } else {
    // express.e:25107-25108: StrLen(params)=0 path → RETURN RESULT_SUCCESS (silent)
    // No output when not found
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

// === UTILITY FUNCTIONS ===

/**
 * Get list of conferences flagged with ZOOM_SCAN_MASK for a user
 * express.e:26552 - checks cb.handle[0] AND ZOOM_SCAN_MASK
 */
async function getZoomFlaggedConferences(userId: string): Promise<number[]> {
  const { db } = require('../database');
  const ZOOM_SCAN_MASK = 2; // Bit 1 - from express.e axconsts.e:47

  try {
    const result = await db.query(
      `SELECT DISTINCT conference_id
       FROM conf_base
       WHERE user_id = $1 AND (scan_flags & $2) != 0
       ORDER BY conference_id`,
      [userId, ZOOM_SCAN_MASK]
    );

    return result.rows.map((row: any) => row.conference_id);
  } catch (error) {
console.error('[ZOOM] Error getting flagged conferences:', error);
    // Fallback: return all conferences user has access to
    try {
      const confResult = await db.query(
        `SELECT DISTINCT conference_id
         FROM conf_base
         WHERE user_id = $1
         ORDER BY conference_id`,
        [userId]
      );
      return confResult.rows.map((row: any) => row.conference_id);
    } catch (fallbackError) {
console.error('[ZOOM] Fallback query failed:', fallbackError);
      return [];
    }
  }
}
