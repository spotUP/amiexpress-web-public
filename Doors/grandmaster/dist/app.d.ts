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
    private currentScreen;
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