/**
 * Socket.IO Event Handlers
 *
 * NOTE: This file is imported by index.ts and is NOT meant to export the entire
 * socket.io setup. It only exports a function to register all socket handlers.
 *
 * Due to the large size of socket event handlers (~1000 lines), this module
 * provides a central location for all Socket.IO event registration.
 */

import { doorInputTraceLine, inputForTrace } from '../amiga-emulation/xim/secret-input';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { keyBytesFor } from './composed-key';
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
  trackPendingDisconnect, reboundSince, allNodesBusyNotice } from './session-manager';
import { callersLog, getRecentCallerActivity } from './database-helpers';
import { nodeManager } from '../services/node-manager.service';
// Use the real interpreter (full REXX semantics) instead of the simulated
// stub that previously lived in node-manager.service.ts.
import { arexxEngine } from '../services/arexx.service';
import { nodeFileManager } from '../services/NodeFileManager';
import { saveAccountAtLogoff } from '../services/account.service';
import { clearSettingsResume } from '../handlers/commands/settings-resume';
import { runLogoffBatches, runExecuteOn, logoffBatchesAlreadyRan } from '../services/batch-scheduler';
import { mailOnLogoff } from '../services/mail-notification.service';
import { callersLogManager } from '../services/CallersLogManager';
import { displayScreen } from '../handlers/screen.handler';
import {
  installPetsciiModelChoke,
  flushPetsciiModel,
  sessionWantsPetscii,
  togglePetsciiCase,
  petsciiCaseChosenByTerminal,
  disposePetsciiSessionModel,
} from '../utils/petscii-session-model';
import { handleCommand } from '../handlers/command.handler';
import { handleChatModeInput } from '../utils/chat-mode-input.util';
import { answerPause, classifyTerminalInput, commandPieces, commandFailed, dispatchInOrder } from './terminal-input';
import { disarmIdleTimeout } from '../services/idle-timeout.service';
import { initializeSecurity } from '../utils/security.util';
import { triggerSamiLogRefresh, updateStoreFromCallersLog } from '../services/SamiLogService';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { AnsiUtil } from '../utils/ansi.util';
import { startObserving, observeOutput, observeInput, stopObserving } from './session-observers';
import { KeyRepeatManager, keyToChar } from '../services/KeyRepeatManager';
import { emitUserLogout } from '../services/bbs-event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime } from '../utils/date-time.util';
import { applyClientReportedGeometry, applyCallerResize } from '../amiga-emulation/xim/screen-width.util';

const DISCONNECT_GRACE_MS = 15000;

