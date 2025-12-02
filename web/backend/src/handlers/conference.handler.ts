/**
 * Conference Handler - Conference management and bulletins
 *
 * Handles conference joining, bulletin display, and conference scanning.
 * Based on express.e conference functions.
 */

import { displayScreen } from './screen.handler';
import { displayMainMenu } from './command-handler/menu';
import { getMailStatFile, loadMsgPointers, validatePointers } from '../utils/message-pointers.util';
import { finalizeCommand } from '../utils/command-response.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';

import type { BBSSession } from '../index';

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
 */
export async function joinConference(socket: any, session: BBSSession, confId: number, msgBaseId: number) {
  const conference = conferences.find(c => c.id === confId);
  if (!conference) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference!\x1b[0m\r\n');
    return false;
  }

  const messageBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);
  if (!messageBase) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid message base for this conference!\x1b[0m\r\n');
    return false;
  }

  session.currentConf = confId;
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
      const { db } = require('../database');
      await db.updateUser(session.user.id, { autoRejoin: confId, confRJoin: confId });
    } catch (err) {
      console.warn('[joinConference] Failed to persist autoRejoin/confRJoin:', err);
      SysopDebugUtil.debug(
        socket,
        session,
        'Conference Switching',
        `Failed to persist auto-rejoin settings for conference`,
        {
          error: err instanceof Error ? err.message : String(err),
          userId: session.user.id,
          conferenceId: confId
        },
        DebugSeverity.WARNING
      );
    }
  }

  // Load message pointers for this conference/msg base (express.e joinConf sets lastMsgReadConf/lastNewReadConf)
  if (session.user) {
    try {
      const mailStat = await getMailStatFile(confId, msgBaseId);
      const confBase = await loadMsgPointers(session.user.id, confId, msgBaseId);
      const validated = mailStat ? validatePointers(confBase, mailStat) : confBase;
      session.lastMsgReadConf = validated.lastMsgReadConf || 0;
      session.lastNewReadConf = validated.lastNewReadConf || 0;
    } catch (err) {
      console.error('[joinConference] Failed to load/validate message pointers:', err);
      SysopDebugUtil.debug(
        socket,
        session,
        'Conference Switching',
        `Failed to load/validate message pointers when joining conference`,
        {
          error: err instanceof Error ? err.message : String(err),
          userId: session.user.id,
          conferenceId: confId,
          messageBaseId: msgBaseId
        },
        DebugSeverity.WARNING
      );
      session.lastMsgReadConf = 0;
      session.lastNewReadConf = 0;
    }
  }

  // Log conference join (express.e:9493 callersLog)
  if (session.user) {
    await callersLog(session.user.id, session.user.username, 'Joined conference', conference.name);
  }

  // Like express.e:28576-28577 - load flagged files and command history
  const finalMessage = `Conference joined: ${conference.name} (Base: ${messageBase.name})`;
  finalizeCommand(socket, session, finalMessage);
  await loadFlagged(socket, session);
  await loadHistory(session);

  // Express.e:28579 - Set menuPause flag (pause before next menu display)
  session.menuPause = true;

  // Move to menu display
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  return true;
}
