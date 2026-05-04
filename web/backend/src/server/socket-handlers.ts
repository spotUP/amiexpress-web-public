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
  trackPendingDisconnect
} from './session-manager';
import { callersLog, getRecentCallerActivity, displaySystemBulletins } from './database-helpers';
import { nodeManager } from '../services/node-manager.service';
// Use the real interpreter (full REXX semantics) instead of the simulated
// stub that previously lived in node-manager.service.ts.
import { arexxEngine } from '../services/arexx.service';
import { nodeFileManager } from '../services/NodeFileManager';
import { userFileManager } from '../services/UserFileManager';
import { runLogoffBatches, runExecuteOn } from '../services/batch-scheduler';
import { mailOnLogoff } from '../services/mail-notification.service';
import { callersLogManager } from '../services/CallersLogManager';
import { displayScreen } from '../handlers/screen.handler';
import { handleCommand } from '../handlers/command.handler';
import { exitChat, sendChatMessage, acceptChat } from '../handlers/chat/chat.handler';
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

const DISCONNECT_GRACE_MS = 15000;

// Game-mode helpers live in services/game-mode.service.ts so lighter consumers
// (BBSApi, tests) can pull them in without the full socket-dispatch graph.
// Re-exported here for backwards compatibility with handlers that already
// import from socket-handlers.
export { enableGameMode, disableGameMode } from '../services/game-mode.service';

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

  // NOTE: Session initialization is handled by index.ts BEFORE calling this function
  // This function only registers event handlers - it should NOT create or initialize sessions
  // The duplicate session creation here was causing subState to be undefined, breaking input handling

  // Get active users (for Who's Online displays like telnet-front)
  socket.on('get-active-users', () => {
    const activeUsers: any[] = [];

    sessions.forEach((session, socketId) => {
      if (session.user && session.nodeId !== undefined) {
        activeUsers.push({
          nodeNumber: session.nodeId,
          username: session.user.username || 'Unknown',
          location: session.user.location || '',
          ipAddress: session.user.ip || 'PRIVATE',
          status: 'active'
        });
      }
    });

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
    if (!session) return;

    const { cols, rows } = size;
console.log(`[TERMINAL] Resize to ${cols}x${rows} for socket ${socket.id}`);

    // Update session terminal dimensions
    session.screenWidth = cols;
    session.screenHeight = rows;

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
console.log('[socket-handlers] Calling doorKeyStateHandler');
      session.doorKeyStateHandler(data);
    }
  });

  // Handle individual key-down events (game mode - bypasses OS key repeat delay)
  socket.on('key-down', (data: { key: string; code: string }) => {
    const session = getSession(socket.id);
    if (!session) return;

    // Initialize key state if needed
    if (!session.keyState) {
      session.keyState = {};
    }
    session.keyState[data.key] = true;

    // If door is active and has a key state handler, call it (SDK doors)
    if (session.inDoorManager && session.doorKeyStateHandler) {
      session.doorKeyStateHandler({ key: data.key, pressed: true, keyState: session.keyState });
    }

    // Route through KeyRepeatManager for 68K doors (handles repeat timing)
    if (session.keyRepeatManager) {
      const char = data.key.length === 1 ? data.key : keyToChar(data.key);
      if (char) {
        session.keyRepeatManager.keyDown(data.key, char);
      }
    } else if (session.inDoorManager && session.doorInputHandler) {
      // SDK doors: send directly to input handler (no repeat, they handle their own)
      const char = data.key.length === 1 ? data.key : getSpecialKeyChar(data.key);
      if (char) {
        session.doorInputHandler(char);
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
console.error('[COMMAND-HANDLER-ENTRY] COMMAND EVENT FIRED!', socket.id);
console.log('=== COMMAND RECEIVED [v2024-FIXED] ===');
console.log('Raw data:', JSON.stringify(data), 'length:', data.length, 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');

    const session = getSession(socket.id);
    if (!session) {
console.error('No session found for socket:', socket.id);
      return;
    }

    // Capture user input for session log viewer
    sessionLogManager.captureInput(socket.id, data);

    // If raw transfer mode is active, bypass normal command handling
    if ((session as any).transferRawActive) {
      const sink = (session as any).transferRawSink;
      if (sink) {
        sink(Buffer.from(data, 'latin1'));
      }
      return;
    }

    // Intercept pause prompts (checkForPause) before any other handling
console.log(`[socket-handlers] checkPauseHandler active: ${!!(session as any).checkPauseHandler}, flagPauseHandler active: ${!!(session as any).flagPauseHandler}`);
    if ((session as any).checkPauseHandler) {
      // Accumulate line input for pause prompts
      if (!(session as any).checkPauseBuffer) {
        (session as any).checkPauseBuffer = '';
      }

      // Treat CR/LF as submission
      if (data === '\r' || data === '\n') {
        const handler = (session as any).checkPauseHandler;
        const buffer = (session as any).checkPauseBuffer;
        // Clear buffer before invoking handler; handler may register a new one
        (session as any).checkPauseBuffer = '';
        // If handler persists, clear it after invocation
        handler(buffer);
        if ((session as any).checkPauseHandler === handler) {
          (session as any).checkPauseHandler = undefined;
        }
        return;
      }

      // Handle backspace
      if (data === '\x7f' || data === '\b') {
        (session as any).checkPauseBuffer = ((session as any).checkPauseBuffer as string).slice(0, -1);
        // Only echo back if NOT in a door (doors handle their own echo)
        if (!session.inDoorManager) {
          socket.emit('ansi-output', '\b \b');
        }
        return;
      }

      // Accumulate other characters
      (session as any).checkPauseBuffer += data;
      // Only echo back if NOT in a door (doors handle their own echo)
      if (!session.inDoorManager) {
        socket.emit('ansi-output', data);
      }
      return;
    }

    // Intercept pause prompts (flagPause) before any other handling
    if ((session as any).flagPauseHandler) {
      // Accumulate line input for pause prompts
      if (!(session as any).flagPauseBuffer) {
        (session as any).flagPauseBuffer = '';
      }

      // Treat CR/LF as submission
      if (data === '\r' || data === '\n') {
        const handler = (session as any).flagPauseHandler;
        const buffer = (session as any).flagPauseBuffer;
        // Clear buffer before invoking handler; handler may register a new one
        (session as any).flagPauseBuffer = '';
        // If handler persists, clear it after invocation
        handler(buffer);
        if ((session as any).flagPauseHandler === handler) {
          (session as any).flagPauseHandler = undefined;
        }
        return;
      }

      // Handle backspace
      if (data === '\x7f' || data === '\b') {
        (session as any).flagPauseBuffer = ((session as any).flagPauseBuffer as string).slice(0, -1);
        // Only echo back if NOT in a door (doors handle their own echo)
        if (!session.inDoorManager) {
          socket.emit('ansi-output', '\b \b');
        }
        return;
      }

      // Append printable characters
      (session as any).flagPauseBuffer += data;
      // Echo the character so the user sees input (only if not in door)
      if (!session.inDoorManager) {
        socket.emit('ansi-output', data);
      }
      return;
    }

console.log('Session state:', session.state, 'subState:', session.subState);
console.log('Input buffer:', JSON.stringify(session.inputBuffer));

    // Special debug for Enter key
    if (data === '\r') {
console.log('🎯 ENTER KEY DETECTED!');
console.log('🎯 Current subState:', session.subState);
console.log('🎯 Is POST_MESSAGE_SUBJECT?', session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT);
console.log('🎯 Input buffer contents:', JSON.stringify(session.inputBuffer));
    }

    // Handle special chat keys (like F1 in AmiExpress)
    if ((session as any).inChat && data === '\x1b[OP') { // F1 key
console.log('🎯 F1 pressed during chat - exiting chat');
      exitChat(socket, session);
      return;
    }

    if (session.clientDoorActive) {
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

    // If game mode is active, skip command handler - key-down events handle input
    if (session.gameModeEnabled) {
      return;
    }

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
      // Normal door input routing (no BBS pause active)
      if (session.doorInputHandler) {
        if (markDoorInput(session, data)) {
          return;
        }
        logDoorDebug(`CMD->door handler dispatch`);
console.log(`[socket-handlers] ABOUT TO CALL doorInputHandler with: "${data}" (length=${data.length}, charCode=${data.charCodeAt(0)})`);
        session.doorInputHandler(data);
        return;
      } else {
console.log('[socket-handlers] inDoorManager/DOOR_RUNNING but no doorInputHandler; sending raw to door:input anyway');
        logDoorDebug(`WARN missing handler while door active; emitting door:input fallback`);
        socket.emit('door:input', data);
        return;
      }
    }
console.log('[socket-handlers] ✗ NOT in door or no handler - routing to BBS command handler');
console.log('[socket-handlers]   inDoorManager:', session.inDoorManager);
console.log('[socket-handlers]   handler exists:', !!session.doorInputHandler);

    // Drop SGR mouse-reporting sequences when no door is consuming them.
    // Why: xterm.js retains DEC mode 1006 across door exits / chat-only-login
    // transitions; once enabled, every mouse move sends `\x1b[<btn;col;row;M`
    // back over the 'command' channel. If that data falls through to handleCommand
    // while subState=ANSI_PROMPT, the multi-char path at command.handler.ts:1020
    // iterates each printable byte (skips ESC, echoes `[<35;X;Y;M`), leaking
    // visible mouse-tracking text at the user's cursor. Doors that need mouse
    // get the data via earlier routing branches; once we reach this fall-through,
    // there is no valid consumer for SGR mouse and dropping is correct.
    if (/^\x1b\[<\d+;\d+;\d+[Mm]/.test(data)) {
      return;
    }

    // Preserve escape sequences (arrow keys, etc.) as single inputs for history/navigation
    let input = data;
    if (input.startsWith('\x1bO') && input.length >= 3) {
      input = `\x1b[${input.slice(2)}`;
    }
    if (input.startsWith('\x1b[') && input.length >= 2) {
      handleCommand(socket, session, input).catch((error: any) => {
console.error('[COMMAND ERROR] Unhandled error in handleCommand:', error);
console.error('[COMMAND ERROR] Stack:', error.stack);
        socket.emit('ansi-output', '\r\n[ERROR] Command processing failed\r\n');
      });
    } else {
      for (const char of input) {
        handleCommand(socket, session, char).catch((error: any) => {
console.error('[COMMAND ERROR] Unhandled error in handleCommand:', error);
console.error('[COMMAND ERROR] Stack:', error.stack);
          socket.emit('ansi-output', '\r\n[ERROR] Command processing failed\r\n');
        });
      }
    }
console.log('=== COMMAND PROCESSED ===\n');
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
    if (!session || !(session as any).transferRawActive) return;
    const sink = (session as any).transferRawSink || (session as any).serialInputHook;
    if (sink) {
      sink(Buffer.from(data));
    }
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
 * Register disconnect handler
 */
function registerDisconnectHandler(socket: Socket) {
  socket.on('disconnect', async (reason) => {
console.log(`[DISCONNECT] Client disconnected, reason: ${reason}, socket: ${socket.id}`);

    // GRACE PERIOD: Wait 3 seconds for potential reconnection before cleanup
    // This prevents kicking users out during brief network hiccups
    // Skip grace period if sysop explicitly kicked the user via NM command
    const reconnectGracePeriod = 3000; // 3 seconds
    const sessionBeforeDelay = getSession(socket.id);

console.log(`[DISCONNECT] sessionBeforeDelay.sysopKicked=${sessionBeforeDelay?.sysopKicked}, nodeId=${sessionBeforeDelay?.nodeId}`);
    if (sessionBeforeDelay && !sessionBeforeDelay.sysopKicked) {
console.log(`[DISCONNECT] Waiting ${reconnectGracePeriod}ms for potential reconnection...`);
      await new Promise(resolve => setTimeout(resolve, reconnectGracePeriod));

      // Check if socket reconnected during grace period
      const sessionAfterDelay = getSession(socket.id);
      if (sessionAfterDelay && sessionAfterDelay.socketId) {
console.log(`[DISCONNECT] User reconnected during grace period, skipping cleanup`);
        return; // User reconnected, skip cleanup
      }
    } else if (sessionBeforeDelay?.sysopKicked) {
console.log(`[DISCONNECT] Sysop kicked user, skipping grace period`);
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

    // Clear node from MULTICOM manager
    if (session.nodeId) {
      try {
        const { multicomManager } = require('../nodes/MulticomManager.js');
        multicomManager.clearNode(session.nodeId);
        console.error(`[DISCONNECT] Cleared node ${session.nodeId} from MULTICOM`);
      } catch (error) {
        console.error(`[DISCONNECT] Failed to clear node from MULTICOM:`, error);
      }
    }

    // Handle internode chat cleanup if user was in chat
    if (session.subState === LoggedOnSubState.CHAT) {
      const { handleChatDisconnect } = require('../handlers/chat/internode-chat.handler');
      await handleChatDisconnect(socket, session);
    }

    // Handle group chat room cleanup if user was in a room
    if (session.subState === LoggedOnSubState.CHAT_ROOM) {
      const { handleRoomDisconnect } = require('../handlers/chat/group-chat.handler');
      await handleRoomDisconnect(socket, session);
    }

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

      // Skip 15-second grace period if sysop explicitly kicked the user
      if (session.sysopKicked) {
console.log(`[DISCONNECT] Sysop kicked user ${userId}, skipping disconnect grace period`);
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

async function finalizeDisconnectCleanup(socket: Socket, session: BBSSession, socketId: string): Promise<void> {
  const userId = session.user?.id ? String(session.user.id) : '';

  if (userId) {
    const stillConnected = Array.from(socketToUser.values()).includes(userId);
console.log(`[DISCONNECT] finalizeDisconnectCleanup: userId=${userId}, stillConnected=${stillConnected}, socketToUser.size=${socketToUser.size}`);
    if (stillConnected) {
console.log(`[DISCONNECT] Cleanup skipped for user ${userId} - active socket detected`);
      pendingDisconnects.delete(userId);
      return;
    }
  } else {
console.log(`[DISCONNECT] finalizeDisconnectCleanup: no userId, session.nodeId=${session.nodeId}`);
  }

  if (userId) {
    pendingDisconnects.delete(userId);
  }

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

    // Run logoff batches (mirror logon batch runner)
    try {
      await runLogoffBatches(session.nodeId || 0);
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
      callersLogManager.logLogoff(nodeId, session.user.username);

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

  // Clean up session storage
  if (userId) {
    for (const [id, uid] of socketToUser.entries()) {
      if (uid === userId) {
        socketToUser.delete(id);
      }
    }
    if (session.nodeId) {
      for (const [id, nodeId] of socketToNodeId.entries()) {
        if (nodeId === session.nodeId) {
          socketToNodeId.delete(id);
        }
      }
    }
    userSessions.delete(userId);
    if (session.nodeId) {
console.log(`[DISCONNECT] Deleting session for node ${session.nodeId} from sessions map`);
      sessions.delete(session.nodeId.toString());
console.log(`[DISCONNECT] Sessions map now has ${sessions.size} entries`);
    }
  } else {
console.log(`[DISCONNECT] No userId, calling deleteSession for socket ${socketId}`);
    deleteSession(socketId);
  }

  triggerSamiLogRefresh();
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
  const transfer = session?.transfer;
  if (!transfer) return;
  try {
    if (transfer.stream && typeof transfer.stream.destroy === 'function') {
      transfer.stream.destroy();
    }
  } catch (_) {
    /* ignore */
  }
  session.transfer = undefined;
  session.transferRawActive = false;
  session.transferRawSink = undefined;
  session.transferManager = undefined;
  session.transferRawSend = undefined;
}

export default registerSocketHandlers;
