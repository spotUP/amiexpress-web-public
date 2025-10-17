/**
 * Menu display and prompt functions
 * Extracted from index.ts for better modularity
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState, MessageBase } from './session';

// These will be provided by the caller
let messageBases: MessageBase[] = [];

export function setMessageBases(bases: MessageBase[]) {
  messageBases = bases;
}

/**
 * Display main menu (SCREEN_MENU equivalent)
 */
export function displayMainMenu(socket: Socket, session: BBSSession) {
  console.log('displayMainMenu called, current subState:', session.subState);

  // Clear screen before displaying menu (like AmiExpress does)
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and move cursor to top

  // Only show full menu if not expert mode (expert users get just the prompt)
  if (session.user?.expert !== "N") {
    console.log('Displaying full menu for non-expert user');
    socket.emit('ansi-output', '\x1b[0;36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[0;36m║                         \x1b[0;33mAmiExpress BBS Main Menu\x1b[0;36m                          ║\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[0;36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n\r\n');

    // Message Commands
    socket.emit('ansi-output', '\x1b[0;33m▶ MESSAGE COMMANDS:\x1b[0m\r\n');
    socket.emit('ansi-output', '  \x1b[36mR\x1b[0m  - Read Messages              \x1b[36mA\x1b[0m  - Post Message\r\n');
    socket.emit('ansi-output', '  \x1b[36mE\x1b[0m  - Post Private Message       \x1b[36mJM\x1b[0m - Join Message Base\r\n\r\n');

    // File Commands
    socket.emit('ansi-output', '\x1b[0;33m▶ FILE COMMANDS:\x1b[0m\r\n');
    socket.emit('ansi-output', '  \x1b[36mF\x1b[0m  - File Areas                 \x1b[36mD\x1b[0m  - Download Files\r\n');
    socket.emit('ansi-output', '  \x1b[36mU\x1b[0m  - Upload Files               \x1b[36mN\x1b[0m  - New Files Scan\r\n');
    socket.emit('ansi-output', '  \x1b[36mFR\x1b[0m - File Request               \x1b[36mFS\x1b[0m - File Search\r\n');
    socket.emit('ansi-output', '  \x1b[36mFM\x1b[0m - File Maintenance            \x1b[36mJF\x1b[0m - Join File Area\r\n\r\n');

    // Conference & User Commands
    socket.emit('ansi-output', '\x1b[0;33m▶ CONFERENCE & USER:\x1b[0m\r\n');
    socket.emit('ansi-output', '  \x1b[36mJ\x1b[0m  - Join Conference            \x1b[36mO\x1b[0m  - Online Users / Page Sysop\r\n');
    socket.emit('ansi-output', '  \x1b[36mI\x1b[0m  - User Information           \x1b[36mP\x1b[0m  - User Profile\r\n');
    socket.emit('ansi-output', '  \x1b[36mT\x1b[0m  - Time Left                  \x1b[36mQ\x1b[0m  - Quiet Node Toggle\r\n\r\n');

    // Communication Commands
    socket.emit('ansi-output', '\x1b[0;33m▶ COMMUNICATION:\x1b[0m\r\n');
    socket.emit('ansi-output', '  \x1b[36mC\x1b[0m  - Comment to Sysop           \x1b[36mOLM\x1b[0m - Online Messages\r\n');
    socket.emit('ansi-output', '  \x1b[36mCHAT\x1b[0m - Internode Chat            \x1b[36mWHO\x1b[0m - Who\'s Online\r\n\r\n');

    // Door & System Commands
    socket.emit('ansi-output', '\x1b[0;33m▶ DOORS & SYSTEM:\x1b[0m\r\n');
    socket.emit('ansi-output', '  \x1b[36mDOORS\x1b[0m - Door Games & Utilities    \x1b[36mX\x1b[0m <name> - Execute Door\r\n');
    socket.emit('ansi-output', '  \x1b[36m2\x1b[0m  - Callers Log                \x1b[36m3\x1b[0m  - System Statistics\r\n');
    socket.emit('ansi-output', '  \x1b[36m4\x1b[0m  - Account Information        \x1b[36mVER\x1b[0m - Version Information\r\n\r\n');

    // Sysop-only commands
    if (session.user?.securityLevel >= 255) {
      socket.emit('ansi-output', '\x1b[0;33m▶ SYSOP COMMANDS:\x1b[0m\r\n');
      socket.emit('ansi-output', '  \x1b[33m1\x1b[0m  - Account Editing            \x1b[33mDOORMAN\x1b[0m - Door Manager\r\n\r\n');
    }

    // Help & Exit
    socket.emit('ansi-output', '\x1b[0;33m▶ HELP & EXIT:\x1b[0m\r\n');
    socket.emit('ansi-output', '  \x1b[36m?\x1b[0m  - Command Help               \x1b[36mG\x1b[0m  - Goodbye (Logoff)\r\n');

    socket.emit('ansi-output', '\x1b[0;36m────────────────────────────────────────────────────────────────────────────────\x1b[0m\r\n');
  }

  // Show prompt
  displayMenuPrompt(socket, session);
}

/**
 * Display menu prompt (displayMenuPrompt equivalent)
 */
export function displayMenuPrompt(socket: Socket, session: BBSSession) {
  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = 'AmiExpress'; // In real implementation, get from config
  const timeLeft = Math.floor(session.timeRemaining);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = messageBases.filter(mb => mb.conferenceId === session.currentConf);
  const currentMsgBase = messageBases.find(mb => mb.id === session.currentMsgBase);

  if (msgBasesInConf.length > 1 && currentMsgBase) {
    // Multiple message bases: show "ConfName - MsgBaseName"
    const displayName = `${session.currentConfName} - ${currentMsgBase.name}`;
    socket.emit('ansi-output', `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${displayName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `);
  } else {
    // Single message base: just show conference name
    socket.emit('ansi-output', `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${session.currentConfName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `);
  }

  // Set command reading state based on expert mode (shortcuts vs line input)
  session.subState = session.cmdShortcuts ? LoggedOnSubState.READ_SHORTCUTS : LoggedOnSubState.READ_COMMAND;
}
