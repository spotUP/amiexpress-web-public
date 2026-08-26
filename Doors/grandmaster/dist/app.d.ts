/**
 * GRANDMASTER Application Factory
 *
 * Creates and manages the main application lifecycle including:
 * - Screen setup with neo-blessed
 * - Game state management
 * - Mode selection and transitions
 * - Audio/input initialization
 */
/**
 * Door session interface
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params?: string[];
    args?: string[];
}
import type { GamepadTrigger } from '@amiexpress/bbs-door-sdk';
import type { GameAction } from './core/types';
export declare function parseTriggerStr(t: string): GamepadTrigger | null;
export declare function buildGamepadMapping(defaults: Partial<Record<GameAction, GamepadTrigger[]>>, saved: Partial<Record<string, string[]>>): Partial<Record<GameAction, GamepadTrigger[]>>;
/**
 * Which game action drives which menu key.
 *
 * A player binds their pad ONCE, for the game, and those bindings have to
 * work the menus too - otherwise every button can be bound and the menu is
 * still dead, which is exactly how this was reported (8BitDo NES30 Pro,
 * 2026-08-25). The menu used a hardcoded D-pad/A/B/Start scheme and never
 * looked at the saved bindings at all.
 */
export declare const MENU_ACTION_KEYS: Partial<Record<GameAction, {
    name: string;
    sequence: string;
}>>;
/**
 * Main application class
 */
export declare class GrandmasterApp {
    private session;
    private screen;
    private state;
    private gameEngine;
    private inputHandler;
    private inputManager;
    private sounds;
    private highScores;
    private network;
    private attackManager;
    private multiplayerServer;
    private _currentScreen;
    /**
     * Which screen the player is on.
     *
     * A property rather than a field so the touch scheme cannot drift out of
     * sync with it: there are ten places that change screen, and a phone player
     * who lands on a menu still holding piece controls cannot choose anything
     * (reported live 2026-08-25). Only 'game' is play; a lobby is a list, and
     * so are settings and stats.
     */
    private get currentScreen();
    private set currentScreen(value);
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
    private announceInputMode;
    private _voiceRoom;
    private _voiceSocketHandlers;
    constructor(session: DoorSession);
    /**
     * Create initial application state
     */
    private createInitialState;
    /**
     * Get settings file path for current user
     */
    private getSettingsPath;
    /**
     * Load user settings from disk
     */
    private loadSettings;
    /**
     * Save user settings to disk
     */
    private saveSettings;
    /**
     * Check if a modal/dialog is currently open
     * This prevents screen-level escape handlers from firing when a modal is handling ESC
     */
    private isModalOpen;
    /**
     * Create neo-blessed screen
     */
    private createScreen;
    /**
     * Run the application
     */
    run(initialMode?: string): Promise<void>;
    /**
     * Play cinematic boot sequence
     */
    private playBootSequence;
    /**
     * Show attract mode (boot sequence + demo gameplay + info screens)
     */
    private showAttractMode;
    /**
     * Start voice relay for a VS lobby / game session.
     * Joins the socket to a named room and relays audio:data / voice:speaking
     * events between all peers in that room.
     */
    private startVoice;
    /**
     * Stop voice relay and release mic.
     */
    private stopVoice;
    /**
     * Show main menu
     */
    private showMainMenu;
    /**
     * Show training level selector then start training game
     */
    private startTraining;
    /**
     * Start a game in specified mode
     */
    private startGame;
    /**
     * Show multiplayer lobby
     */
    private showLobby;
    /**
     * Show TetriNET lobby for classic TetriNET gameplay
     */
    /** TetriNET's own win-points table (core/tetrinet/winlist.ts). */
    private tetrinetWinList;
    private showTetriNetLobby;
    /**
     * Start a BBS-internal networked TetriNET match.
     *
     * Bots are simulated by the HOST only and published as ordinary
     * participants, so every node sees the same field for them and no bot is
     * ever driven twice.
     */
    private startTetriNetNetworkGame;
    /**
     * Start a TetriNET game (local, single-player with TetriNET rules)
     */
    private startTetriNetGame;
    /**
     * Report a finished TetriNET game.
     *
     * High score table, BBS score server, livechat feed and the door_score
     * Discord webhook - a TetriNET game reached none of them, because all
     * four are fed from a GameResult and the TetriNET paths never built one.
     * Every TetriNET path funnels through here so they cannot drift apart
     * again.
     */
    private reportTetriNetScore;
    /**
     * Pick a running match and watch it.
     *
     * Mode-agnostic on purpose: the broker lists every lobby regardless of
     * what it is playing, and the spectator screen renders both channels, so
     * versus, CPU battle and TetriNET are all watchable through this one
     * entry.
     */
    private showSpectate;
    /**
     * Show TetriNET external server connection dialog
     */
    private showTetriNetServerConnect;
    /**
     * Run TetriNET game connected to external server
     */
    private runTetriNetExternalGame;
    /**
     * Show CPU Battle mode (offline versus with bots)
     */
    private showCpuBattle;
    /**
     * Start versus game
     */
    private startVersusGame;
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
    private startCpuBattle;
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
    private createGamepadMapper;
    private showSettings;
    /**
     * Show statistics/leaderboard screen
     */
    private showStats;
    /**
     * Show player manual
     */
    private showManual;
    /**
     * Update statistics after game
     */
    private updateStats;
    /**
     * Submit score to multiplayer server
     */
    private submitScore;
    /**
     * Broadcast score to livechat feed and Discord webhook
     */
    private broadcastScore;
    /**
     * Broadcast multiplayer match result (winner/loser) to livechat and Discord
     */
    private broadcastMatchResult;
    /**
     * Show high score notification
     */
    private showHighScoreNotification;
    /**
     * Compare two grades (-1, 0, 1)
     */
    private compareGrades;
    /**
     * Parse mode string to GameMode
     */
    private parseMode;
    /**
     * Quit the application
     */
    private quit;
    /**
     * Wait for any keypress
     */
    private waitForKey;
    /**
     * Sleep helper
     */
    private sleep;
}
/**
 * Create and run the GRANDMASTER application
 */
export declare function createApp(session: DoorSession, initialMode?: string): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map