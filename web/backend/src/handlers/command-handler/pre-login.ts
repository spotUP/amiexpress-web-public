/**
 * Pre-Login Flow Handler
 * Handles connection screen, ANSI prompt, and BBSTITLE display
 * Based on express.e:29528-29551
 */

import { BBSSession } from '../../index';
import { BBSState, LoggedOnSubState } from '../../constants/bbs-states';
import { displayScreen } from '../screen.handler';

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
    // reference-board BBS layout: everything shown on connect, now just show ANSI prompt
    // express.e:29528 - ANSI prompt
    console.log('📋 Connection screen viewed, showing ANSI prompt');
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
    console.log('📋 BBSTITLE viewed, transitioning to login');
    session.state = BBSState.LOGON;
    session.subState = undefined;
    socket.emit('ansi-output', '\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n');
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
      session.ansiEnabled = true; // PETSCII still needs ANSI color codes
      console.log('📋 PETSCII mode enabled - setting terminal to 40x25');
      socket.emit('terminal-resize', { cols: 40, rows: 25 });
    } else {
      // express.e:29538-29539 - If 'N' in string, disable ANSI
      session.ansiEnabled = !hasN;
      session.petsciiMode = false;
    }

    // express.e:29543-29544 - Quick logon flag (for future use)
    if (hasQ) {
      session.tempData.quickLogon = true;
    }

    // express.e:29545 - RIP mode flag (for future use)
    if (hasR) {
      session.tempData.ripMode = true;
    }

    console.log('📋 Graphics mode set:', session.petsciiMode ? 'PETSCII (40x25)' : (session.ansiEnabled ? 'ANSI/RIP' : 'None'));

    // express.e:29551 - Display BBSTITLE screen and immediately show login prompt
    session.tempData.inputBuffer = ''; // Clear buffer
    await displayScreen(socket, session, 'BBSTITLE');

    // Immediately transition to login state (no key press required)
    session.state = BBSState.LOGON;
    session.subState = undefined;
    socket.emit('ansi-output', '\r\n\r\n');
    socket.emit('prompt-login'); // Tell frontend to show login form
    return true;
  } else if (data === '\x7f' || data === '\b') {
    // Backspace - remove last character from buffer
    if (session.tempData?.inputBuffer && session.tempData.inputBuffer.length > 0) {
      session.tempData.inputBuffer = session.tempData.inputBuffer.slice(0, -1);
      socket.emit('ansi-output', '\b \b'); // Echo backspace
    }
    return true;
  } else if (data.length === 1 && data >= ' ' && data <= '~') {
    // Printable character - add to buffer and echo it
    session.tempData.inputBuffer = (session.tempData?.inputBuffer || '') + data;
    socket.emit('ansi-output', data); // Echo the character
    return true;
  }

  // Ignore other control characters
  return true;
}
