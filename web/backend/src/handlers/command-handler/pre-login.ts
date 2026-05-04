/**
 * Pre-Login Flow Handler
 * Handles connection screen, ANSI prompt, SYSTEM_PASSWORD gate, and BBSTITLE display
 * Based on express.e:29477-29551
 */

import * as path from 'path';
import { BBSSession } from '../../index';
import { BBSState, LoggedOnSubState } from '../../constants/bbs-states';
import { displayScreen } from '../screen.handler';

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
function getSystemPassword(): string {
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
    socket.emit('ansi-output', '\r\nANSI, RIP or No graphics (A/r/n)? ');
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
 * Handle ANSI prompt input (express.e:29530-29546)
 * Line input for ANSI prompt (not single keypress!)
 */
async function handleAnsiPromptInput(socket: any, session: BBSSession, data: string): Promise<boolean> {
  // Buffer input until Enter is pressed
  if (data === '\r') {
    // Enter pressed - process the buffered input
    const answer = (session.tempData?.inputBuffer || '').toUpperCase();
console.log('📋 Graphics prompt response:', answer || '(empty = ANSI)');

    // express.e:29538-29546 - Check for specific letters in the string
    // Default (empty/just Enter) = ANSI enabled
    const hasN = answer.includes('N'); // No graphics
    const hasR = answer.includes('R'); // RIP mode
    const hasP = answer.includes('P'); // PETSCII mode
    const hasQ = answer.includes('Q'); // Quick logon

    // PETSCII mode takes priority (sets 40x25, uses .seq files)
    if (hasP) {
      session.petsciiMode = true;
      session.ripMode = false;
      session.ansiEnabled = true; // PETSCII still needs ANSI color codes
      session.screenWidth = 40;  // C64 terminal width
      session.screenHeight = 25; // C64 terminal height
console.log('[PETSCII] PETSCII mode enabled - setting terminal to 40x25');
      socket.emit('terminal-resize', { cols: 40, rows: 25 });
    } else if (hasR) {
      // express.e:29086 - RIP mode (640x350 EGA graphics, uses .rip files)
      session.ripMode = true;
      session.petsciiMode = false;
      session.ansiEnabled = true; // RIP includes ANSI support
      session.screenWidth = 80;  // RIP uses 80 column text mode
      session.screenHeight = 43; // RIP uses 43 line text mode (EGA)
console.log('[RIP] RIP graphics mode enabled - 640x350 EGA');
      socket.emit('rip-mode', { enabled: true, width: 640, height: 350 });
    } else {
      // express.e:29538-29539 - If 'N' in string, disable ANSI
      session.ansiEnabled = !hasN;
      session.petsciiMode = false;
      session.ripMode = false;
      session.screenWidth = 80;  // Standard terminal width
      session.screenHeight = 24; // Standard terminal height
    }

    // express.e:29545 - IF (InStr(tempStr,'Q',0)>=0) AND (sopt.qLogon<>0) THEN quickFlag:=TRUE
    // Quick logon flag - skip bulletins during login
    if (hasQ) {
      session.quickFlag = true;
console.log('[QUICK] Quick logon enabled - will skip bulletins per express.e:29545');
    }

    // Determine graphics mode string for logging
    let graphicsMode = 'None';
    if (session.petsciiMode) graphicsMode = 'PETSCII (40x25)';
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
    // Backspace - remove last character from buffer
    if (session.tempData?.inputBuffer && session.tempData.inputBuffer.length > 0) {
      session.tempData.inputBuffer = session.tempData.inputBuffer.slice(0, -1);
      socket.emit('ansi-output', '\b \b'); // Echo backspace (always ANSI during prompt)
    }
    return true;
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    // Printable character - add to buffer and echo it (always ANSI during prompt)
    session.tempData.inputBuffer = (session.tempData?.inputBuffer || '') + data;
    socket.emit('ansi-output', data); // Echo the character
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
