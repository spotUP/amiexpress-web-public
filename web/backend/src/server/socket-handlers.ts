/**
 * Socket.IO Event Handlers
 *
 * NOTE: This file is imported by index.ts and is NOT meant to export the entire
 * socket.io setup. It only exports a function to register all socket handlers.
 *
 * Due to the large size of socket event handlers (~1000 lines), this module
 * provides a central location for all Socket.IO event registration.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { emitterForUserId } from './session-emitter-registry';
import { keyBytesFor } from './composed-key';
import { config } from '../config';
import { db } from '../database';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { BBSSession } from '../index';
import {
  sessions,
  getSession,
  setSession,
  deleteSession,
  createSession,
  getNextAvailableNodeId,
  socketToUser,
  socketToNodeId,
  userSessions,
  pendingDisconnects,
  trackPendingDisconnect, reboundSince } from './session-manager';
import { callersLog, getRecentCallerActivity, displaySystemBulletins } from './database-helpers';
import { nodeManager } from '../services/node-manager.service';
// Use the real interpreter (full REXX semantics) instead of the simulated
// stub that previously lived in node-manager.service.ts.
import { arexxEngine } from '../services/arexx.service';
import { nodeFileManager } from '../services/NodeFileManager';
import { userFileManager } from '../services/UserFileManager';
import { runLogoffBatches, runExecuteOn, logoffBatchesAlreadyRan } from '../services/batch-scheduler';
import { mailOnLogoff } from '../services/mail-notification.service';
import { callersLogManager } from '../services/CallersLogManager';
import { displayScreen } from '../handlers/screen.handler';
import {
  installPetsciiModelChoke,
  flushPetsciiModel,
  disposePetsciiSessionModel,
} from '../utils/petscii-session-model';
import { handleCommand } from '../handlers/command.handler';
import { sendChatMessage, acceptChat } from '../handlers/chat/chat.handler';
import { handleChatModeInput } from '../utils/chat-mode-input.util';
import { classifyTerminalInput, clearPauseHandler, commandPieces, chatTakesTheWholeChunk } from './terminal-input';
import { disarmIdleTimeout } from '../services/idle-timeout.service';
import { initializeSecurity } from '../utils/security.util';
import { triggerSamiLogRefresh, updateStoreFromCallersLog } from '../services/SamiLogService';
import { BBSPaths } from '../utils/bbs-paths.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { sessionLogManager } from '../services/SessionLogManager';
import { KeyRepeatManager, keyToChar } from '../services/KeyRepeatManager';
import { emitUserLogout } from '../services/bbs-event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime } from '../utils/date-time.util';
import { applyClientReportedGeometry } from '../amiga-emulation/xim/screen-width.util';

const DISCONNECT_GRACE_MS = 15000;

// Game-mode helpers live in services/game-mode.service.ts so lighter consumers
// (BBSApi, tests) can pull them in without the full socket-dispatch graph.
// Re-exported here for backwards compatibility with handlers that already
// import from socket-handlers.
export { enableGameMode, disableGameMode } from '../services/game-mode.service';
import { repeatReachesDoor } from '../services/game-mode.service';
import { deliversKeyEvents } from '../services/key-event-capable';
import { reportLogout } from '../achievements/sites';
import { endRawTransfer } from '../utils/raw-transfer-teardown.util';
import { c64AdapterFor } from './c64-door-adapter';
import { panKeyOf } from '../services/door-input-routing';

/**
 * How far one press of a cursor key moves a windowed door's view, in source
 * columns. Kept in step with the telnet path's own constant - eight columns,
 * because a whole screen at a time loses the context either side of the join.
 */
const VIEWPORT_PAN_COLUMNS = 8;

/**
 * Convert special key names to their corresponding characters or escape sequences
 * Used for game mode where we receive key names instead of raw characters
 */
function getSpecialKeyChar(key: string): string | null {
  const keyMap: Record<string, string> = {
    // Arrow keys (ANSI escape sequences)
    'ArrowUp': '\x1b[A',
    'ArrowDown': '\x1b[B',
    'ArrowRight': '\x1b[C',
    'ArrowLeft': '\x1b[D',
    // Common control keys
    'Enter': '\r',
    'enter': '\r',
    'Escape': '\x1b',
    'escape': '\x1b',
    'Backspace': '\x7f',
    'backspace': '\x7f',
    'Tab': '\t',
    'tab': '\t',
    'space': ' ',
    ' ': ' ',
    // Function keys
    'F1': '\x1bOP',
    'F2': '\x1bOQ',
    'F3': '\x1bOR',
    'F4': '\x1bOS',
    'F5': '\x1b[15~',
    'F6': '\x1b[17~',
    'F7': '\x1b[18~',
    'F8': '\x1b[19~',
    'F9': '\x1b[20~',
    'F10': '\x1b[21~',
    'F11': '\x1b[23~',
    'F12': '\x1b[24~',
    // Navigation
    'Home': '\x1b[H',
    'End': '\x1b[F',
    'PageUp': '\x1b[5~',
    'PageDown': '\x1b[6~',
    'Insert': '\x1b[2~',
    'Delete': '\x1b[3~',
  };
  return keyMap[key] || null;
}

/**
 * Register all Socket.IO event handlers for a socket connection
 *
 * @param io - Socket.IO server instance
 * @param socket - Socket connection
 * @param chatState - Chat state (for legacy chat handlers)
 */
