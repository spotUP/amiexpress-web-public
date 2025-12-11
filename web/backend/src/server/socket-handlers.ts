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
import { sessions, getSession, setSession, deleteSession, createSession, getNextAvailableNodeId, checkConnectionLimit } from './session-manager';
import { callersLog, getRecentCallerActivity, displaySystemBulletins } from './database-helpers';
import { nodeManager, arexxEngine } from '../services/node-manager.service';
import { nodeFileManager } from '../services/NodeFileManager';
import { runLogoffBatches } from '../services/batch-scheduler';
import { callersLogManager } from '../services/CallersLogManager';
import { displayScreen } from '../handlers/screen.handler';
import { handleCommand } from '../handlers/command.handler';
import { exitChat, sendChatMessage, acceptChat } from '../handlers/chat/chat.handler';
import { initializeSecurity } from '../utils/security.util';
import { triggerSamiLogRefresh } from '../services/SamiLogService';
import { runSamiLogUpdate } from '../services/SamiLogRunner';
import { BBSPaths } from '../utils/bbs-paths.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { sessionLogManager } from '../services/SessionLogManager';
import { KeyRepeatManager, keyToChar } from '../services/KeyRepeatManager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Enable game mode for a session
 *
 * IMPORTANT: This should ONLY be called for doors that need raw keydown/keyup events.
 * Traditional 68K doors (XIM/AMI) use normal character input via door:input and should NOT have game mode enabled.
 * Only TypeScript game doors that explicitly call bbs.enableGameMode() should use this.
 *
 * For SDK doors: Enables game mode flag and tells frontend to send raw keydown/keyup events
 */
export function enableGameMode(socket: Socket, session: BBSSession, doorType: string): void {
  session.gameModeEnabled = true;
  session.currentDoorType = doorType;

  console.log(`[GameMode] Enabled for door (type=${doorType})`);

  // Tell frontend to enable game mode (sends raw keydown/keyup events)
  socket.emit('game-mode', true);
}

/**
 * Disable game mode for a session (auto-called when door exits)
 */
