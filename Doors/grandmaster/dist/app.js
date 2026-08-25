"use strict";
/**
 * GRANDMASTER Application Factory
 *
 * Creates and manages the main application lifecycle including:
 * - Screen setup with neo-blessed
 * - Game state management
 * - Mode selection and transitions
 * - Audio/input initialization
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrandmasterApp = void 0;
exports.createApp = createApp;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const game_1 = require("./core/game");
const menu_1 = require("./ui/menu");
const game_screen_1 = require("./ui/game-screen");
const settings_screen_1 = require("./ui/settings-screen");
const lobby_screen_1 = require("./ui/lobby-screen");
const versus_screen_1 = require("./ui/versus-screen");
const leaderboard_screen_1 = require("./ui/leaderboard-screen");
const attract_screen_1 = require("./ui/attract-screen");
const handler_1 = require("./input/handler");
const config_1 = require("./input/config");
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const sounds_1 = require("./audio/sounds");
const high_scores_1 = require("./core/high-scores");
const network_manager_1 = require("./network/network-manager");
const attack_system_1 = require("./network/attack-system");
const tetrinet_lobby_adapter_1 = require("./network/tetrinet-lobby-adapter");
const tetrinet_client_1 = require("./network/tetrinet-client");
const tetrinet_server_browser_1 = require("./network/tetrinet-server-browser");
const tetrinet_external_adapter_1 = require("./network/tetrinet-external-adapter");
const tetrinet_engine_1 = require("./core/tetrinet/tetrinet-engine");
const tetrinet_screen_1 = require("./ui/tetrinet-screen");
const game_rules_1 = require("./core/tetrinet/game-rules");
const tetrinet_board_1 = require("./core/tetrinet/tetrinet-board");
const multiplayer_server_1 = require("./server/multiplayer-server");
const manual_1 = require("./ui/manual");
const training_config_1 = require("./ui/training-config");
// Default gamepad button mapping for GrandMaster.
// Parse a trigger string (e.g. "button:a", "dpad:left", "axis:left-x:negative")
// into a GamepadTrigger object. Returns null for unknown formats.
function parseTriggerStr(t) {
    if (t.startsWith('button:')) {
        const btn = t.slice(7);
        const btnMap = {
            a: bbs_door_sdk_1.GamepadButton.A, b: bbs_door_sdk_1.GamepadButton.B, x: bbs_door_sdk_1.GamepadButton.X, y: bbs_door_sdk_1.GamepadButton.Y,
            l1: bbs_door_sdk_1.GamepadButton.L1, r1: bbs_door_sdk_1.GamepadButton.R1, l2: bbs_door_sdk_1.GamepadButton.L2, r2: bbs_door_sdk_1.GamepadButton.R2,
            select: bbs_door_sdk_1.GamepadButton.SELECT, start: bbs_door_sdk_1.GamepadButton.START,
            l3: bbs_door_sdk_1.GamepadButton.L3, r3: bbs_door_sdk_1.GamepadButton.R3, home: bbs_door_sdk_1.GamepadButton.HOME,
        };
        const button = btnMap[btn];
        return button !== undefined ? { type: 'button', button } : null;
    }
    if (t.startsWith('dpad:')) {
        const dir = t.slice(5);
        return { type: 'dpad', direction: dir };
    }
    if (t.startsWith('axis:')) {
        const [, axisName, dirStr] = t.split(':');
        const axisMap = {
            'left-x': bbs_door_sdk_1.GamepadAxis.LEFT_STICK_X, 'left-y': bbs_door_sdk_1.GamepadAxis.LEFT_STICK_Y,
            'right-x': bbs_door_sdk_1.GamepadAxis.RIGHT_STICK_X, 'right-y': bbs_door_sdk_1.GamepadAxis.RIGHT_STICK_Y,
        };
        const axis = axisMap[axisName];
        if (axis === undefined)
            return null;
        return { type: 'axis', axis, direction: dirStr };
    }
    return null;
}
// Merge user's saved gamepad bindings on top of the default mapping.
// Actions with user-defined triggers override the default; empty arrays disable.
function buildGamepadMapping(defaults, saved) {
    const result = { ...defaults };
    for (const [action, trigStrs] of Object.entries(saved)) {
        const triggers = trigStrs.map(parseTriggerStr).filter(Boolean);
        if (triggers.length > 0) {
            result[action] = triggers;
        }
        else {
            delete result[action]; // user disabled this action
        }
    }
    return result;
}
// Creates a menu-navigation GIM for non-game screens (menus, settings, etc.).
// Dpad/stick → arrow keys; A/Start → Enter; B/Select → Escape.
// Destroy the returned object when leaving the screen to restore the previous handler.
function createMenuNav(bbsSession, screen) {
    const gim = new bbs_door_sdk_1.GamepadInputManager(bbsSession);
    const emit = (name, sequence) => screen.emit('keypress', sequence, { name, full: name, sequence });
    gim.on('dpad', (dir) => {
        if (dir === 'up')
            emit('up', '\x1b[A');
        if (dir === 'down')
            emit('down', '\x1b[B');
        if (dir === 'left')
            emit('left', '\x1b[D');
        if (dir === 'right')
            emit('right', '\x1b[C');
    });
    gim.on('axis', (axis, value) => {
        if (axis === 1 /* left-y */) {
            if (value < -0.7)
                emit('up', '\x1b[A');
            if (value > 0.7)
                emit('down', '\x1b[B');
        }
    });
    gim.on('button:a', (p) => { if (p)
        emit('enter', '\r'); });
    gim.on('button:start', (p) => { if (p)
        emit('enter', '\r'); });
    gim.on('button:b', (p) => { if (p)
        emit('escape', '\x1b'); });
    gim.on('button:select', (p) => { if (p)
        emit('escape', '\x1b'); });
    return { destroy: () => gim.destroy() };
}
// D-pad and left stick handle movement; face buttons handle rotation/actions.
const GAMEPAD_MAPPING = {
    left: [{ type: 'dpad', direction: 'left' }, { type: 'axis', axis: bbs_door_sdk_1.GamepadAxis.LEFT_STICK_X, direction: 'negative' }],
    right: [{ type: 'dpad', direction: 'right' }, { type: 'axis', axis: bbs_door_sdk_1.GamepadAxis.LEFT_STICK_X, direction: 'positive' }],
    soft_drop: [{ type: 'dpad', direction: 'down' }, { type: 'axis', axis: bbs_door_sdk_1.GamepadAxis.LEFT_STICK_Y, direction: 'positive' }],
    hard_drop: [{ type: 'dpad', direction: 'up' }, { type: 'button', button: bbs_door_sdk_1.GamepadButton.A }],
    rotate_cw: [{ type: 'button', button: bbs_door_sdk_1.GamepadButton.B }, { type: 'button', button: bbs_door_sdk_1.GamepadButton.R1 }],
    rotate_ccw: [{ type: 'button', button: bbs_door_sdk_1.GamepadButton.X }, { type: 'button', button: bbs_door_sdk_1.GamepadButton.L1 }],
    rotate_180: [{ type: 'button', button: bbs_door_sdk_1.GamepadButton.Y }],
    hold: [{ type: 'button', button: bbs_door_sdk_1.GamepadButton.L2 }, { type: 'button', button: bbs_door_sdk_1.GamepadButton.R2 }],
    pause: [{ type: 'button', button: bbs_door_sdk_1.GamepadButton.START }],
};
/**
 * Main application class
 */
