/**
 * AmiExpress BBS Door API
 *
 * Main entry point for creating BBS doors. This class provides a high-level API
 * for handling user connections, rendering graphics, managing game state, and
 * integrating with all SDK components.
 *
 * @example
 * ```typescript
 * import { Door } from '@amiexpress/sdk';
 *
 * const door = new Door({
 *   name: 'My Awesome Game',
 *   version: '1.0.0',
 *   author: 'John Doe'
 * });
 *
 * door.onConnect(async (user) => {
 *   await door.graphics.clearScreen();
 *   door.send(`Welcome, ${user.name}!`);
 *   await gameLoop();
 * });
 *
 * door.start();
 * ```
 */

import { EventEmitter } from 'events';
import {
  BBSUser,
  DoorConfig,
  DoorEvent,
  EventHandler,
  KeyEvent,
  Position,
} from './types';

export class Door extends EventEmitter {
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

  /** Event handlers storage */
  private eventHandlers: Map<DoorEvent, EventHandler[]> = new Map();

  /**
   * Create a new BBS Door
   *
   * @param config - Door configuration
   *
   * @example
   * ```typescript
   * const door = new Door({
   *   name: 'Space Invaders',
   *   version: '1.0.0',
   *   author: 'RetroGamer',
   *   description: 'Classic arcade action!',
   *   minSecurity: 10,
   *   maxTime: 30
   * });
   * ```
   */
  constructor(config: DoorConfig) {
    super();
    this.config = {
      minSecurity: 0,
      maxTime: 0,
      multiplayer: false,
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

    // Set up default event handlers
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

    // Check if running in SDK_MODE (spawned by BBS backend)
    const isBBSMode = process.env.SDK_MODE === '1';

    if (isBBSMode) {
      // BBS Mode - Use IPC to communicate with parent process
      console.log('[Door SDK] Running in BBS mode - using IPC');

      // Listen for input messages from BBS
      process.on('message', (message: any) => {
        if (message.type === 'input') {
          const user = Array.from(this.users.values())[0];
          if (user) {
            this.emit('input', { user, key: message.key });
          }
        } else if (message.type === 'disconnect') {
          const user = Array.from(this.users.values())[0];
          if (user) {
            this.disconnect(user.id);
          }
          this.shutdown();
        }
      });

      // Send output via IPC
      this.on('output', (data: { user: BBSUser; text: string }) => {
        if (process.send) {
          process.send({
            type: 'output',
            text: data.text
          });
        }
      });

      // Parse user data from environment
      if (process.env.BBS_USER_DATA) {
        try {
          const userData = JSON.parse(process.env.BBS_USER_DATA);
          console.log('[Door SDK] Parsed BBS user data:', userData);

          // Store for auto-connect during start()
          (this as any).__bbsUserData = userData;
        } catch (err) {
          console.error('[Door SDK] Failed to parse BBS_USER_DATA:', err);
        }
      }

    }
  }

  /**
   * Start the door and begin accepting connections
   *
   * @example
   * ```typescript
   * door.start();
   * ```
   */
  public start(): void {
    if (this.state !== 'idle') {
      throw new Error('Door is already running');
    }

    this.state = 'running';
    this.emit('start');

    // Auto-connect user in BBS mode
    const isBBSMode = process.env.SDK_MODE === '1';

    if (isBBSMode && (this as any).__bbsUserData) {
      // BBS Mode - connect the user passed from backend
      const bbsUser: BBSUser = (this as any).__bbsUserData;
      console.log('[Door SDK] Auto-connecting BBS user:', bbsUser.name);

      setTimeout(() => {
        this.connect(bbsUser);
      }, 100);
    }

    // Start main loop
    this.mainLoop();
  }

  /**
   * Main game loop (runs at targetFPS)
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

      // Update
      this.emit('update', delta);

      // Render
      this.emit('render', this.frameCount);
    }

    // Schedule next frame
    // Use setTimeout instead of setImmediate to keep the process alive
    setTimeout(() => this.mainLoop(), 0);
  }

  /**
   * Handle new user connection
   *
   * @param user - Connected BBS user
   *
   * @example
   * ```typescript
   * door.onConnect(async (user) => {
   *   console.log(`${user.name} connected from node ${user.node}`);
   *
   *   if (user.securityLevel < 50) {
   *     door.send('Sorry, this door requires security level 50+');
   *     door.disconnect(user.id);
   *     return;
   *   }
   *
   *   await showWelcomeScreen(user);
   * });
   * ```
   */
  public onConnect(handler: (user: BBSUser) => void | Promise<void>): void {
    this.on('connect', handler);
  }

  /**
   * Connect a user to the door
   *
   * @param user - User to connect
   */
  public connect(user: BBSUser): void {
    // Check minimum security
    if (user.securityLevel < (this.config.minSecurity || 0)) {
      this.emit('connect:denied', user, 'insufficient_security');
      return;
    }

    // Add to connected users
    this.users.set(user.id, user);

    // Emit connect event
    this.emit('connect', user);
  }

  /**
   * Handle user disconnection
   *
   * @param handler - Disconnect handler
   *
   * @example
   * ```typescript
   * door.onDisconnect((user) => {
   *   console.log(`${user.name} disconnected`);
   *   savePlayerProgress(user);
   * });
   * ```
   */
  public onDisconnect(handler: (user: BBSUser) => void): void {
    this.on('disconnect', handler);
  }

  /**
   * Disconnect a user
   *
   * @param userId - User ID to disconnect
   */
  public disconnect(userId: number): void {
    const user = this.users.get(userId);
    if (!user) return;

    this.users.delete(userId);
    this.emit('disconnect', user);
  }

  /**
   * Handle keyboard input
   *
   * @param handler - Input handler
   *
   * @example
   * ```typescript
   * door.onInput((user, key) => {
   *   if (key.key === 'ArrowUp') {
   *     player.moveUp();
   *   } else if (key.key === 'Space') {
   *     player.shoot();
   *   } else if (key.key === 'q' || key.key === 'Q') {
   *     door.disconnect(user.id);
   *   }
   * });
   * ```
   */
  public onInput(handler: (user: BBSUser, key: KeyEvent) => void): void {
    this.on('input', (data: { user: BBSUser; key: KeyEvent }) => {
      handler(data.user, data.key);
    });
  }

  /**
   * Simulate keyboard input (for testing)
   *
   * @param userId - User ID
   * @param key - Key event
   */
  public sendInput(userId: number, key: KeyEvent): void {
    const user = this.users.get(userId);
    if (!user) return;

    this.emit('input', { user, key });
  }

  /**
   * Handle game updates (called every frame)
   *
   * @param handler - Update handler (receives delta time in ms)
   *
   * @example
   * ```typescript
   * door.onUpdate((delta) => {
   *   // Update physics
   *   physics.update(delta / 1000); // Convert to seconds
   *
   *   // Update AI
   *   enemies.forEach(enemy => enemy.update(delta));
   *
   *   // Check collisions
   *   checkPlayerCollisions();
   * });
   * ```
   */
  public onUpdate(handler: (delta: number) => void): void {
    this.on('update', handler);
  }

  /**
   * Handle rendering (called every frame after update)
   *
   * @param handler - Render handler (receives frame count)
   *
   * @example
   * ```typescript
   * door.onRender((frame) => {
   *   // Clear screen
   *   gfx.clearScreen();
   *
   *   // Draw background
   *   gfx.drawParallax();
   *
   *   // Draw game objects
   *   gfx.drawSprite(player);
   *   enemies.forEach(enemy => gfx.drawSprite(enemy));
   *
   *   // Draw HUD
   *   hud.render();
   * });
   * ```
   */
  public onRender(handler: (frame: number) => void): void {
    this.on('render', handler);
  }

  /**
   * Send text output to user(s)
   *
   * @param text - Text to send
   * @param userId - Specific user ID (omit to send to all users)
   *
   * @example
   * ```typescript
   * // Send to specific user
   * door.send('You found a treasure chest!', user.id);
   *
   * // Broadcast to all users
   * door.send('A new player has joined the game!');
   * ```
   */
  public send(text: string, userId?: number): void {
    if (userId !== undefined) {
      const user = this.users.get(userId);
      if (user) {
        this.emit('output', { user, text });
      }
    } else {
      // Send to all users
      this.users.forEach((user) => {
        this.emit('output', { user, text });
      });
    }
  }

  /**
   * Send ANSI formatted output
   *
   * @param ansi - ANSI string
   * @param userId - Specific user ID (omit to send to all)
   *
   * @example
   * ```typescript
   * door.sendAnsi('\x1b[2J\x1b[H'); // Clear screen
   * door.sendAnsi('\x1b[31mDanger!\x1b[0m'); // Red text
   * ```
   */
  public sendAnsi(ansi: string, userId?: number): void {
    this.send(ansi, userId);
  }

  /**
   * Move cursor to position
   *
   * @param x - Column (1-based)
   * @param y - Row (1-based)
   * @param userId - User ID
   *
   * @example
   * ```typescript
   * door.moveCursor(10, 5);
   * door.send('Text at column 10, row 5');
   * ```
   */
  public moveCursor(x: number, y: number, userId?: number): void {
    this.sendAnsi(`\x1b[${y};${x}H`, userId);
  }

  /**
   * Clear the screen
   *
   * @param userId - User ID
   *
   * @example
   * ```typescript
   * door.clearScreen();
   * ```
   */
  public clearScreen(userId?: number): void {
    this.sendAnsi('\x1b[2J\x1b[H', userId);
  }

  /**
   * Set foreground color
   *
   * @param color - ANSI color code (30-37 for standard, 90-97 for bright)
   * @param userId - User ID
   *
   * @example
   * ```typescript
   * door.setColor(31); // Red
   * door.send('This is red text');
   * door.setColor(0); // Reset
   * ```
   */
  public setColor(color: number, userId?: number): void {
    this.sendAnsi(`\x1b[${color}m`, userId);
  }

  /**
   * Get connected user by ID
   *
   * @param userId - User ID
   * @returns User or undefined
   */
  public getUser(userId: number): BBSUser | undefined {
    return this.users.get(userId);
  }

  /**
   * Get all connected users
   *
   * @returns Array of users
   */
  public getUsers(): BBSUser[] {
    return Array.from(this.users.values());
  }

  /**
   * Get user count
   *
   * @returns Number of connected users
   */
  public getUserCount(): number {
    return this.users.size;
  }

  /**
   * Set target FPS for game loop
   *
   * @param fps - Frames per second (default: 30)
   *
   * @example
   * ```typescript
   * door.setFPS(60); // 60 FPS for smooth animations
   * ```
   */
  public setFPS(fps: number): void {
    this.targetFPS = Math.max(1, Math.min(120, fps));
  }

  /**
   * Get current FPS
   *
   * @returns Current FPS
   */
  public getFPS(): number {
    return this.targetFPS;
  }

  /**
   * Get current frame count
   *
   * @returns Frame count since start
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
   *
   * @example
   * ```typescript
   * door.onDisconnect(() => {
   *   if (door.getUserCount() === 0) {
   *     door.shutdown();
   *   }
   * });
   * ```
   */
  public shutdown(): void {
    if (this.state === 'shutdown') return;

    this.state = 'shutdown';

    // Disconnect all users
    this.users.forEach((user) => {
      this.disconnect(user.id);
    });

    this.emit('shutdown');
    this.removeAllListeners();
  }

  /**
   * Wait for specified time (async helper)
   *
   * @param ms - Milliseconds to wait
   *
   * @example
   * ```typescript
   * await door.wait(1000); // Wait 1 second
   * door.send('One second has passed!');
   * ```
   */
  public async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for user input (async helper)
   *
   * @param userId - User ID
   * @param timeout - Timeout in ms (0 = no timeout)
   * @returns Key event or null if timeout
   *
   * @example
   * ```typescript
   * door.send('Press any key to continue...');
   * const key = await door.waitForInput(user.id, 10000);
   * if (key) {
   *   door.send(`You pressed: ${key.key}`);
   * } else {
   *   door.send('Timeout!');
   * }
   * ```
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
   *
   * @param prompt - Prompt text
   * @param userId - User ID
   * @param timeout - Timeout in ms
   * @returns User's input or empty string
   *
   * @example
   * ```typescript
   * const name = await door.prompt('Enter your character name: ', user.id);
   * door.send(`Welcome, ${name}!`);
   * ```
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
          this.sendAnsi('\x1b[1D \x1b[1D', userId); // Move back, space, move back
        }
      } else if (key.key.length === 1) {
        input += key.key;
        this.send(key.key, userId); // Echo character
      }
    }

    this.send('\r\n', userId);
    return input;
  }
}

/**
 * Export main Door class
 */
export default Door;
