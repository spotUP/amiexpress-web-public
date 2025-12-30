/**
 * Zoo Keeper - Browser Client Entry Point
 * Hybrid door client with Tone.js audio and TrackerEngine music
 */

import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';
import { TrackerEngine } from '@amiexpress/bbs-door-sdk/engines/audio/tracker-engine';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { ZooKeeperGame } from './game/zoo-stage';
import {
  ZooKeeperData,
  GameState,
  InputKey,
  Direction,
  HighScore,
  SoundEffect
} from './game/types';
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  GAME_TICK_MS,
  STARTING_LIVES,
  MENU_OPTIONS,
  COLORS,
  DEFAULT_HIGHSCORES
} from './game/constants';

/**
 * Zoo Keeper Audio System
 * Manages Tone.js sound effects and TrackerEngine music
 */
class ZooKeeperAudio {
  private sfx: AudioEngine | null = null;
  private music: TrackerEngine | null = null;
  private enabled: boolean = true;
  private musicEnabled: boolean = true;

  async init(): Promise<void> {
    try {
      // Initialize Tone.js sound effects
      this.sfx = new AudioEngine({
        masterVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.5
      });
      await this.sfx.init();

      // Register sound effects
      this.registerSounds();

      // Initialize TrackerEngine for MOD music
      this.music = new TrackerEngine({
        repeatCount: -1,  // Loop forever
        volume: 0.5
      });

      this.music.on('initialized', () => {
        console.log('[Zoo Keeper] TrackerEngine initialized');
      });

      this.music.on('error', (err: Error) => {
        console.warn('[Zoo Keeper] Music error:', err);
        this.musicEnabled = false;
      });

    } catch (error) {
      console.warn('[Zoo Keeper] Audio initialization failed:', error);
      this.enabled = false;
      this.musicEnabled = false;
    }
  }

  /**
   * Register procedural sound effects using Tone.js
   */
  private registerSounds(): void {
    if (!this.sfx) return;

    // Jump sound - short ascending tone
    this.sfx.registerSound('jump', {
      type: 'synth',
      synth: {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
      },
      notes: [{ note: 'C5', duration: '16n' }, { note: 'E5', duration: '16n' }]
    });

    // Capture sound - coin-like
    this.sfx.registerSound('capture', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 }
      },
      notes: [{ note: 'E5', duration: '16n' }, { note: 'G5', duration: '16n' }, { note: 'C6', duration: '8n' }]
    });

    // Death sound - descending
    this.sfx.registerSound('death', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.2 }
      },
      notes: [{ note: 'C4', duration: '8n' }, { note: 'A3', duration: '8n' }, { note: 'F3', duration: '4n' }]
    });

    // Wall break - noise burst
    this.sfx.registerSound('wallBreak', {
      type: 'noise',
      noiseType: 'white',
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 }
    });

    // Bonus collect - happy ding
    this.sfx.registerSound('bonusCollect', {
      type: 'synth',
      synth: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 }
      },
      notes: [{ note: 'G5', duration: '16n' }, { note: 'C6', duration: '8n' }]
    });

    // Net collect - special powerup sound
    this.sfx.registerSound('netCollect', {
      type: 'synth',
      synth: {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }
      },
      notes: [
        { note: 'C5', duration: '16n' },
        { note: 'E5', duration: '16n' },
        { note: 'G5', duration: '16n' },
        { note: 'C6', duration: '8n' }
      ]
    });

    // Level complete - fanfare
    this.sfx.registerSound('levelComplete', {
      type: 'synth',
      synth: {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }
      },
      notes: [
        { note: 'C5', duration: '8n' },
        { note: 'E5', duration: '8n' },
        { note: 'G5', duration: '8n' },
        { note: 'C6', duration: '4n' }
      ]
    });

    // Game over - sad descending
    this.sfx.registerSound('gameOver', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.05, decay: 0.5, sustain: 0.2, release: 0.5 }
      },
      notes: [
        { note: 'E4', duration: '4n' },
        { note: 'D4', duration: '4n' },
        { note: 'C4', duration: '2n' }
      ]
    });

    // Menu select
    this.sfx.registerSound('menuSelect', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 }
      },
      notes: [{ note: 'C5', duration: '32n' }]
    });

    // Menu move
    this.sfx.registerSound('menuMove', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.02 }
      },
      notes: [{ note: 'G4', duration: '64n' }]
    });

    // Animal escape
    this.sfx.registerSound('animalEscape', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.1, release: 0.1 }
      },
      notes: [{ note: 'A4', duration: '8n' }, { note: 'F4', duration: '8n' }]
    });

    // Coconut bounce
    this.sfx.registerSound('coconutBounce', {
      type: 'synth',
      synth: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.02 }
      },
      notes: [{ note: 'E4', duration: '32n' }]
    });

    // Platform land
    this.sfx.registerSound('platformLand', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 }
      },
      notes: [{ note: 'D4', duration: '16n' }]
    });
  }

  /**
   * Play a sound effect
   */
  play(sound: SoundEffect): void {
    if (!this.enabled || !this.sfx) return;

    try {
      this.sfx.playSound(sound);
    } catch (error) {
      console.warn(`[Zoo Keeper] Sound playback error (${sound}):`, error);
    }
  }

  /**
   * Start background music
   */
  async playMusic(track: string = 'zoo'): Promise<void> {
    if (!this.musicEnabled || !this.music) return;

    try {
      await this.music.load(`/doors/zoo-keeper/assets/music/${track}.mod`);
      this.music.play();
    } catch (error) {
      console.warn('[Zoo Keeper] Music playback error:', error);
      // Fallback: continue without music
    }
  }

  /**
   * Stop background music
   */
  stopMusic(): void {
    if (this.music) {
      this.music.stop();
    }
  }

  /**
   * Pause/resume music
   */
  toggleMusic(): void {
    if (!this.music) return;

    if (this.music.isPlaying) {
      this.music.pause();
    } else {
      this.music.play();
    }
  }

  /**
   * Set master volume
   */
  setVolume(volume: number): void {
    if (this.sfx) {
      this.sfx.setMasterVolume(volume);
    }
    if (this.music) {
      this.music.setVolume(volume * 0.7);  // Music slightly quieter
    }
  }

  /**
   * Cleanup audio resources
   */
  dispose(): void {
    this.stopMusic();
    if (this.music) {
      this.music.removeAllListeners();
      this.music.dispose();
    }
    if (this.sfx) {
      this.sfx.dispose();
    }
  }
}

