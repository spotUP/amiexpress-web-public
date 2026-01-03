/**
 * AmiExpress SDK - Server Runtime (Node.js)
 * For doors that need filesystem, database, networking, etc.
 */

import { EventEmitter } from 'events';
import {
  BBSUser,
  DoorConfig,
  DoorEvent,
  EventHandler,
  KeyEvent,
  AnsiColor,
  AnsiBgColor,
} from '../common';

export class ServerDoor extends EventEmitter {
  /** Door configuration */
  public readonly config: DoorConfig;

  /** Currently connected user(s) */
  private users: Map<number, BBSUser> = new Map();

  /** Door state */
  private state: 'idle' | 'running' | 'shutdown' = 'idle';

  /** Frame counter for animations */
  private frameCount: number = 0;

  /** Last frame timestamp */
  private lastFrameTime: number = 0;

  /** Target FPS (frames per second) */
  private targetFPS: number = 30;

  /** RPC handlers (for hybrid doors) */
  private rpcHandlers: Map<string, (params: any) => Promise<any>> = new Map();

  /**
   * Create a new Server-side BBS Door
   *
   * @param config - Door configuration
   *
   * @example
   * ```typescript
   * const door = new ServerDoor({
   *   name: 'File Manager',
   *   version: '1.0.0',
   *   author: 'Admin',
   *   description: 'BBS file management system'
   * });
   * ```
   */
  constructor(config: DoorConfig) {
    super();
    this.config = {
      minSecurity: 0,
      maxTime: 0,
      multiplayer: false,
      runtime: 'server',
      ...config,
    };
    this.initialize();
  }

  /**
   * Initialize door systems
   * @private
   */
  private initialize(): void {
    this.emit('init', this.config);
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

        this.emit('input', { user, key });
      });

      // Send output to stdout
      this.on('output', (data: { user: BBSUser; text: string }) => {
        process.stdout.write(data.text);
      });
    }
  }

  /**
   * Start the door and begin accepting connections
   */
  public start(): void {
    // Reset state if door was left in running state from a previous crash/disconnect
    // ESM modules are cached, so the same ServerDoor instance may be reused across sessions
    if (this.state !== 'idle' && this.state !== 'shutdown') {
      console.warn('[ServerDoor] Door was in running state from previous session - resetting');
      this.state = 'idle';
      this.frameCount = 0;
      this.lastFrameTime = 0;
      this.users.clear();
    }

    this.state = 'running';
    this.emit('start');

    // In preview mode, auto-connect test user
    if (process.env.PREVIEW_MODE === '1') {
      const testUser: BBSUser = {
        id: 1,
        name: 'Preview User',
        node: 1,
        securityLevel: 255,
        timeLeft: 9999,
        graphicsMode: 'ANSI',
        termWidth: 80,
        termHeight: 24,
        data: {},
      };

      setTimeout(() => this.connect(testUser), 100);
    }

    // Start main loop
    this.mainLoop();
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

    setTimeout(() => this.mainLoop(), 0);
  }

  /**
   * Handle new user connection
   */
  public onConnect(handler: (user: BBSUser) => void | Promise<void>): void {
    this.on('connect', handler);
  }

  /**
   * Connect a user to the door
   */
  public connect(user: BBSUser): void {
    if (user.securityLevel < (this.config.minSecurity || 0)) {
      this.emit('connect:denied', user, 'insufficient_security');
      return;
    }

    this.users.set(user.id, user);
    this.emit('connect', user);
  }

  /**
   * Handle user disconnection
   */
  public onDisconnect(handler: (user: BBSUser) => void): void {
    this.on('disconnect', handler);
  }

  /**
   * Disconnect a user
   */
  public disconnect(userId: number): void {
    const user = this.users.get(userId);
    if (!user) return;

    this.users.delete(userId);
    this.emit('disconnect', user);
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
   * Simulate keyboard input (for testing)
   */
  public sendInput(userId: number, key: KeyEvent): void {
    const user = this.users.get(userId);
    if (!user) return;
    this.emit('input', { user, key });
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
   * Send text output to user(s)
   */
  public send(text: string, userId?: number): void {
    if (userId !== undefined) {
      const user = this.users.get(userId);
      if (user) {
        this.emit('output', { user, text });
      }
    } else {
      this.users.forEach((user) => {
        this.emit('output', { user, text });
      });
    }
  }

  /**
   * Send ANSI formatted output
   */
  public sendAnsi(ansi: string, userId?: number): void {
    this.send(ansi, userId);
  }

  /**
   * Move cursor to position
   */
  public moveCursor(x: number, y: number, userId?: number): void {
    this.sendAnsi(`\x1b[${y};${x}H`, userId);
  }

  /**
   * Clear the screen
   */
  public clearScreen(userId?: number): void {
    this.sendAnsi('\x1b[2J\x1b[H', userId);
  }

  /**
   * Set foreground color
   */
  public setColor(color: number, userId?: number): void {
    this.sendAnsi(`\x1b[${color}m`, userId);
  }

  /**
   * Get connected user by ID
   */
  public getUser(userId: number): BBSUser | undefined {
    return this.users.get(userId);
  }

  /**
   * Get all connected users
   */
  public getUsers(): BBSUser[] {
    return Array.from(this.users.values());
  }

  /**
   * Get user count
   */
  public getUserCount(): number {
    return this.users.size;
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
   * Shutdown the door gracefully
   */
  public shutdown(): void {
    if (this.state === 'shutdown') return;

    this.state = 'shutdown';

    this.users.forEach((user) => {
      this.disconnect(user.id);
    });

    this.emit('shutdown');
    this.removeAllListeners();

    // Exit process
    process.exit(0);
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
  public async waitForInput(
    userId: number,
    timeout: number = 0
  ): Promise<KeyEvent | null> {
    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;

      const handler = (data: { user: BBSUser; key: KeyEvent }) => {
        if (data.user.id === userId) {
          if (timeoutId) clearTimeout(timeoutId);
          this.off('input', handler);
          resolve(data.key);
        }
      };

      this.on('input', handler);

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.off('input', handler);
          resolve(null);
        }, timeout);
      }
    });
  }

  /**
   * Prompt user for input
   */
  public async prompt(
    prompt: string,
    userId: number,
    timeout: number = 0
  ): Promise<string> {
    this.send(prompt, userId);

    let input = '';
    let done = false;
    const startTime = Date.now();

    while (!done) {
      const key = await this.waitForInput(
        userId,
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
          this.sendAnsi('\x1b[1D \x1b[1D', userId);
        }
      } else if (key.key.length === 1) {
        input += key.key;
        this.send(key.key, userId);
      }
    }

    this.send('\r\n', userId);
    return input;
  }

  /**
   * Register RPC handler (for hybrid doors)
   *
   * @param method - RPC method name
   * @param handler - Handler function
   *
   * @example
   * ```typescript
   * door.onRPC('saveSong', async (params) => {
   *   await fs.promises.writeFile(params.filename, params.data);
   *   return { success: true };
   * });
   * ```
   */
  public onRPC(
    method: string,
    handler: (params: any) => Promise<any>
  ): void {
    this.rpcHandlers.set(method, handler);
  }

  /**
   * Handle RPC call (internal use by BBS bridge)
   * @private
   */
  public async handleRPC(method: string, params: any): Promise<any> {
    const handler = this.rpcHandlers.get(method);
    if (!handler) {
      throw new Error(`Unknown RPC method: ${method}`);
    }
    return await handler(params);
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
