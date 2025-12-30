/**
 * Super Qix - Browser Client Entry Point
 * Hybrid door client with Tone.js audio and TrackerEngine music
 */

import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';
import { TrackerEngine } from '@amiexpress/bbs-door-sdk/engines/audio/tracker-engine';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { QixEngine } from './game/qix-engine';
import {
  SuperQixData,
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
  DEFAULT_HIGHSCORES,
  FIELD_WIDTH,
  FIELD_HEIGHT
} from './game/constants';

/**
 * Super Qix Audio System
 */
class SuperQixAudio {
  private sfx: AudioEngine | null = null;
  private music: TrackerEngine | null = null;
  private enabled: boolean = true;
  private musicEnabled: boolean = true;

  async init(): Promise<void> {
    try {
      this.sfx = new AudioEngine({
        masterVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.5
      });
      await this.sfx.init();
      this.registerSounds();

      this.music = new TrackerEngine({
        repeatCount: -1,
        volume: 0.5
      });

      this.music.on('initialized', () => {
        console.log('[Super Qix] TrackerEngine initialized');
      });

      this.music.on('error', (err: Error) => {
        console.warn('[Super Qix] Music error:', err);
        this.musicEnabled = false;
      });

    } catch (error) {
      console.warn('[Super Qix] Audio initialization failed:', error);
      this.enabled = false;
      this.musicEnabled = false;
    }
  }

  private registerSounds(): void {
    if (!this.sfx) return;

    // Draw start - laser-like ascending
    this.sfx.registerSound('drawStart', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.1 }
      },
      notes: [{ note: 'A3', duration: '16n' }, { note: 'E4', duration: '16n' }]
    });

    // Draw complete - success chime
    this.sfx.registerSound('drawComplete', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 }
      },
      notes: [
        { note: 'C5', duration: '16n' },
        { note: 'E5', duration: '16n' },
        { note: 'G5', duration: '8n' }
      ]
    });

    // Death - explosion descending
    this.sfx.registerSound('death', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }
      },
      notes: [
        { note: 'E4', duration: '8n' },
        { note: 'C4', duration: '8n' },
        { note: 'A3', duration: '4n' }
      ]
    });

    // Power-up collect
    this.sfx.registerSound('powerUp', {
      type: 'synth',
      synth: {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 }
      },
      notes: [
        { note: 'G4', duration: '16n' },
        { note: 'B4', duration: '16n' },
        { note: 'D5', duration: '16n' },
        { note: 'G5', duration: '8n' }
      ]
    });

    // Fuse burning
    this.sfx.registerSound('fuse', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.05, sustain: 0.1, release: 0.05 }
      },
      notes: [{ note: 'A2', duration: '32n' }]
    });

    // Level complete fanfare
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

    // Game over
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

    // Menu sounds
    this.sfx.registerSound('menuSelect', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 }
      },
      notes: [{ note: 'C5', duration: '32n' }]
    });

    this.sfx.registerSound('menuMove', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.02 }
      },
      notes: [{ note: 'G4', duration: '64n' }]
    });

    // Qix bounce
    this.sfx.registerSound('qixBounce', {
      type: 'synth',
      synth: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.08, sustain: 0, release: 0.02 }
      },
      notes: [{ note: 'D3', duration: '32n' }]
    });

    // Letter collect
    this.sfx.registerSound('letterCollect', {
      type: 'synth',
      synth: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 }
      },
      notes: [{ note: 'E5', duration: '16n' }, { note: 'G5', duration: '8n' }]
    });
  }

  play(sound: SoundEffect): void {
    if (!this.enabled || !this.sfx) return;
    try {
      this.sfx.playSound(sound);
    } catch (error) {
      console.warn(`[Super Qix] Sound error (${sound}):`, error);
    }
  }

  async playMusic(track: string = 'qix'): Promise<void> {
    if (!this.musicEnabled || !this.music) return;
    try {
      await this.music.load(`/doors/super-qix/assets/music/${track}.mod`);
      this.music.play();
    } catch (error) {
      console.warn('[Super Qix] Music error:', error);
    }
  }

  stopMusic(): void {
    if (this.music) {
      this.music.stop();
    }
  }

  toggleMusic(): void {
    if (!this.music) return;
    if (this.music.isPlaying) {
      this.music.pause();
    } else {
      this.music.play();
    }
  }

  setVolume(volume: number): void {
    if (this.sfx) {
      this.sfx.setMasterVolume(volume);
    }
    if (this.music) {
      this.music.setVolume(volume * 0.7);
    }
  }

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
function createInitialGameData(): SuperQixData {
  return {
    state: 'menu',
    score: 0,
    lives: STARTING_LIVES,
    level: 1,
    claimedPercent: 0,
    targetPercent: 75,
    scoreMultiplier: 1,

    field: [],
    fieldWidth: FIELD_WIDTH,
    fieldHeight: FIELD_HEIGHT,

    marker: {
      x: Math.floor(FIELD_WIDTH / 2),
      y: FIELD_HEIGHT - 1,
      isDrawing: false,
      drawSpeed: null,
      hasShield: false,
      speedBoost: false,
      speedBoostTimer: 0
    },

    currentStix: null,

    qixList: [],
    sparxList: [],
    fuse: null,
    qixIdCounter: 0,
    sparxIdCounter: 0,

    powerUps: [],
    powerUpIdCounter: 0,
    collectedLetters: [],
    levelWord: '',
    activeEffects: [],

    borderPath: [],

    highscores: [...DEFAULT_HIGHSCORES],
    menuSelection: 0,
    playerName: '',
    playerNameCursor: 0,

    lastUpdateTime: Date.now(),
    frameCount: 0,
    levelStartTime: Date.now(),
    stopTimer: 0,

    transitionTimer: 0,
    transitionMessage: ''
  };
}

