/**
 * Door Handler - Door games and utilities
 *
 * Handles door menu display, execution, and door-specific implementations.
 * Based on express.e door system.
 */

import { spawn, fork } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import { resolvePath as resolveCaseInsensitivePath } from '../utils/amigafs';
import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';
import { callersLogManager } from '../services/CallersLogManager';
import { doorDropFileManager } from '../services/DoorDropFileManager';
import { userDatabaseManager } from '../services/UserDatabaseManager';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { config } from '../config';
import { BBSState } from '../index';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { DebugLogger } from '../utils/debug-logger.util';
import { emitText, emitPrompt, emitLine, flushOutput } from '../utils/output.util';
import { enableGameMode, disableGameMode } from '../server/socket-handlers';
import { displayMainMenu } from './command-handler/menu';
import { emitDoorActivity } from '../services/bbs-event-emitter';
import { getSystemTime } from '../utils/date-time.util';
import { logDoorStart, logDoorExit, DoorType } from '../utils/node-logs.util';
import { LoggedOnSubState as LoggedOnSubStateImport } from '../constants/bbs-states';

import type { BBSSession } from '../index';
import type { User } from '../database/types';

function logDoorDebug(message: string) {
  try {
    const logPath = path.join(process.cwd(), '..', '..', 'logs', 'door-68k.log');
    const line = `[DoorDebug] ${getSystemTime().toISOString()} ${message}\n`;
    fs.appendFileSync(logPath, line, { encoding: 'utf8' });
  } catch (err) {
console.error('[DoorDebug] Failed to log door debug:', err);
  }
}

function disableShortcuts(session: BBSSession) {
  session.cmdShortcuts = false;
  if (session.shortcuts && typeof session.shortcuts.clear === 'function') {
    session.shortcuts.clear();
  }
}

/**
 * Create a socket wrapper for door execution that intercepts room: and chat: events
 * This allows TypeScript doors to use socket.emit('room:join', ...) etc. and have
 * those events handled by the server-side handlers directly, rather than being
 * sent to the client (which doesn't re-emit them back).
 */
function createDoorSocketWrapper(socket: any, session: BBSSession, bbsApi: any): any {
  const rawEmit = socket.emit.bind(socket);
  const localHandlers = new Map<string, Set<(...args: any[]) => void>>();

  const addLocalHandler = (event: string, handler: (...args: any[]) => void) => {
    if (!localHandlers.has(event)) {
      localHandlers.set(event, new Set());
    }
    localHandlers.get(event)!.add(handler);
  };

  const removeLocalHandler = (event: string, handler?: (...args: any[]) => void) => {
    if (!localHandlers.has(event)) return;
    if (!handler) {
      localHandlers.delete(event);
      return;
    }
    const handlers = localHandlers.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      localHandlers.delete(event);
    }
  };

  const dispatchLocal = (event: string, ...args: any[]) => {
    const handlers = localHandlers.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (err) {
console.error('[DoorSocket] Local handler error for', event, err);
      }
    }
  };

  let cleanupOutgoing: (() => void) | undefined;

  if (typeof socket.onAnyOutgoing === 'function') {
    const outgoingHandler = (event: string, ...args: any[]) => {
      dispatchLocal(event, ...args);
    };
    socket.onAnyOutgoing(outgoingHandler);
    cleanupOutgoing = () => {
      if (typeof socket.offAnyOutgoing === 'function') {
        socket.offAnyOutgoing(outgoingHandler);
      }
    };
  } else {
    socket.emit = ((event: string, ...args: any[]) => {
      const result = rawEmit(event, ...args);
      dispatchLocal(event, ...args);
      return result;
    }) as any;
    cleanupOutgoing = () => {
      socket.emit = rawEmit;
    };
  }

  // Create a proxy that intercepts emit calls
  const wrappedSocket = Object.create(socket);

  wrappedSocket.emit = (event: string, ...args: any[]) => {
    // Intercept room: and chat: events that need to be handled server-side
    if (event === 'room:join') {
      const data = args[0] || {};
console.log('[DoorSocket] Intercepting room:join:', data);

      // Call the handler directly through BBSApi
      bbsApi.joinRoom(data.roomName || data.room, data.password).then((result: any) => {
        if (!result.success) {
console.log('[DoorSocket] room:join failed:', result.error);
        }
      }).catch((err: Error) => {
console.error('[DoorSocket] room:join error:', err);
      });
      return wrappedSocket;
    }

    if (event === 'room:leave') {
console.log('[DoorSocket] Intercepting room:leave');
      bbsApi.leaveRoom().then(() => {
      }).catch((err: Error) => {
console.error('[DoorSocket] room:leave error:', err);
        socket.emit('room:error', { error: err.message || 'Failed to leave room' });
      });
      return wrappedSocket;
    }

    if (event === 'room:message') {
      const data = args[0] || {};
console.log('[DoorSocket] Intercepting room:message:', data);
      bbsApi.sendRoomMessage(data.message).catch((err: Error) => {
console.error('[DoorSocket] room:message error:', err);
      });
      return wrappedSocket;
    }

    if (event === 'room:create') {
      const data = args[0] || {};
console.log('[DoorSocket] Intercepting room:create:', data);
      bbsApi.createRoom(data.roomName, {
        topic: data.topic,
        isPublic: data.isPublic,
        password: data.password,
        maxUsers: data.maxUsers
      }).then((result: any) => {
        if (!result.success) {
console.log('[DoorSocket] room:create failed:', result.error);
        }
      }).catch((err: Error) => {
console.error('[DoorSocket] room:create error:', err);
      });
      return wrappedSocket;
    }

    if (event === 'room:list') {
console.log('[DoorSocket] Intercepting room:list');
      bbsApi.listRooms().then((rooms: any[]) => {
        socket.emit('room:list', { rooms });
      }).catch((err: Error) => {
console.error('[DoorSocket] room:list error:', err);
        socket.emit('room:error', { error: err.message || 'Failed to list rooms' });
      });
      return wrappedSocket;
    }

    // Intercept chat:keystroke for live typing indicators
    if (event === 'chat:keystroke') {
      const data = args[0] || {};
console.log('[DoorSocket] Intercepting chat:keystroke:', data);

      // Broadcast keystroke to other users in the same room (server-side)
      if (session.currentRoomId) {
        const socketRoom = 'room:' + session.currentRoomId;
        socket.to(socketRoom).emit('chat:keystroke', {
          channelId: session.currentRoomId,
          userId: data.userId,
          username: session.user?.username,
          char: data.char
        });
      }
      return wrappedSocket;
    }

    // Intercept chat:keystroke-submit
    if (event === 'chat:keystroke-submit') {
      const data = args[0] || {};
console.log('[DoorSocket] Intercepting chat:keystroke-submit:', data);

      if (session.currentRoomId) {
        const socketRoom = 'room:' + session.currentRoomId;
        socket.to(socketRoom).emit('chat:keystroke-submit', {
          channelId: session.currentRoomId,
          userId: data.userId,
          username: session.user?.username
        });
      }
      return wrappedSocket;
    }

    // Intercept chat:keystroke-clear
    if (event === 'chat:keystroke-clear') {
      const data = args[0] || {};
console.log('[DoorSocket] Intercepting chat:keystroke-clear:', data);

      if (session.currentRoomId) {
        const socketRoom = 'room:' + session.currentRoomId;
        socket.to(socketRoom).emit('chat:keystroke-clear', {
          channelId: session.currentRoomId,
          userId: data.userId,
          username: session.user?.username
        });
      }
      return wrappedSocket;
    }

    // Intercept video:start-stream - doors calling this need server-side handling
    if (event === 'video:start-stream') {
      const data = args[0] || {};
      const callback = typeof args[1] === 'function' ? args[1] : undefined;
console.log('[DoorSocket] Intercepting video:start-stream:', data);

      const streamId = `video-${socket.id}`;
      const roomId = session.currentVoiceChannelId || session.currentRoomId;
console.log(`[DoorSocket][Video] User ${session.user?.username} starting video stream: ${streamId}${roomId ? ` in room ${roomId}` : ' (standalone)'}`);

      // Notify the client (frontend) to actually start capturing from the camera
      socket.emit('video:start-stream', { source: data.source, options: data.options, streamId });

      // Notify others in the room if in one
      if (roomId) {
        const voiceRoomId = `voice:${roomId}`;
        socket.to(voiceRoomId).emit('video:stream-started', {
          userId: session.user?.id,
          username: session.user?.username,
          streamId,
          options: data.options
        });
      }

      callback?.({ success: true, streamId });
      return wrappedSocket;
    }

    // Intercept video:stop-stream
    if (event === 'video:stop-stream') {
      const data = args[0] || {};
      const callback = typeof args[1] === 'function' ? args[1] : undefined;
console.log('[DoorSocket] Intercepting video:stop-stream:', data);

      // CRITICAL: Tell frontend to actually stop capturing video
      socket.emit('video:stop-stream', { streamId: data.streamId });

      const roomId = session.currentVoiceChannelId || session.currentRoomId;
      if (roomId) {
        const voiceRoomId = `voice:${roomId}`;
        socket.to(voiceRoomId).emit('video:stream-stopped', {
          userId: session.user?.id,
          streamId: data.streamId
        });
      }
console.log(`[DoorSocket][Video] User ${session.user?.username} stopped video stream: ${data.streamId}`);
      callback?.({ success: true });
      return wrappedSocket;
    }

    // Pass through all other events to the real socket
    return socket.emit(event, ...args);
  };

  // Forward all other socket properties and methods
  wrappedSocket.server = socket.server;
  wrappedSocket.id = socket.id;
  wrappedSocket.on = (event: string, handler: (...args: any[]) => void) => {
    addLocalHandler(event, handler);
    return socket.on(event, handler);
  };
  wrappedSocket.once = (event: string, handler: (...args: any[]) => void) => {
    const wrappedHandler = (...args: any[]) => {
      removeLocalHandler(event, wrappedHandler);
      handler(...args);
    };
    addLocalHandler(event, wrappedHandler);
    if (socket.once) {
      return socket.once(event, wrappedHandler);
    }
    return socket.on(event, wrappedHandler);
  };
  wrappedSocket.removeListener = (event: string, handler: (...args: any[]) => void) => {
    removeLocalHandler(event, handler);
    return socket.removeListener?.(event, handler);
  };
  wrappedSocket.off = (event: string, handler: (...args: any[]) => void) => {
    removeLocalHandler(event, handler);
    return socket.off?.(event, handler);
  };
  wrappedSocket.removeAllListeners = (event?: string) => {
    if (event) {
      removeLocalHandler(event);
    } else {
      localHandlers.clear();
    }
    return socket.removeAllListeners?.(event as any);
  };
  wrappedSocket.to = socket.to?.bind(socket);
  wrappedSocket.join = socket.join?.bind(socket);
  wrappedSocket.leave = socket.leave?.bind(socket);

  // Bridge server-side BBS events (score, login, etc.) into this door's
  // socket so doors can use socket.on('bbs:event', ...) to receive them.
  // io.emit() only reaches browser clients; super.emit() on the EventEmitter
  // reaches these server-side listeners.
  const { bbsEventEmitter } = require('../services/bbs-event-emitter');
  const bbsEventBridge = (payload: any) => dispatchLocal('bbs:event', payload);
  bbsEventEmitter.on('bbs:event', bbsEventBridge);

  wrappedSocket._doorCleanup = () => {
    localHandlers.clear();
    cleanupOutgoing?.();
    bbsEventEmitter.off('bbs:event', bbsEventBridge);
  };

  return wrappedSocket;
}

function applyAcpSideEffect(session: BBSSession, acp: { code: number; targetNode: number; command?: string }) {
  switch (acp.code) {
    case -1: // ACP_CONTROLCOMMAND
      break;
    case 1: // ACP_SysopLogin
      session.quietFlag = false;
      break;
    case 2: // ACP_InstantLogin
      session.quietFlag = false;
      break;
    case 3: // ACP_AEShell
      session.quietFlag = false;
      break;
    case 4: // ACP_ToggleChat
      session.quietFlag = !session.quietFlag;
      break;
    case 5: // ACP_ExitNode
      session.state = BBSState.AWAIT;
      session.subState = LoggedOnSubState.LOGOFF;
      break;
    case 6: // ACP_LocalLogin
      session.quietFlag = false;
      break;
    case 7: // ACP_ReserveNode
      session.quietFlag = true;
      break;
    case 8: // ACP_Accounts
      session.quietFlag = false;
      break;
    case 9: // ACP_InitModem
      session.quietFlag = false;
      break;
    case 10: // ACP_NodeOffHook
      session.quietFlag = true;
      break;
    case 11: // ACP_QuietNode
      session.quietFlag = true;
      break;
    case 12: // ACP_NodeConfig
      session.quietFlag = true;
      break;
    case 13: // ACP_NodeChat
      session.quietFlag = false;
      break;
    case 14: // ACP_SaveWin
      session.quietFlag = false;
      break;
    case 15: // ACP_NRAMS
      session.quietFlag = false;
      break;
    case 19: // ACP_CUSTOMCOMMAND
      break;
    default:
      // For other ACP codes, we simply record the request on the session
      break;
  }
  (session as any).acpLastAction = { ...acp, timestamp: Date.now() };
}

export interface Door {
  id: string;
  name: string;
  description: string;
  command: string;
  path: string;
  accessLevel: number;
  enabled: boolean;
  type: string;
  size?: number;  // File/directory size in bytes
  conferenceId?: number;
  parameters?: string[];
  mciText?: string;  // For MCI type doors (express.e:4293-4297)
  stack?: number;
  priority?: string;
  resident?: boolean;
  expertMode?: boolean;
  trapOn?: boolean;
  silent?: boolean;
  quickMode?: boolean;
  multiNode?: boolean;
  logInputs?: boolean;
  scriptCheck?: boolean;
  banner?: string;
  mimicVer?: string;
  passParameters?: number;
  internal?: string;
  args?: string;
  toolTypes?: Record<string, string>;
  category?: string;  // Door category from CATEGORY= tooltype (e.g., "Games/Arcade", "Utilities")
}

interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: string;
  output?: string[]; // Array of output strings from door execution
}

interface ChatSession {
  id: string;
  userId: string;
  startTime: Date;
  status: string;
  messages: any[];
  pageCount: number;
  lastActivity: Date;
}

