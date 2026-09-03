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
exports.GrandmasterApp = exports.MENU_ACTION_KEYS = void 0;
exports.parseTriggerStr = parseTriggerStr;
exports.buildGamepadMapping = buildGamepadMapping;
exports.createApp = createApp;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const terminal_mode_1 = require("@amiexpress/bbs-door-sdk/utils/terminal-mode");
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const game_1 = require("./core/game");
const soft_drop_1 = require("./core/soft-drop");
const menu_1 = require("./ui/menu");
const game_screen_1 = require("./ui/game-screen");
const settings_screen_1 = require("./ui/settings-screen");
const lobby_screen_1 = require("./ui/lobby-screen");
const versus_screen_1 = require("./ui/versus-screen");
const spectator_screen_1 = require("./ui/spectator-screen");
const solo_broadcast_1 = require("./network/solo-broadcast");
const leaderboard_screen_1 = require("./ui/leaderboard-screen");
const panels_screen_1 = require("./ui/panels-screen");
const puzzle_1 = require("./core/panels/puzzle");
const replay_recorder_1 = require("./core/panels/replay-recorder");
const replay_1 = require("./core/panels/replay");
const panel_replay_store_1 = require("./server/panel-replay-store");
const chooser_1 = require("./ui/panels/chooser");
const panel_broker_transport_1 = require("./network/panel-broker-transport");
const panel_netplay_session_1 = require("./network/panel-netplay-session");
const panel_transport_1 = require("./network/panel-transport");
const consts_1 = require("./core/panels/consts");
const stage_clear_1 = require("./core/panels/stage-clear");
const stack_1 = require("./core/panels/stack");
const generator_source_1 = require("./core/panels/generator-source");
const level_data_1 = require("./core/panels/level-data");
const score_report_1 = require("./core/panels/score-report");
const panels_versus_screen_1 = require("./ui/panels-versus-screen");
const simulated_stack_1 = require("./core/panels/simulated-stack");
const panel_ai_1 = require("./ai/panel-ai");
const challenge_mode_1 = require("./core/panels/challenge-mode");
const attack_patterns_1 = require("./core/panels/attack-patterns");
const consts_2 = require("./core/panels/consts");
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
const score_report_2 = require("./core/tetrinet/score-report");
const tetrinet_ai_1 = require("./ai/tetrinet-ai");
const winlist_1 = require("./core/tetrinet/winlist");
const tetrinet_board_1 = require("./core/tetrinet/tetrinet-board");
const multiplayer_server_1 = require("./server/multiplayer-server");
const manual_1 = require("./ui/manual");
const training_config_1 = require("./ui/training-config");
const path = __importStar(require("path"));
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const mission_store_1 = require("./core/mission-store");
const mission_run_1 = require("./core/mission-run");
const mission_progress_1 = require("./core/mission-progress");
const mission_select_1 = require("./ui/mission-select");
const mission_briefing_1 = require("./ui/mission-briefing");
const mission_editor_1 = require("./ui/mission-editor");
// Default gamepad button mapping for GrandMaster.
// Parse a trigger string (e.g. "button:a", "dpad:left", "axis:left-x:negative")
// into a GamepadTrigger object. Returns null for unknown formats.
const BUTTON_BY_NAME = {
    a: bbs_door_sdk_1.GamepadButton.A, b: bbs_door_sdk_1.GamepadButton.B, x: bbs_door_sdk_1.GamepadButton.X, y: bbs_door_sdk_1.GamepadButton.Y,
    l1: bbs_door_sdk_1.GamepadButton.L1, r1: bbs_door_sdk_1.GamepadButton.R1, l2: bbs_door_sdk_1.GamepadButton.L2, r2: bbs_door_sdk_1.GamepadButton.R2,
    select: bbs_door_sdk_1.GamepadButton.SELECT, start: bbs_door_sdk_1.GamepadButton.START,
    l3: bbs_door_sdk_1.GamepadButton.L3, r3: bbs_door_sdk_1.GamepadButton.R3, home: bbs_door_sdk_1.GamepadButton.HOME,
};
function parseTriggerStr(t) {
    if (t.startsWith('button:')) {
        const btn = t.slice(7);
        const button = BUTTON_BY_NAME[btn];
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
        // Named sticks, or a bare axis number for anything else the pad exposes.
        const axis = axisMap[axisName] ?? (/^\d+$/.test(axisName) ? Number(axisName) : undefined);
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
/**
 * Which game action drives which menu key.
 *
 * A player binds their pad ONCE, for the game, and those bindings have to
 * work the menus too - otherwise every button can be bound and the menu is
 * still dead, which is exactly how this was reported (8BitDo NES30 Pro,
 * 2026-08-25). The menu used a hardcoded D-pad/A/B/Start scheme and never
 * looked at the saved bindings at all.
 */
exports.MENU_ACTION_KEYS = {
    left: { name: 'left', sequence: '\x1b[D' },
    right: { name: 'right', sequence: '\x1b[C' },
    soft_drop: { name: 'down', sequence: '\x1b[B' },
    hard_drop: { name: 'up', sequence: '\x1b[A' },
    rotate_cw: { name: 'enter', sequence: '\r' },
    rotate_ccw: { name: 'escape', sequence: '\x1b' },
    pause: { name: 'escape', sequence: '\x1b' },
};
// Creates a menu-navigation GIM for non-game screens (menus, settings, etc.).
// The player's own bindings drive it, with the defaults underneath, plus
// A/Start = Enter and B/Select = Escape so a pad works before it is bound.
// Destroy the returned object when leaving the screen to restore the previous handler.
function createMenuNav(bbsSession, screen, savedBindings = {}) {
    const gim = new bbs_door_sdk_1.GamepadInputManager(bbsSession);
    // Feed the key through Screen's REAL dispatch, not screen.emit().
    //
    // screen.emit('keypress') only runs listeners attached to the Screen
    // object; it never reaches the FOCUSED element, which is where a menu's
    // List widget reads its keys. So a bound pad drove the game (whose action
    // mapper presses keys directly) and did nothing in the menus - reported
    // exactly that way, 2026-08-25.
    const emit = (name, sequence) => {
        const key = { name, full: name, sequence, shift: false, ctrl: false, meta: false };
        if (typeof screen._handleKey === 'function') {
            screen._handleKey(sequence, key);
        }
        else {
            screen.emit('keypress', sequence, key);
        }
    };
    const mapping = buildGamepadMapping(GAMEPAD_MAPPING, savedBindings);
    /** Every trigger that should produce a given menu key. */
    const triggersFor = (key) => {
        const found = [];
        for (const [action, menuKey] of Object.entries(exports.MENU_ACTION_KEYS)) {
            if (menuKey?.name !== key.name)
                continue;
            found.push(...(mapping[action] ?? []));
        }
        return found;
    };
    const menuKeys = Object.values(exports.MENU_ACTION_KEYS).filter(Boolean);
    gim.on('dpad', (dir) => {
        for (const key of menuKeys) {
            if (triggersFor(key).some(t => t.type === 'dpad' && t.direction === dir)) {
                emit(key.name, key.sequence);
                return;
            }
        }
    });
    gim.on('axis', (axis, value) => {
        if (Math.abs(value) < 0.7)
            return;
        const direction = value > 0 ? 'positive' : 'negative';
        for (const key of menuKeys) {
            if (triggersFor(key).some(t => t.type === 'axis' && t.axis === axis && t.direction === direction)) {
                emit(key.name, key.sequence);
                return;
            }
        }
    });
    for (const btn of ['a', 'b', 'x', 'y', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'home']) {
        gim.on(`button:${btn}`, (pressed) => {
            if (!pressed)
                return;
            const button = BUTTON_BY_NAME[btn];
            for (const key of menuKeys) {
                if (triggersFor(key).some(t => t.type === 'button' && t.button === button)) {
                    emit(key.name, key.sequence);
                    return;
                }
            }
        });
    }
    // Universal fallbacks, so an unbound pad still works a menu.
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
    /**
     * Which screen the player is on.
     *
     * A property rather than a field so the touch scheme cannot drift out of
     * sync with it: there are ten places that change screen, and a phone player
     * who lands on a menu still holding piece controls cannot choose anything
     * (reported live 2026-08-25). Only 'game' is play; a lobby is a list, and
     * so are settings and stats.
     */
    get currentScreen() {
        return this._currentScreen;
    }
    set currentScreen(screen) {
        if (this._currentScreen === screen)
            return;
        this._currentScreen = screen;
        this.announceInputMode();
    }
    /**
     * Tell the terminal whether a menu or the playfield is showing.
     *
     * A phone in gesture mode reads a tap as ROTATE while a game is up and as
     * ENTER while a menu is - so a door that never says which it is showing
     * leaves the player unable to choose anything. The setter above only fires
     * on a CHANGE, and this door opens on its menu with _currentScreen already
     * set to 'menu', so the opening screen was never announced and the
     * terminal kept its default of 'game': tapping the main menu rotated a
     * piece that was not there (reported 2026-08-26).
     */
    announceInputMode() {
        try {
            this.session?.bbs?.setInputMode?.(this._currentScreen === 'game' ? 'game' : 'menu');
        }
        catch {
            // A door must never die because the terminal could not be told.
        }
    }
    constructor(session) {
        /**
         * 80x25 like the board, or the caller's whole terminal.
         *
         * Starts FIXED, unlike the editors: this door's menus, attract screen and
         * solo playfield are 80-column pieces of art, while the versus screen is
         * a layout that gains from the room (ui/versus-layout.ts - three opponent
         * boards at 120 columns, five at 160). So the room is something a player
         * ASKS for with Alt+Enter, not something the door takes on their behalf.
         */
        this.terminalMode = null;
        this.gameEngine = null;
        /** Who has cleared which mission, and how fast (core/mission-progress.ts). */
        this.missionProgress = new mission_progress_1.MissionProgress();
        this.network = null;
        this.attackManager = null;
        this._currentScreen = 'menu';
        this._voiceRoom = null;
        this._voiceSocketHandlers = [];
        /**
         * Show TetriNET lobby for classic TetriNET gameplay
         */
        /** TetriNET's own win-points table (core/tetrinet/winlist.ts). */
        this.tetrinetWinList = new winlist_1.WinList();
        this.session = session;
        this.state = this.createInitialState();
        this.loadSettings(); // Load per-user settings from disk
        this.sounds = new sounds_1.SoundEngine(session);
        this.highScores = new high_scores_1.HighScoreManager();
        this.panelReplays = new panel_replay_store_1.PanelReplayStore();
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
            // debug:true made blessed-helpers HEX-DUMP every keystroke
            // (Buffer→hex + console.log per key) - synchronous stdout writes in
            // the input path, the same back-pressure class that froze DOORMAN.
            debug: false,
            debugName: 'GRANDMASTER'
        });
        // Alt+Enter, in every door that has a size to change. Fixed to start:
        // a player opts into the room, and gets the board's 80 columns back on
        // the way out whatever they chose.
        this.terminalMode = (0, terminal_mode_1.createTerminalModeSwitch)({
            bbs: this.session.bbs,
            screen: this.screen,
            start: 'fixed',
            onRelayout: () => this.relayout(),
        });
        // Create input handler with user's key bindings
        this.inputHandler = new handler_1.InputHandler(this.screen, session, this.state.settings.keyBindings);
        // The player's movement timing. Applied here AND after loadSettings,
        // because the handler is built before their saved settings are read.
        this.inputHandler.setTiming(this.state.settings.das, this.state.settings.arr, (0, soft_drop_1.softDropIntervalMs)(this.state.settings.softDropSpeed, this.state.settings.rotationSystem));
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
                // TGM3 is the reference this door is built on: DAS is 16 frames and
                // a charged DAS then slides the piece ONE CELL PER FRAME. At the
                // arcade's 60fps that is 267ms and 16.7ms.
                //
                // This door renders at 20fps (game-screen RENDER_FPS), so one cell
                // per VISIBLE frame is 50ms. The old 10ms moved five cells between
                // rendered frames, which is why holding left or right teleported the
                // piece across the board (reported live 2026-08-25: "WAY too fast").
                das: 267, // Delayed Auto-Shift (ms) - TGM3's 16 frames
                arr: 50, // Auto-Repeat Rate (ms) - one cell per rendered frame
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
                // ...but keyBindings is an OBJECT, and Object.assign replaces it
                // whole. A file written before an action existed therefore deletes
                // that action's keys outright: every player who had ever saved
                // settings had no TetriNET special keys at all, because 1-6, 0, TAB
                // and Backspace were added after their file was written. The keys
                // arrived at the door and matched nothing ("the specials still
                // don't fire on tab or number", four reports, 2026-08-26).
                if (saved.keyBindings) {
                    this.state.settings.keyBindings = {
                        ...config_1.DEFAULT_KEYS,
                        ...saved.keyBindings,
                    };
                }
                // Anyone who played before 2026-08-25 has an ARR of 10ms saved -
                // five cells per rendered frame, which reads as the piece
                // teleporting. Nobody chose that; it was the old default. Raise it
                // to one cell per frame, and leave any deliberately slower value
                // alone.
                const MIN_SANE_ARR_MS = 50;
                if (typeof this.state.settings.arr === 'number' && this.state.settings.arr < MIN_SANE_ARR_MS) {
                    console.log(`[GRANDMASTER] Raising saved ARR ${this.state.settings.arr}ms to ${MIN_SANE_ARR_MS}ms (one cell per rendered frame)`);
                    this.state.settings.arr = MIN_SANE_ARR_MS;
                }
                // Settings are loaded AFTER the input handler is built, so hand it
                // the timing again - otherwise the saved DAS/ARR never reach it.
                this.inputHandler?.setTiming(this.state.settings.das, this.state.settings.arr, (0, soft_drop_1.softDropIntervalMs)(this.state.settings.softDropSpeed, this.state.settings.rotationSystem));
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
            // The screen has to be ABLE to become the size Alt+Enter asks for;
            // left fixed, Screen pins itself to 80x25 whatever the terminal says.
            responsive: true,
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
        // Say which mode we open in. The setter only speaks on a CHANGE, and
        // this door starts on its menu, so without this the terminal never
        // hears 'menu' and a phone tap rotates instead of choosing.
        this.announceInputMode();
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
        const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
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
            case 'tetris_attack':
                await this.startTetrisAttack();
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
            case 'mission':
                await this.startMission();
                break;
            case 'spectate':
                await this.showSpectate();
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
        await this.startGame('training', config.startLevel, config.goal);
    }
    /**
     * MISSION mode: pick one from the pack, play it, record a clear.
     *
     * The pack is JSON on disk (data/missions/starter.json) so a sysop can ship
     * another without touching the door, and the loader refuses a pack whose
     * objectives this engine cannot judge rather than handing the player a
     * mission that can never end (core/mission-pack.ts).
     */
    /**
     * Is the caller a sysop?
     *
     * 255 is the board's own top level. The editor writes a file every player
     * on this board then plays from, so it is the one thing in this door that
     * asks who is holding the keyboard.
     */
    isSysop() {
        const user = this.session.user;
        return (user?.accessLevel ?? user?.secLevel ?? 0) >= 255;
    }
    async startMission() {
        let pack;
        try {
            // assets/, not data/: a pack is CONTENT that ships with the door, and
            // data/ is gitignored runtime state (the database, high scores, the
            // mission progress record). A pack put there would never have reached
            // the board at all.
            // The shipped pack, plus any a sysop wrote on this board. A sysop
            // pack lives under data/ because assets/ is the door's checkout and
            // the Doors volume sync only ever adds - an edit there would be
            // overwritten by the next deploy (core/mission-store.ts).
            const doorRoot = (0, settings_1.resolveDoorRoot)(__dirname);
            const stored = (0, mission_store_1.listPacks)(doorRoot, path.join(doorRoot, 'data'));
            if (stored.packs.length === 0) {
                throw new Error(stored.problems.join('\n') || 'no mission packs found');
            }
            pack = stored.packs[0].pack;
        }
        catch (error) {
            await this.showMessage('MISSIONS', `Could not load the mission pack:\n${error.message}`);
            return;
        }
        // Pick, read the briefing, and start - or go back to the pack. A player
        // who has just chosen from a one-line list has not yet been told the
        // clock, the starting speed, the garbage or the rule changes, and meets
        // all of them at once when the first piece falls.
        this.inputManager.suspend();
        const mission = await (0, mission_briefing_1.pickMission)(pack, (missionId) => this.missionProgress.getClear(this.state.playerName, pack.name, missionId), {
            select: (p) => (0, mission_select_1.showMissionSelect)(this.screen, p, this.missionProgress, this.state.playerName, this.isSysop()),
            brief: (m, clear) => (0, mission_briefing_1.showMissionBriefing)(this.screen, m, clear),
            // Only a sysop is offered this, and only a sysop's key reaches it.
            edit: async (p) => {
                if (!this.isSysop())
                    return p;
                const doorRoot = (0, settings_1.resolveDoorRoot)(__dirname);
                await (0, mission_editor_1.showMissionEditor)(this.screen, p, path.join(doorRoot, 'data'));
                const reloaded = (0, mission_store_1.listPacks)(doorRoot, path.join(doorRoot, 'data'));
                return reloaded.packs.find((entry) => entry.pack.name === p.name)?.pack
                    ?? reloaded.packs[0]?.pack ?? p;
            },
        });
        this.inputManager.resume();
        if (!mission)
            return;
        const run = new mission_run_1.MissionRun(mission);
        await this.startGame('mission', mission.startLevel, null, run);
        const progress = run.getProgress();
        if (progress.outcome === 'cleared') {
            const seconds = this.lastRunSeconds();
            const clear = this.missionProgress.recordClear(this.state.playerName, pack.name, mission.id, seconds);
            await this.showMessage('MISSION CLEAR', `${mission.name}\n\n${run.describe()}\n\nBest: ${(0, mission_select_1.formatClearTime)(clear.seconds)}`);
        }
        else {
            await this.showMessage('MISSION FAILED', `${mission.name}\n\n${run.describe()}\n\n${progress.failure ?? 'not finished'}`);
        }
    }
    /** Seconds the run that just ended lasted. */
    lastRunSeconds() {
        const state = this.gameEngine?.getState();
        if (!state?.startTime)
            return 0;
        return ((state.endTime ?? Date.now()) - state.startTime) / 1000;
    }
    /**
     * Start a game in specified mode
     */
    async startGame(mode, startLevel = 0, practiceGoal = null, missionRun = null) {
        this.currentScreen = 'game';
        this.state.currentMode = mode;
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Create game engine
        this.gameEngine = new game_1.GameEngine(mode, this.state.settings, this.sounds, undefined, startLevel);
        // PRACTICE goal (training only) - set before start(), which the game
        // screen calls, so the run knows its finish line from the first piece.
        this.gameEngine.setPracticeGoal(practiceGoal);
        // MISSION: the modifiers hold for the whole run, the garbage is seeded
        // before the first piece, and every lock is reported to the judge.
        if (missionRun) {
            const mission = missionRun.getMission();
            this.gameEngine.setMissionModifiers(mission.modifiers);
            this.gameEngine.onLock((event) => { missionRun.onLock(event); });
            if (mission.garbageRows > 0)
                this.gameEngine.seedGarbageRows(mission.garbageRows);
        }
        // Start replay recording
        const userId = this.session.user?.id || 'guest';
        const username = this.session.user?.username || this.state.playerName;
        this.gameEngine.startRecording(userId, username);
        // Create gamepad mapper — merge user's saved bindings over the defaults
        const gamepadMapper = this.createGamepadMapper();
        // Create game screen
        const gameScreen = new game_screen_1.GameScreen(this.screen, this.gameEngine, this.inputHandler, this.sounds, this.state, gamepadMapper, missionRun);
        // Publish this game so "Watch a game" can find it.
        //
        // Only the versus lobby ever registered anything, so every solo mode was
        // invisible to spectators and the watch list was always empty. Strictly
        // best-effort: a board with no broker still plays.
        const broadcast = new solo_broadcast_1.SoloBroadcast({
            network: this.ensureNetwork(),
            mode,
            getState: () => (this.gameEngine ? this.gameEngine.getState() : null),
        });
        await broadcast.start();
        // Run game loop
        try {
            await gameScreen.run();
        }
        finally {
            await broadcast.stop();
        }
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
     * The network manager, created on first use.
     *
     * showSpectate and the versus lobby both built this by hand; a solo game
     * needs it too, so there is one place that does it.
     */
    ensureNetwork() {
        if (!this.network) {
            this.network = new network_manager_1.GrandmasterNetworkManager(this.session.bbsSession);
        }
        return this.network;
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
        const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
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
                style: { bg: 'black', border: { fg: 'red' } },
                // A notice, so centre it on both axes - reported as uncentred 2026-08-25.
                align: 'center',
                valign: 'middle',
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
            style: { bg: 'black', border: { fg: 'cyan' } },
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
                    style: { bg: 'black', border: { fg: 'cyan' } },
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
            // The id the NETWORK MANAGER uses, not one derived here a second time.
            // The lobby widget decides who is host by comparing this against the
            // ids of the players the broker reports, and identity became
            // <user>@<node> when a player stopped being an account and became a
            // session - so a second derivation from session.user.id matched
            // nothing, nobody was host, and both sides sat on "Waiting for host to
            // start..." forever (reported 2026-08-31).
            const localPlayerId = this.network?.getLocalPlayerId()
                ?? this.session.user?.id ?? this.state.playerName;
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
                    await this.startCpuBattle(botDifficulty, Math.max(1, bots.length), result.settings);
                }
                else {
                    await this.startVersusGame(result.mode, result.settings);
                }
                // Back to the LOBBY, not out to the main menu.
                //
                // "when a vs game ends i get thrown out to the main menu, i should
                // stay in the lobby for more games" - and the people you just played
                // are still sitting in it. Returning here meant every rematch cost
                // both players a walk back through the menu and a fresh search for
                // each other.
                //
                // The lobby is told the match is over first: the broker put it into
                // 'playing' to start the game and nothing ever put it back, so
                // without this the room could never host a second game and would not
                // be offered to anyone searching.
                this.network?.endMatch();
                continue;
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
     * TETRIS ATTACK / Panel de Pon.
     *
     * The engine is fed one input CHARACTER per frame, the same way a replay or a
     * networked opponent feeds it, so cursor auto-repeat, the every-other-frame
     * swap rule and raise gating all come from the engine rather than a second
     * implementation here that could drift from it.
     *
     * Held keys are read two ways, because the two screens differ. A browser
     * delivers real key-down and key-up edges, so DoorInputManager knows exactly
     * what is down. Telnet has no key-up at all, so a keypress marks a key held
     * for a short window and the player gets discrete steps rather than a hold -
     * the same compromise input/handler.ts already makes for the Tetris modes.
     */
    async startTetrisAttack() {
        this.currentScreen = 'game';
        this.state.currentMode = 'tetris_attack';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { loadSpriteSheet } = require('@amiexpress/bbs-door-sdk/engines/graphics/cell-art');
        const sheet = loadSpriteSheet(path.join(__dirname, 'sprites'));
        const mode = await this.chooseTetrisAttackMode();
        if (!mode) {
            this.currentScreen = 'menu';
            return;
        }
        // Challenge starts at difficulty 1 stage 1; the ladder is walked by the
        // mode's own screen once it exists.
        const challengeStage = (0, challenge_mode_1.createStages)(1, attack_patterns_1.hasChallengeFile)[0];
        const seed = Math.floor(Math.random() * 2147483000) + 1;
        // A mode with garbage in it MUST be on a modern level: the classic presets
        // have no GARBAGE_HOVER, so the first garbage a player clears throws.
        const hasGarbage = mode === 'vscpu' || mode === 'challenge';
        const stack = new stack_1.Stack({
            levelData: hasGarbage ? (0, level_data_1.getModern)(level_data_1.GARBAGE_MODE_LEVEL) : (0, level_data_1.getClassicEndless)('normal'),
            panelSource: new generator_source_1.GeneratorSource(seed, true),
            doCountdown: true,
            // Time Attack is two minutes; Endless runs until the stack tops out.
            timeLimit: mode === 'timeattack' ? consts_2.TIME_ATTACK_FRAMES : undefined,
        });
        stack.startingState();
        /** Telnet fallback: a keypress counts as held for this long. */
        const HOLD_MS = 100;
        const pressedUntil = new Map();
        const onKeypress = (_ch, key) => {
            if (!key || !key.name)
                return;
            pressedUntil.set(key.name, Date.now() + HOLD_MS);
        };
        this.screen.on('keypress', onKeypress);
        const keyStateAvailable = typeof this.inputManager.isKeyStateActive === 'function';
        const isDown = (names) => {
            const manager = this.inputManager;
            if (keyStateAvailable && manager.isKeyStateActive?.() && manager.isHeld) {
                return names.some((name) => manager.isHeld(name));
            }
            const now = Date.now();
            return names.some((name) => (pressedUntil.get(name) ?? 0) > now);
        };
        const readInput = () => ({
            up: isDown(['up']),
            down: isDown(['down']),
            left: isDown(['left']),
            right: isDown(['right']),
            swap: isDown(['space', 'z']),
            raise: isDown(['r', 'x']),
        });
        if (mode === 'vsplayer') {
            await this.runPanelNetplay(sheet, readInput);
            this.screen.removeListener('keypress', onKeypress);
            this.currentScreen = 'menu';
            return;
        }
        if (mode === 'replays') {
            await this.runReplayBrowser(sheet, readInput);
            this.screen.removeListener('keypress', onKeypress);
            this.currentScreen = 'menu';
            return;
        }
        if (mode === 'stageclear') {
            await this.runStageClear(sheet, readInput);
            this.screen.removeListener('keypress', onKeypress);
            this.currentScreen = 'menu';
            return;
        }
        if (mode === 'puzzle') {
            await this.runPuzzleSet(sheet, readInput, onKeypress);
            this.screen.removeListener('keypress', onKeypress);
            this.currentScreen = 'menu';
            return;
        }
        // Vs CPU and Challenge share one screen: the two opponents differ in what
        // they ARE, not in how they are driven. Vs CPU faces a real board played by
        // the bot; Challenge faces a boardless health model driven by an attack
        // script, and its slot draws a danger bar instead of panels.
        const versusOpponent = mode === 'vscpu'
            ? new stack_1.Stack({
                levelData: (0, level_data_1.getModern)(level_data_1.GARBAGE_MODE_LEVEL),
                panelSource: new generator_source_1.GeneratorSource(seed + 1, true),
                doCountdown: true,
            })
            : mode === 'challenge'
                ? new simulated_stack_1.SimulatedStack({
                    attackSettings: (0, attack_patterns_1.loadChallengeAttack)(1, challengeStage.attackStage),
                    healthSettings: challengeStage.healthSettings,
                })
                : null;
        if (versusOpponent && versusOpponent instanceof stack_1.Stack)
            versusOpponent.startingState();
        // Solo games are recorded in panel-attack's own format, so a caller can
        // watch their game back here and open the same file in Panel Attack.
        const recorder = versusOpponent ? undefined : new replay_recorder_1.PanelReplayRecorder({
            engineVersion: stack.engineVersion,
            seed,
            levelData: stack.levelData,
            behaviours: stack.behaviours,
            mode: mode === 'timeattack' ? 'timeattack' : 'endless',
            playerName: this.state.playerName,
            doCountdown: true,
            shockEnabled: true,
        });
        const panels = versusOpponent
            ? new panels_versus_screen_1.PanelsVersusScreen({
                screen: this.screen,
                player: stack,
                opponent: versusOpponent,
                cpu: versusOpponent instanceof stack_1.Stack
                    ? new panel_ai_1.PanelAi(versusOpponent, Math.min(5, panel_ai_1.MAX_AI_LEVEL))
                    : undefined,
                sheet,
                sounds: this.sounds,
                readInput,
            })
            : new panels_screen_1.PanelsScreen({
                screen: this.screen,
                stack,
                sheet,
                sounds: this.sounds,
                readInput,
                recorder,
            });
        const onEscape = () => panels.quit();
        this.screen.key(['escape', 'q', 'Q'], onEscape);
        try {
            const outcome = await panels.run();
            // Only a game that actually finished counts. Leaving early with ESC is
            // not a score, and recording it would put junk on the leaderboard.
            const finished = stack.gameEnded()
                || (versusOpponent ? versusOpponent.gameEnded() : false);
            if (finished) {
                const beatTheOpponent = 'playerWon' in outcome ? outcome.playerWon : undefined;
                const result = (0, score_report_1.buildPanelsResult)(stack, mode, 'tetris_attack', beatTheOpponent);
                this.highScores.addScore(this.state.playerName, result);
            }
            // A replay is worth nothing beside the game it came from, so this is
            // best-effort: the store swallows a write it cannot make.
            if (recorder && recorder.frames > 0) {
                this.panelReplays.save(recorder.fileName(finished), recorder.toReplayV3(finished));
            }
        }
        finally {
            this.screen.removeListener('keypress', onKeypress);
            this.screen.unkey(['escape', 'q', 'Q'], onEscape);
            this.currentScreen = 'menu';
        }
    }
    /**
     * Which panel mode to play.
     *
     * The original puts ENDLESS and TIME TRIAL side by side under its 1PLAYER
     * menu; this is that choice, and it is where PUZZLE, STAGE CLEAR and VS will
     * be added rather than growing the main menu by one row per mode.
     */
    /**
     * Puzzle mode: pick a set, then work through it.
     *
     * The set is played in order and a solved puzzle advances; a failed one is
     * offered again, because a puzzle you cannot yet see the answer to is the
     * mode working as intended. Leaving is ESC, and X or Y takes back a move -
     * the keys the original uses.
     */
    async runPuzzleSet(sheet, readInput, onKeypress) {
        const sets = (0, puzzle_1.loadShippedPuzzles)();
        const chosen = await this.choosePuzzleSet(sets);
        if (chosen === null)
            return;
        const set = sets[chosen];
        let index = 0;
        let solved = 0;
        while (index < set.puzzles.length) {
            const game = new puzzle_1.PuzzleGame(set.puzzles[index]);
            const panels = new panels_screen_1.PanelsScreen({
                screen: this.screen,
                puzzle: game,
                sheet,
                sounds: this.sounds,
                readInput,
            });
            const onEscape = () => panels.quit();
            const onUndo = () => panels.requestUndo();
            this.screen.key(['escape', 'q', 'Q'], onEscape);
            this.screen.key(['x', 'X', 'y', 'Y'], onUndo);
            let outcome;
            try {
                outcome = await panels.run();
            }
            finally {
                this.screen.unkey(['escape', 'q', 'Q'], onEscape);
                this.screen.unkey(['x', 'X', 'y', 'Y'], onUndo);
            }
            if (outcome.puzzleOutcome === 'won') {
                solved += 1;
                index += 1;
                continue;
            }
            if (outcome.puzzleOutcome === 'lost')
                continue;
            // Neither: the player left.
            break;
        }
        if (solved > 0) {
            const result = (0, score_report_1.buildPanelsResult)(
            // The last board played carries the score; what a puzzle run is
            // actually worth is how many of them came out.
            new puzzle_1.PuzzleGame(set.puzzles[0]).stack, 'puzzle', 'tetris_attack', solved === set.puzzles.length);
            result.lines = solved;
            result.linesCleared = solved;
            result.score = solved;
            this.highScores.addScore(this.state.playerName, result);
        }
        void onKeypress;
    }
    /**
     * STAGE CLEAR: walk the ladder until a stage is failed or the player leaves.
     *
     * A board stage is the solo screen with a clear-line win; a Bowser fight is
     * the versus screen against a health model, because "lower his HP with combos
     * and chains" is what that model already does. One loop covers both, since
     * the only thing that differs is which screen the stage is played on.
     */
    async runStageClear(sheet, readInput) {
        const stages = (0, stage_clear_1.buildStages)();
        let cleared = 0;
        for (const stage of stages) {
            const won = stage.boss
                ? await this.playBowser(stage, sheet, readInput)
                : await this.playStage(stage, sheet, readInput);
            if (won === null)
                break; // the player left
            if (!won)
                break; // the ladder ends where you fall off it
            cleared += 1;
        }
        if (cleared > 0) {
            const result = (0, score_report_1.buildPanelsResult)(new stage_clear_1.StageClearGame(stages[0]).stack, 'stageclear', 'tetris_attack', cleared === stages.length);
            result.score = cleared;
            result.lines = cleared;
            result.linesCleared = cleared;
            result.level = cleared;
            this.highScores.addScore(this.state.playerName, result);
        }
    }
    /** One board stage. Returns null if the player left. */
    async playStage(stage, sheet, readInput) {
        const game = new stage_clear_1.StageClearGame(stage);
        const panels = new panels_screen_1.PanelsScreen({
            screen: this.screen,
            stack: game.stack,
            sheet,
            sounds: this.sounds,
            readInput,
            onStep: () => game.run(),
            isOver: () => game.result() !== 'playing',
        });
        const onEscape = () => panels.quit();
        this.screen.key(['escape', 'q', 'Q'], onEscape);
        try {
            await panels.run();
        }
        finally {
            this.screen.unkey(['escape', 'q', 'Q'], onEscape);
        }
        if (game.result() === 'playing')
            return null;
        return game.result() === 'cleared';
    }
    /** A fight with Bowser: the versus screen against a health model. */
    async playBowser(stage, sheet, readInput) {
        const player = new stack_1.Stack((0, stage_clear_1.stageStackOptions)(stage));
        player.startingState();
        const bowser = new simulated_stack_1.SimulatedStack({
            attackSettings: (0, attack_patterns_1.loadChallengeAttack)(1, Math.min(8, stage.round + 2)),
            healthSettings: (0, stage_clear_1.bossHealth)(stage),
        });
        const panels = new panels_versus_screen_1.PanelsVersusScreen({
            screen: this.screen,
            player,
            opponent: bowser,
            sheet,
            sounds: this.sounds,
            readInput,
        });
        const onEscape = () => panels.quit();
        this.screen.key(['escape', 'q', 'Q'], onEscape);
        let outcome;
        try {
            outcome = await panels.run();
        }
        finally {
            this.screen.unkey(['escape', 'q', 'Q'], onEscape);
        }
        if (!player.gameEnded() && !bowser.gameEnded())
            return null;
        return outcome.playerWon;
    }
    /**
     * VS PLAYER: another caller, on this board.
     *
     * Matchmaking under its own mode name, so a panel player and a Tetris player
     * are never put in the same lobby waiting for a game the other cannot play.
     *
     * NOTHING IS NEGOTIATED once the lobby starts. Both machines derive the seed
     * from the match id and the board order from the sorted player ids, so there
     * is no setup packet to lose and no window in which one side has started and
     * the other has not.
     */
    async runPanelNetplay(sheet, readInput) {
        if (!this.network) {
            await this.showPanelNotice('No connection to the board. Try again later.');
            return;
        }
        const localPlayerId = this.network.getLocalPlayerId()
            ?? this.session.user?.id ?? this.state.playerName;
        const lobbyScreen = new lobby_screen_1.LobbyScreen(this.screen, this.state, this.sounds, this.network, localPlayerId);
        const result = await lobbyScreen.show('matchmaking', 'panels_1v1');
        if (result.action !== 'start')
            return;
        const matchState = this.network.getMatchState();
        const humans = (matchState?.players ?? []).filter((player) => !player.isBot);
        if (!matchState || humans.length < 2) {
            await this.showPanelNotice('Nobody else joined. Try VS CPU instead.');
            return;
        }
        const setup = (0, panel_transport_1.panelMatchSetupFor)(matchState.matchId, humans.map((player) => player.id), (0, level_data_1.getModern)(level_data_1.GARBAGE_MODE_LEVEL), consts_1.ENGINE_VERSION);
        const transport = new panel_broker_transport_1.PanelBrokerTransport(this.network);
        const session = new panel_netplay_session_1.PanelNetplaySession({ transport, setup });
        const panels = new panels_versus_screen_1.PanelsVersusScreen({
            screen: this.screen,
            player: session.localStack(),
            opponent: session.remoteStack(),
            sheet,
            sounds: this.sounds,
            readInput,
            stepper: (input) => session.step(input) === 'ran',
            isOver: () => session.hasEnded(),
        });
        const onEscape = () => panels.quit();
        this.screen.key(['escape', 'q', 'Q'], onEscape);
        try {
            await panels.run();
            if (session.desynced()) {
                await this.showPanelNotice('The other player stopped responding.');
            }
            else if (session.localWon() !== undefined) {
                const result2 = (0, score_report_1.buildPanelsResult)(session.localStack(), 'vsplayer', 'tetris_attack', session.localWon());
                this.highScores.addScore(this.state.playerName, result2);
            }
        }
        finally {
            this.screen.unkey(['escape', 'q', 'Q'], onEscape);
            session.dispose();
            transport.dispose();
        }
    }
    /**
     * Watch a game back.
     *
     * Playback is the ordinary screen with the inputs already in the stack's
     * buffer: the engine is deterministic, so running it forward IS the replay.
     * Nothing renders differently, because nothing about it is different.
     */
    async runReplayBrowser(sheet, readInput) {
        const replays = this.panelReplays.list();
        if (replays.length === 0) {
            await this.showPanelNotice('No replays yet. Play a game and it will be here.');
            return;
        }
        const chosen = await this.chooseReplay(replays);
        if (chosen === null)
            return;
        const json = this.panelReplays.load(replays[chosen].id);
        if (!json) {
            await this.showPanelNotice('That replay could not be read.');
            return;
        }
        const stack = (0, replay_1.stackForReplay)((0, replay_recorder_1.loadReplayV3)(json));
        const panels = new panels_screen_1.PanelsScreen({
            screen: this.screen,
            stack,
            sheet,
            sounds: this.sounds,
            readInput,
            playback: true,
        });
        const onEscape = () => panels.quit();
        this.screen.key(['escape', 'q', 'Q'], onEscape);
        try {
            await panels.run();
        }
        finally {
            this.screen.unkey(['escape', 'q', 'Q'], onEscape);
        }
    }
    /** Pick a replay to watch. */
    async chooseReplay(replays) {
        const rows = replays.map((replay) => {
            const seconds = Math.round(replay.duration / 60);
            const stamp = new Date(replay.timestamp * 1000).toISOString();
            const when = stamp.slice(0, 16).replace('T', ' ');
            const state = replay.completed ? '' : '  (unfinished)';
            return {
                wide: `${when}  ${replay.playerName.padEnd(10, ' ')} ${replay.mode.padEnd(10, ' ')}`
                    + ` ${String(seconds).padStart(4, ' ')}s${state}`,
                // A C64 has no room for the year or the mode; the day and the time
                // are what tell two of your own games apart.
                compact: `${stamp.slice(5, 16).replace('T', ' ')} ${String(seconds).padStart(4, ' ')}s`
                    + `${replay.completed ? '' : ' *'}`,
            };
        });
        rows.push({ wide: 'Back', compact: 'Back' });
        const layout = (0, chooser_1.chooserLayout)(this.screen.width, this.screen.height, rows.length);
        const labels = (0, chooser_1.chooserLabels)(rows, layout);
        return new Promise((resolve) => {
            const box = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: layout.width,
                height: layout.height,
                label: ' REPLAYS ',
                tags: true,
                style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
            });
            const list = (0, blessed_helpers_1.createList)({
                parent: box,
                top: 1,
                left: 1,
                width: layout.innerWidth,
                height: layout.innerHeight,
                keys: true,
                vi: true,
                mouse: true,
                tags: true,
                items: labels,
                style: { fg: 'white', bg: 'black', selected: { fg: 'black', bg: 'magenta' } },
            });
            const done = (choice) => {
                box.destroy();
                this.screen.render();
                resolve(choice);
            };
            list.on('select', (_item, index) => {
                done(index < replays.length ? index : null);
            });
            list.key(['escape', 'q', 'Q'], () => done(null));
            list.focus();
            this.screen.render();
        });
    }
    /** A one-line message with a key to dismiss it. */
    async showPanelNotice(message) {
        return new Promise((resolve) => {
            const box = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: Math.min(this.screen.width - 4, message.length + 6),
                height: 5,
                label: ' TETRIS ATTACK ',
                tags: true,
                content: `\n {white-fg}${message}{/white-fg}`,
                style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
            });
            this.screen.render();
            const dismiss = () => {
                this.screen.unkey(['escape', 'q', 'Q', 'enter', 'space'], dismiss);
                box.destroy();
                this.screen.render();
                resolve();
            };
            this.screen.key(['escape', 'q', 'Q', 'enter', 'space'], dismiss);
        });
    }
    /** Which puzzle set to work through. */
    async choosePuzzleSet(sets) {
        // The shipped set names are translation keys; the readable part is the tail.
        const rows = sets.map((set, i) => {
            const name = set.name.replace(/^puzzle_set_name_/, '').replace(/_/g, ' ').toUpperCase();
            const number = String(i + 1).padStart(2, ' ');
            return {
                wide: `${number}  ${name}  (${set.puzzles.length})`,
                compact: `${number} ${name} ${set.puzzles.length}`,
            };
        });
        rows.push({ wide: 'Back', compact: 'Back' });
        const layout = (0, chooser_1.chooserLayout)(this.screen.width, this.screen.height, rows.length);
        const labels = (0, chooser_1.chooserLabels)(rows, layout);
        return new Promise((resolve) => {
            const box = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: layout.width,
                height: layout.height,
                label: ' PUZZLE ',
                tags: true,
                style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
            });
            const list = (0, blessed_helpers_1.createList)({
                parent: box,
                top: 1,
                left: 1,
                width: layout.innerWidth,
                height: layout.innerHeight,
                keys: true,
                vi: true,
                mouse: true,
                tags: true,
                items: labels,
                style: { fg: 'white', bg: 'black', selected: { fg: 'black', bg: 'magenta' } },
            });
            const done = (choice) => {
                box.destroy();
                this.screen.render();
                resolve(choice);
            };
            list.on('select', (_item, index) => {
                done(index < sets.length ? index : null);
            });
            list.key(['escape', 'q', 'Q'], () => done(null));
            list.focus();
            this.screen.render();
        });
    }
    async chooseTetrisAttackMode() {
        const rows = [
            { wide: 'ENDLESS      play until the stack tops out', compact: 'ENDLESS' },
            { wide: 'TIME ATTACK  two minutes, score as high as you can', compact: 'TIME ATTACK' },
            { wide: 'VS CPU       a real opponent on a real board', compact: 'VS CPU' },
            { wide: 'CHALLENGE    the stage ladder, eight difficulties', compact: 'CHALLENGE' },
            { wide: 'PUZZLE       235 arrangements, one right answer each', compact: 'PUZZLE' },
            { wide: 'STAGE CLEAR  thirty stages and two fights with Bowser', compact: 'STAGE CLEAR' },
            { wide: 'VS PLAYER    another caller, on this board', compact: 'VS PLAYER' },
            { wide: 'REPLAYS      watch a game back', compact: 'REPLAYS' },
            { wide: 'Back', compact: 'Back' },
        ];
        const layout = (0, chooser_1.chooserLayout)(this.screen.width, this.screen.height, rows.length);
        const labels = (0, chooser_1.chooserLabels)(rows, layout);
        const modes = [
            'endless', 'timeattack', 'vscpu', 'challenge', 'puzzle', 'stageclear',
            'vsplayer', 'replays', null,
        ];
        return new Promise((resolve) => {
            const box = (0, blessed_helpers_1.createBox)({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: layout.width,
                height: layout.height,
                label: ' TETRIS ATTACK ',
                tags: true,
                style: { fg: 'white', bg: 'black', border: { fg: 'magenta' } },
            });
            const list = (0, blessed_helpers_1.createList)({
                parent: box,
                top: 1,
                left: 1,
                width: layout.innerWidth,
                height: layout.innerHeight,
                keys: true,
                vi: true,
                mouse: true,
                tags: true,
                items: labels,
                style: {
                    fg: 'white',
                    bg: 'black',
                    selected: { fg: 'black', bg: 'magenta' },
                },
            });
            const done = (choice) => {
                box.destroy();
                this.screen.render();
                resolve(choice);
            };
            list.on('select', (_item, index) => done(modes[index] ?? null));
            list.key(['escape', 'q', 'Q'], () => done(null));
            list.focus();
            this.screen.render();
        });
    }
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
            // A ground, not a frame: createBox draws a line border when no
            // border key is given (Panel's default), which outlines the whole
            // terminal.
            border: undefined,
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
            style: { bg: 'black', border: { fg: 'cyan' } },
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
        // Voice for the lobby and the match that follows, same as the versus
        // lobby - TetriNET players sat in a silent room while versus players
        // could talk.
        this.startVoice(`tnet-${this.session.user?.id ?? Date.now()}`);
        // Same rule as showLobby: ask the network manager, never re-derive.
        const localPlayerId = this.network?.getLocalPlayerId()
            ?? this.session.user?.id ?? this.state.playerName;
        const adapter = new tetrinet_lobby_adapter_1.TetriNetLobbyAdapter(this.network, String(localPlayerId), selectedMode);
        // Seed the Winlist tab from this BBS's own TetriNET high scores. Without
        // this the tab is fed only by an external server's winlist message, so a
        // local lobby always showed an empty board.
        // TetriNET's winlist is a table of WINS, not of scores - see
        // core/tetrinet/winlist.ts. Filling it from the door's high scores made
        // a big solo score outrank somebody who actually won matches.
        adapter.setLocalWinlist(this.tetrinetWinList.getEntries(10).map((entry, index) => ({
            rank: index + 1,
            name: entry.team ? `${entry.name} [${entry.team}]` : entry.name,
            score: entry.points,
            isTeam: false,
        })));
        // Add local player
        const playerName = this.session.user?.username || this.state.playerName;
        adapter.addLocalPlayer(playerName, 1);
        // Create lobby with TetriNET-specific features
        const lobby = new blessed_1.MultiplayerLobby({
            parent: this.screen,
            adapter,
            // Must be the id the adapter actually reports for this player. It was
            // 'slot-1', a leftover from the slot-based adapter, so the widget's
            // "is this me?" checks never matched: the human was counted as
            // not-ready and Start answered "Not all players are ready".
            localPlayerId: String(localPlayerId),
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
                    // "Add Bots" fills to this. minPlayers is 2, which in a six-seat
                    // game means ONE bot; the local game gives three opponents, so
                    // match that.
                    botFillTarget: 4,
                    teamBased: true,
                    teams: ['Red', 'Blue'],
                },
                extended: {
                    name: 'Extended (16 specials)',
                    maxPlayers: 6,
                    maxSlots: 6,
                    minPlayers: 2,
                    // "Add Bots" fills to this. minPlayers is 2, which in a six-seat
                    // game means ONE bot; the local game gives three opponents, so
                    // match that.
                    botFillTarget: 4,
                    teamBased: true,
                    teams: ['Red', 'Blue'],
                },
                classic: {
                    name: 'Classic (no specials)',
                    maxPlayers: 6,
                    maxSlots: 6,
                    minPlayers: 2,
                    // "Add Bots" fills to this. minPlayers is 2, which in a six-seat
                    // game means ONE bot; the local game gives three opponents, so
                    // match that.
                    botFillTarget: 4,
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
            // Who is actually in this match? Every lobby result used to route to a
            // purely local game against three bots, so the other BBS users sitting
            // in the lobby were simply not in it.
            const players = adapter.getState()?.players ?? [];
            const humans = players.filter(p => !p.isBot);
            const bots = players.filter(p => p.isBot);
            // Ids arrive as numbers from the broker for remote players and as the
            // raw BBS user id for the local one; compare as strings.
            const isHost = String(humans[0]?.id ?? '') === String(localPlayerId);
            const botDifficulty = (bots[0]?.botDifficulty ?? 5);
            // Teams are lobby metadata that the winlist is keyed by, so they have
            // to travel with the match. Bots are matched by position: the Nth bot
            // in the lobby becomes ai-N in the game.
            const teams = {};
            for (const player of players) {
                if (!player.team)
                    continue;
                teams[String(player.id)] = player.team;
            }
            bots.forEach((bot, index) => {
                if (bot.team)
                    teams[`ai-${index + 1}`] = bot.team;
            });
            // A local game has no transport, so the human answers to 'player'
            // there rather than to their BBS id - see TetriNetScreen.localId().
            const localTeam = players.find(p => String(p.id) === String(localPlayerId))?.team;
            if (localTeam)
                teams[tetrinet_ai_1.HUMAN_TARGET_ID] = localTeam;
            if (humans.length > 1) {
                await this.startTetriNetNetworkGame(result.mode || 'standard', result.settings || {}, { botCount: isHost ? bots.length : 0, botDifficulty }, teams);
            }
            else {
                // The lobby's bots decide the opposition. This used to discard them
                // and start a hardcoded three-bot game at difficulty 5, so adding
                // one bot still produced three, and the difficulty picker did
                // nothing.
                await this.startTetriNetGame(result.mode || 'standard', result.settings || {}, { botCount: bots.length, botDifficulty }, teams);
            }
        }
        adapter.dispose();
        this.stopVoice();
    }
    /**
     * Start a BBS-internal networked TetriNET match.
     *
     * Bots are simulated by the HOST only and published as ordinary
     * participants, so every node sees the same field for them and no bot is
     * ever driven twice.
     */
    async startTetriNetNetworkGame(mode, settings, bots, teams = {}) {
        if (!this.network)
            return;
        this.state.currentMode = 'tetrinet';
        this.screen.program.disableMouse();
        const rule = (mode === 'extended' || mode === 'classic' || mode === 'standard')
            ? mode
            : 'standard';
        // Hold is on for BBS-internal matches: every player in them is running
        // this door, so nobody is at a disadvantage.
        const gameOptions = {
            ...(0, game_rules_1.optionsFromLobbySettings)(rule, settings),
            allowHold: true,
        };
        const gameEngine = new tetrinet_engine_1.TetriNetEngine(this.state.settings, gameOptions);
        const { TetriNetBrokerTransport } = await Promise.resolve().then(() => __importStar(require('./network/tetrinet-broker-transport')));
        const transport = new TetriNetBrokerTransport(this.network, this.state.playerName);
        let aiController = null;
        if (bots.botCount > 0) {
            const { TetriNetAI } = await Promise.resolve().then(() => __importStar(require('./ai/tetrinet-ai')));
            aiController = new TetriNetAI();
            aiController.createOpponents(bots.botCount, bots.botDifficulty, this.state.settings, gameOptions);
        }
        // The same joypad the main modes use - one builder, every screen.
        const tetrinetPad = this.createGamepadMapper();
        const gameScreen = new tetrinet_screen_1.TetriNetScreen({
            screen: this.screen,
            engine: gameEngine,
            inputHandler: this.inputHandler,
            sounds: this.sounds,
            state: this.state,
            network: transport,
            playerName: this.state.playerName,
            gamepadMapper: tetrinetPad,
            aiController,
            teams,
        });
        await gameScreen.run();
        await this.reportTetriNetScore(gameEngine, {
            networked: true,
            finishOrder: gameScreen.getFinishOrder(),
        });
        aiController?.destroy();
        transport.dispose();
        gameScreen.cleanup();
        this.state.currentMode = null;
        this.screen.program.enableMouse();
    }
    /**
     * Start a TetriNET game (local, single-player with TetriNET rules)
     */
    async startTetriNetGame(mode, settings, bots = { botCount: 3, botDifficulty: 5 }, teams = {}) {
        // broadcastScore() labels the post from currentMode; it has always had a
        // 'tetrinet' branch that nothing set.
        this.state.currentMode = 'tetrinet';
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Get base options for the selected rule (standard, extended, classic)
        const rule = (mode === 'extended' || mode === 'classic' || mode === 'standard')
            ? mode
            : 'standard';
        // allowHold is a LOCAL house rule - hold makes the game far more
        // playable, and every player on this BBS has it. It stays off against
        // real TetriNET servers, where no other client has it.
        const gameOptions = {
            ...(0, game_rules_1.optionsFromLobbySettings)(rule, settings),
            allowHold: true,
        };
        // Create TetriNET engine for human player
        const gameEngine = new tetrinet_engine_1.TetriNetEngine(this.state.settings, gameOptions);
        // Create AI opponents. Count and difficulty come from the lobby; the
        // defaults are what the direct "TetriNET" menu entry (no lobby) uses.
        const { TetriNetAI } = await Promise.resolve().then(() => __importStar(require('./ai/tetrinet-ai')));
        const aiController = new TetriNetAI();
        const aiOpponents = aiController.createOpponents(Math.max(1, bots.botCount), bots.botDifficulty, this.state.settings, gameOptions);
        // Create TetriNET screen with AI opponents
        // The same joypad the main modes use - one builder, every screen.
        const tetrinetPad = this.createGamepadMapper();
        const gameScreen = new tetrinet_screen_1.TetriNetScreen({
            screen: this.screen,
            engine: gameEngine,
            inputHandler: this.inputHandler,
            sounds: this.sounds,
            state: this.state,
            playerName: this.state.playerName,
            gamepadMapper: tetrinetPad,
            aiController, // Pass AI controller to screen
            teams,
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
        await this.reportTetriNetScore(gameEngine, { finishOrder: gameScreen.getFinishOrder() });
        // Cleanup AI
        aiController.destroy();
        gameScreen.cleanup();
        this.state.currentMode = null;
        // Re-enable mouse control for menus
        this.screen.program.enableMouse();
    }
    /**
     * Report a finished TetriNET game.
     *
     * High score table, BBS score server, livechat feed and the door_score
     * Discord webhook - a TetriNET game reached none of them, because all
     * four are fed from a GameResult and the TetriNET paths never built one.
     * Every TetriNET path funnels through here so they cannot drift apart
     * again.
     */
    async reportTetriNetScore(engine, opts) {
        // TetriNET ranks by wins, not by score: the reference server gives the
        // winner 3 points, the player who died last before them 2, the one
        // before that 1. Nothing recorded when the match ended without a single
        // survivor, which is what the reference does too.
        if (opts?.finishOrder && opts.finishOrder.length > 0) {
            this.tetrinetWinList.recordGame(opts.finishOrder);
        }
        const result = (0, score_report_2.buildTetriNetResult)(engine.getState());
        this.highScores.addScore(this.state.playerName, result);
        const userId = this.session.user?.id || 'guest';
        const username = this.session.user?.username || this.state.playerName;
        await this.submitScore(String(userId), username, result);
        if (opts?.networked) {
            this.broadcastMatchResult(username, { result, won: result.completed });
        }
    }
    /**
     * Pick a running match and watch it.
     *
     * Mode-agnostic on purpose: the broker lists every lobby regardless of
     * what it is playing, and the spectator screen renders both channels, so
     * versus, CPU battle and TetriNET are all watchable through this one
     * entry.
     */
    async showSpectate() {
        this.currentScreen = 'lobby';
        this.inputManager.suspend();
        const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
        const network = this.ensureNetwork();
        let games = [];
        try {
            games = await network.listLobbies({ includeInProgress: true });
        }
        catch (error) {
            console.error('[GRANDMASTER] Failed to list games to watch:', error);
        }
        const running = games.filter(game => game.players > 0);
        const panel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 60,
            height: 16,
            border: { type: 'line' },
            label: ' WATCH A GAME ',
            style: { bg: 'black', border: { fg: 'magenta' } },
            fixed: true,
        });
        const items = running.length > 0
            ? running.map(game => `${game.mode.padEnd(14)} ${String(game.players).padStart(2)}/${game.maxPlayers}  ` +
                `${game.state === 'waiting' ? 'in lobby' : 'playing '}  ${game.playerNames.join(', ').slice(0, 20)}`)
            : ['{gray-fg}No games running right now{/gray-fg}'];
        const list = (0, blessed_helpers_1.createList)({
            parent: panel,
            top: 1,
            left: 1,
            width: 56,
            height: 12,
            items: [...items, '{gray-fg}Back{/gray-fg}'],
            keys: true,
            vi: true,
            mouse: true,
            style: { selected: { bg: 'magenta', fg: 'black' }, item: { fg: 'white' } },
        });
        list.focus();
        this.screen.render();
        const choice = await new Promise((resolve) => {
            const onSelect = (_item, index) => {
                this.screen.unkey(['escape'], onEscape);
                resolve(index);
            };
            const onEscape = () => {
                list.removeListener('select', onSelect);
                this.screen.unkey(['escape'], onEscape);
                resolve(-1);
            };
            list.on('select', onSelect);
            this.screen.key(['escape'], onEscape);
        });
        panel.destroy();
        nav.destroy();
        const target = choice >= 0 && choice < running.length ? running[choice] : null;
        if (!target) {
            this.inputManager.resume();
            return;
        }
        try {
            await network.spectateLobby(target.id);
        }
        catch (error) {
            console.error('[GRANDMASTER] Failed to start watching:', error);
            this.inputManager.resume();
            return;
        }
        const spectator = new spectator_screen_1.SpectatorScreen({
            screen: this.screen,
            network,
            sounds: this.sounds,
            title: `${target.mode} - ${target.playerNames.join(', ')}`,
        });
        await spectator.run();
        spectator.cleanup();
        await network.leaveLobby();
        this.inputManager.resume();
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
            style: { bg: 'black', border: { fg: 'cyan' } },
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
                    bg: 'black',
                    border: { fg: 'cyan' },
                },
                fixed: true,
            });
            const serverLabel = (0, blessed_helpers_1.createBox)({
                // createBox() draws a border BY DEFAULT; a one-row box that frames
                // itself has nowhere left to print.
                border: { type: 'none' },
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
                // createBox() draws a border BY DEFAULT; a one-row box that frames
                // itself has nowhere left to print.
                border: { type: 'none' },
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
                // createBox() draws a border BY DEFAULT; a one-row box that frames
                // itself has nowhere left to print.
                border: { type: 'none' },
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
            style: { bg: 'black', border: { fg: 'cyan' } },
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
                bg: 'black',
                border: { fg: 'cyan' },
            },
            fixed: true,
        });
        // createBox() draws a border BY DEFAULT: without this these one-row
        // boxes framed themselves, and a 1-row box whose border eats both rows
        // has nowhere left to print its text - the two empty rules seen in the
        // dialog on 2026-08-25, with the label and the help line invisible.
        const nickLabel = (0, blessed_helpers_1.createBox)({
            parent: nickDialog,
            top: 1,
            left: 2,
            width: 20,
            height: 1,
            border: { type: 'none' },
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
            border: { type: 'none' },
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
                    bg: 'black',
                    border: { fg: 'cyan' },
                },
                fixed: true,
            });
            (0, blessed_helpers_1.createBox)({
                // createBox() draws a border BY DEFAULT; a one-row box that frames
                // itself has nowhere left to print.
                border: { type: 'none' },
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
                // createBox() draws a border BY DEFAULT; a one-row box that frames
                // itself has nowhere left to print.
                border: { type: 'none' },
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
            style: { bg: 'black', border: { fg: 'cyan' } },
            // A notice, so centre it on both axes.
            align: 'center',
            valign: 'middle',
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
                // A one-row box inside the footer frame: createBox borders when no
                // border key is given (Panel's default), and a bordered one-row box
                // has no interior left to paint the text in.
                border: undefined,
                parent: footer,
                top: 0,
                left: 1,
                width: '100%-2',
                height: 1,
                content: '{bold}Commands:{/bold} /team <name> | /me <action> | /public | /private | ESC to disconnect',
            });
            const footerStatus = (0, blessed_helpers_1.createBox)({
                border: undefined, // one row: a frame would eat the whole line
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
            // No allowHold here on purpose: on a real TetriNET server the other
            // clients have no hold, so switching it on locally would be an
            // advantage the rest of the table does not share.
            gameEngine = new tetrinet_engine_1.TetriNetEngine(this.state.settings, data.options || {});
            // The same joypad the main modes use - one builder, every screen.
            const tetrinetPad = this.createGamepadMapper();
            gameScreen = new tetrinet_screen_1.TetriNetScreen({
                screen: this.screen,
                engine: gameEngine,
                inputHandler: this.inputHandler,
                sounds: this.sounds,
                state: this.state,
                network: externalAdapter,
                playerName: this.state.playerName,
                gamepadMapper: tetrinetPad,
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
            this.state.currentMode = 'tetrinet';
            await gameScreen.run();
            unsubSpecial();
            unsubLines();
            unsubOver();
            // A game on a real TetriNET server counted for nothing locally: no
            // high score, no score submission, no Discord post.
            await this.reportTetriNetScore(gameEngine);
            this.state.currentMode = null;
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
        const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
        // Show difficulty selection
        const difficultyPanel = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 15,
            border: { type: 'line' },
            label: ' Select Bot Difficulty ',
            style: { bg: 'black', border: { fg: 'magenta' } },
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
    async startVersusGame(mode, lobbySettings) {
        if (!this.network)
            return;
        this.currentScreen = 'game';
        this.state.currentMode = 'versus';
        // Disable mouse control during gameplay
        this.screen.program.disableMouse();
        // Create attack manager for multiplayer
        this.attackManager = new attack_system_1.AttackManager();
        // Lobby settings, previously collected and then dropped on the floor -
        // the versus path never read result.settings at all, so Start Level and
        // Garbage Lines described nothing.
        const startLevel = Math.max(0, Number(lobbySettings?.startingLevel ?? 0) || 0);
        const garbageEnabled = lobbySettings?.garbage !== false;
        // Create game engine with attack manager
        this.gameEngine = new game_1.GameEngine('versus', this.state.settings, this.sounds, this.attackManager, startLevel);
        // Create versus screen
        const versusScreen = new versus_screen_1.VersusScreen(this.screen, this.gameEngine, this.inputHandler, this.sounds, this.state, this.network, this.attackManager, undefined, // botOrAI
        this.session);
        versusScreen.setGarbageEnabled(garbageEnabled);
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
    async startCpuBattle(botDifficulty, opponentCount = 3, lobbySettings) {
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
            style: { bg: 'black', border: { fg: 'cyan' } },
            // A notice, so centre it on both axes.
            align: 'center',
            valign: 'middle',
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
        const startLevel = Math.max(0, Number(lobbySettings?.startingLevel ?? 0) || 0);
        const garbageEnabled = lobbySettings?.garbage !== false;
        this.gameEngine = new game_1.GameEngine('versus', this.state.settings, this.sounds, this.attackManager, startLevel);
        // Create AI opponents (3 opponents at selected difficulty)
        const { VersusAI } = await Promise.resolve().then(() => __importStar(require('./ai/versus-ai')));
        const versusAI = new VersusAI();
        const aiOpponents = versusAI.createOpponents(opponentCount, botDifficulty, this.state.settings, this.sounds);
        // Create versus screen with AI opponents
        const versusScreen = new versus_screen_1.VersusScreen(this.screen, this.gameEngine, this.inputHandler, this.sounds, this.state, null, // No network for CPU battle
        this.attackManager, versusAI, // Pass AI controller instead of botDifficulty
        this.session);
        versusScreen.setGarbageEnabled(garbageEnabled);
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
    /**
     * The player's joypad, mapped to game actions.
     *
     * ONE builder for every mode. This was inline in the single-player launch
     * only, which is why TetriNET had no joypad support at all while the main
     * modes did - the pad was a per-screen feature instead of a shared one
     * (reported 2026-08-26, and fairly: "why don't they use the same
     * codebase").
     *
     * Timing comes from the player's settings, with TGM3's values underneath.
     */
    createGamepadMapper() {
        return new bbs_door_sdk_1.GamepadActionMapper({
            bbsSession: this.session.bbsSession,
            mapping: buildGamepadMapping(GAMEPAD_MAPPING, this.state.settings.gamepadBindings ?? {}),
            repeatActions: ['left', 'right', 'soft_drop'],
            dasDelay: this.state.settings.das ?? config_1.TIMING.DAS_DELAY,
            arrRate: this.state.settings.arr ?? config_1.TIMING.ARR_RATE,
        });
    }
    async showSettings() {
        this.currentScreen = 'settings';
        this.inputManager.suspend();
        const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
        const settingsScreen = new settings_screen_1.SettingsScreen(this.screen, this.state, this.sounds, this.session.bbsSession, this.terminalMode);
        await settingsScreen.show();
        nav.destroy();
        this.inputManager.resume();
        // Update input handler with any changed key bindings
        this.inputHandler.updateConfig(this.state.settings.keyBindings);
        // ...and the movement timing, which the settings screen has always
        // offered and which never reached the handler before.
        this.inputHandler.setTiming(this.state.settings.das, this.state.settings.arr, (0, soft_drop_1.softDropIntervalMs)(this.state.settings.softDropSpeed, this.state.settings.rotationSystem));
        // Persist settings to disk for this user
        this.saveSettings();
    }
    /**
     * Show statistics/leaderboard screen
     */
    async showStats() {
        this.currentScreen = 'stats';
        this.inputManager.suspend();
        const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
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
    async submitScore(userId, username, override) {
        // TetriNET runs on its own engine, so it supplies the result directly.
        // Gating this on `this.gameEngine` is why no TetriNET game ever reached
        // the score server or the Discord webhook.
        const result = override ?? this.gameEngine?.getResult();
        if (!result)
            return;
        // Only the TGM engine records replays.
        const replay = override ? null : this.gameEngine?.finalizeRecording() ?? null;
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
    broadcastMatchResult(localUsername, override) {
        if (!this.session.bbs?.emitCustomEvent)
            return;
        if (!this.network)
            return;
        const matchState = this.network.getMatchState();
        if (!matchState || matchState.players.length < 2)
            return;
        // TetriNET has its own engine and knows its own outcome, so it passes
        // both in; the versus path keeps reading the TGM engine.
        const result = override?.result ?? this.gameEngine?.getResult();
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
        const localWon = override
            ? override.won
            : (gameState?.status === 'complete' || gameState?.status !== 'gameover');
        const modeLabel = this.state.currentMode === 'tetrinet' ? 'TetriNET' : 'Versus';
        let message;
        if (matchState.players.length === 2) {
            // 1v1
            if (localWon) {
                message = `defeated ${opponentNames} in ${modeLabel}!`;
            }
            else {
                message = `was defeated by ${opponentNames} in ${modeLabel}`;
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
    /** A centred notice the player dismisses with any key. */
    async showMessage(title, body) {
        const box = (0, blessed_helpers_1.createBox)({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: 50,
            height: 12,
            border: { type: 'line' },
            style: { bg: 'black', border: { fg: 'cyan' } },
            align: 'center',
            valign: 'middle',
            content: `{bold}{cyan-fg}${title}{/cyan-fg}{/bold}\n\n${body}\n\n`
                + `{gray-fg}Press any key to continue...{/gray-fg}`,
            fixed: true,
            tags: true,
        });
        this.screen.render();
        await this.waitForKey();
        box.destroy();
        this.screen.render();
    }
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
            align: 'center',
            valign: 'middle',
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
    /**
     * The terminal changed size: repaint at the new one.
     *
     * The versus screen asks versusLayout how many boards the width holds on
     * every frame, so it picks the new size up by itself within a frame; what
     * it cannot do is clean up the columns it no longer occupies, which is
     * what the clear here is for. Every other screen in this door is built
     * from 80-column pieces and simply keeps its size in the middle of a
     * wider terminal.
     */
    relayout() {
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
        this.screen.alloc();
        this.screen.render();
    }
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
        // Hands the board its 80 columns back and unhooks resize and Alt+Enter.
        this.terminalMode?.dispose();
        this.terminalMode = null;
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