class GrandmasterApp {
    constructor(session) {
        this.gameEngine = null;
        this.network = null;
        this.attackManager = null;
        this.currentScreen = 'menu';
        this._voiceRoom = null;
        this._voiceSocketHandlers = [];
        this.session = session;
        this.state = this.createInitialState();
        this.loadSettings(); // Load per-user settings from disk
        this.sounds = new sounds_1.SoundEngine(session);
        this.highScores = new high_scores_1.HighScoreManager();
        this.multiplayerServer = new multiplayer_server_1.MultiplayerServer();
        this.screen = this.createScreen();
        // Create input manager for centralized state management
        // grabKeys: true is REQUIRED for blessed to receive keyboard input globally
        // Auto-suspend will handle disabling grabKeys when List widgets gain focus
        this.inputManager = new blessed_helpers_1.DoorInputManager(session, this.screen, {
            enableGameMode: false, // DISABLED - neo-blessed handles input directly, no game mode needed
            enableGrabKeys: true, // REQUIRED - blessed needs grabKeys to receive keyboard events
            enableMouse: true,
            enableAutoSuspend: true, // Auto-suspend when List/widgets gain focus
            debug: true, // Enable debug logging to troubleshoot auto-suspend
            debugName: 'GRANDMASTER'
        });
        // Create input handler with user's key bindings
        this.inputHandler = new handler_1.InputHandler(this.screen, session, this.state.settings.keyBindings);
        // Initialize network manager if session has socket
        if (session.bbsSession?.socket) {
            this.network = new network_manager_1.GrandmasterNetworkManager(session.bbsSession);
        }
    }
    /**
     * Create initial application state
     */
    createInitialState() {
        return {
            currentMode: null,
            playerName: this.session.user?.username || 'Player',
            settings: {
                rotationSystem: 'SRS',
                das: 133, // Delayed Auto-Shift (ms)
                arr: 10, // Auto-Repeat Rate (ms)
                softDropSpeed: 20, // Multiplier
                ghostPiece: true,
                lockDelay: 500, // ms
                previewCount: 5,
                musicVolume: 0.8,
                sfxVolume: 1.0,
                keyBindings: {
                    left: [...config_1.DEFAULT_KEYS.left],
                    right: [...config_1.DEFAULT_KEYS.right],
                    rotateCW: [...config_1.DEFAULT_KEYS.rotateCW],
                    rotateCCW: [...config_1.DEFAULT_KEYS.rotateCCW],
                    rotate180: [...config_1.DEFAULT_KEYS.rotate180],
                    softDrop: [...config_1.DEFAULT_KEYS.softDrop],
                    hardDrop: [...config_1.DEFAULT_KEYS.hardDrop],
                    hold: [...config_1.DEFAULT_KEYS.hold],
                    pause: [...config_1.DEFAULT_KEYS.pause],
                },
                // Visual Effects Settings
                blockGlow: true,
                glowIntensity: 1.0,
                clearStyle: 'inward',
                clearDirection: 'in',
                clearAnimationSpeed: 1.0,
                placementEffects: true,
                floatTextMode: 'offboard',
                b2bGlowEnabled: true,
                connectedBlocks: false, // Disabled by default (BBS terminal limitations)
                animationIntensity: 'normal',
            },
            stats: {
                gamesPlayed: 0,
                totalLines: 0,
                totalScore: 0,
                bestGrade: '9',
                bestLevel: 0,
                fastestSprint: null,
                highestCombo: 0,
                tetrisCount: 0,
                tSpinCount: 0,
                perfectClears: 0,
            },
        };
    }
    /**
     * Get settings file path for current user
     */
    getSettingsPath() {
        const username = this.session.user?.username || 'guest';
        const path = require('path');
        return path.join(__dirname, '../data', `settings-${username}.json`);
    }
    /**
     * Load user settings from disk
     */
    loadSettings() {
        try {
            const fs = require('fs');
            const filePath = this.getSettingsPath();
            if (fs.existsSync(filePath)) {
                const json = fs.readFileSync(filePath, 'utf-8');
                const saved = JSON.parse(json);
                // Merge saved settings over defaults (preserves new fields)
                Object.assign(this.state.settings, saved);
                console.log(`[GRANDMASTER] Loaded settings for ${this.session.user?.username}`);
            }
        }
        catch (error) {
            console.error('[GRANDMASTER] Failed to load settings:', error);
        }
    }
    /**
     * Save user settings to disk
     */
    saveSettings() {
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = this.getSettingsPath();
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const json = JSON.stringify(this.state.settings, null, 2);
            fs.writeFileSync(filePath, json, 'utf-8');
            console.log(`[GRANDMASTER] Saved settings for ${this.session.user?.username}`);
        }
        catch (error) {
            console.error('[GRANDMASTER] Failed to save settings:', error);
        }
    }
    /**
     * Check if a modal/dialog is currently open
     * This prevents screen-level escape handlers from firing when a modal is handling ESC
     */
    isModalOpen() {
        return this.screen?.children?.some((child) => child.type === 'docmodal' ||
            child.type === 'question' ||
            child.type === 'message' ||
            child.type === 'prompt' ||
            child.type === 'loading') || false;
    }
    /**
     * Create neo-blessed screen
     */
    createScreen() {
        const screen = (0, blessed_helpers_1.createScreen)(this.session.bbs, {
            dockBorders: false, // Not needed for fixed panels in BBS environment
            title: 'GRANDMASTER v1.1.0', // Version for debugging
            fullUnicode: false,
            smartCSR: false, // Disable smart scroll-region optimization - prevents layout corruption
            fastCSR: false, // Disable fast CSR - forces full redraws for stable rendering
            // focusKeys: true is DEFAULT - blessed List widgets NEED this for arrow key navigation!
            // Setting to false breaks all keyboard navigation in List/Textbox widgets
            ignoreLocked: ['mouse', 'keypress'], // Prevent blur from clearing screen
        });
        // Prevent screen from clearing on blur - add a render call to redraw
        // Use 'any' to access internal blessed properties
        const program = screen.program;
        if (program) {
            // Override blur handler to just re-render instead of clearing
            program.on('blur', () => {
                // Just re-render on blur, don't clear
                screen.render();
            });
        }
        // Note: Input setup is now handled by DoorInputManager in run()
        // This keeps screen creation separate from input state management
        return screen;
    }
    /**
     * Run the application
     */
    async run(initialMode) {
        // Clear any previous door's screen artifacts
        // This prevents ghosting when switching between doors
        this.screen.program.write('\x1b[2J'); // Clear entire screen with ANSI
        this.screen.program.write('\x1b[H'); // Move cursor to home (0,0)
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        this.screen.render();
        // Wait for screen clear to propagate to terminal (critical for modem speeds)
        // At slow speeds, ANSI clear codes take time to transmit
        await this.sleep(200);
        // Enable door input (game mode, keyboard capture, mouse, input handler)
        // DoorInputManager handles all input state in one place
        this.inputManager.enable();
        // Show attract mode (boot sequence + demo)
        await this.showAttractMode();
        // Handle direct mode launch
        if (initialMode) {
            const mode = this.parseMode(initialMode);
            if (mode) {
                await this.startGame(mode);
                return;
            }
        }
        // Show main menu
        await this.showMainMenu();
    }
    /**
     * Play cinematic boot sequence
     */
    async playBootSequence() {
        const bootBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 60,
            height: 15,
            content: '',
            style: {
                fg: 'white',
                bg: 'black',
            },
        });
        const frames = [
            '{bold}{cyan-fg}INITIALIZING...{/cyan-fg}{/bold}',
            '{bold}{cyan-fg}GRANDMASTER{/cyan-fg}{/bold}\n\n{gray-fg}Loading TGM3 Engine...{/gray-fg}',
            '{bold}{cyan-fg}GRANDMASTER{/cyan-fg}{/bold}\n\n{gray-fg}Calibrating 20G Gravity...{/gray-fg}',
            '{bold}{cyan-fg}GRANDMASTER{/cyan-fg}{/bold}\n\n{gray-fg}Initializing Grade System...{/gray-fg}',
            '{bold}{yellow-fg}G R A N D M A S T E R{/yellow-fg}{/bold}\n\n{white-fg}TGM3-Inspired Multiplayer Tetris{/white-fg}\n\n{gray-fg}Press any key...{/gray-fg}',
        ];
        for (let i = 0; i < frames.length; i++) {
            bootBox.setContent(`${frames[i]}`);
            this.screen.render();
            await this.sleep(400);
        }
        // Wait for keypress
        await this.waitForKey();
        bootBox.destroy();
    }
    /**
     * Show attract mode (boot sequence + demo gameplay + info screens)
     */
    async showAttractMode() {
        // Disable main input handler during attract mode so it doesn't swallow keys
        this.inputHandler.setEnabled(false);
        this.inputManager.suspend(); // Disable grabKeys for attract screen input
        return new Promise((resolve) => {
            const attractScreen = new attract_screen_1.AttractScreen(this.screen, this.sounds, this.state);
            attractScreen.run(() => {
                attractScreen.cleanup();
                this.inputHandler.setEnabled(true);
                this.inputManager.resume(); // Re-enable grabKeys
                resolve();
            });
        });
    }
    /**
     * Start voice relay for a VS lobby / game session.
     * Joins the socket to a named room and relays audio:data / voice:speaking
     * events between all peers in that room.
     */
    startVoice(matchId) {
        const socket = this.session.bbsSession?.socket;
        if (!socket)
            return;
        const roomName = `voice:${matchId}`;
        this._voiceRoom = roomName;
        socket.join(roomName);
        const onAudioData = (chunk) => {
            socket.to(roomName).emit('audio:data', {
                userId: this.session.user?.id ?? 'unknown',
                chunk,
            });
        };
        const onSpeaking = (data) => {
            socket.to(roomName).emit('voice:speaking', {
                userId: this.session.user?.id ?? 'unknown',
                speaking: data.speaking,
            });
        };
        socket.on('audio:data', onAudioData);
        socket.on('voice:speaking', onSpeaking);
        this._voiceSocketHandlers = [
            ['audio:data', onAudioData],
            ['voice:speaking', onSpeaking],
        ];
        // Tell the browser to start the mic
        void this.session.bbsSession?.audio?.startStreaming?.();
    }
    /**
     * Stop voice relay and release mic.
     */
    stopVoice() {
        const socket = this.session.bbsSession?.socket;
        if (socket && this._voiceRoom) {
            for (const [ev, fn] of this._voiceSocketHandlers)
                socket.off(ev, fn);
            socket.leave(this._voiceRoom);
        }
        this._voiceRoom = null;
        this._voiceSocketHandlers = [];
        // Tell the browser to release the mic
        void this.session.bbsSession?.audio?.stopStreaming?.();
    }
    /**
     * Show main menu
     */
    async showMainMenu() {
        this.currentScreen = 'menu';
        this.inputHandler.setEnabled(false);
        this.inputManager.suspend(); // Disable grabKeys so List widget receives input
        const menuScreen = new menu_1.MenuScreen(this.screen, this.state, this.sounds);
        const nav = createMenuNav(this.session.bbsSession, this.screen);
        const selection = await menuScreen.show();
        nav.destroy();
        this.inputManager.resume();
        this.inputHandler.setEnabled(true);
        switch (selection) {
            case 'master':
                await this.startGame('master');
                break;
            case 'death':
                await this.startGame('death');
                break;
            case 'sprint':
                await this.startGame('sprint');
                break;
            case 'marathon':
                await this.startGame('marathon');
                break;
            case 'cpu_battle':
                await this.showCpuBattle();
                break;
            case 'versus':
                await this.showLobby();
                break;
            case 'tetrinet':
                await this.showTetriNetLobby();
                break;
            case 'ultra':
                await this.startGame('ultra');
                break;
            case 'dig':
                await this.startGame('dig');
                break;
            case 'zone':
                await this.startGame('zone');
                break;
            case 'training':
                await this.startTraining();
                break;
            case 'settings':
                await this.showSettings();
                break;
            case 'stats':
                await this.showStats();
                break;
            case 'manual':
                await this.showManual();
                break;
            case 'quit':
                await this.quit();
                return;
        }
        // Return to menu after game/screen ends
        if (this.currentScreen !== 'menu') {
            await this.showMainMenu();
        }
    }
    /**
     * Show training level selector then start training game
     */
    async startTraining() {
        this.inputManager.suspend();
        const config = await (0, training_config_1.showTrainingConfig)(this.screen);
        this.inputManager.resume();
        await this.startGame('training', config.startLevel);
    }
    /**
     * Start a game in specified mode
     */
    async startGame(mode, startLevel = 0) {
        this.currentScreen = 'game';
        this.state.currentMode = mode;
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Create game engine
        this.gameEngine = new game_1.GameEngine(mode, this.state.settings, this.sounds, undefined, startLevel);
        // Start replay recording
        const userId = this.session.user?.id || 'guest';
        const username = this.session.user?.username || this.state.playerName;
        this.gameEngine.startRecording(userId, username);
        // Create gamepad mapper — merge user's saved bindings over the defaults
        const gamepadMapper = new bbs_door_sdk_1.GamepadActionMapper({
            bbsSession: this.session.bbsSession,
            mapping: buildGamepadMapping(GAMEPAD_MAPPING, this.state.settings.gamepadBindings ?? {}),
            repeatActions: ['left', 'right', 'soft_drop'],
            dasDelay: this.state.settings.das ?? 133,
            arrRate: this.state.settings.arr ?? 10,
        });
        // Create game screen
        const gameScreen = new game_screen_1.GameScreen(this.screen, this.gameEngine, this.inputHandler, this.sounds, this.state, gamepadMapper);
        // Run game loop
        await gameScreen.run();
        gamepadMapper.destroy();
        // Submit score and replay
        await this.submitScore(userId, username);
        // Update stats after game
        await this.updateStats();
        // Re-enable mouse control for menus
        this.screen.program.enableMouse();
        // Clean up
        this.gameEngine = null;
        this.state.currentMode = null;
    }
    /**
     * Show multiplayer lobby
     */
    async showLobby() {
        this.currentScreen = 'lobby';
        // Disable game mode so textboxes can receive input
        if (this.session.bbs?.disableGameMode) {
            this.session.bbs.disableGameMode();
            console.log('[GRANDMASTER] Game mode disabled for versus lobby chat');
        }
        this.inputHandler.setEnabled(false);
        this.inputManager.suspend(); // Disable grabKeys so List widgets can receive input
        const nav = createMenuNav(this.session.bbsSession, this.screen);
        // Start voice for the lobby + any subsequent VS game in this session
        const voiceMatchId = this.network?.getMatchState()?.matchId
            ?? `lobby-${this.session.user?.id ?? Date.now()}`;
        this.startVoice(voiceMatchId);
        // Check if network is available
        if (!this.network) {
            const errorBox = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 60,
                height: 8,
                border: { type: 'line' },
                style: { border: { fg: 'red' } },
                content: '{bold}{red-fg}ERROR{/red-fg}{/bold}\n\n' +
                    '{white-fg}Multiplayer not available\n' +
                    'Network connection required{/white-fg}\n\n' +
                    '{gray-fg}Press any key to return{/gray-fg}',
                fixed: true,
            });
            this.screen.render();
            await this.waitForKey();
            errorBox.destroy();
            nav.destroy();
            this.stopVoice();
            return;
        }
        // Show mode selection first
        const modePanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 12,
            border: { type: 'line' },
            label: ' Select Mode ',
            style: { border: { fg: 'cyan' } },
            fixed: true,
        });
        const modeBox = (0, blessed_helpers_1.createList)({
            parent: modePanel,
            top: 1,
            left: 1,
            width: 48,
            height: 10,
            style: {
                selected: { bg: 'blue', fg: 'white' },
            },
            keys: true,
            vi: true,
            mouse: true,
            items: [
                '1v1 Versus',
                '2v2 Team Battle',
                'Battle Royale (99)',
                'Back to Menu',
            ],
        });
        modeBox.focus();
        this.screen.render();
        const modeSelection = await new Promise((resolve) => {
            const onSelect = (_item, index) => {
                this.screen.unkey(['escape'], onEscape);
                resolve(index);
            };
            const onEscape = () => {
                if (this.isModalOpen())
                    return;
                modeBox.removeListener('select', onSelect);
                this.screen.unkey(['escape'], onEscape);
                resolve(3); // Back
            };
            modeBox.on('select', onSelect);
            this.screen.key(['escape'], onEscape);
        });
        modeBox.destroy();
        modePanel.destroy();
        if (modeSelection === 3) {
            nav.destroy();
            this.stopVoice();
            return; // Back to menu
        }
        // ── Mode-selection + lobby loop ────────────────────────────────────────
        // Stays in this loop (and keeps voice active) until the player starts a
        // game or explicitly goes Back to the main menu.
        const modes = ['versus_1v1', 'team_2v2', 'battle_royale'];
        let selectedMode = modes[modeSelection];
        let changingMode = false;
        while (true) {
            if (changingMode) {
                // Re-show mode selection overlay
                changingMode = false;
                const rePanel = (0, blessed_helpers_1.createBox)({
                    parent: this.screen,
                    top: 'center',
                    left: 'center',
                    width: 50,
                    height: 12,
                    border: { type: 'line' },
                    label: ' Change Mode ',
                    style: { border: { fg: 'cyan' } },
                    fixed: true,
                });
                const reList = (0, blessed_helpers_1.createList)({
                    parent: rePanel,
                    top: 1,
                    left: 1,
                    width: 48,
                    height: 10,
                    style: { selected: { bg: 'blue', fg: 'white' } },
                    keys: true,
                    vi: true,
                    mouse: true,
                    items: ['1v1 Versus', '2v2 Team Battle', 'Battle Royale (99)', 'Back to Menu'],
                });
                reList.focus();
                this.screen.render();
                const newModeIdx = await new Promise((resolve) => {
                    const onSel = (_item, index) => { this.screen.unkey(['escape'], onEsc); resolve(index); };
                    const onEsc = () => { reList.removeListener('select', onSel); this.screen.unkey(['escape'], onEsc); resolve(3); };
                    reList.on('select', onSel);
                    this.screen.key(['escape'], onEsc);
                });
                reList.destroy();
                rePanel.destroy();
                if (newModeIdx === 3) {
                    // Back to main menu — stop voice and exit
                    nav.destroy();
                    this.stopVoice();
                    this.inputHandler.setEnabled(true);
                    this.inputManager.resume();
                    if (this.session.bbs?.enableGameMode) {
                        this.session.bbs.enableGameMode();
                    }
                    return;
                }
                selectedMode = modes[newModeIdx];
            }
            // Create lobby screen
            // Use 'matchmaking' so the broker's atomic handleMatchmake joins an existing
            // waiting lobby with the same mode, or creates one the next player will join.
            // 'custom' would make every player create their own private lobby (each sees only themselves).
            const localPlayerId = this.session.user?.id || this.state.playerName;
            const lobbyScreen = new lobby_screen_1.LobbyScreen(this.screen, this.state, this.sounds, this.network, localPlayerId);
            // Register C key inside lobby to trigger mode change (without leaving voice)
            const onChangeMode = () => { changingMode = true; };
            this.screen.key(['c', 'C'], onChangeMode);
            const result = await lobbyScreen.show('matchmaking', selectedMode);
            this.screen.unkey(['c', 'C'], onChangeMode);
            if (result.action === 'start' && result.mode) {
                // Game starting — re-enable input and route to the appropriate game
                nav.destroy();
                this.inputHandler.setEnabled(true);
                this.inputManager.resume();
                if (this.session.bbs?.enableGameMode) {
                    this.session.bbs.enableGameMode();
                    console.log('[GRANDMASTER] Game mode re-enabled after versus lobby');
                }
                const matchState = this.network?.getMatchState();
                const hasBots = matchState?.players.some(p => p.isBot) ?? false;
                if (hasBots) {
                    const bots = matchState?.players.filter(p => p.isBot) ?? [];
                    const botDifficulty = bots[0]?.botDifficulty ?? 5;
                    await this.startCpuBattle(botDifficulty, Math.max(1, bots.length));
                }
                else {
                    await this.startVersusGame(result.mode);
                }
                return;
            }
            else if (changingMode) {
                // C was pressed during lobby — loop back to mode selection overlay
                continue;
            }
            else {
                // Player pressed Leave/Back in lobby without requesting a mode change
                nav.destroy();
                this.stopVoice();
                this.inputHandler.setEnabled(true);
                this.inputManager.resume();
                if (this.session.bbs?.enableGameMode) {
                    this.session.bbs.enableGameMode();
                    console.log('[GRANDMASTER] Game mode re-enabled after versus lobby');
                }
                return;
            }
        }
    }
    /**
     * Show TetriNET lobby for classic TetriNET gameplay
     */
    async showTetriNetLobby() {
        this.currentScreen = 'lobby';
        // Disable game mode so textboxes can receive input
        if (this.session.bbs?.disableGameMode) {
            this.session.bbs.disableGameMode();
            console.log('[GRANDMASTER] Game mode disabled for TetriNET lobby chat');
        }
        this.inputHandler.setEnabled(false);
        this.inputManager.suspend(); // Disable grabKeys so List widgets can receive input
        // Clear screen and add background
        this.screen.children.forEach(child => child.destroy());
        const background = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            style: { bg: 'black' },
        });
        // First show mode selection - compact dialog sized to content
        const modePanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 40,
            height: 12,
            border: { type: 'line' },
            label: ' TetriNET Mode ',
            style: { border: { fg: 'cyan' } },
            fixed: true,
        });
        const modeBox = (0, blessed_helpers_1.createList)({
            parent: modePanel,
            top: 0,
            left: 1,
            width: 36,
            height: 8,
            style: {
                selected: { bg: 'blue', fg: 'white' },
            },
            keys: true,
            vi: true,
            mouse: true,
            items: [
                'Create Game (Standard)',
                'Create Game (Extended)',
                'Create Game (Classic)',
                'Join Game',
                '',
                'Connect to External Server',
                '',
                'Back to Menu',
            ],
        });
        modeBox.focus();
        this.screen.render();
        const selection = await new Promise((resolve) => {
            const onSelect = (_item, index) => {
                this.screen.unkey(['escape'], onEscape);
                resolve(index);
            };
            const onEscape = () => {
                if (this.isModalOpen())
                    return;
                modeBox.removeListener('select', onSelect);
                this.screen.unkey(['escape'], onEscape);
                resolve(7); // Back
            };
            modeBox.on('select', onSelect);
            this.screen.key(['escape'], onEscape);
        });
        modeBox.destroy();
        modePanel.destroy();
        background.destroy();
        if (selection === 4 || selection === 6 || selection === 7) {
            // Re-enable input before returning to menu
            this.inputHandler.setEnabled(true);
            this.inputManager.resume();
            if (this.session.bbs?.enableGameMode) {
                this.session.bbs.enableGameMode();
            }
            return; // Back to menu or separator
        }
        // Handle "Connect to External Server" option
        if (selection === 5) {
            await this.showTetriNetServerConnect();
            // Re-enable input before returning to menu
            this.inputHandler.setEnabled(true);
            this.inputManager.resume();
            if (this.session.bbs?.enableGameMode) {
                this.session.bbs.enableGameMode();
            }
            return;
        }
        // Map selection to mode and entry type
        const modeMap = {
            0: 'standard',
            1: 'extended',
            2: 'classic',
            3: 'standard', // Join defaults to standard
        };
        const selectedMode = modeMap[selection] || 'standard';
        const entryMode = selection === 3 ? 'join' : 'custom';
        // Create TetriNET lobby adapter
        if (!this.network) {
            this.network = new network_manager_1.GrandmasterNetworkManager(this.session.bbsSession);
        }
        const adapter = new tetrinet_lobby_adapter_1.TetriNetLobbyAdapter(this.network);
        // Add local player
        const playerName = this.session.user?.username || this.state.playerName;
        adapter.addLocalPlayer(playerName, 1);
        // Create lobby with TetriNET-specific features
        const lobby = new blessed_1.MultiplayerLobby({
            parent: this.screen,
            adapter,
            localPlayerId: 'slot-1',
            title: 'TETRINET LOBBY',
            features: {
                slotBased: true, // Slots 1-6
                chat: true, // Partyline chat
                teams: true, // Team selection
                settingsEditor: true, // Game options
                leaderboard: true, // Winlist
                bots: true, // Auto-fill with AI players if needed
            },
            modes: {
                standard: {
                    name: 'Standard (9 specials)',
                    maxPlayers: 6,
                    maxSlots: 6,
                    minPlayers: 2,
                    teamBased: true,
                    teams: ['Red', 'Blue'],
                },
                extended: {
                    name: 'Extended (16 specials)',
                    maxPlayers: 6,
                    maxSlots: 6,
                    minPlayers: 2,
                    teamBased: true,
                    teams: ['Red', 'Blue'],
                },
                classic: {
                    name: 'Classic (no specials)',
                    maxPlayers: 6,
                    maxSlots: 6,
                    minPlayers: 2,
                    teamBased: true,
                    teams: ['Red', 'Blue'],
                },
            },
            gameSettings: [
                {
                    key: 'startingLevel',
                    label: 'Starting Level',
                    type: 'number',
                    min: 1,
                    max: 100,
                    default: 1,
                },
                {
                    key: 'linesToMakeForSpecials',
                    label: 'Lines for Special',
                    type: 'number',
                    min: 1,
                    max: 4,
                    default: 1,
                },
                {
                    key: 'specialsAddedEachTime',
                    label: 'Specials Added',
                    type: 'number',
                    min: 1,
                    max: 4,
                    default: 1,
                },
                {
                    key: 'inventorySize',
                    label: 'Inventory Size',
                    type: 'number',
                    min: 1,
                    max: 18,
                    default: 10,
                },
                {
                    key: 'delayBeforeSuddenDeath',
                    label: 'Sudden Death (min)',
                    type: 'number',
                    min: 0,
                    max: 15,
                    default: 2,
                },
                {
                    key: 'suddenDeathTick',
                    label: 'SD Tick (sec)',
                    type: 'number',
                    min: 1,
                    max: 30,
                    default: 10,
                },
            ],
            onSound: (sound) => {
                const soundMap = {
                    select: 'menu_select',
                    error: 'error',
                    countdown: 'countdown',
                    join: 'menu_select',
                    leave: 'menu_select',
                    chat: 'menu_select',
                };
                const sfx = soundMap[sound];
                if (sfx) {
                    this.sounds.playSfx(sfx);
                }
            },
        });
        // Show lobby and wait for result
        const result = await lobby.show(entryMode, selectedMode);
        // Re-enable game mode and input handler after lobby
        this.inputHandler.setEnabled(true);
        this.inputManager.resume(); // Re-enable grabKeys
        if (this.session.bbs?.enableGameMode) {
            this.session.bbs.enableGameMode();
            console.log('[GRANDMASTER] Game mode re-enabled after TetriNET lobby');
        }
        if (result.action === 'start') {
            // Start TetriNET game with the settings from lobby
            await this.startTetriNetGame(result.mode || 'standard', result.settings || {});
        }
    }
    /**
     * Start a TetriNET game (local, single-player with TetriNET rules)
     */
    async startTetriNetGame(mode, settings) {
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Get base options for the selected rule (standard, extended, classic)
        const rule = (mode === 'extended' || mode === 'classic' || mode === 'standard')
            ? mode
            : 'standard';
        const gameOptions = {
            ...(0, game_rules_1.getDefaultOptions)(rule),
            // Apply any custom settings from lobby
            startingLevel: settings.startingLevel || 0,
            startingHeight: settings.startingHeight || 0,
            delayBeforeSuddenDeath: settings.suddenDeathDelay ?? 3,
            suddenDeathTick: settings.suddenDeathTick || 5,
        };
        // Create TetriNET engine for human player
        const gameEngine = new tetrinet_engine_1.TetriNetEngine(this.state.settings, gameOptions);
        // Create AI opponents for local mode (3 opponents, difficulty 5)
        const { TetriNetAI } = await Promise.resolve().then(() => __importStar(require('./ai/tetrinet-ai')));
        const aiController = new TetriNetAI();
        const aiOpponents = aiController.createOpponents(3, 5, this.state.settings, gameOptions);
        // Create TetriNET screen with AI opponents
        const gameScreen = new tetrinet_screen_1.TetriNetScreen({
            screen: this.screen,
            engine: gameEngine,
            inputHandler: this.inputHandler,
            sounds: this.sounds,
            state: this.state,
            playerName: this.state.playerName,
            aiController, // Pass AI controller to screen
        });
        // Convert AI opponents to OpponentBoardData format
        const opponents = aiOpponents.map(ai => ({
            id: ai.id,
            name: ai.name,
            board: ai.engine.getBoard(),
            level: ai.engine.getState().level,
            alive: ai.alive,
            hasImmunity: false,
        }));
        // Update opponents display
        gameScreen.updateOpponents(opponents);
        // Run the game until completion
        await gameScreen.run();
        // Cleanup AI
        aiController.destroy();
        gameScreen.cleanup();
        // Re-enable mouse control for menus
        this.screen.program.enableMouse();
    }
    /**
     * Show TetriNET external server connection dialog
     */
    async showTetriNetServerConnect() {
        // Import textbox helpers
        const { createTextbox } = await Promise.resolve().then(() => __importStar(require('@amiexpress/bbs-door-sdk/utils/blessed-helpers')));
        // Predefined server list from https://servers.tetrinet.fr/
        let predefinedServers = [
            { name: 'tetrinet.fr', host: 'tetrinet.fr' },
            { name: 'tetrinet.de', host: 'tetrinet.de' },
            { name: 'tetrinet.lfjr.net', host: 'tetrinet.lfjr.net' },
            { name: 'tetrinet.cyteen.eu', host: 'tetrinet.cyteen.eu' },
            { name: 'tetrinet.geekshed.net', host: 'tetrinet.geekshed.net' },
            { name: 'linuxiuvat.de', host: 'linuxiuvat.de' },
            { name: 'tetrinet.laber.fasel.org', host: 'tetrinet.laber.fasel.org' },
        ];
        let selectedServer = '';
        let selectedPort = 31457;
        let selectedMode = 'tetrifast';
        // Server selection
        const getItems = () => [
            ...predefinedServers.map(s => s.name),
            '',
            '{yellow-fg}Enter Custom Server...{/yellow-fg}',
            '{cyan-fg}Update Server List (Live)...{/cyan-fg}',
            '',
            '{gray-fg}Back{/gray-fg}',
        ];
        const serverPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: Math.min(predefinedServers.length + 10, 20),
            border: { type: 'line' },
            label: ' Select TetriNET Server ',
            style: { border: { fg: 'cyan' } },
            fixed: true,
        });
        const serverSelectBox = (0, blessed_helpers_1.createList)({
            parent: serverPanel,
            top: 1,
            left: 1,
            width: 48,
            height: Math.min(predefinedServers.length + 8, 18),
            style: {
                selected: { bg: 'blue', fg: 'white' },
            },
            items: getItems(),
            keys: true,
            vi: true,
            mouse: true,
        });
        serverSelectBox.focus();
        this.screen.render();
        let serverSelection = -1;
        while (serverSelection === -1) {
            serverSelection = await new Promise((resolve) => {
                const onSelect = (_item, index) => {
                    this.screen.unkey(['escape'], onEscape);
                    resolve(index);
                };
                const onEscape = () => {
                    serverSelectBox.removeListener('select', onSelect);
                    this.screen.unkey(['escape'], onEscape);
                    resolve(predefinedServers.length + 5); // Back
                };
                serverSelectBox.once('select', onSelect);
                this.screen.key(['escape'], onEscape);
            });
            // Handle Update Server List (Live)
            if (serverSelection === predefinedServers.length + 2) {
                serverSelectBox.setLabel(' Fetching live servers... ');
                this.screen.render();
                const browser = new tetrinet_server_browser_1.TetriNetServerBrowser();
                const liveServers = await browser.fetchServers();
                if (liveServers.length > 0) {
                    predefinedServers = liveServers.map(s => ({
                        name: `${s.name} [${s.players}/${s.maxPlayers}]`,
                        host: s.host,
                        port: s.port
                    }));
                    serverSelectBox.setItems(getItems());
                    serverSelectBox.select(0); // Reset to first item after update
                }
                else {
                    serverSelectBox.setLabel(' Select TetriNET Server (Update Failed) ');
                }
                serverSelection = -1; // Loop again
                serverSelectBox.setLabel(' Select TetriNET Server ');
                serverSelectBox.focus();
                this.screen.render();
            }
        }
        serverSelectBox.destroy();
        serverPanel.destroy();
        // Handle back/cancel
        const backIndex = predefinedServers.length + 5;
        if (serverSelection === predefinedServers.length || serverSelection === predefinedServers.length + 4 || serverSelection === backIndex) {
            return;
        }
        // Custom server entry
        if (serverSelection === predefinedServers.length + 1) {
            // Show custom server dialog
            const customDialog = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 55,
                height: 10,
                border: { type: 'line' },
                label: ' Enter Server Address ',
                style: {
                    border: { fg: 'cyan' },
                },
                fixed: true,
            });
            const serverLabel = (0, blessed_helpers_1.createBox)({
                parent: customDialog,
                top: 1,
                left: 2,
                width: 20,
                height: 1,
                content: '{bold}Server:{/bold}',
            });
            const serverInput = createTextbox({
                parent: customDialog,
                top: 1,
                left: 22,
                width: 28,
                height: 3,
                border: { type: 'line' },
                style: {
                    border: { fg: 'white' },
                    focus: { fg: 'cyan' },
                },
                inputOnFocus: true,
                mouse: true,
            });
            const portLabel = (0, blessed_helpers_1.createBox)({
                parent: customDialog,
                top: 4,
                left: 2,
                width: 20,
                height: 1,
                content: '{bold}Port:{/bold}',
            });
            const portInput = createTextbox({
                parent: customDialog,
                top: 4,
                left: 22,
                width: 10,
                height: 3,
                border: { type: 'line' },
                style: {
                    border: { fg: 'white' },
                    focus: { fg: 'cyan' },
                },
                inputOnFocus: true,
                mouse: true,
            });
            portInput.setValue('31457');
            const customInstructions = (0, blessed_helpers_1.createBox)({
                parent: customDialog,
                top: 7,
                left: 2,
                width: 50,
                height: 1,
                content: '{gray-fg}Tab to switch, Enter to continue, ESC to cancel{/gray-fg}',
            });
            this.screen.render();
            const inputs = [serverInput, portInput];
            let focusIndex = 0;
            inputs[focusIndex].focus();
            const customResult = await new Promise((resolve) => {
                const onTab = () => {
                    focusIndex = (focusIndex + 1) % inputs.length;
                    inputs[focusIndex].focus();
                    this.screen.render();
                };
                const onSTab = () => {
                    focusIndex = (focusIndex - 1 + inputs.length) % inputs.length;
                    inputs[focusIndex].focus();
                    this.screen.render();
                };
                const onEnter = () => {
                    const server = serverInput.getValue()?.trim() || '';
                    const port = parseInt(portInput.getValue()?.trim() || '31457', 10);
                    if (!server) {
                        this.sounds.playSfx('error');
                        return;
                    }
                    cleanup();
                    resolve({ server, port });
                };
                const onEscape = () => {
                    cleanup();
                    resolve(null);
                };
                const cleanup = () => {
                    this.screen.unkey(['tab'], onTab);
                    this.screen.unkey(['S-tab'], onSTab);
                    this.screen.unkey(['enter'], onEnter);
                    this.screen.unkey(['escape'], onEscape);
                };
                this.screen.key(['tab'], onTab);
                this.screen.key(['S-tab'], onSTab);
                this.screen.key(['enter'], onEnter);
                this.screen.key(['escape'], onEscape);
            });
            customDialog.destroy();
            if (!customResult) {
                return; // Cancelled
            }
            selectedServer = customResult.server;
            selectedPort = customResult.port;
        }
        else {
            // Predefined server
            selectedServer = predefinedServers[serverSelection].host;
            selectedPort = predefinedServers[serverSelection].port || 31457;
        }
        // Ask for mode (includes TSpec spectator)
        const modePanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 34,
            height: 7,
            border: { type: 'line' },
            label: ' Mode ',
            style: { border: { fg: 'cyan' } },
            fixed: true,
        });
        const modeSelectBox = (0, blessed_helpers_1.createList)({
            parent: modePanel,
            top: 1,
            left: 1,
            width: 32,
            height: 5,
            style: {
                selected: { bg: 'blue', fg: 'white' },
            },
            items: ['TetriFast (Recommended)', 'Standard', 'TSpec (Spectator)'],
            keys: true,
            vi: true,
            mouse: true,
        });
        modeSelectBox.focus();
        this.screen.render();
        const modeSelection = await new Promise((resolve) => {
            const onSelect = (_item, index) => {
                this.screen.unkey(['escape'], onEscape);
                resolve(index);
            };
            const onEscape = () => {
                if (this.isModalOpen())
                    return;
                modeSelectBox.removeListener('select', onSelect);
                this.screen.unkey(['escape'], onEscape);
                resolve(-1);
            };
            modeSelectBox.on('select', onSelect);
            this.screen.key(['escape'], onEscape);
        });
        modeSelectBox.destroy();
        modePanel.destroy();
        if (modeSelection === -1)
            return;
        selectedMode = modeSelection === 0 ? 'tetrifast' : modeSelection === 1 ? 'standard' : 'tspec';
        if (selectedMode === 'tspec' && selectedPort === 31457) {
            selectedPort = 31458;
        }
        // Now show nickname dialog
        const nickDialog = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 8,
            border: { type: 'line' },
            label: ` Connecting to ${selectedServer} `,
            style: {
                border: { fg: 'cyan' },
            },
            fixed: true,
        });
        const nickLabel = (0, blessed_helpers_1.createBox)({
            parent: nickDialog,
            top: 1,
            left: 2,
            width: 20,
            height: 1,
            content: '{bold}Nickname:{/bold}',
        });
        const nickInput = createTextbox({
            parent: nickDialog,
            top: 1,
            left: 22,
            width: 20,
            height: 1,
            style: {
                fg: 'cyan',
                focus: { fg: 'white' },
            },
            inputOnFocus: true,
            mouse: true,
        });
        const playerName = this.session.user?.username || this.state.playerName;
        nickInput.setValue(playerName.substring(0, 15));
        const nickInstructions = (0, blessed_helpers_1.createBox)({
            parent: nickDialog,
            top: 4,
            left: 2,
            width: 45,
            height: 1,
            content: '{gray-fg}Enter your nickname (max 15 chars), ESC to cancel{/gray-fg}',
        });
        this.screen.render();
        nickInput.focus();
        const nickResult = await new Promise((resolve) => {
            const onEnter = () => {
                const nickname = nickInput.getValue()?.trim() || 'Player';
                cleanup();
                resolve(nickname.substring(0, 15));
            };
            const onEscape = () => {
                cleanup();
                resolve(null);
            };
            const cleanup = () => {
                this.screen.unkey(['enter'], onEnter);
                this.screen.unkey(['escape'], onEscape);
            };
            this.screen.key(['enter'], onEnter);
            this.screen.key(['escape'], onEscape);
        });
        nickDialog.destroy();
        if (!nickResult) {
            return; // Cancelled
        }
        let passwordResult = '';
        if (selectedMode === 'tspec') {
            const passwordDialog = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 50,
                height: 8,
                border: { type: 'line' },
                label: ' TSpec Password ',
                style: {
                    border: { fg: 'cyan' },
                },
                fixed: true,
            });
            (0, blessed_helpers_1.createBox)({
                parent: passwordDialog,
                top: 1,
                left: 2,
                width: 20,
                height: 1,
                content: '{bold}Password:{/bold}',
            });
            const passwordInput = createTextbox({
                parent: passwordDialog,
                top: 1,
                left: 22,
                width: 20,
                height: 3,
                border: { type: 'line' },
                style: {
                    border: { fg: 'white' },
                    focus: { fg: 'cyan' },
                },
                inputOnFocus: true,
                mouse: true,
            });
            (0, blessed_helpers_1.createBox)({
                parent: passwordDialog,
                top: 4,
                left: 2,
                width: 45,
                height: 1,
                content: '{gray-fg}Enter TSpec password (ESC to cancel){/gray-fg}',
            });
            this.screen.render();
            passwordInput.focus();
            const passResult = await new Promise((resolve) => {
                const onEnter = () => {
                    const password = passwordInput.getValue()?.trim() || '';
                    cleanup();
                    resolve(password);
                };
                const onEscape = () => {
                    cleanup();
                    resolve(null);
                };
                const cleanup = () => {
                    this.screen.unkey(['enter'], onEnter);
                    this.screen.unkey(['escape'], onEscape);
                };
                this.screen.key(['enter'], onEnter);
                this.screen.key(['escape'], onEscape);
            });
            passwordDialog.destroy();
            if (passResult === null) {
                return;
            }
            passwordResult = passResult;
        }
        const result = {
            server: selectedServer,
            port: selectedPort,
            nickname: nickResult,
            mode: selectedMode,
            password: passwordResult,
        };
        // Show connecting status
        const statusBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 7,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            content: `{bold}{cyan-fg}Connecting to TetriNET server...{/cyan-fg}{/bold}\n\n` +
                `Server: ${result.server}:${result.port}\n` +
                `Mode: ${result.mode}\n` +
                `Status: Initializing...`,
            fixed: true,
        });
        this.screen.render();
        // Helper to update status
        const updateStatus = (status) => {
            statusBox.setContent(`{bold}{cyan-fg}Connecting to TetriNET server...{/cyan-fg}{/bold}\n\n` +
                `Server: ${result.server}:${result.port}\n` +
                `Mode: ${result.mode}\n` +
                `Status: ${status}`);
            this.screen.render();
        };
        try {
            // Create client and connect
            updateStatus('Creating socket...');
            const client = new tetrinet_client_1.TetriNetClient({
                host: result.server,
                port: result.port,
                nickname: result.nickname,
                mode: result.mode,
                password: result.password,
                timeout: 15000,
            });
            // Listen for state changes to update UI
            client.on('state:change', (state) => {
                if (state === 'connecting') {
                    updateStatus('Connecting to server...');
                }
                else if (state === 'connected') {
                    updateStatus(result.mode === 'tspec' ? 'Connected! Spectator mode' : 'Connected! Waiting for slot...');
                }
            });
            // Listen for detailed status updates
            client.on('status', (status) => {
                updateStatus(status);
            });
            updateStatus('Initiating TCP connection...');
            await client.connect();
            statusBox.setContent(`{bold}{green-fg}Connected!{/green-fg}{/bold}\n\n` +
                `${client.getSlot() ? `Slot ${client.getSlot()} assigned` : 'Spectator connected'}`);
            this.screen.render();
            // Wait a moment to show connected status
            await new Promise(r => setTimeout(r, 1000));
            statusBox.destroy();
            // Show the external server lobby/game
            await this.runTetriNetExternalGame(client);
            client.disconnect();
        }
        catch (error) {
            statusBox.setContent(`{bold}{red-fg}Connection Failed{/red-fg}{/bold}\n\n` +
                `${error.message}`);
            this.screen.render();
            await this.waitForKey();
            statusBox.destroy();
        }
    }
    /**
     * Run TetriNET game connected to external server
     */
    async runTetriNetExternalGame(client) {
        if (this.session.bbs?.disableGameMode) {
            this.session.bbs.disableGameMode();
            console.log('[GRANDMASTER] Game mode disabled for TetriNET partyline input');
        }
        this.inputHandler.setEnabled(false);
        this.inputManager.suspend(); // Disable grabKeys for lobby input
        const externalAdapter = new tetrinet_external_adapter_1.TetriNetExternalAdapter(client);
        let gameScreen = null;
        let gameEngine = null;
        let lobbyEscapeHandler = null;
        let spectatorPublic = false;
        const { createTextbox } = await Promise.resolve().then(() => __importStar(require('@amiexpress/bbs-door-sdk/utils/blessed-helpers')));
        const footerHeight = 3;
        const inputHeight = 3;
        const sidePanelHeight = `100%-${footerHeight + inputHeight}`;
        const chatWidth = 36; // Consistent width for chat area and input
        const createLobbyUi = () => {
            const gameBox = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                label: ` TetriNET - ${client.getSlot() ? `Slot ${client.getSlot()}` : 'Connected'} `,
                border: { type: 'line' },
                style: { border: { fg: 'yellow' }, bg: 'black' },
                fixed: true,
            });
            const chatArea = (0, blessed_helpers_1.createBox)({
                parent: gameBox,
                top: 0,
                left: 0,
                width: chatWidth,
                height: sidePanelHeight,
                label: client.getSlot() ? ' Partyline Chat ' : ' TSpec Chat ',
                border: { type: 'line' },
                style: { border: { fg: 'cyan' }, bg: 'black' },
                scrollable: true,
                alwaysScroll: true,
                mouse: true,
                fixed: true,
            });
            const rightPanel = (0, blessed_helpers_1.createBox)({
                parent: gameBox,
                top: 0,
                right: 0,
                width: 26,
                height: sidePanelHeight,
                style: { bg: 'black' },
            });
            const playerList = (0, blessed_helpers_1.createBox)({
                parent: rightPanel,
                top: 0,
                left: 0,
                width: '100%',
                height: 11,
                label: ' Players ',
                border: { type: 'line' },
                style: { border: { fg: 'green' }, bg: 'black' },
                fixed: true,
            });
            const spectatorList = (0, blessed_helpers_1.createBox)({
                parent: rightPanel,
                top: 11,
                left: 0,
                width: '100%',
                height: `100%-11`,
                label: ' Spectators ',
                border: { type: 'line' },
                style: { border: { fg: 'magenta' }, bg: 'black' },
                fixed: true,
            });
            const footer = (0, blessed_helpers_1.createBox)({
                parent: gameBox,
                bottom: 0,
                left: 0,
                width: '100%',
                height: footerHeight,
                border: { type: 'line' },
                style: { border: { fg: 'gray' }, bg: 'black' },
                fixed: true,
            });
            (0, blessed_helpers_1.createBox)({
                parent: footer,
                top: 0,
                left: 1,
                width: '100%-2',
                height: 1,
                content: '{bold}Commands:{/bold} /team <name> | /me <action> | /public | /private | ESC to disconnect',
            });
            const footerStatus = (0, blessed_helpers_1.createBox)({
                parent: footer,
                top: 1,
                left: 1,
                width: '100%-2',
                height: 1,
            });
            const chatInput = createTextbox({
                parent: gameBox,
                bottom: footerHeight,
                left: 0,
                width: chatWidth,
                height: inputHeight,
                border: { type: 'line' },
                style: {
                    border: { fg: 'white' },
                    focus: { fg: 'cyan' },
                    bg: 'black',
                },
                inputOnFocus: true,
                mouse: true,
            });
            return {
                gameBox,
                chatArea,
                playerList,
                spectatorList,
                footerStatus,
                chatInput,
                destroy: () => gameBox.destroy(),
            };
        };
        let lobbyUi = createLobbyUi();
        const updateFooterStatus = () => {
            if (!lobbyUi)
                return;
            const modeLabel = client.getSlot() ? 'Player' : 'Spectator';
            const chatMode = spectatorPublic ? 'Public' : 'Private';
            const chatHint = client.getSlot() ? 'Partyline' : `TSpec ${chatMode}`;
            lobbyUi.footerStatus.setContent(`{gray-fg}Mode:{/gray-fg} ${modeLabel}  {gray-fg}Chat:{/gray-fg} ${chatHint}`);
            this.screen.render();
        };
        const updatePlayerList = () => {
            if (!lobbyUi)
                return;
            const players = client.getPlayers();
            let content = '';
            for (let slot = 1; slot <= 6; slot++) {
                const player = players.find(p => p.slot === slot);
                if (player) {
                    const alive = player.alive ? '{green-fg}[OK]{/green-fg}' : '{red-fg}[OUT]{/red-fg}';
                    const team = player.team ? `{gray-fg}(${player.team}){/gray-fg}` : '';
                    content += `${slot}. {white-fg}${player.name}{/white-fg} ${alive} ${team}\n`;
                }
                else {
                    content += `${slot}. {gray-fg}(empty){/gray-fg}\n`;
                }
            }
            lobbyUi.playerList.setContent(content.trim());
            this.screen.render();
        };
        const updateSpectatorList = () => {
            if (!lobbyUi)
                return;
            const spectators = client.getSpectators();
            if (spectators.length === 0) {
                lobbyUi.spectatorList.setContent('{gray-fg}(none){/gray-fg}');
            }
            else {
                lobbyUi.spectatorList.setContent(spectators.join('\n'));
            }
            this.screen.render();
        };
        const addChatMessage = (msg) => {
            if (!lobbyUi)
                return;
            const current = lobbyUi.chatArea.getContent();
            const lines = current.split('\n').slice(-50);
            lines.push(msg);
            lobbyUi.chatArea.setContent(lines.join('\n'));
            lobbyUi.chatArea.setScrollPerc(100);
            this.screen.render();
        };
        const refreshOpponents = () => {
            if (!gameScreen)
                return;
            const mySlot = client.getSlot();
            const players = client.getPlayers().filter(p => p.slot !== mySlot);
            const opponents = players.map(player => {
                const board = externalAdapter.getBoardForSlot(player.slot) || (0, tetrinet_board_1.createTetriNetBoard)(12, 22);
                return {
                    id: player.name || `slot-${player.slot}`,
                    name: player.name || `Slot ${player.slot}`,
                    board,
                    level: player.level,
                    alive: player.alive,
                    hasImmunity: false,
                };
            });
            gameScreen.updateOpponents(opponents);
        };
        const registerLobbyEscape = (resolve) => {
            lobbyEscapeHandler = () => {
                client.disconnect();
                resolve();
            };
            this.screen.key(['escape'], lobbyEscapeHandler);
        };
        const unregisterLobbyEscape = () => {
            if (lobbyEscapeHandler) {
                this.screen.unkey(['escape'], lobbyEscapeHandler);
                lobbyEscapeHandler = null;
            }
        };
        const setupLobbyInput = () => {
            const ui = lobbyUi;
            if (!ui)
                return;
            ui.chatInput.on('submit', (value) => {
                const text = value?.trim();
                if (!text) {
                    ui.chatInput.clearValue();
                    ui.chatInput.focus();
                    return;
                }
                if (text === '/public') {
                    spectatorPublic = true;
                    updateFooterStatus();
                }
                else if (text === '/private') {
                    spectatorPublic = false;
                    updateFooterStatus();
                }
                else if (text.startsWith('/team ')) {
                    client.setTeam(text.substring(6).trim());
                }
                else if (text.startsWith('/me ')) {
                    client.sendAction(text.substring(4).trim());
                }
                else if (text === '/start') {
                    client.sendStartGame(true);
                }
                else if (text === '/stop') {
                    client.sendStartGame(false);
                }
                else if (text === '/pause') {
                    client.sendPause(true);
                }
                else if (text === '/resume') {
                    client.sendPause(false);
                }
                else if (text.startsWith('/version')) {
                    client.sendVersion('GRANDMASTER 1.0');
                }
                else {
                    if (!client.getSlot() && spectatorPublic && !text.startsWith('//')) {
                        client.sendChat(`//${text}`);
                    }
                    else {
                        client.sendChat(text);
                    }
                    if (client.getSlot()) {
                        const name = this.session.user?.username || this.state.playerName;
                        addChatMessage(`<${name}> ${text}`);
                    }
                }
                ui.chatInput.clearValue();
                ui.chatInput.focus();
                this.screen.render();
            });
            ui.chatInput.focus();
            this.screen.render();
        };
        updatePlayerList();
        updateSpectatorList();
        updateFooterStatus();
        setupLobbyInput();
        externalAdapter.onUpdate(() => refreshOpponents());
        client.drainBacklog();
        client.on('player:joined', (player) => {
            addChatMessage(`{green-fg}*** ${player.name} joined (slot ${player.slot}){/green-fg}`);
            updatePlayerList();
            refreshOpponents();
        });
        client.on('player:left', (data) => {
            addChatMessage(`{red-fg}*** Player left slot ${data.slot}{/red-fg}`);
            updatePlayerList();
            refreshOpponents();
        });
        client.on('player:team', (data) => {
            addChatMessage(`{cyan-fg}*** Slot ${data.slot} joined team: ${data.team}{/cyan-fg}`);
            updatePlayerList();
        });
        client.on('chat', (data) => {
            if (data.isAction) {
                addChatMessage(`{magenta-fg}* ${data.name} ${data.text}{/magenta-fg}`);
            }
            else if (data.isGameMessage) {
                addChatMessage(`{yellow-fg}[GAME] ${data.text}{/yellow-fg}`);
            }
            else {
                addChatMessage(`<${data.name}> ${data.text}`);
            }
        });
        client.on('spectator:list', () => {
            updateSpectatorList();
        });
        client.on('spectator:joined', (name) => {
            addChatMessage(`{magenta-fg}*** ${name} is spectating{/magenta-fg}`);
            updateSpectatorList();
        });
        client.on('spectator:left', (name) => {
            addChatMessage(`{magenta-fg}*** ${name} stopped spectating{/magenta-fg}`);
            updateSpectatorList();
        });
        client.on('spectator:chat', (data) => {
            if (data.isAction) {
                addChatMessage(`{magenta-fg}* ${data.name} ${data.text}{/magenta-fg}`);
            }
            else {
                addChatMessage(`[SPEC] <${data.name}> ${data.text}`);
            }
        });
        const handleGameStart = async (data) => {
            if (gameScreen)
                return;
            addChatMessage(data.inProgress
                ? `{yellow-fg}*** Game is already in progress{/yellow-fg}`
                : `{bold}{green-fg}*** GAME STARTING! ***{/green-fg}{/bold}`);
            if (lobbyUi) {
                lobbyUi.destroy();
                lobbyUi = null;
            }
            unregisterLobbyEscape();
            this.inputHandler.setEnabled(true);
            this.inputManager.resume(); // Re-enable grabKeys for game controls
            gameEngine = new tetrinet_engine_1.TetriNetEngine(this.state.settings, data.options || {});
            gameScreen = new tetrinet_screen_1.TetriNetScreen({
                screen: this.screen,
                engine: gameEngine,
                inputHandler: this.inputHandler,
                sounds: this.sounds,
                state: this.state,
                network: externalAdapter,
                playerName: this.state.playerName,
            });
            const unsubSpecial = gameEngine.onSpecialUsed((special, targetId) => {
                const targetSlot = targetId ? externalAdapter.getSlotForPlayerId(targetId) : client.getSlot();
                if (targetSlot) {
                    client.sendSpecial(targetSlot, special);
                }
            });
            const unsubLines = gameEngine.onLinesAdded((count) => {
                if (count === 1 || count === 2 || count === 4) {
                    client.sendRaw(`sb 0 cs${count} ${client.getSlot()}`);
                }
            });
            const unsubOver = gameEngine.onGameOver(() => {
                client.sendPlayerLost();
            });
            refreshOpponents();
            await gameScreen.run();
            unsubSpecial();
            unsubLines();
            unsubOver();
            gameScreen = null;
            gameEngine = null;
            this.inputHandler.setEnabled(false);
            this.inputManager.suspend(); // Disable grabKeys for lobby input
            lobbyUi = createLobbyUi();
            updatePlayerList();
            setupLobbyInput();
            this.screen.render();
        };
        client.on('game:start', (data) => {
            void handleGameStart(data);
        });
        client.on('game:end', () => {
            addChatMessage(`{bold}{yellow-fg}*** GAME OVER ***{/yellow-fg}{/bold}`);
            updatePlayerList();
        });
        client.on('player:lost', (data) => {
            addChatMessage(`{red-fg}*** Slot ${data.slot} topped out!{/red-fg}`);
            updatePlayerList();
            refreshOpponents();
        });
        client.on('special:used', (data) => {
            if (!gameEngine)
                return;
            const mySlot = client.getSlot();
            if (!mySlot)
                return;
            const targetSlot = data.targetSlot ?? 0;
            if (data.classicLines && (targetSlot === 0 || targetSlot === mySlot)) {
                gameEngine.addGarbage(data.classicLines, 'classic');
                return;
            }
            if (targetSlot === 0 || targetSlot === mySlot) {
                gameEngine.applyIncomingSpecial(data.special, `slot-${data.senderSlot}`);
            }
        });
        client.on('disconnected', () => {
            addChatMessage(`{red-fg}*** Disconnected from server{/red-fg}`);
        });
        client.on('error', (error) => {
            addChatMessage(`{red-fg}*** Error: ${error.message}{/red-fg}`);
        });
        await new Promise((resolve) => {
            registerLobbyEscape(resolve);
        });
        if (lobbyUi) {
            lobbyUi.destroy();
            lobbyUi = null;
        }
        unregisterLobbyEscape();
        this.inputHandler.setEnabled(true);
        this.inputManager.resume(); // Re-enable grabKeys
        if (this.session.bbs?.enableGameMode) {
            this.session.bbs.enableGameMode();
            console.log('[GRANDMASTER] Game mode re-enabled after TetriNET partyline');
        }
    }
    /**
     * Show CPU Battle mode (offline versus with bots)
     */
    async showCpuBattle() {
        this.currentScreen = 'lobby';
        // Disable grabKeys so List widgets can receive keyboard input
        this.inputManager.suspend();
        const nav = createMenuNav(this.session.bbsSession, this.screen);
        // Show difficulty selection
        const difficultyPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 15,
            border: { type: 'line' },
            label: ' Select Bot Difficulty ',
            style: { border: { fg: 'magenta' } },
            fixed: true,
        });
        const difficultyBox = (0, blessed_helpers_1.createList)({
            parent: difficultyPanel,
            top: 1,
            left: 1,
            width: 48,
            height: 13,
            style: {
                selected: { bg: 'blue', fg: 'white' },
            },
            items: [
                '1 - Beginner (Easy warm-up)',
                '3 - Amateur (Casual play)',
                '5 - Skilled (Default)',
                '7 - Expert (Challenging)',
                '9 - Grandmaster (Extreme)',
                '10 - God (Nearly Impossible)',
                '',
                'Back to Menu',
            ],
            keys: true,
            vi: true,
            mouse: true,
        });
        difficultyBox.focus();
        this.screen.render();
        const selection = await new Promise((resolve) => {
            const onSelect = (_item, index) => {
                this.screen.unkey(['escape'], onEscape);
                resolve(index);
            };
            const onEscape = () => {
                if (this.isModalOpen())
                    return;
                difficultyBox.removeListener('select', onSelect);
                this.screen.unkey(['escape'], onEscape);
                resolve(7); // Back
            };
            difficultyBox.on('select', onSelect);
            this.screen.key(['escape'], onEscape);
        });
        difficultyBox.destroy();
        difficultyPanel.destroy();
        nav.destroy();
        if (selection === 6 || selection === 7) {
            this.inputManager.resume();
            return; // Back to menu
        }
        // Map selection to difficulty
        const difficulties = [1, 3, 5, 7, 9, 10];
        const botDifficulty = difficulties[selection];
        // Re-enable grabKeys for game controls
        this.inputManager.resume();
        // Start CPU battle with selected difficulty
        await this.startCpuBattle(botDifficulty);
    }
    /**
     * Start versus game
     */
    async startVersusGame(mode) {
        if (!this.network)
            return;
        this.currentScreen = 'game';
        this.state.currentMode = 'versus';
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Create attack manager for multiplayer
        this.attackManager = new attack_system_1.AttackManager();
        // Create game engine with attack manager
        this.gameEngine = new game_1.GameEngine('versus', this.state.settings, this.sounds, this.attackManager);
        // Create versus screen
        const versusScreen = new versus_screen_1.VersusScreen(this.screen, this.gameEngine, this.inputHandler, this.sounds, this.state, this.network, this.attackManager, undefined, // botOrAI
        this.session);
        // Run game loop
        await versusScreen.run();
        // Submit score and broadcast match result
        const userId = this.session.user?.id || 'guest';
        const username = this.session.user?.username || this.state.playerName;
        await this.submitScore(userId, username);
        this.broadcastMatchResult(username);
        // Update stats after game
        await this.updateStats();
        // Re-enable mouse control for menus
        this.screen.program.enableMouse();
        // Clean up
        versusScreen.cleanup();
        this.stopVoice();
        this.gameEngine = null;
        this.attackManager = null;
        this.state.currentMode = null;
    }
    /**
     * Start CPU Battle (local versus with bots)
     */
    /**
     * @param opponentCount How many AI opponents to create. Defaults to 3 for
     *   the standalone "CPU Battle" menu entry. The lobby path passes the
     *   number of bots ACTUALLY in the lobby - this used to be hardcoded to 3,
     *   so a 1v1 against one bot spawned three CPUs, and because VersusScreen
     *   only shows the full opponent board when there is exactly one opponent
     *   (and a minimap grid otherwise) the player also got minimaps instead of
     *   the opponent's playfield.
     */
    async startCpuBattle(botDifficulty, opponentCount = 3) {
        this.currentScreen = 'game';
        this.state.currentMode = 'versus';
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Show loading message
        const loadingBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 7,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            content: `{bold}Initializing CPU Battle{/bold}\n\n` +
                `{gray-fg}Opponent Difficulty: ${botDifficulty}/10{/gray-fg}\n` +
                `{gray-fg}Loading AI...{/gray-fg}`,
            fixed: true,
        });
        this.screen.render();
        await this.sleep(800);
        loadingBox.destroy();
        // Create attack manager for bot battles
        this.attackManager = new attack_system_1.AttackManager();
        // Create game engine for human player with attack manager
        this.gameEngine = new game_1.GameEngine('versus', this.state.settings, this.sounds, this.attackManager);
        // Create AI opponents (3 opponents at selected difficulty)
        const { VersusAI } = await Promise.resolve().then(() => __importStar(require('./ai/versus-ai')));
        const versusAI = new VersusAI();
        const aiOpponents = versusAI.createOpponents(opponentCount, botDifficulty, this.state.settings, this.sounds);
        // Create versus screen with AI opponents
        const versusScreen = new versus_screen_1.VersusScreen(this.screen, this.gameEngine, this.inputHandler, this.sounds, this.state, null, // No network for CPU battle
        this.attackManager, versusAI, // Pass AI controller instead of botDifficulty
        this.session);
        // Run game loop
        await versusScreen.run();
        // Submit score and broadcast match result
        const cpuUserId = this.session.user?.id || 'guest';
        const cpuUsername = this.session.user?.username || this.state.playerName;
        await this.submitScore(cpuUserId, cpuUsername);
        this.broadcastMatchResult(cpuUsername);
        // Update stats after game
        await this.updateStats();
        // Re-enable mouse control for menus
        this.screen.program.enableMouse();
        // Clean up AI
        versusAI.destroy();
        versusScreen.cleanup();
        this.stopVoice();
        this.gameEngine = null;
        this.attackManager = null;
        this.state.currentMode = null;
    }
    /**
     * Show settings screen
     */
    async showSettings() {
        this.currentScreen = 'settings';
        this.inputManager.suspend();
        const nav = createMenuNav(this.session.bbsSession, this.screen);
        const settingsScreen = new settings_screen_1.SettingsScreen(this.screen, this.state, this.sounds, this.session.bbsSession);
        await settingsScreen.show();
        nav.destroy();
        this.inputManager.resume();
        // Update input handler with any changed key bindings
        this.inputHandler.updateConfig(this.state.settings.keyBindings);
        // Persist settings to disk for this user
        this.saveSettings();
    }
    /**
     * Show statistics/leaderboard screen
     */
    async showStats() {
        this.currentScreen = 'stats';
        this.inputManager.suspend();
        const nav = createMenuNav(this.session.bbsSession, this.screen);
        const leaderboardScreen = new leaderboard_screen_1.LeaderboardScreen(this.screen, this.highScores, this.sounds, this.state.playerName);
        await leaderboardScreen.show();
        nav.destroy();
        this.inputManager.resume();
    }
    /**
     * Show player manual
     */
    async showManual() {
        this.inputManager.suspend();
        return new Promise((resolve) => {
            (0, manual_1.showManual)(this.screen, () => {
                this.screen.render();
                this.inputManager.resume();
                resolve();
            });
        });
    }
    /**
     * Update statistics after game
     */
    async updateStats() {
        if (!this.gameEngine)
            return;
        const result = this.gameEngine.getResult();
        const stats = this.state.stats;
        stats.gamesPlayed++;
        stats.totalLines += result.linesCleared;
        stats.totalScore += result.score;
        stats.tetrisCount += result.tetrisCount;
        stats.tSpinCount += result.tSpinCount;
        stats.perfectClears += result.perfectClears;
        if (result.combo > stats.highestCombo) {
            stats.highestCombo = result.combo;
        }
        if (result.level > stats.bestLevel) {
            stats.bestLevel = result.level;
        }
        // Compare grades
        if (this.compareGrades(result.grade, stats.bestGrade) > 0) {
            stats.bestGrade = result.grade;
        }
        // Sprint time
        if (this.state.currentMode === 'sprint' && result.time) {
            if (!stats.fastestSprint || result.time < stats.fastestSprint) {
                stats.fastestSprint = result.time;
            }
        }
        // Save high score
        const { isHighScore, rank } = this.highScores.addScore(this.state.playerName, result);
        // Show high score notification if achieved
        if (isHighScore && rank !== null) {
            await this.showHighScoreNotification(rank, result.score);
        }
    }
    /**
     * Submit score to multiplayer server
     */
    async submitScore(userId, username) {
        if (!this.gameEngine)
            return;
        // Get game result
        const result = this.gameEngine.getResult();
        // Finalize replay
        const replay = this.gameEngine.finalizeRecording();
        // Submit to server
        try {
            const submission = await this.multiplayerServer.submitScore(userId, username, result, replay || undefined);
            if (submission.accepted) {
                // Broadcast score to livechat feed and Discord
                this.broadcastScore(username, result, submission);
            }
            else {
                // Submission rejected (validation failed, anti-cheat, etc.)
                console.warn('Score submission rejected:', submission.reason);
            }
        }
        catch (error) {
            // Failed to submit (network error, server down, etc.)
            console.error('Failed to submit score:', error);
            // Don't throw - game should continue even if submission fails
        }
    }
    /**
     * Broadcast score to livechat feed and Discord webhook
     */
    broadcastScore(username, result, submission) {
        if (!this.session.bbs?.emitCustomEvent)
            return;
        const modeName = this.state.currentMode === 'tetrinet' ? 'TetriNET'
            : this.state.currentMode === 'sprint' ? 'Sprint'
                : this.state.currentMode === 'ultra' ? 'Ultra'
                    : this.state.currentMode === 'marathon' ? 'Marathon'
                        : this.state.currentMode === 'master' ? 'Master'
                            : this.state.currentMode || 'Classic';
        const parts = [];
        parts.push(`${modeName} - Score: ${result.score.toLocaleString()}`);
        parts.push(`Grade: ${result.grade}`);
        parts.push(`Level: ${result.level}`);
        parts.push(`Lines: ${result.lines}`);
        if (result.time) {
            const mins = Math.floor(result.time / 60000);
            const secs = Math.floor((result.time % 60000) / 1000);
            parts.push(`Time: ${mins}:${secs.toString().padStart(2, '0')}`);
        }
        if (submission.rank)
            parts.push(`Rank: #${submission.rank}`);
        if (submission.isPersonalBest)
            parts.push('NEW PB!');
        try {
            this.session.bbs.emitCustomEvent('score', parts.join(' | '), {
                score: result.score,
                grade: result.grade,
                level: result.level,
                lines: result.lines,
                mode: modeName,
                time: result.time,
                rank: submission.rank,
                isPersonalBest: submission.isPersonalBest || false,
                isTopTen: submission.isTopTen || false,
            });
        }
        catch (err) {
            console.error('[GRANDMASTER] Failed to broadcast score:', err);
        }
    }
    /**
     * Broadcast multiplayer match result (winner/loser) to livechat and Discord
     */
    broadcastMatchResult(localUsername) {
        if (!this.session.bbs?.emitCustomEvent)
            return;
        if (!this.network)
            return;
        const matchState = this.network.getMatchState();
        if (!matchState || matchState.players.length < 2)
            return;
        const result = this.gameEngine?.getResult();
        if (!result)
            return;
        const isGameOver = result.completed || (result.score > 0);
        if (!isGameOver)
            return;
        // Determine winner in versus mode
        const localAlive = result.lines > 0 || result.score > 0;
        const opponents = matchState.players.filter(p => p.name !== localUsername);
        const opponentNames = opponents.map(p => p.name).join(', ') || 'CPU';
        // Check if local player won (survived) or lost (game over first)
        const gameState = this.gameEngine?.getState();
        const localWon = gameState?.status === 'complete' || gameState?.status !== 'gameover';
        let message;
        if (matchState.players.length === 2) {
            // 1v1
            if (localWon) {
                message = `defeated ${opponentNames} in Versus!`;
            }
            else {
                message = `was defeated by ${opponentNames} in Versus`;
            }
        }
        else {
            // Battle royale / team
            const placement = localWon ? '1st' : `${matchState.players.length}th`;
            message = `finished ${placement} in ${matchState.mode.replace('_', ' ')} (${matchState.players.length} players)`;
        }
        try {
            this.session.bbs.emitCustomEvent('match_result', message, {
                mode: matchState.mode,
                players: matchState.players.length,
                winner: localWon ? localUsername : opponentNames,
                loser: localWon ? opponentNames : localUsername,
                score: result.score,
                level: result.level,
                grade: result.grade,
            });
        }
        catch (err) {
            console.error('[GRANDMASTER] Failed to broadcast match result:', err);
        }
    }
    /**
     * Show high score notification
     */
    async showHighScoreNotification(rank, score) {
        const rankSuffix = (r) => {
            if (r === 1)
                return 'st';
            if (r === 2)
                return 'nd';
            if (r === 3)
                return 'rd';
            return 'th';
        };
        const notificationBox = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 10,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'yellow' } },
            content: `{bold}{yellow-fg}NEW HIGH SCORE!{/yellow-fg}{/bold}\n\n` +
                `{white-fg}Rank: {bold}${rank}${rankSuffix(rank)}{/bold}{/white-fg}\n` +
                `{white-fg}Score: {bold}${score.toLocaleString()}{/bold}{/white-fg}\n\n` +
                `{gray-fg}Press any key to continue...{/gray-fg}`,
            fixed: true,
        });
        this.screen.render();
        await this.waitForKey();
        notificationBox.destroy();
    }
    /**
     * Compare two grades (-1, 0, 1)
     */
    compareGrades(a, b) {
        const GRADE_ORDER = [
            '9', '8', '7', '6', '5', '4', '3', '2', '1',
            'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9',
            'S10', 'S11', 'S12', 'S13',
            'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
            'M', 'MK', 'MV', 'MO', 'GM',
        ];
        return GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b);
    }
    /**
     * Parse mode string to GameMode
     */
    parseMode(mode) {
        const MODE_MAP = {
            'MASTER': 'master',
            'DEATH': 'death',
            'SHIRASE': 'death',
            'SPRINT': 'sprint',
            'MARATHON': 'marathon',
            'ULTRA': 'ultra',
            'ZEN': 'zen',
            'VERSUS': 'versus',
            'TRAINING': 'training',
        };
        return MODE_MAP[mode] || null;
    }
    /**
     * Quit the application
     */
    async quit() {
        // Clear screen buffer before exit to prevent ghosting in next door
        // This ensures tetrinet lobby, menus, etc. don't leak into BBS or next GMASTER session
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        this.screen.render();
        // Wait for clear to propagate (critical for modem speeds)
        await this.sleep(200);
        // Stop music and cleanup audio
        this.sounds.destroy();
        console.log('[GRANDMASTER] Audio stopped');
        // Disable door input (restores BBS state)
        // DoorInputManager handles all cleanup in correct order
        this.inputManager.disable();
        // Disconnect from network to prevent socket leaks
        if (this.network) {
            this.network.disconnect();
            console.log('[GRANDMASTER] Network disconnected');
        }
        // Destroy screen (this will cleanup blessed state)
        this.screen.destroy();
    }
    /**
     * Wait for any keypress
     */
    waitForKey() {
        return new Promise((resolve) => {
            const handler = () => {
                this.screen.removeListener('keypress', handler);
                resolve();
            };
            this.screen.on('keypress', handler);
        });
    }
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.GrandmasterApp = GrandmasterApp;
/**
 * Create and run the GRANDMASTER application
 */
async function createApp(session, initialMode) {
    const app = new GrandmasterApp(session);
    await app.run(initialMode);
}
//# sourceMappingURL=app.js.map