/**
 * Pre-Login Flow Handler
 * Handles connection screen, ANSI prompt, and BBSTITLE display
 * Based on express.e:29528-29551
 */

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

      // Skip graphics prompt, go straight to BBSTITLE
      session.tempData = { inputBuffer: '' };
      await displayScreen(socket, session, 'BBSTITLE');

      // Transition to login
      session.state = BBSState.LOGON;
      session.subState = undefined;
      socket.emit('petscii-output', '\r\n\r\n');
      socket.emit('prompt-login');
      return true;
    }

    // For non-C64 terminals, show the graphics prompt
    // express.e:29528 - ANSI prompt
    console.log('[PRE-LOGIN] Connection screen viewed, showing ANSI prompt');
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.tempData = { inputBuffer: '' }; // Initialize input buffer
    socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
    return true;
  }

  // Handle ANSI prompt input
  if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
    return await handleAnsiPromptInput(socket, session, data);
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

    // express.e:29543-29544 - Quick logon flag (for future use)
    if (hasQ) {
      session.tempData.quickLogon = true;
    }

    // Determine graphics mode string for logging
    let graphicsMode = 'None';
    if (session.petsciiMode) graphicsMode = 'PETSCII (40x25)';
    else if (session.ripMode) graphicsMode = 'RIP (640x350)';
    else if (session.ansiEnabled) graphicsMode = 'ANSI';
    console.log('[GRAPHICS] Mode set:', graphicsMode);

    // express.e:29551 - Display BBSTITLE screen and immediately show login prompt
    session.tempData.inputBuffer = ''; // Clear buffer
    await displayScreen(socket, session, 'BBSTITLE');
    if (session.pendingScreenCommand) {
      session.pendingScreenCommand.then(() => {
        if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
          socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
        }
      }).catch((error: any) => {
        console.error('[handlePreLogin] Pending screen command rejected:', error);
        socket.emit('ansi-output', '\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n)? ');
      });
    }

    // Immediately transition to login state (no key press required)
    session.state = BBSState.LOGON;
    session.subState = undefined;
    // Use proper output event based on selected graphics mode
    const outputEvent = getOutputEvent(session);
    socket.emit(outputEvent, '\r\n\r\n');
    socket.emit('prompt-login'); // Tell frontend to show login form
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
