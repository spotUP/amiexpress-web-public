/**
 * AmiExpress SDK - Client Runtime (Browser)
 * For doors that need Web APIs (Audio, Canvas, WebGL, etc.)
 */

import { EventEmitter } from './event-emitter';
import {
  BBSUser,
  DoorConfig,
  KeyEvent,
  AnsiColor,
  AnsiBgColor,
  WebSocketMessage,
  OutputMessage,
  InputMessage,
  RPCRequestMessage,
  RPCResponseMessage,
} from '../common';
import { MessageType, ProtocolHelper } from '../common/protocol';

export class ClientDoor extends EventEmitter {
  /** Door configuration */
  public readonly config: DoorConfig;

  /** Currently connected user */
  private user: BBSUser | null = null;

  /** Door state */
  private state: 'idle' | 'connecting' | 'running' | 'shutdown' = 'idle';

  /** Frame counter for animations */
  private frameCount: number = 0;

  /** Last frame timestamp */
  private lastFrameTime: number = 0;

  /** Target FPS (frames per second) */
  private targetFPS: number = 30;

  /** RPC request tracking */
  private rpcRequests: Map<
    string,
    { resolve: (value: any) => void; reject: (reason: any) => void }
  > = new Map();

  /** Next RPC request ID */
  private nextRpcId: number = 1;

  /**
   * Create a new Client-side BBS Door (runs in browser)
   *
   * @param config - Door configuration
   *
   * @example
   * ```typescript
   * const door = new ClientDoor({
   *   name: 'Music Tracker',
   *   version: '1.0.0',
   *   author: 'Demo Scene',
   *   description: 'Professional music tracker'
   * });
   * ```
   */
  constructor(config: DoorConfig) {
    super();
    this.config = {
      minSecurity: 0,
      maxTime: 0,
      multiplayer: false,
      runtime: 'client',
      ...config,
    };
    this.initialize();
  }

  /**
   * Events that should be automatically forwarded to the server via Socket.IO
   * when emitted by client code.
   */
  private static readonly SERVER_FORWARD_EVENTS = new Set([
    // Audio level and status events
    'audio:levels',
    'audio:started',
    'audio:stopped',
    'audio:error',
    // Audio data streaming
    'audio:chunk',
    'audio:data',
    // Voice activity detection
    'voice:speaking',
    'voice:level',
    // Video streaming events
    'video:started',
    'video:stopped',
    'video:error',
    'video:frame',
  ]);

  /**
   * Override emit to auto-forward certain events to the server via Socket.IO.
   * This allows client code to use `door.emit('audio:levels', data)` and have
   * it automatically sent to the server without requiring a separate method.
   */
  public emit(event: string, ...args: any[]): boolean {
    // Forward to server if this is a server-bound event
    if (ClientDoor.SERVER_FORWARD_EVENTS.has(event)) {
      const socketIO = (this as any).socketIO;
      if (socketIO && typeof socketIO.emit === 'function') {
        socketIO.emit(event, args[0]); // Send first arg as data
      }
    }
    // Also emit locally for any local listeners
    return super.emit(event, ...args);
  }

