/**
 * Pre-Login Flow Handler
 * Handles connection screen, ANSI prompt, SYSTEM_PASSWORD gate, and BBSTITLE display
 * Based on express.e:29477-29551
 */

import * as path from 'path';
import { BBSSession } from '../../index';
import { BBSState, LoggedOnSubState } from '../../constants/bbs-states';
import { displayScreen } from '../screen.handler';
import { resetPetsciiModel } from '../../utils/petscii-session-model';
import { transportCapabilities } from '../../server/transport-adapter';
import {
  acceptTypedChar, acceptBackspace, ANSI_PROMPT_MAX_LEN,
  recordPromptColumn, backspaceEcho, SAVE_CURSOR,
} from '../../utils/line-input.util';

/**
 * Get the appropriate output event name based on session terminal type
 * C64 terminals use 'petscii-output', others use 'ansi-output'
 */
function getOutputEvent(session: BBSSession): 'ansi-output' | 'petscii-output' {
  return session.terminalType === 'c64' ? 'petscii-output' : 'ansi-output';
}

/**
 * Read the system password from bbsConfig.info.
 * express.e:29329 — cmds.sysPass; ACP.e:2630 — SYSTEM_PASSWORD tooltype.
 * Returns empty string if not configured (no gate active).
 */
export function getSystemPassword(): string {
  try {
    const { loadBBSConfig } = require('../../services/bbs-config-file.service');
    // BBS root: from env or calculated relative to this compiled file's location
    // web/backend/dist/handlers/command-handler/ → ../../../../.. = project root
    const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../../../..');
    const diskConfig = loadBBSConfig(bbsRoot);
    return (diskConfig.system_password || '').trim();
  } catch {
    return '';
  }
}

/**
 * Handle pre-login connection flow (AWAIT state)
 * Returns true if handled, false otherwise
 */
export async function handlePreLoginInput(socket: any, session: BBSSession, data: string): Promise<boolean> {
  // Only handle AWAIT state
  if (session.state !== BBSState.AWAIT) {
    return false;
  }

  // Handle connection screen keypress
  if (session.subState === LoggedOnSubState.DISPLAY_CONNECT) {
    // User pressed key after connection screen (welcome + node list)

    // Check if this is a real C64 terminal (detected via telnet TTYPE)
    // If so, skip the graphics prompt and go straight to PETSCII mode
    if (session.terminalType === 'c64') {
console.log('[C64] Real C64 terminal detected - auto-enabling PETSCII mode');
      session.petsciiMode = true;
      session.ansiEnabled = false; // C64 uses raw PETSCII, not ANSI
      session.screenWidth = 40;
      session.screenHeight = 25;
      // The flip: the model describes a fresh 40x25 screen from here, never
      // the tail of the connect screen that drained out of the 16ms
      // AnsiBuffer after the DEL-probe stamped terminalType='c64'. This
      // branch is DEAD (command.handler.ts is the live dispatcher) - the
      // reset is here so the two copies cannot drift apart. Task OC-5.
      resetPetsciiModel(session);

      // Skip graphics prompt — but still honour the system password gate
      // express.e:29548-29550 Not(STEALTH_MODE) path fires before BBSTITLE
      session.tempData = { inputBuffer: '' };
      const sysPassC64 = getSystemPassword();
      if (sysPassC64.length > 0) {
        session.tempData.systemPasswordAttempts = 0;
        session.subState = LoggedOnSubState.SYSTEM_PASSWORD_INPUT;
        socket.emit('petscii-output', '\r\n');
        await displayScreen(socket, session, 'PRIVATE');
        socket.emit('petscii-output', '>: ');
        socket.emit('mask-input', true);
      } else {
        await displayScreen(socket, session, 'BBSTITLE');
        session.state = BBSState.LOGON;
        session.subState = undefined;
        socket.emit('petscii-output', '\r\n\r\n');
        socket.emit('prompt-login');
      }
      return true;
    }

    // For non-C64 terminals, show the graphics prompt
    // express.e:29528 - aePuts('ANSI, RIP or No graphics (A/r/n)? ')
    // WEB_: PETSCII option removed — not in express.e:29528. C64 terminals are detected
    // via telnet TTYPE negotiation (see c64 branch above) and never reach this prompt.
console.log('[PRE-LOGIN] Connection screen viewed, showing ANSI prompt');
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.tempData = { inputBuffer: '' }; // Initialize input buffer
    socket.emit('ansi-output', recordPromptColumn(
      session, '\r\nANSI, RIP or No graphics (A/r/n)? ',
    ));
    socket.emit('ansi-output', SAVE_CURSOR);
    return true;
  }

  // Handle ANSI prompt input
  if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
    return await handleAnsiPromptInput(socket, session, data);
  }

  // Handle system password gate (express.e:29329-29356 doSystemPassword)
  if (session.subState === LoggedOnSubState.SYSTEM_PASSWORD_INPUT) {
    return await handleSystemPasswordInput(socket, session, data);
  }

  // Handle BBSTITLE screen keypress
  if (session.subState === LoggedOnSubState.DISPLAY_BBSTITLE) {
    // User pressed key after BBSTITLE, now ready for login
console.log('[PRE-LOGIN] BBSTITLE viewed, transitioning to login');
    session.state = BBSState.LOGON;
    session.subState = undefined;
    const outputEvent = getOutputEvent(session);
    socket.emit(outputEvent, '\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n');
    socket.emit(outputEvent, '\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n');
    socket.emit('prompt-login'); // Tell frontend to show login form
    return true;
  }

  return true; // In AWAIT state, always consume input
}