export function disableGameMode(socket: Socket, session: BBSSession): void {
  // Stop and clean up KeyRepeatManager if exists
  if (session.keyRepeatManager) {
    session.keyRepeatManager.stop();
    session.keyRepeatManager = null;
  }

  session.gameModeEnabled = false;
  session.currentDoorType = undefined;
  session.keyState = {};

  // Tell frontend to disable game mode
  socket.emit('game-mode', false);
  console.log('[GameMode] Disabled');
}

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

  // Check connection rate limit
  if (!checkConnectionLimit(clientIp)) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${clientIp}`);
    socket.emit('ansi-output', '\r\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31mToo many connections from your IP.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[33mPlease wait a moment and try again.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n');
    socket.disconnect();
    return;
  }

  // Start tracking session output for admin log viewer
  sessionLogManager.startSession(socket.id);

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

  // Register all event handlers
  registerCommandHandler(socket);
  registerDisconnectHandler(socket);

  // Register modular socket handlers (imported from separate modules)
  // These handlers were extracted from index.ts for better code organization
  import('./auth-socket-handlers').then(({ registerAuthHandlers }) => registerAuthHandlers(socket));
  import('./file-socket-handlers').then(({ registerFileHandlers }) => registerFileHandlers(socket));
  import('./chat-socket-handlers').then(({ registerChatHandlers }) => registerChatHandlers(socket, chatState));
  import('./preference-socket-handlers').then(({ registerPreferenceHandlers }) => registerPreferenceHandlers(socket));
}

function logDoorDebug(message: string) {
  try {
    const logPath = path.join(process.cwd(), '..', '..', 'logs', 'door-68k.log');
    const line = `[DoorDebug] ${new Date().toISOString()} ${message}\n`;
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

  const markDoorInput = (session: BBSSession, data: string): boolean => {
    const now = Date.now();
    const last = (session as any).__lastDoorInput;
    if (last && last.data === data && now - last.ts < 100) {
      return true; // duplicate within debounce window
    }
    (session as any).__lastDoorInput = { data, ts: now };
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
    if (!session) return;

    console.log('[socket-handlers] mouse-click received:', data);

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    // Don't send to regular doors as they expect text input, not mouse events
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      console.log('[socket-handlers] Calling doorInputHandler with mouse click data');
      // Pass mouse data as a special formatted string that the door can recognize
      session.doorInputHandler(JSON.stringify({ type: 'mouse-click', ...data }));
    }
  });

  // Handle mouse drag (for continuous drawing in ANSI editor)
  socket.on('mouse-drag', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    console.log('[socket-handlers] mouse-drag received:', data);

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      console.log('[socket-handlers] Calling doorInputHandler with mouse drag data');
      session.doorInputHandler(JSON.stringify({ type: 'mouse-drag', ...data }));
    }
  });

  // Handle mouse up (end of drag operation)
  socket.on('mouse-up', (data: { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean }) => {
    const session = getSession(socket.id);
    if (!session) return;

    console.log('[socket-handlers] mouse-up received:', data);

    // Only send mouse events if explicitly enabled (for ANSI editor, etc.)
    if (session.inDoorManager && session.doorInputHandler && session.mouseEventsEnabled) {
      console.log('[socket-handlers] Calling doorInputHandler with mouse up data');
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
      session.doorInputHandler(JSON.stringify({ type: 'mouse-hover', ...data }));
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

  socket.on('command', (data: string) => {
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
        socket.emit('ansi-output', '\b \b');
        return;
      }

      // Append printable characters
      (session as any).flagPauseBuffer += data;
      // Echo the character so the user sees input
      socket.emit('ansi-output', data);
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

    // If a door is active, call the door's input handler
    console.log('[socket-handlers] ===== COMMAND EVENT HANDLER =====');
    console.log('[socket-handlers] Received data:', JSON.stringify(data));
    console.log('[socket-handlers] inDoorManager:', session.inDoorManager);
    console.log('[socket-handlers] doorInputHandler type:', typeof session.doorInputHandler);
    console.log('[socket-handlers] doorInputHandler exists:', !!session.doorInputHandler);
    logDoorDebug(
      `CMD data=${JSON.stringify(data)} node=${session.nodeId} inDoor=${session.inDoorManager} subState=${session.subState} handler=${!!session.doorInputHandler}`
    );

    if (session.inDoorManager || session.subState === LoggedOnSubState.DOOR_RUNNING) {
      if (session.doorInputHandler) {
        if (markDoorInput(session, data)) {
          return;
        }
        console.log('[socket-handlers] ✓ Calling doorInputHandler (door is active)');
        logDoorDebug(`CMD->door handler dispatch`);
        session.doorInputHandler(data);
        return;
      } else {
        console.log('[socket-handlers] ⚠️ inDoorManager/DOOR_RUNNING but no doorInputHandler; sending raw to door:input anyway');
        logDoorDebug(`WARN missing handler while door active; emitting door:input fallback`);
        socket.emit('door:input', data);
        return;
      }
    }
    console.log('[socket-handlers] ✗ NOT in door or no handler - routing to BBS command handler');
    console.log('[socket-handlers]   inDoorManager:', session.inDoorManager);
    console.log('[socket-handlers]   handler exists:', !!session.doorInputHandler);

    // Preserve escape sequences (arrow keys, etc.) as single inputs for history/navigation
    if (data.startsWith('\x1b[') && data.length >= 2) {
      handleCommand(socket, session, data);
    } else {
      for (const char of data) {
        handleCommand(socket, session, char);
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
  socket.on('disconnect', async () => {
    console.log('Client disconnected');

    // End session log tracking
    sessionLogManager.endSession(socket.id);

    const session = getSession(socket.id);
    if (!session) return;

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

    // Log user logout if they were logged in (express.e:9493 callersLog)
    if (session.user) {
      await callersLog(session.user.id, session.user.username, 'Logged off');

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

      try {
        await runSamiLogUpdate(session);
      } catch (error) {
        console.error('[LOGOFF] SAmiLog update failed:', error);
        SysopDebugUtil.debug(
          socket,
          session,
          'Socket Connection',
          `Failed to update SAmiLog on logoff`,
          {
            error: error instanceof Error ? error.message : String(error),
            username: session.user?.username,
            nodeId: session.nodeId
          },
          DebugSeverity.WARNING
        );
      }
    }

    // Release node back to available pool
    await nodeManager.releaseSession(socket.id);

    // Clean up session storage
    // Import socketToUser and userSessions from session-manager
    const { socketToUser, userSessions } = require('./session-manager');

    // If user was logged in, remove socket-to-user mapping
    const userId = socketToUser.get(socket.id);
    if (userId) {
      console.log(`[DISCONNECT] Removing socket ${socket.id} mapping for user ${userId}`);
      socketToUser.delete(socket.id);

      // Check if user has any other sockets connected
      const userHasOtherSockets = Array.from(socketToUser.values()).includes(userId);
      if (!userHasOtherSockets && session?.user) {
        // This was the last socket for this user - clean up user session
        console.log(`[DISCONNECT] Last socket for user ${userId} - removing user session`);
        userSessions.delete(userId);
      } else if (userHasOtherSockets) {
        console.log(`[DISCONNECT] User ${userId} still has other sockets connected - keeping user session`);
      }
    } else {
      // Pre-login socket - just remove from socket-based storage
      deleteSession(socket.id);
    }

    triggerSamiLogRefresh();
  });
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