  /**
   * Initialize door systems
   * @private
   */
  private initialize(): void {
    this.emit('init', this.config);

    // Listen for browser events
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.shutdown());
    }
  }

  /**
   * Start the door and connect to BBS via the existing Socket.IO connection.
   * window.__BBS__ must be set by the frontend before this is called.
   */
  public start(): void {
    // Reset state if door was left in running state from a previous crash/disconnect
    // ESM modules are cached, so the same ClientDoor instance may be reused across sessions
    if (this.state !== 'idle' && this.state !== 'shutdown') {
      console.warn('[ClientDoor] Door was in running state from previous session - resetting');
      this.state = 'idle';
      this.frameCount = 0;
      this.lastFrameTime = 0;
      this.user = null;
      this.rpcRequests.clear();
    }

    this.state = 'connecting';
    this.emit('start');

    if (typeof window !== 'undefined') {
      const bbsGlobal = (window as any).__BBS__;
      if (bbsGlobal && bbsGlobal.socket) {
        console.log('[ClientDoor] Using existing BBS Socket.IO connection');
        this.connectViaSocketIO(bbsGlobal.socket, bbsGlobal.sessionId);
        return;
      }
    }

    // No BBS connection available — fail loudly rather than probing localhost.
    console.error('[ClientDoor] window.__BBS__ not set; cannot start door.');
    this.state = 'idle';
    this.emit('error', new Error('BBS connection unavailable'));
  }

  /**
   * Connect via existing Socket.IO connection (bundled door scenario)
   * @private
   */
  private connectViaSocketIO(socket: any, sessionId: string): void {
    try {
      // Store Socket.IO socket in ws field (type mismatch is ok, we handle it)
      (this as any).socketIO = socket;
      (this as any).sessionId = sessionId;

      console.log(`[ClientDoor] Connected via Socket.IO, session: ${sessionId}`);
      this.state = 'running';
      this.emit('ws:connected');

      // Listen for messages from backend for this session
      if (typeof window !== 'undefined') {
        window.addEventListener('bbs:door:message', (event: any) => {
          if (event.detail.sessionId === sessionId) {
            this.handleMessage(event.detail.message);
          }
        });
      }

      // Listen for custom door events on the Socket.IO socket (audio, etc.)
      // These are emitted directly by hybrid door servers
      if (socket && typeof socket.on === 'function') {
        // Audio playback events from hybrid doors
        socket.on('audio:play', (data: any) => {
          console.log('[ClientDoor] Received audio:play event:', data);
          this.emit('audio:play', data);
        });
        socket.on('audio:set-enabled', (data: any) => {
          this.emit('audio:set-enabled', data);
        });
        socket.on('audio:set-volume', (data: any) => {
          this.emit('audio:set-volume', data);
        });
        // Audio streaming events for mic demos/voice chat
        socket.on('audio:start-streaming', (data: any) => {
          console.log('[ClientDoor] Received audio:start-streaming event:', data);
          this.emit('audio:start-streaming', data);
        });
        socket.on('audio:stop-streaming', (data: any) => {
          console.log('[ClientDoor] Received audio:stop-streaming event:', data);
          this.emit('audio:stop-streaming', data);
        });
        socket.on('audio:mute', (data: any) => {
          this.emit('audio:mute', data);
        });
        // Video streaming events for webcam in voice chat
        socket.on('video:start-stream', (data: any) => {
          console.log('[ClientDoor] Received video:start-stream event:', data);
          this.emit('video:start-stream', data);
        });
        socket.on('video:stop-stream', (data: any) => {
          console.log('[ClientDoor] Received video:stop-stream event:', data);
          this.emit('video:stop-stream', data);
        });
        socket.on('video:frame', (data: any) => {
          this.emit('video:frame', data);
        });
        // Audio data from other users (for voice chat playback)
        socket.on('audio:data', (data: any) => {
          this.emit('audio:data', data);
        });
        // Voice speaking state from peers (server -> client browser)
        socket.on('voice:speaking', (data: any) => {
          this.emit('voice:speaking', data);
        });
      }

      // Simulate connection established
      // The backend already sent CONNECT message, trigger main loop
      this.mainLoop();

    } catch (err) {
      console.error('[ClientDoor] Failed to connect via Socket.IO:', err);
      this.state = 'idle';
      throw err;
    }
  }

  /**
   * Handle incoming WebSocket message
   * @private
   */
  private handleMessage(message: WebSocketMessage): void {
    console.log('[ClientDoor] Received message:', message.type, message);
    switch (message.type) {
      case MessageType.CONNECT:
        // Server sent user info
        this.user = message.user;
        this.emit('connect', this.user);
        // Start main loop
        this.mainLoop();
        break;

      case MessageType.INPUT:
        // Server forwarded keyboard input
        // One INPUT arrives per pointer sample in a mouse game (60+/s);
        // logging each was five console lines per hover. Opt in with
        // window.__DOOR_INPUT_DEBUG__ when tracing input plumbing.
        if ((globalThis as any).__DOOR_INPUT_DEBUG__) {
          console.log('[ClientDoor] INPUT:', JSON.stringify(message.data));
        }
        if (this.user) {
          this.emit('input', { user: this.user, key: message.data });
        } else {
          console.warn('[ClientDoor] No user set, ignoring input');
        }
        break;

      case MessageType.RPC_RESPONSE:
        // RPC response received
        this.handleRPCResponse(message);
        break;

      case MessageType.RPC_ERROR:
        // RPC error received
        this.handleRPCError(message);
        break;

      case MessageType.DISCONNECT:
        // Server disconnected us
        this.shutdown();
        break;

      case MessageType.PING:
        // Server keepalive
        this.sendMessage({ type: MessageType.PONG, timestamp: Date.now() });
        break;

      default:
        console.warn('Unknown message type:', message);
    }
  }

  /**
   * Handle RPC response
   * @private
   */
  private handleRPCResponse(message: RPCResponseMessage): void {
    const pending = this.rpcRequests.get(message.id);
    if (pending) {
      pending.resolve(message.result);
      this.rpcRequests.delete(message.id);
    }
  }

  /**
   * Handle RPC error
   * @private
   */
  private handleRPCError(message: any): void {
    const pending = this.rpcRequests.get(message.id);
    if (pending) {
      pending.reject(new Error(message.error.message));
      this.rpcRequests.delete(message.id);
    }
  }

  /**
   * Send message to BBS
   * @private
   */
  private sendMessage(message: any): void {
    // Check if we're using Socket.IO (bundled door scenario)
    const socketIO = (this as any).socketIO;
    const sessionId = (this as any).sessionId;

    if (socketIO && sessionId) {
      // Emit via Socket.IO with session-specific event
      socketIO.emit('door:client:message', {
        sessionId,
        message,
      });
    }
  }

  /**
   * Main game loop
   * @private
   */
  private mainLoop(): void {
    if (this.state !== 'running') return;

    const now = Date.now();
    const delta = now - this.lastFrameTime;
    const targetDelta = 1000 / this.targetFPS;

    if (delta >= targetDelta) {
      this.frameCount++;
      this.lastFrameTime = now;

      this.emit('update', delta);
      this.emit('render', this.frameCount);
    }

    // Use requestAnimationFrame in browser, setTimeout in Node.js
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.mainLoop());
    } else {
      setTimeout(() => this.mainLoop(), targetDelta);
    }
  }

  /**
   * Handle new user connection
   */
  public onConnect(handler: (user: BBSUser) => void | Promise<void>): void {
    this.on('connect', handler);
  }

  /**
   * Handle user disconnection
   */
  public onDisconnect(handler: (user: BBSUser) => void): void {
    this.on('disconnect', handler);
  }

  /**
   * Handle keyboard input
   */
  public onInput(handler: (user: BBSUser, key: KeyEvent) => void): void {
    this.on('input', (data: { user: BBSUser; key: KeyEvent }) => {
      handler(data.user, data.key);
    });
  }

  /**
   * Handle game updates (called every frame)
   */
  public onUpdate(handler: (delta: number) => void): void {
    this.on('update', handler);
  }

  /**
   * Handle rendering (called every frame after update)
   */
  public onRender(handler: (frame: number) => void): void {
    this.on('render', handler);
  }

  /**
   * Send text output to BBS
   */
  public send(text: string): void {
    if (!this.user) return;
    const message = ProtocolHelper.createOutputMessage(text);
    this.sendMessage(message);
  }

  /**
   * Send ANSI formatted output
   */
  public sendAnsi(ansi: string): void {
    this.send(ansi);
  }

  /**
   * Move cursor to position
   */
  public moveCursor(x: number, y: number): void {
    this.sendAnsi(`\x1b[${y};${x}H`);
  }

  /**
   * Clear the screen
   */
  public clearScreen(): void {
    this.sendAnsi('\x1b[2J\x1b[H');
  }

  /**
   * Set foreground color
   */
  public setColor(color: number): void {
    this.sendAnsi(`\x1b[${color}m`);
  }

  /**
   * Show or hide the text cursor
   * Use this for games where you don't want the blinking cursor visible
   *
   * @param visible - true to show cursor, false to hide
   *
   * @example
   * ```typescript
   * // Hide cursor during gameplay
   * door.setCursorVisible(false);
   *
   * // Show cursor again when returning to menu
   * door.setCursorVisible(true);
   * ```
   */
  public setCursorVisible(visible: boolean): void {
    this.sendAnsi(visible ? '\x1b[?25h' : '\x1b[?25l');
  }

  /**
   * Hide the text cursor (convenience method)
   */
  public hideCursor(): void {
    this.setCursorVisible(false);
  }

  /**
   * Show the text cursor (convenience method)
   */
  public showCursor(): void {
    this.setCursorVisible(true);
  }

  /**
   * Get connected user
   */
  public getUser(): BBSUser | null {
    return this.user;
  }

  /**
   * Set target FPS for game loop
   */
  public setFPS(fps: number): void {
    this.targetFPS = Math.max(1, Math.min(120, fps));
  }

  /**
   * Get current FPS
   */
  public getFPS(): number {
    return this.targetFPS;
  }

  /**
   * Get current frame count
   */
  public getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Pause the door (stop game loop)
   */
  public pause(): void {
    this.state = 'idle';
    this.emit('pause');
  }

  /**
   * Resume the door (restart game loop)
   */
  public resume(): void {
    if (this.state === 'idle') {
      this.state = 'running';
      this.emit('resume');
      this.mainLoop();
    }
  }

  /**
   * Emit an event to the server via Socket.IO (for hybrid doors)
   * Use this to send custom events back to the server-side door code.
   *
   * @param event - Event name (e.g., 'audio:levels', 'audio:started')
   * @param data - Event data to send
   *
   * @example
   * ```typescript
   * // Send audio levels from browser to server
   * door.emitToServer('audio:levels', { input: 0.5, output: 0.3 });
   *
   * // Notify server that streaming started
   * door.emitToServer('audio:started');
   * ```
   */
  public emitToServer(event: string, data?: any): void {
    const socketIO = (this as any).socketIO;
    if (socketIO && typeof socketIO.emit === 'function') {
      socketIO.emit(event, data);
    } else {
      console.warn('[ClientDoor] Cannot emit to server - no Socket.IO connection');
    }
  }

  /**
   * Shutdown the door gracefully
   */
  public shutdown(): void {
    if (this.state === 'shutdown') return;

    this.state = 'shutdown';

    // Send DISCONNECT message to backend to properly close the session
    this.sendMessage({ type: MessageType.DISCONNECT, timestamp: Date.now() });

    if (this.user) {
      this.emit('disconnect', this.user);
    }

    this.emit('shutdown');
    this.removeAllListeners();
  }

  /**
   * Wait for specified time (async helper)
   */
  public async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for user input (async helper)
   */
  public async waitForInput(timeout: number = 0): Promise<KeyEvent | null> {
    if (!this.user) return null;

    return new Promise((resolve) => {
      let timeoutId: number | null = null;

      const handler = (data: { user: BBSUser; key: KeyEvent }) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.off('input', handler);
        resolve(data.key);
      };

      this.on('input', handler);

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.off('input', handler);
          resolve(null);
        }, timeout) as any;
      }
    });
  }

  /**
   * Prompt user for input
   */
  public async prompt(prompt: string, timeout: number = 0): Promise<string> {
    this.send(prompt);

    let input = '';
    let done = false;
    const startTime = Date.now();

    while (!done) {
      const key = await this.waitForInput(
        timeout > 0 ? timeout - (Date.now() - startTime) : 0
      );

      if (!key) {
        done = true;
        break;
      }

      if (key.key === 'Enter' || key.key === '\r' || key.key === '\n') {
        done = true;
      } else if (key.key === 'Backspace') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          this.sendAnsi('\x1b[1D \x1b[1D');
        }
      } else if (key.key.length === 1) {
        input += key.key;
        this.send(key.key);
      }
    }

    this.send('\r\n');
    return input;
  }

  /**
   * Call RPC method on server (for hybrid doors)
   *
   * @param method - RPC method name
   * @param params - Method parameters
   * @returns Promise with result
   *
   * @example
   * ```typescript
   * const result = await door.rpc('saveSong', {
   *   filename: 'mysong.json',
   *   data: songData
   * });
   * console.log('Saved:', result.filename);
   * ```
   */
  public async rpc(method: string, params: any = {}): Promise<any> {
    if (!this.config.hybrid) {
      throw new Error('RPC is only available for hybrid doors');
    }

    const id = `rpc-${this.nextRpcId++}`;
    const message = ProtocolHelper.createRPCRequest(id, method, params);

    return new Promise((resolve, reject) => {
      this.rpcRequests.set(id, { resolve, reject });

      this.sendMessage(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.rpcRequests.has(id)) {
          this.rpcRequests.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 30000);
    });
  }
}

