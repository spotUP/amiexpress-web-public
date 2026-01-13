/**
 * AmiExpress SDK - Server Runtime (Node.js)
 * For doors that need filesystem, database, networking, etc.
 */

import { EventEmitter } from 'events';
import { Door as CoreDoor } from '../src/core/Door';
import {
  BBSUser,
  DoorConfig,
  DoorEvent,
  EventHandler,
  KeyEvent,
  AnsiColor,
  AnsiBgColor,
} from '../common';

export class ServerDoor extends CoreDoor {
  /** Currently connected user(s) */
  private users: Map<number, BBSUser> = new Map();

  /** Door execution state */
  private doorState: 'idle' | 'running' | 'shutdown' = 'idle';

  /** Frame counter for animations */
  private frameCount: number = 0;

  /** Last frame timestamp */
  private lastFrameTime: number = 0;

  /** Target FPS (frames per second) */
  private targetFPS: number = 30;

  /** RPC handlers (for hybrid doors) */
  private rpcHandlers: Map<string, (params: any) => Promise<any>> = new Map();

  /** Event emitter for legacy events */
  private events = new EventEmitter();

  /**
   * Create a new Server-side BBS Door
   *
   * @param config - Door configuration
   */
  constructor(config: DoorConfig) {
    super(config as any);
    this.initialize();
  }

  /**
   * Initialize door systems
   * @private
   */
  private initialize(): void {
    this.events.emit('init', this.config);
    this.setupDefaultHandlers();
  }

