/**
 * Conference Handler - Conference management and bulletins
 *
 * Handles conference joining, bulletin display, and conference scanning.
 * Based on express.e conference functions.
 */

import { displayScreen } from '../screen.handler';
import { displayMainMenu } from '../command-handler/menu';
import { getMailStatFile, loadMsgPointers, validatePointers } from '../../utils/message-pointers.util';
import { finalizeCommand } from '../../utils/command-response.util';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';

import type { BBSSession } from '../../index';

interface Conference {
  id: number;
  name: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

interface Database {
  query: (sql: string, params: any[]) => Promise<{ rows: any[] }>;
  updateUser: (id: string, updates: any) => Promise<void>;
}

// Injected dependencies
let conferences: Conference[] = [];
let messageBases: MessageBase[] = [];
let db: Database;
let callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
let loadFlagged: (socket: any, session: BBSSession) => Promise<void>;
let loadHistory: (session: BBSSession) => Promise<void>;
let SCREEN_BULL: string;
let SCREEN_NODE_BULL: string;
let SCREEN_CONF_BULL: string;
let LoggedOnSubState: any;

function getConfScreenName(): string {
  return typeof SCREEN_CONF_BULL !== 'undefined' ? SCREEN_CONF_BULL : 'CONF_BULL';
}

// Injection functions
export function setConferences(confs: Conference[]) {
  conferences = confs;
}

export function setMessageBases(bases: MessageBase[]) {
  messageBases = bases;
}

export function setDatabase(database: Database) {
  db = database;
}

export function setHelpers(helpers: {
  callersLog: typeof callersLog;
  loadFlagged: typeof loadFlagged;
  loadHistory: typeof loadHistory;
}) {
  callersLog = helpers.callersLog;
  loadFlagged = helpers.loadFlagged;
  loadHistory = helpers.loadHistory;
}

export function setConstants(constants: {
  SCREEN_BULL: string;
  SCREEN_NODE_BULL: string;
  SCREEN_CONF_BULL: string;
  LoggedOnSubState: any;
}) {
  SCREEN_BULL = constants.SCREEN_BULL;
  SCREEN_NODE_BULL = constants.SCREEN_NODE_BULL;
  SCREEN_CONF_BULL = constants.SCREEN_CONF_BULL;
  LoggedOnSubState = constants.LoggedOnSubState;
}

/**
 * Display conference bulletins (CONF_BULL)
 * Like express.e:28566-28577 - final bulletin after confScan
 */
export async function displayConferenceBulletins(socket: any, session: BBSSession): Promise<boolean> {
  // Express.e:28565 - IF (displayScreen(SCREEN_CONF_BULL)) THEN doPause()
  const displayed = await displayScreen(socket, session, getConfScreenName());
  return displayed;
}

/**
 * Join conference function (joinConf equivalent)
 * @param auto - If true, this is an auto-rejoin during login (express.e:5066-5088)
 *               Auto-rejoin displays user stats (S command) and "Auto-ReJoined" message
 */
export async function joinConference(socket: any, session: BBSSession, confId: number, msgBaseId: number, silent: boolean = false, auto: boolean = false) {
  const conference = conferences.find(c => c.id === confId);
  if (!conference) {
    if (!silent) socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference!\x1b[0m\r\n');
    return false;
  }

  const messageBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);
  if (!messageBase) {
    if (!silent) socket.emit('ansi-output', '\r\n\x1b[31mInvalid message base for this conference!\x1b[0m\r\n');
    return false;
  }

  session.currentConf = confId;
  session.conferenceId = confId; // XIM doors read this
  session.currentConference = confId; // GlobalStructures reads this
  session.currentMsgBase = msgBaseId;
  session.currentConfName = conference.name;
  session.relConfNum = confId; // For simplicity, use absolute conf number as relative
  session.confRJoin = confId;
  session.msgBaseRJoin = msgBaseId;
  if (session.user) {
    session.user.confRJoin = confId;
    session.user.autoRejoin = confId;
    session.user.msgBaseRJoin = msgBaseId;
    try {
      const { db } = require('../../database');
      await db.updateUser(session.user.id, { autoRejoin: confId, confRJoin: confId });
    } catch (err) {
console.warn('[joinConference] Failed to persist autoRejoin/confRJoin:', err);
    }
  }

  // Load message pointers for this conference/msg base (express.e joinConf sets lastMsgReadConf/lastNewReadConf)
  let mailStat: any = null;
  if (session.user) {
    try {
      mailStat = await getMailStatFile(confId, msgBaseId);
      const confBase = await loadMsgPointers(session.user.id, confId, msgBaseId);
      const validated = mailStat ? validatePointers(confBase, mailStat) : confBase;
      session.lastMsgReadConf = validated.lastMsgReadConf || 0;
      session.lastNewReadConf = validated.lastNewReadConf || 0;
    } catch (err) {
console.error('[joinConference] Failed to load/validate message pointers:', err);
      session.lastMsgReadConf = 0;
      session.lastNewReadConf = 0;
    }
  }

  // Sync node files so doors (like AquaScan) see the new conference
  if (session.user && session.nodeId !== undefined) {
    try {
      const { nodeFileManager } = require('../../services/NodeFileManager');
      nodeFileManager.writeNodeUserFile(session.nodeId, session.user);
    } catch (err) {
console.warn('[joinConference] Failed to sync node user file:', err);
    }
  }

  // Log conference join (express.e:9493 callersLog)
  if (session.user) {
    await callersLog(session.user.id, session.user.username, 'Joined conference', conference.name);
  }

  if (!silent) {
    // express.e:5066-5088 - auto-rejoin shows user stats and different message
    if (auto) {
      // express.e:5068 - processSysCommand('S') - Display user stats
      const { processCommand } = require('../command.handler');
      await processCommand(socket, session, 'S', '');

      // express.e:5071-5074 - Display "Auto-ReJoined" message
      const autoReJoinMsg = messageBases.filter(mb => mb.conferenceId === confId).length > 1
        ? `\r\nConference ${confId}: ${conference.name} [${messageBase.name}] Auto-ReJoined`
        : `\r\nConference ${confId}: ${conference.name} Auto-ReJoined`;
      socket.emit('ansi-output', autoReJoinMsg);

      // express.e:5096-5109 - Display message stats
      const totalMessages = (mailStat?.highMsgNum || 1) - 1;
      const lastScanned = Math.max((session.lastNewReadConf || 1) - 1, 1);
      const lastRead = session.lastMsgReadConf || 0;

      socket.emit('ansi-output', `\r\n\r\n\x1b[32mTotal messages           \x1b[33m:\x1b[0m ${totalMessages}\r\n`);
      socket.emit('ansi-output', `\r\n\x1b[32mLast message auto scanned\x1b[33m:\x1b[0m ${lastScanned}\r\n`);
      socket.emit('ansi-output', `\x1b[32mLast message read        \x1b[33m:\x1b[0m ${lastRead}\r\n`);
    } else {
      // Normal join - express.e:5077-5086
      const joinMsg = messageBases.filter(mb => mb.conferenceId === confId).length > 1
        ? `\x1b[32mJoining Conference\x1b[33m:\x1b[0m ${conference.name} [${messageBase.name}]`
        : `\x1b[32mJoining Conference\x1b[33m:\x1b[0m ${conference.name}`;
      socket.emit('ansi-output', `\r\n${joinMsg}\r\n`);
    }

    // Like express.e:28576-28577 - load flagged files and command history
    await loadFlagged(socket, session);
    await loadHistory(session);

    // Express.e:28579 - Set menuPause flag (pause before next menu display)
    session.menuPause = true;

    // Move to menu display
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  return true;
}