/**
 * Export types
 */
export type { BBSUser, DoorConfig, KeyEvent, AnsiBgColor } from '../common';
export type { AnsiColor } from '../core/types';

/**
 * Export ANSI string utilities
 */
export {
  stripAnsi,
  visibleLength,
  padEndVisible,
  padStartVisible,
  centerVisible,
  getCenterX,
  truncateVisible,
  substringVisible,
  measureWidth,
  formatInBox,
} from '../core/ansi-string-utils';

/**
 * Export Door as alias for ClientDoor (for backwards compatibility)
 */
export { ClientDoor as Door };

/**
 * Export the cell-diffing back buffer for doors that repaint continuously.
 * Emitting only changed cells is what keeps a 30 fps door from flooding the
 * BBS round trip - see screen-buffer.ts for the measurements behind it.
 */
export { ScreenBuffer, type ScreenBufferOptions } from './screen-buffer';

/**
 * Export UIEngine for client doors
 */
export { UIEngine } from '../engines/ui/ui-engine';

/**
 * Export engines for client doors
 */
export { GraphicsEngine } from '../engines/graphics/graphics-engine';
export { PhysicsEngine } from '../engines/physics/physics-engine';
export { AudioEngine } from '../engines/audio/audio-engine';
export { TrackerEngine, InterpolationFilter, PlaybackState } from '../engines/audio/tracker-engine';
export type { TrackerConfig, ModuleMetadata, PlaybackPosition, TrackerFormat } from '../engines/audio/tracker-engine';
export { VoiceCapture, type VoiceCaptureOptions } from '../media/VoiceCapture';
export { NetworkEngine } from '../engines/network/network-engine';
export { AIEngine } from '../engines/ai/ai-engine';
export { InputEngine } from '../engines/input/input-engine';
export { KeyStateTracker } from '../engines/input/key-state-tracker';
export { TacticalCombatEngine } from '../engines/tactical/tactical-combat-engine';

/**
 * Export components for client doors
 */
export { MenuSystem } from '../components/menus/menu-system';
export { HUDBuilder } from '../components/hud/hud-builder';
export { LevelManager } from '../components/level/level-manager';
// SaveManager uses Node.js filesystem APIs; keep it server-only.
export { InventorySystem } from '../components/inventory/inventory-system';
export { DialogueSystem } from '../components/dialogue/dialogue-system';
export { QuestSystem } from '../components/quest/quest-system';
export { ClassSystem } from '../components/tactical/class-system';

/**
 * Export default
 */
export default ClientDoor;
