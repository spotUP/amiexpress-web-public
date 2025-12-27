/**
 * GRANDMASTER Application Factory
 *
 * Creates and manages the main application lifecycle including:
 * - Screen setup with neo-blessed
 * - Game state management
 * - Mode selection and transitions
 * - Audio/input initialization
 */

import { createScreen, createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/screen';

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

import { GameMode, AppState } from './core/types';
import { GameEngine } from './core/game';
import { MenuScreen } from './ui/menu';
import { GameScreen } from './ui/game-screen';
import { SettingsScreen } from './ui/settings-screen';
import { LobbyScreen } from './ui/lobby-screen';
import { VersusScreen } from './ui/versus-screen';
import { LeaderboardScreen } from './ui/leaderboard-screen';
import { AttractScreen } from './ui/attract-screen';
import { InputHandler } from './input/handler';
import { SoundEngine } from './audio/sounds';
import { HighScoreManager } from './core/high-scores';
import { GrandmasterNetworkManager } from './network/network-manager';
import { AttackManager } from './network/attack-system';
import { MultiplayerServer } from './server/multiplayer-server';

/**
 * Main application class
 */
export class GrandmasterApp {
  private session: DoorSession;
  private screen: Screen;
  private state: AppState;
  private gameEngine: GameEngine | null = null;
  private inputHandler: InputHandler;
  private sounds: SoundEngine;
  private highScores: HighScoreManager;
  private network: GrandmasterNetworkManager | null = null;
  private attackManager: AttackManager | null = null;
  private multiplayerServer: MultiplayerServer;
  private currentScreen: 'menu' | 'game' | 'lobby' | 'settings' | 'stats' = 'menu';

  constructor(session: DoorSession) {
    this.session = session;
    this.state = this.createInitialState();
    this.sounds = new SoundEngine(session);
    this.highScores = new HighScoreManager();
    this.multiplayerServer = new MultiplayerServer();
    this.screen = this.createScreen();
    this.inputHandler = new InputHandler(this.screen, session);

    // Initialize network manager if session has socket
    if (session.bbsSession?.socket) {
      this.network = new GrandmasterNetworkManager(session.bbsSession);
    }
  }

  /**
   * Create initial application state
   */
  private createInitialState(): AppState {
    return {
      currentMode: null,
      playerName: this.session.user?.username || 'Player',
      settings: {
        rotationSystem: 'SRS',
        das: 133,           // Delayed Auto-Shift (ms)
        arr: 10,            // Auto-Repeat Rate (ms)
        softDropSpeed: 20,  // Multiplier
        ghostPiece: true,
        lockDelay: 500,     // ms
        previewCount: 5,
        musicVolume: 0.8,
        sfxVolume: 1.0,
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
   * Create neo-blessed screen
   */
  private createScreen(): Screen {
    const screen = createScreen({
      dockBorders: true,
      title: 'GRANDMASTER',
      fullUnicode: false,
      output: (data: string) => this.session.bbs.write(data),
    });

    // Connect input handler
    console.log('[GRANDMASTER] Setting up input handler, bbsSession exists:', !!this.session.bbsSession);
    if (this.session.bbsSession) {
      this.session.bbsSession.doorInputHandler = (data: string) => {
        console.log('[GRANDMASTER] doorInputHandler called with:', JSON.stringify(data));
        screen._handleData(data);
      };
      console.log('[GRANDMASTER] doorInputHandler set successfully');
    } else {
      console.error('[GRANDMASTER] WARNING: bbsSession is undefined, input will not work!');
    }

    return screen;
  }

  /**
   * Run the application
   */
  async run(initialMode?: string): Promise<void> {
    // Enable game mode for smooth keyboard input (required for neo-blessed doors)
    // This provides raw keydown/keyup events and bypasses OS key repeat delays
    if (this.session.bbs?.enableGameMode) {
      this.session.bbs.enableGameMode();
      console.log('[GRANDMASTER] Game mode enabled');
    }

    // Enable mouse events for neo-blessed mouse support
    if (this.session.bbs?.enableMouseEvents) {
      this.session.bbs.enableMouseEvents();
      console.log('[GRANDMASTER] Mouse events enabled');
    }

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
  private async playBootSequence(): Promise<void> {
    const bootBox = createBox({
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
  private async showAttractMode(): Promise<void> {
    return new Promise<void>((resolve) => {
      const attractScreen = new AttractScreen(
        this.screen,
        this.sounds,
        this.state
      );

      attractScreen.run(() => {
        attractScreen.cleanup();
        resolve();
      });
    });
  }

  /**
   * Show main menu
   */
  private async showMainMenu(): Promise<void> {
    this.currentScreen = 'menu';

    const menuScreen = new MenuScreen(this.screen, this.state, this.sounds);

    const selection = await menuScreen.show();

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
      case 'training':
        await this.startGame('training');
        break;
      case 'settings':
        await this.showSettings();
        break;
      case 'stats':
        await this.showStats();
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
   * Start a game in specified mode
   */
  private async startGame(mode: GameMode): Promise<void> {
    this.currentScreen = 'game';
    this.state.currentMode = mode;

    // Create game engine
    this.gameEngine = new GameEngine(mode, this.state.settings);

    // Start replay recording
    const userId = this.session.user?.id || 'guest';
    const username = this.session.user?.username || this.state.playerName;
    this.gameEngine.startRecording(userId, username);

    // Create game screen
    const gameScreen = new GameScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state
    );

    // Run game loop
    await gameScreen.run();

    // Submit score and replay
    await this.submitScore(userId, username);

    // Update stats after game
    await this.updateStats();

    // Clean up
    this.gameEngine = null;
    this.state.currentMode = null;
  }

  /**
   * Show multiplayer lobby
   */
  private async showLobby(): Promise<void> {
    this.currentScreen = 'lobby';

    // Check if network is available
    if (!this.network) {
      const errorBox = createBox({
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
      });
      this.screen.render();
      await this.waitForKey();
      errorBox.destroy();
      return;
    }

    // Show mode selection first
    const modeBox = createList({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 12,
      border: { type: 'line' },
      label: ' Select Mode ',
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
      },
      items: [
        '1v1 Versus',
        '2v2 Team Battle',
        'Battle Royale (99)',
        'Back to Menu',
      ],
      keys: true,
      vi: true,
      mouse: true,
    });

    modeBox.focus();
    this.screen.render();

    const modeSelection = await new Promise<number>((resolve) => {
      modeBox.on('select', (_item: any, index: number) => {
        resolve(index);
      });
      this.screen.key(['escape'], () => resolve(3));  // Back
    });

    modeBox.destroy();

    if (modeSelection === 3) {
      return;  // Back to menu
    }

    // Map selection to mode
    const modes = ['versus_1v1', 'team_2v2', 'battle_royale'] as const;
    const selectedMode = modes[modeSelection];

    // Create lobby screen
    const localPlayerId = this.session.user?.id || this.state.playerName;
    const lobbyScreen = new LobbyScreen(
      this.screen,
      this.state,
      this.sounds,
      this.network,
      localPlayerId
    );

    // Show lobby and wait for result
    const result = await lobbyScreen.show('custom', selectedMode);

    if (result.action === 'start' && result.mode) {
      // Start multiplayer game
      await this.startVersusGame(result.mode);
    }
  }

  /**
   * Show CPU Battle mode (offline versus with bots)
   */
  private async showCpuBattle(): Promise<void> {
    this.currentScreen = 'lobby';

    // Show difficulty selection
    const difficultyBox = createList({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 15,
      border: { type: 'line' },
      label: ' Select Bot Difficulty ',
      style: {
        border: { fg: 'magenta' },
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

    const selection = await new Promise<number>((resolve) => {
      difficultyBox.on('select', (_item: any, index: number) => {
        resolve(index);
      });
      this.screen.key(['escape'], () => resolve(7));  // Back
    });

    difficultyBox.destroy();

    if (selection === 6 || selection === 7) {
      return;  // Back to menu
    }

    // Map selection to difficulty
    const difficulties = [1, 3, 5, 7, 9, 10];
    const botDifficulty = difficulties[selection];

    // Start CPU battle with selected difficulty
    await this.startCpuBattle(botDifficulty);
  }

  /**
   * Start versus game
   */
  private async startVersusGame(mode: string): Promise<void> {
    if (!this.network) return;

    this.currentScreen = 'game';
    this.state.currentMode = 'versus';

    // Create attack manager for multiplayer
    this.attackManager = new AttackManager();

    // Create game engine with attack manager
    this.gameEngine = new GameEngine('versus', this.state.settings, this.attackManager);

    // Create versus screen
    const versusScreen = new VersusScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state,
      this.network,
      this.attackManager
    );

    // Run game loop
    await versusScreen.run();

    // Update stats after game
    await this.updateStats();

    // Clean up
    versusScreen.cleanup();
    this.gameEngine = null;
    this.attackManager = null;
    this.state.currentMode = null;
  }

  /**
   * Start CPU Battle (local versus with bots)
   */
  private async startCpuBattle(botDifficulty: number): Promise<void> {
    this.currentScreen = 'game';
    this.state.currentMode = 'versus';

    // Show loading message
    const loadingBox = createBox({
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
    });
    this.screen.render();
    await this.sleep(800);
    loadingBox.destroy();

    // Create attack manager for bot battles
    this.attackManager = new AttackManager();

    // Create game engine with attack manager
    this.gameEngine = new GameEngine('versus', this.state.settings, this.attackManager);

    // Create versus screen with bot support
    // Note: We pass null for network since this is offline mode
    // The versus screen will need to be updated to support bots
    const versusScreen = new VersusScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state,
      null,  // No network for CPU battle
      this.attackManager,
      botDifficulty  // Pass bot difficulty for AI
    );

    // Run game loop
    await versusScreen.run();

    // Update stats after game
    await this.updateStats();

    // Clean up
    versusScreen.cleanup();
    this.gameEngine = null;
    this.attackManager = null;
    this.state.currentMode = null;
  }

  /**
   * Show settings screen
   */
  private async showSettings(): Promise<void> {
    this.currentScreen = 'settings';

    const settingsScreen = new SettingsScreen(this.screen, this.state);
    await settingsScreen.show();
  }

  /**
   * Show statistics/leaderboard screen
   */
  private async showStats(): Promise<void> {
    this.currentScreen = 'stats';

    const leaderboardScreen = new LeaderboardScreen(
      this.screen,
      this.highScores,
      this.sounds,
      this.state.playerName
    );

    await leaderboardScreen.show();
  }

  /**
   * Update statistics after game
   */
  private async updateStats(): Promise<void> {
    if (!this.gameEngine) return;

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
  private async submitScore(userId: string, username: string): Promise<void> {
    if (!this.gameEngine) return;

    // Get game result
    const result = this.gameEngine.getResult();

    // Finalize replay
    const replay = this.gameEngine.finalizeRecording();

    // Submit to server
    try {
      const submission = await this.multiplayerServer.submitScore(
        userId,
        username,
        result,
        replay || undefined
      );

      if (submission.accepted) {
        // Show submission success (optional)
        // Could show rank, personal best, etc.
        if (submission.isPersonalBest) {
          // New personal best!
        }
        if (submission.isTopTen) {
          // Made it to top 10!
        }
      } else {
        // Submission rejected (validation failed, anti-cheat, etc.)
        console.warn('Score submission rejected:', submission.reason);
      }
    } catch (error) {
      // Failed to submit (network error, server down, etc.)
      console.error('Failed to submit score:', error);
      // Don't throw - game should continue even if submission fails
    }
  }

  /**
   * Show high score notification
   */
  private async showHighScoreNotification(rank: number, score: number): Promise<void> {
    const rankSuffix = (r: number): string => {
      if (r === 1) return 'st';
      if (r === 2) return 'nd';
      if (r === 3) return 'rd';
      return 'th';
    };

    const notificationBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 10,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: `{bold}{yellow-fg}NEW HIGH SCORE!{/yellow-fg}{/bold}\n\n` +
        `{white-fg}Rank: {bold}${rank}${rankSuffix(rank)}{/bold}{/white-fg}\n` +
        `{white-fg}Score: {bold}${score.toLocaleString()}{/bold}{/white-fg}\n\n` +
        `{gray-fg}Press any key to continue...{/gray-fg}`,
    });

    this.screen.render();
    await this.waitForKey();
    notificationBox.destroy();
  }

  /**
   * Compare two grades (-1, 0, 1)
   */
  private compareGrades(a: string, b: string): number {
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
  private parseMode(mode: string): GameMode | null {
    const MODE_MAP: Record<string, GameMode> = {
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
  private async quit(): Promise<void> {
    // Disable game mode before exiting
    if (this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
      console.log('[GRANDMASTER] Game mode disabled');
    }

    // Clean up
    if (this.session.bbsSession) {
      this.session.bbsSession.doorInputHandler = null;
    }
    this.screen.destroy();
  }

  /**
   * Wait for any keypress
   */
  private waitForKey(): Promise<void> {
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
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create and run the GRANDMASTER application
 */
export async function createApp(session: DoorSession, initialMode?: string): Promise<void> {
  const app = new GrandmasterApp(session);
  await app.run(initialMode);
}