/**
 * The one place the graphics answer becomes session state
 * (express.e:29538-29546). Three dispatchers used to carry their own
 * copies of this block, and only the dead one set session.ripMode - so
 * answering R at the prompt logged "RIP" and then served .TXT screens
 * ("we need rip fully supported ... it loads the rip screen files
 * instead", the sysop, 2026-09-01).
 *
 * WEB_ deviations, both deliberate:
 * - express.e:29086 gives RIP text mode 43 lines; the web terminal stays
 *   at its visible 80x24, because pagination must match what xterm shows.
 * - No 'rip-mode' socket emit here: the terminal arms its RIP canvas on
 *   the \x1b[1! framing displayScreen sends around .rip content, exactly
 *   as it does for the RIP door. Arming at the prompt would swallow the
 *   ANSI between the answer and the first picture.
 */
export function applyGraphicsAnswer(socket: any, session: BBSSession, answer: string): void {
  const hasN = answer.includes('N'); // No graphics
  const hasR = answer.includes('R'); // RIP mode
  const hasP = answer.includes('P'); // PETSCII mode
  const hasT = answer.includes('T'); // Teletext mode (WEB_: no express.e counterpart)
  // `P8` is the WIDE PETSCII screen: the same Commodore glyphs and the same
  // byte transport, on this board's 80-column canvas. The mode is CHOSEN
  // here and never detected - nothing on the wire tells a C128-at-80 from a
  // C64-at-40 - and plain `P` is unchanged in every respect.
  // ...and only where there is a canvas to mount it on. A telnet or SSH
  // caller's terminal IS the screen: 40 columns of PETSCII is what a C64
  // has, and answering P8 down a byte transport cannot change that.
  const wantsWide = hasP && /P\s*8/.test(answer) && session.connectionType === 'web';
  const hasQ = answer.includes('Q'); // Quick logon

  if (hasP) {
    // PETSCII mode takes priority (40x25, .seq screens)
    session.petsciiMode = true;
    session.ripMode = false;
    session.texttvMode = false;
    session.ansiEnabled = true; // PETSCII still needs ANSI color codes
    session.petsciiColumns = wantsWide ? 80 : 40;
    session.screenWidth = session.petsciiColumns;
    session.screenHeight = 25;
console.log(`[PETSCII] PETSCII mode enabled - setting terminal to ${session.petsciiColumns}x25`);
    // The flip for a web/SSH caller who ANSWERED the graphics prompt. Before
    // this line sessionWantsPetscii was false and the session had no model at
    // all; the reset fixes the ORIGIN everything after is modelled from - the
    // terminal-resize below, the SIMULATING banner
    // (`handlers/command.handler.ts`) and the first screen. Task OC-5.
    resetPetsciiModel(session);
    // TWO events, and the difference matters. `terminal-resize` is geometry
    // and stays exactly what it was for a 40-column caller, because the
    // browser has used that literal 40x25 as the canvas-mount switch since
    // the canvas existed and a mid-deploy session must not lose its screen.
    // `petscii-mode` is the MODE, and carries the shape with it - which is
    // what an 80-column caller is mounted on.
    socket.emit('terminal-resize', { cols: session.petsciiColumns, rows: 25 });
    // The COLOURS, with the shape. A C64 is a VIC-II by construction; the
    // 80-column screen is a C128's, whose VDC has its own sixteen - and that
    // is a caller preference, applied at login (handlers/commands/
    // user-commands.handler.ts). Nobody is logged in at the graphics prompt,
    // so what goes out here is the default for the screen.
    socket.emit('petscii-mode', {
      cols: session.petsciiColumns,
      rows: 25,
      palette: session.petsciiColumns === 80 ? 'vdc' : 'vic',
      // THE CHARACTER SET, with the shape and the colours. A C64 sold in
      // Sweden shipped ROM 325018-02, with a-ring and the umlauts where the
      // bracket/pound trio sits; without it a Swedish caller cannot type
      // their own name. The caller's own setting is W row 22 - at the
      // graphics prompt nobody is logged in, so a session that has not said
      // otherwise gets the standard set, and $5C stays the pound sign this
      // board's MCI uses for its column tab.
      charset: (session.user?.petsciiCharset === 'swedish'
        || (session as any).petsciiSwedish === true) ? 'swedish' : 'standard',
    });
  } else if (hasT && transportCapabilities(session).teletext) {
    // WEB_: teletext session mode (T answer at the graphics prompt). The web
    // terminal swaps to the TDAText face at 2x with a teletext palette on
    // the `texttv-mode` event below (the ONLY wire signal - no
    // terminal-resize, which the frontend reads as "mount the C64 canvas").
    // Geometry is the classic 40x25: screens (.ttx authored 40 wide),
    // doors (BB_SCRWIDTH answers 40) and the narrow layouts all key off
    // screenWidth, the same 40-column path PETSCII sessions use - except
    // nothing is transduced, everything stays ANSI.
    session.texttvMode = true;
    session.petsciiMode = false;
    session.ripMode = false;
    session.ansiEnabled = true;
    session.screenWidth = 40;
    session.screenHeight = 25;
console.log('[TEXTTV] Teletext mode enabled - 40x25, TDAText face, .ttx preferred');
    socket.emit('texttv-mode', { enabled: true });
  } else if (hasT) {
    // WEB_: answering T on a byte transport. Same shape as the R fallback
    // below: no teletext renderer there (the palette and face are browser
    // concerns), so fall back to ANSI and say so once, in the C64-legible
    // uppercase the graphics prompt itself uses.
    session.texttvMode = false;
    session.petsciiMode = false;
    session.ripMode = false;
    session.ansiEnabled = true;
    session.screenWidth = 80;
    session.screenHeight = 24;
console.log('[TEXTTV] Teletext requested on a transport with no renderer - falling back to ANSI');
    socket.emit(getOutputEvent(session), '\r\nTELETEXT NEEDS A WEB BROWSER - USING ANSI\r\n');
  } else if (hasR && transportCapabilities(session).rip) {
    // express.e:29545 - RIP mode: .rip screens served first, framed by
    // displayScreen with \x1b[1!..\x1b[2! for the web terminal's canvas.
    session.ripMode = true;
    session.petsciiMode = false;
    session.texttvMode = false;
    session.ansiEnabled = true; // RIP includes ANSI support
    session.screenWidth = 80;
    session.screenHeight = 24;
console.log('[RIP] RIP graphics mode enabled - .rip screens preferred');
  } else if (hasR) {
    // WEB_: express.e:29545 sends RIPscrip to whoever asks for it. This port
    // has no server-side rasteriser - RIP is drawn by RIPtermJS in the browser
    // (packages/terminal/src/rip), the WEB_ deviation already recorded at
    // handlers/screen.handler.ts:1864 - so answering R on a byte transport
    // shipped `!|` source across the caller's screen as literal text. Fall back
    // to ANSI and say so, once, in the C64-legible uppercase the graphics
    // prompt itself uses (services/login-connect.service.ts).
    //
    // socket.emit(getOutputEvent(...)), not emitText: every other line this
    // file writes goes out that way, and mixing in the buffered wrapper here
    // would let the notice land AFTER the screen that follows it.
    session.ripMode = false;
    session.petsciiMode = false;
    session.texttvMode = false;
    session.ansiEnabled = true;
    session.screenWidth = 80;
    session.screenHeight = 24;
console.log('[RIP] RIP requested on a transport with no rasteriser - falling back to ANSI');
    socket.emit(getOutputEvent(session), '\r\nRIP GRAPHICS NEED A WEB BROWSER - USING ANSI\r\n');
  } else {
    // express.e:29538-29539 - If 'N' in string, disable ANSI
    session.ansiEnabled = !hasN;
    session.petsciiMode = false;
    session.ripMode = false;
    session.texttvMode = false;
    session.screenWidth = 80;
    session.screenHeight = 24;
  }

  // express.e:29545 quickFlag - skip bulletins during login
  if (hasQ) {
    session.quickFlag = true;
    session.tempData = session.tempData || {};
    session.tempData.quickLogon = true;
console.log('[QUICK] Quick logon enabled - will skip bulletins per express.e:29545');
  }
}