  /**
   * Set up default event handlers
   * @private
   */
  private setupDefaultHandlers(): void {
    // Handle shutdown gracefully
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    // In preview mode, set up stdin for keyboard input
    if (process.env.PREVIEW_MODE === '1') {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (data: string) => {
        const user = Array.from(this.users.values())[0];
        if (!user) return;

        const key: KeyEvent = {
          key: data,
          ctrl: data.charCodeAt(0) < 32,
          alt: false,
          shift: false,
          code: data.charCodeAt(0),
        };

        // Handle special keys
        if (data === '\u001b[A') key.key = 'ArrowUp';
        else if (data === '\u001b[B') key.key = 'ArrowDown';
        else if (data === '\u001b[C') key.key = 'ArrowRight';
        else if (data === '\u001b[D') key.key = 'ArrowLeft';
        else if (data === '\r' || data === '\n') key.key = 'Enter';
        else if (data === '\u001b') key.key = 'Escape';
        else if (data === '\u007f' || data === '\b') key.key = 'Backspace';

        this.events.emit('input', { user, key });
      });

      // Send output to stdout
      this.events.on('output', (data: { user: BBSUser; text: string }) => {
        process.stdout.write(data.text);
      });
    }
  }

  /**
   * Start the door (backward compatibility)
   */
  public start(): void {
    if (this.doorState !== 'idle' && this.doorState !== 'shutdown') {
      this.doorState = 'idle';
      this.frameCount = 0;
      this.lastFrameTime = 0;
      this.users.clear();
    }

    this.doorState = 'running';
    this.events.emit('start');

    // Start main loop
    this.mainLoop();
  }

  /**
   * Main game loop
   * @private
   */
  private mainLoop(): void {
    if (this.doorState !== 'running') return;

    const now = Date.now();
    const delta = now - this.lastFrameTime;
    const targetDelta = 1000 / this.targetFPS;

    if (delta >= targetDelta) {
      this.frameCount++;
      this.lastFrameTime = now;

      this.events.emit('update', delta);
      this.events.emit('render', this.frameCount);
    }

    setTimeout(() => this.mainLoop(), 0);
  }

  /**
   * Handle new user connection
   */
  public onConnect(handler: (user: BBSUser) => void | Promise<void>): this {
    this.events.on('connect', handler);
    return this;
  }

  /**
   * Connect a user to the door
   */
  public connect(user: BBSUser): void {
    const minSecurity = (this.config as any).minSecurity || 0;
    if (user.securityLevel < minSecurity) {
      this.events.emit('connect:denied', user, 'insufficient_security');
      return;
    }

    this.users.set(user.id, user);
    this.events.emit('connect', user);
  }

  /**
   * Handle user disconnection
   */
  public onDisconnect(handler: (user: BBSUser) => void): this {
    this.events.on('disconnect', handler);
    return this;
  }

  /**
   * Disconnect a user
   */
  public disconnect(userId: number): void {
    const user = this.users.get(userId);
    if (!user) return;

    this.users.delete(userId);
    this.events.emit('disconnect', user);
  }

  /**
   * Handle keyboard input (legacy style)
   */
  public onInputLegacy(handler: (user: BBSUser, key: KeyEvent) => void): this {
    this.events.on('input', (data: { user: BBSUser; key: KeyEvent }) => {
      handler(data.user, data.key);
    });
    return this;
  }

  /**
   * Simulate keyboard input (for testing)
   */
  public sendInput(userId: number, key: KeyEvent): void {
    const user = this.users.get(userId);
    if (!user) return;
    this.events.emit('input', { user, key });
  }

  /**
   * Handle game updates (called every frame)
   */
  public onUpdate(handler: (delta: number) => void): this {
    this.events.on('update', handler);
    return this;
  }

  /**
   * Handle rendering (called every frame after update)
   */
  public onRender(handler: (frame: number) => void): this {
    this.events.on('render', handler);
    return this;
  }

  /**
   * Pause the door (stop game loop)
   */
  public pause(): void {
    this.doorState = 'idle';
    this.events.emit('pause');
  }

  /**
   * Resume the door (restart game loop)
   */
  public resume(): void {
    if (this.doorState === 'idle') {
      this.doorState = 'running';
      this.events.emit('resume');
      this.mainLoop();
    }
  }

  /**
   * Send text output to user(s)
   */
  public send(text: string, userId?: number): void {
    if (userId !== undefined) {
      const user = this.users.get(userId);
      if (user) {
        this.events.emit('output', { user, text });
      }
    } else {
      this.users.forEach((user) => {
        this.events.emit('output', { user, text });
      });
    }
  }

  /**
   * Shutdown the door gracefully
   */
  public shutdown(): void {
    if (this.doorState === 'shutdown') return;
    this.doorState = 'shutdown';
    this.users.forEach((user) => {
      this.disconnect(user.id);
    });
    this.events.emit('shutdown');
    this.events.removeAllListeners();
    process.exit(0);
  }

  // Helper for EventEmitter bridge
  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.events.on(event, listener);
    return this;
  }

  public emit(event: string | symbol, ...args: any[]): boolean {
    return this.events.emit(event, ...args);
  }
}

/**
 * Export types
 */
export { BBSUser, DoorConfig, KeyEvent, AnsiBgColor } from '../common';
export { AnsiColor } from '../core/types';

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
 * Export engines for server doors
 */
export { GraphicsEngine } from '../engines/graphics/graphics-engine';
export { PhysicsEngine } from '../engines/physics/physics-engine';
export { AudioEngine } from '../engines/audio/audio-engine';
export { NetworkEngine } from '../engines/network/network-engine';
export { AIEngine } from '../engines/ai/ai-engine';
export { InputEngine } from '../engines/input/input-engine';
export { TacticalCombatEngine } from '../engines/tactical/tactical-combat-engine';
export { UIEngine } from '../engines/ui/ui-engine';

/**
 * Export components for server doors
 */
export { MenuSystem } from '../components/menus/menu-system';
export { HUDBuilder } from '../components/hud/hud-builder';
export { LevelManager } from '../components/level/level-manager';
export { SaveManager } from '../components/save/save-manager';
export { InventorySystem } from '../components/inventory/inventory-system';
export { DialogueSystem } from '../components/dialogue/dialogue-system';
export { QuestSystem } from '../components/quest/quest-system';
export { ClassSystem } from '../components/tactical/class-system';

/**
 * Export Door as alias for ServerDoor (for backwards compatibility)
 */
export { ServerDoor as Door };

/**
 * Export default
 */
export default ServerDoor;
