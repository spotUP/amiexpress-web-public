/**
 * GRANDMASTER Application Factory
 *
 * Creates and manages the main application lifecycle including:
 * - Screen setup with neo-blessed
 * - Game state management
 * - Mode selection and transitions
 * - Audio/input initialization
 */

import {
  createScreen,
  createBox,
  createList,
  DoorInputManager,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
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

import { GameMode, AppState, GameResult } from './core/types';
import { GameEngine } from './core/game';
import { MenuScreen } from './ui/menu';
import { GameScreen } from './ui/game-screen';
import { SettingsScreen } from './ui/settings-screen';
import { LobbyScreen } from './ui/lobby-screen';
import { VersusScreen } from './ui/versus-screen';
import { SpectatorScreen } from './ui/spectator-screen';
import { LeaderboardScreen } from './ui/leaderboard-screen';
import { AttractScreen } from './ui/attract-screen';
import { InputHandler } from './input/handler';
import { DEFAULT_KEYS } from './input/config';
import { GamepadActionMapper, GamepadButton, GamepadAxis, GamepadInputManager } from '@amiexpress/bbs-door-sdk';
import type { GamepadTrigger } from '@amiexpress/bbs-door-sdk';
import type { GameAction } from './core/types';
import { SoundEngine } from './audio/sounds';
import { HighScoreManager } from './core/high-scores';
import { GrandmasterNetworkManager } from './network/network-manager';
import { AttackManager } from './network/attack-system';
import { TetriNetLobbyAdapter } from './network/tetrinet-lobby-adapter';
import { TetriNetClient } from './network/tetrinet-client';
import { TetriNetServerBrowser, type TetriNetServer } from './network/tetrinet-server-browser';
import { TetriNetExternalAdapter } from './network/tetrinet-external-adapter';
import { TetriNetEngine } from './core/tetrinet/tetrinet-engine';
import { TetriNetScreen } from './ui/tetrinet-screen';
import { optionsFromLobbySettings, type TetriNetRule, type TetriNetGameOptions } from './core/tetrinet/game-rules';
import { buildTetriNetResult } from './core/tetrinet/score-report';
import { HUMAN_TARGET_ID } from './ai/tetrinet-ai';
import { WinList } from './core/tetrinet/winlist';
import { createTetriNetBoard } from './core/tetrinet/tetrinet-board';
import type { SoundEffect } from './audio/sounds';
import { MultiplayerServer } from './server/multiplayer-server';
import { showManual } from './ui/manual';
import { showTrainingConfig } from './ui/training-config';

// Default gamepad button mapping for GrandMaster.
// Parse a trigger string (e.g. "button:a", "dpad:left", "axis:left-x:negative")
// into a GamepadTrigger object. Returns null for unknown formats.
const BUTTON_BY_NAME: Record<string, GamepadButton> = {
  a: GamepadButton.A, b: GamepadButton.B, x: GamepadButton.X, y: GamepadButton.Y,
  l1: GamepadButton.L1, r1: GamepadButton.R1, l2: GamepadButton.L2, r2: GamepadButton.R2,
  select: GamepadButton.SELECT, start: GamepadButton.START,
  l3: GamepadButton.L3, r3: GamepadButton.R3, home: GamepadButton.HOME,
};

export function parseTriggerStr(t: string): GamepadTrigger | null {
  if (t.startsWith('button:')) {
    const btn = t.slice(7);
    const button = BUTTON_BY_NAME[btn];
    return button !== undefined ? { type: 'button', button } : null;
  }
  if (t.startsWith('dpad:')) {
    const dir = t.slice(5) as 'up' | 'down' | 'left' | 'right';
    return { type: 'dpad', direction: dir };
  }
  if (t.startsWith('axis:')) {
    const [, axisName, dirStr] = t.split(':');
    const axisMap: Record<string, GamepadAxis> = {
      'left-x': GamepadAxis.LEFT_STICK_X, 'left-y': GamepadAxis.LEFT_STICK_Y,
      'right-x': GamepadAxis.RIGHT_STICK_X, 'right-y': GamepadAxis.RIGHT_STICK_Y,
    };
    // Named sticks, or a bare axis number for anything else the pad exposes.
    const axis = axisMap[axisName] ?? (/^\d+$/.test(axisName) ? Number(axisName) as GamepadAxis : undefined);
    if (axis === undefined) return null;
    return { type: 'axis', axis, direction: dirStr as 'positive' | 'negative' };
  }
  return null;
}

// Merge user's saved gamepad bindings on top of the default mapping.
// Actions with user-defined triggers override the default; empty arrays disable.
export function buildGamepadMapping(
  defaults: Partial<Record<GameAction, GamepadTrigger[]>>,
  saved: Partial<Record<string, string[]>>
): Partial<Record<GameAction, GamepadTrigger[]>> {
  const result = { ...defaults };
  for (const [action, trigStrs] of Object.entries(saved)) {
    const triggers = (trigStrs as string[]).map(parseTriggerStr).filter(Boolean) as GamepadTrigger[];
    if (triggers.length > 0) {
      result[action as GameAction] = triggers;
    } else {
      delete result[action as GameAction]; // user disabled this action
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
export const MENU_ACTION_KEYS: Partial<Record<GameAction, { name: string; sequence: string }>> = {
  left:       { name: 'left',   sequence: '\x1b[D' },
  right:      { name: 'right',  sequence: '\x1b[C' },
  soft_drop:  { name: 'down',   sequence: '\x1b[B' },
  hard_drop:  { name: 'up',     sequence: '\x1b[A' },
  rotate_cw:  { name: 'enter',  sequence: '\r' },
  rotate_ccw: { name: 'escape', sequence: '\x1b' },
  pause:      { name: 'escape', sequence: '\x1b' },
};

// Creates a menu-navigation GIM for non-game screens (menus, settings, etc.).
// The player's own bindings drive it, with the defaults underneath, plus
// A/Start = Enter and B/Select = Escape so a pad works before it is bound.
// Destroy the returned object when leaving the screen to restore the previous handler.
function createMenuNav(
  bbsSession: any,
  screen: any,
  savedBindings: Partial<Record<string, string[]>> = {}
): { destroy: () => void } {
  const gim = new GamepadInputManager(bbsSession);

  // Feed the key through Screen's REAL dispatch, not screen.emit().
  //
  // screen.emit('keypress') only runs listeners attached to the Screen
  // object; it never reaches the FOCUSED element, which is where a menu's
  // List widget reads its keys. So a bound pad drove the game (whose action
  // mapper presses keys directly) and did nothing in the menus - reported
  // exactly that way, 2026-08-25.
  const emit = (name: string, sequence: string) => {
    const key = { name, full: name, sequence, shift: false, ctrl: false, meta: false };
    if (typeof (screen as any)._handleKey === 'function') {
      (screen as any)._handleKey(sequence, key);
    } else {
      screen.emit('keypress', sequence, key);
    }
  };

  const mapping = buildGamepadMapping(GAMEPAD_MAPPING, savedBindings);

  /** Every trigger that should produce a given menu key. */
  const triggersFor = (key: { name: string; sequence: string }): GamepadTrigger[] => {
    const found: GamepadTrigger[] = [];
    for (const [action, menuKey] of Object.entries(MENU_ACTION_KEYS)) {
      if (menuKey?.name !== key.name) continue;
      found.push(...(mapping[action as GameAction] ?? []));
    }
    return found;
  };

  const menuKeys = Object.values(MENU_ACTION_KEYS).filter(Boolean) as { name: string; sequence: string }[];

  gim.on('dpad', (dir: string) => {
    for (const key of menuKeys) {
      if (triggersFor(key).some(t => t.type === 'dpad' && t.direction === dir)) {
        emit(key.name, key.sequence);
        return;
      }
    }
  });

  gim.on('axis', (axis: number, value: number) => {
    if (Math.abs(value) < 0.7) return;
    const direction = value > 0 ? 'positive' : 'negative';
    for (const key of menuKeys) {
      if (triggersFor(key).some(t => t.type === 'axis' && t.axis === axis && t.direction === direction)) {
        emit(key.name, key.sequence);
        return;
      }
    }
  });

  for (const btn of ['a', 'b', 'x', 'y', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'home'] as const) {
    gim.on(`button:${btn}`, (pressed: boolean) => {
      if (!pressed) return;
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
  gim.on('button:a',      (p: boolean) => { if (p) emit('enter',  '\r');    });
  gim.on('button:start',  (p: boolean) => { if (p) emit('enter',  '\r');    });
  gim.on('button:b',      (p: boolean) => { if (p) emit('escape', '\x1b'); });
  gim.on('button:select', (p: boolean) => { if (p) emit('escape', '\x1b'); });

  return { destroy: () => gim.destroy() };
}

// D-pad and left stick handle movement; face buttons handle rotation/actions.
const GAMEPAD_MAPPING: Partial<Record<GameAction, GamepadTrigger[]>> = {
  left:       [{ type: 'dpad', direction: 'left'  }, { type: 'axis', axis: GamepadAxis.LEFT_STICK_X, direction: 'negative' }],
  right:      [{ type: 'dpad', direction: 'right' }, { type: 'axis', axis: GamepadAxis.LEFT_STICK_X, direction: 'positive' }],
  soft_drop:  [{ type: 'dpad', direction: 'down'  }, { type: 'axis', axis: GamepadAxis.LEFT_STICK_Y, direction: 'positive' }],
  hard_drop:  [{ type: 'dpad', direction: 'up'   }, { type: 'button', button: GamepadButton.A }],
  rotate_cw:  [{ type: 'button', button: GamepadButton.B }, { type: 'button', button: GamepadButton.R1 }],
  rotate_ccw: [{ type: 'button', button: GamepadButton.X }, { type: 'button', button: GamepadButton.L1 }],
  rotate_180: [{ type: 'button', button: GamepadButton.Y }],
  hold:       [{ type: 'button', button: GamepadButton.L2 }, { type: 'button', button: GamepadButton.R2 }],
  pause:      [{ type: 'button', button: GamepadButton.START }],
};

/**
 * Main application class
 */
export class GrandmasterApp {
  private session: DoorSession;
  private screen: Screen;
  private state: AppState;
  private gameEngine: GameEngine | null = null;
  private inputHandler: InputHandler;
  private inputManager: DoorInputManager;
  private sounds: SoundEngine;
  private highScores: HighScoreManager;
  private network: GrandmasterNetworkManager | null = null;
  private attackManager: AttackManager | null = null;
  private multiplayerServer: MultiplayerServer;
  private _currentScreen: 'menu' | 'game' | 'lobby' | 'settings' | 'stats' = 'menu';

  /**
   * Which screen the player is on.
   *
   * A property rather than a field so the touch scheme cannot drift out of
   * sync with it: there are ten places that change screen, and a phone player
   * who lands on a menu still holding piece controls cannot choose anything
   * (reported live 2026-08-25). Only 'game' is play; a lobby is a list, and
   * so are settings and stats.
   */
  private get currentScreen(): 'menu' | 'game' | 'lobby' | 'settings' | 'stats' {
    return this._currentScreen;
  }

  private set currentScreen(screen: 'menu' | 'game' | 'lobby' | 'settings' | 'stats') {
    if (this._currentScreen === screen) return;
    this._currentScreen = screen;
    try {
      (this.session?.bbs as any)?.setInputMode?.(screen === 'game' ? 'game' : 'menu');
    } catch {
      // A door must never die because the terminal could not be told.
    }
  }
  private _voiceRoom: string | null = null;
  private _voiceSocketHandlers: Array<[string, (...args: any[]) => void]> = [];

  constructor(session: DoorSession) {
    this.session = session;
    this.state = this.createInitialState();
    this.loadSettings();  // Load per-user settings from disk
    this.sounds = new SoundEngine(session);
    this.highScores = new HighScoreManager();
    this.multiplayerServer = new MultiplayerServer();

    this.screen = this.createScreen();

    // Create input manager for centralized state management
    // grabKeys: true is REQUIRED for blessed to receive keyboard input globally
    // Auto-suspend will handle disabling grabKeys when List widgets gain focus
    this.inputManager = new DoorInputManager(session, this.screen, {
      enableGameMode: false,  // DISABLED - neo-blessed handles input directly, no game mode needed
      enableGrabKeys: true,   // REQUIRED - blessed needs grabKeys to receive keyboard events
      enableMouse: true,
      enableAutoSuspend: true,  // Auto-suspend when List/widgets gain focus
      // debug:true made blessed-helpers HEX-DUMP every keystroke
      // (Buffer→hex + console.log per key) - synchronous stdout writes in
      // the input path, the same back-pressure class that froze DOORMAN.
      debug: false,
      debugName: 'GRANDMASTER'
    });

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
        // Visual Effects Settings
        blockGlow: true,
        glowIntensity: 1.0,
        clearStyle: 'inward',
        clearDirection: 'in',
        clearAnimationSpeed: 1.0,
        placementEffects: true,
        floatTextMode: 'offboard',
        b2bGlowEnabled: true,
        connectedBlocks: false,  // Disabled by default (BBS terminal limitations)
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
  private getSettingsPath(): string {
    const username = this.session.user?.username || 'guest';
    const path = require('path');
    return path.join(__dirname, '../data', `settings-${username}.json`);
  }

  /**
   * Load user settings from disk
   */
  private loadSettings(): void {
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
    } catch (error) {
      console.error('[GRANDMASTER] Failed to load settings:', error);
    }
  }

  /**
   * Save user settings to disk
   */
  private saveSettings(): void {
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
    } catch (error) {
      console.error('[GRANDMASTER] Failed to save settings:', error);
    }
  }

  /**
   * Check if a modal/dialog is currently open
   * This prevents screen-level escape handlers from firing when a modal is handling ESC
   */
  private isModalOpen(): boolean {
    return this.screen?.children?.some((child: any) =>
      child.type === 'docmodal' ||
      child.type === 'question' ||
      child.type === 'message' ||
      child.type === 'prompt' ||
      child.type === 'loading'
    ) || false;
  }

  /**
   * Create neo-blessed screen
   */
  private createScreen(): Screen {
    const screen = createScreen(this.session.bbs, {
      dockBorders: false, // Not needed for fixed panels in BBS environment
      title: 'GRANDMASTER v1.1.0',  // Version for debugging
      fullUnicode: false,
      smartCSR: false,  // Disable smart scroll-region optimization - prevents layout corruption
      fastCSR: false,   // Disable fast CSR - forces full redraws for stable rendering
      // focusKeys: true is DEFAULT - blessed List widgets NEED this for arrow key navigation!
      // Setting to false breaks all keyboard navigation in List/Textbox widgets
      ignoreLocked: ['mouse', 'keypress'],  // Prevent blur from clearing screen
    });

    // Prevent screen from clearing on blur - add a render call to redraw
    // Use 'any' to access internal blessed properties
    const program = (screen as any).program;
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
  async run(initialMode?: string): Promise<void> {
    // Clear any previous door's screen artifacts
    // This prevents ghosting when switching between doors
    this.screen.program.write('\x1b[2J');  // Clear entire screen with ANSI
    this.screen.program.write('\x1b[H');   // Move cursor to home (0,0)
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
    // Disable main input handler during attract mode so it doesn't swallow keys
    this.inputHandler.setEnabled(false);
    this.inputManager.suspend();  // Disable grabKeys for attract screen input

    return new Promise<void>((resolve) => {
      const attractScreen = new AttractScreen(
        this.screen,
        this.sounds,
        this.state
      );

      attractScreen.run(() => {
        attractScreen.cleanup();
        this.inputHandler.setEnabled(true);
        this.inputManager.resume();  // Re-enable grabKeys
        resolve();
      });
    });
  }

  /**
   * Start voice relay for a VS lobby / game session.
   * Joins the socket to a named room and relays audio:data / voice:speaking
   * events between all peers in that room.
   */
  private startVoice(matchId: string): void {
    const socket = (this.session as any).bbsSession?.socket;
    if (!socket) return;

    const roomName = `voice:${matchId}`;
    this._voiceRoom = roomName;
    socket.join(roomName);

    const onAudioData = (chunk: ArrayBuffer) => {
      socket.to(roomName).emit('audio:data', {
        userId: this.session.user?.id ?? 'unknown',
        chunk,
      });
    };
    const onSpeaking = (data: { speaking: boolean }) => {
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
    void (this.session as any).bbsSession?.audio?.startStreaming?.();
  }

  /**
   * Stop voice relay and release mic.
   */
  private stopVoice(): void {
    const socket = (this.session as any).bbsSession?.socket;
    if (socket && this._voiceRoom) {
      for (const [ev, fn] of this._voiceSocketHandlers) socket.off(ev, fn);
      socket.leave(this._voiceRoom);
    }
    this._voiceRoom = null;
    this._voiceSocketHandlers = [];
    // Tell the browser to release the mic
    void (this.session as any).bbsSession?.audio?.stopStreaming?.();
  }

  /**
   * Show main menu
   */
  private async showMainMenu(): Promise<void> {
    this.currentScreen = 'menu';

    this.inputHandler.setEnabled(false);
    this.inputManager.suspend();  // Disable grabKeys so List widget receives input

    const menuScreen = new MenuScreen(this.screen, this.state, this.sounds);
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
  private async startTraining(): Promise<void> {
    this.inputManager.suspend();
    const config = await showTrainingConfig(this.screen);
    this.inputManager.resume();
    await this.startGame('training', config.startLevel);
  }

  /**
   * Start a game in specified mode
   */
  private async startGame(mode: GameMode, startLevel: number = 0): Promise<void> {
    this.currentScreen = 'game';
    this.state.currentMode = mode;

    // Disable mouse control during gameplay
    this.screen.program.disableMouse();

    // Create game engine
    this.gameEngine = new GameEngine(mode, this.state.settings, this.sounds, undefined, startLevel);

    // Start replay recording
    const userId = this.session.user?.id || 'guest';
    const username = this.session.user?.username || this.state.playerName;
    this.gameEngine.startRecording(userId, username);

    // Create gamepad mapper — merge user's saved bindings over the defaults
    const gamepadMapper = new GamepadActionMapper<GameAction>({
      bbsSession: this.session.bbsSession,
      mapping: buildGamepadMapping(GAMEPAD_MAPPING, this.state.settings.gamepadBindings ?? {}),
      repeatActions: ['left', 'right', 'soft_drop'],
      dasDelay: this.state.settings.das ?? 133,
      arrRate: this.state.settings.arr ?? 10,
    });

    // Create game screen
    const gameScreen = new GameScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state,
      gamepadMapper
    );

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
  private async showLobby(): Promise<void> {
    this.currentScreen = 'lobby';

    // Disable game mode so textboxes can receive input
    if (this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
      console.log('[GRANDMASTER] Game mode disabled for versus lobby chat');
    }
    this.inputHandler.setEnabled(false);
    this.inputManager.suspend();  // Disable grabKeys so List widgets can receive input
    const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});

    // Start voice for the lobby + any subsequent VS game in this session
    const voiceMatchId = this.network?.getMatchState()?.matchId
      ?? `lobby-${this.session.user?.id ?? Date.now()}`;
    this.startVoice(voiceMatchId);

    // Check if network is available
    if (!this.network) {
      const errorBox = createBox({
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
    const modePanel = createBox({
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

    const modeBox = createList({
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

    const modeSelection = await new Promise<number>((resolve) => {
      const onSelect = (_item: any, index: number) => {
        this.screen.unkey(['escape'], onEscape);
        resolve(index);
      };
      const onEscape = () => {
        if (this.isModalOpen()) return;
        modeBox.removeListener('select', onSelect);
        this.screen.unkey(['escape'], onEscape);
        resolve(3);  // Back
      };
      modeBox.on('select', onSelect);
      this.screen.key(['escape'], onEscape);
    });

    modeBox.destroy();
    modePanel.destroy();

    if (modeSelection === 3) {
      nav.destroy();
      this.stopVoice();
      return;  // Back to menu
    }

    // ── Mode-selection + lobby loop ────────────────────────────────────────
    // Stays in this loop (and keeps voice active) until the player starts a
    // game or explicitly goes Back to the main menu.
    const modes = ['versus_1v1', 'team_2v2', 'battle_royale'] as const;
    type LobbyMode = typeof modes[number];
    let selectedMode: LobbyMode = modes[modeSelection]!;
    let changingMode = false;

    while (true) {
      if (changingMode) {
        // Re-show mode selection overlay
        changingMode = false;

        const rePanel = createBox({
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
        const reList = createList({
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

        const newModeIdx = await new Promise<number>((resolve) => {
          const onSel = (_item: any, index: number) => { this.screen.unkey(['escape'], onEsc); resolve(index); };
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
        selectedMode = modes[newModeIdx]!;
      }

      // Create lobby screen
      // Use 'matchmaking' so the broker's atomic handleMatchmake joins an existing
      // waiting lobby with the same mode, or creates one the next player will join.
      // 'custom' would make every player create their own private lobby (each sees only themselves).
      const localPlayerId = this.session.user?.id || this.state.playerName;
      const lobbyScreen = new LobbyScreen(
        this.screen,
        this.state,
        this.sounds,
        this.network,
        localPlayerId
      );

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
          await this.startCpuBattle(botDifficulty as number, Math.max(1, bots.length), result.settings);
        } else {
          await this.startVersusGame(result.mode, result.settings);
        }
        return;

      } else if (changingMode) {
        // C was pressed during lobby — loop back to mode selection overlay
        continue;

      } else {
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
  /** TetriNET's own win-points table (core/tetrinet/winlist.ts). */
  private tetrinetWinList = new WinList();

  private async showTetriNetLobby(): Promise<void> {
    this.currentScreen = 'lobby';

    // Disable game mode so textboxes can receive input
    if (this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
      console.log('[GRANDMASTER] Game mode disabled for TetriNET lobby chat');
    }
    this.inputHandler.setEnabled(false);
    this.inputManager.suspend();  // Disable grabKeys so List widgets can receive input

    // Clear screen and add background
    this.screen.children.forEach(child => child.destroy());
    const background = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: 'black' },
    });

    // First show mode selection - compact dialog sized to content
    const modePanel = createBox({
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

    const modeBox = createList({
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

    const selection = await new Promise<number>((resolve) => {
      const onSelect = (_item: any, index: number) => {
        this.screen.unkey(['escape'], onEscape);
        resolve(index);
      };
      const onEscape = () => {
        if (this.isModalOpen()) return;
        modeBox.removeListener('select', onSelect);
        this.screen.unkey(['escape'], onEscape);
        resolve(7);  // Back
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
      return;  // Back to menu or separator
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
    // Voice for the lobby and the match that follows, same as the versus
    // lobby - TetriNET players sat in a silent room while versus players
    // could talk.
    this.startVoice(`tnet-${this.session.user?.id ?? Date.now()}`);

    const localPlayerId = this.session.user?.id || this.state.playerName;
    const adapter = new TetriNetLobbyAdapter(
      this.network,
      String(localPlayerId),
      selectedMode as TetriNetRule
    );

    // Seed the Winlist tab from this BBS's own TetriNET high scores. Without
    // this the tab is fed only by an external server's winlist message, so a
    // local lobby always showed an empty board.
    // TetriNET's winlist is a table of WINS, not of scores - see
    // core/tetrinet/winlist.ts. Filling it from the door's high scores made
    // a big solo score outrank somebody who actually won matches.
    adapter.setLocalWinlist(
      this.tetrinetWinList.getEntries(10).map((entry, index) => ({
        rank: index + 1,
        name: entry.team ? `${entry.name} [${entry.team}]` : entry.name,
        score: entry.points,
        isTeam: false,
      }))
    );

    // Add local player
    const playerName = this.session.user?.username || this.state.playerName;
    adapter.addLocalPlayer(playerName, 1);

    // Create lobby with TetriNET-specific features
    const lobby = new MultiplayerLobby({
      parent: this.screen,
      adapter,
      // Must be the id the adapter actually reports for this player. It was
      // 'slot-1', a leftover from the slot-based adapter, so the widget's
      // "is this me?" checks never matched: the human was counted as
      // not-ready and Start answered "Not all players are ready".
      localPlayerId: String(localPlayerId),
      title: 'TETRINET LOBBY',
      features: {
        slotBased: true,      // Slots 1-6
        chat: true,           // Partyline chat
        teams: true,          // Team selection
        settingsEditor: true, // Game options
        leaderboard: true,    // Winlist
        bots: true,           // Auto-fill with AI players if needed
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

    // Re-enable game mode and input handler after lobby
    this.inputHandler.setEnabled(true);
    this.inputManager.resume();  // Re-enable grabKeys
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

      const botDifficulty = (bots[0]?.botDifficulty ?? 5) as number;

      // Teams are lobby metadata that the winlist is keyed by, so they have
      // to travel with the match. Bots are matched by position: the Nth bot
      // in the lobby becomes ai-N in the game.
      const teams: Record<string, string> = {};
      for (const player of players) {
        if (!player.team) continue;
        teams[String(player.id)] = player.team;
      }
      bots.forEach((bot, index) => {
        if (bot.team) teams[`ai-${index + 1}`] = bot.team;
      });
      // A local game has no transport, so the human answers to 'player'
      // there rather than to their BBS id - see TetriNetScreen.localId().
      const localTeam = players.find(p => String(p.id) === String(localPlayerId))?.team;
      if (localTeam) teams[HUMAN_TARGET_ID] = localTeam;

      if (humans.length > 1) {
        await this.startTetriNetNetworkGame(
          result.mode || 'standard',
          result.settings || {},
          { botCount: isHost ? bots.length : 0, botDifficulty },
          teams
        );
      } else {
        // The lobby's bots decide the opposition. This used to discard them
        // and start a hardcoded three-bot game at difficulty 5, so adding
        // one bot still produced three, and the difficulty picker did
        // nothing.
        await this.startTetriNetGame(
          result.mode || 'standard',
          result.settings || {},
          { botCount: bots.length, botDifficulty },
          teams
        );
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
  private async startTetriNetNetworkGame(
    mode: string,
    settings: Record<string, unknown>,
    bots: { botCount: number; botDifficulty: number },
    teams: Record<string, string> = {}
  ): Promise<void> {
    if (!this.network) return;

    this.state.currentMode = 'tetrinet';
    this.screen.program.disableMouse();

    const rule = (mode === 'extended' || mode === 'classic' || mode === 'standard')
      ? mode as TetriNetRule
      : 'standard';
    // Hold is on for BBS-internal matches: every player in them is running
    // this door, so nobody is at a disadvantage.
    const gameOptions: TetriNetGameOptions = {
      ...optionsFromLobbySettings(rule, settings),
      allowHold: true,
    };
    const gameEngine = new TetriNetEngine(this.state.settings, gameOptions);

    const { TetriNetBrokerTransport } = await import('./network/tetrinet-broker-transport');
    const transport = new TetriNetBrokerTransport(this.network, this.state.playerName);

    let aiController: any = null;
    if (bots.botCount > 0) {
      const { TetriNetAI } = await import('./ai/tetrinet-ai');
      aiController = new TetriNetAI();
      aiController.createOpponents(
        bots.botCount,
        bots.botDifficulty,
        this.state.settings,
        gameOptions
      );
    }

    const gameScreen = new TetriNetScreen({
      screen: this.screen,
      engine: gameEngine,
      inputHandler: this.inputHandler,
      sounds: this.sounds,
      state: this.state,
      network: transport,
      playerName: this.state.playerName,
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
  private async startTetriNetGame(
    mode: string,
    settings: Record<string, unknown>,
    bots: { botCount: number; botDifficulty: number } = { botCount: 3, botDifficulty: 5 },
    teams: Record<string, string> = {}
  ): Promise<void> {
    // broadcastScore() labels the post from currentMode; it has always had a
    // 'tetrinet' branch that nothing set.
    this.state.currentMode = 'tetrinet';

    // Disable mouse control during gameplay
    this.screen.program.disableMouse();

    // Get base options for the selected rule (standard, extended, classic)
    const rule = (mode === 'extended' || mode === 'classic' || mode === 'standard')
      ? mode as TetriNetRule
      : 'standard';
    // allowHold is a LOCAL house rule - hold makes the game far more
    // playable, and every player on this BBS has it. It stays off against
    // real TetriNET servers, where no other client has it.
    const gameOptions: TetriNetGameOptions = {
      ...optionsFromLobbySettings(rule, settings),
      allowHold: true,
    };

    // Create TetriNET engine for human player
    const gameEngine = new TetriNetEngine(this.state.settings, gameOptions);

    // Create AI opponents. Count and difficulty come from the lobby; the
    // defaults are what the direct "TetriNET" menu entry (no lobby) uses.
    const { TetriNetAI } = await import('./ai/tetrinet-ai');
    const aiController = new TetriNetAI();
    const aiOpponents = aiController.createOpponents(
      Math.max(1, bots.botCount),
      bots.botDifficulty as any,
      this.state.settings,
      gameOptions
    );

    // Create TetriNET screen with AI opponents
    const gameScreen = new TetriNetScreen({
      screen: this.screen,
      engine: gameEngine,
      inputHandler: this.inputHandler,
      sounds: this.sounds,
      state: this.state,
      playerName: this.state.playerName,
      aiController,  // Pass AI controller to screen
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
  private async reportTetriNetScore(
    engine: TetriNetEngine,
    opts?: { networked?: boolean; finishOrder?: Array<{ name: string; team?: string }> }
  ): Promise<void> {
    // TetriNET ranks by wins, not by score: the reference server gives the
    // winner 3 points, the player who died last before them 2, the one
    // before that 1. Nothing recorded when the match ended without a single
    // survivor, which is what the reference does too.
    if (opts?.finishOrder && opts.finishOrder.length > 0) {
      this.tetrinetWinList.recordGame(opts.finishOrder);
    }

    const result = buildTetriNetResult(engine.getState());

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
  private async showSpectate(): Promise<void> {
    this.currentScreen = 'lobby';
    this.inputManager.suspend();
    const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});

    if (!this.network) {
      this.network = new GrandmasterNetworkManager(this.session.bbsSession);
    }

    let games: Array<{ id: string; name: string; players: number; maxPlayers: number; mode: string; state: string; playerNames: string[] }> = [];
    try {
      games = await this.network.listLobbies({ includeInProgress: true });
    } catch (error) {
      console.error('[GRANDMASTER] Failed to list games to watch:', error);
    }

    const running = games.filter(game => game.players > 0);

    const panel = createBox({
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
      ? running.map(game =>
          `${game.mode.padEnd(14)} ${String(game.players).padStart(2)}/${game.maxPlayers}  ` +
          `${game.state === 'waiting' ? 'in lobby' : 'playing '}  ${game.playerNames.join(', ').slice(0, 20)}`)
      : ['{gray-fg}No games running right now{/gray-fg}'];

    const list = createList({
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

    const choice = await new Promise<number>((resolve) => {
      const onSelect = (_item: any, index: number) => {
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
      await this.network.spectateLobby(target.id);
    } catch (error) {
      console.error('[GRANDMASTER] Failed to start watching:', error);
      this.inputManager.resume();
      return;
    }

    const spectator = new SpectatorScreen({
      screen: this.screen,
      network: this.network,
      sounds: this.sounds,
      title: `${target.mode} - ${target.playerNames.join(', ')}`,
    });

    await spectator.run();
    spectator.cleanup();
    await this.network.leaveLobby();
    this.inputManager.resume();
  }

  /**
   * Show TetriNET external server connection dialog
   */
  private async showTetriNetServerConnect(): Promise<void> {
    // Import textbox helpers
    const { createTextbox } = await import('@amiexpress/bbs-door-sdk/utils/blessed-helpers');

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
    let selectedMode: 'standard' | 'tetrifast' | 'tspec' = 'tetrifast';

    // Server selection
    const getItems = () => [
      ...predefinedServers.map(s => s.name),
      '',
      '{yellow-fg}Enter Custom Server...{/yellow-fg}',
      '{cyan-fg}Update Server List (Live)...{/cyan-fg}',
      '',
      '{gray-fg}Back{/gray-fg}',
    ];

    const serverPanel = createBox({
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

    const serverSelectBox = createList({
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
      serverSelection = await new Promise<number>((resolve) => {
        const onSelect = (_item: any, index: number) => {
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

        const browser = new TetriNetServerBrowser();
        const liveServers = await browser.fetchServers();

        if (liveServers.length > 0) {
          predefinedServers = liveServers.map(s => ({
            name: `${s.name} [${s.players}/${s.maxPlayers}]`,
            host: s.host,
            port: s.port
          }));
          serverSelectBox.setItems(getItems());
          serverSelectBox.select(0);  // Reset to first item after update
        } else {
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
      const customDialog = createBox({
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

      const serverLabel = createBox({
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

      const portLabel = createBox({
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
      (portInput as any).setValue('31457');

      const customInstructions = createBox({
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

      const customResult = await new Promise<{ server: string; port: number } | null>((resolve) => {
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
          const server = (serverInput as any).getValue()?.trim() || '';
          const port = parseInt((portInput as any).getValue()?.trim() || '31457', 10);

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
        return;  // Cancelled
      }

      selectedServer = customResult.server;
      selectedPort = customResult.port;
    } else {
      // Predefined server
      selectedServer = predefinedServers[serverSelection].host;
      selectedPort = (predefinedServers[serverSelection] as any).port || 31457;
    }

    // Ask for mode (includes TSpec spectator)
    const modePanel = createBox({
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

    const modeSelectBox = createList({
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

    const modeSelection = await new Promise<number>((resolve) => {
      const onSelect = (_item: any, index: number) => {
        this.screen.unkey(['escape'], onEscape);
        resolve(index);
      };
      const onEscape = () => {
        if (this.isModalOpen()) return;
        modeSelectBox.removeListener('select', onSelect);
        this.screen.unkey(['escape'], onEscape);
        resolve(-1);
      };
      modeSelectBox.on('select', onSelect);
      this.screen.key(['escape'], onEscape);
    });

    modeSelectBox.destroy();
    modePanel.destroy();
    if (modeSelection === -1) return;

    selectedMode = modeSelection === 0 ? 'tetrifast' : modeSelection === 1 ? 'standard' : 'tspec';
    if (selectedMode === 'tspec' && selectedPort === 31457) {
      selectedPort = 31458;
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
        bg: 'black',
        border: { fg: 'cyan' },
      },
      fixed: true,
    });

    // createBox() draws a border BY DEFAULT: without this these one-row
    // boxes framed themselves, and a 1-row box whose border eats both rows
    // has nowhere left to print its text - the two empty rules seen in the
    // dialog on 2026-08-25, with the label and the help line invisible.
    const nickLabel = createBox({
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
    (nickInput as any).setValue(playerName.substring(0, 15));

    const nickInstructions = createBox({
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

    const nickResult = await new Promise<string | null>((resolve) => {
      const onEnter = () => {
        const nickname = (nickInput as any).getValue()?.trim() || 'Player';
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
      return;  // Cancelled
    }

    let passwordResult = '';
    if (selectedMode === 'tspec') {
      const passwordDialog = createBox({
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

      createBox({
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

      createBox({
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

      const passResult = await new Promise<string | null>((resolve) => {
        const onEnter = () => {
          const password = (passwordInput as any).getValue()?.trim() || '';
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
    const statusBox = createBox({
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
    const updateStatus = (status: string) => {
      statusBox.setContent(
        `{bold}{cyan-fg}Connecting to TetriNET server...{/cyan-fg}{/bold}\n\n` +
        `Server: ${result.server}:${result.port}\n` +
        `Mode: ${result.mode}\n` +
        `Status: ${status}`
      );
      this.screen.render();
    };

    try {
      // Create client and connect
      updateStatus('Creating socket...');
      const client = new TetriNetClient({
        host: result.server,
        port: result.port,
        nickname: result.nickname,
        mode: result.mode,
        password: result.password,
        timeout: 15000,
      });

      // Listen for state changes to update UI
      client.on('state:change', (state: string) => {
        if (state === 'connecting') {
          updateStatus('Connecting to server...');
        } else if (state === 'connected') {
          updateStatus(result.mode === 'tspec' ? 'Connected! Spectator mode' : 'Connected! Waiting for slot...');
        }
      });

      // Listen for detailed status updates
      client.on('status', (status: string) => {
        updateStatus(status);
      });

      updateStatus('Initiating TCP connection...');
      await client.connect();

      statusBox.setContent(
        `{bold}{green-fg}Connected!{/green-fg}{/bold}\n\n` +
        `${client.getSlot() ? `Slot ${client.getSlot()} assigned` : 'Spectator connected'}`
      );
      this.screen.render();

      // Wait a moment to show connected status
      await new Promise(r => setTimeout(r, 1000));
      statusBox.destroy();

      // Show the external server lobby/game
      await this.runTetriNetExternalGame(client);

      client.disconnect();

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
    if (this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
      console.log('[GRANDMASTER] Game mode disabled for TetriNET partyline input');
    }

    this.inputHandler.setEnabled(false);
    this.inputManager.suspend();  // Disable grabKeys for lobby input

    const externalAdapter = new TetriNetExternalAdapter(client);
    let gameScreen: TetriNetScreen | null = null;
    let gameEngine: TetriNetEngine | null = null;
    let lobbyEscapeHandler: (() => void) | null = null;
    let spectatorPublic = false;

    const { createTextbox } = await import('@amiexpress/bbs-door-sdk/utils/blessed-helpers');
    const footerHeight = 3;
    const inputHeight = 3;
    const sidePanelHeight = `100%-${footerHeight + inputHeight}`;
    const chatWidth = 36; // Consistent width for chat area and input

    const createLobbyUi = () => {
      const gameBox = createBox({
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

      const chatArea = createBox({
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

      const rightPanel = createBox({
        parent: gameBox,
        top: 0,
        right: 0,
        width: 26,
        height: sidePanelHeight,
        style: { bg: 'black' },
      });

      const playerList = createBox({
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

      const spectatorList = createBox({
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

      const footer = createBox({
        parent: gameBox,
        bottom: 0,
        left: 0,
        width: '100%',
        height: footerHeight,
        border: { type: 'line' },
        style: { border: { fg: 'gray' }, bg: 'black' },
        fixed: true,
      });

      createBox({
        parent: footer,
        top: 0,
        left: 1,
        width: '100%-2',
        height: 1,
        content: '{bold}Commands:{/bold} /team <name> | /me <action> | /public | /private | ESC to disconnect',
      });

      const footerStatus = createBox({
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

    let lobbyUi: ReturnType<typeof createLobbyUi> | null = createLobbyUi();

    const updateFooterStatus = () => {
      if (!lobbyUi) return;
      const modeLabel = client.getSlot() ? 'Player' : 'Spectator';
      const chatMode = spectatorPublic ? 'Public' : 'Private';
      const chatHint = client.getSlot() ? 'Partyline' : `TSpec ${chatMode}`;
      lobbyUi.footerStatus.setContent(
        `{gray-fg}Mode:{/gray-fg} ${modeLabel}  {gray-fg}Chat:{/gray-fg} ${chatHint}`
      );
      this.screen.render();
    };

    const updatePlayerList = () => {
      if (!lobbyUi) return;
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
      lobbyUi.playerList.setContent(content.trim());
      this.screen.render();
    };

    const updateSpectatorList = () => {
      if (!lobbyUi) return;
      const spectators = client.getSpectators();
      if (spectators.length === 0) {
        lobbyUi.spectatorList.setContent('{gray-fg}(none){/gray-fg}');
      } else {
        lobbyUi.spectatorList.setContent(spectators.join('\n'));
      }
      this.screen.render();
    };

    const addChatMessage = (msg: string) => {
      if (!lobbyUi) return;
      const current = lobbyUi.chatArea.getContent();
      const lines = current.split('\n').slice(-50);
      lines.push(msg);
      lobbyUi.chatArea.setContent(lines.join('\n'));
      lobbyUi.chatArea.setScrollPerc(100);
      this.screen.render();
    };

    const refreshOpponents = () => {
      if (!gameScreen) return;
      const mySlot = client.getSlot();
      const players = client.getPlayers().filter(p => p.slot !== mySlot);
      const opponents = players.map(player => {
        const board = externalAdapter.getBoardForSlot(player.slot) || createTetriNetBoard(12, 22);
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

    const registerLobbyEscape = (resolve: () => void) => {
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
      if (!ui) return;
      ui.chatInput.on('submit', (value: string) => {
        const text = value?.trim();
        if (!text) {
          (ui.chatInput as any).clearValue();
          ui.chatInput.focus();
          return;
        }

        if (text === '/public') {
          spectatorPublic = true;
          updateFooterStatus();
        } else if (text === '/private') {
          spectatorPublic = false;
          updateFooterStatus();
        } else if (text.startsWith('/team ')) {
          client.setTeam(text.substring(6).trim());
        } else if (text.startsWith('/me ')) {
          client.sendAction(text.substring(4).trim());
        } else if (text === '/start') {
          client.sendStartGame(true);
        } else if (text === '/stop') {
          client.sendStartGame(false);
        } else if (text === '/pause') {
          client.sendPause(true);
        } else if (text === '/resume') {
          client.sendPause(false);
        } else if (text.startsWith('/version')) {
          client.sendVersion('GRANDMASTER 1.0');
        } else {
          if (!client.getSlot() && spectatorPublic && !text.startsWith('//')) {
            client.sendChat(`//${text}`);
          } else {
            client.sendChat(text);
          }
          if (client.getSlot()) {
            const name = this.session.user?.username || this.state.playerName;
            addChatMessage(`<${name}> ${text}`);
          }
        }

        (ui.chatInput as any).clearValue();
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

    client.on('player:joined', (player: any) => {
      addChatMessage(`{green-fg}*** ${player.name} joined (slot ${player.slot}){/green-fg}`);
      updatePlayerList();
      refreshOpponents();
    });

    client.on('player:left', (data: any) => {
      addChatMessage(`{red-fg}*** Player left slot ${data.slot}{/red-fg}`);
      updatePlayerList();
      refreshOpponents();
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

    client.on('spectator:list', () => {
      updateSpectatorList();
    });

    client.on('spectator:joined', (name: string) => {
      addChatMessage(`{magenta-fg}*** ${name} is spectating{/magenta-fg}`);
      updateSpectatorList();
    });

    client.on('spectator:left', (name: string) => {
      addChatMessage(`{magenta-fg}*** ${name} stopped spectating{/magenta-fg}`);
      updateSpectatorList();
    });

    client.on('spectator:chat', (data: any) => {
      if (data.isAction) {
        addChatMessage(`{magenta-fg}* ${data.name} ${data.text}{/magenta-fg}`);
      } else {
        addChatMessage(`[SPEC] <${data.name}> ${data.text}`);
      }
    });

    const handleGameStart = async (data: any) => {
      if (gameScreen) return;
      addChatMessage(data.inProgress
        ? `{yellow-fg}*** Game is already in progress{/yellow-fg}`
        : `{bold}{green-fg}*** GAME STARTING! ***{/green-fg}{/bold}`);

      if (lobbyUi) {
        lobbyUi.destroy();
        lobbyUi = null;
      }
      unregisterLobbyEscape();
      this.inputHandler.setEnabled(true);
      this.inputManager.resume();  // Re-enable grabKeys for game controls

      // No allowHold here on purpose: on a real TetriNET server the other
      // clients have no hold, so switching it on locally would be an
      // advantage the rest of the table does not share.
      gameEngine = new TetriNetEngine(this.state.settings, data.options || {});
      gameScreen = new TetriNetScreen({
        screen: this.screen,
        engine: gameEngine,
        inputHandler: this.inputHandler,
        sounds: this.sounds,
        state: this.state,
        network: externalAdapter as any,
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
      this.inputManager.suspend();  // Disable grabKeys for lobby input
      lobbyUi = createLobbyUi();
      updatePlayerList();
      setupLobbyInput();
      this.screen.render();
    };

    client.on('game:start', (data: any) => {
      void handleGameStart(data);
    });

    client.on('game:end', () => {
      addChatMessage(`{bold}{yellow-fg}*** GAME OVER ***{/yellow-fg}{/bold}`);
      updatePlayerList();
    });

    client.on('player:lost', (data: any) => {
      addChatMessage(`{red-fg}*** Slot ${data.slot} topped out!{/red-fg}`);
      updatePlayerList();
      refreshOpponents();
    });

    client.on('special:used', (data: any) => {
      if (!gameEngine) return;
      const mySlot = client.getSlot();
      if (!mySlot) return;

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

    client.on('error', (error: Error) => {
      addChatMessage(`{red-fg}*** Error: ${error.message}{/red-fg}`);
    });

    await new Promise<void>((resolve) => {
      registerLobbyEscape(resolve);
    });

    if (lobbyUi) {
      lobbyUi.destroy();
      lobbyUi = null;
    }
    unregisterLobbyEscape();

    this.inputHandler.setEnabled(true);
    this.inputManager.resume();  // Re-enable grabKeys

    if (this.session.bbs?.enableGameMode) {
      this.session.bbs.enableGameMode();
      console.log('[GRANDMASTER] Game mode re-enabled after TetriNET partyline');
    }
  }

  /**
   * Show CPU Battle mode (offline versus with bots)
   */
  private async showCpuBattle(): Promise<void> {
    this.currentScreen = 'lobby';

    // Disable grabKeys so List widgets can receive keyboard input
    this.inputManager.suspend();
    const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});

    // Show difficulty selection
    const difficultyPanel = createBox({
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

    const difficultyBox = createList({
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

    const selection = await new Promise<number>((resolve) => {
      const onSelect = (_item: any, index: number) => {
        this.screen.unkey(['escape'], onEscape);
        resolve(index);
      };
      const onEscape = () => {
        if (this.isModalOpen()) return;
        difficultyBox.removeListener('select', onSelect);
        this.screen.unkey(['escape'], onEscape);
        resolve(7);  // Back
      };
      difficultyBox.on('select', onSelect);
      this.screen.key(['escape'], onEscape);
    });

    difficultyBox.destroy();
    difficultyPanel.destroy();

    nav.destroy();

    if (selection === 6 || selection === 7) {
      this.inputManager.resume();
      return;  // Back to menu
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
  private async startVersusGame(mode: string, lobbySettings?: Record<string, unknown>): Promise<void> {
    if (!this.network) return;

    this.currentScreen = 'game';
    this.state.currentMode = 'versus';

    // Disable mouse control during gameplay
    this.screen.program.disableMouse();

    // Create attack manager for multiplayer
    this.attackManager = new AttackManager();

    // Lobby settings, previously collected and then dropped on the floor -
    // the versus path never read result.settings at all, so Start Level and
    // Garbage Lines described nothing.
    const startLevel = Math.max(0, Number(lobbySettings?.startingLevel ?? 0) || 0);
    const garbageEnabled = lobbySettings?.garbage !== false;

    // Create game engine with attack manager
    this.gameEngine = new GameEngine('versus', this.state.settings, this.sounds, this.attackManager, startLevel);

    // Create versus screen
    const versusScreen = new VersusScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state,
      this.network,
      this.attackManager,
      undefined,        // botOrAI
      this.session,     // sessionRef for voice chat
    );
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
  private async startCpuBattle(botDifficulty: number, opponentCount: number = 3, lobbySettings?: Record<string, unknown>): Promise<void> {
    this.currentScreen = 'game';
    this.state.currentMode = 'versus';

    // Disable mouse control during gameplay
    this.screen.program.disableMouse();

    // Show loading message
    const loadingBox = createBox({
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
    this.attackManager = new AttackManager();

    // Create game engine for human player with attack manager
    const startLevel = Math.max(0, Number(lobbySettings?.startingLevel ?? 0) || 0);
    const garbageEnabled = lobbySettings?.garbage !== false;

    this.gameEngine = new GameEngine('versus', this.state.settings, this.sounds, this.attackManager, startLevel);

    // Create AI opponents (3 opponents at selected difficulty)
    const { VersusAI } = await import('./ai/versus-ai');
    const versusAI = new VersusAI();
    const aiOpponents = versusAI.createOpponents(
      opponentCount,
      botDifficulty as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
      this.state.settings,
      this.sounds
    );

    // Create versus screen with AI opponents
    const versusScreen = new VersusScreen(
      this.screen,
      this.gameEngine,
      this.inputHandler,
      this.sounds,
      this.state,
      null,  // No network for CPU battle
      this.attackManager,
      versusAI,         // Pass AI controller instead of botDifficulty
      this.session,     // sessionRef for voice chat
    );
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
  private async showSettings(): Promise<void> {
    this.currentScreen = 'settings';

    this.inputManager.suspend();
    const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
    const settingsScreen = new SettingsScreen(this.screen, this.state, this.sounds, this.session.bbsSession);
    await settingsScreen.show();
    nav.destroy();
    this.inputManager.resume();

    // Update input handler with any changed key bindings
    this.inputHandler.updateConfig(this.state.settings.keyBindings as any);

    // Persist settings to disk for this user
    this.saveSettings();
  }

  /**
   * Show statistics/leaderboard screen
   */
  private async showStats(): Promise<void> {
    this.currentScreen = 'stats';

    this.inputManager.suspend();
    const nav = createMenuNav(this.session.bbsSession, this.screen, this.state.settings.gamepadBindings ?? {});
    const leaderboardScreen = new LeaderboardScreen(
      this.screen,
      this.highScores,
      this.sounds,
      this.state.playerName
    );

    await leaderboardScreen.show();
    nav.destroy();
    this.inputManager.resume();
  }

  /**
   * Show player manual
   */
  private async showManual(): Promise<void> {
    this.inputManager.suspend();
    return new Promise((resolve) => {
      showManual(this.screen, () => {
        this.screen.render();
        this.inputManager.resume();
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
  private async submitScore(userId: string, username: string, override?: GameResult): Promise<void> {
    // TetriNET runs on its own engine, so it supplies the result directly.
    // Gating this on `this.gameEngine` is why no TetriNET game ever reached
    // the score server or the Discord webhook.
    const result = override ?? this.gameEngine?.getResult();
    if (!result) return;

    // Only the TGM engine records replays.
    const replay = override ? null : this.gameEngine?.finalizeRecording() ?? null;

    // Submit to server
    try {
      const submission = await this.multiplayerServer.submitScore(
        userId,
        username,
        result,
        replay || undefined
      );

      if (submission.accepted) {
        // Broadcast score to livechat feed and Discord
        this.broadcastScore(username, result, submission);
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
   * Broadcast score to livechat feed and Discord webhook
   */
  private broadcastScore(
    username: string,
    result: GameResult,
    submission: { rank?: number; isPersonalBest?: boolean; isTopTen?: boolean }
  ): void {
    if (!this.session.bbs?.emitCustomEvent) return;

    const modeName = this.state.currentMode === 'tetrinet' ? 'TetriNET'
      : this.state.currentMode === 'sprint' ? 'Sprint'
      : this.state.currentMode === 'ultra' ? 'Ultra'
      : this.state.currentMode === 'marathon' ? 'Marathon'
      : this.state.currentMode === 'master' ? 'Master'
      : this.state.currentMode || 'Classic';

    const parts: string[] = [];
    parts.push(`${modeName} - Score: ${result.score.toLocaleString()}`);
    parts.push(`Grade: ${result.grade}`);
    parts.push(`Level: ${result.level}`);
    parts.push(`Lines: ${result.lines}`);
    if (result.time) {
      const mins = Math.floor(result.time / 60000);
      const secs = Math.floor((result.time % 60000) / 1000);
      parts.push(`Time: ${mins}:${secs.toString().padStart(2, '0')}`);
    }
    if (submission.rank) parts.push(`Rank: #${submission.rank}`);
    if (submission.isPersonalBest) parts.push('NEW PB!');

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
    } catch (err) {
      console.error('[GRANDMASTER] Failed to broadcast score:', err);
    }
  }

  /**
   * Broadcast multiplayer match result (winner/loser) to livechat and Discord
   */
  private broadcastMatchResult(localUsername: string, override?: { result: GameResult; won: boolean }): void {
    if (!this.session.bbs?.emitCustomEvent) return;
    if (!this.network) return;

    const matchState = this.network.getMatchState();
    if (!matchState || matchState.players.length < 2) return;

    // TetriNET has its own engine and knows its own outcome, so it passes
    // both in; the versus path keeps reading the TGM engine.
    const result = override?.result ?? this.gameEngine?.getResult();
    if (!result) return;

    const isGameOver = result.completed || (result.score > 0);
    if (!isGameOver) return;

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

    let message: string;
    if (matchState.players.length === 2) {
      // 1v1
      if (localWon) {
        message = `defeated ${opponentNames} in ${modeLabel}!`;
      } else {
        message = `was defeated by ${opponentNames} in ${modeLabel}`;
      }
    } else {
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
    } catch (err) {
      console.error('[GRANDMASTER] Failed to broadcast match result:', err);
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
