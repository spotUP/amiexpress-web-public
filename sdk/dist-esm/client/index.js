/**
 * AmiExpress SDK - Client Runtime (Browser)
 * For doors that need Web APIs (Audio, Canvas, WebGL, etc.)
 */
import { EventEmitter } from './event-emitter';
import { MessageType, ProtocolHelper } from '../common/protocol';
export class ClientDoor extends EventEmitter {
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
    constructor(config) {
        super();
        /** WebSocket connection to BBS */
        this.ws = null;
        /** Currently connected user */
        this.user = null;
        /** Door state */
        this.state = 'idle';
        /** Frame counter for animations */
        this.frameCount = 0;
        /** Last frame timestamp */
        this.lastFrameTime = 0;
        /** Target FPS (frames per second) */
        this.targetFPS = 30;
        /** RPC request tracking */
        this.rpcRequests = new Map();
        /** Next RPC request ID */
        this.nextRpcId = 1;
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
     * Initialize door systems
     * @private
     */
    initialize() {
        this.emit('init', this.config);
        // Listen for browser events
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.shutdown());
        }
    }
    /**
     * Start the door and connect to BBS
     *
     * @param wsUrl - WebSocket URL (default: ws://localhost:3001) - ignored if window.__BBS__ exists
     */
    start(wsUrl = 'ws://localhost:3001') {
        // Reset state if door was left in running state from a previous crash/disconnect
        // ESM modules are cached, so the same ClientDoor instance may be reused across sessions
        if (this.state !== 'idle' && this.state !== 'shutdown') {
            console.warn('[ClientDoor] Door was in running state from previous session - resetting');
            this.state = 'idle';
            this.frameCount = 0;
            this.lastFrameTime = 0;
            this.user = null;
            this.ws = null;
            this.rpcRequests.clear();
        }
        this.state = 'connecting';
        this.emit('start');
        // Check if BBS connection is already available (bundled door scenario)
        // Only check for window in browser environments
        if (typeof window !== 'undefined') {
            const bbsGlobal = window.__BBS__;
            if (bbsGlobal && bbsGlobal.socket) {
                console.log('[ClientDoor] Using existing BBS Socket.IO connection');
                this.connectViaSocketIO(bbsGlobal.socket, bbsGlobal.sessionId);
                return;
            }
        }
        // Fallback to WebSocket connection
        console.log('[ClientDoor] Creating new WebSocket connection');
        this.connectWebSocket(wsUrl);
    }
    /**
     * Connect via existing Socket.IO connection (bundled door scenario)
     * @private
     */
    connectViaSocketIO(socket, sessionId) {
        try {
            // Store Socket.IO socket in ws field (type mismatch is ok, we handle it)
            this.socketIO = socket;
            this.sessionId = sessionId;
            console.log(`[ClientDoor] Connected via Socket.IO, session: ${sessionId}`);
            this.state = 'running';
            this.emit('ws:connected');
            // Listen for messages from backend for this session
            if (typeof window !== 'undefined') {
                window.addEventListener('bbs:door:message', (event) => {
                    if (event.detail.sessionId === sessionId) {
                        this.handleMessage(event.detail.message);
                    }
                });
            }
            // Simulate connection established
            // The backend already sent CONNECT message, trigger main loop
            this.mainLoop();
        }
        catch (err) {
            console.error('[ClientDoor] Failed to connect via Socket.IO:', err);
            this.state = 'idle';
            throw err;
        }
    }
    /**
     * Connect to BBS via WebSocket (standalone scenario)
     * @private
     */
    connectWebSocket(url) {
        if (typeof WebSocket === 'undefined') {
            throw new Error('WebSocket is not available. ClientDoor requires a browser environment.');
        }
        try {
            this.ws = new WebSocket(url);
            this.ws.onopen = () => {
                console.log('Connected to BBS');
                this.state = 'running';
                this.emit('ws:connected');
            };
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                }
                catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            };
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('ws:error', error);
            };
            this.ws.onclose = () => {
                console.log('Disconnected from BBS');
                this.state = 'shutdown';
                this.emit('ws:closed');
                this.shutdown();
            };
        }
        catch (err) {
            console.error('Failed to connect to BBS:', err);
            this.state = 'idle';
            throw err;
        }
    }
    /**
     * Handle incoming WebSocket message
     * @private
     */
    handleMessage(message) {
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
                console.log('[ClientDoor] ===== INPUT MESSAGE RECEIVED =====');
                console.log('[ClientDoor] Message data:', JSON.stringify(message.data));
                console.log('[ClientDoor] User:', this.user ? 'exists' : 'null');
                if (this.user) {
                    console.log('[ClientDoor] About to emit input event with:', message.data);
                    this.emit('input', { user: this.user, key: message.data });
                    console.log('[ClientDoor] Input event emitted');
                }
                else {
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
    handleRPCResponse(message) {
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
    handleRPCError(message) {
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
    sendMessage(message) {
        // Check if we're using Socket.IO (bundled door scenario)
        const socketIO = this.socketIO;
        const sessionId = this.sessionId;
        if (socketIO && sessionId) {
            // Emit via Socket.IO with session-specific event
            socketIO.emit('door:client:message', {
                sessionId,
                message,
            });
        }
        else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send via WebSocket (standalone scenario)
            this.ws.send(JSON.stringify(message));
        }
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
        // Use requestAnimationFrame in browser, setTimeout in Node.js
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => this.mainLoop());
        }
        else {
            setTimeout(() => this.mainLoop(), targetDelta);
        }
    }
    /**
     * Handle new user connection
     */
    onConnect(handler) {
        this.on('connect', handler);
    }
    /**
     * Handle user disconnection
     */
    onDisconnect(handler) {
        this.on('disconnect', handler);
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
     * Send text output to BBS
     */
    send(text) {
        if (!this.user)
            return;
        const message = ProtocolHelper.createOutputMessage(text);
        this.sendMessage(message);
    }
    /**
     * Send ANSI formatted output
     */
    sendAnsi(ansi) {
        this.send(ansi);
    }
    /**
     * Move cursor to position
     */
    moveCursor(x, y) {
        this.sendAnsi(`\x1b[${y};${x}H`);
    }
    /**
     * Clear the screen
     */
    clearScreen() {
        this.sendAnsi('\x1b[2J\x1b[H');
    }
    /**
     * Set foreground color
     */
    setColor(color) {
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
    setCursorVisible(visible) {
        this.sendAnsi(visible ? '\x1b[?25h' : '\x1b[?25l');
    }
    /**
     * Hide the text cursor (convenience method)
     */
    hideCursor() {
        this.setCursorVisible(false);
    }
    /**
     * Show the text cursor (convenience method)
     */
    showCursor() {
        this.setCursorVisible(true);
    }
    /**
     * Get connected user
     */
    getUser() {
        return this.user;
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
        // Send DISCONNECT message to backend to properly close the session
        this.sendMessage({ type: MessageType.DISCONNECT, timestamp: Date.now() });
        if (this.user) {
            this.emit('disconnect', this.user);
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.emit('shutdown');
        this.removeAllListeners();
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
    async waitForInput(timeout = 0) {
        if (!this.user)
            return null;
        return new Promise((resolve) => {
            let timeoutId = null;
            const handler = (data) => {
                if (timeoutId)
                    clearTimeout(timeoutId);
                this.off('input', handler);
                resolve(data.key);
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
    async prompt(prompt, timeout = 0) {
        this.send(prompt);
        let input = '';
        let done = false;
        const startTime = Date.now();
        while (!done) {
            const key = await this.waitForInput(timeout > 0 ? timeout - (Date.now() - startTime) : 0);
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
                    this.sendAnsi('\x1b[1D \x1b[1D');
                }
            }
            else if (key.key.length === 1) {
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
    async rpc(method, params = {}) {
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
 * Export ANSI string utilities
 */
export { stripAnsi, visibleLength, padEndVisible, padStartVisible, centerVisible, getCenterX, truncateVisible, substringVisible, measureWidth, formatInBox, } from '../core/ansi-string-utils';
/**
 * Export Door as alias for ClientDoor (for backwards compatibility)
 */
export { ClientDoor as Door };
/**
 * Export UIEngine for client doors
 */
export { UIEngine } from '../engines/ui/ui-engine';
/**
 * Export engines for client doors
 */
export { GraphicsEngine } from '../engines/graphics/graphics-engine';
export { PhysicsEngine } from '../engines/physics/physics-engine';
// AudioEngine removed from client export - it uses blessed (server-only)
// Use Web Audio API directly in browser code instead
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
