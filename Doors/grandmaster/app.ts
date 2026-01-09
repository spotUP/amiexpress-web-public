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
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { MultiplayerLobby, type LobbyEntryMode } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

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
import { DEFAULT_KEYS } from './input/config';
import { SoundEngine } from './audio/sounds';
import { HighScoreManager } from './core/high-scores';
import { GrandmasterNetworkManager } from './network/network-manager';
import { AttackManager } from './network/attack-system';
import { TetriNetLobbyAdapter } from './network/tetrinet-lobby-adapter';
import { TetriNetClient } from './network/tetrinet-client';
import type { SoundEffect } from './audio/sounds';
import { MultiplayerServer } from './server/multiplayer-server';
import { showManual } from './ui/manual';

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
    // Create input handler with user's key bindings
    this.inputHandler = new InputHandler(
      this.screen,
      session,
      this.state.settings.keyBindings as any
    );

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
        keyBindings: {
          left: [...DEFAULT_KEYS.left],
          right: [...DEFAULT_KEYS.right],
          rotateCW: [...DEFAULT_KEYS.rotateCW],
          rotateCCW: [...DEFAULT_KEYS.rotateCCW],
          rotate180: [...DEFAULT_KEYS.rotate180],
          softDrop: [...DEFAULT_KEYS.softDrop],
          hardDrop: [...DEFAULT_KEYS.hardDrop],
          hold: [...DEFAULT_KEYS.hold],
          pause: [...DEFAULT_KEYS.pause],
        },
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
      smartCSR: false,  // Disable smart scroll-region optimization - prevents layout corruption
      fastCSR: false,   // Disable fast CSR - forces full redraws for stable rendering
      output: (data: string) => this.session.bbs.write(data),
    });

    // Connect input handler
    console.log('[GRANDMASTER] Setting up input handler, bbsSession exists:', !!this.session.bbsSession);
    if (this.session.bbsSession) {
      this.session.bbsSession.doorInputHandler = (data: string) => {
        console.log('[GRANDMASTER] doorInputHandler called with:', JSON.stringify(data));
        screen.program.emit('data', data);
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
      case 'tetrinet':
        await this.showTetriNetLobby();
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
   * Show TetriNET lobby for classic TetriNET gameplay
   */
  private async showTetriNetLobby(): Promise<void> {
    this.currentScreen = 'lobby';

    // First show mode selection
    const modeBox = createList({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 45,
      height: 12,
      border: { type: 'line' },
      label: ' TetriNET Mode ',
      style: {
        border: { fg: 'yellow' },
        selected: { bg: 'blue', fg: 'white' },
      },
      items: [
        'Create Game (Standard)',
        'Create Game (Extended - 16 specials)',
        'Create Game (Classic - no specials)',
        'Join Game',
        '',
        'Connect to External Server',
        '',
        'Back to Menu',
      ],
      keys: true,
      vi: true,
      mouse: true,
    });

    modeBox.focus();
    this.screen.render();

    const selection = await new Promise<number>((resolve) => {
      modeBox.on('select', (_item: any, index: number) => {
        resolve(index);
      });
      this.screen.key(['escape'], () => resolve(7));  // Back
    });

    modeBox.destroy();

    if (selection === 4 || selection === 6 || selection === 7) {
      return;  // Back to menu or separator
    }

    // Handle "Connect to External Server" option
    if (selection === 5) {
      await this.showTetriNetServerConnect();
      return;
    }

    // Map selection to mode and entry type
    const modeMap: Record<number, string> = {
      0: 'standard',
      1: 'extended',
      2: 'classic',
      3: 'standard',  // Join defaults to standard
    };
    const selectedMode = modeMap[selection] || 'standard';
    const entryMode: LobbyEntryMode = selection === 3 ? 'join' : 'custom';

    // Create TetriNET lobby adapter
    if (!this.network) {
      this.network = new GrandmasterNetworkManager(this.session.bbsSession);
    }
    const adapter = new TetriNetLobbyAdapter(this.network);

    // Add local player
    const playerName = this.session.user?.username || this.state.playerName;
    adapter.addLocalPlayer(playerName, 1);

    // Create lobby with TetriNET-specific features
    const lobby = new MultiplayerLobby({
      parent: this.screen,
      adapter,
      localPlayerId: 'slot-1',
      title: 'TETRINET LOBBY',
      features: {
        slotBased: true,      // Slots 1-6
        chat: true,           // Partyline chat
        teams: true,          // Team selection
        settingsEditor: true, // Game options
        leaderboard: true,    // Winlist
        bots: false,          // No bots in TetriNET
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
        const soundMap: Record<string, SoundEffect> = {
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

    if (result.action === 'start') {
      // Start TetriNET game with the settings from lobby
      await this.startTetriNetGame(result.mode || 'standard', result.settings || {});
    }
  }

  /**
   * Start a TetriNET game
   */
  private async startTetriNetGame(mode: string, settings: Record<string, unknown>): Promise<void> {
    // TODO: Implement TetriNET game screen
    // For now show placeholder
    const placeholder = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 8,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
      content: `{bold}{yellow-fg}TetriNET Game Starting{/yellow-fg}{/bold}\n\n` +
        `Mode: ${mode}\n` +
        `Level: ${settings.startingLevel || 1}\n\n` +
        `{gray-fg}Game screen coming soon...{/gray-fg}`,
    });

    this.screen.render();
    await this.waitForKey();
    placeholder.destroy();
  }

  /**
   * Show TetriNET external server connection dialog
   */
  private async showTetriNetServerConnect(): Promise<void> {
    // Import textbox helpers
    const { createTextbox } = await import('@amiexpress/bbs-door-sdk/utils/blessed-helpers');

    // Predefined server list from https://servers.tetrinet.fr/
    const predefinedServers = [
      { name: 'tetrinet.fr', host: 'tetrinet.fr' },
      { name: 'tetrinet.de', host: 'tetrinet.de' },
      { name: 'tetrinet.lfjr.net', host: 'tetrinet.lfjr.net' },
      { name: 'tetrinet.cyteen.eu', host: 'tetrinet.cyteen.eu' },
      { name: 'tetrinet.geekshed.net', host: 'tetrinet.geekshed.net' },
      { name: 'linuxiuvat.de', host: 'linuxiuvat.de' },
      { name: 'tetrinet.laber.fasel.org', host: 'tetrinet.laber.fasel.org' },
    ];

    // First, show server selection
    const serverSelectBox = createList({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 45,
      height: predefinedServers.length + 6,
      border: { type: 'line' },
      label: ' Select TetriNET Server ',
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
      },
      items: [
        ...predefinedServers.map(s => s.name),
        '',
        '{yellow-fg}Enter Custom Server...{/yellow-fg}',
        '',
        '{gray-fg}Back{/gray-fg}',
      ],
      keys: true,
      vi: true,
      mouse: true,
    });

    serverSelectBox.focus();
    this.screen.render();

    const serverSelection = await new Promise<number>((resolve) => {
      serverSelectBox.on('select', (_item: any, index: number) => {
        resolve(index);
      });
      this.screen.key(['escape'], () => resolve(predefinedServers.length + 3));  // Back
    });

    serverSelectBox.destroy();

    // Handle back/cancel
    if (serverSelection === predefinedServers.length || serverSelection === predefinedServers.length + 2 || serverSelection === predefinedServers.length + 3) {
      return;
    }

    let selectedServer = '';
    let selectedPort = 31457;

    // Custom server entry
    if (serverSelection === predefinedServers.length + 1) {
      // Show custom server dialog
      const customDialog = createBox({
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
      });

      const serverLabel = createBox({
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

      const portLabel = createBox({
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
      (portInput as any).setValue('31457');

      const customInstructions = createBox({
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

      const customResult = await new Promise<{ server: string; port: number } | null>((resolve) => {
        this.screen.key(['tab'], () => {
          focusIndex = (focusIndex + 1) % inputs.length;
          inputs[focusIndex].focus();
          this.screen.render();
        });

        this.screen.key(['S-tab'], () => {
          focusIndex = (focusIndex - 1 + inputs.length) % inputs.length;
          inputs[focusIndex].focus();
          this.screen.render();
        });

        this.screen.key(['enter'], () => {
          const server = (serverInput as any).getValue()?.trim() || '';
          const port = parseInt((portInput as any).getValue()?.trim() || '31457', 10);

          if (!server) {
            this.sounds.playSfx('error');
            return;
          }

          resolve({ server, port });
        });

        this.screen.key(['escape'], () => {
          resolve(null);
        });
      });

      customDialog.destroy();

      if (!customResult) {
        return;  // Cancelled
      }

      selectedServer = customResult.server;
      selectedPort = customResult.port;
    } else {
      // Predefined server
      selectedServer = predefinedServers[serverSelection].host;
    }

    // Now show nickname dialog
    const nickDialog = createBox({
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
    });

    const nickLabel = createBox({
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
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        focus: { fg: 'cyan' },
      },
      inputOnFocus: true,
      mouse: true,
    });
    const playerName = this.session.user?.username || this.state.playerName;
    (nickInput as any).setValue(playerName.substring(0, 15));

    const nickInstructions = createBox({
      parent: nickDialog,
      top: 4,
      left: 2,
      width: 45,
      height: 1,
      content: '{gray-fg}Enter your nickname (max 15 chars), ESC to cancel{/gray-fg}',
    });

    this.screen.render();
    nickInput.focus();

    const nickResult = await new Promise<string | null>((resolve) => {
      this.screen.key(['enter'], () => {
        const nickname = (nickInput as any).getValue()?.trim() || 'Player';
        resolve(nickname.substring(0, 15));
      });

      this.screen.key(['escape'], () => {
        resolve(null);
      });
    });

    nickDialog.destroy();

    if (!nickResult) {
      return;  // Cancelled
    }

    const result = {
      server: selectedServer,
      port: selectedPort,
      nickname: nickResult,
    };

    // Show connecting status
    const statusBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 45,
      height: 5,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      content: `{bold}{cyan-fg}Connecting to TetriNET server...{/cyan-fg}{/bold}\n\n` +
        `${result.server}:${result.port}`,
    });
    this.screen.render();

    try {
      // Create client and connect
      const client = new TetriNetClient({
        host: result.server,
        port: result.port,
        nickname: result.nickname,
        timeout: 15000,
      });

      await client.connect();

      statusBox.setContent(
        `{bold}{green-fg}Connected!{/green-fg}{/bold}\n\n` +
        `Slot ${client.getSlot()} assigned`
      );
      this.screen.render();

      // Wait a moment to show connected status
      await new Promise(r => setTimeout(r, 1000));
      statusBox.destroy();

      // Show the external server lobby/game
      await this.runTetriNetExternalGame(client);

    } catch (error) {
      statusBox.setContent(
        `{bold}{red-fg}Connection Failed{/red-fg}{/bold}\n\n` +
        `${(error as Error).message}`
      );
      this.screen.render();
      await this.waitForKey();
      statusBox.destroy();
    }
  }

  /**
   * Run TetriNET game connected to external server
   */
  private async runTetriNetExternalGame(client: TetriNetClient): Promise<void> {
    // Create game screen for external server play
    const gameBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      label: ` TetriNET - ${client.getSlot() ? `Slot ${client.getSlot()}` : 'Connected'} `,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
    });

    // Chat area (left side)
    const chatArea = createBox({
      parent: gameBox,
      top: 0,
      left: 0,
      width: 35,
      height: '100%-4',
      label: ' Partyline Chat ',
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
    });

    // Players list (right side)
    const playerList = createBox({
      parent: gameBox,
      top: 0,
      right: 0,
      width: 25,
      height: 12,
      label: ' Players ',
      border: { type: 'line' },
      style: { border: { fg: 'green' } },
    });

    // Status area
    const statusArea = createBox({
      parent: gameBox,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'gray' } },
      content: '{bold}Commands:{/bold} /team <name> | /me <action> | ESC to disconnect',
    });

    // Chat input
    const { createTextbox } = await import('@amiexpress/bbs-door-sdk/utils/blessed-helpers');
    const chatInput = createTextbox({
      parent: gameBox,
      bottom: 4,
      left: 1,
      width: 33,
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        focus: { fg: 'cyan' },
      },
      inputOnFocus: true,
      mouse: true,
    });

    // Helper to update player list
    const updatePlayerList = () => {
      const players = client.getPlayers();
      let content = '';
      for (let slot = 1; slot <= 6; slot++) {
        const player = players.find(p => p.slot === slot);
        if (player) {
          const alive = player.alive ? '{green-fg}[OK]{/green-fg}' : '{red-fg}[OUT]{/red-fg}';
          const team = player.team ? `{gray-fg}(${player.team}){/gray-fg}` : '';
          content += `${slot}. {white-fg}${player.name}{/white-fg} ${alive} ${team}\n`;
        } else {
          content += `${slot}. {gray-fg}(empty){/gray-fg}\n`;
        }
      }
      playerList.setContent(content.trim());
      this.screen.render();
    };

    // Helper to add chat message
    const addChatMessage = (msg: string) => {
      const current = chatArea.getContent();
      const lines = current.split('\n').slice(-50); // Keep last 50 lines
      lines.push(msg);
      chatArea.setContent(lines.join('\n'));
      chatArea.setScrollPerc(100);
      this.screen.render();
    };

    // Initial player list
    updatePlayerList();

    // Setup event handlers
    client.on('player:joined', (player: any) => {
      addChatMessage(`{green-fg}*** ${player.name} joined (slot ${player.slot}){/green-fg}`);
      updatePlayerList();
    });

    client.on('player:left', (data: any) => {
      addChatMessage(`{red-fg}*** Player left slot ${data.slot}{/red-fg}`);
      updatePlayerList();
    });

    client.on('player:team', (data: any) => {
      addChatMessage(`{cyan-fg}*** Slot ${data.slot} joined team: ${data.team}{/cyan-fg}`);
      updatePlayerList();
    });

    client.on('chat', (data: any) => {
      if (data.isAction) {
        addChatMessage(`{magenta-fg}* ${data.name} ${data.text}{/magenta-fg}`);
      } else if (data.isGameMessage) {
        addChatMessage(`{yellow-fg}[GAME] ${data.text}{/yellow-fg}`);
      } else {
        addChatMessage(`<${data.name}> ${data.text}`);
      }
    });

    client.on('game:start', (data: any) => {
      if (data.inProgress) {
        addChatMessage(`{yellow-fg}*** Game is already in progress{/yellow-fg}`);
      } else {
        addChatMessage(`{bold}{green-fg}*** GAME STARTING! ***{/green-fg}{/bold}`);
      }
      updatePlayerList();
    });

    client.on('game:end', () => {
      addChatMessage(`{bold}{yellow-fg}*** GAME OVER ***{/yellow-fg}{/bold}`);
      updatePlayerList();
    });

    client.on('player:lost', (data: any) => {
      addChatMessage(`{red-fg}*** Slot ${data.slot} topped out!{/red-fg}`);
      updatePlayerList();
    });

    client.on('disconnected', () => {
      addChatMessage(`{red-fg}*** Disconnected from server{/red-fg}`);
    });

    client.on('error', (error: Error) => {
      addChatMessage(`{red-fg}*** Error: ${error.message}{/red-fg}`);
    });

    // Focus chat input
    chatInput.focus();
    this.screen.render();

    // Handle input
    await new Promise<void>((resolve) => {
      // Submit chat
      chatInput.on('submit', (value: string) => {
        const text = value?.trim();
        if (!text) {
          (chatInput as any).clearValue();
          chatInput.focus();
          return;
        }

        if (text.startsWith('/team ')) {
          client.setTeam(text.substring(6).trim());
        } else if (text.startsWith('/me ')) {
          client.sendAction(text.substring(4).trim());
        } else {
          client.sendChat(text);
        }

        (chatInput as any).clearValue();
        chatInput.focus();
        this.screen.render();
      });

      // ESC to quit
      this.screen.key(['escape'], () => {
        client.disconnect();
        resolve();
      });
    });

    // Cleanup
    gameBox.destroy();
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

    // Update input handler with any changed key bindings
    this.inputHandler.updateConfig(this.state.settings.keyBindings as any);
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
   * Show player manual
   */
  private async showManual(): Promise<void> {
    return new Promise((resolve) => {
      showManual(this.screen, () => {
        this.screen.render();
        resolve();
      });
    });
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

    // Disconnect from network to prevent socket leaks
    if (this.network) {
      this.network.disconnect();
      console.log('[GRANDMASTER] Network disconnected');
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
