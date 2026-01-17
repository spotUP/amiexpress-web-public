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
    constructor(session: DoorSession);
    /**
     * Create initial application state
     */
    private createInitialState;
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
     * Show main menu
     */
    private showMainMenu;
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
    private showTetriNetLobby;
    /**
     * Start a TetriNET game
     */
    private startTetriNetGame;
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