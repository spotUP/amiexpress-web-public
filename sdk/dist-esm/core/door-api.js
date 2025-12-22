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
export class Door extends EventEmitter {
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
    constructor(config) {
        super();
        /** Currently connected user(s) */
        this.users = new Map();
        /** Door state */
        this.state = 'idle';
        /** Frame counter for animations */
        this.frameCount = 0;
        /** Last frame timestamp */
        this.lastFrameTime = 0;
        /** Target FPS (frames per second) */
        this.targetFPS = 30;
        /** Event handlers storage */
        this.eventHandlers = new Map();
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
    initialize() {
        this.emit('init', this.config);
        // Set up default event handlers
        this.setupDefaultHandlers();
    }
    /**
     * Set up default event handlers
     * @private
     */
    setupDefaultHandlers() {
        // Handle shutdown gracefully
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        // Check if running in SDK_MODE (spawned by BBS backend)
        const isBBSMode = process.env.SDK_MODE === '1';
        if (isBBSMode) {
            // BBS Mode - Use IPC to communicate with parent process
            console.log('[Door SDK] Running in BBS mode - using IPC');
            // Listen for input messages from BBS
            process.on('message', (message) => {
                if (message.type === 'input') {
                    const user = Array.from(this.users.values())[0];
                    if (user) {
                        this.emit('input', { user, key: message.key });
                    }
                }
                else if (message.type === 'disconnect') {
                    const user = Array.from(this.users.values())[0];
                    if (user) {
                        this.disconnect(user.id);
                    }
                    this.shutdown();
                }
            });
            // Send output via IPC
            this.on('output', (data) => {
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
                    this.__bbsUserData = userData;
                }
                catch (err) {
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
    start() {
        if (this.state !== 'idle') {
            throw new Error('Door is already running');
        }
        this.state = 'running';
        this.emit('start');
        // Auto-connect user in BBS mode
        const isBBSMode = process.env.SDK_MODE === '1';
        if (isBBSMode && this.__bbsUserData) {
            // BBS Mode - connect the user passed from backend
            const bbsUser = this.__bbsUserData;
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
    mainLoop() {
        if (this.state !== 'running')
            return;
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
    onConnect(handler) {
        this.on('connect', handler);
    }
    /**
     * Connect a user to the door
     *
     * @param user - User to connect
     */
    connect(user) {
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
    onDisconnect(handler) {
        this.on('disconnect', handler);
    }
    /**
     * Disconnect a user
     *
     * @param userId - User ID to disconnect
     */
    disconnect(userId) {
        const user = this.users.get(userId);
        if (!user)
            return;
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
    onInput(handler) {
        this.on('input', (data) => {
            handler(data.user, data.key);
        });
    }
    /**
     * Simulate keyboard input (for testing)
     *
     * @param userId - User ID
     * @param key - Key event
     */
    sendInput(userId, key) {
        const user = this.users.get(userId);
        if (!user)
            return;
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
    onUpdate(handler) {
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
    onRender(handler) {
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
    send(text, userId) {
        if (userId !== undefined) {
            const user = this.users.get(userId);
            if (user) {
                this.emit('output', { user, text });
            }
        }
        else {
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
    sendAnsi(ansi, userId) {
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
    moveCursor(x, y, userId) {
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
    clearScreen(userId) {
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
    setColor(color, userId) {
        this.sendAnsi(`\x1b[${color}m`, userId);
    }
    /**
     * Get connected user by ID
     *
     * @param userId - User ID
     * @returns User or undefined
     */
    getUser(userId) {
        return this.users.get(userId);
    }
    /**
     * Get all connected users
     *
     * @returns Array of users
     */
    getUsers() {
        return Array.from(this.users.values());
    }
    /**
     * Get user count
     *
     * @returns Number of connected users
     */
    getUserCount() {
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
    setFPS(fps) {
        this.targetFPS = Math.max(1, Math.min(120, fps));
    }
    /**
     * Get current FPS
     *
     * @returns Current FPS
     */
    getFPS() {
        return this.targetFPS;
    }
    /**
     * Get current frame count
     *
     * @returns Frame count since start
     */
    getFrameCount() {
        return this.frameCount;
    }
    /**
     * Pause the door (stop game loop)
     */
    pause() {
        this.state = 'idle';
        this.emit('pause');
    }
    /**
     * Resume the door (restart game loop)
     */
    resume() {
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
    shutdown() {
        if (this.state === 'shutdown')
            return;
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
    async wait(ms) {
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
    async waitForInput(userId, timeout = 0) {
        return new Promise((resolve) => {
            let timeoutId = null;
            const handler = (data) => {
                if (data.user.id === userId) {
                    if (timeoutId)
                        clearTimeout(timeoutId);
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
    async prompt(prompt, userId, timeout = 0) {
        this.send(prompt, userId);
        let input = '';
        let done = false;
        const startTime = Date.now();
        while (!done) {
            const key = await this.waitForInput(userId, timeout > 0 ? timeout - (Date.now() - startTime) : 0);
            if (!key) {
                done = true;
                break;
            }
            if (key.key === 'Enter' || key.key === '\r' || key.key === '\n') {
                done = true;
            }
            else if (key.key === 'Backspace') {
                if (input.length > 0) {
                    input = input.slice(0, -1);
                    this.sendAnsi('\x1b[1D \x1b[1D', userId); // Move back, space, move back
                }
            }
            else if (key.key.length === 1) {
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