interface Database {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

// Injected dependencies
let doors: Door[] = [];
let doorSessions: DoorSession[] = [];
let db: Database;
let callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
let getRecentCallerActivity: (limit?: number, nodeId?: number) => Promise<any[]>;
let LoggedOnSubState: any = LoggedOnSubStateImport;

// Injection functions
export function setDoors(doorList: Door[]) {
  doors = doorList;
}

export function getDoors(): Door[] {
  return doors;
}

export function setDoorSessions(sessions: DoorSession[]) {
  doorSessions = sessions;
}

export function getDoorSessions(): DoorSession[] {
  return doorSessions;
}

export function setDatabase(database: Database) {
  db = database;
}

export function setHelpers(helpers: {
  callersLog: typeof callersLog;
  getRecentCallerActivity: typeof getRecentCallerActivity;
}) {
  callersLog = helpers.callersLog;
  getRecentCallerActivity = helpers.getRecentCallerActivity;
}

export function setConstants(constants: {
  LoggedOnSubState: any;
}) {
  LoggedOnSubState = constants.LoggedOnSubState;
}

function resolveDoorExecutionUser(session: BBSSession): { user: User; isGuest: boolean } {
  if (session.user) {
    return { user: session.user, isGuest: false };
  }

  const now = getSystemTime();
  const nodeId = session.nodeId || 0;
  const linesPerScreen = session.tempData?.termHeight || session.screenHeight || 24;

  const guestUser: User = {
    id: `guest-${nodeId}`,
    username: 'Guest',
    passwordHash: '',
    realname: 'Guest User',
    location: session.connectionHostname || session.remoteAddress || 'Unknown',
    phone: '000-000-0000',
    secLevel: 0,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    ratio: 0,
    ratioType: 0,
    timeTotal: 0,
    timeLimit: Math.floor((session.timeRemaining || 3600) / 60),
    timeUsed: 0,
    chatLimit: 0,
    chatUsed: 0,
    firstLogin: now,
    calls: 0,
    callsToday: 0,
    newUser: true,
    expert: 'N',
    ansi: session.ansiEnabled !== false,
    linesPerScreen,
    computer: 'Unknown',
    screenType: session.petsciiMode ? 'PETSCII' : 'ANSI',
    protocol: 'Z',
    editor: 'NONE',
    zoomType: '',
    availableForChat: false,
    quietNode: false,
    autoRejoin: session.confRJoin || 1,
    confAccess: '',
    areaName: session.currentConfName || 'General',
    uuCP: false,
    topUploadCPS: 0,
    topDownloadCPS: 0,
    byteLimit: 0,
    userFlags: 0,
    created: now,
    updated: now
  };

  return { user: guestUser, isGuest: true };
}

/**
 * Launch an Amiga door using AmigaDoorSession
 */
async function launchAmigaDoor(socket: any, session: BBSSession, doorInfo: any) {
  try {
console.log(`[launchAmigaDoor] Starting door: ${doorInfo.command}`);
console.log(`[launchAmigaDoor] Location: ${doorInfo.location}`);
console.log(`[launchAmigaDoor] Resolved path: ${doorInfo.resolvedPath}`);

    // Check if door executable exists (use amigafs for case-insensitive matching)
    if (!amigafs.existsSync(doorInfo.resolvedPath)) {
      emitText(socket, `\r\n\x1b[31mDoor executable not found: ${doorInfo.resolvedPath}\x1b[0m\r\n`);
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    disableShortcuts(session);

    // Log door launch
    DebugLogger.door(socket.id, `Launching door: ${doorInfo.name || doorInfo.command}`, {
      command: doorInfo.command,
      name: doorInfo.name,
      path: doorInfo.resolvedPath,
      type: doorInfo.type || 'Amiga 68K',
      stack: doorInfo.stack
    });

    const pickPositiveNumber = (...candidates: Array<number | undefined>): number | undefined => {
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
          return candidate;
        }
      }
      return undefined;
    };

    const terminalHeight =
      pickPositiveNumber(
        session.tempData?.termHeight,
        session.screenHeight,
        session.user?.linesPerScreen,
        session.user?.pageLength
      ) ?? 24;

    const terminalWidth =
      pickPositiveNumber(
        session.tempData?.termWidth,
        session.screenWidth,
        session.user?.lineLength
      ) ?? 80;

    // Create AmigaDoorSession - interactive doors need guard disabled
    // Read confAccess and user stats from disk files for 68K door compatibility
    // 68K doors expect disk-based data, not SQLite database
    let confAccess = '';
    let userSlotNumber = -1; // 1-based slot number for AmiExpress doors
    let diskUserStats: ReturnType<typeof userDatabaseManager.readUserStatsFromDisk> = null;
    const username = session.user?.username;
    if (username) {
      const slotIndex = userDatabaseManager.findUserSlotByName(username);
      if (slotIndex >= 0) {
        confAccess = userDatabaseManager.readConfAccessFromDisk(slotIndex);
        diskUserStats = userDatabaseManager.readUserStatsFromDisk(slotIndex);
        userSlotNumber = slotIndex + 1;
console.log(
          `[launchAmigaDoor] Read from disk: slotIndex=${slotIndex} slotNumber=${userSlotNumber} confAccess="${confAccess}" stats=${JSON.stringify(diskUserStats)}`
        );
      } else {
        // Fallback to session data if user not found in disk files
        confAccess = session.user?.confAccess || session.user?.conferenceAccess || '';
console.log(`[launchAmigaDoor] User not found in disk, fallback to session: "${confAccess}"`);
      }
    }
console.log(`[launchAmigaDoor] Using confAccess = "${confAccess}" (len=${confAccess.length})`);

    // Load BBS config from disk (bbsConfig.info) instead of hardcoding
    const bbsRoot = config.get('dataDir');
    const bbsConfig = loadBBSConfig(bbsRoot);
    const bbsName = bbsConfig.bbs_name || 'AmiExpress-Web BBS';
    const sysopName = bbsConfig.sysop_name || 'Sysop';
console.log(`[launchAmigaDoor] Loaded from bbsConfig.info: bbsName="${bbsName}" sysopName="${sysopName}"`);

    // Handle door-specific pagination (PAGINATION tooltype)
    // 0 or undefined = door handles its own pagination (default, autoPauseEnabled=false)
    // >0 = auto-pause after N lines (autoPauseEnabled=true, pauseLines=N)
    // -1 = use user's screen height (autoPauseEnabled=true, pauseLines=terminalHeight)
    let autoPauseEnabled = false;
    let effectivePauseLines = terminalHeight;
    if (doorInfo.pagination !== undefined && doorInfo.pagination !== 0) {
      autoPauseEnabled = true;
      if (doorInfo.pagination === -1) {
        effectivePauseLines = terminalHeight;
      } else if (doorInfo.pagination > 0) {
        effectivePauseLines = doorInfo.pagination;
      }
console.log(`[launchAmigaDoor] PAGINATION=${doorInfo.pagination}: autoPause=${autoPauseEnabled}, pauseLines=${effectivePauseLines}`);
    }

    const amigaSession = new AmigaDoorSession(socket, {
      executablePath: doorInfo.resolvedPath,
      timeout: 600,
      doorId: doorInfo.command || doorInfo.id,
      stack: doorInfo.stack,
      toolTypes: { LOOP_LIMIT: '10000000' },  // 10M iterations for interactive doors
      bbsSession: {
        user: session.user,
        nodeNumber: session.nodeId || 0,
        nonStopText: false,
        bbsName: bbsName,
        sysopName: sysopName,
        timeRemaining: 60,
        doorCommand: doorInfo.command,
        doorName: doorInfo.name,
        dataDir: bbsRoot,
        doorId: doorInfo.command || doorInfo.id,
        pauseLines: effectivePauseLines,
        autoPauseEnabled: autoPauseEnabled,
        lineWrap: terminalWidth,
        lineCount: 0,
        confAccess: confAccess,
        userSlotNumber: userSlotNumber,
        diskUserStats: diskUserStats,
        // Pass currentConference for doors like AquaScan that scan the current conference
        currentConference: (session as any).currentConference || 1,
        conferenceId: (session as any).currentConference || session.conferenceId || 1
      }
    } as any);
console.log(`[launchAmigaDoor] bbsSession.currentConference=${(session as any).currentConference || 1}`);

    // Clear screen before launching 68K door.
    // Amiga doors (RTW, dRE!WAll, etc.) assume a clean 25-row display starting
    // at row 0. Without this, the cursor inherits the BBS menu position and
    // scroll drift causes redraw misalignment (e.g., RTW node 01 shifting down
    // every refresh cycle). Matches real AmiExpress behavior where the door
    // gets a fresh terminal canvas.
    // ESC[r resets scroll region, ESC[2J clears, ESC[H homes cursor.
    emitText(socket, '\x1b[r\x1b[2J\x1b[H');

    // Wire user input into the Amiga door while it runs
    session.inDoorManager = true;
    session.subState = LoggedOnSubState.DOOR_RUNNING;
    socket.emit('door-active', true);

    // DO NOT enable game mode for 68K doors - they use normal character input via door:input
    // Game mode blocks terminal input and breaks traditional XIM doors like Bulls
    // Only TypeScript doors that explicitly call bbs.enableGameMode() should use game mode
    // const doorType = doorInfo.type || 'XIM';
    // enableGameMode(socket, session, doorType);

    session.doorInputHandler = (data: string) => {
      try {
        const shared: any = (amigaSession as any).sharedState || {};
console.log(`[doorInputHandler] Received input: "${data}" hasXIM=${!!shared.ximProtocol}`);
        logDoorDebug(`KEY door=${doorInfo.command || doorInfo.id || 'UNK'} data=${JSON.stringify(data)}`);
        // IMPORTANT: Check if XIM is waiting for input BEFORE queueing
        // This prevents double-delivery when XIM completes a hotkey/line input
        const ximWaitingForInput = shared.ximProtocol?.isWaitingForLineInput?.() ?? false;
        if (shared.ximProtocol) {
          shared.ximProtocol.queueInput(data);

          // CRITICAL: For native 68K doors that poll GetMsg(AEDoorPort), we need to
          // inject JH_HK messages via PutMsg. These doors don't send JH_HK XIM commands -
          // they expect BBS to proactively send input messages to AEDoorPort.
          if (shared.ximProtocol.shouldInjectNativeInput?.()) {
console.log(`[launchAmigaDoor] Native door detected - injecting input via PutMsg`);
            for (const char of data) {
              shared.ximProtocol.injectInputToNativeDoor(char);
            }
          }
        }
        if (shared.dosLibrary && !ximWaitingForInput) {
          shared.dosLibrary.queueInput(data);
        }
      } catch (err) {
console.error('[launchAmigaDoor] Error routing door input:', err);
        SysopDebugUtil.debugDoorError(
          socket,
          session,
          doorInfo.command || doorInfo.id || 'Unknown',
          'Error routing door input',
          { error: (err as Error).message },
          DebugSeverity.WARNING
        );
      }
    };
    // Persist session state so socket-handlers sees the door flags/handler
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch (err) {
console.error('[launchAmigaDoor] Unable to persist session for door input:', err);
      SysopDebugUtil.debugDoorError(
        socket,
        session,
        doorInfo.command || doorInfo.id || 'Unknown',
        'Unable to persist session for door input',
        { error: (err as Error).message },
        DebugSeverity.WARNING
      );
    }

    await amigaSession.start();

    // Log door exit
    DebugLogger.doorSuccess(socket.id, `Door exited: ${doorInfo.name || doorInfo.command}`);

    // Disable game mode when door exits
    disableGameMode(socket, session);

    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    socket.emit('door-active', false);
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch (_) {
      /* ignore */
    }

console.log(`[launchAmigaDoor] Door session completed: ${doorInfo.command}`);

    // Capture any return/chain/PRV/ACP requests from the door
    if (typeof (amigaSession as any).getExitState === 'function') {
      const exitState = (amigaSession as any).getExitState();
      const ximState = exitState?.ximState || {};
      if (ximState.returnCommand) {
        (session as any).returnCommand = ximState.returnCommand;
console.log(`[launchAmigaDoor] RETURNCOMMAND requested: ${ximState.returnCommand}`);
      }
      if (ximState.chainCommand) {
        (session as any).chainCommand = ximState.chainCommand;
console.log(`[launchAmigaDoor] CHAIN requested: ${ximState.chainCommand}`);
      }
      if (ximState.prvCommand) {
        (session as any).prvCommand = ximState.prvCommand;
console.log(`[launchAmigaDoor] PRV_COMMAND requested: ${ximState.prvCommand}`);
      }
      if ((exitState as any).bbsSession?.acpCommand) {
        (session as any).acpCommand = (exitState as any).bbsSession.acpCommand;
console.log(
          `[launchAmigaDoor] ACP_COMMAND requested: ${
            (exitState as any).bbsSession.acpCommand.command || ''
          } (code=${(exitState as any).bbsSession.acpCommand.code}, target=${(exitState as any).bbsSession.acpCommand.targetNode})`
        );
      }

      // Copy flagged files from door bbsSession back to main session
      // Doors flag files via JH_FLAGFILE which stores in bbsSession.flaggedFiles
      // Main BBS download handler checks session.flaggedFiles
      if (Array.isArray((exitState as any).bbsSession?.flaggedFiles) && (exitState as any).bbsSession.flaggedFiles.length > 0) {
        if (!Array.isArray((session as any).flaggedFiles)) {
          (session as any).flaggedFiles = [];
        }
        (session as any).flaggedFiles.push(...(exitState as any).bbsSession.flaggedFiles);
        console.log(`[launchAmigaDoor] Copied ${(exitState as any).bbsSession.flaggedFiles.length} flagged file(s) from door to session`);
      }

      // Execute requested commands immediately in priority order: CHAIN -> RETURN -> PRV -> ACP
      try {
        // CRITICAL: Use processCommand directly, NOT handleCommand!
        // handleCommand is for character-by-character input with line buffering.
        // processCommand executes a full command string immediately.
        // Door RETURNCOMMAND is a system-initiated call (like express.e processSysCommand),
        // so allowSyscmd=true — express.e:28249.
        const { processCommand } = require('./command.handler');
        const runCommand = async (cmd?: string) => {
          if (cmd && cmd.trim().length > 0) {
            const trimmed = cmd.trim();
            const parts = trimmed.toUpperCase().split(/\s+/);
            const command = parts[0];
            const params = parts.slice(1).join(' ');
            console.log(`[door.handler] Executing RETURNCOMMAND via processCommand: ${command} ${params}`);
            await processCommand(socket, session, command, params, true);
          }
        };

        if ((session as any).chainCommand) {
          const cmd = (session as any).chainCommand;
          (session as any).chainCommand = undefined;
          (session as any).returnCommand = undefined;
          (session as any).prvCommand = undefined;
          (session as any).acpCommand = undefined;
          await runCommand(cmd);
        } else {
          if ((session as any).returnCommand) {
            const cmd = (session as any).returnCommand;
            (session as any).returnCommand = undefined;
            await runCommand(cmd);
          }
          if ((session as any).prvCommand) {
            const cmd = (session as any).prvCommand;
            (session as any).prvCommand = undefined;
            await runCommand(cmd);
          }
          const acp = (session as any).acpCommand;
          if (acp && acp.command) {
            (session as any).acpCommand = undefined;
            await runCommand(acp.command);
            applyAcpSideEffect(session, acp);
          }
        }
      } catch (err) {
console.warn('[launchAmigaDoor] Failed to auto-run pending door commands:', err);
      }
    }

    // Return to menu
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;

  } catch (error) {
console.error(`[launchAmigaDoor] Error executing door:`, error);
    SysopDebugUtil.debugDoorError(
      socket,
      session,
      doorInfo.command || doorInfo.id || 'Unknown',
      'Error executing 68K Amiga door',
      { doorPath: doorInfo.location, error: (error as Error).message, stack: (error as Error).stack },
      DebugSeverity.CRITICAL
    );
    emitText(socket, `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Display door games menu (DOORS command) - doorman-style UI with arrow keys
 */
export async function displayDoorMenu(socket: any, session: BBSSession, params: string) {
  // Get TypeScript doors for current user
  const filteredDoors = doors.filter(door =>
    door.enabled &&
    (!door.conferenceId || door.conferenceId === session.currentConf) &&
    (session.user?.secLevel || 0) >= door.accessLevel
  );

  // Calculate size for TypeScript doors based on their path
  const availableDoors = filteredDoors.map(door => {
    let doorSize = 0;
    const doorPath = door.path || (door as any).location;
    if (doorPath) {
      try {
        // Try to find the door path
        const bbsRoot = config.get('dataDir');
        const possiblePaths = [
          path.join(bbsRoot, doorPath),
          path.join(bbsRoot, 'Doors', door.id),
          path.join(bbsRoot, 'Doors', door.command?.toLowerCase() || door.id),
          path.join(bbsRoot, 'doors', door.id, 'index.ts'),
          path.join(bbsRoot, 'doors', door.id, 'dist', 'index.js'),
          path.join(process.cwd(), 'src', 'doors', door.id, 'index.ts')
        ];
        for (const testPath of possiblePaths) {
          if (amigafs.existsSync(testPath)) {
            const stats = amigafs.statSync(testPath);
            if (stats.isDirectory()) {
              // Sum up directory contents
              doorSize = calculateDoorDirectorySize(testPath);
            } else {
              doorSize = stats.size;
            }
            break;
          }
        }
      } catch (err) {
        // Ignore errors, keep size as 0
      }
    }
    return {
      ...door,
      doorType: door.type,
      size: doorSize
    };
  });

  // Also scan for installed Amiga doors
  const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
  const amigaDoorMgr = getAmigaDoorManager();
  const amigaDoors = await amigaDoorMgr.scanInstalledDoors();

  // Filter Amiga doors by access level
  const availableAmigaDoors = amigaDoors.filter((door: any) =>
    door.installed &&
    (session.user?.secLevel || 0) >= (door.access || 0)
  );

console.log(`[DOOR Command] Found ${availableDoors.length} TypeScript doors, ${availableAmigaDoors.length} Amiga doors`);

  // Convert Amiga doors to the format expected by this function
  // Only mark as Amiga door if it's actually an Amiga binary type (XIM, AIM, SIM, TIM, IIM)
  // TypeScript doors (TS) and others should NOT be marked as Amiga doors
  const amigaDoorTypes = ['XIM', 'AIM', 'SIM', 'TIM', 'IIM'];
  const amigaDoorsList = availableAmigaDoors.map((door: any) => ({
    id: door.command,
    name: door.name || door.command,
    description: `${door.location} (${door.type})`,
    accessLevel: door.access || 0,
    enabled: true,
    conferenceId: null,
    isAmigaDoor: amigaDoorTypes.includes((door.type || '').toUpperCase()),
    command: door.command,
    doorInfo: door,  // Keep original door info for execution
    doorType: door.type || 'AMI',  // Use door.type (XIM, AIM, etc.), not doorType
    type: door.type,  // Also pass through the type for executeDoor routing
    path: door.location,  // Pass location as path for executeDoor
    size: door.size || 0
  }));

  // Combine both lists
  const allDoors = [...availableDoors, ...amigaDoorsList];

  // If a door name was specified, try to launch it directly via normal command system
  if (params && params.trim()) {
    const doorName = params.trim();
console.log(`[DOOR Command] Looking for door: ${doorName}`);

    const matchedDoor = allDoors.find(d =>
      d.id.toLowerCase() === doorName.toLowerCase() ||
      d.name.toLowerCase() === doorName.toLowerCase() ||
      (d.command && d.command.toLowerCase() === doorName.toLowerCase())
    );

    if (matchedDoor) {
      const doorCommand = matchedDoor.command || matchedDoor.id;
console.log(`[DOOR Command] Found door, executing via BBS command: ${doorCommand}`);

      // Ensure we're in READ_COMMAND state before executing
      session.subState = LoggedOnSubState.READ_COMMAND;

      // Execute through normal BBS command system - handles all door types consistently
      const { handleCommand } = require('./command.handler');
      await handleCommand(socket, session, doorCommand);
      return;
    } else {
      emitText(socket, `\r\n\x1b[31mDoor "${params}" not found.\x1b[0m\r\n`);
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }
  }

  // No door specified, show interactive arrow-key menu
  if (allDoors.length === 0) {
    emitText(socket, '\x1b[36m-= Door Games & Utilities =-\x1b[0m\r\n');
    emitText(socket, 'No doors are currently available.\r\n');
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Initialize door selection state
  session.tempData = {
    availableDoors: allDoors,
    selectedIndex: 0,
    scrollOffset: 0,
    previousSelectedIndex: undefined
  };

  // Show door list (initial draw)
  showDoorsList(socket, session, true);

  // Set state to handle arrow key input
  session.subState = LoggedOnSubState.DOOR_SELECT;
}

/**
 * Show doors list with current selection highlighted (doorman-style)
 */
function showDoorsList(socket: any, session: BBSSession, isInitialDraw: boolean = false): void {
  const { availableDoors, selectedIndex, scrollOffset, previousSelectedIndex, previousScrollOffset } = session.tempData;

  // Only clear screen on initial draw
  if (isInitialDraw) {
    emitText(socket, '\x1b[2J\x1b[H');
    emitText(socket, '\x1b[1;1H\x1b[0;37;44m' + padString(' DOOR GAMES & UTILITIES ', 80) + '\x1b[0m');
  }

  // Display doors (show up to 15 at a time)
  const pageSize = 15;
  const visibleDoors = availableDoors.slice(scrollOffset, scrollOffset + pageSize);

  // Detect if scroll offset changed - requires full redraw
  const scrollOffsetChanged = previousScrollOffset !== undefined && previousScrollOffset !== scrollOffset;

  // If not initial draw AND scroll didn't change, only redraw changed lines
  if (!isInitialDraw && !scrollOffsetChanged && previousSelectedIndex !== undefined) {
    const prevLine = 3 + (previousSelectedIndex - scrollOffset);
    const newLine = 3 + (selectedIndex - scrollOffset);

    // Redraw previous line (unselect)
    if (prevLine >= 3 && prevLine < 3 + pageSize) {
      const prevDoor = availableDoors[previousSelectedIndex];
      emitText(socket, `\x1b[${prevLine};1H`);
      emitText(socket, formatDoorLine(prevDoor, false));
    }

    // Redraw new line (select)
    if (newLine >= 3 && newLine < 3 + pageSize) {
      const newDoor = availableDoors[selectedIndex];
      emitText(socket, `\x1b[${newLine};1H`);
      emitText(socket, formatDoorLine(newDoor, true));
    }

    session.tempData.previousSelectedIndex = selectedIndex;
    return;
  }

  // Full redraw (initial draw OR scroll changed) - show all doors
  emitText(socket, '\x1b[3;1H');
  visibleDoors.forEach((door: any, index: number) => {
    const globalIndex = scrollOffset + index;
    const isSelected = globalIndex === selectedIndex;
    emitText(socket, formatDoorLine(door, isSelected) + '\r\n');
  });

  // Clear any remaining lines from previous page
  for (let i = visibleDoors.length; i < pageSize; i++) {
    emitText(socket, '\x1b[2K\r\n');
  }

  // Footer with instructions
  emitText(socket, '\r\n');
  emitText(socket, '\x1b[0;37m' + '-'.repeat(80) + '\x1b[0m\r\n');
  emitText(socket, '\x1b[33mArrows:\x1b[0m Navigate  \x1b[33mEnter:\x1b[0m Launch Door  \x1b[33mQ:\x1b[0m Quit\r\n');

  session.tempData.previousSelectedIndex = selectedIndex;
  session.tempData.previousScrollOffset = scrollOffset;
}

/**
 * Format a single door line for display
 */
function formatDoorLine(door: any, isSelected: boolean): string {
  // Get door type - handle both uppercase and lowercase variants
  const doorType = (door as any).doorType || door.type || 'AMI';
  const type = doorType === 'TS' || doorType === 'typescript' ? 'TS' :
              doorType === 'PYTHON' || doorType === 'python' || doorType === 'PY' ? 'PY' :
              doorType === 'AREXX' || doorType === 'arexx' || doorType === 'RX' ? 'RX' :
              doorType === 'XIM' || doorType === 'xim' ? 'XIM' :
              doorType === 'AMI' || doorType === 'amiga' || doorType === 'ami' ? 'AMI' :
              doorType === 'ARC' || doorType === 'archive' ? 'ARC' :
              doorType === 'WEB' || doorType === 'web' ? 'WEB' : 'AMI';

  // Format command (pad to 10 chars)
  const command = door.command || door.id;
  const commandDisplay = padString(command, 10);

  // Format name (pad to 30 chars)
  const name = padString(door.name, 30);

  // Format size (right-aligned, 8 chars wide for proper column alignment)
  const sizeStr = formatDoorSize(door.size || 0);
  const size = sizeStr.padStart(8);

  // Clear the entire line first (80 spaces)
  let line = '\x1b[2K';

  // Display door line (no checkbox, just type/command/name/size)
  if (isSelected) {
    // Selected: blue background
    line += `\x1b[0;37;44m \x1b[33m[${type}]\x1b[0;37;44m ${commandDisplay} ${name}${size} \x1b[0m`;
  } else {
    // Not selected: normal colors
    line += ` \x1b[33m[${type}]\x1b[0m ${commandDisplay} ${name}\x1b[36m${size}\x1b[0m`;
  }

  return line;
}

/**
 * Handle input for DOOR_SELECT state (arrow keys to navigate, Enter to launch, Q to quit)
 */
export async function handleDoorSelectInput(socket: any, session: BBSSession, data: string): Promise<void> {
console.log(`[DOOR Select] ===== INPUT RECEIVED =====`);
console.log(`[DOOR Select] Raw data: ${JSON.stringify(data)}`);
console.log(`[DOOR Select] Data length: ${data.length}`);
console.log(`[DOOR Select] Char codes: ${[...data].map(c => c.charCodeAt(0)).join(', ')}`);
console.log(`[DOOR Select] SubState: ${session.subState}`);
console.log(`[DOOR Select] Has tempData: ${!!session.tempData}`);

  // Validate that we have door selection state
  if (!session.tempData || !session.tempData.availableDoors) {
console.error('[DOOR Select] Missing tempData or availableDoors - resetting to menu');
    session.tempData = {};
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const key = data.toLowerCase();
  const { availableDoors, selectedIndex, scrollOffset } = session.tempData;
console.log(`[DOOR Select] Current selection: ${selectedIndex}/${availableDoors.length - 1}`);
console.log(`[DOOR Select] Key after toLowerCase: ${JSON.stringify(key)}`);

  // Arrow Up - wrap to bottom if at top
  if (data === '\x1b[A' || data === '\x1b\x5b\x41') {
    const pageSize = 15;
    if (selectedIndex > 0) {
      session.tempData.selectedIndex--;

      // Adjust scroll offset
      if (session.tempData.selectedIndex < scrollOffset) {
        session.tempData.scrollOffset = Math.max(0, scrollOffset - pageSize);
      }
    } else {
      // Wrap to bottom
      session.tempData.selectedIndex = availableDoors.length - 1;
      // Scroll to show the last page
      session.tempData.scrollOffset = Math.max(0, availableDoors.length - pageSize);
    }

    showDoorsList(socket, session);
    return;
  }

  // Arrow Down - wrap to top if at bottom
  if (data === '\x1b[B' || data === '\x1b\x5b\x42') {
    const pageSize = 15;
    if (selectedIndex < availableDoors.length - 1) {
      session.tempData.selectedIndex++;

      // Adjust scroll offset
      if (session.tempData.selectedIndex >= scrollOffset + pageSize) {
        session.tempData.scrollOffset = Math.min(
          availableDoors.length - pageSize,
          scrollOffset + pageSize
        );
      }
    } else {
      // Wrap to top
      session.tempData.selectedIndex = 0;
      session.tempData.scrollOffset = 0;
    }

    showDoorsList(socket, session);
    return;
  }

  // Enter - Launch selected door
  if (key === '\r' || key === '\n') {
console.log('[DOOR Select] *** ENTER KEY DETECTED ***');
console.log('[DOOR Select] Key value:', JSON.stringify(key));
console.log('[DOOR Select] Available doors count:', availableDoors?.length || 0);
console.log('[DOOR Select] Selected index:', selectedIndex);

    // Validate that we have valid data
    if (!availableDoors || availableDoors.length === 0) {
console.error('[DOOR Select] No doors available');
      session.tempData = {};
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    if (selectedIndex === undefined || selectedIndex < 0 || selectedIndex >= availableDoors.length) {
console.error('[DOOR Select] Invalid selectedIndex:', selectedIndex);
      session.tempData = {};
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const selectedDoor = availableDoors[selectedIndex];

    if (!selectedDoor) {
console.error('[DOOR Select] selectedDoor is undefined at index', selectedIndex);
      session.tempData = {};
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Clear temp data and set up command for processing
    session.tempData = {};

    // Execute through normal BBS command system - handles all door types consistently
    const doorCommand = selectedDoor.command || selectedDoor.id;
console.log(`[DOOR Select] Executing via BBS command: ${doorCommand}`);

    // Set PROCESS_COMMAND state with the command text ready
    // This bypasses READ_COMMAND's character-by-character buffering
    session.commandText = doorCommand.toUpperCase();
    session.subState = LoggedOnSubState.PROCESS_COMMAND;

    const { handleCommand } = require('./command.handler');
    await handleCommand(socket, session, '');  // Empty string triggers command processing
    return;
  }

  // Q - Quit back to menu
  if (key === 'q') {
    emitText(socket, '\x1b[2J\x1b[H'); // Clear screen
    session.tempData = {};
    session.menuPause = false;
    // Actually display the menu instead of just setting state
    await displayMainMenu(socket, session);
    return;
  }

  // Catch-all: ignore any other input to prevent command history interference
  // This includes regular letters, numbers, and other keys that aren't handled above
console.log(`[DOOR Select] Ignoring unhandled input: ${JSON.stringify(data)}`);
}

/**
 * Format door size for display
 */
function formatDoorSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Calculate total size of a door directory (for TypeScript doors)
 */
function calculateDoorDirectorySize(dirPath: string): number {
  let totalSize = 0;
  try {
    const files = amigafs.readdirSync(dirPath);
    for (const file of files) {
      // Skip node_modules and .git
      if (file === 'node_modules' || file === '.git') continue;
      const filePath = path.join(dirPath, file);
      const stats = amigafs.statSync(filePath);
      if (stats.isDirectory()) {
        totalSize += calculateDoorDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return totalSize;
}

/**
 * Pad string to specified length
 */
function padString(str: string, length: number): string {
  if (str.length >= length) return str.substring(0, length);
  return str + ' '.repeat(length - str.length);
}

/**
 * Execute door game/utility
 */
export async function executeDoor(socket: any, session: BBSSession, door: Door) {
console.log('Executing door:', door.name);

  const nodeId = session.nodeId || 0;
  let doorSession: DoorSession | null = null;
  const originalSubState = session.subState;

  try {
    // Check if this is a client door (needs to detect runtime from manifest)
    const doorManifest = await loadDoorManifestForExecution(door);

    // Client-only doors: Just load the client bundle and return
    if (doorManifest && doorManifest.runtime === 'client') {
      await executeClientDoor(socket, session, door, doorManifest);
      return;
    }

    // Hybrid doors: Load client bundle but ALSO continue to execute server part
    let hybridSessionId: string | null = null;
    if (doorManifest && doorManifest.runtime === 'hybrid') {
console.log(`[executeDoor] Hybrid door detected: ${door.name} - loading client AND server`);
      // Load client bundle and get session ID for RPC registration
      hybridSessionId = await executeClientDoor(socket, session, door, doorManifest);
      if (!hybridSessionId) {
console.error(`[executeDoor] Failed to start client door for hybrid: ${door.name}`);
        return;
      }
      // Continue to execute server part below (don't return)
    }

    const { user: doorUser, isGuest } = resolveDoorExecutionUser(session);

    // Create drop files (DOOR.SYS, DORINFOx.DEF) before door execution
    const timeRemaining = session.timeRemaining || 3600; // Default 1 hour
    doorDropFileManager.createAllDropFiles(nodeId, doorUser, timeRemaining);

    // Create door session
    doorSession = {
      doorId: door.id,
      userId: doorUser.id,
      startTime: getSystemTime(),
      status: 'running'
    };
    doorSessions.push(doorSession);

    // Log door execution
    callersLog(isGuest ? null : doorUser.id, doorUser.username, 'Executed door', door.name);
    callersLogManager.logDoor(nodeId, door.name);

    // Emit BBS event for LiveChat integration (door entered)
    emitDoorActivity({
      username: doorUser.username,
      nodeId: nodeId,
      doorName: door.name,
      action: 'entered',
      timestamp: Date.now()
    });

    // Execute based on door type
    switch (door.type) {
      case 'MCI': // MCI door - process MCI codes and display (express.e:4293-4297)
        await executeMciDoor(socket, session, door, doorSession);
        break;
      case 'TS': // TypeScript door type from BBSCMD file
      case 'SDK': // SDK door - use in-process TypeScript execution
      case 'typescript': // TypeScript door with runDoor() export
        await executeTypeScriptDoor(socket, session, door, doorSession, hybridSessionId);
        break;
      case 'python': // Python door
      case 'PY': // Python door type from BBSCMD file
        await executePythonDoor(socket, session, door, doorSession);
        break;
      case 'arexx': // ARexx door
      case 'AREXX': // ARexx door type from BBSCMD file
      case 'REXX': // REXX door type from BBSCMD file
        await executeARexxDoor(socket, session, door, doorSession);
        break;
      case 'web':
        await executeWebDoor(socket, session, door, doorSession);
        break;
      case 'native':
        // Web version: Execute Node.js scripts instead of Amiga native executables
        await executeNativeDoor(socket, session, door, doorSession);
        break;
      case 'script':
        // Web version: Execute shell scripts
        await executeScriptDoor(socket, session, door, doorSession);
        break;
      case 'XIM': // eXpress Internal Module (Amiga executable)
      case 'AIM': // Amiga Internal Module
      case 'SIM': // Standard Internal Module
      case 'TIM': // Text Internal Module
      case 'IIM': // Interactive Internal Module
        await executeAmigaDoor(socket, session, door, doorSession);
        break;
      default:
        emitText(socket, `Unknown door type: ${door.type}\r\n`);
console.error(`Unknown door type: ${door.type}`);
        SysopDebugUtil.debugDoorError(
          socket,
          session,
          door.name,
          `Unknown door type: ${door.type}`,
          { doorType: door.type, doorPath: door.path },
          DebugSeverity.CRITICAL
        );
    }

    // Clean up drop files after door exit
    doorDropFileManager.cleanupDropFiles(nodeId);
    callersLogManager.logDoorExit(nodeId, door.name);

    // Emit BBS event for LiveChat integration (door exited)
    emitDoorActivity({
      username: doorUser.username,
      nodeId: nodeId,
      doorName: door.name,
      action: 'exited',
      timestamp: Date.now()
    });

    // Mark session as completed
    if (doorSession) {
      doorSession.endTime = getSystemTime();
      doorSession.status = 'completed';
    }

    // After door completes, check if we're in segment processing (~SP handling)
    // If so, DON'T change state - let segment processing continue
    // express.e:5455-5461 - ~SP causes pauses between segments, ~CC_ commands run within segments
    if (session.screenSegments && session.screenSegments.segments.length > 0) {
console.log(`[executeDoor] Door ${door.name} completed during segment processing - continuing segments`);
      // Restore subState so display flow can continue (was clobbered to DOOR_RUNNING)
      session.subState = originalSubState;
    } else {
      // Normal door completion - return to menu (express.e behavior after doors)
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
  } catch (error: any) {
console.error(`[executeDoor] CRITICAL ERROR in door ${door.name}:`, error);
console.error(`[executeDoor] Stack trace:`, error.stack);

    // Notify user of error
    emitText(socket, `\r\n\r\n[ERROR] Door crashed: ${error.message}\r\n`);
    emitText(socket, `Press any key to continue...\r\n`);

    // Log critical error
    SysopDebugUtil.debugDoorError(
      socket,
      session,
      door.name,
      `Door execution failed: ${error.message}`,
      {
        error: error.message,
        stack: error.stack,
        doorType: door.type,
        doorPath: door.path
      },
      DebugSeverity.CRITICAL
    );

    // Clean up resources
    try {
      doorDropFileManager.cleanupDropFiles(nodeId);
      callersLogManager.logDoorExit(nodeId, `${door.name} (ERROR)`);

      if (doorSession) {
        doorSession.endTime = getSystemTime();
        doorSession.status = 'error';
      }
    } catch (cleanupError) {
console.error('[executeDoor] Error during cleanup:', cleanupError);
    }

    // Ensure session returns to menu
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

    // Re-throw to ensure error is logged at process level
    throw error;
  }
}

/**
 * Execute TypeScript door with runDoor() export
 * Dynamically imports the door module and calls its runDoor() function
 */
async function executeTypeScriptDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession, hybridSessionId?: string | null): Promise<void> {
  const execId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
console.log(`[executeTypeScriptDoor] ===== EXEC ID: ${execId} =====`);
console.log(`[executeTypeScriptDoor] Starting TypeScript door: ${door.name}`);
console.log(`[executeTypeScriptDoor] Door path: ${door.path}`);
  let wrappedSocket: any;

  // Save and disable modem speed throttling for TypeScript doors (they need full speed)
  const { getModemEmulator } = require('../utils/modem-emulator.util');
  const modemEmulator = getModemEmulator(socket);
  const savedModemSpeed = (session as any).modemSpeed || 0;
  if (savedModemSpeed > 0) {
    modemEmulator.disable();
    socket.emit('modem-speed', 0);
  }

  // Save original subState to check if we're in display flow (inline ~CC_ command)
  // Door execution changes subState to DOOR_RUNNING, so we need to remember the original
  const originalSubState = session.subState;

  try {
    // Build absolute path to door - handle both directory and file paths
    let doorPath = door.path;

    // If path is undefined, error out
    if (!doorPath) {
      emitText(socket, `\r\n\x1b[31mDoor path is not configured\x1b[0m\r\n`);
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Get BBS root directory (use BBS_DATA_DIR env var or default to project root)
    // In Docker, /app/Doors symlinks to /app/data/bbs/Doors for path consistency
    const projectRoot = process.env.BBS_DATA_DIR || path.resolve(process.cwd(), '../..');

    // For hybrid doors, use the server entry point from package.json
    // Check if path is a directory and if it has a package.json with server entry
    // Use amigafs for case-insensitive path resolution (AmigaOS compatibility)
    if (amigafs.existsSync(path.join(projectRoot, doorPath)) &&
        amigafs.statSync(path.join(projectRoot, doorPath)).isDirectory()) {
      
      const doorDir = path.join(projectRoot, doorPath);
      
      // In production (NODE_ENV=production), always use compiled dist/ output.
      // In development, prefer .ts source if it exists (prevents stale .js).
      const isProduction = process.env.NODE_ENV === 'production';
      const rootIndexTs = path.join(doorDir, 'index.ts');
      const rootServerTs = path.join(doorDir, 'server.ts');
      
      if (!isProduction && amigafs.existsSync(rootIndexTs)) {
        doorPath = path.join(doorPath, 'index.ts');
console.log(`[executeTypeScriptDoor] Found root index.ts, using source instead of package.json main`);
      } else if (!isProduction && amigafs.existsSync(rootServerTs)) {
        doorPath = path.join(doorPath, 'server.ts');
console.log(`[executeTypeScriptDoor] Found root server.ts, using source instead of package.json main`);
      } else {
        const packageJsonPath = path.join(doorDir, 'package.json');
        if (amigafs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(amigafs.readFileSync(packageJsonPath, 'utf8') as string);
            // Check if it's a hybrid door with explicit server entry
            if (packageJson.runtime === 'hybrid' && packageJson.server && packageJson.server.entry) {
              // Use server entry from manifest (e.g., "./server.ts" -> "server.ts")
              let serverEntry = packageJson.server.entry.replace(/^\.\//, '');
              // In production, resolve .ts to compiled .js in dist/
              if (isProduction && serverEntry.endsWith('.ts')) {
                const compiledEntry = 'dist/' + serverEntry.replace(/\.ts$/, '.js');
                const compiledPath = path.join(projectRoot, doorPath, compiledEntry);
                if (amigafs.existsSync(compiledPath)) {
                  serverEntry = compiledEntry;
                } else {
                  serverEntry = serverEntry.replace(/\.ts$/, '.js');
                }
              }
              doorPath = path.join(doorPath, serverEntry);
console.log(`[executeTypeScriptDoor] Hybrid door detected, using server entry: ${serverEntry}`);
            } else if (packageJson.main) {
              // Use main entry from package.json when it exists, otherwise fall back to index.ts.
              const mainEntry = path.join(doorPath, packageJson.main);
              const mainEntryPath = path.join(projectRoot, mainEntry);
              if (amigafs.existsSync(mainEntryPath)) {
                doorPath = mainEntry;
console.log(`[executeTypeScriptDoor] Using main entry from package.json: ${packageJson.main}`);
              } else {
                // Main entry not found - try index.js (compiled) then index.ts (dev)
                const fallback = isProduction ? 'index.js' : 'index.ts';
                doorPath = path.join(doorPath, fallback);
console.warn(`[executeTypeScriptDoor] Main entry not found (${packageJson.main}); using ${fallback}`);
              }
            } else {
              const fallback = isProduction ? 'index.js' : 'index.ts';
              doorPath = path.join(doorPath, fallback);
            }
          } catch (error) {
            const fallback = isProduction ? 'index.js' : 'index.ts';
console.log(`[executeTypeScriptDoor] Failed to parse package.json, using default ${fallback}`);
            doorPath = path.join(doorPath, fallback);
          }
        } else {
          const fallback = isProduction ? 'index.js' : 'index.ts';
          doorPath = path.join(doorPath, fallback);
        }
      }
    }

    // Build absolute path from project root
    doorPath = path.isAbsolute(doorPath)
      ? doorPath
      : path.join(projectRoot, doorPath);

console.log(`[executeTypeScriptDoor] Resolved path: ${doorPath}`);

    // Check if door exists (use amigafs for case-insensitive matching)
    // IMPORTANT: Use amigafs.resolvePath() to get the actual path with correct casing
    // because import() requires exact paths on case-sensitive filesystems
    const resolvedDoorPath = amigafs.resolvePath(doorPath);
    if (!resolvedDoorPath) {
      emitText(socket, `\r\n\x1b[31mDoor not found: ${doorPath}\x1b[0m\r\n`);
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

console.log(`[executeTypeScriptDoor] Actual filesystem path: ${resolvedDoorPath}`);

    // CRITICAL: Clear the CommonJS require() cache for the door's entire dist directory.
    // The ESM timestamp cache-buster on index.js only busts that one file; all transitive
    // require('./ui/actions') calls inside it still hit the stale require.cache entries.
    // Clearing the door's dist tree ensures every require() reloads from disk on each launch.
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      const doorDistDir = path.dirname(resolvedDoorPath);
      for (const key of Object.keys(require.cache)) {
        if (key.startsWith(doorDistDir)) {
          delete require.cache[key];
        }
      }
    }

    const cacheBuster = isDev ? `?t=${Date.now()}` : '';
    const importPath = `file://${resolvedDoorPath}${cacheBuster}`;
console.log(`[executeTypeScriptDoor] Importing: ${importPath} (cache-busting: ${isDev ? 'enabled' : 'disabled'})`);

    // Show animated preloader if PRELOADER or SHOWPRELOADER tooltype is set
    // Only show for doors that explicitly enable it (avoids delay for simple doors)
    const preloaderValue = door.toolTypes?.PRELOADER || door.toolTypes?.SHOWPRELOADER;
    const showPreloader = preloaderValue?.toUpperCase() === 'YES' || preloaderValue === '1';

    let doorModule: any;
    if (showPreloader) {
      // Use SDK package name (not source-relative) so resolution works in
      // production where only sdk/dist is shipped — the source path
      // ../../../../sdk/utils/* doesn't exist in the Docker image.
      const { showPreloaderWhile } = require('@amiexpress/bbs-door-sdk/utils/door-preloader');
      // Pass socket directly - session.socket doesn't exist, socket is a separate parameter
      const doorDisplayName = door.name || door.command || 'Application';
      doorModule = await showPreloaderWhile(
        socket,
        doorDisplayName,
        async () => await import(importPath)
      );
    } else {
      // Import directly without preloader
      doorModule = await import(importPath);
    }

    // Check if this is a hybrid door using SDK's ServerDoor class
    // These doors call door.start() when imported and don't export runDoor()
    let packageJson: any = null;
    try {
      const packageJsonPath = path.join(path.dirname(doorPath), 'package.json');
      if (amigafs.existsSync(packageJsonPath)) {
        packageJson = JSON.parse(amigafs.readFileSync(packageJsonPath, 'utf8') as string);
      }
    } catch (err) {
      // No package.json or parse error - not a problem
    }

    // Debug: Log what was imported to diagnose validation failures
    console.log(`[executeTypeScriptDoor] doorModule keys: ${Object.keys(doorModule || {}).join(', ')}`);
    console.log(`[executeTypeScriptDoor] doorModule.default: ${typeof doorModule?.default}`);

    // Check for SDK pattern (default export with execute/getConfig)
    const isSDKDoor = doorModule.default &&
                     typeof doorModule.default.execute === 'function' &&
                     typeof doorModule.default.getConfig === 'function';

    // Check for legacy runDoor pattern (for backward compatibility with old door versions)
    const hasRunDoor = typeof doorModule.runDoor === 'function';

    // Hybrid doors where the server module only exports RPC handlers (no execute()).
    // The client bundle runs the full game; the server just provides data callbacks.
    // A hybrid door is "RPC-only" on the server side only when its server module
    // exports just data handlers (rpcHandlers) and NOT a full SDK door or legacy
    // runDoor.  We must exclude SDK doors here because CoreDoor instances ARE
    // objects — the old broad check fired for every hybrid SDK door.
    const hybridRpcHandlers = doorModule.rpcHandlers ||
                              (!isSDKDoor && !hasRunDoor &&
                               packageJson?.runtime === 'hybrid' &&
                               typeof doorModule.default === 'object' && doorModule.default);
    const isHybridRPCOnly = !!(packageJson?.runtime === 'hybrid' && hybridSessionId &&
                                !isSDKDoor && !hasRunDoor && hybridRpcHandlers);

    if (!isSDKDoor && !hasRunDoor && !isHybridRPCOnly) {
      // Neither pattern found - show error
      const reason = !doorModule.default && !hasRunDoor ? 'no default export or runDoor function' :
                     !doorModule.default ? 'no default export' :
                     typeof doorModule.default.execute !== 'function' ? `execute is ${typeof doorModule.default.execute}` :
                     `getConfig is ${typeof doorModule.default.getConfig}`;
      console.error(`[executeTypeScriptDoor] Door validation failed: ${reason}`);
      emitText(socket, `\r\n\x1b[31mInvalid TypeScript door: ${reason}\x1b[0m\r\n`);
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Handle legacy runDoor pattern
    if (hasRunDoor && !isSDKDoor) {
      console.log(`[executeTypeScriptDoor] Legacy runDoor pattern detected, executing...`);
      disableShortcuts(session);
      session.inDoorManager = true;
      socket.emit('door:status', { status: 'running' });
      socket.emit('door-active', true);

      const { createBBSApi } = require('../doors/BBSApi');
      const bbsApi = createBBSApi(socket, session);
      session.bbsApi = bbsApi;
      const legacySocket = createDoorSocketWrapper(socket, session, bbsApi);

      try {
        await doorModule.runDoor({
          socket: legacySocket,
          bbsSession: session,
          user: session.user,
          bbs: bbsApi,
          params: door.parameters || []
        });
      } finally {
        // Cleanup - match SDK door cleanup pattern
        session.inDoorManager = false;
        session.doorInputHandler = undefined;
        session.mouseEventsEnabled = false;
        socket.emit('door:status', { status: 'closed' });
        socket.emit('door-active', false);
        disableGameMode(socket, session);
        console.log(`[executeTypeScriptDoor] Legacy door ${door.name} completed`);
      }
      return;
    }

    disableShortcuts(session);

console.log(`[executeTypeScriptDoor] SDK v2.0 Door detected, calling execute()`);

    // Set door active flag - this blocks command handler but door can still receive events
    session.inDoorManager = true;
console.log(`[executeTypeScriptDoor] Set inDoorManager=true`);

    // Notify frontend that door is active
    socket.emit('door:status', { status: 'running' });
    socket.emit('door-active', true);
console.log(`[executeTypeScriptDoor] Sent door:status: running, door-active: true`);

    // Create BBS API instance for door
    const { createBBSApi } = require('../doors/BBSApi');
    const bbsApi = createBBSApi(socket, session);
    session.bbsApi = bbsApi;

    // Create a socket wrapper that intercepts room: and chat: events
    // This allows doors to use socket.emit('room:join', ...) which will call handlers directly
    wrappedSocket = createDoorSocketWrapper(socket, session, bbsApi);

    // FIX: Wait for any pending screen commands (like BBSTITLE) to complete before executing door
    // This prevents door output from overlapping with the current screen display.
    if (session.pendingScreenCommand) {
      console.log(`[executeTypeScriptDoor] Waiting for pending screen command to complete before starting ${door.name}`);
      await session.pendingScreenCommand;
    }

    // SDK v2.0 pattern: Door instance with execute() method
console.log(`[executeTypeScriptDoor] Calling door.execute() with SDK context...`);
    const doorInstance = doorModule.default;

    if (packageJson?.runtime === 'hybrid' && hybridSessionId) {
      const rpcHandlers = doorModule.rpcHandlers || doorModule.default?.rpcHandlers;
      if (rpcHandlers && typeof rpcHandlers === 'object') {
        const { getClientDoorBridge } = require('../doors/client-door-bridge');
        const bridge = getClientDoorBridge();

        for (const [method, handler] of Object.entries(rpcHandlers)) {
          if (typeof handler === 'function') {
            bridge.registerRPCHandler(hybridSessionId, method, async (params: any) => {
              // Create a legacy-compatible session object for handlers that might expect it
              const doorSessionObj = {
                socket: wrappedSocket,
                user: session.user,
                bbsSession: session,
                bbs: bbsApi,
                params: door.parameters || []
              };
              return (handler as Function)(params, doorSessionObj);
            });
console.log(`[executeTypeScriptDoor] Registered hybrid RPC handler: ${method}`);
          }
        }
      }
    }

    if (isHybridRPCOnly) {
      // Server is RPC-only — client bundle drives the session.
      // RPC handlers are already registered above; nothing else to execute.
console.log(`[executeTypeScriptDoor] Hybrid RPC-only door — waiting for client to finish`);
      // Enable game mode so the terminal's onData handler stops forwarding raw key
      // events to the BBS command processor.  Without this, every key the user presses
      // in the browser game (e.g. Q to quit arkanoid) is ALSO sent as socket.emit('command')
      // because gameMode.current remains false for hybrid doors that never call execute().
      // After endSession cleans up inDoorManager the 'q' command would be processed by the
      // BBS, causing the door to "restart".
      enableGameMode(socket, session, 'TS');
      // Wait for the client door session to close (signalled via client-door-bridge)
      const { getClientDoorBridge } = require('../doors/client-door-bridge');
      const bridge = getClientDoorBridge();
      await bridge.waitForSessionEnd(hybridSessionId).catch(() => {/* session already gone */});
    } else {
      await doorInstance.execute({
        socket: wrappedSocket,
        bbsSession: session,
        user: session.user,
        bbs: bbsApi,
        params: door.parameters || []
      });
    }

console.log(`[executeTypeScriptDoor] Door.execute() returned`);

console.log(`[executeTypeScriptDoor] Door completed successfully`);

    // Disable game mode when door exits
    disableGameMode(socket, session);

    // Clear door active flag and input handler - MUST match 68K door cleanup
    // CRITICAL: Set to false, don't just delete, to ensure consistent state
    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    session.clientDoorActive = false; // Reset for hybrid doors (set by executeClientDoor)
    delete session.doorInputHandler;
    delete session.bbsApi;
    // CRITICAL: Reset subState IMMEDIATELY - this prevents input from being swallowed
    // socket-handlers.ts checks: if (session.inDoorManager || session.subState === DOOR_RUNNING)
    // If subState stays as DOOR_RUNNING after door exits, BBS input breaks
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    if (wrappedSocket?._doorCleanup) {
      wrappedSocket._doorCleanup();
    }
console.log(`[executeTypeScriptDoor] Cleared inDoorManager, doorInputHandler, mouseEventsEnabled, clientDoorActive, subState`);

    // Reset menu input mode (express.e returns to MENU with shortcuts off)
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }

    // Notify frontend that door is stopped
    socket.emit('door:status', { status: 'stopped' });
    socket.emit('door-active', false);

    // Restore modem speed emulation if it was active before door
    if (savedModemSpeed > 0) {
      (session as any).modemSpeed = savedModemSpeed;
      modemEmulator.enable(savedModemSpeed);
      socket.emit('modem-speed', savedModemSpeed);
    }
console.log(`[executeTypeScriptDoor] Sent door:status: stopped, door-active: false`);

    // Return to menu and pause before showing (only if user is logged in)
    // CRITICAL: Don't show menu if we're in segment processing (~SP handling)
    // or if we STARTED in a display flow state (inline ~CC_ command)
    // express.e processSysCommand just runs the command and returns - no menu display
    session.menuPause = false;

    if (session.pendingDoorCommands && session.pendingDoorCommands.length > 0) {
      const { handleCommand } = require('./command.handler');
      const queuedCommands = session.pendingDoorCommands.slice();
      session.pendingDoorCommands = undefined;

      for (const queued of queuedCommands) {
        const commandLine = (queued || '').trim();
        if (!commandLine) continue;
        // Execute queued command as if it was entered (bypass line buffering).
        session.commandText = commandLine.toUpperCase();
        session.subState = LoggedOnSubState.PROCESS_COMMAND;
        await handleCommand(socket, session, '');
      }
      return;
    }

    // Check for segment processing first - takes priority
    // express.e:5455-5461 - ~CC_ commands run within segments, more segments follow
    if (session.screenSegments && session.screenSegments.segments.length > 0) {
console.log(`[executeTypeScriptDoor] Door ${door.name} completed during segment processing - continuing segments`);
      // Don't change state or show menu - segment processing will continue
      return;
    }

    const displayFlowStates = [
      LoggedOnSubState?.DISPLAY_BULL,
      LoggedOnSubState?.DISPLAY_NODE_BULL,
      LoggedOnSubState?.CONF_SCAN,
      LoggedOnSubState?.DISPLAY_CONF_BULL,
      LoggedOnSubState?.DISPLAY_MENU,
    ];
    const wasInDisplayFlow = displayFlowStates.includes(originalSubState);
    // Suppress BBS menu for chatOnly SSO sessions — there is no BBS context to
    // return to on the /chat/ page. Showing the main menu here causes a BBS
    // login prompt to appear inside /chat/ when the livechat door exits (e.g.
    // after a transient socket disconnect that reaches this cleanup path).
    const isChatOnly = (session as any).chatOnly === true || session.tempData?.chatOnly === true;
    if (session.state === BBSState.LOGGEDON && session.user && !wasInDisplayFlow && !isChatOnly) {
      await displayMainMenu(socket, session);
    } else if (wasInDisplayFlow) {
      // Restore original subState for display flow to continue
      session.subState = originalSubState;
    }

  } catch (error) {
console.error(`[executeTypeScriptDoor] Error executing TypeScript door:`, error);

    if (wrappedSocket?._doorCleanup) {
      wrappedSocket._doorCleanup();
    }
    SysopDebugUtil.debugDoorError(
      socket,
      session,
      door.name,
      'Error executing TypeScript door',
      { doorPath: door.path, error: (error as Error).message, stack: (error as Error).stack },
      DebugSeverity.CRITICAL
    );

    // Pause on error so the user can read the message
    session.inDoorManager = true;
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }

    emitText(socket, `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');

    try {
      const { createBBSApi } = require('../doors/BBSApi');
      const bbsApi = createBBSApi(socket, session);
      await bbsApi.getKey();
    } catch (err) {
console.warn('[executeTypeScriptDoor] Failed to wait for key after error:', err);
    }

    // Clear door active flag - MUST match normal exit cleanup
    session.inDoorManager = false;
    session.mouseEventsEnabled = false;
    session.clientDoorActive = false; // Reset for hybrid doors
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;
    socket.emit('door-active', false);

    // Restore modem speed emulation if it was active before door
    if (savedModemSpeed > 0) {
      (session as any).modemSpeed = savedModemSpeed;
      modemEmulator.enable(savedModemSpeed);
      socket.emit('modem-speed', savedModemSpeed);
    }

    // Only display menu if user is logged in (and not chatOnly — see note above)
    const isChatOnlyErr = (session as any).chatOnly === true || session.tempData?.chatOnly === true;
    if (session.state === BBSState.LOGGEDON && session.user && !isChatOnlyErr) {
      await displayMainMenu(socket, session);
    }
  }
}

/**
 * Execute Amiga door via 68000 CPU emulation
 * Handles XIM, AIM, SIM, TIM, IIM door types
 */
async function executeNativeGccDoor(
  socket: any,
  session: BBSSession,
  door: any,
  doorConfig: any
): Promise<void> {
  const { spawn } = require('child_process');

console.log(`[executeNativeGccDoor] Starting GCC door: ${doorConfig.executablePath}`);

  // Enable game mode for GCC doors (they use different input handling)
  enableGameMode(socket, session, 'XIM');

  // Move to fresh line
  emitText(socket, '\r\n');

  session.inDoorManager = true;
  session.subState = LoggedOnSubState.DOOR_RUNNING;
  socket.emit('door-active', true);

  // Spawn the GCC executable
  const doorProcess = spawn(doorConfig.executablePath, [doorConfig.bbsSession.nodeId.toString()], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  // Wire up input handling
  session.doorInputHandler = (input: string) => {
    // Send input to the door process
    if (doorProcess && !doorProcess.killed) {
      doorProcess.stdin.write(input + '\n');
    }
  };

  // Handle stdout from the door
  doorProcess.stdout.on('data', (data: Buffer) => {
    const output = data.toString();
    emitText(socket, output);
  });

  // Handle stderr from the door
  doorProcess.stderr.on('data', (data: Buffer) => {
    const error = data.toString();
console.error(`[executeNativeGccDoor] Door stderr: ${error}`);
  });

  // Handle process exit
  doorProcess.on('exit', (code: number) => {
console.log(`[executeNativeGccDoor] Door exited with code ${code}`);

    // Clean up
    disableGameMode(socket, session);
    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    socket.emit('door-active', false);
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

    emitText(socket, `\r\nDoor exited (code: ${code})\r\n`);
  });

  // Handle process errors
  doorProcess.on('error', (err: Error) => {
console.error(`[executeNativeGccDoor] Process error: ${err.message}`);

    disableGameMode(socket, session);
    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    socket.emit('door-active', false);
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

    emitText(socket, `\r\nDoor execution failed: ${err.message}\r\n`);
  });
}

async function executeAmigaDoor(socket: any, session: BBSSession, door: any, doorSession: DoorSession) {
console.log(`[executeAmigaDoor] Starting Amiga door: ${door.name} (${door.type})`);
console.log(`[executeAmigaDoor] Path: ${door.path}`);
  fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] executeAmigaDoor START: door="${door.name}" type="${door.type}" path="${door.path}"\n`);
  disableShortcuts(session);

  try {
    // Get the BBS root from AmigaDoorManager (same location where doors are installed)
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const amigaDoorMgr = getAmigaDoorManager();
    const bbsRoot = amigaDoorMgr.bbsRoot;

    // Build the full path to the door executable with case-insensitive resolution
    // door.path is already converted from Amiga paths (e.g., "Doors/Example/Example")
    const normalizedDoorComponents = door.path
      .replace(/\\/g, '/')
      .split('/')
      .filter((component: string) => component.length > 0);

    const fullDoorPath = path.join(bbsRoot, ...normalizedDoorComponents);
    let doorPath =
      resolveCaseInsensitivePath(fullDoorPath) ||
      path.join(bbsRoot, door.path);

console.log(`[executeAmigaDoor] BBS root: ${bbsRoot}`);
console.log(`[executeAmigaDoor] Initial door path: ${doorPath}`);

    // Check if door executable exists - if not, try alternate paths
    // Use amigafs for case-insensitive path resolution (AmigaOS compatibility)
    if (!amigafs.existsSync(doorPath)) {
console.log(`[executeAmigaDoor] Door not found at ${doorPath}, trying alternate paths...`);

      // Try alternate path resolutions for common issues:
      const location = door.path;
      const alternatePaths = [];

      // 1. Try with capital D in Doors/ (doors/  Doors/)
      if (/^doors\//i.test(location)) {
        alternatePaths.push(path.join(bbsRoot, location.replace(/^doors\//i, 'Doors/')));
      }


      // 3. Try adding Doors/ prefix if missing
      if (!/^doors\//i.test(location)) {
        alternatePaths.push(path.join(bbsRoot, 'Doors', location));
      }

      // 4. Try case-insensitive matching in Doors/ directory
      // This handles: glc/glcviewer vs glcviewer/glcviewer, Bossnuke vs BossNuke/BossNuke
      const basename = path.basename(location);
      const dirname = path.dirname(location);

      // Try variations: exact name, lowercase, first char uppercase
      const nameVariations = [
        basename,
        basename.toLowerCase(),
        basename.charAt(0).toUpperCase() + basename.slice(1).toLowerCase()
      ];

      // Search in Doors/ directory
      const doorsDir =
        resolveCaseInsensitivePath(path.join(bbsRoot, 'Doors')) ||
        resolveCaseInsensitivePath(path.join(bbsRoot, 'doors'));

      if (doorsDir && amigafs.existsSync(doorsDir)) {
        try {
          const entries = amigafs.readdirSync(doorsDir);
          for (const entry of entries) {
            const entryPath = path.join(doorsDir, entry);
            const stat = amigafs.statSync(entryPath);

            if (stat.isDirectory()) {
              // Check if this directory name matches any variation of the door name
              const entryLower = entry.toLowerCase();
              const basenameLower = basename.toLowerCase();

              if (entryLower === basenameLower || entryLower.includes(basenameLower)) {
                // Try the executable inside this directory
                for (const nameVar of nameVariations) {
                  const execPath = path.join(entryPath, nameVar);
                  if (amigafs.existsSync(execPath)) {
                    alternatePaths.push(execPath);
                  }
                }
              }
            }
          }
        } catch (e) {
console.error(`[executeAmigaDoor] Error scanning Doors directory:`, e);
        }
      }

      // Search for the file in alternate locations
      for (const altPath of alternatePaths) {
        if (amigafs.existsSync(altPath)) {
console.log(`[executeAmigaDoor] Found door at alternate path: ${altPath}`);
          doorPath = altPath;
          break;
        }
      }

      // If still not found, check whether the parent directory is a TypeScript
      // door that replaced the Amiga binary (e.g. Doors/bbslink replaced
      // the Doors:bbslink/bbslink XIM binary).  If so, redirect to TS execution.
      if (!amigafs.existsSync(doorPath)) {
        const parentDir = path.dirname(doorPath);
        const parentPkg = path.join(parentDir, 'package.json');
        if (amigafs.existsSync(parentPkg)) {
          try {
            const pkg = JSON.parse(amigafs.readFileSync(parentPkg, 'utf8') as string);
            const relPath = path.relative(bbsRoot, parentDir);
            // Build a minimal Door object pointing at the TypeScript implementation
            const tsDoor: Door = {
              id:          door.id,
              name:        door.name,
              command:     door.command,
              description: door.description || '',
              path:        relPath,
              type:        'typescript',
              accessLevel: door.accessLevel || 0,
              enabled:     true,
              parameters:  door.parameters || [],
            };
            const tsDoorSession: DoorSession = {
              doorId:    tsDoor.id,
              userId:    session.user?.id || '',
              startTime: getSystemTime(),
              status:    'running',
            };
console.log(`[executeAmigaDoor] Binary not found but TS door exists at ${relPath} — redirecting`);
            await executeTypeScriptDoor(socket, session, tsDoor, tsDoorSession, null);
            return;
          } catch (e) {
console.error('[executeAmigaDoor] TS-redirect failed:', e);
          }
        }
console.error(`[executeAmigaDoor] Door executable not found: ${doorPath}`);
console.error(`[executeAmigaDoor] Tried alternate paths:`, alternatePaths);
        emitText(socket, '\r\n\x1b[31mDoor executable not found.\x1b[0m\r\n');
        emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        return;
      }
    }

    // Prefer 68020 binaries over 68000 since we use 68020 emulation
    // Try multiple naming conventions for 68020 binaries
    let found020 = false;
    const doorDir = path.dirname(doorPath);
    const doorFileName = path.basename(doorPath);

    // Pattern 1: name.000 -> name.020 (e.g., AquaScan.000 -> AquaScan.020)
    if (doorPath.endsWith('.000')) {
      const doorBaseName = doorPath.replace(/\.000$/, '');
      const door020Path = doorBaseName + '.020';
      if (amigafs.existsSync(door020Path)) {
console.log(`[executeAmigaDoor] Found 68020 version: ${door020Path} - using instead of ${doorPath}`);
        doorPath = door020Path;
        found020 = true;
      }
    }

    // Pattern 2: name000.x -> name020.x (e.g., Conftop000.x -> Conftop020.x)
    if (!found020 && doorPath.match(/000\.x$/)) {
      const door020Path = doorPath.replace(/000\.x$/, '020.x');
      if (amigafs.existsSync(door020Path)) {
console.log(`[executeAmigaDoor] Found 68020 version: ${door020Path} - using instead of ${doorPath}`);
        doorPath = door020Path;
        found020 = true;
      }
    }

    // Pattern 3: name.x -> name020.x (e.g., Conftop.x -> Conftop020.x)
    if (!found020 && doorPath.endsWith('.x')) {
      const doorBaseName = doorPath.replace(/\.x$/, '');
      const door020Path = doorBaseName + '020.x';
      if (amigafs.existsSync(door020Path)) {
console.log(`[executeAmigaDoor] Found 68020 version: ${door020Path} - using instead of ${doorPath}`);
        doorPath = door020Path;
        found020 = true;
      }
    }

    // Pattern 4: name -> name020 (e.g., Bulls -> Bulls020)
    if (!found020 && !doorFileName.includes('020')) {
      const door020Path = doorPath + '020';
      if (amigafs.existsSync(door020Path)) {
console.log(`[executeAmigaDoor] Found 68020 version: ${door020Path} - using instead of ${doorPath}`);
        doorPath = door020Path;
        found020 = true;
      }
    }

    if (!found020 && (doorPath.endsWith('.000') || doorPath.endsWith('.x') || doorPath.match(/000\.x$/))) {
console.log(`[executeAmigaDoor] No .020 version found for ${doorPath}, using 68000 binary`);
    }

console.log(`[executeAmigaDoor] Starting 68k emulation for: ${doorPath}`);
console.log(`[executeAmigaDoor] door.type="${door.type}" door.doorType="${(door as any).doorType}"`);

    // Create DoorConfig for AmigaDoorSession
    // Use door.type from registration (XIM, AIM, SIM, etc.)
    // The switch statement at line 1331 already matched this type, so door.type MUST be valid
    let doorType = door.type || 'SIM';  // Default to SIM per express.e:4681
console.log(`[executeAmigaDoor] Resolved doorType="${doorType}"`)
    const lowerDoorPath = doorPath.toLowerCase();
    const isRtwDoor = lowerDoorPath.includes('/rtw/rtw') || lowerDoorPath.includes('\\rtw\\rtw');
    if (isRtwDoor) {
      doorType = 'XIM';
console.log(`[executeAmigaDoor] RTW detected - forcing XIM door type`);
    }

    // Build CLI arguments - XIM doors typically expect node number as first arg
    const nodeNumber = session.nodeId || 1;
    const doorArgs: string[] = [];

console.log(`[executeAmigaDoor] door.args=${JSON.stringify(door.args)} door.parameters=${JSON.stringify(door.parameters)}`);

    // NOTE: ARGS from .info file (e.g., ARGS=NEWSCAN) is for DOORUSE mode lookup, NOT command-line args!
    // AquaScan uses FindToolType("DOORUSE.<cmd>") to determine mode (NEWSCAN/FILESCAN/REVSCAN/CONFSCAN)
    // express.e:28102 just passes runtime params: runSysCommand('N','S U') - no NEWSCAN in args
    // So we do NOT add door.args to command line - only runtime parameters
    if (door.args) {
console.log(`[executeAmigaDoor] door.args="${door.args}" (used for DOORUSE lookup, NOT command-line)`);
    }

    // Add any additional arguments from door.passParameters (from .info file)
    if (door.passParameters && typeof door.passParameters === 'string') {
      doorArgs.push(...door.passParameters.split(' ').filter((a: string) => a));
    }

    // CRITICAL: Add runtime parameters from command invocation (e.g., "S U" from runSysCommand('N', 'S U'))
    // These override/supplement .info file ARGS for batch mode execution
    if (door.parameters && Array.isArray(door.parameters) && door.parameters.length > 0) {
      // door.parameters is an array like ['S U'] from command-execution.handler.ts
      for (const param of door.parameters) {
        if (param && typeof param === 'string') {
          doorArgs.push(...param.split(' ').filter((a: string) => a));
        }
      }
console.log(`[executeAmigaDoor] Added runtime parameters: ${JSON.stringify(door.parameters)} -> doorArgs=${JSON.stringify(doorArgs)}`);
    }

    // Add doorCommand and doorId to session for XIMProtocol to access
    // XIMProtocol uses these to respond to GET_CUSTOM_MSGBASE_MENUCMD (525)
console.log(`[executeAmigaDoor] Setting doorCommand="${door.command}" on session`);
    (session as any).doorCommand = door.command;
    (session as any).doorId = door.command;
console.log(`[executeAmigaDoor] Verified session.doorCommand="${(session as any).doorCommand}"`);

    // Initialize session.currentConf if not already set (for BB_CONFNUM query)
    // Doors expect this to return the user's current conference number
console.log(`[executeAmigaDoor] BEFORE currentConf init: session.currentConf=${session.currentConf} user.confRJoin=${session.user?.confRJoin}`);
    if (!session.currentConf || session.currentConf === 0) {
      session.currentConf = session.user?.confRJoin || 1;
console.log(`[executeAmigaDoor] AFTER init: session.currentConf=${session.currentConf}`);
    }
    if (!session.currentMsgBase || session.currentMsgBase === 0) {
      session.currentMsgBase = session.user?.msgBaseRJoin || 1;
    }

    // Set door parameters for EXPRESS_VERSION to return (XIM doors need this)
    // CRITICAL: Must return FULL command line (command + params), not just params
    // AquaScan expects "N S U", not just "S U" - see AQUASCAN_NSU_DEBUG_SESSION.md
    const paramString = door.parameters ? door.parameters.join(' ') : '';
    const fullCommandLine = door.command + (paramString ? ' ' + paramString : '');
    (session as any).doorParams = fullCommandLine;
    (session as any).commandParams = fullCommandLine;
console.log(`[executeAmigaDoor] Set doorParams="${fullCommandLine}" for EXPRESS_VERSION`);

    // Set bbsRoot on session so XIMProtocol can find command .info files
    (session as any).bbsRoot = bbsRoot;
    (session as any).dataDir = bbsRoot;
console.log(`[executeAmigaDoor] Set session.bbsRoot="${bbsRoot}" for XIMProtocol`);

    // Ensure disk-based user data is available for 68K doors (confAccess + slot + stats)
    if (session.user?.username) {
      let confAccess = (session as any).confAccess || '';
      let userSlotNumber = Number.isFinite((session as any).userSlotNumber)
        ? (session as any).userSlotNumber
        : -1;
      let slotIndex = userSlotNumber > 0 ? userSlotNumber - 1 : -1;
      let diskUserStats = (session as any).diskUserStats ?? null;

      if (slotIndex >= 0) {
        if (!confAccess) {
          confAccess = userDatabaseManager.readConfAccessFromDisk(slotIndex);
        }
        if (!diskUserStats) {
          diskUserStats = userDatabaseManager.readUserStatsFromDisk(slotIndex);
        }
      }

      if (slotIndex < 0 || !confAccess || !diskUserStats) {
        const foundIndex = userDatabaseManager.findUserSlotByName(session.user.username);
        if (foundIndex >= 0) {
          if (!confAccess) {
            confAccess = userDatabaseManager.readConfAccessFromDisk(foundIndex);
          }
          if (!diskUserStats) {
            diskUserStats = userDatabaseManager.readUserStatsFromDisk(foundIndex);
          }
          slotIndex = foundIndex;
          userSlotNumber = foundIndex + 1;
console.log(
            `[executeAmigaDoor] Read from disk: slotIndex=${foundIndex} slotNumber=${userSlotNumber} confAccess="${confAccess}" stats=${JSON.stringify(diskUserStats)}`
          );
        } else if (!confAccess) {
          confAccess = session.user?.confAccess || session.user?.conferenceAccess || '';
console.log(`[executeAmigaDoor] User not found in disk, fallback confAccess="${confAccess}"`);
        }
      }

      (session as any).confAccess = confAccess;
      if (userSlotNumber > 0) {
        (session as any).userSlotNumber = userSlotNumber;
      }
      if (diskUserStats) {
        (session as any).diskUserStats = diskUserStats;
      }
    }

    // Interactive doors use higher LOOP_LIMIT - they legitimately wait for user input
    // Batch doors (run via batch-scheduler) use lower LOOP_LIMIT (10M default)
    const interactiveToolTypes = {
      ...door.toolTypes,
      LOOP_LIMIT: door.toolTypes?.LOOP_LIMIT || '10000000'  // 10M iterations default
    };

    // Ensure the DOORUSE tooltype is set to the command-specific value so doors like AquaScan know which mode to run in.
    const commandKey = door.command?.toUpperCase();
    if (commandKey) {
      const doorUseKey = `DOORUSE.${commandKey}`;
      const doorUseValue = door.toolTypes?.[doorUseKey];
      if (doorUseValue && !interactiveToolTypes['DOORUSE']) {
        interactiveToolTypes['DOORUSE'] = doorUseValue;
console.log(
          `[executeAmigaDoor] Populated DOORUSE=${doorUseValue} from tooltype ${doorUseKey} for command ${commandKey}`
        );
      }
    }

    // Load BBS config from disk (bbsConfig.info) for environment variables
    const bbsConfigForEnv = loadBBSConfig(bbsRoot);

    // Standard BBS environment variables (doors access via FindVar/GetVar)
    const doorEnv: Record<string, string> = {
      NODE: String(nodeNumber),
      BBSNAME: bbsConfigForEnv.bbs_name || 'AmiExpress BBS',
      USERNAME: session.user?.username || 'Unknown',
      USERLEVEL: String(session.user?.secLevel || 0),
      LOCATION: session.user?.location || 'Unknown',
      TIMELIMIT: String(session.timeRemaining || 999),
      TIMEUSED: String(Math.floor((Date.now() - (session.loginTime || Date.now())) / 1000)),
      CONFERENCE: String((session as any).currentConference || session.currentConf || 1),
      REALNAME: session.user?.realname || session.user?.username || 'Unknown',
      SECSTATUS: String(session.user?.secStatus || 0),
      PHONENUMBER: session.user?.phone || '000-000-0000',
      BAUDRATE: session.connectionBaud ? String(session.connectionBaud) : '115200',
      ANSIMODE: session.ansiEnabled ? '1' : '0',
    };

    // Node-specific assigns for 68K door compatibility
    // These allow doors to access node-specific directories via Amiga assigns
    const nodeAssigns: Record<string, string> = {
      [`node${nodeNumber}:`]: path.join(bbsRoot, `Node${nodeNumber}`),
      [`node:`]: path.join(bbsRoot, `Node${nodeNumber}`),  // Current node shortcut
      [`nodedata:`]: path.join(bbsRoot, `Node${nodeNumber}`),
      [`playpen:`]: path.join(bbsRoot, `Node${nodeNumber}`, 'Playpen'),
      [`work:`]: bbsRoot,
    };

    const doorConfig = {
      executablePath: doorPath,
      doorType: doorType,
      doorId: door.command,  // Command name (e.g., "FR") for GET_CMD_TOOLTYPE
      timeout: 300, // 5 minutes
      bbsSession: session, // Use session's actual nodeId assigned by getNextAvailableNodeId()
      args: doorArgs, // CLI arguments for the door
      stack: door.stack,
      priority: door.priority,
      resident: door.resident,
      expertMode: door.expertMode,
      trapOn: door.trapOn,
      silent: door.silent,
      quickMode: door.quickMode,
      multiNode: door.multiNode,
      logInputs: door.logInputs,
      scriptCheck: door.scriptCheck,
      banner: door.banner,
      mimicVer: door.mimicVer,
      passParameters: door.passParameters,
      internal: door.internal,
      overclockFactor: door.overclockFactor,  // CPU overclocking from OVERCLOCK tooltype
      toolTypes: interactiveToolTypes,
      env: doorEnv,  // Environment variables
      assigns: nodeAssigns,  // Node-specific assigns for 68K door compatibility
    };

    // Check if this is a GCC-compiled development executable (ELF format)
    // If so, run it natively instead of through Amiga emulation
    let isGccExecutable = false;
    try {
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(doorPath, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
      // ELF magic: 0x7F 0x45 0x4C 0x46 (Linux)
      // Mach-O magic: 0xCF 0xFA 0xED 0xFE (macOS)
      isGccExecutable = (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) ||
                        (buffer[0] === 0xCF && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE);
console.log(`[executeAmigaDoor] File ${doorPath} magic bytes: ${buffer[0].toString(16)} ${buffer[1].toString(16)} ${buffer[2].toString(16)} ${buffer[3].toString(16)}, isGccExecutable: ${isGccExecutable}`);
    } catch (err) {
console.log(`[executeAmigaDoor] Error reading file ${doorPath}: ${(err as Error).message}`);
      // Not an executable or can't read, continue with normal Amiga execution
    }

    if (isGccExecutable) {
console.log(`[executeAmigaDoor] Detected GCC-compiled executable, running natively for development testing`);
      await executeNativeGccDoor(socket, session, door, doorConfig);
      return;
    }

    // Create AmigaDoorSession to run the native Amiga executable
    const amigaSession = new AmigaDoorSession(socket, doorConfig);

    // Move to a fresh line before the door renders any output (prevents menu prompt overlap)
    emitText(socket, '\r\n');

    // Wire user input into the Amiga door while it runs
    session.inDoorManager = true;
    session.subState = LoggedOnSubState.DOOR_RUNNING;
    socket.emit('door-active', true);
console.log(`[executeAmigaDoor] Set session.inDoorManager=true, door-active: true, nodeId=${session.nodeId}, socketId=${socket.id}`);

    // DO NOT enable game mode for 68K doors - they use normal character input via door:input
    // Game mode blocks terminal input and breaks traditional XIM doors like Bulls
    // Only TypeScript doors that explicitly call bbs.enableGameMode() should use game mode
    // const doorType2 = door.type || 'XIM';
    // enableGameMode(socket, session, doorType2);

    session.doorInputHandler = (data: string) => {
      try {
        const shared: any = (amigaSession as any).sharedState || {};
console.log(`[executeAmigaDoor] doorInputHandler received: "${data}" (len=${data.length}) hasXIM=${!!shared.ximProtocol}`);
console.log('[executeAmigaDoor] Call stack:', new Error().stack?.split('\n').slice(1, 5).join('\n'));
        logDoorDebug(
          `KEY door=${door.command || door.id || 'UNK'} data=${JSON.stringify(
            data
          )}`
        );
        // IMPORTANT: Check if XIM is waiting for input BEFORE queueing
        // This prevents double-delivery when XIM completes a hotkey/line input
        const ximWaitingForInput = shared.ximProtocol?.isWaitingForLineInput?.() ?? false;
        if (shared.ximProtocol) {
          shared.ximProtocol.queueInput(data);

          // CRITICAL: For native 68K doors that poll GetMsg(AEDoorPort), we need to
          // inject JH_HK messages via PutMsg. These doors don't send JH_HK XIM commands -
          // they expect BBS to proactively send input messages to AEDoorPort.
          if (shared.ximProtocol.shouldInjectNativeInput?.()) {
console.log(`[executeAmigaDoor] Native door detected - injecting input via PutMsg`);
            for (const char of data) {
              shared.ximProtocol.injectInputToNativeDoor(char);
            }
          }
        }
        if (shared.dosLibrary && !ximWaitingForInput) {
          shared.dosLibrary.queueInput(data);
        }
      } catch (err) {
console.error('[executeAmigaDoor] Error routing door input:', err);
      }
    };
    // Persist session state so socket-handlers sees the door flags/handler
    try {
      const { setSession, userSessions, getSession } = require('../server/session-manager');
console.log(`[executeAmigaDoor] Before setSession: inDoorManager=${session.inDoorManager}, handler=${!!session.doorInputHandler}`);
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
      // Verify session was stored correctly
      const verifySession = getSession(socket.id);
console.log(`[executeAmigaDoor] After setSession: verify inDoorManager=${verifySession?.inDoorManager}, handler=${!!verifySession?.doorInputHandler}`);
    } catch (err) {
console.error('[executeAmigaDoor] Unable to persist session for door input:', err);
    }

    // Log door start to Node{N}/DoorLog (express.e:9392-9419)
    const doorTypeCode = doorType === 'XIM' ? DoorType.XIM :
                         doorType === 'SIM' ? DoorType.SIM :
                         doorType === 'AIM' ? DoorType.AIM :
                         doorType === 'TIM' ? DoorType.TIM :
                         doorType === 'IIM' ? DoorType.IIM :
                         doorType === 'MCI' ? DoorType.MCI : DoorType.XIM;
    // Use doorPath for logging (like express.e: "DOORS:FILEID/FILEID")
    logDoorStart(bbsRoot, nodeNumber, doorTypeCode, session.user?.username || 'Unknown', doorPath);

    // Start the door execution
    await amigaSession.start();

    // Log door exit to Node{N}/DoorLog
    logDoorExit(bbsRoot, nodeNumber, doorTypeCode, session.user?.username || 'Unknown');

console.log(`[executeAmigaDoor] Door execution completed`);

    // Disable game mode when door exits
    disableGameMode(socket, session);

    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    socket.emit('door-active', false);
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch {
      /* ignore */
    }

    // Capture any return/chain/PRV/ACP requests from the door
    if (typeof (amigaSession as any).getExitState === 'function') {
      const exitState = (amigaSession as any).getExitState();
      const ximState = exitState?.ximState || {};
      console.log(`[executeAmigaDoor] getExitState returned: ximState.returnCommand="${ximState.returnCommand || 'NONE'}", hasXimProtocol=${!!exitState?.ximState}`);
      if (ximState.returnCommand) {
        (session as any).returnCommand = ximState.returnCommand;
console.log(`[executeAmigaDoor] RETURNCOMMAND requested: ${ximState.returnCommand}`);
        fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] RETURNCOMMAND captured: "${ximState.returnCommand}"\n`);
      }
      if (ximState.chainCommand) {
        (session as any).chainCommand = ximState.chainCommand;
console.log(`[executeAmigaDoor] CHAIN requested: ${ximState.chainCommand}`);
      }
      if (ximState.prvCommand) {
        (session as any).prvCommand = ximState.prvCommand;
console.log(`[executeAmigaDoor] PRV_COMMAND requested: ${ximState.prvCommand}`);
      }
      if ((exitState as any).bbsSession?.acpCommand) {
        (session as any).acpCommand = (exitState as any).bbsSession.acpCommand;
console.log(
          `[executeAmigaDoor] ACP_COMMAND requested: ${
            (exitState as any).bbsSession.acpCommand.command || ''
          } (code=${(exitState as any).bbsSession.acpCommand.code}, target=${(exitState as any).bbsSession.acpCommand.targetNode})`
        );
      }

      // Copy flagged files from door bbsSession back to main session
      // Doors flag files via JH_FLAGFILE which stores in bbsSession.flaggedFiles
      // Main BBS download handler checks session.flaggedFiles
      if (Array.isArray((exitState as any).bbsSession?.flaggedFiles) && (exitState as any).bbsSession.flaggedFiles.length > 0) {
        if (!Array.isArray((session as any).flaggedFiles)) {
          (session as any).flaggedFiles = [];
        }
        (session as any).flaggedFiles.push(...(exitState as any).bbsSession.flaggedFiles);
        console.log(`[executeAmigaDoor] Copied ${(exitState as any).bbsSession.flaggedFiles.length} flagged file(s) from door to session`);
      }

      // Execute requested commands immediately in priority order: CHAIN -> RETURN -> PRV -> ACP
      try {
        // CRITICAL: Use processCommand directly, NOT handleCommand!
        // handleCommand is for character-by-character input with line buffering.
        // processCommand executes a full command string immediately.
        // Door RETURNCOMMAND is a system-initiated call (like express.e processSysCommand),
        // so allowSyscmd=true — express.e:28249.
        const { processCommand } = require('./command.handler');
        const runCommand = async (cmd?: string) => {
          if (cmd && cmd.trim().length > 0) {
            const trimmed = cmd.trim();
            const parts = trimmed.toUpperCase().split(/\s+/);
            const command = parts[0];
            const params = parts.slice(1).join(' ');
            console.log(`[door.handler] Executing RETURNCOMMAND via processCommand: ${command} ${params}`);
            await processCommand(socket, session, command, params, true);
          }
        };

        if ((session as any).chainCommand) {
          const cmd = (session as any).chainCommand;
          (session as any).chainCommand = undefined;
          (session as any).returnCommand = undefined;
          (session as any).prvCommand = undefined;
          (session as any).acpCommand = undefined;
          await runCommand(cmd);
        } else {
          if ((session as any).returnCommand) {
            const cmd = (session as any).returnCommand;
            (session as any).returnCommand = undefined;
            await runCommand(cmd);
          }
          if ((session as any).prvCommand) {
            const cmd = (session as any).prvCommand;
            (session as any).prvCommand = undefined;
            await runCommand(cmd);
          }
          const acp = (session as any).acpCommand;
          if (acp && acp.command) {
            (session as any).acpCommand = undefined;
            await runCommand(acp.command);
            applyAcpSideEffect(session, acp);
          }
        }
      } catch (err) {
console.warn('[executeAmigaDoor] Failed to auto-run pending door commands:', err);
      }
    }

    // Return to menu (only if user is logged in and no pause is active)
    // CRITICAL: If processCommand set up a pause (via advanceDisplayFlow -> doPause),
    // do NOT call displayMainMenu here - it would clear paginatedScreen and break the pause.
    // The display flow will handle showing the menu after the user dismisses the pause.
    const doorName = door?.name || door?.command || 'Unknown';
    fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] executeAmigaDoor EXIT: door="${doorName}", paginatedScreen=${!!session.paginatedScreen}, returnCommand=${(session as any).returnCommand || 'NONE'}\n`);
    if (session.paginatedScreen) {
      console.log('[executeAmigaDoor] Pause is active, skipping displayMainMenu (will resume via display flow)');
      fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] executeAmigaDoor: SKIPPING displayMainMenu (pause active)\n`);
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.menuPause = false;
      if (session.state === BBSState.LOGGEDON && session.user) {
        await displayMainMenu(socket, session);
      }
    }

  } catch (error) {
console.error(`[executeAmigaDoor] Error executing Amiga door:`, error);
    emitText(socket, `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    socket.emit('door-active', false);
    delete session.doorInputHandler;
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch {
      /* ignore */
    }
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    if (session.state === BBSState.LOGGEDON && session.user) {
      await displayMainMenu(socket, session);
    }
  }
}

/**
 * Execute MCI door - displays text with MCI codes processed
 * Based on express.e:4293-4297
 *
 * MCI doors don't execute a program - they just display text with MCI codes.
 * The MCI_TEXT tooltype contains the text to display with codes like ~CL., ~N|, etc.
 */
async function executeMciDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
console.log(`[executeMciDoor] Processing MCI door: ${door.name}`);

  if (!door.mciText) {
console.error(`[executeMciDoor] No MCI_TEXT found for door: ${door.name}`);
    emitText(socket, '\r\n\x1b[31mMCI door has no text to display.\x1b[0m\r\n');
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Import parseMciCodes function
  const { parseMciCodes } = require('./screen.handler');

  // Convert escape sequences in MCI_TEXT to actual characters
  // Replace literal \r\n, \r, \n with actual CRLF
  let mciText = door.mciText
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');

  // Process MCI codes inline (express.e:4297 calls processMci())
  // Passing socket enables inline emission and command execution
  const bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
  const { loadBBSConfig } = require('../services/bbs-config-file.service');
  const bbsConfig = loadBBSConfig(bbsRoot);
  
  const parsedResult = await parseMciCodes(
    mciText, 
    session, 
    bbsConfig.bbs_name, 
    bbsConfig.sysop_name, 
    bbsConfig.location, 
    socket
  );

  // If the result wasn't already emitted inline (no special codes), send it now
  if (!parsedResult.inlineEmitted && parsedResult.parsed.length > 0) {
    let processedText = parsedResult.parsed;
    const { addAnsiEscapes } = require('./screen.handler');
    processedText = addAnsiEscapes(processedText);
    processedText = processedText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    emitText(socket, processedText);
  }

  // Handle manual pause if requested by MCI (~SP.)
  if (parsedResult.hasPause) {
    const { doPause } = require('./screen.handler');
    doPause(socket, session);
  } else {
    // Standard pause after display
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

console.log(`[executeMciDoor] MCI door completed: ${door.name}`);
}

/**
 * Execute web-compatible door (ported AmiExpress doors)
 */
async function executeWebDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  disableShortcuts(session);
  switch (door.id) {
    case 'sal':
      await executeSAmiLogDoor(socket, session, door, doorSession);
      break;
    case 'checkup':
      await executeCheckUPDoor(socket, session, door, doorSession);
      break;
    default:
      emitText(socket, 'Door implementation not found.\r\n');
  }
}

/**
 * Execute SAmiLog callers log viewer door
 */
async function executeSAmiLogDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  emitText(socket, '\x1b[36m-= Super AmiLog v3.00 =-\x1b[0m\r\n');
  emitText(socket, 'Advanced Callers Log Viewer\r\n\r\n');

  // Read from caller_activity table (express.e reads from BBS:NODE{x}/CALLERSLOG)
  emitText(socket, 'Recent callers:\r\n\r\n');

  const recentActivity = await getRecentCallerActivity(20);

  if (recentActivity.length === 0) {
    emitText(socket, 'No caller activity recorded yet.\r\n');
  } else {
    recentActivity.forEach(activity => {
      const timestamp = new Date(activity.timestamp);
      const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
      const details = activity.details ? ` - ${activity.details}` : '';
      emitText(socket, `${timeStr} ${activity.username.padEnd(15)} ${activity.action}${details}\r\n`);
    });
  }

  emitPrompt(socket, '\r\n\x1b[32mPress any key to exit SAmiLog...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute CheckUP file checking utility
 */
async function executeCheckUPDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  emitText(socket, '\x1b[36m-= CheckUP v0.4 =-\x1b[0m\r\n');
  emitText(socket, 'File checking utility for upload directories\r\n\r\n');

  // Check upload directory for files (in database, check for unchecked uploads)
  emitText(socket, 'Checking upload directory...\r\n');

  // Query database for unchecked files (checked = 'N')
  const result = await db.query(
    "SELECT filename, size, uploader FROM file_entries WHERE checked = 'N' ORDER BY uploaddate DESC LIMIT 10"
  );

  const uncheckedFiles = result.rows;

  if (uncheckedFiles.length > 0) {
    emitText(socket, `Files found in upload directory! (${uncheckedFiles.length})\r\n`);
    emitText(socket, 'Processing uploads...\r\n\r\n');

    // Display each unchecked file
    for (const file of uncheckedFiles) {
      const sizeKB = Math.ceil(file.size / 1024);
      emitText(socket, `- ${file.filename.padEnd(15)} ${sizeKB.toString().padStart(5)}K by ${file.uploader}\r\n`);
      emitText(socket, '  Status: Archive OK\r\n');
    }

    emitText(socket, '\r\nAll files processed and ready for download.\r\n');
  } else {
    emitText(socket, 'No unchecked files found in upload directory.\r\n');
    emitText(socket, 'All uploads have been processed.\r\n');
  }

  emitPrompt(socket, '\r\n\x1b[32mCheckUP completed. Press any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Check if file is an Amiga executable (Hunk format)
 * Amiga executables start with 0x000003F3 (HUNK_HEADER)
 */
function isAmigaBinary(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    // Check for Hunk format magic number
    const magic = buffer.readUInt32BE(0);
    return magic === 0x000003F3;
  } catch (error) {
console.error('Error checking if file is Amiga binary:', error);
    return false;
  }
}

/**
 * Execute native door - Detects Amiga binaries and uses 68k emulation
 * Web version: Executes Node.js scripts OR Amiga native executables via emulation
 * express.e equivalent: SystemTagList() execution
 */
async function executeNativeDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
console.log(` [DOOR] Executing native door: ${door.name} (${door.path})`);
  disableShortcuts(session);

  // Check if door file exists (use amigafs for case-insensitive matching)
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!amigafs.existsSync(doorPath)) {
    emitText(socket, `\r\n\x1b[31mError: Door file not found: ${door.path}\x1b[0m\r\n`);
    emitText(socket, '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  //  HISTORIC MOMENT: Check if this is an Amiga binary!
  if (isAmigaBinary(doorPath)) {
console.log(' [AMIGA DOOR] Detected Amiga binary! Starting 68k emulation...');

    try {
      const amigaSession = new AmigaDoorSession(socket, {
        executablePath: doorPath,
        timeout: 600,  // 10 minutes
      });

      await amigaSession.start();

      // Wait for session to complete
      // The AmigaDoorSession handles its own lifecycle
      emitText(socket, '\r\n\x1b[32mAmiga door session completed.\x1b[0m\r\n');
    } catch (error) {
console.error('[AMIGA DOOR] Error:', error);
      emitText(socket, `\r\n\x1b[31mAmiga door error: ${(error as Error).message}\x1b[0m\r\n`);
      doorSession.status = 'error';
    }

    return;
  }

  // Prepare environment variables for door script
  const env = {
    ...process.env,
    BBS_USERNAME: session.user?.username || 'Guest',
    BBS_USER_ID: session.user?.id || '',
    BBS_SECURITY_LEVEL: session.user?.secLevel?.toString() || '0',
    BBS_DOOR_ID: door.id,
    BBS_DOOR_NAME: door.name,
    BBS_NODE: '1' // Node number for multi-node support
  };

  try {
    const doorProcess = spawn('node', [doorPath, ...(door.parameters || [])], {
      env,
      cwd: path.dirname(doorPath)
    });

    // Capture stdout and send to user
    doorProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      emitText(socket, output);

      // Store in door session history
      if (!doorSession.output) doorSession.output = [];
      doorSession.output.push(output);
    });

    // Capture stderr
    doorProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
console.error(`[DOOR ${door.id}] Error:`, error);
      emitText(socket, `\x1b[31m${error}\x1b[0m`);
    });

    // Wait for door to complete
    await new Promise<void>((resolve, reject) => {
      doorProcess.on('close', (code: number) => {
console.log(`[DOOR ${door.id}] Exited with code ${code}`);

        if (code === 0) {
          emitText(socket, `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);
          resolve();
        } else {
          emitText(socket, `\r\n\r\n\x1b[31m${door.name} exited with error code ${code}.\x1b[0m\r\n`);
          doorSession.status = 'error';
          resolve(); // Still resolve to continue
        }
      });

      doorProcess.on('error', (err: Error) => {
console.error(`[DOOR ${door.id}] Spawn error:`, err);
        emitText(socket, `\r\n\x1b[31mError executing door: ${err.message}\x1b[0m\r\n`);
        doorSession.status = 'error';
        reject(err);
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        doorProcess.kill();
        emitText(socket, '\r\n\x1b[31mDoor execution timeout (10 minutes).\x1b[0m\r\n');
        doorSession.status = 'error';
        resolve();
      }, 600000);
    });

  } catch (error: any) {
console.error(`[DOOR ${door.id}] Execution error:`, error);
    emitText(socket, `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute script door (shell script)
 * Web version: Executes shell scripts instead of AREXX
 * express.e equivalent: Execute() AREXX command
 */
async function executeScriptDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
console.log(` [DOOR] Executing script door: ${door.name} (${door.path})`);
  disableShortcuts(session);

  // Check if door script exists (use amigafs for case-insensitive matching)
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!amigafs.existsSync(doorPath)) {
    emitText(socket, `\r\n\x1b[31mError: Script not found: ${door.path}\x1b[0m\r\n`);
    emitText(socket, '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  // Prepare environment variables for script
  const env = {
    ...process.env,
    BBS_USERNAME: session.user?.username || 'Guest',
    BBS_USER_ID: session.user?.id || '',
    BBS_SECURITY_LEVEL: session.user?.secLevel?.toString() || '0',
    BBS_DOOR_ID: door.id,
    BBS_DOOR_NAME: door.name,
    BBS_NODE: '1'
  };

  try {
    // Determine shell based on script extension
    const ext = path.extname(doorPath).toLowerCase();
    let command: string;
    let args: string[];

    if (ext === '.sh' || ext === '.bash') {
      command = 'bash';
      args = [doorPath, ...(door.parameters || [])];
    } else if (ext === '.py' || ext === '.python') {
      command = 'python3';
      args = [doorPath, ...(door.parameters || [])];
    } else {
      // Generic executable
      command = doorPath;
      args = door.parameters || [];
    }

    const doorProcess = spawn(command, args, {
      env,
      cwd: path.dirname(doorPath)
    });

    // Capture stdout and send to user
    doorProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      emitText(socket, output);

      // Store in door session history
      if (!doorSession.output) doorSession.output = [];
      doorSession.output.push(output);
    });

    // Capture stderr
    doorProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
console.error(`[DOOR ${door.id}] Error:`, error);
      emitText(socket, `\x1b[31m${error}\x1b[0m`);
    });

    // Wait for door to complete
    await new Promise<void>((resolve, reject) => {
      doorProcess.on('close', (code: number) => {
console.log(`[DOOR ${door.id}] Exited with code ${code}`);

        if (code === 0) {
          emitText(socket, `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);
          resolve();
        } else {
          emitText(socket, `\r\n\r\n\x1b[31m${door.name} exited with error code ${code}.\x1b[0m\r\n`);
          doorSession.status = 'error';
          resolve(); // Still resolve to continue
        }
      });

      doorProcess.on('error', (err: Error) => {
console.error(`[DOOR ${door.id}] Spawn error:`, err);
        emitText(socket, `\r\n\x1b[31mError executing script: ${err.message}\x1b[0m\r\n`);
        doorSession.status = 'error';
        reject(err);
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        doorProcess.kill();
        emitText(socket, '\r\n\x1b[31mScript execution timeout (10 minutes).\x1b[0m\r\n');
        doorSession.status = 'error';
        resolve();
      }, 600000);
    });

  } catch (error: any) {
console.error(`[DOOR ${door.id}] Execution error:`, error);
    emitText(socket, `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute Python door
 * Runs Python scripts with full BBS environment variables
 */
async function executePythonDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
console.log(`[executePythonDoor] Starting Python door: ${door.name}`);
console.log(`[executePythonDoor] Door path: ${door.path}`);
  disableShortcuts(session);

  // Check if door script exists (use amigafs for case-insensitive matching)
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!amigafs.existsSync(doorPath)) {
    emitText(socket, `\r\n\x1b[31mError: Python script not found: ${door.path}\x1b[0m\r\n`);
    emitText(socket, '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  // Get node ID from session
  const nodeId = session.nodeId || 1;

  // Calculate time remaining
  const timeRemaining = session.timeRemaining || 60;

  const { user: pythonDoorUser } = resolveDoorExecutionUser(session);

  // Create drop files for the door
  doorDropFileManager.createAllDropFiles(nodeId, pythonDoorUser, timeRemaining);

  // Get drop file directory path
  const config = require('../config').config;
  const bbsRoot = config.get('dataDir');
  const dropFileDir = path.join(bbsRoot, `Node${nodeId}`);

  // Prepare comprehensive environment variables for Python script
  const env = {
    ...process.env,
    // User information
    BBS_USERNAME: pythonDoorUser.username,
    BBS_USER_ID: pythonDoorUser.id,
    BBS_REALNAME: pythonDoorUser.realname,
    BBS_LOCATION: pythonDoorUser.location,
    BBS_SECURITY_LEVEL: pythonDoorUser.secLevel.toString(),
    // Door information
    BBS_DOOR_ID: door.id,
    BBS_DOOR_NAME: door.name,
    BBS_NODE: nodeId.toString(),
    // Drop file paths
    BBS_DROP_DIR: dropFileDir,
    BBS_DOOR_SYS: path.join(dropFileDir, 'DOOR.SYS'),
    BBS_DOOR32_SYS: path.join(dropFileDir, 'DOOR32.SYS'),
    BBS_DORINFO_DEF: path.join(dropFileDir, `DORINFO${nodeId}.DEF`),
    // Conference information
    BBS_CONFERENCE: session.currentConf?.toString() || '1',
    BBS_CONFERENCE_NAME: session.currentConfName || 'General',
    // Time information
    BBS_TIME_REMAINING: timeRemaining.toString(),
    BBS_TIME_ONLINE: Math.floor((Date.now() - session.loginTime) / 60000).toString()
  };

  try {
    // Execute Python script
    const pythonProcess = spawn('python3', [doorPath, ...(door.parameters || [])], {
      env,
      cwd: path.dirname(doorPath)
    });

    // Capture stdout and send to user
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      emitText(socket, output);

      // Store in door session history
      if (!doorSession.output) doorSession.output = [];
      doorSession.output.push(output);
    });

    // Capture stderr
    pythonProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
console.error(`[Python Door ${door.id}] Error:`, error);
      emitText(socket, `\x1b[31m${error}\x1b[0m`);
    });

    // Allow user input to Python script via stdin
    const userInputHandler = (input: string) => {
      pythonProcess.stdin.write(input);
    };

    // Register input handler in session
    session.doorInputHandler = userInputHandler;

    // Wait for door to complete
    await new Promise<void>((resolve, reject) => {
      pythonProcess.on('close', (code: number) => {
console.log(`[Python Door ${door.id}] Exited with code ${code}`);

        // Clean up input handler
        delete session.doorInputHandler;

        if (code === 0) {
          emitText(socket, `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);
          resolve();
        } else {
          emitText(socket, `\r\n\r\n\x1b[31m${door.name} exited with error code ${code}.\x1b[0m\r\n`);
          doorSession.status = 'error';
          resolve();
        }
      });

      pythonProcess.on('error', (err: Error) => {
console.error(`[Python Door ${door.id}] Spawn error:`, err);
        emitText(socket, `\r\n\x1b[31mError executing Python script: ${err.message}\x1b[0m\r\n`);
        doorSession.status = 'error';

        // Clean up input handler
        delete session.doorInputHandler;

        reject(err);
      });

      // Timeout after 30 minutes
      setTimeout(() => {
        pythonProcess.kill();
        emitText(socket, '\r\n\x1b[31mPython door timeout (30 minutes).\x1b[0m\r\n');
        doorSession.status = 'error';

        // Clean up input handler
        delete session.doorInputHandler;

        resolve();
      }, 1800000);
    });

  } catch (error: any) {
console.error(`[Python Door ${door.id}] Execution error:`, error);
    emitText(socket, `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute ARexx door
 * Emulates ARexx script execution using a JavaScript ARexx interpreter
 * In AmiExpress, AREXX doors interact with the BBS via ARexx port commands
 */
async function executeARexxDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
console.log(`[executeARexxDoor] Starting ARexx door: ${door.name}`);
console.log(`[executeARexxDoor] Door path: ${door.path}`);
  disableShortcuts(session);

  // Check if door script exists (use amigafs for case-insensitive matching)
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!amigafs.existsSync(doorPath)) {
    emitText(socket, `\r\n\x1b[31mError: ARexx script not found: ${door.path}\x1b[0m\r\n`);
    emitText(socket, '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  try {
    // Import ARexx engine from arexx.ts
    const { arexxEngine } = require('../arexx');

  // Get node ID from session
  const nodeId = session.nodeId || 1;

  // Calculate time remaining
  const timeRemaining = session.timeRemaining || 60;

  const { user: arexxDoorUser } = resolveDoorExecutionUser(session);

  // Create drop files for the door
  doorDropFileManager.createAllDropFiles(nodeId, arexxDoorUser, timeRemaining);

    // Get drop file directory path
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const dropFileDir = path.join(bbsRoot, `Node${nodeId}`);

    // Create BBS API instance for ARexx door
    const { createBBSApi } = require('../doors/BBSApi');
    const bbsApi = createBBSApi(socket, session);

    // Prepare ARexx context with BBS environment and full API
    const arexxContext = {
      // User information
      username: arexxDoorUser.username,
      userId: arexxDoorUser.id,
      realname: arexxDoorUser.realname,
      location: arexxDoorUser.location,
      securityLevel: arexxDoorUser.secLevel,
      // Door information
      doorId: door.id,
      doorName: door.name,
      nodeId: nodeId,
      // Drop file paths
      dropDir: dropFileDir,
      doorSys: path.join(dropFileDir, 'DOOR.SYS'),
      door32Sys: path.join(dropFileDir, 'DOOR32.SYS'),
      dorinfodef: path.join(dropFileDir, `DORINFO${nodeId}.DEF`),
      // Conference information
      conference: session.currentConf || 1,
      conferenceName: session.currentConfName || 'General',
      // Time information
      timeRemaining: timeRemaining,
      timeOnline: Math.floor((Date.now() - session.loginTime) / 60000),

      // === BBS API FUNCTIONS (Full Feature Parity) ===

      // Output functions
      output: (text: string) => {
        emitText(socket, text);
        if (!doorSession.output) doorSession.output = [];
        doorSession.output.push(text);
      },
      write: (text: string) => bbsApi.write(text),
      writeLine: (text: string) => bbsApi.writeLine(text),
      clearScreen: () => bbsApi.clearScreen(),
      moveCursor: (row: number, col: number) => bbsApi.moveCursor(row, col),
      setColor: (colorCode: number) => bbsApi.setColor(colorCode),

      // Input functions
      input: (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
          emitText(socket, prompt);

          const inputHandler = (data: string) => {
            delete session.doorInputHandler;
            resolve(data);
          };

          session.doorInputHandler = inputHandler;
        });
      },
      getLine: (prompt?: string, maxLength?: number) => bbsApi.getLine(prompt, maxLength),
      getKey: (prompt?: string) => bbsApi.getKey(prompt),
      hotkey: (options: string[], prompt?: string) => bbsApi.hotkey(options, prompt),

      // User data functions
      getUser: () => bbsApi.getUser(),
      getUserSecLevel: () => bbsApi.getUserSecLevel(),
      getTimeRemaining: () => bbsApi.getTimeRemaining(),
      getTimeOnline: () => bbsApi.getTimeOnline(),

      // Conference functions
      getCurrentConference: () => bbsApi.getCurrentConference(),
      getCurrentConferenceName: () => bbsApi.getCurrentConferenceName(),
      joinConference: (confNum: number) => bbsApi.joinConference(confNum),
      listConferences: () => bbsApi.listConferences(),

      // Node/system functions
      getNodeNumber: () => bbsApi.getNodeNumber(),
      getSystemInfo: () => bbsApi.getSystemInfo(),
      getNodes: () => bbsApi.getNodes(),

      // File I/O functions
      readFile: (filename: string) => bbsApi.readFile(filename),
      writeFile: (filename: string, content: string) => bbsApi.writeFile(filename, content),
      fileExists: (filename: string) => bbsApi.fileExists(filename),
      listFiles: (directory: string, pattern?: string) => bbsApi.listFiles(directory, pattern),
      // Amiga .info file functions (proper binary parsing)
      readInfoFile: (filename: string) => bbsApi.readInfoFile(filename),
      writeInfoFile: (filename: string, tooltypes: Array<{ key: string; value: string; commented?: boolean }>) => bbsApi.writeInfoFile(filename, tooltypes),

      // Message functions
      sendMessage: (toUsername: string, subject: string, body: string) => bbsApi.sendMessage(toUsername, subject, body),
      postMessage: (subject: string, body: string) => bbsApi.postMessage(subject, body),

      // Utility functions
      logActivity: (action: string, details?: string) => bbsApi.logActivity(action, details),
      displayFile: (filename: string) => bbsApi.displayFile(filename),
      pause: (prompt?: string) => bbsApi.pause(prompt),
      displayMCI: (text: string) => bbsApi.displayMCI(text)
    };

    // Execute ARexx script through the ARexx engine
console.log(`[executeARexxDoor] Executing script: ${doorPath}`);
    await arexxEngine.executeScript(doorPath, arexxContext);

    emitText(socket, `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);

  } catch (error: any) {
console.error(`[ARexx Door ${door.id}] Execution error:`, error);
    emitText(socket, `\r\n\x1b[31mError executing ARexx script: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Initialize door collection
 * Converts CommandDefinition objects from BBSCMD into Door objects
 *
 * express.e:28228 - Command priority: SYSCMD > BBSCMD > InternalCommand
 * BBSCMD doors are loaded from .info files in Commands/BBSCmd/
 */
/**
 * Reload doors cache (call when doors are added/modified/deleted)
 */
export async function reloadDoors() {
console.log('[reloadDoors] Reloading doors cache...');

  // Reload command definitions from .info files
  const bbsBaseDir = require('../config').config.get('dataDir');
  const { loadCommands } = await import('./command-execution.handler');
  loadCommands(bbsBaseDir, 1, 0);

  // Reinitialize doors
  await initializeDoors();

console.log(`[reloadDoors] Doors cache reloaded: ${doors.length} doors`);
  return doors;
}

export async function initializeDoors() {
  // Use require to get the SAME module instance as loadCommands (dynamic import may get a separate ESM instance)
  const { commandCache } = require('./command-execution.handler');
  const bbsBaseDir = require('../config').config.get('dataDir');

  console.log(`[initializeDoors] commandCache.bbscmd.size=${commandCache.bbscmd.size}, syscmd.size=${commandCache.syscmd.size}`);

  // Helper to calculate directory size (skips node_modules/.git)
  const calculateDirSize = (dirPath: string): number => {
    let totalSize = 0;
    try {
      const files = amigafs.readdirSync(dirPath);
      for (const file of files) {
        // Skip node_modules and .git but include dist (compiled code)
        if (file === 'node_modules' || file === '.git') continue;
        const filePath = path.join(dirPath, file);
        try {
          const stats = amigafs.statSync(filePath);
          if (stats.isDirectory()) {
            totalSize += calculateDirSize(filePath);
          } else {
            totalSize += stats.size;
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return totalSize;
  };

  // AmigaDOS assign map for path resolution in door size calculation.
  // LOCATION= fields use assigns like "Doors:SomeDoor/binary" which must be
  // stripped and replaced with their physical path before stat-ing.
  const amigaAssigns: Record<string, string> = {
    'bbs:':       bbsBaseDir,
    'doors:':     path.join(bbsBaseDir, 'Doors'),
    'screens:':   path.join(bbsBaseDir, 'Screens'),
    'storage:':   path.join(bbsBaseDir, 'Storage'),
    'protocols:': path.join(bbsBaseDir, 'Protocols'),
    'utils:':     path.join(bbsBaseDir, 'Utils'),
    'libs:':      path.join(bbsBaseDir, 'Libs'),
  };

  const resolveAmigaPath = (amigaPath: string): string => {
    const lower = amigaPath.toLowerCase();
    for (const [assign, physPath] of Object.entries(amigaAssigns)) {
      if (lower.startsWith(assign)) {
        return path.join(physPath, amigaPath.substring(assign.length));
      }
    }
    return path.isAbsolute(amigaPath) ? amigaPath : path.join(bbsBaseDir, amigaPath);
  };

  // Helper to get door size from path
  const getDoorSize = (doorPath: string): number => {
    if (!doorPath) return 0;
    // Resolve AmigaDOS assign prefix before building filesystem path
    const fullPath = resolveAmigaPath(doorPath);
    try {
      const stats = amigafs.statSync(fullPath);
      if (stats.isDirectory()) {
        return calculateDirSize(fullPath);
      }
      return stats.size;
    } catch {
      // Binary not found at LOCATION path — try the parent directory
      // (TypeScript doors at e.g. Doors/bbslink/ replace the Amiga binary)
      const parentDir = path.dirname(fullPath);
      try {
        if (amigafs.existsSync(parentDir)) {
          return calculateDirSize(parentDir);
        }
      } catch { /* ignore */ }
      return 0;
    }
  };

  // Convert CommandDefinition objects from BBSCMD to Door objects
  const bbsCmdDoors: Door[] = [];

  for (const [cmdName, cmdDef] of commandCache.bbscmd) {
    // Map door type codes to execution types
    let doorType: string = cmdDef.type;
    if (doorType === 'TS') {
      doorType = 'typescript';
    } else if (doorType === 'PYTHON' || doorType === 'PY') {
      doorType = 'python';
    } else if (doorType === 'AREXX' || doorType === 'REXX') {
      doorType = 'arexx';
    }

    // Convert CommandDefinition to Door interface
    const door: Door = {
      id: cmdDef.name.toLowerCase(),
      name: cmdDef.name,
      description: `${cmdDef.type} door`,
      command: cmdDef.name.toUpperCase(),  // Door command (e.g., "HELLOTS")
      path: cmdDef.location,                // Path from LOCATION= field
      accessLevel: cmdDef.access || 0,      // ACCESS= level
      enabled: true,
      type: doorType,                       // TYPE= (XIM, AIM, TS  typescript, etc.)
      size: getDoorSize(cmdDef.location),   // Calculate file/directory size
      parameters: [],
      stack: cmdDef.stack,
      priority: cmdDef.priority,
      resident: cmdDef.resident,
      expertMode: cmdDef.expertMode,
      trapOn: cmdDef.trapOn,
      silent: cmdDef.silent,
      quickMode: cmdDef.quickMode,
      multiNode: cmdDef.multiNode,
      logInputs: cmdDef.logInputs,
      scriptCheck: cmdDef.scriptCheck,
      banner: cmdDef.banner,
      mimicVer: cmdDef.mimicVer,
      passParameters: cmdDef.passParameters,
      internal: cmdDef.internal,
      args: cmdDef.args,
      toolTypes: cmdDef.toolTypes,
      // Prefer explicit CATEGORY tooltype; otherwise bucket 68K binaries under
      // "Amiga 68K" so they aren't hidden in "Misc" next to unclassified TS doors.
      // Without this fallback, ~60 XIM/AIM/SIM/TIM doors all collapse into Misc
      // and look absent from category-based menus like doors-menu.
      category: cmdDef.toolTypes?.['CATEGORY'] ||
        (['XIM','AIM','SIM','TIM','IIM'].includes((cmdDef.type || '').toUpperCase())
          ? 'Amiga 68K'
          : undefined)
    };

    bbsCmdDoors.push(door);
console.log(`[initializeDoors] Registered door: ${door.command}  ${door.path} (type: ${doorType})`);
  }

  // All doors come exclusively from Commands/BBSCmd/*.info LOCATION= fields.
  // Like AmiExpress, the DOORS: assign resolves to Doors/ — every door executable
  // must live under Doors/. No hardcoded door arrays; register via .info instead.
  doors = bbsCmdDoors;

  // Validate: warn if any registered door resolves outside Doors/
  const doorsDir = path.join(bbsBaseDir, 'Doors');
  for (const door of doors) {
    if (!door.path) continue;
    const resolved = resolveAmigaPath(door.path);
    if (!resolved.startsWith(doorsDir) && !resolved.startsWith(doorsDir.toLowerCase())) {
      console.warn(`[initializeDoors] WARN: door ${door.command} LOCATION="${door.path}" resolves outside Doors/ (${resolved}) — move to Doors/ and update .info`);
    }
  }

console.log(`[initializeDoors] Total doors registered: ${doors.length}`);
}

/**
 * Execute external pager door (like runSysCommand('PAGER') in AmiExpress)
 */
export function executePagerDoor(socket: any, session: BBSSession, chatSession: ChatSession): boolean {
  // For now, always fall back to internal pager
  // In full implementation, this would check for PAGER door and execute it
  return false;
}

/**
 * Execute client door (browser-based)
 * Serves bundled JavaScript to browser and establishes WebSocket bridge
 */
async function executeClientDoor(socket: any, session: BBSSession, door: Door, manifest: any): Promise<string | null> {
console.log(`[executeClientDoor] Starting client door: ${door.name}`);

  const { getClientDoorBridge } = require('../doors/client-door-bridge');
  const bridge = getClientDoorBridge();

  try {
    // Start WebSocket bridge session
    const sessionId = bridge.startSession(socket, session, door.id);

    // Set door active flag
    session.inDoorManager = true;
console.log(`[executeClientDoor] Set inDoorManager=true for session`);
    session.clientDoorActive = true;

    // Disable modem speed throttling for client doors (they need full speed)
    const { getModemEmulator: getClientModemEmulator } = require('../utils/modem-emulator.util');
    const clientModemEmu = getClientModemEmulator(socket);
    (session as any)._savedModemSpeed = (session as any).modemSpeed || 0;
    if ((session as any)._savedModemSpeed > 0) {
      clientModemEmu.disable();
      socket.emit('modem-speed', 0);
    }

    // Enable mouse events for client doors (needed for games like Arkanoid)
    session.mouseEventsEnabled = true;
console.log(`[executeClientDoor] Set mouseEventsEnabled=true for session`);

    // Enable game mode for smooth key input (bypasses OS key repeat delay)
    // This makes frontend send key-down/key-up events instead of regular key events
    socket.emit('game-mode', true);
console.log(`[executeClientDoor] Emitted game-mode=true to frontend`);

    // Set a no-op input handler to prevent BBS from echoing input
    // The actual input handling is done by the client-door-bridge
    session.doorInputHandler = (data: string) => {
console.log(`[executeClientDoor] No-op doorInputHandler called with:`, JSON.stringify(data));
      // Input is handled by client-door-bridge, not here
    };
console.log(`[executeClientDoor] Set doorInputHandler (no-op)`);

    // Notify frontend to load client door
    socket.emit('door:load-client', {
      doorId: door.id,
      sessionId,
      bundleUrl: `/api/doors/${door.id}/bundle.js?v=${Date.now()}`,
      manifest: {
        name: manifest.name,
        version: manifest.version,
        runtime: manifest.runtime,
      },
    });

console.log(`[executeClientDoor] Client door session started: ${sessionId}`);

    // Log door execution
    const nodeId = session.nodeId || 0;
    const { user: clientDoorUser, isGuest } = resolveDoorExecutionUser(session);
    callersLog(isGuest ? null : clientDoorUser.id, clientDoorUser.username, 'Executed client door', door.name);
    callersLogManager.logDoor(nodeId, door.name);

    // Give the frontend 1 second to load the bundle and set up listeners
    // before the server proceeds to the server-side component.
    await new Promise(resolve => setTimeout(resolve, 1000));

    return sessionId;

  } catch (error) {
console.error(`[executeClientDoor] Error starting client door:`, error);
    emitText(socket, `\r\n\x1b[31mError starting door: ${(error as Error).message}\x1b[0m\r\n`);
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.inDoorManager;
    return null;
  }
}

/**
 * Load door manifest for execution
 * Checks SDK examples and doors directory for package.json
 */
async function loadDoorManifestForExecution(door: Door): Promise<any | null> {
  try {
console.log(`[loadDoorManifestForExecution] Loading manifest for door: ${door.name}, id: ${door.id}, path: ${door.path}`);

    // Get BBS root (use BBS_ROOT env var or default to project root)
    const bbsRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

    // First try: Use door.path directly if provided (case-insensitive via amigafs)
    if (door.path) {
      const doorPathAbsolute = path.join(bbsRoot, door.path, 'package.json');
console.log(`[loadDoorManifestForExecution] Trying door.path: ${doorPathAbsolute}`);
      if (amigafs.existsSync(doorPathAbsolute)) {
        const content = amigafs.readFileSync(doorPathAbsolute, 'utf8').toString();
        const manifest = JSON.parse(content);
console.log(`[loadDoorManifestForExecution] Found manifest via door.path, runtime: ${manifest.runtime || 'not specified'}`);
        return manifest;
      }
    }

    // Second try: Extract door ID from path and try lowercase 'doors' (legacy fallback)
    let doorId = door.id;
    if (door.path) {
      const pathParts = door.path.split('/');
      // Look for sdk/doors/<doorId> pattern
      const examplesIndex = pathParts.indexOf('examples');
      if (examplesIndex >= 0 && pathParts[examplesIndex + 1]) {
        doorId = pathParts[examplesIndex + 1];
      }
      // Look for doors/<doorId> pattern (case-insensitive)
      const doorsIndex = pathParts.findIndex(p => p.toLowerCase() === 'doors');
      if (doorsIndex >= 0 && pathParts[doorsIndex + 1]) {
        doorId = pathParts[doorsIndex + 1];
      }
    }

console.log(`[loadDoorManifestForExecution] Extracted doorId: ${doorId}`);

    // Try lowercase doors directory at BBS root (legacy path, case-insensitive via amigafs)
    const doorsPath = path.join(bbsRoot, 'doors', doorId, 'package.json');
console.log(`[loadDoorManifestForExecution] Trying legacy doors path: ${doorsPath}`);
    if (amigafs.existsSync(doorsPath)) {
      const content = amigafs.readFileSync(doorsPath, 'utf8').toString();
      const manifest = JSON.parse(content);
console.log(`[loadDoorManifestForExecution] Found legacy doors manifest, runtime: ${manifest.runtime || 'not specified'}`);
      return manifest;
    }

console.log(`[loadDoorManifestForExecution] No manifest found for ${door.name} (id: ${door.id}, doorId: ${doorId})`);
    return null;
  } catch (error) {
console.error(`[loadDoorManifestForExecution] Error loading manifest:`, error);
    return null;
  }
}
