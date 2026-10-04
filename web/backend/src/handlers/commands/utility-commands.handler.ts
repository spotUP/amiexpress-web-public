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
import { servesPetsciiArt } from '../screen.handler';
import { config } from '../../config';
import { userScreenTypeExtension } from '../../screens/screen-metadata';
import * as amigafs from '../../utils/amigafs';

import type { BBSSession } from '../../index';

// Dependencies injected from index.ts
let _handleGoodbyeCommand: (socket: any, session: BBSSession, params?: string) => void;
let _messages: any[] = [];
let _confScreenDir: string;
let _findSecurityScreen: (screenDirAndName: string, userSecLevel?: number, userScreenTypeExt?: string | null, ripMode?: boolean, defScreens?: boolean, petsciiMode?: boolean, texttvMode?: boolean) => string | null;
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

  // express.e:26226 aePuts('\b\n')
  socket.emit('ansi-output', '\r\n');

  const done = (): void => {
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  };

  try {
    // express.e:26237 qwkZoom() - the messages come from the message base on
    // disk, chosen with express.e's private-mail rule (zoom-mail.ts).
    const { qwkZoom } = await import('../message/zoom-mail');
    const zoom = await qwkZoom(socket, session);

    // express.e:26849-26852
    if (zoom.zoomed === 0) {
      socket.emit('ansi-output', 'No conferences selected for zooming. Use CF to configure\r\n');
      done();
      return;
    }

    // express.e packs in Node<n>/PlayPen; the port's PlayPen is the upload
    // staging area cleanPlayPen sweeps, so the packet gets a directory of
    // its own, outside the board.
    const { QWKManager } = await import('../../services/qwk.service');
    const os = await import('os');
    const packetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-'));
    const packetPath = await new QWKManager(packetDir).generateOutgoingPacket(
      session.user.username || '',
      (session.user as any).slotNumber || 0,
      zoom.conferences,
      zoom.messages,
    );

    // express.e:26244: '\r\n[32mPack Method [0m1) LHA, 2) ZIP ?>'
    // WEB_: auto-selects ZIP; no interactive prompt possible during transfer setup
    socket.emit('ansi-output', '\r\n\x1b[32mPack Method \x1b[0m1) LHA, 2) ZIP ?>\r\n');

    // express.e:26319-26340: the packet goes to the caller by downloadFile -
    // over ZMODEM, or to a browser through a one-fetch ticket for exactly this
    // path - and is deleted once a transfer has finished with it.
    socket.emit('ansi-output', '\r\n\x1b[33mPrepare for ZoomMail Zmodem Download:\x1b[0m\r\n');
    const { downloadFile } = await import('../file/file-delivery');
    const route = await downloadFile(socket, session, [packetPath]);
    // A browser fetches its ticket after this returns; the packet stays for
    // that one fetch and the caller's next Zoom overwrites it.
    if (route !== 'http') {
      try { fs.rmSync(packetDir, { recursive: true, force: true }); } catch { /* already gone */ }
    }
    done();
  } catch (error) {
    console.error('[ZOOM] QWK generation error:', error);
    socket.emit('ansi-output', AnsiUtil.errorLine('Error generating QWK packet'));
    socket.emit('ansi-output', (error as Error).message + '\r\n');
    socket.emit('ansi-output', '\r\n');
    done();
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

  const helpDir = resolveHelpDir(config.get('dataDir'));

  while (searchTerm.length > 0) {
    // express.e:25089 internalCommandUpHat: board-root help/ + params.
    // Two stacked production breaks lived here: the dir was CWD-relative
    // ('help/<topic>', resolves nowhere - /app/web/backend/help does not
    // exist), fixed to dataDir; and lowercase 'help' while the volume
    // carries HELP/ (AmigaDOS is case-insensitive, ext4 is not - live log:
    // "Not found: /app/data/bbs/help/TESTPAGE"). dataDir is the board
    // root, HELP is the on-disk case.
    //
    // THE SEARCH TERM IS THE CALLER'S, AND IT IS CONFINED. `path.join`
    // NORMALISES `..`, and _findSecurityScreen appends `.txt`/`.TXT` and
    // displays whatever it lands on - so `^ ../../../<something>` read any
    // text file on the container, for any logged-on caller. The two fixes
    // above made this worse without meaning to: a path that "resolved
    // nowhere" became one anchored at the real board root, which turned a
    // latent traversal into a live one.
    //
    // express never had the exposure, because AmigaDOS resolved `BBS:help/`
    // through an assign rather than a filesystem root a caller could climb
    // out of. Confined here the way this codebase already confines a door's
    // key (services/bot-data/doors.ts safeJoin).
    // resolveHelpDir, not a hardcoded 'HELP': this line has broken twice in
    // production on the case of the directory (AmigaDOS does not care, ext4
    // does), and confining the caller's term does not make the board's own
    // spelling of the directory any more certain.
    const helpBasePath = confineToHelp(helpDir, searchTerm);
    if (helpBasePath) {
      foundFile = _findSecurityScreen(helpBasePath, session.user?.secLevel || 0, userScreenTypeExtension(session.user, config.get('dataDir')), session.ripMode, false, servesPetsciiArt(session), session.texttvMode === true);
      if (foundFile) break;
    }
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

/**
 * The board's help directory, in whatever case it is written on disk.
 *
 * express.e says BBS:help/ and AmigaDOS does not care about case; ext4 does,
 * and this line has now broken twice in production for exactly that reason -
 * first CWD-relative 'help/', then hardcoded 'HELP' against a volume that
 * spells it otherwise. An AmiExpress distribution ships `Help/`. So the case
 * is read off the disk (RULES rule 11: amigafs), not asserted here. A board
 * with no help directory at all falls back to the literal, so the caller
 * still gets express.e's silence rather than an error.
 */
/**
 * A help topic is a NAME, never a path.
 *
 * No separators, no parent segments, no absolute paths, and the resolved file
 * must still sit under the help directory after normalisation. Null for
 * anything else, and the caller simply keeps shortening the term as express
 * does.
 *
 * Exported so a test can bind THIS rule rather than restate it: it and
 * `resolveHelpDir` are two fixes to one line - one confines the caller's term,
 * the other finds the board's own spelling of the directory - and each is
 * invisible from the other's test.
 */
export function confineToHelp(root: string, term: string): string | null {
  if (!term || term.includes('..') || path.isAbsolute(term)) return null;
  if (term.includes('/') || term.includes('\\')) return null;
  const full = path.resolve(root, term);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

export function resolveHelpDir(dataDir: string): string {
  const literal = path.join(dataDir, 'HELP');
  return amigafs.resolvePath(literal) ?? literal;
}