export function registerSocketHandlers(io: SocketIOServer, socket: Socket, chatState?: any) {
  const clientIp = socket.handshake.address;
console.log(`Client connected from ${clientIp}`);

  // Diagnostic: log every transfer-raw:* event we receive at the
  // socket layer. Helps distinguish "the browser never emitted it"
  // from "the server dropped it before reaching the handler". Gated
  // behind LRZSZ_DEBUG — at typical transfer rates this is ~one log
  // line per kilobyte uploaded.
  if (process.env.LRZSZ_DEBUG) {
    socket.onAny((event: string, ...args: any[]) => {
      if (event.startsWith('transfer-raw:')) {
        const arg0 = args[0];
        const size = arg0?.length ?? arg0?.byteLength ?? (typeof arg0 === 'string' ? arg0.length : 0);
        console.log(`[onAny] ${event} args=${args.length} firstSize=${size}`);
      }
    });
  }

  // Debug MCP: tee every 'ansi-output' emit into a per-node ring buffer.
  // Dev-only. Transparent to the socket (we still call the original emit).
  // Applied exactly once per socket via a marker flag.
  if (process.env.NODE_ENV !== 'production' && !(socket as any).__ansiTapInstalled) {
    (socket as any).__ansiTapInstalled = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { outputTap } = require('../debug/OutputTap');
      const origEmit = socket.emit.bind(socket);
      (socket as any).emit = function (event: string, ...args: any[]): boolean {
        if (event === 'ansi-output' && typeof args[0] === 'string') {
          const sess = getSession(socket.id);
          const nodeId = sess?.nodeId;
          if (typeof nodeId === 'number' && nodeId > 0) {
            outputTap.push(nodeId, args[0] as string);
          }
        }
        return origEmit(event, ...args);
      };
    } catch (err) {
console.warn('[debug-mcp] failed to install ansi-output tap:', err);
    }
  }

  // Start tracking session output for admin log viewer
  sessionLogManager.startSession(socket.id);

  // express.e:7353 - runExecuteOn('CONNECT') when connection is established
  // Note: nodeId is 0 here as no session is assigned yet
  runExecuteOn('CONNECT', 0, {}).catch((err) =>
console.error('[Socket] EXECUTE_ON_CONNECT failed:', err)
  );

  const session = getSession(socket.id);
  if (session) {
    session.socket = socket;
    session.socketId = socket.id;
  }

  // Wrap socket.emit to capture all terminal output
  const originalEmit = socket.emit.bind(socket);
  socket.emit = ((event: string, ...args: any[]) => {
    // Capture ansi-output events for session log
    if (event === 'ansi-output' && args[0]) {
      sessionLogManager.captureOutput(socket.id, args[0]);
    }
    return originalEmit(event, ...args);
  }) as any;

  // The session's PETSCII terminal model. Installed LAST among the
  // registration-time wrappers, so it is the OUTERMOST one and sees
  // everything the session log sees; every wrapper installed later (the ANSI
  // filter, the modem emulator, a C64 door adapter) sits ABOVE it and calls
  // down into it. Inert for an ANSI session: one property read per emit and
  // the arguments are passed through untouched. The session is resolved at
  // emit time because a reconnect swaps a restored session in behind this
  // socket id (`auth-socket-handlers.ts`).
  installPetsciiModelChoke(socket, () => getSession(socket.id));

  // NOTE: Session initialization is handled by index.ts BEFORE calling this function
  // This function only registers event handlers - it should NOT create or initialize sessions
  // The duplicate session creation here was causing subState to be undefined, breaking input handling

  // Get active users (for Who's Online displays like telnet-front)
  socket.on('get-active-users', () => {
    // The same read the doors do - see doors/who-is-online.ts. It was written
    // out twice, and the copy the telnet front end wanted could never reach
    // this one anyway.
    const { listOnlineNodes } = require('../doors/who-is-online');
    const activeUsers = listOnlineNodes();

console.log(`[get-active-users] Returning ${activeUsers.length} active users`);
    socket.emit('active-users', { users: activeUsers });
  });

  // Monitor connection health
  socket.on('error', (error: Error) => {
console.error(`[SOCKET ERROR] Socket ${socket.id} error:`, error.message);
  });

  socket.on('connect_error', (error: Error) => {
console.error(`[CONNECT ERROR] Socket ${socket.id} connect error:`, error.message);
  });

  // Handle terminal resize from client (for responsive terminal sizing)
  socket.on('terminal-size', (size: { cols: number; rows: number }) => {
    const session = getSession(socket.id);
    if (!session) {
      /**
       * THE SIZE ARRIVES BEFORE THE SESSION DOES, and dropping it cost the
       * board the one thing it knows about the caller's terminal.
       *
       * The frontend reports its geometry as soon as the terminal mounts,
       * which is ahead of the BBS session for a web caller - so this
       * handler returned, `wireWidth` was never set, and everything
       * downstream fell back to assuming 80 columns. That is what made the
       * wrap-aware backspace erase a row it should not have: it measured a
       * wrapped line against 80 while the caller's window was not 80.
       *
       * Kept on the socket and applied when the session appears
       * (applyPendingGeometry, called from the session-creating paths).
       */
      (socket as any).pendingGeometry = { cols: size.cols, rows: size.rows };
      return;
    }

    const { cols, rows } = size;

    // A PETSCII caller is 40x25 by definition. The frontend emits
    // terminal-size {80,25} as soon as a door asks for terminal-mode
    // 'fixed', which used to clobber a C64 session's 40 and leave
    // wrapForSession (identity at >=80) fighting doorScreenWidth (still 40).
    // applyClientReportedGeometry is the single gate; a false return means
    // the session keeps its geometry and no door hears a resize it did not
    // have.
    if (!applyClientReportedGeometry(session, cols, rows)) {
console.log(`[TERMINAL] Ignoring client size ${cols}x${rows} for socket ${socket.id}: PETSCII session stays 40x25`);
      return;
    }
console.log(`[TERMINAL] Resize to ${cols}x${rows} for socket ${socket.id}`);

    // Also update tempData for doors
    if (!session.tempData) {
      session.tempData = {} as any;
    }
    (session.tempData as any).termWidth = cols;
    (session.tempData as any).termHeight = rows;

    // Emit resize event to the door's BBSApi (if a door is running)
    // This uses the internal EventEmitter, not socket.emit (which goes to client)
    if (session.bbsApi && typeof session.bbsApi.emitInternal === 'function') {
console.log(`[TERMINAL] Emitting screen:resize to door via bbsApi.emitInternal`);
      session.bbsApi.emitInternal('screen:resize', { cols, rows });
    }
  });

  // Register all event handlers
  registerCommandHandler(socket);
  registerDisconnectHandler(socket);

  // Register modular socket handlers (imported from separate modules)
  // These handlers were extracted from index.ts for better code organization
  import('./auth-socket-handlers').then(({ registerAuthHandlers }) => registerAuthHandlers(socket)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load auth-socket-handlers:', err);
  });
  import('./file-socket-handlers').then(({ registerFileHandlers }) => registerFileHandlers(socket)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load file-socket-handlers:', err);
  });
  import('./chat-socket-handlers').then(({ registerChatHandlers }) => registerChatHandlers(socket, chatState)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load chat-socket-handlers:', err);
  });
  import('./thread-socket-handlers').then(({ setupThreadHandlers }) => setupThreadHandlers(socket, session)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load thread-socket-handlers:', err);
  });
  import('./pin-socket-handlers').then(({ setupPinHandlers }) => setupPinHandlers(socket, session)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load pin-socket-handlers:', err);
  });
  import('./search-socket-handlers').then(({ setupSearchHandlers }) => setupSearchHandlers(socket, session)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load search-socket-handlers:', err);
  });
  import('./moderation-socket-handlers').then(({ setupModerationHandlers }) => setupModerationHandlers(socket, session, io)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load moderation-socket-handlers:', err);
  });
  import('./preference-socket-handlers').then(({ registerPreferenceHandlers }) => registerPreferenceHandlers(socket)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load preference-socket-handlers:', err);
  });
  import('../handlers/network-monitor.handler').then(({ registerNetworkMonitorHandlers }) => registerNetworkMonitorHandlers(socket)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load network-monitor.handler:', err);
  });
  import('../handlers/voice-channel.handler').then(({ registerVoiceChannelHandlers }) => registerVoiceChannelHandlers(socket, io, sessions)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load voice-channel.handler:', err);
  });
  import('../handlers/audio-video.handler').then(({ registerAudioVideoHandlers }) => registerAudioVideoHandlers(socket, io, sessions)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load audio-video.handler:', err);
  });

  // XIM injection handlers - disabled until type errors fixed
  // import('../handlers/debug/xim-injection.handler').then(({ registerXIMInjectionHandlers }) => {
  //   const session = getSession(socket.id);
  //   if (session) {
  //     registerXIMInjectionHandlers(socket, session, { sessions });
  //   }
  // }).catch((err) => {
  //   console.error('[SOCKET HANDLER ERROR] Failed to load xim-injection.handler:', err);
  // });
}