/**
 * Create initial game data
 */
function createInitialGameData(): ZooKeeperData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    round: 1,

    zeke: {
      x: 40,
      y: 10,
      direction: 'right',
      hasNet: false,
      netTimer: 0,
      isJumping: false,
      jumpFrame: 0,
      isDead: false,
      deathFrame: 0
    },

    zooStage: {
      wall: [],
      animals: [],
      bonusItems: [],
      timer: 60,
      fusePosition: 0,
      animalIdCounter: 0
    },

    platformStage: {
      platforms: [],
      coconuts: [],
      zelda: { x: 40, y: 2 },
      monkey: { x: 60, y: 3 },
      monkeyThrowTimer: 0,
      zekelY: 18,
      zekelPlatformIndex: -1
    },

    stampedeStage: {
      escalatorSpeed: 1,
      chargingAnimals: [],
      zekelY: 18,
      jumpedAnimals: 0
    },

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: '',
    playerNameCursor: 0,

    lastUpdateTime: Date.now(),
    frameCount: 0,

    transitionTimer: 0,
    transitionMessage: ''
  };
}

/**
 * Main client door class
 */
class ZooKeeperClient {
  private door: ClientDoor;
  private audio: ZooKeeperAudio;
  private gameData: ZooKeeperData;
  private screen: ReturnType<typeof blessed.screen> | null = null;
  private gameArea: ReturnType<typeof blessed.box> | null = null;
  private hudBox: ReturnType<typeof blessed.box> | null = null;
  private footerBox: ReturnType<typeof blessed.box> | null = null;
  private menuBox: ReturnType<typeof blessed.box> | null = null;
  private gameLoop: ReturnType<typeof setInterval> | null = null;
  private game: ZooKeeperGame | null = null;

  constructor() {
    this.door = new ClientDoor({
      name: 'Zoo Keeper',
      version: '1.0.0'
    });
    this.audio = new ZooKeeperAudio();
    this.gameData = createInitialGameData();
  }