// Game-mode helpers live in services/game-mode.service.ts so lighter consumers
// (BBSApi, tests) can pull them in without the full socket-dispatch graph.
// Re-exported here for backwards compatibility with handlers that already
// import from socket-handlers.
export { enableGameMode, disableGameMode } from '../services/game-mode.service';
import { repeatReachesDoor } from '../services/game-mode.service';
import { deliversKeyEvents } from '../services/key-event-capable';
import { reportLogout } from '../achievements/sites';
import { cleanupTransfer } from '../utils/raw-transfer-teardown.util';
import { c64AdapterFor } from './c64-door-adapter';
import { routeDoorInput } from '../services/door-input-routing';
import { onLevel, SYSOP_LEVEL } from './socket-guard';
import { ensureDoorLogLine } from '../utils/door-logging.util';

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

  // The sysop's tools - the session-log viewer and the debug MCP tap - watch
  // this caller through server/session-observers.ts, the same functions a
  // telnet or SSH connection feeds (web-vs-telnet audit item 15).
  startObserving(socket.id);

  const session = getSession(socket.id);
  if (session) {
    session.socket = socket;
    session.socketId = socket.id;
  }

  // Wrap socket.emit to capture all terminal output
  const originalEmit = socket.emit.bind(socket);
  socket.emit = ((event: string, ...args: any[]) => {
    if (event === 'ansi-output') {
      // express.e aePuts2 (1663-1690): ANSI colour off (M) strips the SGR
      // codes. This wrapper is installed at connection, before the modem
      // pacer and the door wrapper, so it is the innermost choke - the same
      // place connection-emitter.ts filters for telnet/SSH.
      args[0] = AnsiUtil.forCaller(getSession(socket.id), args[0]);
      observeOutput(socket.id, getSession(socket.id)?.nodeId, args[0]);
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
  // The sysop's only: every row carries the caller's IP address, and it was
  // answered to any socket - a visitor at the login prompt included. No
  // browser asks for it (doors read doors/who-is-online.ts in-process).
  onLevel(socket, 'get-active-users', SYSOP_LEVEL, () => {
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
    // applyCallerResize: the geometry gate, the real height (wireHeight) and
    // a running door's screen:resize - the same call telnet's NAWS and SSH's
    // window-change make (web-vs-telnet audit item 12).
    if (!applyCallerResize(session as any, cols, rows)) {
console.log(`[TERMINAL] Ignoring client size ${cols}x${rows} for socket ${socket.id}: PETSCII session stays 40x25`);
      return;
    }
console.log(`[TERMINAL] Resize to ${cols}x${rows} for socket ${socket.id}`);
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
  import('../notify/socket').then(({ registerNotifySocketHandlers }) => registerNotifySocketHandlers(socket)).catch((err) => {
console.error('[SOCKET HANDLER ERROR] Failed to load notify socket handlers:', err);
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
  ensureDoorLogLine(`[DoorDebug] ${getSystemTime().toISOString()} ${message}`);
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
    socket.emit('ansi-output', allNodesBusyNotice());
    socket.disconnect();
    return null;
  }
}

/**
 * Register command handler
 */
export function registerCommandHandler(socket: Socket) {
console.log('[socket-handlers] registerCommandHandler called, registering door:input listener');
console.error('[SOCKET-DEBUG] Registering command handler for socket:', socket.id);

  // TEST: Register a simple ping handler to verify socket events work AT ALL
  socket.on('ping-test', (data: any) => {
console.error('[SOCKET-DEBUG] PING TEST RECEIVED!', data);
    socket.emit('pong-test', { received: data });
  });

  /**
   * WHICH ROUTE A KEYSTROKE TOOK INTO THE DOOR.
   *
   * The web path feeds `session.doorInputHandler` from more than one socket
   * event - `key-down` for SDK doors, `command` for everything else, and
   * `door:input` as a fallback - and `markDoorInput` is a no-op, so nothing
   * stops one press arriving twice. The sysop typing `test` into LiveChat on
   * a PETSCII session read `tteesstt` (2026-09-22), and only there, which is
   * a routing question and not a door one.
   *
   * Instrumentation, not a fix: it names the route and the byte so the log
   * says which two fired for one press.
   */
  const traceDoorInput = (session: BBSSession, route: string, data: string): void => {
    /*
     * OFF unless asked for. It was on by default for a PETSCII caller while
     * the doubling was open, and it answered the question - one press, two
     * `key-down` deliveries, both from the browser - but every line it
     * writes is a caller's keystroke, which is his MESSAGE, in the
     * container's log. That is not a thing to leave running.
     */
    if (!process.env.TRACE_DOOR_INPUT) return;
    console.log(doorInputTraceLine(session as never, route, data));
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

console.log('[socket-handlers] door:input received:', inputForTrace(session, data, (s) => JSON.stringify(s)));
    logDoorDebug(`SOCKET door:input data=${inputForTrace(session, data, (s) => JSON.stringify(s))} node=${session.nodeId} state=${session.subState} door=${(session as any).doorId || ''}`);

    if (session.inDoorManager && session.doorInputHandler) {
console.log('[socket-handlers] Calling doorInputHandler from door:input');
      traceDoorInput(session, 'door:input', data);
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
  socket.on('key-down', (data: { key: string; code: string; alt?: boolean; ctrl?: boolean; shift?: boolean; repeat?: boolean; src?: string }) => {
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
        traceDoorInput(session, `key-down/${data.src ?? '?'}${data.repeat ? '/repeat' : ''}`, base);
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

  /*
   * CTRL+L ON THE PETSCII CANVAS - the caller's case switch, the C*Base
   * convention (sysop D1, 2026-10-04). Its own event and never a `command`:
   * socket.io hands a `command` to a running door's listener in parallel with
   * the handler below, so a key sent that way could not be kept from a door.
   * The telnet twin is in server/transport-session.ts.
   */
  socket.on('petscii-case-toggle', () => {
    const session = getSession(socket.id);
    if (session && sessionWantsPetscii(session)) togglePetsciiCase(socket, session);
  });
  // CTRL+ALT on the canvas: the browser switched its own screen; the session
  // and the model learn which set it shows.
  socket.on('petscii-case-set', (data: { bank?: unknown }) => {
    const session = getSession(socket.id);
    if (session && sessionWantsPetscii(session)) petsciiCaseChosenByTerminal(session, data?.bank);
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
    observeInput(socket.id, data);

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
      answerPause(session, decision, (text) => socket.emit('ansi-output', text));
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
        traceDoorInput(session, 'command/client-door', data);
        session.doorInputHandler(data);
      }
      return;
    }

    if (decision.kind === 'swallow') return;   // game mode: the client sends key events instead

    // A running door's keys: the SAME rule telnet asks (services/door-input-
    // routing.ts). The web path used to route them itself, and differed at the
    // edges - with a BBS pause up it never panned a C64_VIEWPORT window, and a
    // key with no door handler fell through to the command handler instead of
    // the door's fallback (web-vs-telnet audit item 8, 2026-09-28).
    // hasCommandListener is false here, as the rule documents: socket.io has
    // already delivered to those listeners by the time this runs.
    if (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) {
      const windowed = c64AdapterFor(socket);
      const viewport = windowed && !windowed.isDisposed() && windowed.isViewport() ? windowed : null;
      const route = routeDoorInput(data, {
        doorActive: true,
        hasDoorInputHandler: Boolean(session.doorInputHandler),
        hasCommandListener: false,
        bbsPauseActive: session.paginatedScreen?.kind === 'bbs',
        boardHoldsTerminal: Boolean(session.doorLentTerminal),
        viewportPan: viewport !== null,
      });
      if (route.pan) {
        if (route.pan === 'home') viewport?.panHome();
        else viewport?.pan(route.pan === 'right' ? VIEWPORT_PAN_COLUMNS : -VIEWPORT_PAN_COLUMNS);
        return;
      }
      if (route.toDoorHandler && session.doorInputHandler) {
        traceDoorInput(session, 'command', data);
        session.doorInputHandler(data);
      }
      if (route.toDoorInputEvent) {
        logDoorDebug(`WARN missing handler while door active; emitting door:input fallback`);
        socket.emit('door:input', data);
      }
      if (!route.toBbs) return;
    }

    // No door took it. `commandPieces` is the rule this handler has always
    // used, now in one place: a stray SGR mouse report (xterm.js keeps DEC
    // 1006 across a door exit, and reaching handleCommand with one echoes
    // `[<35;X;Y;M` at the caller's cursor) is dropped, SS3 is folded to CSI so
    // an arrow key in application-cursor mode is understood, an escape
    // sequence is dispatched whole, and everything else a character at a time.
    // The operator chat takes a pasted line whole - commandPieces asks
    // chatTakesTheWholeChunk for both transports.
    dispatchInOrder(session, commandPieces(data, session.subState), (piece) => handleCommand(socket, session, piece), commandFailed(socket, session));
  });

  // The `transfer:*` socket channel that stood here (start/data/end/cancel)
  // read or wrote ANY path the client named - `BBS:`, `NODE0:`, or a plain
  // absolute path - for any socket, logged on or not. No client ever spoke
  // it (the browser moves files over `transfer-raw:*` / ZMODEM), so it is
  // gone rather than guarded (open-surface audit, 2026-10-04).

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

  // `chat-message` and `accept-chat` are registered once, behind the logon
  // guard, in server/chat-socket-handlers.ts. A second unguarded copy here
  // delivered every chat line twice and let a visitor reach both.
}

/**
 * What CallersLog says ended the call (express.e:8160-8166 logoffLog).
 *
 * `N` ("Off Normally") when the board ended it - G (cleanLogoff), a sysop
 * kick, or any board-side logoff (beginLogoff leaves LOGGING_OFF: time up,
 * too many errors). `Loss Carrier` when the line simply went: the caller
 * closed the tab or dropped telnet. An idle timeout says what the board's
 * TIMEOUT_LC made it (express.e:28607). Every call used to log "Off
 * Normally", drops included (parity survey, 2026-09-29).
 */
export function logoffReason(
  session: { timeoutLogoffStat?: string; cleanLogoff?: boolean; sysopKicked?: boolean; state?: unknown },
): string {
  if (session.timeoutLogoffStat) return session.timeoutLogoffStat;
  if (session.cleanLogoff || session.sysopKicked || session.state === BBSState.LOGGING_OFF) return 'N';
  return 'Loss Carrier';
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
    stopObserving(socket.id);

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

  /*
   * EVERY NODE LOGS OFF. express.e runs one process per node, and a node's
   * logoff - its CallersLog line, its logoff batches, its node files, the
   * account save - runs whether or not the same account is on another node.
   * This used to skip the whole cleanup while the account was live
   * elsewhere (a browser and a telnet line): no paperwork, the node never
   * released, and the session left in `sessions` for /health to list until
   * a restart. forgetSession takes only this session's entries, so the
   * other node is untouched.
   */
console.log(`[DISCONNECT] finalizeDisconnectCleanup: userId=${userId || '-'}, node=${session.nodeId}`);
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

  // A pending W resume belongs to this call only; drop it before anything
  // that can await or throw (settings-resume.ts).
  clearSettingsResume(session);

  // Log user logout if they were logged in (express.e:9493 callersLog)
  if (session.user) {
    // The line dropped while uploads waited for descriptions: they go to
    // LCFILES before the logoff is logged, as uploadaFile files them before
    // it returns (express.e:19385-19489).
    try {
      const { fileLostCarrierUploads } = require('../services/lost-carrier-files.service');
      await fileLostCarrierUploads(session);
    } catch (err) {
      console.error('[LOGOFF] filing lost-carrier uploads failed:', err);
    }
    // express.e:8160-8166 logoffLog - `Loss Carrier` where the call was
    // dropped, `N` where it ended normally (an idle timeout is the second
    // unless the board's TIMEOUT_LC says it is the first, express.e:28607).
    // Written before SAmiLog and the logoff batches read this log.
    callersLogManager.logLogoffOnce(session as never, logoffReason(session as never));
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

    // express.e:8197-8207: the account goes to user.data at logoff - the
    // new-since date after N, the conference's counters back into its record,
    // timeLastOn (read back at the next logon as the day the caller was last
    // on, 28508), every conference summed into the account, then
    // saveAccount; the row follows the record. This is CRITICAL - must save
    // user data before deleting node files.
    if (session.user.slotNumber) {
      try {
        await saveAccountAtLogoff(session);
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
 *
 * Only THIS session's entries go. The same account can be on another node at
 * the same time (a browser and a telnet line); that session's node, its
 * sockets and its userSessions entry stay. This used to clear every entry for
 * the account, so the disconnect cleanup could not call it while the account
 * was live elsewhere - and skipped it, leaving the ended node in `sessions`
 * for /health to list until the next restart.
 */
export function forgetSession(session: BBSSession, socketId: string, userId: string): void {
  if (!userId) {
console.log(`[DISCONNECT] No userId, calling deleteSession for socket ${socketId}`);
    deleteSession(socketId);
    return;
  }
  const nodeKey = session.nodeId ? session.nodeId.toString() : '';
  // The node is this session's unless another session has taken it since.
  const ownsNode = !!nodeKey && (!sessions.has(nodeKey) || sessions.get(nodeKey) === session);
  const onAnotherLiveNode = (id: string) => {
    const nodeId = socketToNodeId.get(id);
    return nodeId !== undefined && nodeId.toString() !== nodeKey && sessions.has(nodeId.toString());
  };

  for (const [id, uid] of socketToUser.entries()) {
    if (uid === userId && !onAnotherLiveNode(id)) socketToUser.delete(id);
  }
  if (ownsNode) {
    for (const [id, nodeId] of socketToNodeId.entries()) {
      if (nodeId.toString() === nodeKey) socketToNodeId.delete(id);
    }
console.log(`[DISCONNECT] Deleting session for node ${nodeKey} from sessions map`);
    sessions.delete(nodeKey);
console.log(`[DISCONNECT] Sessions map now has ${sessions.size} entries`);
  }
  if (userSessions.get(userId) === session || !userSessions.has(userId)) {
    userSessions.delete(userId);
    // The account's other live session, if it has one, is who a push reaches now.
    for (const other of sessions.values()) {
      if (other !== session && other.user?.id !== undefined && String(other.user.id) === userId) {
        userSessions.set(userId, other);
        break;
      }
    }
  }
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