/**
 * Handle ANSI prompt input (express.e:29530-29546)
 * Line input for ANSI prompt (not single keypress!)
 */
async function handleAnsiPromptInput(socket: any, session: BBSSession, data: string): Promise<boolean> {
  // Buffer input until Enter is pressed
  if (data === '\r') {
    // Enter pressed - process the buffered input
    const answer = (session.tempData?.inputBuffer || '').toUpperCase();
console.log('📋 Graphics prompt response:', answer || '(empty = ANSI)');

    // express.e:29538-29546 - the shared semantics; see applyGraphicsAnswer.
    applyGraphicsAnswer(socket, session, answer);

    // Determine graphics mode string for logging
    let graphicsMode = 'None';
    if (session.petsciiMode) graphicsMode = 'PETSCII (40x25)';
    else if (session.texttvMode) graphicsMode = 'TELETEXT (40x25)';
    else if (session.ripMode) graphicsMode = 'RIP (640x350)';
    else if (session.ansiEnabled) graphicsMode = 'ANSI';
console.log('[GRAPHICS] Mode set:', graphicsMode);

    // express.e:29548-29550 — Not(STEALTH_MODE) branch: doSystemPassword() before BBSTITLE
    // Web connections never have STEALTH_MODE (no node .info file), so we always follow
    // the Not(STEALTH_MODE) path: gate fires here, after ANSI prompt, before BBSTITLE.
    session.tempData.inputBuffer = ''; // Clear buffer
    const sysPass = getSystemPassword();
    if (sysPass.length > 0) {
      // System password is configured — enter password gate (express.e:29329-29356)
      session.tempData.systemPasswordAttempts = 0;
      session.subState = LoggedOnSubState.SYSTEM_PASSWORD_INPUT;
      socket.emit('ansi-output', '\r\n');
      // express.e:29336 — displayScreen(SCREEN_PRIVATE) (optional screen, silently skip if absent)
      await displayScreen(socket, session, 'PRIVATE');
      // express.e:29332 — SYS_PWRD_PROMPT node tooltype, default '>: '
      // We have no node tooltype system for web; use the default prompt.
      socket.emit('ansi-output', '>: ');
      socket.emit('mask-input', true);
      return true;
    }

    // No system password — go straight to BBSTITLE (express.e:29552)
    await transitionToBBSTitle(socket, session);
    return true;
  } else if (data === '\x7f' || data === '\b') {
    // Backspace (express.e:2306). Always ANSI during this prompt.
    const had = (session.tempData?.inputBuffer as string) || '';
    const edit = acceptBackspace(had);
    session.tempData.inputBuffer = edit.buffer;
    // Wrap-aware: this prompt is 34 columns, so on a narrow terminal even a
    // ten-character answer reaches the edge, and a bare `\b \b` would stop
    // at column 0 with the first row stranded.
    if (edit.echo) socket.emit('ansi-output', backspaceEcho(had, edit.buffer, session as any));
    return true;
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    // Printable, and only while the field has room - express.e:2335, with
    // the length express gives THIS prompt (29530: maxLen 10).
    //
    // Without the limit the answer ran past the right edge, the terminal
    // wrapped it, and `\b \b` could not climb back over the wrap: the first
    // line could not be deleted and was still in the buffer at Enter. The
    // sysop, 2026-09-13: "it wraps to the next line and i cant backspace to
    // delete on the first line".
    const edit = acceptTypedChar(
      (session.tempData?.inputBuffer as string) || '', data, ANSI_PROMPT_MAX_LEN,
    );
    session.tempData.inputBuffer = edit.buffer;
    if (edit.echo) socket.emit('ansi-output', edit.echo);
    return true;
  }

  // Ignore other control characters
  return true;
}

