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
import { doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';
import { routeAmigaDoorInput } from '../amiga-emulation/door-input-router';
import { consumePendingSysopPage, runSysopPageWait } from './chat/chat.handler';
import type { ChatSession } from '../services/use-cases/chat-session.use-case';
import { callersLogManager } from '../services/CallersLogManager';
import { doorDropFileManager } from '../services/DoorDropFileManager';
import { userDatabaseManager } from '../services/UserDatabaseManager';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { config } from '../config';
import { BBSState } from '../index';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { DebugLogger } from '../utils/debug-logger.util';
import { emitText, emitPrompt, emitLine, flushOutput } from '../utils/output.util';
import { resolveDoorMinColumns, declaredMinColumns, resolveDoorAdaptColumns, doorOpensForC64, doorShowsC64Mark, doorNeedsBrowser, type MinColumnsDoorShape, ADAPTED_DOOR_TYPES, DEFAULT_MIN_COLUMNS, sessionColumns, DOOR_NEEDS_80_NOTICE, DOOR_NEEDS_BROWSER_NOTICE, DOOR_NEEDS_BROWSER_MARK } from '../utils/door-min-columns.util';
import { transportCapabilities } from '../server/transport-adapter';
import { installC64DoorAdapter, uninstallC64DoorAdapter } from '../server/c64-door-adapter';
import { isNarrow, NARROW_WIDTH, narrowClip } from '../utils/table-format.util';
import { enableGameMode, disableGameMode } from '../server/socket-handlers';
import { displayMainMenu } from './command-handler/menu';
import { emitDoorActivity } from '../services/bbs-event-emitter';
import { doorCategoryAt } from '../doors/door-category';
import { getSystemTime } from '../utils/date-time.util';
import { logDoorStart, logDoorExit, DoorType } from '../utils/node-logs.util';
import { LoggedOnSubState as LoggedOnSubStateImport } from '../constants/bbs-states';
import { dateTimeToDateStamp } from '../utils/date-time.util';
import { joinVoiceChannel, leaveVoiceChannel, setVoiceMute, setVoiceVideo } from './voice-channel.handler';
import { mintLaunchToken, revokeLaunchToken } from '../doors/door-launch-token';
import { writeDoorListSnapshot, clearDoorListSnapshot } from '../doors/door-list-snapshot';
import { applyDoorInstallReports } from '../doors/door-install-reports';

import type { BBSSession } from '../index';
import type { User } from '../database/types';

/**
 * Only the DoorRepo door gets a management token, and only for a sysop.
 * Every other door has no business calling /api/doors — a token handed to
 * arbitrary door code would be a remote door-wipe credential.
 */
export function launchTokenForDoor(
  command: string,
  bbsRoot: string,
  session: { nodeId: number | string; userId: number; secLevel: number }
): string | null {
  if (command.toUpperCase() !== 'DOORREPO') return null;
  if (session.secLevel < 250) return null;
  try {
    return mintLaunchToken(bbsRoot, session);
  } catch (err) {
    // The door manager's token is bookkeeping. A board whose
    // Doors/DoorRepo is not writable still gets to run its doors - it
    // just cannot report installs back until that is fixed.
    console.warn(`[door] management token not minted: ${(err as Error).message}`);
    return null;
  }
}

export function releaseLaunchTokenForDoor(token: string | null): void {
  if (token) revokeLaunchToken(token);
}

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
export function createDoorSocketWrapper(socket: any, session: BBSSession, bbsApi: any): any {
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
    // Restore what was FOUND, not the bound copy in `rawEmit`: on a socket.io
    // Socket `emit` is a PROTOTYPE method, so putting a bound copy back pins a
    // permanent own property onto the instance, and on a connection-emitter
    // literal it leaves a function that is no longer `===` to the emitter's
    // own. Same rule as `c64-door-adapter.ts:333-344`.
    const hadOwnEmit = Object.prototype.hasOwnProperty.call(socket, 'emit');
    const found = socket.emit;
    const interceptor = ((event: string, ...args: any[]) => {
      const result = rawEmit(event, ...args);
      dispatchLocal(event, ...args);
      return result;
    }) as any;
    socket.emit = interceptor;
    cleanupOutgoing = () => {
      // Only while ours is still the live one - a layer installed during the
      // door (a C64 adapter, a modem emulator) owns the property now and
      // captured ours as ITS downstream.
      if (socket.emit !== interceptor) return;
      if (hadOwnEmit) socket.emit = found;
      else delete socket.emit;
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

    // Intercept voice:join-channel / voice:leave-channel.
    //
    // A door's emit goes server->CLIENT, so these requests were being
    // delivered to the browser, which has no handler for them: the backend
    // saw zero joins and the door's voice roster only ever held the user
    // themselves. Route them to the real voice operations, the same way
    // room:join is routed to bbsApi.
    if (event === 'voice:join-channel') {
      const data = args[0] || {};
      const callback = typeof args[1] === 'function' ? args[1] : undefined;
      const result = joinVoiceChannel(socket, data);
      if (!result.success) {
console.log('[DoorSocket] voice:join-channel failed:', result.error);
      }
      callback?.(result);
      return wrappedSocket;
    }

    if (event === 'voice:leave-channel') {
      const data = args[0] || {};
      const callback = typeof args[1] === 'function' ? args[1] : undefined;
      const result = leaveVoiceChannel(socket, data);
      callback?.(result);
      return wrappedSocket;
    }

    // Same for mute and video state: emitted at the browser, these never
    // reached the voice handler, so nobody in the channel was ever told.
    if (event === 'voice:mute') {
      setVoiceMute(socket, args[0] || { isMuted: false });
      return wrappedSocket;
    }

    if (event === 'voice:video-toggle') {
      setVoiceVideo(socket, args[0] || { hasVideo: false });
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

  // No bridge from bbsEventEmitter to this door.
  //
  // There used to be one, on the belief that "io.emit() only reaches browser
  // clients". It does not: onAnyOutgoing above fires for BROADCASTS as well
  // as direct emits, so bbsEventEmitter.broadcast()'s io.emit already reaches
  // every door's local handlers. Subscribing here as well delivered each
  // event twice, and the door drew it twice - reported with a screenshot
  // where every login, door entry and room join appeared in the chat log in
  // duplicate, while the server log showed it emitted exactly once.

  wrappedSocket._doorCleanup = () => {
    localHandlers.clear();
    cleanupOutgoing?.();
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

// Amiga 68K binary door type codes (native LoadSeg executables run under
// the 68K emulator). FIM is FAME BBS's door-type marker, routed through
// FAMEDoorPort/FIMProtocol (AmigaDoorSession.ts) instead of AEDoor.library.
// DD is DayDream BBS's door-type marker, routed through dreamdoor.library
// (DreamDoorLibrary/dreamdoor-vectors) the same way.
export { AMIGA_68K_DOOR_TYPES } from '../constants/door-types';
import { AMIGA_68K_DOOR_TYPES as AMIGA_TYPES } from '../constants/door-types';

export function isAmiga68kDoorType(t: string): boolean {
  return (AMIGA_TYPES as readonly string[]).includes((t || '').toUpperCase());
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
  // MIN_COLUMNS resolved ONCE at registration (initializeDoors), from the
  // BBSCMD tooltypes AND the installed 68K record. Undefined means the door
  // declared nothing, which the gate reads as the closed default of 80.
  // This is the field every later reader - the [40] marker and the launch
  // gate alike - resolves from, so they cannot disagree.
  minColumns?: number;
  // C64_ADAPT resolved ONCE at registration, exactly like minColumns above and
  // for the same reason: the [C64] marker is drawn from the menu entry while
  // Enter re-dispatches BY COMMAND NAME onto this object, so a door marked
  // only in its installed 68K record would otherwise show the marker and then
  // be refused at the gate.
  c64Adapt?: number;
  // CLIENT_ONLY resolved ONCE at registration, the same fold as the two above.
  // True means "this door cannot run without a browser"; undefined means the
  // registration declared nothing, which reads as "not browser-only" - a
  // tooltype boolean states a restriction, never a permission, or every
  // existing .info on every existing board would read it as off.
  needsBrowser?: boolean;
}

interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: string;
  output?: string[]; // Array of output strings from door execution
}

// ChatSession is imported from the use-case module (single source of
// truth) — this file used to carry its own narrower duplicate interface
// (no sysopId/endTime, messages: any[] instead of ChatMessage[]), which
// conflicted with the typed consumePendingSysopPage/runSysopPageWait
// imports added for the DD final-review wave (2026-08-16).

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

/**
 * Route a live keystroke to the running 68K door's protocol stack.
 *
 * Re-exported from amiga-emulation/door-input-router.ts, which is now the
 * SINGLE SOURCE OF TRUTH both doorInputHandler closures below AND
 * AmigaDoorSession's own 'door:input' socket listener delegate to (see
 * that module's header comment for why the split existed and the two
 * incidents it caused — most recently DD doors hanging live, Critical 1
 * of the DD final-review wave, 2026-08-16). Re-exported here (rather than
 * changing every import site) so existing imports of
 * `routeAmigaDoorInput` from './door.handler' keep working unchanged.
 */
export { routeAmigaDoorInput };

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
      // Prefer the DB-stored slot number (authoritative) over name search.
      // findUserSlotByName returns the LAST match, which is wrong when user.data has
      // duplicate entries (e.g. sysop appears at indices 1-7 from prior appends).
      const dbSlot = Number((session.user as any)?.slotnumber ?? (session.user as any)?.slotNumber ?? 0);
      let slotIndex = dbSlot > 0 ? dbSlot - 1 : userDatabaseManager.findUserSlotByName(username);

      // Prefer the SQLite-loaded confAccess string over the binary
      // user.data probe. Rationale (added 2026-05-20 after live JoinCnf
      // showed only 4 confs to sysop while local showed 14):
      //
      //   readConfAccessFromDisk reads the user's BINARY confaccess
      //   (10 bytes, indexed by SLOT) and pads positions 11..25 with
      //   'X' unconditionally. The padding is a workaround for the
      //   binary's 10-conf ceiling — but it FAILS when SQLite
      //   slotNumber doesn't match the binary record position (which
      //   can happen after a regen, an import, or a duplicate-name
      //   append). The door then reads the wrong slot's 10-byte
      //   pattern, sees zeros for confs 1..10, and the padding
      //   silently grants confs 11..N — visible as "only confs 11-N
      //   are accessible" in JoinCnf.
      //
      //   The SQLite confAccess is authoritative (the startup
      //   migration at initialization.ts:660-685 keeps it expanded to
      //   conferences.length). When present, use it. Fall back to the
      //   binary probe only if SQLite has no string at all.
      const sqlConfAccess: string =
        (session.user?.confAccess as any) ||
        (session.user?.conferenceAccess as any) ||
        '';

      // Same SQLite-first preference for stats as for confAccess
      // above. Stats are eventually consistent (doors write back to
      // binary during their run), but the INITIAL read can show wrong
      // values to a door that renders stats on entry (e.g. mtop,
      // displayULStats, AquaWho) when SQLite slot ≠ binary slot.
      // Synthesize a stats record from session.user so the door sees
      // the same numbers the BBS would.
      const sqlUserStats = session.user ? {
        messagesPosted: (session.user as any).messagesPosted ?? 0,
        uploads: (session.user as any).uploads ?? 0,
        downloads: (session.user as any).downloads ?? 0,
        timesCalled: (session.user as any).timesCalled ?? (session.user as any).calls ?? 0,
        timeUsed: (session.user as any).timeUsed ?? 0,
        timeLimit: (session.user as any).timeLimit ?? 0,
        timeTotal: (session.user as any).timeTotal ?? 0,
        bytesDownload: (session.user as any).bytesDownload ?? 0,
        bytesUpload: (session.user as any).bytesUpload ?? 0,
        timeLastOn: (session.user as any).lastLogin
          ? Math.floor(new Date((session.user as any).lastLogin).getTime() / 1000)
          : 0,
      } : null;

      if (slotIndex >= 0) {
        diskUserStats = sqlUserStats || userDatabaseManager.readUserStatsFromDisk(slotIndex);
        userSlotNumber = slotIndex + 1;
        confAccess =
          (sqlConfAccess && sqlConfAccess.length > 0)
            ? sqlConfAccess
            : userDatabaseManager.readConfAccessFromDisk(slotIndex);
      } else {
        // No matching binary slot at all — use SQLite as the only source.
        confAccess = sqlConfAccess;
        diskUserStats = sqlUserStats;
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
        // PETSCII callers wrap at their own width (40) whatever tempData.termWidth
        // still says from before the P answer; everyone else keeps terminalWidth.
        lineWrap: doorScreenWidth(session, terminalWidth),
        petsciiMode: session.petsciiMode === true,
        screenWidth: session.screenWidth,
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
console.log(`[doorInputHandler] Received input: "${data}" hasXIM=${!!shared.ximProtocol} hasFIM=${!!shared.fimProtocol}`);
        logDoorDebug(`KEY door=${doorInfo.command || doorInfo.id || 'UNK'} data=${JSON.stringify(data)}`);
        routeAmigaDoorInput(shared, data);
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

      // Copy flagged files from door bbsSession back to main session.
      // Doors flag via JH_FLAGFILE which stores in bbsSession.flaggedFiles.
      // CAVEAT: in the XIM emulator the door's bbsSession proxy IS the
      // main session (same object reference), so JH_FLAGFILE already
      // wrote into session.flaggedFiles. A naive push here would
      // double-flag everything (task #14: "F (flag) double-flags files"
      // + download silently sends each file twice via the dedupe-by-path
      // safety net in startZmodemDownload). Dedupe by filename+confNum
      // before pushing.
      if (Array.isArray((exitState as any).bbsSession?.flaggedFiles) && (exitState as any).bbsSession.flaggedFiles.length > 0) {
        if (!Array.isArray((session as any).flaggedFiles)) {
          (session as any).flaggedFiles = [];
        }
        const existing = (session as any).flaggedFiles as Array<{ filename?: string; fileName?: string; confNum?: number; conferenceId?: number }>;
        const seen = new Set(existing.map((f) => {
          const name = (f.filename || f.fileName || '').toString().toLowerCase();
          const conf = (f.confNum ?? f.conferenceId ?? 0);
          return `${conf}:${name}`;
        }));
        let added = 0;
        for (const f of (exitState as any).bbsSession.flaggedFiles as Array<any>) {
          const name = (f.filename || f.fileName || '').toString().toLowerCase();
          const conf = (f.confNum ?? f.conferenceId ?? 0);
          const key = `${conf}:${name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          existing.push(f);
          added++;
        }
        if (added > 0) {
          console.log(`[launchAmigaDoor] Merged ${added} new flagged file(s) from door (skipped ${(exitState as any).bbsSession.flaggedFiles.length - added} dupes)`);
        }
      }

      // Execute requested commands immediately in priority order: CHAIN -> RETURN -> PRV -> ACP
      try {
        // CRITICAL: Use processCommand directly, NOT handleCommand!
        // handleCommand is for character-by-character input with line buffering.
        // processCommand executes a full command string immediately.
        // Door RETURNCOMMAND is a system-initiated call (like express.e processSysCommand),
        // so allowSyscmd=true — express.e:28249.
        const { processCommand, runSysCommand, processBBSCommand } = require('./command.handler');
        const invokingCommand = (doorInfo.command || '').toUpperCase();
        const runCommand = async (cmd?: string, isReturn: boolean = false) => {
          if (cmd && cmd.trim().length > 0) {
            const trimmed = cmd.trim();
            const parts = trimmed.toUpperCase().split(/\s+/);
            const command = parts[0];
            const params = parts.slice(1).join(' ');
            // Recursion guard: when a door's RETURNCOMMAND matches the command
            // that launched it (5D-LogOff bound to G sends RETURNCOMMAND="G"
            // expecting built-in logoff to run after), BBSCmd lookup would
            // re-launch the same door → infinite loop. Skip BBSCmd, route
            // SysCmd → built-in only.
            if (isReturn && command === invokingCommand && invokingCommand.length > 0) {
              console.log(`[door.handler] RETURNCOMMAND "${command}" matches invoking command — bypassing BBSCmd to avoid door self-recursion`);
              const sysResult = await runSysCommand(socket, session, command, params);
              if (sysResult === 'SUCCESS' || sysResult === 'NOT_ALLOWED') return;
              await processBBSCommand(socket, session, command, params);
              return;
            }
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
            await runCommand(cmd, true);
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

    // Return to menu — UNLESS:
    //  (a) RETURNCOMMAND parked the session in a transfer state
    //      (FILES_UPLOAD / FILES_DOWNLOAD / UPLOAD_RESUME_*). Overwriting
    //      those with DISPLAY_MENU triggered the menu prompt to render
    //      mid-ZMODEM-transfer, corrupting the wire and aborting lrzsz.
    //  (b) RETURNCOMMAND chained directly into another door — the
    //      runCommand(cmd) above set inDoorManager=true again as the
    //      next door took over. Falling through to DISPLAY_MENU here
    //      would render "AmiExpress Web BBS [N:conf] Menu (M mins. left):"
    //      between two chained doors (e.g. login-flow doors like
    //      dRE!WAll declining → next door in the chain). express.e's
    //      main loop doesn't render the menu prompt between auto-run
    //      commands — only when the loop genuinely returns to idle.
    const nextDoorActive =
      !!(session as any).inDoorManager ||
      session.subState === LoggedOnSubState.DOOR_RUNNING;
    if (
      !nextDoorActive &&
      session.subState !== LoggedOnSubState.FILES_UPLOAD &&
      session.subState !== LoggedOnSubState.FILES_DOWNLOAD &&
      session.subState !== LoggedOnSubState.UPLOAD_RESUME_PROMPT &&
      session.subState !== LoggedOnSubState.UPLOAD_RESUME_DELETE &&
      session.subState !== LoggedOnSubState.UPLOAD_RENAME_PROMPT &&
      session.subState !== LoggedOnSubState.DOWNLOAD_FILENAME_INPUT &&
      session.subState !== LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT
    ) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.menuPause = false;
    }

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
  // Only mark as Amiga door if it's actually an Amiga binary type (XIM, AIM, SIM, TIM, IIM, FIM)
  // TypeScript doors (TS) and others should NOT be marked as Amiga doors
  const amigaDoorsList = availableAmigaDoors.map((door: any) => ({
    id: door.command,
    name: door.name || door.command,
    description: `${door.location} (${door.type})`,
    accessLevel: door.access || 0,
    enabled: true,
    conferenceId: null,
    isAmigaDoor: isAmiga68kDoorType(door.type),
    command: door.command,
    doorInfo: door,  // Keep original door info for execution
    // Resolve MIN_COLUMNS onto the entry itself, the same way initializeDoors
    // does for BBSCMD doors, so the [40] marker never reads a source the
    // launch gate cannot see.
    minColumns: declaredMinColumns(door as any) ?? undefined,
    c64Adapt: resolveDoorAdaptColumns(door as any) ?? undefined,
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

  // Fold the manifest's `runtime` onto each entry, so the [WEB] marker reads
  // ONE resolved value on the SAME object the gate will judge - the lesson the
  // [40]/[C64] markers already carry in this file (initializeDoors resolves
  // MIN_COLUMNS and C64_ADAPT once, for exactly this reason).
  //
  // Done ONLY for a caller with no browser, and that is the whole reason it is
  // cheap and safe: a web caller reads no manifests here, so the web door list
  // is byte-identical and not one extra file is opened for it. CLIENT_ONLY has
  // already been resolved at registration and needs no disk read at all; the
  // manifest is what registration cannot see.
  if (!transportCapabilities(session).browser) {
    const entries = allDoors as unknown as MinColumnsDoorShape[];
    await Promise.all(entries.map(async (entry) => {
      if (doorNeedsBrowser(entry, null)) { entry.needsBrowser = true; return; }
      const manifest = await loadDoorManifestForExecution(entry as unknown as Door);
      if (doorNeedsBrowser(entry, manifest)) entry.needsBrowser = true;
    }));
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

  // Asked ONCE per paint, not once per row: the [WEB] marker is a property of
  // the CALLER, and a per-row lookup is how a redraw could disagree with the
  // initial draw.
  const browserAbsent = !transportCapabilities(session).browser;

  // C64/40-col Task 5d: the chrome is drawn at the CALLER'S width, not a
  // hard-coded 80 - a 40-column masthead padded to 80 wraps into a second
  // inverse-video row and pushes the whole list down the screen.
  const narrow = isNarrow(session);
  const chromeWidth = narrow ? NARROW_WIDTH : 80;

  // Only clear screen on initial draw
  if (isInitialDraw) {
    emitText(socket, '\x1b[2J\x1b[H');
    emitText(socket, '\x1b[1;1H\x1b[0;37;44m' + padString(' DOOR GAMES & UTILITIES ', chromeWidth) + '\x1b[0m');
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
      emitText(socket, formatDoorLine(prevDoor, false, narrow, browserAbsent));
    }

    // Redraw new line (select)
    if (newLine >= 3 && newLine < 3 + pageSize) {
      const newDoor = availableDoors[selectedIndex];
      emitText(socket, `\x1b[${newLine};1H`);
      emitText(socket, formatDoorLine(newDoor, true, narrow, browserAbsent));
    }

    session.tempData.previousSelectedIndex = selectedIndex;
    return;
  }

  // Full redraw (initial draw OR scroll changed) - show all doors
  emitText(socket, '\x1b[3;1H');
  visibleDoors.forEach((door: any, index: number) => {
    const globalIndex = scrollOffset + index;
    const isSelected = globalIndex === selectedIndex;
    emitText(socket, formatDoorLine(door, isSelected, narrow, browserAbsent) + '\r\n');
  });

  // Clear any remaining lines from previous page
  for (let i = visibleDoors.length; i < pageSize; i++) {
    emitText(socket, '\x1b[2K\r\n');
  }

  // Footer with instructions
  emitText(socket, '\r\n');
  emitText(socket, '\x1b[0;37m' + '-'.repeat(chromeWidth) + '\x1b[0m\r\n');
  emitText(socket, narrow
    ? '\x1b[33mUp/Dn:\x1b[0m Move \x1b[33mEnter:\x1b[0m Run \x1b[33mQ:\x1b[0m Quit\r\n'
    : '\x1b[33mArrows:\x1b[0m Navigate  \x1b[33mEnter:\x1b[0m Launch Door  \x1b[33mQ:\x1b[0m Quit\r\n');

  session.tempData.previousSelectedIndex = selectedIndex;
  session.tempData.previousScrollOffset = scrollOffset;
}

/**
 * Format a single door line for display
 */
/** Name column of a narrow door row - see the arithmetic in formatDoorLine. */
const NARROW_DOOR_NAME_COLUMNS = 24;

export function formatDoorLine(
  door: any,
  isSelected: boolean,
  narrow: boolean = false,
  /** The caller has no browser (telnet/SSH). Defaults false so every existing
   *  caller - and every identity pin built on this function - renders exactly
   *  the bytes it did before. */
  browserAbsent: boolean = false,
): string {
  // Get door type - handle both uppercase and lowercase variants
  const doorType = (door as any).doorType || door.type || 'AMI';
  const type = doorType === 'TS' || doorType === 'typescript' ? 'TS' :
              doorType === 'PYTHON' || doorType === 'python' || doorType === 'PY' ? 'PY' :
              doorType === 'AREXX' || doorType === 'arexx' || doorType === 'RX' ? 'RX' :
              doorType === 'XIM' || doorType === 'xim' ? 'XIM' :
              doorType === 'AMI' || doorType === 'amiga' || doorType === 'ami' ? 'AMI' :
              doorType === 'ARC' || doorType === 'archive' ? 'ARC' :
              doorType === 'WEB' || doorType === 'web' ? 'WEB' : 'AMI';

  // Format command (pad to 10 chars; 8 on a C64).
  //
  // CLIP, then pad. door.handler's local padString (:1540) does truncate,
  // unlike utils/string-util.ts's - which is exactly why the narrow row
  // must not depend on which one is in scope. narrowClip states the intent
  // and survives that function being swapped.
  const command = String(door.command || door.id || '');
  const commandDisplay = narrow ? narrowClip(command, 8).padEnd(8) : padString(command, 10);

  // Format name (pad to 30 chars). 40-ok doors carry an ASCII [40] token
  // inside the same column budget - the marker participates in truncation
  // and never widens the row (C64/40-col Task 1).
  // Two different promises, one token each, never both: MIN_COLUMNS=40 says
  // "already fits 40" ([40]); C64_ADAPT says "reaches 40 through the adapter"
  // ([C64]). Both are read from the SAME resolved Door object the gate will
  // judge, so a marker can never promise what the gate then refuses.
  const fortyOk = resolveDoorMinColumns(door) <= 40;
  // doorShowsC64Mark, not "a claim parses": the marker has to promise exactly
  // what doorOpensForC64() will honour at the gate, and it shares that
  // predicate's door-side clauses (adaptable TYPE, a claim that parses and
  // reaches forty). A TS door tagged C64_ADAPT=40, or any door tagged
  // C64_ADAPT=64, used to be marked here and then refused at :1716.
  // [WEB] outranks both. A door the caller cannot open AT ALL is the more
  // useful thing to say than how wide it is, and the marker promises exactly
  // what the launch gate will do: doorNeedsBrowser() is the same predicate
  // executeDoor asks, reading the same resolved `needsBrowser` on the same
  // object (displayDoorMenu folds the manifest runtime onto it before the list
  // is drawn), so a row can never be marked openable and then refused.
  const needsBrowser = browserAbsent && doorNeedsBrowser(door, null);
  const mark = needsBrowser
    ? DOOR_NEEDS_BROWSER_MARK
    : (fortyOk ? ' [40]' : (doorShowsC64Mark(door) ? ' [C64]' : ''));
  // Narrow row arithmetic, worst case (the widest type token is '[XIM]'):
  //   ' ' + '[XIM]'(5) + ' ' + command(8) + ' ' + name(24) = 40 columns,
  // which a CRLF-terminated row may use in full (see table-format.util.ts
  // for the pendingWrap latch). '[TS]' is 4, so those rows come to 39.
  // The size column comes off entirely.
  //
  // The [40] marker is what tells a C64 caller which doors will actually
  // open, so within the name column the NAME gives way to it, never the
  // other way round.
  const doorName = String(door.name || '');
  const markCols = NARROW_DOOR_NAME_COLUMNS - mark.length;
  const name = narrow
    ? (mark
        ? `${narrowClip(doorName, markCols).padEnd(markCols)}${mark}`
        : narrowClip(doorName, NARROW_DOOR_NAME_COLUMNS).padEnd(NARROW_DOOR_NAME_COLUMNS))
    : padString(mark ? `${door.name}${mark}` : door.name, 30);

  // Format size (right-aligned, 8 chars wide for proper column alignment)
  const sizeStr = formatDoorSize(door.size || 0);
  const size = sizeStr.padStart(8);

  // Clear the entire line first (80 spaces)
  let line = '\x1b[2K';

  if (narrow) {
    // No size column: a C64 row has no place for it.
    return isSelected
      ? line + `\x1b[0;37;44m \x1b[33m[${type}]\x1b[0;37;44m ${commandDisplay} ${name}\x1b[0m`
      : line + ` \x1b[33m[${type}]\x1b[0m ${commandDisplay} ${name}`;
  }

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
 * Decide what the post-door exit path may do with the menu.
 *
 * - 'chat': the sysop accepted a page DURING the post-door page-wait — the
 *   chat UI (chat.handler.ts's enterChatMode) already owns the screen and
 *   input routing (chat-mode-input.util.ts checks session.inChat first).
 *   Checked FIRST, ahead of every other guard: once chat mode has taken
 *   over the terminal, no stale segments/pause/subState flag should ever
 *   cause a menu repaint (Important 4, DD final-review wave, 2026-08-16 —
 *   previously the fall-through 'menu' branch reset menuPause and called
 *   displayMainMenu, painting the main menu over the just-started chat
 *   session while input kept routing to chat).
 * - 'segments': door ran inline via a ~CC_ screen sentinel and more screen
 *   segments follow (express.e:5455-5461) — never render the menu, the
 *   display flow continues (conference join, bulletins, ...).
 * - 'pause': a paginated-screen pause is active — display flow resumes it.
 * - 'interactive': a RETURNCOMMAND chain parked the session in an
 *   interactive prompt state that owns the next input.
 * - 'menu': normal completion — return to menu.
 */
export type PostDoorAction = 'chat' | 'segments' | 'pause' | 'interactive' | 'menu';

export function postDoorMenuAction(session: BBSSession): PostDoorAction {
  if (session.inChat) {
    return 'chat';
  }
  // Presence check, NOT segments.length: a ~CC_ door in the LAST segment
  // runs after that segment was already shift()ed (length === 0), but
  // processNextScreenSegment only clears session.screenSegments once the
  // whole parse returns — segment processing is still active either way.
  if (session.screenSegments) {
    return 'segments';
  }
  if (session.paginatedScreen) {
    return 'pause';
  }
  // Use the direct import, not the setConstants-injected alias — this
  // helper must work before dependency injection runs (and in tests).
  const sub = session.subState;
  if (
    sub === LoggedOnSubStateImport.FILES_UPLOAD ||
    sub === LoggedOnSubStateImport.FILES_DOWNLOAD ||
    sub === LoggedOnSubStateImport.UPLOAD_RESUME_PROMPT ||
    sub === LoggedOnSubStateImport.UPLOAD_RESUME_DELETE ||
    sub === LoggedOnSubStateImport.UPLOAD_RENAME_PROMPT ||
    sub === LoggedOnSubStateImport.DOWNLOAD_FILENAME_INPUT ||
    sub === LoggedOnSubStateImport.DOWNLOAD_CONFIRM_INPUT
  ) {
    return 'interactive';
  }
  return 'menu';
}

/**
 * Apply the decision from postDoorMenuAction() — the ONLY place that
 * decides whether to repaint the main menu after a door exits.
 *
 * Extracted out of executeAmigaDoor's inline post-exit block (Important 4,
 * DD final-review wave, 2026-08-16) specifically so the 'chat' branch is
 * behaviorally testable: executeAmigaDoor itself can't run under jest (it
 * drags in the full BBS subsystem + 68K emulator — see
 * door-page-wait-sequencing.test.ts's header comment on why that test is
 * source-level instead), but this function can be called directly with a
 * mock socket and a stub displayMainMenuFn to assert no menu emit / no
 * DISPLAY_MENU clobber happens when session.inChat is true — the gap a
 * source-grep test would have missed (and did, until this fix).
 *
 * displayMainMenuFn defaults to the real displayMainMenu import; tests
 * override it with a spy instead of needing to boot the real menu system.
 */
export async function applyPostDoorMenuAction(
  socket: any,
  session: BBSSession,
  displayMainMenuFn: (socket: any, session: BBSSession) => Promise<void> | void = displayMainMenu
): Promise<void> {
  const postAction = postDoorMenuAction(session);
  if (postAction === 'chat') {
    // Important 4: the sysop accepted the page DURING the post-door
    // page-wait — session.inChat is now true and chat.handler.ts's
    // enterChatMode already owns the screen (and chat-mode-input.util.ts
    // already routes input there ahead of the normal command path).
    // Repainting the menu here would overwrite the chat UI the caller is
    // now looking at. Leave session.subState/menuPause exactly as
    // completePaging() set them — chat's own exitChat() is what restores
    // the menu once the chat session actually ends.
    console.log('[executeAmigaDoor] inChat active post-page-wait - skipping displayMainMenu');
  } else if (postAction === 'segments') {
    // ~CC_ inline door ran inside screen-segment processing
    // (express.e:5455-5461) — more segments follow (e.g. the conference
    // join flow's "Joining Conference:" line). executeDoor restores the
    // display-flow subState; rendering the menu here emits a premature
    // menu prompt mid-screen (double-prompt bug, 2026-08-14).
    console.log('[executeAmigaDoor] door completed during segment processing - skipping displayMainMenu');
  } else if (postAction === 'pause') {
    console.log('[executeAmigaDoor] Pause is active, skipping displayMainMenu (will resume via display flow)');
    fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] executeAmigaDoor: SKIPPING displayMainMenu (pause active)\n`);
  } else if (postAction === 'interactive') {
    // RETURNCOMMAND parked us in an interactive prompt state — do NOT
    // overwrite subState or render the menu. The prompt's own state
    // machine transitions back to DISPLAY_MENU when the user resolves it.
    console.log(`[executeAmigaDoor] interactive prompt active (${session.subState}), skipping displayMainMenu`);
  } else {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;
    if (session.state === BBSState.LOGGEDON && session.user) {
      await displayMainMenuFn(socket, session);
    }
  }
}

/**
 * Execute door game/utility
 */
export async function executeDoor(socket: any, session: BBSSession, door: Door) {
console.log('Executing door:', door.name);

  // Defensive: an adapter can NEVER survive one door into the next, or into
  // the menu. executeAmigaDoor's finally and AmigaDoorSession's teardown both
  // uninstall, but a crash between them would leave the socket's emit patched
  // and every later byte would go through a reconstructor with no owner. This
  // is a no-op on every ordinary launch (nothing is installed).
  uninstallC64DoorAdapter(socket);

  // MIN_COLUMNS gate (C64/40-col Task 1). Default-closed: every door type
  // (68K, AREXX, TS, MCI, ...) gates at 80 columns unless its registration
  // carries an explicit MIN_COLUMNS the session satisfies. This one check,
  // ahead of currentDoorName, token minting and drop files, is the blanket
  // 68K + full-screen AREXX ruling (revised Phase 4, 2026-09-02) in a single
  // provable place. sessionColumns() only ever narrows a petsciiMode
  // session, so an ordinary web caller on a small screen keeps the door
  // access it has always had.
  //
  // It runs BEFORE session.currentDoorName is set: a refused launch is not
  // this door's event, and attributing it would show the caller as being in
  // a door they were never let into.
  //
  // ONE extra clause, not a second gate: the C64 door adapter
  // (server/c64-door-adapter.ts) reconstructs a 68K door's 80-column frames
  // and reduces them to the caller's 40, so a door that declared C64_ADAPT is
  // genuinely usable at 40 even though its own output is not. doorOpensForC64
  // is the SAME predicate executeAmigaDoor asks before installing the adapter
  // - a door let in here is therefore always a door that then runs adapted.
  //
  // FALL-THROUGH (open backlog 11.1, sysop-decided 2026-09-06). A refusal
  // used to END the command: a 40-column caller who typed FR got the notice
  // and the menu, because AquaScan is registered over F/FR/N/Z and BBSCMD is
  // asked before the internal switch - while the board's own 40-column file
  // listing sat one tier below, unreachable for three days.
  //
  // What is refused has not changed, and neither has who decides. This clause
  // stays the ONE predicate for "too narrow" and the ONE emitter of the
  // notice; it does not run internal commands, because executeDoor is also
  // reached from the DOORS menu, a ~CC_ screen command and login-post's
  // chat-only launch, where firing an unrelated internal handler would be
  // wrong. Instead the DISPATCHER arms `session.widthGateFallThrough` before
  // the launch it initiated and this clause REPORTS to it: no notice, no menu
  // reset, the outcome is the dispatcher's. Nothing armed it -> the refusal
  // below is byte-for-byte what it always was.
  //
  // Read-and-cleared for EVERY launch, refused or not: an arm covers the one
  // launch the dispatcher started, and must never be inherited by a door that
  // goes on to launch another door.
  const widthFallThroughArmed = session.widthGateFallThrough === 'ARMED';
  if (widthFallThroughArmed) session.widthGateFallThrough = undefined;

  if (
    sessionColumns(session) < resolveDoorMinColumns(door as any) &&
    !doorOpensForC64(door as any, session)
  ) {
    if (widthFallThroughArmed) {
      session.widthGateFallThrough = 'REFUSED';
      return;
    }
    // emitPrompt is emitText(..., immediate): the notice must reach the
    // caller before the menu repaints over it.
    emitPrompt(socket, DOOR_NEEDS_80_NOTICE);
    // Same return shape launchAmigaDoor() uses when the executable is
    // missing: straight back to the menu, no pause.
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Attribute this door's events to its REGISTERED command, not to whatever
  // the user typed. session.commandText carries aliases and arguments, and
  // per-door webhook filters match the door name exactly.
  session.currentDoorName = door.command || door.id;

  const nodeId = session.nodeId || 0;
  let doorSession: DoorSession | null = null;
  const originalSubState = session.subState;

  const bbsRoot = config.get('dataDir');
  let managementToken: string | null = null;

  try {
    // Minted inside the try (not before it): launchTokenForDoor fails
    // closed on its own, but a token is bookkeeping, not a launch
    // precondition — this call must never be the reason a sysop's door
    // doesn't start, and moving it here means the catch block's session
    // cleanup below still runs even if something upstream of this changes
    // that assumption later.
    managementToken = launchTokenForDoor(door.command || door.id, bbsRoot, {
      nodeId: session.nodeId || 0,
      userId: session.user?.id ?? 0,
      secLevel: session.user?.secLevel ?? 0,
    });

    // DoorRepo reads the board's door list from a FILE, not over HTTP. A 68K
    // door cannot synchronously call the BBS it runs inside: it blocks in
    // WaitSelect, which starves the event loop that would produce the reply,
    // so the response only lands after the socket times out - a 30-second
    // freeze on the L key, measured on the live board. Written here, beside
    // the token, at the same moment and in the same encoding.
    if (managementToken) {
      await writeDoorListSnapshot(bbsRoot);
    }

    // Check if this is a client door (needs to detect runtime from manifest)
    const doorManifest = await loadDoorManifestForExecution(door);

    // What this caller's transport can actually do. ONE answer, read twice
    // below - the gate and the hybrid clause must never disagree about whether
    // a browser is present.
    const callerCapabilities = transportCapabilities(session);

    // TRANSPORT GATE, the browser cousin of the MIN_COLUMNS gate above, and
    // deliberately the same shape: one predicate, one uppercase-ASCII notice,
    // straight back to the menu - never a frozen screen.
    //
    // A client door's frames travel as `door:message:<id>`
    // (doors/client-door-bridge.ts:426) and its bundle is fetched by the
    // browser after `door:load-client` (executeClientDoor below) - on a byte
    // transport the connection emitter renders neither, so the caller would sit
    // in front of a frozen screen with a no-op doorInputHandler and a 30 s PING
    // loop (client-door-bridge.ts:433-447) that nothing can stop. Refuse
    // instead, and say why.
    //
    // It sits AFTER the manifest load because `runtime` is the primary source
    // and is not known before it, and BEFORE executeClientDoor because a bridge
    // session started here would have to be torn down again.
    if (doorNeedsBrowser(door, doorManifest) && !callerCapabilities.browser) {
      // emitPrompt is emitText(..., immediate), exactly as the MIN_COLUMNS
      // notice above: the refusal must reach the caller before the menu
      // repaints over it.
      emitPrompt(socket, DOOR_NEEDS_BROWSER_NOTICE);
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Client-only doors: Just load the client bundle and return
    if (doorManifest && doorManifest.runtime === 'client') {
      await executeClientDoor(socket, session, door, doorManifest);
      return;
    }

    // Hybrid doors: Load client bundle but ALSO continue to execute server part.
    //
    // `callerCapabilities.browser` is what makes the byte-transport caller fall
    // THROUGH to the type switch below instead of returning: a hybrid without
    // CLIENT_ONLY has a real server half (fourteen of the board's fifteen paint
    // a usable blessed UI with no browser at all), and the `if
    // (!hybridSessionId) return;` inside this block would otherwise abandon the
    // launch the moment executeClientDoor was skipped. The gate above has
    // already refused the hybrids that cannot stand alone.
    let hybridSessionId: string | null = null;
    if (doorManifest && doorManifest.runtime === 'hybrid' && callerCapabilities.browser) {
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
      // So the feed can say a game was PLAYED and not say it of DOORMAN.
      category: doorCategoryAt(door.path),
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
        // AmiExpress historically reuses the AIM/SIM type marker for
        // AREXX-controlled doors when the LOCATION points at a .rexx
        // (or .rx) script — see reference-boardBBS Commands/SysCmd/ANSI.info
        // for an in-the-wild example. Route those to the AREXX path
        // instead of LoadSeg-as-68K, which would fail on a text file.
        if (/\.(rexx|rx)$/i.test(door.path || '')) {
          await executeARexxDoor(socket, session, door, doorSession);
        } else {
          await executeAmigaDoor(socket, session, door, doorSession);
        }
        break;
      case 'FIM': // FAME Interface Module (FAME BBS door compat) - FAMEDoorPort/FIMProtocol
        await executeAmigaDoor(socket, session, door, doorSession);
        break;
      case 'DD': // DayDream Interface Module (DayDream BBS door compat) - dreamdoor.library
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
      category: doorCategoryAt(door.path),
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
    // Presence check, not segments.length — a ~CC_ door in the LAST segment
    // runs with length === 0 while screenSegments is still set.
    if (session.screenSegments) {
console.log(`[executeDoor] Door ${door.name} completed during segment processing - continuing segments`);
      // Restore subState so display flow can continue (was clobbered to DOOR_RUNNING)
      session.subState = originalSubState;
    } else if (
      session.subState === LoggedOnSubState.FILES_UPLOAD ||
      session.subState === LoggedOnSubState.FILES_DOWNLOAD ||
      session.subState === LoggedOnSubState.UPLOAD_RESUME_PROMPT ||
      session.subState === LoggedOnSubState.UPLOAD_RESUME_DELETE ||
      session.subState === LoggedOnSubState.UPLOAD_RENAME_PROMPT ||
      session.subState === LoggedOnSubState.DOWNLOAD_FILENAME_INPUT ||
      session.subState === LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT
    ) {
      // Door's RETURNCOMMAND chain parked us in an interactive prompt state.
      // Do NOT overwrite — the prompt's own state machine owns the next input.
      console.log(`[executeDoor] interactive prompt active (${session.subState}), skipping menu transition`);
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
  } finally {
    // Release the management token on every exit path — success, the
    // interactive-prompt returns above, or the crash handled just above.
    // A door that throws must not leave a live token behind.
    releaseLaunchTokenForDoor(managementToken);
    // The snapshot is as session-scoped as the token: a listing left behind
    // would be read by the next launch before it is rewritten, and it
    // describes a board that may have changed since.
    if (managementToken) {
      clearDoorListSnapshot(bbsRoot);

      // Anything the door installed, recorded now that it has exited. It
      // cannot tell us while it runs - a 68K door blocking on our own reply
      // starves the event loop that would produce it, which is why
      // report_install_to_bbs never worked and door_installs has no row for
      // anything DoorRepo installed. It writes a file instead; this reads it.
      try {
        applyDoorInstallReports(bbsRoot);
      } catch (err) {
        console.log(`[door-install] reports not applied: ${(err as Error).message}`);
      }
    }
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

  // Hide cursor immediately — before any door code runs or imports complete.
  socket.emit('ansi-output', '\x1b[?25l');

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

    // The door's root directory (where package.json lives) - known whenever
    // door.path is a directory. The manifest probe after import MUST use
    // this, not dirname(entry): in production the entry is dist/server.js
    // and dirname points inside dist/, which broke hybrid detection on live.
    let doorRootDir: string | null = null;

    // For hybrid doors, use the server entry point from package.json
    // Check if path is a directory and if it has a package.json with server entry
    // Use amigafs for case-insensitive path resolution (AmigaOS compatibility)
    if (amigafs.existsSync(path.join(projectRoot, doorPath)) &&
        amigafs.statSync(path.join(projectRoot, doorPath)).isDirectory()) {
      
      const doorDir = path.join(projectRoot, doorPath);
      doorRootDir = doorDir;
      
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
      const { doorManifestPath } = require('../doors/door-manifest-path');
      const packageJsonPath = doorManifestPath(doorRootDir, doorPath);
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
    // Restore cursor visibility now that the door has exited
    socket.emit('ansi-output', '\x1b[?25h');

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
    // Presence check, not segments.length — a ~CC_ door in the LAST segment
    // runs with length === 0 while screenSegments is still set.
    if (session.screenSegments) {
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
  const __doorT0 = Date.now();
  (session as any).__doorT0 = __doorT0;
console.log(`[TIMING] executeAmigaDoor ENTRY door=${door.name} t=0ms`);
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
      let diskUserStats = (session as any).diskUserStats ?? null;

      // Always prefer the DB-stored slot number — session.userSlotNumber may be stale
      // from a previous door run (e.g. AquaScan_020 set it to 8 via findUserSlotByName
      // which returned the last duplicate entry instead of the correct slot).
      const dbSlot = Number((session.user as any)?.slotnumber ?? (session.user as any)?.slotNumber ?? 0);
      let userSlotNumber = dbSlot > 0 ? dbSlot : (Number.isFinite((session as any).userSlotNumber) ? (session as any).userSlotNumber : -1);
      let slotIndex = userSlotNumber > 0 ? userSlotNumber - 1 : -1;

      // Same SQLite-first preference as launchAmigaDoor (see comment
      // there at ~line 624). The binary readConfAccessFromDisk pads
      // positions 11-25 with X, which silently misaligns when
      // SQLite slot ≠ binary slot. Stats have the same slot-mismatch
      // risk but doors write back to binary during their session, so
      // the SQLite-first read is an initial-state correctness fix.
      const sqlConfAccess: string =
        (session.user?.confAccess as any) ||
        (session.user?.conferenceAccess as any) ||
        '';
      const sqlUserStats = session.user ? {
        messagesPosted: (session.user as any).messagesPosted ?? 0,
        uploads: (session.user as any).uploads ?? 0,
        downloads: (session.user as any).downloads ?? 0,
        timesCalled: (session.user as any).timesCalled ?? (session.user as any).calls ?? 0,
        timeUsed: (session.user as any).timeUsed ?? 0,
        timeLimit: (session.user as any).timeLimit ?? 0,
        timeTotal: (session.user as any).timeTotal ?? 0,
        bytesDownload: (session.user as any).bytesDownload ?? 0,
        bytesUpload: (session.user as any).bytesUpload ?? 0,
        timeLastOn: (session.user as any).lastLogin
          ? Math.floor(new Date((session.user as any).lastLogin).getTime() / 1000)
          : 0,
      } : null;

      if (slotIndex >= 0) {
        if (!confAccess) {
          confAccess = (sqlConfAccess && sqlConfAccess.length > 0)
            ? sqlConfAccess
            : userDatabaseManager.readConfAccessFromDisk(slotIndex);
        }
        if (!diskUserStats) {
          diskUserStats = sqlUserStats || userDatabaseManager.readUserStatsFromDisk(slotIndex);
        }
      }

      if (slotIndex < 0 || !confAccess || !diskUserStats) {
        // Further fallback: name search (less reliable — may return last duplicate).
        const dbSlot = Number((session.user as any)?.slotnumber ?? (session.user as any)?.slotNumber ?? 0);
        const foundIndex = dbSlot > 0 ? dbSlot - 1 : userDatabaseManager.findUserSlotByName(session.user.username);
        if (foundIndex >= 0) {
          if (!confAccess) {
            confAccess = (sqlConfAccess && sqlConfAccess.length > 0)
              ? sqlConfAccess
              : userDatabaseManager.readConfAccessFromDisk(foundIndex);
          }
          if (!diskUserStats) {
            diskUserStats = sqlUserStats || userDatabaseManager.readUserStatsFromDisk(foundIndex);
          }
          slotIndex = foundIndex;
          userSlotNumber = foundIndex + 1;
        } else {
          if (!confAccess) confAccess = sqlConfAccess;
          if (!diskUserStats) diskUserStats = sqlUserStats;
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
    console.log(`[TIMING] before new AmigaDoorSession: ${Date.now() - __doorT0}ms`);
    const amigaSession = new AmigaDoorSession(socket, doorConfig);
    console.log(`[TIMING] after new AmigaDoorSession: ${Date.now() - __doorT0}ms`);

    // C64 door adapter (Phase 3): a PETSCII caller entering a door that has
    // been adapted and verified for 40 columns gets the door's 80-column
    // frames reduced on the way out. Installed BEFORE the fresh-line emitText
    // so the adapter's first render is the door's entry full paint, and gated
    // on BOTH halves - a 40-column session AND a door that declared
    // C64_ADAPT. Everything else (every ANSI caller, every unadapted door) is
    // byte-for-byte what it was: installC64DoorAdapter returns null without
    // touching socket.emit.
    if (doorOpensForC64(door as any, session)) {
      installC64DoorAdapter(socket, session as any);
    }

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
console.log(`[executeAmigaDoor] doorInputHandler received: "${data}" (len=${data.length}) hasXIM=${!!shared.ximProtocol} hasFIM=${!!shared.fimProtocol}`);
        logDoorDebug(
          `KEY door=${door.command || door.id || 'UNK'} data=${JSON.stringify(
            data
          )}`
        );
        routeAmigaDoorInput(shared, data);
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
                         doorType === 'MCI' ? DoorType.MCI :
                         doorType === 'FIM' ? DoorType.FIM :
                         doorType === 'DD' ? DoorType.DD : DoorType.XIM;
    // Use doorPath for logging (like express.e: "DOORS:FILEID/FILEID")
    logDoorStart(bbsRoot, nodeNumber, doorTypeCode, session.user?.username || 'Unknown', doorPath);

    // Start the door execution
    console.log(`[TIMING] before amigaSession.start(): ${Date.now() - __doorT0}ms`);
    try {
      await amigaSession.start();
    } finally {
      // emitText buffers (ansi-buffer.util.ts, 16 ms timer); a buffered chunk
      // flushing AFTER the restore would reach the wire as raw 80-column ANSI
      // in the middle of a 40-column screen. flushOutput() IS
      // getAnsiBuffer(socket).flushImmediate() (output.util.ts:80,
      // ansi-buffer.util.ts:111 - flushImmediate is an alias for flush), so
      // this is the plan's call through the module the handler already
      // imports. It must run BEFORE the uninstall, in that order.
      flushOutput(socket);
      uninstallC64DoorAdapter(socket);
    }
    console.log(`[TIMING] after amigaSession.start() (door exited): ${Date.now() - __doorT0}ms`);

    // Flush any buffered door stdout before processing RETURNCOMMAND output.
    // emitText() batches writes in a 16ms window; RETURNCOMMAND handlers call
    // socket.emit() directly (immediate). Without this flush the door's trailing
    // \r\n arrives at the client AFTER the filespec/menu prompt, moving the
    // cursor one row below where it should land.
    flushOutput(socket);

    // Task 18 review fix (round 2): consume session.sysopPagePending
    // IMMEDIATELY after the door exits/flushes — before ANY of the
    // logDoorExit/CHAIN/RETURNCOMMAND/exitState-merge work below that can
    // throw. Previously the flag was only consumed right before running
    // the wait, much later; an exception anywhere in that risky region hit
    // the outer catch with sysopPagePending still true, and the STALE flag
    // then wrongly fired the page-wait on the NEXT, unrelated door's exit.
    // Consuming here means the flag is already false regardless of what
    // happens next — only the ACTUAL wait is deferred (to after the
    // CHAIN/RETURNCOMMAND block, matching "runs after door exit, before
    // returning to menu"), using the chat session captured below.
    let pendingSysopPageChatSession: ChatSession | null | undefined;
    try {
      pendingSysopPageChatSession = consumePendingSysopPage(session);
    } catch (err) {
console.warn('[executeAmigaDoor] consumePendingSysopPage failed:', err);
    }

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

      // Copy flagged files from door bbsSession back to main session.
      // Same dedupe-by-filename+confNum guard as launchAmigaDoor —
      // see comment there for why a naive push double-flags.
      if (Array.isArray((exitState as any).bbsSession?.flaggedFiles) && (exitState as any).bbsSession.flaggedFiles.length > 0) {
        if (!Array.isArray((session as any).flaggedFiles)) {
          (session as any).flaggedFiles = [];
        }
        const existing = (session as any).flaggedFiles as Array<{ filename?: string; fileName?: string; confNum?: number; conferenceId?: number }>;
        const seen = new Set(existing.map((f) => {
          const name = (f.filename || f.fileName || '').toString().toLowerCase();
          const conf = (f.confNum ?? f.conferenceId ?? 0);
          return `${conf}:${name}`;
        }));
        let added = 0;
        for (const f of (exitState as any).bbsSession.flaggedFiles as Array<any>) {
          const name = (f.filename || f.fileName || '').toString().toLowerCase();
          const conf = (f.confNum ?? f.conferenceId ?? 0);
          const key = `${conf}:${name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          existing.push(f);
          added++;
        }
        if (added > 0) {
          console.log(`[executeAmigaDoor] Merged ${added} new flagged file(s) from door (skipped ${(exitState as any).bbsSession.flaggedFiles.length - added} dupes)`);
        }
      }

      // Execute requested commands immediately in priority order: CHAIN -> RETURN -> PRV -> ACP
      try {
        // CRITICAL: Use processCommand directly, NOT handleCommand!
        // handleCommand is for character-by-character input with line buffering.
        // processCommand executes a full command string immediately.
        // Door RETURNCOMMAND is a system-initiated call (like express.e processSysCommand),
        // so allowSyscmd=true — express.e:28249.
        const { processCommand, runSysCommand, processBBSCommand } = require('./command.handler');
        const invokingCommand = (((session as any).doorCommand) || (door as any)?.command || '').toUpperCase();
        const runCommand = async (cmd?: string, isReturn: boolean = false) => {
          if (cmd && cmd.trim().length > 0) {
            const trimmed = cmd.trim();
            const parts = trimmed.toUpperCase().split(/\s+/);
            const command = parts[0];
            const params = parts.slice(1).join(' ');
            // Recursion guard — see launchAmigaDoor for full rationale.
            if (isReturn && command === invokingCommand && invokingCommand.length > 0) {
              console.log(`[door.handler] RETURNCOMMAND "${command}" matches invoking command — bypassing BBSCmd to avoid door self-recursion`);
              const sysResult = await runSysCommand(socket, session, command, params);
              if (sysResult === 'SUCCESS' || sysResult === 'NOT_ALLOWED') return;
              await processBBSCommand(socket, session, command, params);
              return;
            }
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
            await runCommand(cmd, true);
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

    // Task 18: interactive sysop page-wait. FAME/FIM doors (5D_Page via
    // CF_InternalCmd "C") page the sysop mid-door through notifySysopPage(),
    // which only sets session.sysopPagePending — no UI runs while the door
    // still owns the screen. NOW that the door has fully exited and its
    // output was flushed above (and the flag already consumed into
    // pendingSysopPageChatSession, see the flushOutput block), run the
    // classic page-wait UX (dots animation / sysop-answer / timeout) via
    // the SAME ported displayInternalPager()/completePaging(), reusing the
    // chat session notifySysopPage already created. This deliberately
    // calls runSysopPageWait, NOT startSysopPage — startSysopPage would
    // try executePagerDoor first, which launches the PowerPager door;
    // 5D_Page already rendered its own paging screen, so recursively
    // launching PowerPager here would fight it.
    if (pendingSysopPageChatSession) {
      const chatSession: ChatSession = pendingSysopPageChatSession;
      await new Promise<void>((resolve) => {
        try {
          runSysopPageWait(socket, session, chatSession, () => resolve());
        } catch (err) {
console.warn('[executeAmigaDoor] sysop page-wait flow failed:', err);
          resolve();
        }
      });
    }

    // Return to menu (only if user is logged in and no pause is active)
    // CRITICAL: If processCommand set up a pause (via advanceDisplayFlow -> doPause),
    // do NOT call displayMainMenu here - it would clear paginatedScreen and break the pause.
    // The display flow will handle showing the menu after the user dismisses the pause.
    const doorName = door?.name || door?.command || 'Unknown';
    fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] executeAmigaDoor EXIT: door="${doorName}", paginatedScreen=${!!session.paginatedScreen}, returnCommand=${(session as any).returnCommand || 'NONE'}\n`);
    await applyPostDoorMenuAction(socket, session);

  } catch (error) {
console.error(`[executeAmigaDoor] Error executing Amiga door:`, error);
    emitText(socket, `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door exits
    socket.emit('door-active', false);
    delete session.doorInputHandler;
    // Belt-and-braces (task 18 review fix, round 2): a crash BEFORE
    // flushOutput() (e.g. inside amigaSession.start() itself) means the
    // consume-first block never ran, so a "C" fired earlier in this same
    // crashed door run could still leave sysopPagePending stuck true.
    // Clear it here too so it can never survive into the next door's exit.
    session.sysopPagePending = false;
    delete session.sysopPageChatSessionId;
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
  // Enter door-input mode so the BBS's central socket handler routes
  // command/key-down/key-up keystrokes through session.doorInputHandler.
  // Without this, the AREXX script's GETCHAR / PROMPT / QUERY hangs
  // forever because user keystrokes never reach the input promise.
  // 68K, TypeScript, and now AREXX doors all share this contract.
  session.inDoorManager = true;
  session.subState = LoggedOnSubState.DOOR_RUNNING;

  // Resolve script path against the BBS root (not process.cwd, which
  // depends on where the server was started from — typically
  // web/backend, so cwd-relative joins land in the wrong tree).
  // Pattern matches executeAmigaDoor: bbsRoot from AmigaDoorManager,
  // then case-insensitive resolution like other Amiga path lookups.
  let doorPath: string;
  if (path.isAbsolute(door.path)) {
    doorPath = door.path;
  } else {
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const bbsRoot = getAmigaDoorManager().bbsRoot;
    const normalizedComponents = door.path
      .replace(/\\/g, '/')
      .split('/')
      .filter((c: string) => c.length > 0);
    const fullPath = path.join(bbsRoot, ...normalizedComponents);
    doorPath = resolveCaseInsensitivePath(fullPath) || fullPath;
  }

  if (!amigafs.existsSync(doorPath)) {
    emitText(socket, `\r\n\x1b[31mError: ARexx script not found: ${door.path}\x1b[0m\r\n`);
    emitText(socket, '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  try {
    // Import ARexx engine — exported from services/arexx.service.ts.
    // Older comment said "from arexx.ts"; the file moved to
    // services/arexx.service.ts and the bare `../arexx` path no
    // longer resolves under the current module layout.
    const { arexxEngine } = require('../services/arexx.service');

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

    // Prepare ARexx context with BBS environment and full API.
    // `socket`, `session`, and `user` are all referenced by
    // BBSFunctions (e.g. BBSWRITE emits via socket; GetUser pulls
    // from user/session). Without them the AREXX host commands
    // (TR/SS/GU) silently no-op — AVAIL.rexx ran clean but printed
    // nothing because socket+user weren't reachable.
    const arexxContext = {
      // Direct refs needed by BBSFunctions
      socket,
      session,
      user: session.user,
      // User information (legacy flat fields kept for back-compat
      // with scripts that read these directly off the context).
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

    // Execute ARexx script through the ARexx engine.
    // executeScript expects an AREXXScript object whose `.script`
    // field holds the REXX source — passing a bare file path makes
    // it run an empty script (`undefined.script || ''`) and emit
    // nothing. AVAIL.rexx exhibited this: BBS logged "Executing
    // AREXX script: undefined" then the door reported completed
    // without running any of the script's clauses. Load the file
    // contents from disk and synthesize the script struct here.
    let scriptText = '';
    try {
      // AmiExpress AREXX scripts ship with ISO-8859-1 / Amiga
      // character bytes (box-drawing, accented chars in ASCII art).
      // Reading as UTF-8 produces replacement-character `�` for any
      // byte > 0x7F. The downstream terminal pipeline emits the raw
      // bytes back to the BBS user, so passing through latin1 keeps
      // the ASCII art intact while still safely handling 7-bit ASCII
      // identically (latin1 is a superset).
      scriptText = fs.readFileSync(doorPath, 'latin1');
    } catch (err) {
      emitText(socket, `\r\n\x1b[31mError reading ARexx script: ${door.path}\x1b[0m\r\n`);
      doorSession.status = 'error';
      throw err;
    }
    const arexxScript: any = {
      id: door.id || `arexx-${Date.now()}`,
      name: door.name,
      script: scriptText,
      enabled: true,
      // Pass through whatever metadata the door manifest provided so
      // db.executeAREXXScript's audit log gets a useful entry.
      command: door.command,
      path: door.path,
    };
console.log(`[executeARexxDoor] Executing script: ${doorPath} (${scriptText.length} bytes)`);
    // Drop to a fresh line before the script's first emission. The
    // user's command line ends with `<cmd><enter>`; without an
    // explicit \r\n here, the script's first TR/SS lands directly
    // beside the typed command (e.g. "avail  SYSOP AVAILABLE..."
    // share a row). express.e doors get this for free because the
    // command echo path emits \r\n on dispatch — the AREXX path
    // never did.
    emitText(socket, '\r\n');
    await arexxEngine.executeScript(arexxScript, arexxContext);

    emitText(socket, `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);

  } catch (error: any) {
console.error(`[ARexx Door ${door.id}] Execution error:`, error);
    emitText(socket, `\r\n\x1b[31mError executing ARexx script: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  // Leave door-input mode so the BBS's command/key handlers go back to
  // their normal routing. Mirrors executeTypeScriptDoor's exit path.
  session.inDoorManager = false;
  delete session.doorInputHandler;
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

  // The installed-68K registry is the OTHER half of a door's registration:
  // initializeDoors() folds each record's MIN_COLUMNS / C64_ADAPT onto the
  // Door the gate and the marker read. Without this the cache still holds the
  // .info bytes from boot, so editing an installed door's tooltypes needed a
  // restart to take effect - which the tooltype documentation promises it
  // does not. A scan failure must not stop the reload: doors then simply
  // carry no declaration, the closed default.
  try {
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    await getAmigaDoorManager().refreshCache();
  } catch (err: any) {
console.warn(`[reloadDoors] installed-door cache refresh failed: ${err?.message ?? err}`);
  }

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

  // MIN_COLUMNS is resolved ONCE here, at registration, from BOTH registries.
  //
  // Why it cannot be left to the launch site: the door-list row is formatted
  // from the entry displayDoorMenu built (which carries the installed 68K
  // record as `doorInfo`), but Enter does NOT hand that entry to executeDoor -
  // it re-dispatches by command name through command.handler's
  // `getDoors().find(...)`, whose Door objects have no `doorInfo`. A door
  // marked MIN_COLUMNS=40 only in its installed record printed [40] and was
  // then refused. Folding the installed record in here gives the marker and
  // the gate one number on one object.
  //
  // A scan failure must never stop door registration: doors then simply carry
  // no declaration, which is the closed default - the safe direction.
  const installedByCommand = new Map<string, any>();
  try {
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const installed = await getAmigaDoorManager().scanInstalledDoors();
    for (const rec of installed || []) {
      if (rec?.command) installedByCommand.set(String(rec.command).toUpperCase(), rec);
    }
  } catch (err: any) {
console.warn(`[initializeDoors] installed-door scan unavailable for MIN_COLUMNS resolution: ${err?.message ?? err}`);
  }

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
      // Without this fallback, ~60 XIM/AIM/SIM/TIM/FIM doors all collapse into Misc
      // and look absent from category-based menus like doors-menu.
      category: cmdDef.toolTypes?.['CATEGORY'] ||
        (isAmiga68kDoorType(cmdDef.type)
          ? 'Amiga 68K'
          : undefined)
    };

    // One resolved MIN_COLUMNS for the marker AND the gate. Left undefined
    // when neither registry declares one, so "unclassified" stays visible and
    // the closed default is applied once, at the gate.
    const declared = declaredMinColumns({
      toolTypes: cmdDef.toolTypes,
      doorInfo: installedByCommand.get(door.command),
    });
    if (declared !== null) {
      door.minColumns = declared;
      // MIN_COLUMNS is a claim about the door's OWN layout, and the gate is
      // type-blind: a 68K binary marked MIN_COLUMNS=40 is let straight in, so
      // if the claim is false the caller gets raw 80-column bytes. The BBS
      // cannot check it, so it says so out loud at registration.
      //
      // It is a CAUTION, not a verdict. A 68K door CAN narrow its own output:
      // BB_SCRWIDTH answers 40 for a PETSCII caller (xim/screen-width.util.ts)
      // and the C SDK's ae_screen_cols() reads it, which is how THEMEC
      // (sdk/c/examples/theme-picker) draws a real 40-column screen. Saying
      // flatly that a 68K door "cannot" was the older, wrong premise, and it
      // set a trap: the next reader would have "fixed" THEMEC's mark to
      // C64_ADAPT and had the frame adapter crop a screen that was already 40
      // columns wide.
      if (declared < DEFAULT_MIN_COLUMNS && ADAPTED_DOOR_TYPES.has(String(door.type ?? '').toUpperCase())) {
        console.warn(`[initializeDoors] NOTE: door ${door.command} is TYPE=${door.type} and declares MIN_COLUMNS=${declared} - the BBS cannot verify that a 68K binary lays itself out that narrow. It is true only if the door reads BB_SCRWIDTH (the C SDK's ae_screen_cols() does). If it does not, use C64_ADAPT=${declared} instead so the frame adapter reduces its output.`);
      }
    }

    // Same fold for C64_ADAPT, for the same reason: the [C64] marker is drawn
    // from the DOORS-menu entry (which carries the installed record as
    // doorInfo) while Enter re-dispatches by command name onto THIS object,
    // which has no doorInfo. Resolving once here keeps marker and gate on one
    // value.
    const adapt = resolveDoorAdaptColumns({
      toolTypes: cmdDef.toolTypes,
      doorInfo: installedByCommand.get(door.command),
    });
    if (adapt !== null) {
      door.c64Adapt = adapt;
    }

    // And the same fold for CLIENT_ONLY, for the same reason: Enter
    // re-dispatches by command name onto THIS object, which has no doorInfo, so
    // a tooltype declared only in the installed record would mark one thing and
    // gate another. Written only when the declaration exists, so "unclassified"
    // stays visible as undefined - and unclassified here means "not
    // browser-only", the safe direction for a flag that states a restriction.
    if (doorNeedsBrowser({
      toolTypes: cmdDef.toolTypes,
      doorInfo: installedByCommand.get(door.command),
    }, null)) {
      door.needsBrowser = true;
    }

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
      // Input is handled by client-door-bridge, not here. This fires once per
      // pointer sample while a game door runs (60+/s), so it stays quiet
      // unless DOOR_DEBUG is on - the log line itself was measurable noise.
      if (process.env.DOOR_DEBUG === '1') {
        console.log(`[executeClientDoor] No-op doorInputHandler called with:`, JSON.stringify(data));
      }
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
        // Real-time games own the pointer: the cursor is hidden over the
        // playfield and xterm's text selection is suppressed. That used to
        // follow game mode, which this function switches on for EVERY
        // client door - so LiveChat, a client door with a mouse-driven UI,
        // lost its cursor and its clicks. Doors declare it now.
        capturePointer: manifest.capturePointer === true,
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