  /**
   * Initialize the client
   */
  async init(): Promise<void> {
    // Initialize audio first (may need user interaction)
    await this.audio.init();

    // Load high scores from server
    try {
      const scores = await this.door.rpc<HighScore[]>('getHighscores');
      if (scores) {
        this.gameData.highscores = scores;
      }
    } catch {
      // Use defaults
    }

    // Initialize screen
    this.initScreen();

    // Show menu
    this.showMenu();

    // Start menu music
    this.audio.playMusic('menu');

    // Set up input handler
    this.door.onInput((data: string) => {
      this.handleInput(data);
    });
  }

  /**
   * Initialize neo-blessed screen
   */
  private initScreen(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      dockBorders: true,
      title: 'Zoo Keeper',
      fullUnicode: false,
      output: (data: string) => this.door.write(data),
      input: null as any
    });

    // HUD at top
    this.hudBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      content: this.formatHUD()
    });

    // Main game area
    this.gameArea = blessed.box({
      parent: this.screen,
      top: 1,
      left: 0,
      width: '100%',
      height: SCREEN_HEIGHT - 4,
      tags: true,
      style: {
        bg: 'black'
      }
    });

    // Footer with controls
    this.footerBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'gray' }
      },
      content: '{gray-fg}Arrow Keys: Move | Space: Jump | P: Pause | Q: Quit{/}'
    });
  }

  /**
   * Format HUD display
   */
  private formatHUD(): string {
    const scoreStr = this.gameData.score.toString().padStart(8, '0');
    const livesStr = '*'.repeat(this.gameData.lives);
    return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${this.gameData.level}{/}  {red-fg}LIVES: ${livesStr}{/}`;
  }

  /**
   * Show main menu
   */
  private showMenu(): void {
    this.gameData.state = 'menu';
    this.gameData.menuSelection = 0;

    if (this.gameArea) {
      this.gameArea.setContent('');
    }

    if (this.menuBox) {
      this.menuBox.destroy();
    }

    const menuContent = [
      '{yellow-fg}',
      '  ______   ___    ___   ',
      ' |___  /  / _ \\  / _ \\  ',
      '    / /  | | | || | | | ',
      '   / /   | |_| || |_| | ',
      '  / /__   \\___/  \\___/  ',
      ' /_____|               ',
      '  _  __                            ',
      ' | |/ / ___   ___  _ __   ___  _ __ ',
      ' | \' / / _ \\ / _ \\| \'_ \\ / _ \\| \'__|',
      ' | . \\|  __/|  __/| |_) |  __/| |   ',
      ' |_|\\_\\\\___| \\___|| .__/ \\___||_|   ',
      '                  |_|              ',
      '{/}',
      '',
      '{white-fg}Classic 1982 Taito Arcade Game{/}',
      ''
    ];

    MENU_OPTIONS.forEach((option, index) => {
      const selected = index === this.gameData.menuSelection;
      const prefix = selected ? '> ' : '  ';
      const color = selected ? 'cyan' : 'white';
      menuContent.push(`{${color}-fg}${prefix}${option}{/}`);
    });

    this.menuBox = blessed.box({
      parent: this.gameArea!,
      top: 'center',
      left: 'center',
      width: 50,
      height: menuContent.length + 2,
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'yellow' },
        focus: { border: { fg: 'cyan' } },
        hover: { border: { fg: 'cyan' } }
      },
      content: menuContent.join('\n')
    });

    this.screen?.render();
  }

  /**
   * Start the game
   */
  private startGame(): void {
    this.gameData.state = 'playing';
    this.gameData.score = 0;
    this.gameData.lives = STARTING_LIVES;
    this.gameData.level = 1;
    this.gameData.round = 1;

    if (this.menuBox) {
      this.menuBox.destroy();
      this.menuBox = null;
    }

    // Stop menu music, start game music
    this.audio.stopMusic();
    this.audio.playMusic('zoo');

    // Initialize game engine with audio callbacks
    this.game = new ZooKeeperGame(this.gameData, (content: string) => {
      if (this.gameArea) {
        this.gameArea.setContent(content);
      }
      if (this.hudBox) {
        this.hudBox.setContent(this.formatHUD());
      }
      this.screen?.render();
    });

    // Inject audio into game
    (this.game as any).audio = this.audio;

    this.game.initZooStage();

    // Start game loop
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }

    this.gameLoop = setInterval(() => {
      if (this.gameData.state === 'playing' || this.gameData.state === 'platform' || this.gameData.state === 'stampede') {
        this.game?.update();
      }
    }, GAME_TICK_MS);
  }

  /**
   * Handle input
   */
  private handleInput(key: string): void {
    const inputKey = this.normalizeKey(key);

    switch (this.gameData.state) {
      case 'menu':
        this.handleMenuInput(inputKey);
        break;

      case 'highscores':
        this.showMenu();
        break;

      case 'playing':
      case 'platform':
      case 'stampede':
        this.handleGameInput(inputKey);
        break;

      case 'paused':
        if (inputKey === 'p' || inputKey === 'escape') {
          this.gameData.state = 'playing';
          this.audio.toggleMusic();
          this.game?.render();
        }
        break;

      case 'gameover':
        this.handleGameOverInput(inputKey);
        break;

      case 'enterName':
        this.handleNameEntryInput(inputKey);
        break;

      default:
        this.showMenu();
    }
  }

  /**
   * Normalize key input
   */
  private normalizeKey(key: string): InputKey {
    if (key === '\x1b[A' || key === 'w' || key === 'W') return 'up';
    if (key === '\x1b[B' || key === 's' || key === 'S') return 'down';
    if (key === '\x1b[C' || key === 'd' || key === 'D') return 'right';
    if (key === '\x1b[D' || key === 'a' || key === 'A') return 'left';
    if (key === ' ') return 'space';
    if (key === '\r' || key === '\n') return 'enter';
    if (key === '\x1b' || key === '\x1b\x1b') return 'escape';
    if (key === '\x7f' || key === '\b') return 'backspace';
    if (key === '\t') return 'tab';
    return key.toLowerCase();
  }

  /**
   * Handle menu input
   */
  private handleMenuInput(key: InputKey): void {
    switch (key) {
      case 'up':
        this.gameData.menuSelection = Math.max(0, this.gameData.menuSelection - 1);
        this.audio.play('menuMove');
        this.showMenu();
        break;

      case 'down':
        this.gameData.menuSelection = Math.min(MENU_OPTIONS.length - 1, this.gameData.menuSelection + 1);
        this.audio.play('menuMove');
        this.showMenu();
        break;

      case 'enter':
      case 'space':
        this.audio.play('menuSelect');
        switch (this.gameData.menuSelection) {
          case 0:
            this.startGame();
            break;
          case 1:
            this.showHighscores();
            break;
          case 2:
            this.showHelp();
            break;
          case 3:
            this.cleanup();
            this.door.exit();
            break;
        }
        break;

      case 'q':
      case 'escape':
        this.cleanup();
        this.door.exit();
        break;
    }
  }

  /**
   * Handle game input
   */
  private handleGameInput(key: InputKey): void {
    switch (key) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.game?.handleDirection(key as Direction);
        break;

      case 'space':
        this.audio.play('jump');
        this.game?.handleJump();
        break;

      case 'p':
        this.gameData.state = 'paused';
        this.audio.toggleMusic();
        this.showPauseScreen();
        break;

      case 'q':
      case 'escape':
        this.gameData.state = 'menu';
        if (this.gameLoop) {
          clearInterval(this.gameLoop);
          this.gameLoop = null;
        }
        this.audio.stopMusic();
        this.audio.playMusic('menu');
        this.showMenu();
        break;
    }
  }

  /**
   * Show high scores
   */
  private async showHighscores(): Promise<void> {
    this.gameData.state = 'highscores';

    try {
      const scores = await this.door.rpc<HighScore[]>('getHighscores');
      if (scores) {
        this.gameData.highscores = scores;
      }
    } catch {
      // Use cached scores
    }

    const content = [
      '{yellow-fg}HIGH SCORES{/}',
      '',
      '{white-fg}RANK  NAME   SCORE     LEVEL{/}',
      '{gray-fg}----  ----  --------   -----{/}'
    ];

    this.gameData.highscores.slice(0, 10).forEach((score, index) => {
      const rank = (index + 1).toString().padStart(2, ' ');
      const name = score.name.padEnd(4, ' ');
      const scoreStr = score.score.toString().padStart(8, ' ');
      const level = score.level.toString().padStart(2, ' ');
      content.push(`{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}`);
    });

    content.push('');
    content.push('{gray-fg}Press any key to return{/}');

    if (this.menuBox) {
      this.menuBox.destroy();
    }

    this.menuBox = blessed.box({
      parent: this.gameArea!,
      top: 'center',
      left: 'center',
      width: 40,
      height: content.length + 2,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' }
      },
      content: content.join('\n')
    });

    this.screen?.render();
  }

  /**
   * Show help screen
   */
  private showHelp(): void {
    const content = [
      '{yellow-fg}HOW TO PLAY{/}',
      '',
      '{cyan-fg}ZOO STAGE:{/}',
      'Run around the perimeter to build walls.',
      'Keep the animals contained inside!',
      'Collect the NET to capture escaped animals.',
      '',
      '{cyan-fg}PLATFORM STAGE:{/}',
      'Jump up the platforms to rescue Zelda!',
      'Avoid the coconuts thrown by the monkey.',
      '',
      '{cyan-fg}STAMPEDE STAGE:{/}',
      'Jump over the charging animals!',
      'Reach the top for an extra life.',
      '',
      '{white-fg}CONTROLS:{/}',
      'Arrow Keys - Move',
      'Space      - Jump',
      'P          - Pause',
      'Q          - Quit',
      '',
      '{gray-fg}Press any key to return{/}'
    ];

    if (this.menuBox) {
      this.menuBox.destroy();
    }

    this.menuBox = blessed.box({
      parent: this.gameArea!,
      top: 'center',
      left: 'center',
      width: 50,
      height: content.length + 2,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' }
      },
      content: content.join('\n')
    });

    this.screen?.render();
  }

  /**
   * Show pause screen
   */
  private showPauseScreen(): void {
    const content = [
      '{yellow-fg}PAUSED{/}',
      '',
      '{white-fg}Press P to resume{/}',
      '{gray-fg}Press Q to quit{/}'
    ];

    if (this.menuBox) {
      this.menuBox.destroy();
    }

    this.menuBox = blessed.box({
      parent: this.gameArea!,
      top: 'center',
      left: 'center',
      width: 30,
      height: content.length + 2,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      content: content.join('\n')
    });

    this.screen?.render();
  }

  /**
   * Handle game over input
   */
  private handleGameOverInput(key: InputKey): void {
    if (key === 'enter' || key === 'space') {
      const lowestScore = this.gameData.highscores[this.gameData.highscores.length - 1]?.score || 0;
      if (this.gameData.score > lowestScore || this.gameData.highscores.length < 10) {
        this.gameData.state = 'enterName';
        this.gameData.playerName = '';
        this.gameData.playerNameCursor = 0;
        this.showNameEntry();
      } else {
        this.showMenu();
      }
    } else if (key === 'q' || key === 'escape') {
      this.showMenu();
    }
  }

  /**
   * Show name entry screen
   */
  private showNameEntry(): void {
    const content = [
      '{yellow-fg}NEW HIGH SCORE!{/}',
      '',
      `{white-fg}Score: {yellow-fg}${this.gameData.score}{/}`,
      '',
      '{cyan-fg}Enter your initials:{/}',
      '',
      `{white-fg}[ ${this.gameData.playerName.padEnd(3, '_')} ]{/}`,
      '',
      '{gray-fg}Press ENTER when done{/}'
    ];

    if (this.menuBox) {
      this.menuBox.destroy();
    }

    this.menuBox = blessed.box({
      parent: this.gameArea!,
      top: 'center',
      left: 'center',
      width: 35,
      height: content.length + 2,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      content: content.join('\n')
    });

    this.screen?.render();
  }

  /**
   * Handle name entry input
   */
  private async handleNameEntryInput(key: InputKey): Promise<void> {
    if (key === 'enter') {
      if (this.gameData.playerName.length > 0) {
        try {
          await this.door.rpc('saveHighscore', {
            name: this.gameData.playerName,
            score: this.gameData.score,
            level: this.gameData.level
          });
        } catch {
          // Continue anyway
        }
        this.showMenu();
      }
    } else if (key === 'backspace') {
      if (this.gameData.playerName.length > 0) {
        this.gameData.playerName = this.gameData.playerName.slice(0, -1);
        this.showNameEntry();
      }
    } else if (key === 'escape') {
      this.showMenu();
    } else if (typeof key === 'string' && key.length === 1 && /[A-Za-z0-9]/.test(key)) {
      if (this.gameData.playerName.length < 3) {
        this.gameData.playerName += key.toUpperCase();
        this.showNameEntry();
      }
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
    this.audio.dispose();
    if (this.screen) {
      this.screen.removeAllListeners();
      this.screen.destroy();
    }
  }
}

// Initialize and run client
const client = new ZooKeeperClient();
client.init().catch(console.error);

export default client;