function logDoorDebug(message: string) {
  try {
    const logPath = path.join(process.cwd(), '..', '..', 'logs', 'door-68k.log');
    const line = `[DoorDebug] ${getSystemTime().toISOString()} ${message}\n`;
    fs.appendFileSync(logPath, line, { encoding: 'utf8' });
  } catch {
    /* ignore */
  }
}

/**
 * Initialize session and assign to node
 */
async function initializeSession(socket: Socket) {
  let nodeSession;
  try {
    nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);
    return nodeSession;
  } catch (error) {
console.error('Failed to assign node to session:', error);
    SysopDebugUtil.debug(
      socket,
      null,
      'Socket Connection',
      `Failed to assign node to new connection`,
      {
        error: error instanceof Error ? error.message : String(error),
        socketId: socket.id
      },
      DebugSeverity.CRITICAL
    );
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mSorry, all nodes are busy.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease try again in a moment.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return null;
  }
}

/**
 * Register command handler
 */
function registerCommandHandler(socket: Socket) {
console.log('[socket-handlers] registerCommandHandler called, registering door:input listener');
console.error('[SOCKET-DEBUG] Registering command handler for socket:', socket.id);

  // TEST: Register a simple ping handler to verify socket events work AT ALL
  socket.on('ping-test', (data: any) => {
console.error('[SOCKET-DEBUG] PING TEST RECEIVED!', data);
    socket.emit('pong-test', { received: data });
  });

  const markDoorInput = (session: BBSSession, data: string): boolean => {
    // Debounce disabled for doors to ensure real-time fidelity
    return false;
  };

  // Handle door input (for TypeScript doors)
  socket.on('door:input', (data: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    // We already route door keystrokes through the main 'command' channel.
    // Ignore door:input when a door is active to prevent double-processing.
    if (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) {
      return;
    }

console.log('[socket-handlers] door:input received:', JSON.stringify(data));
    logDoorDebug(`SOCKET door:input data=${JSON.stringify(data)} node=${session.nodeId} state=${session.subState} door=${(session as any).doorId || ''}`);

    if (session.inDoorManager && session.doorInputHandler) {
      if (markDoorInput(session, data)) {
        return;
      }
console.log('[socket-handlers] Calling doorInputHandler from door:input');
      session.doorInputHandler(data);
    } else {
console.log('[socket-handlers] door:input received but no handler - inDoorManager:', session.inDoorManager, 'handler:', !!session.doorInputHandler);
    }
  });

  // Handle mouse clicks (for ANSI editor and other mouse-enabled features)
  socket.on('mouse-click', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) {
      console.log('[socket-handlers] mouse-click: no session found');
      return;
    }

console.log('[socket-handlers] mouse-click received:', data);
console.log('[socket-handlers] mouse-click check: inDoorManager=', session.inDoorManager, 'hasHandler=', !!session.doorInputHandler, 'mouseEnabled=', session.mouseEventsEnabled);

    // Operator Chat Mouse Handling REMOVED (No visual targets/buttons in linear chat)

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    // Don't send to regular doors as they expect text input, not mouse events
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
console.log('[socket-handlers] Calling doorInputHandler with mouse click data');
      // Pass mouse data as a special formatted string that the door can recognize
      const jsonData = JSON.stringify({ type: 'mouse-click', ...data });
console.log('[socket-handlers] Mouse JSON:', jsonData);
      session.doorInputHandler(jsonData);
    } else {
console.log('[socket-handlers] NOT calling doorInputHandler - conditions not met');
console.log('[socket-handlers] Details: inDoorManager=', session.inDoorManager, 'doorInputHandler exists=', !!session.doorInputHandler, 'mouseEventsEnabled=', session.mouseEventsEnabled);
    }
  });

  // Throttle mouse-move-class events (mousemove/drag/hover) per session.
  // Why: browsers fire mousemove at ~60Hz+ on the client, and BBSTerminal forwards
  // every one. The SDK's screen.handleMouseEvent walks the whole element tree on
  // each event, plus emits screen.render() on hover-state transitions. With heavy
  // mouse activity that saturated the event loop, key events queued up behind it,
  // and socket.io eventually fired its ping timeout — see #14 (DOORMAN freeze
  // 2026-05-04). We coalesce position-only events to ~60Hz per session here so
  // the door stays responsive without the user noticing the cap.
  const MOUSE_MOVE_THROTTLE_MS = 16; // 60Hz cap

  function shouldEmitPositionMouse(session: any, key: string): boolean {
    const stamps = session.__mouseLast || (session.__mouseLast = {});
    const now = Date.now();
    if ((now - (stamps[key] || 0)) < MOUSE_MOVE_THROTTLE_MS) return false;
    stamps[key] = now;
    return true;
  }

  // Handle mouse drag (for continuous drawing in ANSI editor)
  socket.on('mouse-drag', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      if (!shouldEmitPositionMouse(session, 'drag')) return;
      session.doorInputHandler(JSON.stringify({ type: 'mouse-drag', ...data }));
    }
  });

  // Handle mouse up (end of drag operation) — never throttled, must always fire.
  socket.on('mouse-up', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      session.doorInputHandler(JSON.stringify({ type: 'mouse-up', ...data }));
    }
  });

  // Handle mouse hover (cursor follows mouse without clicking)
  socket.on('mouse-hover', (data: { x: number; y: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    // Don't send to regular doors as they expect text input, not mouse events
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      if (!shouldEmitPositionMouse(session, 'hover')) return;
      session.doorInputHandler(JSON.stringify({ type: 'mouse-hover', ...data }));
    }
  });

  // Handle mouse wheel scrolling
  socket.on('mouse-wheel', (data: { x: number; y: number; deltaY: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      session.doorInputHandler(JSON.stringify({ type: 'mouse-wheel', ...data }));
    }
  });

  // Handle simultaneous key state updates (for games/doors that need multiple keys pressed at once)
  socket.on('keys:state', (data: { key: string; pressed: boolean; keyState: Record<string, boolean> }) => {
    const session = getSession(socket.id);
    if (!session) return;

console.log('[socket-handlers] keys:state received:', data);

    // Update session key state
    if (!session.keyState) {
      session.keyState = {};
    }
    session.keyState = data.keyState;

    // If door is active and has a key state handler, call it
    if (session.inDoorManager && session.doorKeyStateHandler) {
      // No logging here: this fires on EVERY key event of every game-mode
      // door. Synchronous stdout writes in the input path are the
      // documented DOORMAN-freeze mechanism.
      session.doorKeyStateHandler(data);
    }
  });

  // Handle individual key-down events (game mode - bypasses OS key repeat delay)
  socket.on('key-down', (data: { key: string; code: string; alt?: boolean; ctrl?: boolean; shift?: boolean; repeat?: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Initialize key state if needed
    if (!session.keyState) {
      session.keyState = {};
    }
    session.keyState[data.key] = true;

    // If door is active and has a key state handler, call it (SDK doors)
    if (session.inDoorManager && session.doorKeyStateHandler) {
      // `repeat` travels with the press. The browser distinguishes a held
      // key from a new one and always has; dropping that here left every
      // door to infer it from a held-key set of its own, which is wrong the
      // moment a key-up goes missing.
      session.doorKeyStateHandler({
        key: data.key,
        pressed: true,
        keyState: session.keyState,
        repeat: data.repeat === true,
      });
    }

    // Route through KeyRepeatManager for 68K doors (handles repeat timing)
    if (session.keyRepeatManager) {
      const char = data.key.length === 1 ? data.key : keyToChar(data.key);
      if (char) {
        session.keyRepeatManager.keyDown(data.key, char);
      }
    } else if (session.inDoorManager && session.doorInputHandler) {
      // SDK doors: send directly to input handler (no repeat, they handle their own)
      //
      // ...except the browser's own auto-repeat, which arrives here as another
      // key-down carrying `repeat: true`. A door in APPLICATION repeat asked
      // for a menu, where a key is a command: one press, one delivery. See
      // `repeatReachesDoor` for the whole argument (2026-09-15).
      if (data.repeat === true && !repeatReachesDoor(session.doorKeyRepeatMode, data.key)) {
        return;
      }
      const base = data.key.length === 1 ? data.key : getSpecialKeyChar(data.key);
      if (base) {
        // Alt is ESC before the key, which is how a terminal has always
        // spelled meta. Dropping it meant a door in GAME MODE could never
        // see Alt+Enter - it arrived as a bare Enter, and in GRANDMASTER's
        // menu that is "select" (2026-09-02). Ctrl+letter is already a
        // control byte in `base`, so only Alt needs adding here.
        //
        // ...unless Alt COMPOSED the character, which on a Mac is how half
        // the punctuation is typed: `@` on a Nordic layout is Option+2. See
        // composed-key.ts - prefixing there spells ESCAPE, and cost the sysop
        // his dialog and then his door while typing an email address.
        session.doorInputHandler(keyBytesFor(base, data.key, data.code, data.alt));
      }
    }
  });

  // Handle individual key-up events (game mode - for multi-key support)
  socket.on('key-up', (data: { key: string; code: string }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Update key state
    if (session.keyState) {
      delete session.keyState[data.key];
    }

    // If door is active and has a key state handler, call it (SDK doors)
    if (session.inDoorManager && session.doorKeyStateHandler) {
      session.doorKeyStateHandler({ key: data.key, pressed: false, keyState: session.keyState || {} });
    }

    // Stop repeat for 68K doors
    if (session.keyRepeatManager) {
      session.keyRepeatManager.keyUp(data.key);
    }
  });

  // Handle gamepad events — forward to GamepadInputManager via session.gamepadHandler
  socket.on('gamepad-event', (event: any) => {
    const session = getSession(socket.id);
    if (!session) return;
    // Debug: log button presses and axis movement to help trace binding issues
    if (event.type === 'button' && event.pressed) {
      console.log(`[gamepad] button ${event.button} pressed, handler=${!!session.gamepadHandler}`);
    } else if (event.type === 'dpad') {
      console.log(`[gamepad] dpad ${event.direction}, handler=${!!session.gamepadHandler}`);
    }
    session.gamepadHandler?.(event);
  });

  socket.on('command', (data: string) => {
    // Three synchronous stdout writes used to run here per KEYSTROKE
    // (including a JSON.stringify of the payload). In a door that streams
    // input during gameplay this is pure added latency on every key.
    const session = getSession(socket.id);
    if (!session) {
console.error('No session found for socket:', socket.id);
      return;
    }

    // Output stops, input begins - the same boundary index.ts:1144 uses for
    // telnet. A trailing bare CR held in the model resolves into its $9D walk
    // here, so the model matches what the browser's own transducer did before
    // it sent this key (BBSTerminal.tsx flushes on the same edge). Nothing is
    // written to the wire: on web the flush output is a MODEL event only,
    // because the browser produced the real bytes itself. That is the one
    // place web and telnet differ, and it is why `flushPendingPetscii` stays a
    // separate telnet-only function that writes.
    flushPetsciiModel(session);

    // Capture user input for session log viewer
    sessionLogManager.captureInput(socket.id, data);

    // ONE INPUT PIPELINE (TP-8, server/terminal-input.ts). The branches that
    // used to be written out here - the raw-transfer bypass, the two pause
    // accumulators, chat mode, and the client-door and game-mode guards - are
    // now a decision the TELNET handler asks for too. What stays here is what
    // is genuinely web's: the door routing below (socket.io fires a door's own
    // `command` listener in parallel, so this handler early-returns for a
    // door, where telnet must emit the event itself) and the echo channel.
    const decision = classifyTerminalInput(session, data, {
      // Only a browser has the key-down/key-up channel game mode uses.
      deliversKeyEvents: deliversKeyEvents(session),
    });

    if (decision.kind === 'transfer-sink') {
      decision.sink(Buffer.from(data, 'latin1'));
      return;
    }

    if (decision.kind === 'pause') {
      if (decision.handler && decision.line !== null) {
        decision.handler(decision.line);
        clearPauseHandler(session, decision.which, decision.handler);
      }
      // Only echo when NOT in a door - doors handle their own echo.
      if (decision.echo !== null && !session.inDoorManager) {
        socket.emit('ansi-output', decision.echo);
      }
      return;
    }

    if (decision.kind === 'chat') {
      if (handleChatModeInput(socket, session, data)) return;
    }

    // Out-of-band Ctrl+C abort for long-running script engines (AREXX).
    // The script may be in a tight loop with no doorInputHandler installed —
    // the regular GETCHAR/Prompt path can't see Ctrl+C in that window.
    // scriptAbortHandler fires regardless of any other routing; the engine
    // honours the flag at the next clause boundary. We do NOT return; the
    // byte still falls through to whatever routing applies, so a Ctrl+C
    // pressed at an actual input prompt also delivers an empty/abort
    // character to the prompt handler.
    if (
      (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) &&
      session.scriptAbortHandler &&
      data.length > 0 &&
      data.charCodeAt(0) === 3
    ) {
      try { session.scriptAbortHandler(); } catch { /* never throw out of socket handler */ }
    }

    if (decision.kind === 'swallow' && decision.why === 'client-door') {
      // Exception: if a server-side blessed modal has installed a doorInputHandler
      // (e.g., chat-only login modal during hybrid-door startup), route input there.
      // The client bundle loads before the server onStart login modal shows, so
      // clientDoorActive is already true by the time the user needs to type.
      if (session.inDoorManager && session.doorInputHandler) {
        console.log('[socket-handlers] clientDoorActive=true BUT server doorInputHandler set — routing to server modal');
        session.doorInputHandler(data);
      }
      return;
    }

    if (decision.kind === 'swallow') return;   // game mode: the client sends key events instead

    // BBS-owned pause takes priority over door input routing.
    // When a display flow pause (doPause) is active while a ~CC_ door is finishing,
    // Enter/Space should dismiss the pause, not go to the door.
    if (session.paginatedScreen?.kind === 'bbs' && (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING)) {
      const ch = data.charCodeAt(0);
      const isPauseKey = data === ' ' || data === '\r' || data === '\n' || ch === 13 || ch === 10;
      if (isPauseKey) {
console.log(`[socket-handlers] BBS pause intercept: routing "${data}" to command handler instead of door`);
        // Fall through to command handler below which will handle pagination
      } else {
        // Non-pause keys still go to the door
        if (session.doorInputHandler) {
          if (markDoorInput(session, data)) {
            return;
          }
          session.doorInputHandler(data);
          return;
        }
      }
    } else if (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) {
      /*
       * A WINDOWED door's cursor keys move the window, not the door.
       *
       * Only a door that declared C64_VIEWPORT reaches this: its screen has
       * no 40-column fold that keeps it usable, so half of what it draws is
       * off the caller's screen until they pan. Same rule as telnet
       * (services/door-input-routing.ts), asked here because the web path
       * routes door keys itself.
       */
      const windowed = c64AdapterFor(socket);
      if (windowed && !windowed.isDisposed() && windowed.isViewport()) {
        const pan = panKeyOf(data);
        if (pan === 'home') { windowed.panHome(); return; }
        if (pan) { windowed.pan(pan === 'right' ? VIEWPORT_PAN_COLUMNS : -VIEWPORT_PAN_COLUMNS); return; }
      }
      // Normal door input routing (no BBS pause active)
      if (session.doorInputHandler) {
        if (markDoorInput(session, data)) {
          return;
        }
        logDoorDebug(`CMD->door handler dispatch`);
        session.doorInputHandler(data);
        return;
      } else {
        logDoorDebug(`WARN missing handler while door active; emitting door:input fallback`);
        socket.emit('door:input', data);
        return;
      }
    }

    // No door took it. `commandPieces` is the rule this handler has always
    // used, now in one place: a stray SGR mouse report (xterm.js keeps DEC
    // 1006 across a door exit, and reaching handleCommand with one echoes
    // `[<35;X;Y;M` at the caller's cursor) is dropped, SS3 is folded to CSI so
    // an arrow key in application-cursor mode is understood, an escape
    // sequence is dispatched whole, and everything else a character at a time.
    // The operator chat takes a pasted line whole - see chatTakesTheWholeChunk.
    // Split into characters here it was dispatched as N un-awaited calls and
    // trickled onto the caller's screen.
    if (chatTakesTheWholeChunk(session.subState, data)) {
      handleCommand(socket, session, data).catch((error: any) => {
console.error('[COMMAND ERROR] Unhandled error in handleCommand:', error);
        socket.emit('ansi-output', '\r\n[ERROR] Command processing failed\r\n');
      });
      return;
    }

    for (const piece of commandPieces(data)) {
      handleCommand(socket, session, piece).catch((error: any) => {
console.error('[COMMAND ERROR] Unhandled error in handleCommand:', error);
console.error('[COMMAND ERROR] Stack:', error.stack);
        socket.emit('ansi-output', '\r\n[ERROR] Command processing failed\r\n');
      });
    }
  });

  // Binary transfer scaffold (upload/download via socket chunks)
  socket.on('transfer:start', (payload: any, ack?: (resp: any) => void) => {
    const session = getSession(socket.id);
    if (!session) {
      ack?.({ status: 'error', message: 'no session' });
      return;
    }

    cleanupTransfer(session);

    const direction = (payload?.direction || '').toLowerCase();
    const amigaPath = payload?.path || '';
    const resolved = resolveTransferPath(session, amigaPath);
    if (!resolved) {
      ack?.({ status: 'error', message: 'invalid path' });
      return;
    }

    if (direction === 'upload') {
      try {
        const stream = fs.createWriteStream(resolved);
        stream.on('error', (err) => {
          cleanupTransfer(session);
          socket.emit('transfer:error', { message: err.message });
        });
        (session as any).transfer = { direction, path: resolved, stream };
        ack?.({ status: 'ready', path: resolved });
      } catch (err: any) {
        ack?.({ status: 'error', message: err?.message || 'upload init failed' });
      }
      return;
    }

    if (direction === 'download') {
      if (!fs.existsSync(resolved)) {
        ack?.({ status: 'error', message: 'file not found' });
        return;
      }
      ack?.({ status: 'ready', path: resolved });
      try {
        const stream = fs.createReadStream(resolved);
        stream.on('data', (chunk) => socket.emit('transfer:data', chunk));
        stream.on('end', () => {
          socket.emit('transfer:end', { path: resolved });
          cleanupTransfer(session);
        });
        stream.on('error', (err) => {
          socket.emit('transfer:error', { message: err.message });
          cleanupTransfer(session);
        });
        (session as any).transfer = { direction, path: resolved, stream };
      } catch (err: any) {
        socket.emit('transfer:error', { message: err?.message || 'download failed' });
        cleanupTransfer(session);
      }
      return;
    }

    ack?.({ status: 'error', message: 'invalid direction' });
  });

  socket.on('transfer:data', (data: Buffer) => {
    const session = getSession(socket.id);
    if (!session) return;
    const transfer = (session as any).transfer;
    if (!transfer || transfer.direction !== 'upload' || !transfer.stream) return;
    transfer.stream.write(data);
  });

  socket.on('transfer:end', () => {
    const session = getSession(socket.id);
    if (!session) return;
    const transfer = (session as any).transfer;
    if (transfer?.direction === 'upload' && transfer.stream) {
      transfer.stream.end();
      socket.emit('transfer:complete', { path: transfer.path });
    }
    cleanupTransfer(session);
  });

  socket.on('transfer:cancel', () => {
    const session = getSession(socket.id);
    if (!session) return;
    cleanupTransfer(session);
    socket.emit('transfer:cancelled');
  });

  // Raw transfer bridge for future ZMODEM: bypass cooked ANSI and feed raw bytes
  socket.on('transfer-raw:start', (payload: any, ack?: (resp: any) => void) => {
    const session = getSession(socket.id);
    if (!session) {
      ack?.({ status: 'error', message: 'no session' });
      return;
    }
    (session as any).transferRawActive = true;
    if (!(session as any).transferRawSend) {
      (session as any).transferRawSend = (buf: Buffer) => socket.emit('transfer-raw:data', buf);
    }
    ack?.({ status: 'ready' });
  });

  socket.on('transfer-raw:data', (data: Buffer) => {
    const session = getSession(socket.id);
    const len = data?.length ?? (data as any)?.byteLength ?? 0;
    if (!session) {
      console.log(`[transfer-raw:data] ${len}B dropped — no session`);
      return;
    }
    if (!(session as any).transferRawActive) {
      console.log(`[transfer-raw:data] ${len}B dropped — transferRawActive=false`);
      return;
    }
    const sink = (session as any).transferRawSink || (session as any).serialInputHook;
    if (!sink) {
      console.log(`[transfer-raw:data] ${len}B dropped — no sink`);
      return;
    }
    sink(Buffer.from(data));
  });

  socket.on('transfer-raw:end', () => {
    const session = getSession(socket.id);
    if (!session) return;
    if ((session as any).transferManager?.cancel) {
      (session as any).transferManager.cancel();
    }
    cleanupTransfer(session);
    (session as any).transferRawActive = false;
    (session as any).transferRawSink = undefined;
    socket.emit('transfer-raw:complete');
  });

  socket.on('transfer-raw:cancel', () => {
    const session = getSession(socket.id);
    if (!session) return;
    if ((session as any).transferManager?.cancel) {
      (session as any).transferManager.cancel();
    }
    (session as any).transferRawActive = false;
    (session as any).transferRawSink = undefined;
    socket.emit('transfer-raw:cancelled');
  });

  // Handle special chat commands
  socket.on('chat-message', (message: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  socket.on('accept-chat', (sessionId: string) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Sysop accepting chat request
    const { chatState } = require('./initialization');
    const chatSession = chatState.activeSessions.find((s: any) => s.id === sessionId);
    if (chatSession && session.user?.secLevel === 255) { // Sysop level
      acceptChat(socket, session, chatSession);
    }
  });
}

/**
 * Whether this session tears down the moment its socket dies, skipping
 * every grace period. Two cases, both deliberate ends:
 * - sysopKicked: the sysop threw the caller off via NM.
 * - cleanLogoff: the caller said goodbye with G (ghostlogoff 2026-09-10 -
 *   a 15 s wait only serves drops, and a fast re-login reads its own
 *   not-yet-cleaned session as "already on another node").
 * Anything else (drops, timeouts, bumps) keeps the grace so a blip does
 * not become a logoff.
 */
export function wantsImmediateTeardown(
  session: { sysopKicked?: boolean; cleanLogoff?: boolean } | null | undefined,
): boolean {
  return session?.sysopKicked === true || session?.cleanLogoff === true;
}

/**
 * Register disconnect handler.
 *
 * Exported so a test can drive the real teardown path
 * (`tests/petscii/render-ctx-disposal.test.ts`) without registering the
 * whole socket surface; production still reaches it only through
 * `registerSocketHandlers`.
 */
export function registerDisconnectHandler(socket: Socket) {
  socket.on('disconnect', async (reason) => {
console.log(`[DISCONNECT] Client disconnected, reason: ${reason}, socket: ${socket.id}`);

    // GRACE PERIOD: Wait 3 seconds for potential reconnection before cleanup
    // This prevents kicking users out during brief network hiccups
    // Skip grace period if sysop explicitly kicked the user via NM command,
    // or the caller said goodbye with G (cleanLogoff - a deliberate leave
    // waits for nothing; ghostlogoff 2026-09-10).
    const reconnectGracePeriod = 3000; // 3 seconds
    const sessionBeforeDelay = getSession(socket.id);

console.log(`[DISCONNECT] sessionBeforeDelay.sysopKicked=${sessionBeforeDelay?.sysopKicked}, cleanLogoff=${sessionBeforeDelay?.cleanLogoff}, nodeId=${sessionBeforeDelay?.nodeId}`);
    if (sessionBeforeDelay && !wantsImmediateTeardown(sessionBeforeDelay)) {
console.log(`[DISCONNECT] Waiting ${reconnectGracePeriod}ms for potential reconnection...`);
      await new Promise(resolve => setTimeout(resolve, reconnectGracePeriod));

      // Reconnected during the grace period? Only if the session now names a
      // DIFFERENT socket - the restore rebinds it. A session still holding
      // this dead socket's id is a ghost (see reboundSince).
      const sessionAfterDelay = getSession(socket.id);
      if (reboundSince(sessionAfterDelay, socket.id)) {
console.log(`[DISCONNECT] User reconnected during grace period on socket ${sessionAfterDelay!.socketId}, skipping cleanup`);
        return; // User reconnected, skip cleanup
      }
    } else if (sessionBeforeDelay && wantsImmediateTeardown(sessionBeforeDelay)) {
console.log(`[DISCONNECT] Immediate teardown (kicked or clean G logoff), skipping grace period`);
    }

    // End session log tracking
    sessionLogManager.endSession(socket.id);

    const session = getSession(socket.id);
    if (!session) {
      // Release node even if session was already cleaned up
      await nodeManager.releaseSession(socket.id);
      deleteSession(socket.id);
      return;
    }

    // The same three a byte transport releases (TP-13b), one copy.
    await releaseSessionResources(socket, session);

    const userId = session.user?.id ? String(session.user.id) : '';
    if (userId) {
      const hasOtherSockets = Array.from(socketToUser.entries()).some(([id, uid]) => uid === userId && id !== socket.id);

console.log(`[DISCONNECT] Removing socket ${socket.id} mapping for user ${userId}`);
      // Multi-tab fanout: leave user:<id> room symmetrically with the join in auth-socket-handlers.
      try { socket.leave('user:' + userId); } catch (_) {}
      socketToUser.delete(socket.id);
      socketToNodeId.delete(socket.id);

      // Release the socket-bound node session (safe to do immediately)
      await nodeManager.releaseSession(socket.id);

      if (hasOtherSockets) {
console.log(`[DISCONNECT] User ${userId} still has other sockets connected - keeping user session`);
        return;
      }

      // Skip 15-second grace period if sysop explicitly kicked the user,
      // or the caller said goodbye with G (cleanLogoff - same shape:
      // a deliberate end waits for nothing).
      if (wantsImmediateTeardown(session)) {
console.log(`[DISCONNECT] Immediate teardown (kicked or clean G logoff) for user ${userId}, skipping disconnect grace period`);
        await finalizeDisconnectCleanup(socket, session, socket.id);
        return;
      }

      const nodeId = session.nodeId || 0;
      const timer = setTimeout(() => {
        void finalizeDisconnectCleanup(socket, session, socket.id);
      }, DISCONNECT_GRACE_MS);
      trackPendingDisconnect(userId, socket.id, nodeId, timer);

console.log(`[DISCONNECT] Scheduled logoff for user ${userId} in ${DISCONNECT_GRACE_MS}ms`);
      return;
    }

    await finalizeDisconnectCleanup(socket, session, socket.id);
  });
}

/**
 * What a connection releases before its session is finalised.
 *
 * TP-13b. The web disconnect handler did these three inline and the byte
 * transports did none of them: a telnet caller who dropped while in a chat
 * left the room holding a ghost, and their node stayed in MULTICOM. One
 * copy, called by both.
 */
export async function releaseSessionResources(
  emitter: any,
  session: BBSSession,
): Promise<void> {
  // The clock stops with the line. TP-13b's "the same three a byte transport
  // releases" is now four; a timer left armed on a dead session would fire
  // into a closed socket a few minutes after the caller had gone.
  disarmIdleTimeout(session as never);

  if (session.nodeId) {
    try {
      const { multicomManager } = require('../nodes/MulticomManager.js');
      multicomManager.clearNode(session.nodeId);
    } catch (error) {
      console.error(`[DISCONNECT] Failed to clear node from MULTICOM:`, error);
    }
  }

  if (session.subState === LoggedOnSubState.CHAT) {
    const { handleChatDisconnect } = require('../handlers/chat/internode-chat.handler');
    await handleChatDisconnect(emitter, session);
  }

  if (session.subState === LoggedOnSubState.CHAT_ROOM) {
    const { handleRoomDisconnect } = require('../handlers/chat/group-chat.handler');
    await handleRoomDisconnect(emitter, session);
  }
}

/**
 * A byte transport's session ends here - the same finalize the browser
 * reaches, with the same resource release in front of it.
 *
 * There is no grace period: `restore-session` is registered only inside
 * `registerSocketHandlers`, which `setupTelnetSSHHandler` never calls, so a
 * telnet or SSH caller has no reconnect path to wait for. Waiting would
 * hold their node for nothing.
 */
export async function endTransportSession(
  emitter: any,
  session: BBSSession,
  sessionKey: string,
): Promise<void> {
  await releaseSessionResources(emitter, session);
  await finalizeDisconnectCleanup(emitter, session, sessionKey);
}

export async function finalizeDisconnectCleanup(socket: Socket, session: BBSSession, socketId: string): Promise<void> {
  const userId = session.user?.id ? String(session.user.id) : '';

  if (userId) {
    /**
     * Is this user still on the board somewhere ELSE?
     *
     * TP-13b. This used to ask `socketToUser`, which holds WEB sockets only
     * (login-post.service fills it for socket.io callers), so a caller
     * logged in on both a browser and a telnet line had the telnet logoff
     * silently skipped - no CallersLog line, no logoff batches, no node
     * files written. The registry answers for every transport, and the
     * session it finds has to be a DIFFERENT one from the session ending.
     */
    const elsewhere = emitterForUserId(userId);
    const stillConnected = !!elsewhere && elsewhere.session !== session;
console.log(`[DISCONNECT] finalizeDisconnectCleanup: userId=${userId}, stillConnected=${stillConnected}`);
    if (stillConnected) {
console.log(`[DISCONNECT] Cleanup skipped for user ${userId} - this user is live on another connection`);
      pendingDisconnects.delete(userId);
      return;
    }
  } else {
console.log(`[DISCONNECT] finalizeDisconnectCleanup: no userId, session.nodeId=${session.nodeId}`);
  }

  if (userId) {
    pendingDisconnects.delete(userId);
  }

  // OFF THE BOARD FIRST, THEN THE PAPERWORK.
  //
  // Everything below - the callers log, SAmiLog, the achievements, the
  // LOGOFF BATCHES - is bookkeeping about a caller who has already gone, and
  // the batches run doors: `runLogoffBatches` awaited a whole 68K emulator
  // (ByteKillHandler, 2026-09-08 05:28) while this session still sat in the
  // `sessions` map. /health counts that map, so the board reported a caller
  // who had closed his browser - and the deploy guard refused to deploy for
  // him. A door that hangs or throws left him there for ever.
  //
  // The maps are the board's answer to "who is on"; they are cleared here,
  // before anything that can be slow or throw. The bookkeeping below holds
  // its own `session` object and needs no map entry.
  forgetSession(session, socketId, userId);

  // Log user logout if they were logged in (express.e:9493 callersLog)
  if (session.user) {
    await callersLog(session.user.id, session.user.username, 'Logged off');

    // Update SAmiLog.Store with this session's caller entry
    try {
      await updateStoreFromCallersLog(session.nodeId || 1, { ignoreSysop: false });
    } catch (err) {
      console.error('[SamiLog] Failed to update store on logout:', err);
    }

    // Emit BBS event for LiveChat integration
    try {
      const sessionDuration = session.connectionStart ? Math.floor((Date.now() - session.connectionStart) / 1000) : undefined;
      emitUserLogout({
        username: session.user.username,
        nodeId: session.nodeId || 1,
        timestamp: Date.now(),
        duration: sessionDuration
      });
    } catch (error) {
console.error('[BBSEvent] Error emitting logout event:', error);
    }
    // Achievements (SP2): the minutes snapshot and the PETSCII session. Non-throwing.
    reportLogout(session as any, session.user, session.connectionStart ? Math.floor((Date.now() - session.connectionStart) / 1000) : undefined);

    // Run logoff batches (mirror logon batch runner), unless the `G` path
    // already ran them through express.e's own LOGOFF<n> sys-command - on
    // this board that command IS BBS:Batch<n>, and running both regenerated
    // the bulletins twice per logoff.
    try {
      if (!logoffBatchesAlreadyRan(session as any)) {
        await runLogoffBatches(session.nodeId || 0);
      }
    } catch (err) {
console.error('[LOGOFF] Logoff batch runner failed:', err);
      SysopDebugUtil.debug(
        socket,
        session,
        'Socket Connection',
        `Failed to run logoff batches`,
        {
          error: err instanceof Error ? err.message : String(err),
          nodeId: session.nodeId,
          username: session.user.username
        },
        DebugSeverity.WARNING
      );
    }

    // Run EXECUTE_ON_LOGOFF command from bbsConfig.info (express.e:6738)
    try {
      await runExecuteOn('LOGOFF', session.nodeId || 1, {
        username: session.user.username,
        location: session.user.location
      });
    } catch (err) {
console.error('[LOGOFF] EXECUTE_ON_LOGOFF failed:', err);
    }

    // MAIL_ON_LOGOFF tooltype - express.e:6739-6743
    try {
      await mailOnLogoff(session.user.username, session.user.location || '');
    } catch (err) {
console.error('[LOGOFF] MAIL_ON_LOGOFF failed:', err);
    }

    // Save command history to disk (express.e:25067, 7951, 28612, 28631)
    try {
      const { saveHistory } = require('../utils/command-history.util');
      await saveHistory(session, session.user.id);
console.log(`[CommandHistory] Saved ${session.commandHistory.length} commands for user ${session.user.username}`);
    } catch (error) {
console.error('[CommandHistory] Error saving command history:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'Socket Connection',
        `Failed to save command history on logoff`,
        {
          error: error instanceof Error ? error.message : String(error),
          userId: session.user.id,
          username: session.user.username,
          historyLength: session.commandHistory?.length || 0
        },
        DebugSeverity.WARNING
      );
      // Don't fail logout on history save error
    }

    // DISK-BASED: Write updated user stats to user.data/keys/misc files (express.e:8207)
    // This is CRITICAL - must save user data before deleting node files
    if (session.user.slotNumber) {
      try {
        userFileManager.updateUserDataFile(session.user, session.user.slotNumber);
console.log(`[LOGOFF] Saved user ${session.user.username} to disk (timeUsed=${session.user.timeUsed}, messagesPosted=${session.user.messagesPosted}, slot=${session.user.slotNumber})`);
      } catch (diskErr) {
console.error('[LOGOFF] Error writing user disk files:', diskErr);
        SysopDebugUtil.debug(
          socket,
          session,
          'Socket Connection',
          `Failed to write user data to disk on logoff`,
          {
            error: diskErr instanceof Error ? diskErr.message : String(diskErr),
            userId: session.user.id,
            username: session.user.username
          },
          DebugSeverity.CRITICAL
        );
        // Continue anyway - database has the stats, can sync later
      }
    }

    // CRITICAL: Delete node{n}.user files on logoff
    // express.e deletes these when user logs off so WHO doesn't show logged-off users
    const nodeId = session.nodeId || 0;
    try {
      // Write to CallersLog before cleanup
      // express.e:8163-8166 - `Loss Carrier` where the call was dropped, `N`
      // where it ended normally. An idle timeout is the second unless the
      // board's TIMEOUT_LC says it is the first (express.e:28607).
      const logoffStat = (session as unknown as { timeoutLogoffStat?: string }).timeoutLogoffStat;
      callersLogManager.logLogoff(nodeId, session.user.username, logoffStat || 'N');

      nodeFileManager.deleteNodeFiles(nodeId);
console.log(`[LOGOFF] Node files deleted for node ${nodeId}: ${session.user.username}`);
    } catch (error) {
console.error(`[LOGOFF] Error deleting node files:`, error);
      SysopDebugUtil.debug(
        socket,
        session,
        'Socket Connection',
        `Failed to delete node files on logoff`,
        {
          error: error instanceof Error ? error.message : String(error),
          nodeId,
          username: session.user.username
        },
        DebugSeverity.WARNING
      );
    }

    // SAmiLog update is handled by runLogoffBatches() which runs batch files
    // containing 'typescript:samilog' commands - no separate call needed
  }

  // Release node back to available pool
  await nodeManager.releaseSession(socketId);

  // The session's ONE PETSCII terminal model dies with the session. It is
  // the bank/cursor/pen oracle every `.seq` value is clipped against
  // (`utils/petscii-session-model.ts`), fed at the transport choke; sessions
  // live in the module-level maps above, so dropping it here - alongside the
  // rest of the teardown, after the reconnect grace period - is what keeps a
  // reused session object from painting its first screen against the
  // previous caller's cursor. The parked `screenSegments` go with it: a
  // `~SP`-paused `.seq` stores its remainder together with a `petsciiCtx`
  // holding this very machine, and they are valid against nothing else.
  disposePetsciiSessionModel(session);

  triggerSamiLogRefresh();
}

/**
 * Take a session out of every map that says a caller is on the board.
 *
 * `sessions` (nodeId -> session) is what WHO and /health read, `userSessions`
 * is what a cross-session push resolves through, and the two socket maps are
 * how a socket finds either. A session left in any of them is a caller the
 * board believes is still here.
 */
export function forgetSession(session: BBSSession, socketId: string, userId: string): void {
  if (!userId) {
console.log(`[DISCONNECT] No userId, calling deleteSession for socket ${socketId}`);
    deleteSession(socketId);
    return;
  }
  for (const [id, uid] of socketToUser.entries()) {
    if (uid === userId) socketToUser.delete(id);
  }
  if (session.nodeId) {
    for (const [id, nodeId] of socketToNodeId.entries()) {
      if (nodeId === session.nodeId) socketToNodeId.delete(id);
    }
  }
  userSessions.delete(userId);
  if (session.nodeId) {
console.log(`[DISCONNECT] Deleting session for node ${session.nodeId} from sessions map`);
    sessions.delete(session.nodeId.toString());
console.log(`[DISCONNECT] Sessions map now has ${sessions.size} entries`);
  }
}

function resolveTransferPath(session: any, amigaPath: string): string | null {
  try {
    const bbsRoot =
      session?.bbsPath ||
      config.get('dataDir') ||
      process.env.BBS_DATA_DIR ||
      path.resolve(process.cwd());
    const paths = new BBSPaths(bbsRoot);
    const nodeId = session?.nodeId || 0;
    if (!amigaPath || amigaPath.length === 0) {
      const playpen = paths.node(nodeId).playpen();
      fs.mkdirSync(playpen, { recursive: true });
      return path.join(playpen, `transfer_${Date.now()}.bin`);
    }
    return paths.resolveAmigaPath(amigaPath, nodeId, undefined);
  } catch (err) {
console.error('[socket-handlers] resolveTransferPath failed:', err);
    return null;
  }
}

function cleanupTransfer(session: any) {
  if (!session) return;
  const transfer = session.transfer;
  // The stream half only exists for the browser transport. It used to guard
  // the WHOLE function with an early return, so a session with no
  // `session.transfer` - every telnet and SSH caller - left the raw input
  // routing wired to a finished transfer. Destroy the stream if there is one;
  // tear the routing down either way.
  if (transfer) {
    try {
      if (transfer.stream && typeof transfer.stream.destroy === 'function') {
        transfer.stream.destroy();
      }
    } catch (_) {
      /* ignore */
    }
    session.transfer = undefined;
  }
  endRawTransfer(session);
  session.transferRawSend = undefined;
}

export default registerSocketHandlers;

/**
 * Apply a terminal size that arrived before this socket had a session.
 *
 * Call right after setSession() for a web caller. A no-op when the client
 * never reported one - and the callers of `wireColumns` must keep behaving
 * as if the width is unknown in that case, rather than guessing 80.
 */
export function applyPendingGeometry(socket: any, session: any): void {
  const pending = socket?.pendingGeometry;
  if (!pending || !session) return;
  applyClientReportedGeometry(session, pending.cols, pending.rows);
  socket.pendingGeometry = undefined;
}
