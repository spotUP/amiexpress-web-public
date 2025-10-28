/**
 * Menu display and prompt functions
 * Extracted from index.ts for better modularity
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState, MessageBase } from './session';
import { displayScreen } from './screens';

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

  // Only show full menu if not expert mode (expert users get just the prompt)
  if (session.user?.expert !== "N") {
    console.log('Displaying full menu for non-expert user');

    // Use the ORIGINAL AmiExpress MENU.TXT file from the conference screens directory
    // This matches the original AmiExpress behavior exactly
    console.log('🎨 About to call displayScreen with MENU');
    displayScreen(socket, session, 'MENU');
    console.log('🎨 displayScreen returned');
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
