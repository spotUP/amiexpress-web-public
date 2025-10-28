/**
 * Quick Navigation Commands Handler
 * Port from express.e:24529-24592
 *
 * Implements:
 * - < (previous conference) - internalCommandLT
 * - > (next conference) - internalCommandGT
 * - <2 (previous message base) - internalCommandLT2
 * - >2 (next message base) - internalCommandGT2
 */

import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';

// Types
interface BBSSession {
  user?: any;
  currentConf?: number;
  currentMsgBase?: number;
  confRJoin?: number;
  msgBaseRJoin?: number;
  subState: string;
  [key: string]: any;
}

// Dependencies injected from index.ts
let _joinConference: (socket: any, session: BBSSession, confId: number, msgBaseId: number) => Promise<boolean>;
let _saveMsgPointers: (confId: number, msgBaseId: number) => Promise<void>;
let _checkConfAccess: (confId: number) => boolean;
let _getNumConferences: () => number;
let _getConfMsgBaseCount: (confId: number) => number;

/**
 * Set dependencies for navigation commands
 */
export function setNavigationQuickDependencies(deps: {
  joinConference: typeof _joinConference;
  saveMsgPointers: typeof _saveMsgPointers;
  checkConfAccess: typeof _checkConfAccess;
  getNumConferences: typeof _getNumConferences;
  getConfMsgBaseCount: typeof _getConfMsgBaseCount;
}) {
  _joinConference = deps.joinConference;
  _saveMsgPointers = deps.saveMsgPointers;
  _checkConfAccess = deps.checkConfAccess;
  _getNumConferences = deps.getNumConferences;
  _getConfMsgBaseCount = deps.getConfMsgBaseCount;
}

/**
 * < Command - Previous Conference
 * Port from express.e:24529-24546 internalCommandLT()
 */
export async function handlePreviousConferenceCommand(
  socket: any,
  session: BBSSession
): Promise<void> {
  // Check security - express.e:24531
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    socket.emit('ansi-output', '\r\n\x1b[31mPermission denied.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Save current message pointers - express.e:24532
  if (session.currentConf && session.currentMsgBase) {
    await _saveMsgPointers(session.currentConf, session.currentMsgBase);
  }

  console.log('[ENV] Join');

  // Find previous accessible conference - express.e:24535-24538
  let newConf = (session.currentConf || 1) - 1;
  while (newConf > 0 && !_checkConfAccess(newConf)) {
    newConf--;
  }

  // If no previous conference, prompt for manual selection - express.e:24540-24541
  if (newConf < 1) {
    const { handleJoinConferenceCommand } = require('./conference.handler');
    await handleJoinConferenceCommand(socket, session, '');
  } else {
    // Join the previous conference - express.e:24543
    await _joinConference(socket, session, newConf, 1);
  }
}

/**
 * > Command - Next Conference
 * Port from express.e:24548-24564 internalCommandGT()
 */
export async function handleNextConferenceCommand(
  socket: any,
  session: BBSSession
): Promise<void> {
  // Check security - express.e:24550
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    socket.emit('ansi-output', '\r\n\x1b[31mPermission denied.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Save current message pointers - express.e:24551
  if (session.currentConf && session.currentMsgBase) {
    await _saveMsgPointers(session.currentConf, session.currentMsgBase);
  }

  console.log('[ENV] Join');

  const numConf = _getNumConferences();

  // Find next accessible conference - express.e:24554-24557
  let newConf = (session.currentConf || 1) + 1;
  while (newConf <= numConf && !_checkConfAccess(newConf)) {
    newConf++;
  }

  // If no next conference, prompt for manual selection - express.e:24559-24560
  if (newConf > numConf) {
    const { handleJoinConferenceCommand } = require('./conference.handler');
    await handleJoinConferenceCommand(socket, session, '');
  } else {
    // Join the next conference - express.e:24562
    await _joinConference(socket, session, newConf, 1);
  }
}

/**
 * <2 Command - Previous Message Base
 * Port from express.e:24566-24578 internalCommandLT2()
 */
export async function handlePreviousMessageBaseCommand(
  socket: any,
  session: BBSSession
): Promise<void> {
  // Save current message pointers - express.e:24567
  if (session.currentConf && session.currentMsgBase) {
    await _saveMsgPointers(session.currentConf, session.currentMsgBase);
  }

  const currentConf = session.currentConf || 1;

  // Find previous message base - express.e:24569-24572
  let newMsgBase = (session.currentMsgBase || 1) - 1;

  // If no previous message base, wrap to last or prompt - express.e:24574-24575
  if (newMsgBase < 1) {
    const { handleJoinMessageBaseCommand } = require('./message-commands.handler');
    await handleJoinMessageBaseCommand(socket, session, '');
  } else {
    // Join the previous message base - express.e:24577
    await _joinConference(socket, session, currentConf, newMsgBase);
  }
}

/**
 * >2 Command - Next Message Base
 * Port from express.e:24580-24592 internalCommandGT2()
 */
export async function handleNextMessageBaseCommand(
  socket: any,
  session: BBSSession
): Promise<void> {
  // Save current message pointers - express.e:24581
  if (session.currentConf && session.currentMsgBase) {
    await _saveMsgPointers(session.currentConf, session.currentMsgBase);
  }

  const currentConf = session.currentConf || 1;
  const numMsgBases = _getConfMsgBaseCount(currentConf);

  // Find next message base - express.e:24583-24586
  let newMsgBase = (session.currentMsgBase || 1) + 1;

  // If no next message base, prompt for selection - express.e:24588-24589
  if (newMsgBase > numMsgBases) {
    const { handleJoinMessageBaseCommand } = require('./message-commands.handler');
    await handleJoinMessageBaseCommand(socket, session, '');
  } else {
    // Join the next message base - express.e:24591
    await _joinConference(socket, session, currentConf, newMsgBase);
  }
}