/**
 * Transition to BBSTITLE display then immediately to LOGON state.
 * express.e:29552 — displayScreen(SCREEN_BBSTITLE) then logon loop begins.
 * Extracted so both the no-password path and successful password path can share it.
 */
async function transitionToBBSTitle(socket: any, session: BBSSession): Promise<void> {
  await displayScreen(socket, session, 'BBSTITLE');

  // express.e:29554-29557 — IF(StrLen(reservedName)>0) THEN aePuts(
  //   '*** Node N is reserved right now, for <name> ***'). The reserve-
  //   for-user feature lets sysops hold a node open for a specific
  //   caller; the warning tells other callers they'll be bumped.
  //
  // session.reservedFor is populated in createSession() from
  // services/node-reservation.service (per-node Map). The sysop sets it
  // via POST /api/nodes/:nodeId/reserve (api/node-control-routes), and
  // the connect-time bump in auth-socket-handlers fires the express.e
  // 28734-28738 disconnect for non-matching users.
  const reservedFor = (session as any).reservedFor;
  if (typeof reservedFor === 'string' && reservedFor.length > 0) {
    const node = session.nodeId ?? 0;
    const outputEventEarly = getOutputEvent(session);
    socket.emit(
      outputEventEarly,
      `\r\n*** Node ${node} is reserved right now, for ${reservedFor} ***\r\n`
    );
  }

  // Immediately transition to login state (no key press required)
  session.state = BBSState.LOGON;
  session.subState = undefined;
  const outputEvent = getOutputEvent(session);
  socket.emit(outputEvent, '\r\n\r\n');
  socket.emit('prompt-login'); // Tell frontend to show login form
}

