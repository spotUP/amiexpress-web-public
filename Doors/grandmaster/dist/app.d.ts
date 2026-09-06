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
    /**
     * 80x25 like the board, or the caller's whole terminal.
     *
     * Starts FIXED, unlike the editors: this door's menus, attract screen and
     * solo playfield are 80-column pieces of art, while the versus screen is
     * a layout that gains from the room (ui/versus-layout.ts - three opponent
     * boards at 120 columns, five at 160). So the room is something a player
     * ASKS for with Alt+Enter, not something the door takes on their behalf.
     */
    private terminalMode;
    private state;
    private gameEngine;
    /** Who has cleared which mission, and how fast (core/mission-progress.ts). */
    private missionProgress;
    private inputHandler;
    private inputManager;
    private sounds;
    private highScores;
    /** TETRIS ATTACK replays, in panel-attack's own format. */
    private panelReplays;
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
     * MISSION mode: pick one from the pack, play it, record a clear.
     *
     * The pack is JSON on disk (data/missions/starter.json) so a sysop can ship
     * another without touching the door, and the loader refuses a pack whose
     * objectives this engine cannot judge rather than handing the player a
     * mission that can never end (core/mission-pack.ts).
     */
    private startMission;
    /** Seconds the run that just ended lasted. */
    private lastRunSeconds;
    /**
     * Start a game in specified mode
     */
    private startGame;
    /**
     * The network manager, created on first use.
     *
     * showSpectate and the versus lobby both built this by hand; a solo game
     * needs it too, so there is one place that does it.
     */
    private ensureNetwork;
    /**
     * Show multiplayer lobby
     */
    private showLobby;
    /**
     * Show TetriNET lobby for classic TetriNET gameplay
     */
    /** TetriNET's own win-points table (core/tetrinet/winlist.ts). */
    private tetrinetWinList;
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
    private startTetrisAttack;
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
    private runPuzzleSet;
    /**
     * STAGE CLEAR: walk the ladder until a stage is failed or the player leaves.
     *
     * A board stage is the solo screen with a clear-line win; a Bowser fight is
     * the versus screen against a health model, because "lower his HP with combos
     * and chains" is what that model already does. One loop covers both, since
     * the only thing that differs is which screen the stage is played on.
     */
    private runStageClear;
    /** One board stage. Returns null if the player left. */
    private playStage;
    /** A fight with Bowser: the versus screen against a health model. */
    private playBowser;
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
    private runPanelNetplay;
    /**
     * Watch a game back.
     *
     * Playback is the ordinary screen with the inputs already in the stack's
     * buffer: the engine is deterministic, so running it forward IS the replay.
     * Nothing renders differently, because nothing about it is different.
     */
    private runReplayBrowser;
    /** Pick a replay to watch. */
    private chooseReplay;
    /** A one-line message with a key to dismiss it. */
    private showPanelNotice;
    /**
     * How fast to play: the classic four.
     *
     * Opens on HARD rather than on the slowest row - a player who has just
     * chosen TETRIS ATTACK wants to play it, not configure it.
     */
    private chooseClassicDifficulty;
    /** Which puzzle set to work through. */
    private choosePuzzleSet;
    private chooseTetrisAttackMode;
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
    /** A centred notice the player dismisses with any key. */
    private showMessage;
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
    private relayout;
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