/**
 * Main client door class
 */
class SuperQixClient {
  private door: ClientDoor;
  private audio: SuperQixAudio;
  private gameData: SuperQixData;
  private screen: ReturnType<typeof blessed.screen> | null = null;
  private gameArea: ReturnType<typeof blessed.box> | null = null;
  private hudBox: ReturnType<typeof blessed.box> | null = null;
  private footerBox: ReturnType<typeof blessed.box> | null = null;
  private menuBox: ReturnType<typeof blessed.box> | null = null;
  private gameLoop: ReturnType<typeof setInterval> | null = null;
  private engine: QixEngine | null = null;

  constructor() {
    this.door = new ClientDoor({
      name: 'Super Qix',
      version: '1.0.0'
    });
    this.audio = new SuperQixAudio();
    this.gameData = createInitialGameData();
  }

  async init(): Promise<void> {
    await this.audio.init();

    try {
      const scores = await this.door.rpc<HighScore[]>('getHighscores');
      if (scores) {
        this.gameData.highscores = scores;
      }
    } catch {
      // Use defaults
    }

    this.initScreen();
    this.showMenu();
    this.audio.playMusic('menu');

    this.door.onInput((data: string) => {
      this.handleInput(data);
    });
  }

  private initScreen(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      dockBorders: true,
      title: 'Super Qix',
      fullUnicode: false,
      output: (data: string) => this.door.write(data),
      input: null as any
    });

    this.hudBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      content: this.formatHUD()
    });

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
      content: '{gray-fg}Arrows: Move | Z: Slow Draw | X: Fast Draw | P: Pause | Q: Quit{/}'
    });
  }

  private formatHUD(): string {
    const scoreStr = this.gameData.score.toString().padStart(8, '0');
    const livesStr = '*'.repeat(this.gameData.lives);
    const percentStr = Math.floor(this.gameData.claimedPercent).toString().padStart(2, ' ');
    let hud = `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LVL: ${this.gameData.level}{/}  {green-fg}CLAIMED: ${percentStr}%{/}  {red-fg}LIVES: ${livesStr}{/}`;

    // Add active effects
    if (this.gameData.marker.speedBoost) {
      hud += '  {yellow-fg}[SPEED]{/}';
    }
    if (this.gameData.marker.hasShield) {
      hud += '  {cyan-fg}[SHIELD]{/}';
    }

    return hud;
  }

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
      '{magenta-fg}',
      '   ____  _   _ ____  _____ ____  ',
      '  / ___|| | | |  _ \\| ____|  _ \\ ',
      '  \\___ \\| | | | |_) |  _| | |_) |',
      '   ___) | |_| |  __/| |___|  _ < ',
      '  |____/ \\___/|_|   |_____|_| \\_\\',
      '         ___  _____  __',
      '        / _ \\|_ _\\ \\/ /',
      '       | | | || | \\  / ',
      '       | |_| || | /  \\ ',
      '        \\__\\_\\___/_/\\_\\',
      '{/}',
      '',
      '{white-fg}Classic 1987 Taito Arcade Game{/}',
      ''
    ];

    MENU_OPTIONS.forEach((option, index) => {
      const selected = index === this.gameData.menuSelection;
      const prefix = selected ? '{cyan-fg}> ' : '{white-fg}  ';
      const suffix = selected ? '{/}' : '{/}';
      menuContent.push(`${prefix}${option}${suffix}`);
    });

    this.menuBox = blessed.box({
      parent: this.gameArea!,
      top: 'center',
      left: 'center',
      width: 45,
      height: menuContent.length + 2,
      tags: true,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'magenta' },
        focus: { border: { fg: 'cyan' } },
        hover: { border: { fg: 'cyan' } }
      },
      content: menuContent.join('\n')
    });

    this.screen?.render();
  }

  private startGame(): void {
    this.gameData.state = 'playing';
    this.gameData.score = 0;
    this.gameData.lives = STARTING_LIVES;
    this.gameData.level = 1;

    if (this.menuBox) {
      this.menuBox.destroy();
      this.menuBox = null;
    }

    this.audio.stopMusic();
    this.audio.playMusic('qix');

    this.engine = new QixEngine(this.gameData, (content: string) => {
      if (this.gameArea) {
        this.gameArea.setContent(content);
      }
      if (this.hudBox) {
        this.hudBox.setContent(this.formatHUD());
      }
      this.screen?.render();
    });

    this.engine.initLevel(1);

    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }

    this.gameLoop = setInterval(() => {
      if (this.gameData.state === 'playing') {
        this.engine?.update();
      } else if (this.gameData.state === 'levelTransition') {
        this.gameData.transitionTimer--;
        if (this.gameData.transitionTimer <= 0) {
          this.engine?.advanceLevel();
        }
      }
    }, GAME_TICK_MS);
  }

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
        this.handleGameInput(inputKey);
        break;

      case 'paused':
        if (inputKey === 'p' || inputKey === 'escape') {
          this.gameData.state = 'playing';
          this.audio.toggleMusic();
          this.engine?.render();
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

  private handleGameInput(key: InputKey): void {
    switch (key) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.engine?.handleDirection(key as Direction);
        break;

      case 'z':
        this.audio.play('drawStart');
        this.engine?.handleSlowDraw();
        break;

      case 'x':
        this.audio.play('drawStart');
        this.engine?.handleFastDraw();
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

  private async showHighscores(): Promise<void> {
    this.gameData.state = 'highscores';

    try {
      const scores = await this.door.rpc<HighScore[]>('getHighscores');
      if (scores) {
        this.gameData.highscores = scores;
      }
    } catch {
      // Use cached
    }

    const content = [
      '{yellow-fg}HIGH SCORES{/}',
      '',
      '{white-fg}RANK  NAME   SCORE     LVL  MAX%{/}',
      '{gray-fg}----  ----  --------   ---  ----{/}'
    ];

    this.gameData.highscores.slice(0, 10).forEach((score, index) => {
      const rank = (index + 1).toString().padStart(2, ' ');
      const name = score.name.padEnd(4, ' ');
      const scoreStr = score.score.toString().padStart(8, ' ');
      const level = score.level.toString().padStart(2, ' ');
      const percent = (score.maxPercent || 75).toString().padStart(3, ' ');
      content.push(`{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}  {magenta-fg}${percent}%{/}`);
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
      width: 45,
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

  private showHelp(): void {
    const content = [
      '{yellow-fg}HOW TO PLAY{/}',
      '',
      '{cyan-fg}OBJECTIVE:{/}',
      'Claim 75%+ of the playfield by drawing',
      'lines that enclose areas without the Qix.',
      '',
      '{cyan-fg}ENEMIES:{/}',
      '{magenta-fg}*{/} Qix - Bounces in unclaimed area',
      '{red-fg}+{/} Sparx - Patrols the borders',
      '{yellow-fg}~{/} Fuse - Burns if you stop drawing',
      '',
      '{cyan-fg}POWER-UPS:{/}',
      'S=Speed, H=Shield, F=Freeze, W=Warp',
      'Letters spell word for auto-complete!',
      '',
      '{white-fg}CONTROLS:{/}',
      'Arrow Keys - Move marker',
      'Z          - Slow Draw (2x points)',
      'X          - Fast Draw',
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

  private showNameEntry(): void {
    const content = [
      '{yellow-fg}NEW HIGH SCORE!{/}',
      '',
      `{white-fg}Score: {yellow-fg}${this.gameData.score}{/}`,
      `{white-fg}Level: {cyan-fg}${this.gameData.level}{/}`,
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

  private async handleNameEntryInput(key: InputKey): Promise<void> {
    if (key === 'enter') {
      if (this.gameData.playerName.length > 0) {
        try {
          await this.door.rpc('saveHighscore', {
            name: this.gameData.playerName,
            score: this.gameData.score,
            level: this.gameData.level,
            maxPercent: Math.floor(this.gameData.claimedPercent)
          });
        } catch {
          // Continue
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
const client = new SuperQixClient();
client.init().catch(console.error);

export default client;
