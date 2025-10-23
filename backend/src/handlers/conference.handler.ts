/**
 * Conference Handler - Conference management and bulletins
 *
 * Handles conference joining, bulletin display, and conference scanning.
 * Based on express.e conference functions.
 */

import { displayScreen, doPause } from './screen.handler';

// Types (will be provided by index.ts)
interface BBSSession {
  currentConf?: number;
  currentMsgBase?: number;
  currentConfName?: string;
  confRJoin: number;
  msgBaseRJoin: number;
  relConfNum?: number;
  user?: {
    id: string;
    username: string;
    lastScanTime?: Date;
    lastLogin?: Date;
  };
  subState: string;
}

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
let LoggedOnSubState: any;

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
  LoggedOnSubState: any;
}) {
  SCREEN_BULL = constants.SCREEN_BULL;
  SCREEN_NODE_BULL = constants.SCREEN_NODE_BULL;
  LoggedOnSubState = constants.LoggedOnSubState;
}

/**
 * Display conference bulletins and trigger conference scan
 * Like express.e:28566-28577 - SCREEN_NODE_BULL + confScan
 */
export async function displayConferenceBulletins(socket: any, session: BBSSession) {
  // Phase 8: Use authentic screen file system
  // Express.e:28566 - displayScreen(SCREEN_BULL)
  displayScreen(socket, session, SCREEN_BULL);
  doPause(socket, session);

  // Express.e:28571 - displayScreen(SCREEN_NODE_BULL)
  displayScreen(socket, session, SCREEN_NODE_BULL);
  doPause(socket, session);

  // Conference scan (confScan equivalent - express.e:28066)
  socket.emit('ansi-output', '\r\n\x1b[32mScanning conferences for new messages...\x1b[0m\r\n');

  // Get user's last scan time (use last login if no scan time stored)
  const lastScanTime = session.user!.lastScanTime || session.user!.lastLogin || new Date(0);

  // Query for new messages per conference since last scan
  const newMessagesQuery = await db.query(
    `SELECT c.id, c.name, COUNT(m.id) as new_count
     FROM conferences c
     LEFT JOIN messages m ON m.conferenceid = c.id AND m.timestamp > $1
     GROUP BY c.id, c.name
     HAVING COUNT(m.id) > 0
     ORDER BY c.id`,
    [lastScanTime]
  );

  if (newMessagesQuery.rows.length > 0) {
    socket.emit('ansi-output', '\x1b[32mFound new messages in:\x1b[0m\r\n');
    newMessagesQuery.rows.forEach((row: any) => {
      socket.emit('ansi-output', `- ${row.name} conference (${row.new_count} new)\r\n`);
    });
  } else {
    socket.emit('ansi-output', '\x1b[33mNo new messages found.\x1b[0m\r\n');
  }

  // Update last scan time
  // TODO: Add lastScanTime column to users table
  // await db.updateUser(session.user!.id, { lastScanTime: new Date() });

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // Join default conference (joinConf equivalent)
  await joinConference(socket, session, session.confRJoin, session.msgBaseRJoin);
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

  socket.emit('ansi-output', `\r\n\x1b[32mJoined conference: ${conference.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', `\r\n\x1b[32mCurrent message base: ${messageBase.name}\x1b[0m\r\n`);

  // Log conference join (express.e:9493 callersLog)
  if (session.user) {
    await callersLog(session.user.id, session.user.username, 'Joined conference', conference.name);
  }

  // Like express.e:28576-28577 - load flagged files and command history
  await loadFlagged(socket, session);
  await loadHistory(session);

  // Show pause prompt before displaying menu
  doPause(socket, session);

  // Move to menu display
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  return true;
}
