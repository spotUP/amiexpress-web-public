"use strict";
/**
 * AmiExpress SDK - Server Runtime (Node.js)
 * For doors that need filesystem, database, networking, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Door = exports.ClassSystem = exports.QuestSystem = exports.DialogueSystem = exports.InventorySystem = exports.SaveManager = exports.LevelManager = exports.HUDBuilder = exports.MenuSystem = exports.UIEngine = exports.TacticalCombatEngine = exports.InputEngine = exports.AIEngine = exports.NetworkEngine = exports.AudioEngine = exports.PhysicsEngine = exports.GraphicsEngine = exports.formatInBox = exports.measureWidth = exports.substringVisible = exports.truncateVisible = exports.getCenterX = exports.centerVisible = exports.padStartVisible = exports.padEndVisible = exports.visibleLength = exports.stripAnsi = exports.AnsiColor = exports.AnsiBgColor = exports.ServerDoor = void 0;
const events_1 = require("events");
class ServerDoor extends events_1.EventEmitter {
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
        /** RPC handlers (for hybrid doors) */
        this.rpcHandlers = new Map();
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
    initialize() {
        this.emit('init', this.config);
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
        // In preview mode, set up stdin for keyboard input
        if (process.env.PREVIEW_MODE === '1') {
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
            }
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (data) => {
                const user = Array.from(this.users.values())[0];
                if (!user)
                    return;
                const key = {
                    key: data,
                    ctrl: data.charCodeAt(0) < 32,
                    alt: false,
                    shift: false,
                    code: data.charCodeAt(0),
                };
                // Handle special keys
                if (data === '\u001b[A')
                    key.key = 'ArrowUp';
                else if (data === '\u001b[B')
                    key.key = 'ArrowDown';
                else if (data === '\u001b[C')
                    key.key = 'ArrowRight';
                else if (data === '\u001b[D')
                    key.key = 'ArrowLeft';
                else if (data === '\r' || data === '\n')
                    key.key = 'Enter';
                else if (data === '\u001b')
                    key.key = 'Escape';
                else if (data === '\u007f' || data === '\b')
                    key.key = 'Backspace';
                this.emit('input', { user, key });
            });
            // Send output to stdout
            this.on('output', (data) => {
                process.stdout.write(data.text);
            });
        }
    }
    /**
     * Start the door and begin accepting connections
     */
    start() {
        if (this.state !== 'idle') {
            throw new Error('Door is already running');
        }
        this.state = 'running';
        this.emit('start');
        // In preview mode, auto-connect test user
        if (process.env.PREVIEW_MODE === '1') {
            const testUser = {
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
    mainLoop() {
        if (this.state !== 'running')
            return;
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
    onConnect(handler) {
        this.on('connect', handler);
    }
    /**
     * Connect a user to the door
     */
    connect(user) {
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
    onDisconnect(handler) {
        this.on('disconnect', handler);
    }
    /**
     * Disconnect a user
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
     */
    onInput(handler) {
        this.on('input', (data) => {
            handler(data.user, data.key);
        });
    }
    /**
     * Simulate keyboard input (for testing)
     */
    sendInput(userId, key) {
        const user = this.users.get(userId);
        if (!user)
            return;
        this.emit('input', { user, key });
    }
    /**
     * Handle game updates (called every frame)
     */
    onUpdate(handler) {
        this.on('update', handler);
    }
    /**
     * Handle rendering (called every frame after update)
     */
    onRender(handler) {
        this.on('render', handler);
    }
    /**
     * Send text output to user(s)
     */
    send(text, userId) {
        if (userId !== undefined) {
            const user = this.users.get(userId);
            if (user) {
                this.emit('output', { user, text });
            }
        }
        else {
            this.users.forEach((user) => {
                this.emit('output', { user, text });
            });
        }
    }
    /**
     * Send ANSI formatted output
     */
    sendAnsi(ansi, userId) {
        this.send(ansi, userId);
    }
    /**
     * Move cursor to position
     */
    moveCursor(x, y, userId) {
        this.sendAnsi(`\x1b[${y};${x}H`, userId);
    }
    /**
     * Clear the screen
     */
    clearScreen(userId) {
        this.sendAnsi('\x1b[2J\x1b[H', userId);
    }
    /**
     * Set foreground color
     */
    setColor(color, userId) {
        this.sendAnsi(`\x1b[${color}m`, userId);
    }
    /**
     * Get connected user by ID
     */
    getUser(userId) {
        return this.users.get(userId);
    }
    /**
     * Get all connected users
     */
    getUsers() {
        return Array.from(this.users.values());
    }
    /**
     * Get user count
     */
    getUserCount() {
        return this.users.size;
    }
    /**
     * Set target FPS for game loop
     */
    setFPS(fps) {
        this.targetFPS = Math.max(1, Math.min(120, fps));
    }
    /**
     * Get current FPS
     */
    getFPS() {
        return this.targetFPS;
    }
    /**
     * Get current frame count
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
     */
    shutdown() {
        if (this.state === 'shutdown')
            return;
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
    async wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Wait for user input (async helper)
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
                    this.sendAnsi('\x1b[1D \x1b[1D', userId);
                }
            }
            else if (key.key.length === 1) {
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
    onRPC(method, handler) {
        this.rpcHandlers.set(method, handler);
    }
    /**
     * Handle RPC call (internal use by BBS bridge)
     * @private
     */
    async handleRPC(method, params) {
        const handler = this.rpcHandlers.get(method);
        if (!handler) {
            throw new Error(`Unknown RPC method: ${method}`);
        }
        return await handler(params);
    }
}
exports.ServerDoor = ServerDoor;
exports.Door = ServerDoor;
/**
 * Export types
 */
var common_1 = require("../common");
Object.defineProperty(exports, "AnsiBgColor", { enumerable: true, get: function () { return common_1.AnsiBgColor; } });
var types_1 = require("../core/types");
Object.defineProperty(exports, "AnsiColor", { enumerable: true, get: function () { return types_1.AnsiColor; } });
/**
 * Export ANSI string utilities
 */
var ansi_string_utils_1 = require("../core/ansi-string-utils");
Object.defineProperty(exports, "stripAnsi", { enumerable: true, get: function () { return ansi_string_utils_1.stripAnsi; } });
Object.defineProperty(exports, "visibleLength", { enumerable: true, get: function () { return ansi_string_utils_1.visibleLength; } });
Object.defineProperty(exports, "padEndVisible", { enumerable: true, get: function () { return ansi_string_utils_1.padEndVisible; } });
Object.defineProperty(exports, "padStartVisible", { enumerable: true, get: function () { return ansi_string_utils_1.padStartVisible; } });
Object.defineProperty(exports, "centerVisible", { enumerable: true, get: function () { return ansi_string_utils_1.centerVisible; } });
Object.defineProperty(exports, "getCenterX", { enumerable: true, get: function () { return ansi_string_utils_1.getCenterX; } });
Object.defineProperty(exports, "truncateVisible", { enumerable: true, get: function () { return ansi_string_utils_1.truncateVisible; } });
Object.defineProperty(exports, "substringVisible", { enumerable: true, get: function () { return ansi_string_utils_1.substringVisible; } });
Object.defineProperty(exports, "measureWidth", { enumerable: true, get: function () { return ansi_string_utils_1.measureWidth; } });
Object.defineProperty(exports, "formatInBox", { enumerable: true, get: function () { return ansi_string_utils_1.formatInBox; } });
/**
 * Export engines for server doors
 */
var graphics_engine_1 = require("../engines/graphics/graphics-engine");
Object.defineProperty(exports, "GraphicsEngine", { enumerable: true, get: function () { return graphics_engine_1.GraphicsEngine; } });
var physics_engine_1 = require("../engines/physics/physics-engine");
Object.defineProperty(exports, "PhysicsEngine", { enumerable: true, get: function () { return physics_engine_1.PhysicsEngine; } });
var audio_engine_1 = require("../engines/audio/audio-engine");
Object.defineProperty(exports, "AudioEngine", { enumerable: true, get: function () { return audio_engine_1.AudioEngine; } });
var network_engine_1 = require("../engines/network/network-engine");
Object.defineProperty(exports, "NetworkEngine", { enumerable: true, get: function () { return network_engine_1.NetworkEngine; } });
var ai_engine_1 = require("../engines/ai/ai-engine");
Object.defineProperty(exports, "AIEngine", { enumerable: true, get: function () { return ai_engine_1.AIEngine; } });
var input_engine_1 = require("../engines/input/input-engine");
Object.defineProperty(exports, "InputEngine", { enumerable: true, get: function () { return input_engine_1.InputEngine; } });
var tactical_combat_engine_1 = require("../engines/tactical/tactical-combat-engine");
Object.defineProperty(exports, "TacticalCombatEngine", { enumerable: true, get: function () { return tactical_combat_engine_1.TacticalCombatEngine; } });
var ui_engine_1 = require("../engines/ui/ui-engine");
Object.defineProperty(exports, "UIEngine", { enumerable: true, get: function () { return ui_engine_1.UIEngine; } });
/**
 * Export components for server doors
 */
var menu_system_1 = require("../components/menus/menu-system");
Object.defineProperty(exports, "MenuSystem", { enumerable: true, get: function () { return menu_system_1.MenuSystem; } });
var hud_builder_1 = require("../components/hud/hud-builder");
Object.defineProperty(exports, "HUDBuilder", { enumerable: true, get: function () { return hud_builder_1.HUDBuilder; } });
var level_manager_1 = require("../components/level/level-manager");
Object.defineProperty(exports, "LevelManager", { enumerable: true, get: function () { return level_manager_1.LevelManager; } });
var save_manager_1 = require("../components/save/save-manager");
Object.defineProperty(exports, "SaveManager", { enumerable: true, get: function () { return save_manager_1.SaveManager; } });
var inventory_system_1 = require("../components/inventory/inventory-system");
Object.defineProperty(exports, "InventorySystem", { enumerable: true, get: function () { return inventory_system_1.InventorySystem; } });
var dialogue_system_1 = require("../components/dialogue/dialogue-system");
Object.defineProperty(exports, "DialogueSystem", { enumerable: true, get: function () { return dialogue_system_1.DialogueSystem; } });
var quest_system_1 = require("../components/quest/quest-system");
Object.defineProperty(exports, "QuestSystem", { enumerable: true, get: function () { return quest_system_1.QuestSystem; } });
var class_system_1 = require("../components/tactical/class-system");
Object.defineProperty(exports, "ClassSystem", { enumerable: true, get: function () { return class_system_1.ClassSystem; } });
/**
 * Export default
 */
exports.default = ServerDoor;