/**
 * Handle system password gate input (express.e:29329-29356 doSystemPassword).
 * Called when session.subState === SYSTEM_PASSWORD_INPUT.
 * Collects masked line input; compares against SYSTEM_PASSWORD tooltype.
 * Up to 3 tries; on failure disconnects the caller.
 */
async function handleSystemPasswordInput(socket: any, session: BBSSession, data: string): Promise<boolean> {
  // Initialize password buffer if needed
  if (!session.tempData) session.tempData = { inputBuffer: '' };
  if (session.tempData.inputBuffer === undefined) session.tempData.inputBuffer = '';

  if (data === '\r') {
    // Enter pressed — compare against configured password
    socket.emit('mask-input', false);
    const entered = (session.tempData.inputBuffer || '') as string;
    session.tempData.inputBuffer = '';
    socket.emit('ansi-output', '\r\n');

    const sysPass = getSystemPassword();
    // express.e:29337 getPass2() does a case-sensitive exact match
    if (entered === sysPass) {
      // express.e:29355 aePuts('\b\n') then fall through to BBSTITLE
      socket.emit('ansi-output', '\r\n');
      await transitionToBBSTitle(socket, session);
      return true;
    }

    // Wrong password
    const attempts = ((session.tempData.systemPasswordAttempts as number) || 0) + 1;
    session.tempData.systemPasswordAttempts = attempts;

    // express.e:29343-29346 — 'Invalid PassWord\b\n' + log + increment
    socket.emit('ansi-output', 'Invalid PassWord\r\n');
console.log(`[SYSTEM_PASSWORD] Failed attempt ${attempts}/3`);

    if (attempts >= 3) {
      // express.e:29349-29353 — after 3 fails: log + SYSPWDFAIL syscmd + disconnect
console.log('[SYSTEM_PASSWORD] 3 failures — disconnecting caller (express.e:29349-29353)');
      // Run SYSPWDFAIL syscmd (optional, ignore if not found)
      try {
        const { runSysCommand } = require('../command-execution.handler');
        await runSysCommand(socket, session, 'SYSPWDFAIL', '');
      } catch { /* syscmd is optional */ }
      socket.disconnect();
      return true;
    }

    // Prompt again (express.e:29336 — displayScreen(SCREEN_PRIVATE) each attempt)
    await displayScreen(socket, session, 'PRIVATE');
    socket.emit('ansi-output', '>: ');
    socket.emit('mask-input', true);
    return true;
  } else if (data === '\x7f' || data === '\b') {
    // Backspace
    if (session.tempData.inputBuffer && (session.tempData.inputBuffer as string).length > 0) {
      session.tempData.inputBuffer = (session.tempData.inputBuffer as string).slice(0, -1);
      // No echo for masked input — just move cursor back
      socket.emit('ansi-output', '\b \b');
    }
    return true;
  } else if (data.length === 1 && data >= ' ') {
    // Printable character — add to buffer, no echo (password masking)
    session.tempData.inputBuffer = ((session.tempData.inputBuffer as string) || '') + data;
    return true;
  }

  return true;
}
