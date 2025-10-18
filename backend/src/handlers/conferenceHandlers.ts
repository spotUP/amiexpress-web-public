/**
 * Conference Handlers Module
 *
 * Handles conference-related operations like joining conferences and message bases
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState } from '../bbs/session';
import { conferences, messageBases } from '../server/dataStore';
import { displayScreen, doPause } from '../bbs/screens';

/**
 * Join a conference and message base
 * @param socket - Socket.IO socket instance
 * @param session - Current BBS session
 * @param confId - Conference ID to join
 * @param msgBaseId - Message base ID to join
 * @returns boolean - True if successfully joined, false otherwise
 */
export function joinConference(socket: Socket, session: BBSSession, confId: number, msgBaseId: number): boolean {
  console.log(`🔍 joinConference called: confId=${confId}, msgBaseId=${msgBaseId}`);
  console.log(`🔍 Total conferences: ${conferences.length}, Total message bases: ${messageBases.length}`);

  const conference = conferences.find(c => c.id === confId);
  if (!conference) {
    console.log(`❌ Conference ${confId} not found in:`, conferences.map(c => ({ id: c.id, name: c.name })));
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference!\x1b[0m\r\n');
    return false;
  }
  console.log(`✓ Found conference: ${conference.name} (id: ${conference.id})`);

  // Find the requested message base first
  let messageBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);

  // If the specific message base doesn't exist, find the first available one for this conference
  if (!messageBase) {
    const availableMessageBases = messageBases.filter(mb => mb.conferenceId === confId);
    console.log(`🔍 Message base ${msgBaseId} not found for conference ${confId}`);
    console.log(`🔍 Available message bases for conference ${confId}:`, availableMessageBases.map(mb => ({ id: mb.id, name: mb.name, confId: mb.conferenceId })));

    if (availableMessageBases.length === 0) {
      console.log(`❌ No message bases available for conference ${confId}`);
      socket.emit('ansi-output', '\r\n\x1b[31mNo message bases available for this conference!\x1b[0m\r\n');
      return false;
    }
    // Use the first available message base
    messageBase = availableMessageBases[0];
    console.log(`✓ Using first available message base: ${messageBase.name} (id: ${messageBase.id})`);
  } else {
    console.log(`✓ Found requested message base: ${messageBase.name} (id: ${messageBase.id})`);
  }

  session.currentConf = confId;
  session.currentMsgBase = messageBase.id;
  session.currentConfName = conference.name;
  session.relConfNum = confId; // For simplicity, use absolute conf number as relative

  socket.emit('ansi-output', `\r\n\x1b[32mJoined conference: ${conference.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', `\r\n\x1b[32mCurrent message base: ${messageBase.name}\x1b[0m\r\n`);

  // Display CONF_BULL screen if it exists (express.e lines 5058-5060)
  if (displayScreen(socket, session, 'CONF_BULL')) {
    doPause(socket, session);
    // Set flag to indicate we're waiting for pause keypress
    session.tempData = { ...session.tempData, confBullPause: true };
  } else {
    // No CONF_BULL screen, move directly to menu
    session.tempData = { ...session.tempData, menuPause: true };
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  return true;
}
