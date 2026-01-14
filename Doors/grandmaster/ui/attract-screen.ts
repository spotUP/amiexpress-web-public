/**
 * Attract Mode Screen
 *
 * Cinematic presentation mode with boot sequence, demo AI gameplay,
 * leaderboard displays, and cycling announcements
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { createDockable } from './dockable';
import { GameEngine } from '../core/game';
import type { SoundEngine } from '../audio/sounds';
import type { AppState, PieceType } from '../core/types';
import { BotPlayer } from '../ai/bot-player';
import { GameScreen } from './game-screen';
import { PieceManager, ARS_COLORS, PIECE_COLORS } from '../core/pieces';
import { getGhostY } from '../core/board';
import { ScreenShaker } from '../effects/screen-shake';
import { ParticleSystem } from '../effects/particles';
import { TransitionManager } from '../effects/transitions';
import { AnimationManager, AnimationRenderer } from '../effects/animations';

type AttractState = 'boot' | 'demo' | 'leaderboard' | 'tips' | 'credits';

interface LeaderboardEntry {
  rank: number;
  name: string;
  grade: string;
  level: number;
  score: number;
  time: number | null;
}

/**
 * Attract Mode Screen
 *
 * Auto-plays demo gameplay, shows leaderboards, tips, and credits
 */
export class AttractScreen {
  private screen: Screen;
  private sounds: SoundEngine;
  private state: AppState;
  private botPlayer: BotPlayer;
  private pieceManager: PieceManager;

  // UI Elements
  private mainBox: any;
  private demoBox: any;
  private infoBox: any;
  private effectsBox: any;

  // State management
  private attractState: AttractState = 'boot';
  private stateTimer: number = 0;
  private running: boolean = false;
  private exitCallback: (() => void) | null = null;
  private exitHandler: (() => void) | null = null;
  private dataHandler: ((data: string) => void) | null = null;

  // Rainbow animation
  private rainbowTimer: number = 0;
  private readonly RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];

  // Demo game - now using GameScreen!
  private demoEngine: GameEngine | null = null;
  private gameScreen: GameScreen | null = null;
  private demoRunning: boolean = false;
  private lastRenderedAt: number = 0;
  private updateInterval: NodeJS.Timeout | null = null;

  // Visual effects systems (Parity with GameScreen)
  private shaker: ScreenShaker;
  private particles: ParticleSystem;
  private transitions: TransitionManager;
  private animations: AnimationManager;

  // Track previous state for detecting changes
  private lastGrade: string = '9';
  private lastLines: number = 0;
  private lastLevel: number = 0;
  private lastSection: number = 0;
  private lastPieceExists: boolean = false;
  private lastBoardHash: string = '';
  private lastHold: PieceType | null = null;
  private lastNext: PieceType[] = [];
  
  // Animation state
  private shineTimer: number = 0;
  private readonly SHINE_INTERVAL = 300;
  private shineCells: Map<string, number> = new Map();
  private hardDropTrails: Array<{
    x: number;
    y: number;
    color: string;
    strength: number;
    createdAt: number;
  }> = [];

  private gradeAnimProgress: number = 0;
  private gradeAnimDirection: number = 1;

  constructor(
    screen: Screen,
    sounds: SoundEngine,
    state: AppState
  ) {
    this.screen = screen;
    this.sounds = sounds;
    this.state = state;
    this.botPlayer = new BotPlayer(9); // Grandmaster difficulty for demo
    this.pieceManager = new PieceManager(state.settings.rotationSystem);

    // Initialize effect systems
    this.shaker = new ScreenShaker();
    this.particles = new ParticleSystem();
    this.transitions = new TransitionManager();
    this.animations = new AnimationManager();

    // Enable mouse tracking for attract mode
    this.screen.program.enableMouse();

    this.setupUI();
  }

  /**
   * Setup UI layout
   */
  private setupUI(): void {
    // Clear screen - both widgets AND buffer
    this.screen.children.forEach(child => child.destroy());

    // Clear the entire terminal with ANSI escape codes (more aggressive)
    this.screen.program.write('\x1b[2J');  // Clear entire screen
    this.screen.program.write('\x1b[H');   // Move cursor to home (0,0)

    // Clear blessed internal buffer to prevent ghosting from previous screens
    this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    this.screen.alloc();

    // Main container (for boot logo) - full screen black background
    this.mainBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      align: 'center',
      content: '',
      style: {
        bg: 'black',
        fg: 'white',
      },
    });

    // Demo gameplay area (left side) - hidden initially
    this.demoBox = createBox({
      parent: this.screen,
      top: 2,
      left: 2,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      fixed: true,
    });
    this.demoBox.hide();  // Hidden during boot

    // Info panel (right side) - hidden initially
    this.infoBox = createDockable({
      parent: this.screen,
      top: 2,
      left: 30,
      width: 50,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'yellow' } },
      align: 'center',
      content: '',
      persistenceKey: 'grandmaster.attract.info',
    });
    this.infoBox.hide();  // Hidden during boot

    // Effects overlay
    this.effectsBox = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      style: { fg: 'white', bg: 'transparent' },
    });
  }

  /**
   * Run attract mode
   */
  async run(onExit: () => void): Promise<void> {
    this.running = true;
    this.exitCallback = onExit;

    // Start audio engine (tries to resume context)
    void this.sounds.start();

    // Start with boot sequence
    await this.showBootSequence();

    if (!this.running) return; // Exit if interrupted during boot

    // Setup input to exit on any key DURING demo
    this.setupInput();

    // Main attract loop
    this.attractState = 'demo';
    this.startDemo();

    this.updateInterval = setInterval(() => {
      if (!this.running) {
        if (this.updateInterval) clearInterval(this.updateInterval);
        this.sounds.stopMusic();
        return;
      }

      this.update(16); // ~60 FPS logic
      
      const now = Date.now();
      if (now - this.lastRenderedAt >= 50) { // ~20 FPS render for BBS
        this.render();
        this.lastRenderedAt = now;
      }
    }, 16);
  }

  /**
   * Show boot sequence animation
   */
  private async showBootSequence(): Promise<void> {
    this.attractState = 'boot';

    const logo = [
      '   ██████  ██████   █████  ███    ██ ██████  ',
      '  ██       ██   ██ ██   ██ ████   ██ ██   ██ ',
      '  ██   ███ ██████  ███████ ██ ██  ██ ██   ██ ',
      '  ██    ██ ██   ██ ██   ██ ██  ██ ██ ██   ██ ',
      '   ██████  ██   ██ ██   ██ ██   ████ ██████  ',
      '',
      '  ███    ███  █████  ███████ ████████ ███████ ██████  ',
      '  ████  ████ ██   ██ ██         ██    ██      ██   ██ ',
      '  ██ ████ ██ ███████ ███████    ██    █████   ██████  ',
      '  ██  ██  ██ ██   ██      ██    ██    ██      ██   ██ ',
      '  ██      ██ ██   ██ ███████    ██    ███████ ██   ██ ',
    ];

    // Animate logo line by line
    for (let i = 0; i < logo.length; i++) {
      if (!this.running) return;
      let content = '{cyan-fg}{bold}\n\n\n\n';
      for (let j = 0; j <= i; j++) {
        content += logo[j] + '\n';
      }
      content += '{/bold}{/cyan-fg}';

      this.mainBox.setContent(content);
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.running) return;
    // Show version and press key message with rainbow animation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Play ready sound
    this.sounds.playSfx('ready');
    
    // Start opening music during rainbow animation
    this.sounds.playMusic('opening', true);

    // Animate rainbow colors and wait for keypress
    // We wait up to 10 seconds or until keypress
    const startTime = Date.now();
    const maxTitleWait = 10000; 
    
    // Internal input listener for the title screen specifically
    let titleKeyPressed = false;
    const titleHandler = () => { titleKeyPressed = true; };
    this.screen.once('keypress', titleHandler);
    this.screen.on('mouse', titleHandler);

    while (this.running && !titleKeyPressed && (Date.now() - startTime < maxTitleWait)) {
      this.rainbowTimer++;
      const colorIndex = Math.floor(this.rainbowTimer / 5) % this.RAINBOW_COLORS.length;

      // Create rainbow gradient by coloring each line differently
      let content = '\n\n\n\n{bold}';
      for (let i = 0; i < logo.length; i++) {
        const lineColorIndex = (colorIndex + i) % this.RAINBOW_COLORS.length;
        const color = this.RAINBOW_COLORS[lineColorIndex];
        content += `{${color}-fg}${logo[i]}{/${color}-fg}\n`;
      }
      content += '{/bold}\n{yellow-fg}v1.0.0{/yellow-fg}\n\n';
      content += '{white-fg}A Tetris: The Grand Master 3 Tribute{/white-fg}\n\n';
      content += '{yellow-fg}{blink}Press any key to start!{/blink}{/yellow-fg}';

      this.mainBox.setContent(content);
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Cleanup title listeners
    this.screen.removeListener('keypress', titleHandler);
    this.screen.removeListener('mouse', titleHandler);

    // If key was pressed, exit attract mode immediately to enter game
    if (titleKeyPressed) {
        // Add delay to trap input and prevent it from bleeding through to menu
        await new Promise(resolve => setTimeout(resolve, 100));
        this.exit();
    }
  }

  /**
   * Start demo gameplay
   */
  private async startDemo(): Promise<void> {
    if (!this.running) return;

    // Hide main box and show demo area
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.effectsBox?.show();

    // Create demo engine
    this.demoEngine = new GameEngine('master', this.state.settings, this.sounds);
    this.demoEngine.start();

    // Create GameScreen instance for playfield rendering (null input = AI-controlled)
    this.gameScreen = new GameScreen(
      this.screen,
      this.demoEngine,
      null,  // No input handler - bot controls it
      this.sounds,
      this.state
    );

    this.demoRunning = true;
    this.stateTimer = 0;

    // Start GameScreen's game loop (it handles all rendering & effects now!)
    // Note: We don't await this - it runs in background while we manage attract state
    this.gameScreen.run().catch(err => {
      console.error('[AttractScreen] GameScreen error:', err);
      this.demoRunning = false;
    });
  }

  /**
   * Update attract mode state
   */
  private async update(deltaTime: number): Promise<void> {
    if (!this.running) return;
    this.stateTimer += deltaTime;

    // GameScreen now handles all effect systems during demo!
    // Only update these for non-demo states
    if (this.attractState !== 'demo') {
      this.shaker.update(deltaTime);
      this.particles.update(deltaTime);
      this.transitions.update(deltaTime);
      this.animations.update(deltaTime);
      this.updateShineEffect();
    }
    this.updateGradeAnimation(deltaTime);

    switch (this.attractState) {
      case 'demo':
        if (this.demoEngine && this.demoRunning && this.gameScreen) {
          // GameScreen handles engine.update() and all rendering/effects!
          // We just control the bot AI
          this.botPlayer.update(deltaTime, this.demoEngine);

          // Check if demo ended
          const gameState = this.demoEngine.getState();
          if (gameState.status === 'gameover' || gameState.status === 'complete') {
            this.demoRunning = false;
            this.stateTimer = 0;
            this.attractState = 'leaderboard';
            // Cleanup GameScreen
            if (this.gameScreen) {
              this.demoBox.hide();
              this.gameScreen = null;
            }
          }

          // Auto-restart after 3 minutes
          if (this.stateTimer > 180000) {
            this.demoRunning = false;
            this.stateTimer = 0;
            this.attractState = 'leaderboard';
            // Cleanup GameScreen
            if (this.gameScreen) {
              this.demoBox.hide();
              this.gameScreen = null;
            }
          }
        }
        break;

      case 'leaderboard':
        // Show leaderboard for 10 seconds
        if (this.stateTimer > 10000) {
          this.stateTimer = 0;
          this.attractState = 'tips';
        }
        break;

      case 'tips':
        // Show tips for 8 seconds
        if (this.stateTimer > 8000) {
          this.stateTimer = 0;
          this.attractState = 'credits';
        }
        break;

      case 'credits':
        // Show credits for 8 seconds
        if (this.stateTimer > 8000) {
          this.stateTimer = 0;
          this.attractState = 'demo';
          await this.startDemo();
        }
        break;
    }
  }

  /**
   * DEPRECATED: GameScreen now handles all game events and effects!
   * This method is no longer used when GameScreen is active.
   */
  private checkDemoEvents_UNUSED(): void {
    if (!this.demoEngine) return;
    const gameState = this.demoEngine.getState();

    // Check for level change
    if (gameState.level > this.lastLevel) {
      const oldSection = Math.floor(this.lastLevel / 100);
      const newSection = Math.floor(gameState.level / 100);
      if (newSection > oldSection && gameState.level < 1000) {
        this.sounds.playSfx('section_up');
      }
      this.lastLevel = gameState.level;
    }

    // Check for grade change
    if (gameState.grade !== this.lastGrade) {
      this.animations.gradeUp(this.lastGrade, gameState.grade, 40, 5);
      this.particles.spawn('gradeUp', 40, 5);
      this.shaker.shake('lineClear');
      this.sounds.playSfx('grade_up');
      this.lastGrade = gameState.grade;
    }

    // Check for line clear
    if (gameState.lines > this.lastLines) {
      const linesCleared = gameState.lines - this.lastLines;
      if (gameState.lastTSpin === 'full') {
        this.particles.spawn('tetris', 12, 12);
        this.shaker.shake('tetris');
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');
      } else if (linesCleared === 4) {
        this.particles.spawn('tetris', 12, 12);
        this.shaker.shake('tetris');
        this.animations.lineClearFlash([], 4);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');
      } else if (linesCleared === 3) {
        this.particles.spawn('lineClear', 12, 12);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('triple');
      } else if (linesCleared === 2) {
        this.particles.spawn('lineClear', 12, 12);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('double');
      } else if (linesCleared >= 1) {
        this.particles.spawn('lineClear', 12, 12);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
      }
      this.lastLines = gameState.lines;
    }

    // Check for piece spawn
    if (gameState.currentPiece && !this.lastPieceExists) {
      this.sounds.playSfx(this.getSpawnSfx(gameState.currentPiece.type));
      
      // IRS visual/audio feedback
      if (gameState.currentPiece.rotation !== 0) {
        this.animations.tSpin(gameState.currentPiece.x + 1, gameState.currentPiece.y + 1);
        this.sounds.playSfx('pre_rotate');
      }
    }

    // IHS visual feedback
    if (!gameState.canHold && gameState.holdPiece && this.lastHold !== gameState.holdPiece && !this.lastPieceExists) {
        this.sounds.playSfx('pre_hold');
    }

    // Check for piece lock
    if (!gameState.currentPiece && this.lastPieceExists) {
      this.triggerLockFlash();
    }

    this.lastPieceExists = gameState.currentPiece !== null;
    this.lastHold = gameState.holdPiece;
  }

  private getSpawnSfx(type: PieceType): any {
    const map: Record<PieceType, string> = {
      I: 'spawn_i', J: 'spawn_j', L: 'spawn_l', O: 'spawn_o',
      S: 'spawn_s', T: 'spawn_t', Z: 'spawn_z'
    };
    return map[type] || 'move';
  }

  private triggerLockFlash(): void {
    if (!this.demoEngine) return;
    const gameState = this.demoEngine.getState();
    const lockTime = Date.now();
    const cells: Array<{ x: number; y: number }> = [];

    for (let y = 0; y < gameState.board.height; y++) {
      for (let x = 0; x < gameState.board.width; x++) {
        const cell = gameState.board.grid[y][x];
        if (cell.lockTime && (lockTime - cell.lockTime) < 50) {
          cells.push({ x, y });
        }
      }
    }

    const color = cells.length > 0
      ? gameState.board.grid[cells[0].y][cells[0].x].color || 'white'
      : 'white';

    this.animations.lockGlow(cells, color);
    this.sounds.playSfx('lock');
  }

  private updateShineEffect(): void {
    this.shineTimer++;
    if (this.shineTimer >= this.SHINE_INTERVAL) {
      this.shineTimer = 0;
      if (this.demoEngine) {
        const gameState = this.demoEngine.getState();
        let delay = 0;
        for (let y = 4; y < 24; y++) {
          for (let x = 0; x < gameState.board.width; x++) {
            const cell = gameState.board.grid[y][x];
            if (cell.filled && cell.locked) {
              const key = `${x},${y}`;
              this.shineCells.set(key, delay + 5);
              delay += 1;
            }
          }
        }
      }
    }
    for (const [key, frames] of this.shineCells.entries()) {
      if (frames <= 0) this.shineCells.delete(key);
      else this.shineCells.set(key, frames - 1);
    }
  }

  private hasShineEffect(x: number, y: number): boolean {
    const key = `${x},${y}`;
    const frames = this.shineCells.get(key);
    return frames !== undefined && frames > 0 && frames < 5;
  }

  private getAnimatedGradeColor(grade: string): string {
    if (grade === 'GMM' || grade === 'GM') {
      const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
      const index = Math.floor(this.gradeAnimProgress * colors.length) % colors.length;
      return colors[index];
    }
    if (grade.startsWith('M')) return 'red';
    if (grade.startsWith('m')) return 'magenta';
    if (grade.startsWith('S')) return 'cyan';
    return 'white';
  }

  private getAnimatedGradeSize(grade: string): { prefix: string; suffix: string } {
    const pulse = Math.sin(this.gradeAnimProgress * Math.PI * 2) * 0.5 + 0.5;
    return pulse > 0.7 ? { prefix: '{bold}', suffix: '{/bold}' } : { prefix: '', suffix: '' };
  }

  private updateGradeAnimation(deltaTime: number): void {
    const PULSE_SPEED = 0.001;
    this.gradeAnimProgress += PULSE_SPEED * deltaTime * this.gradeAnimDirection;
    if (this.gradeAnimProgress >= 1) {
      this.gradeAnimProgress = 1;
      this.gradeAnimDirection = -1;
    } else if (this.gradeAnimProgress <= 0) {
      this.gradeAnimProgress = 0;
      this.gradeAnimDirection = 1;
    }
  }

  /**
   * Render attract mode
   */
  private render(): void {
    if (!this.running) return;

    let needsRender = false;

    // GameScreen handles ALL rendering during demo state!
    // We only render the info panels for non-demo states
    if (this.attractState !== 'demo') {
        switch (this.attractState) {
            case 'leaderboard':
                this.renderLeaderboard();
                break;
            case 'tips':
                this.renderTips();
                break;
            case 'credits':
                this.renderCredits();
                break;
        }
        needsRender = true;
    }

    if (needsRender) {
        this.screen.render();
    }
  }

  /**
   * DEPRECATED: GameScreen now handles all effects rendering!
   */
  private renderEffects_UNUSED(): void {
    let effectsContent = '';
    const screenWidth = this.screen.width;
    const screenHeight = this.screen.height;

    // Render particles
    const particles = this.particles.getRenderableParticles();
    for (const particle of particles) {
      const x = Math.floor(particle.x);
      const y = Math.floor(particle.y);
      if (x >= 0 && x < screenWidth && y >= 0 && y < screenHeight) {
        if (particle.alpha > 0.7) {
          effectsContent += `\x1b[${y};${x}H{${particle.color}-fg}${particle.char}{/}`;
        } else if (particle.alpha > 0.3) {
          effectsContent += `\x1b[${y};${x}H{gray-fg}${particle.char}{/}`;
        }
      }
    }

    // Render active animations
    const animations = this.animations.getAnimations();
    for (const anim of animations) {
      if (anim.type === 'gradeUp') {
        const rendered = AnimationRenderer.renderGradeUp(anim);
        effectsContent += `\x1b[${5};${40}H${rendered}`;
      } else if (anim.type === 'cool' || anim.type === 'regret') {
        const rendered = AnimationRenderer.renderSectionResult(anim);
        effectsContent += `\x1b[${3};${30}H${rendered}`;
      } else if (anim.type === 'lockGlow') {
        const intensity = AnimationRenderer.getLockGlowIntensity(anim);
        if (intensity > 0.3) {
          const data = anim.data as any;
          for (const cell of data.cells) {
            if (cell.y < 4) continue;
            const x = 4 + cell.x * 2;
            const y = cell.y + 1;
            if (intensity > 0.7) {
              effectsContent += `\x1b[${y};${x}H{white-fg}{bold}██{/bold}{/}`;
            } else {
              effectsContent += `\x1b[${y};${x}H{white-fg}░░{/}`;
            }
          }
        }
      }
    }

    if (this.effectsBox) {
      this.effectsBox.setContent(effectsContent);
    }
  }

  private getBoardHash(state: any): string {
    const piece = state.currentPiece ? `${state.currentPiece.x},${state.currentPiece.y},${state.currentPiece.rotation}` : 'null';
    return `${piece}-${state.lines}-${this.shineTimer}`;
  }

  private getPieceGlowColor(type: PieceType, rotationSystem: string): string {
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    return (colors as any)[type];
  }

  private getHardDropTrailChar(color: string, strength: number): string {
    if (strength > 0.66) {
      const bright = this.getBrightColor(color);
      return `{${bright}-bg}  {/${bright}-bg}`;
    }
    if (strength > 0.33) {
      return `{${color}-bg}  {/${color}-bg}`;
    }
    return `{${color}-fg}░░{/${color}-fg}`;
  }

  private getBrightColor(color: string): string {
    const map: Record<string, string> = {
      red: 'lightred', green: 'lightgreen', yellow: 'lightyellow', blue: 'lightblue',
      magenta: 'lightmagenta', cyan: 'lightcyan', white: 'lightwhite', orange: 'yellow'
    };
    return map[color] || color;
  }

  /**
   * DEPRECATED: GameScreen now renders the demo playfield!
   * This method is no longer used.
   */
  private renderDemo_UNUSED(): void {
    if (!this.demoEngine) return;

    // Clear main box (remove boot logo)
    this.mainBox.setContent('');
    this.mainBox.hide();

    // Show demo boxes
    this.demoBox.show();
    this.infoBox.show();

    const gameState = this.demoEngine.getState();
    const board = gameState.board;
    const currentPiece = gameState.currentPiece;
    const rotationSystem = this.state.settings.rotationSystem;
    const isMasterRoll = gameState.creditRollActive;
    const creditRoll = (this.demoEngine as any).creditRollManager;

    let boardContent = '';
    const now = Date.now();

    let pieceShape: number[][] | null = null;
    let ghostY: number | null = null;

    if (currentPiece) {
      const pieceManager = (this.demoEngine as any).pieceManager;
      const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
      if (shape) {
        pieceShape = shape;
        if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
          ghostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
        }
      }
    }

    this.hardDropTrails = this.hardDropTrails.filter(trail => now - trail.createdAt < 160);

    for (let y = 4; y < 24; y++) {
      if (y > 4) boardContent += '\n';
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        let char = '  ';

        if (currentPiece && pieceShape) {
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;
          if (py >= 0 && py < pieceShape.length && px >= 0 && px < pieceShape[py].length && pieceShape[py][px]) {
            if (currentPiece.invisible) {
              char = '{black-fg}░░{/black-fg}';
            } else {
              char = this.getBlockChar(currentPiece.type, rotationSystem);
            }
          }
        }

        if (ghostY !== null && currentPiece && pieceShape && char === '  ' && !isMasterRoll) {
          const px = x - currentPiece.x;
          const py = y - ghostY;
          if (py >= 0 && py < pieceShape.length && px >= 0 && px < pieceShape[py].length && pieceShape[py][px]) {
            char = '{gray-fg}░░{/gray-fg}';
          }
        }

        if (char === '  ' && !cell.filled && !isMasterRoll) {
          const trail = this.hardDropTrails.find(t => t.x === x && t.y === y);
          if (trail) {
            const age = now - trail.createdAt;
            const fade = Math.max(0, 1 - (age / 160));
            const strength = trail.strength * fade;
            char = this.getHardDropTrailChar(trail.color, strength);
          }
        }

        if (char === '  ' && cell.filled) {
          if (this.hasShineEffect(x, y) && !isMasterRoll) {
            char = '{white-bg}{white-fg}██{/white-fg}{/white-bg}';
          } else if (isMasterRoll && cell.lockTime) {
            const fadeStage = creditRoll.getFadeStage(cell.lockTime);
            if (fadeStage === 'full') {
              char = this.getBlockChar(cell.color as PieceType, rotationSystem);
            } else if (fadeStage === 'bright') {
              char = this.getFadedBlockChar(cell.color as PieceType, 'medium', rotationSystem);
            } else if (fadeStage === 'medium' || fadeStage === 'faint') {
              char = this.getFadedBlockChar(cell.color as PieceType, 'faint', rotationSystem);
            } else {
              char = '  ';
            }
          } else if (!isMasterRoll) {
            char = this.getBlockChar(cell.color as PieceType, rotationSystem);
          }
        }
        boardContent += char;
      }
    }

    this.demoBox.setContent(boardContent);

    // Render info panel
    const gradeColor = this.getAnimatedGradeColor(gameState.grade);
    const gradeSize = this.getAnimatedGradeSize(gameState.grade);

    let infoContent = '{cyan-fg}{bold}DEMONSTRATION{/bold}{/cyan-fg}\n\n';
    infoContent += `{white-fg}Grade:{/white-fg} {${gradeColor}-fg}${gradeSize.prefix}${gameState.grade}${gradeSize.suffix}{/${gradeColor}-fg}\n`;
    infoContent += `{white-fg}Level:{/white-fg} {cyan-fg}${gameState.level}{/cyan-fg}\n`;
    infoContent += `{white-fg}Score:{/white-fg} {yellow-fg}${gameState.score.toLocaleString()}{/yellow-fg}\n`;
    infoContent += `{white-fg}Lines:{/white-fg} {green-fg}${gameState.lines}{/green-fg}\n\n`;

    if (gameState.combo > 0) {
      infoContent += `{magenta-fg}{bold}COMBO ${gameState.combo}x{/bold}{/magenta-fg}\n`;
    }

    if (gameState.backToBack) {
      infoContent += `{yellow-fg}{bold}BACK-TO-BACK{/bold}{/yellow-fg}\n`;
    }

    infoContent += '\n\n{gray-fg}CPU Difficulty: Grandmaster (9){/gray-fg}\n\n';
    infoContent += '{yellow-fg}Press any key to start{/yellow-fg}';

    this.infoBox.setContent(infoContent);
  }

  private getBlockChar(type: PieceType | null, rotationSystem: string): string {
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    if (type === null) return '{gray-fg}██{/gray-fg}';
    const color = colors[type] || 'white';
    if (this.demoEngine?.getState().mode === 'death' && (this.demoEngine?.getState().level || 0) >= 1000) {
      return `{white-fg}[ ]{/white-fg}`;
    }
    return `{${color}-fg}██{/${color}-fg}`;
  }

  private getFadedBlockChar(type: PieceType, intensity: 'medium' | 'faint', rotationSystem: string): string {
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    const color = colors[type] || 'white';
    return intensity === 'medium' ? `{${color}-fg}▒▒{/}` : `{${color}-fg}░░{/}`;
  }

  private getPieceColor(type: string): string {
    const colors: Record<string, string> = {
      I: 'cyan', O: 'yellow', T: 'magenta', S: 'green', Z: 'red', J: 'blue', L: 'white',
    };
    return colors[type] || 'white';
  }

  private addHardDropTrail(): void {
    if (!this.demoEngine) return;
    const state = this.demoEngine.getState();
    const { board, currentPiece } = state;
    if (!currentPiece) return;

    const pieceManager = (this.demoEngine as any).pieceManager;
    const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
    if (!shape) return;

    const ghostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
    const dropDistance = ghostY - currentPiece.y;
    if (dropDistance <= 0) return;

    const color = this.getPieceGlowColor(currentPiece.type, this.state.settings.rotationSystem);
    const now = Date.now();
    const maxSteps = Math.max(1, dropDistance);

    for (let py = 0; py < shape.length; py++) {
      for (let px = 0; px < shape[py].length; px++) {
        if (!shape[py][px]) continue;
        const startX = currentPiece.x + px;
        for (let step = 0; step < dropDistance; step++) {
          const y = currentPiece.y + step + py;
          if (y < 4 || y >= 24) continue;
          const strength = (step + 1) / maxSteps;
          this.hardDropTrails.push({
            x: startX, y, color, strength, createdAt: now,
          });
        }
      }
    }
  }

  /**
   * Render leaderboard
   */
  private renderLeaderboard(): void {
    // Clear main box and manage visibility
    this.mainBox.setContent('');
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.demoBox.setFront();
    this.infoBox.setFront();

    this.demoBox.setContent('{gray-fg}[DEMO PAUSED]{/gray-fg}');

    // Mock leaderboard data
    const leaderboard: LeaderboardEntry[] = [
      { rank: 1, name: 'ZEN', grade: 'GM', level: 999, score: 999999, time: 529000 },
      { rank: 2, name: 'ACE', grade: 'GM', level: 999, score: 975000, time: 547000 },
      { rank: 3, name: 'KAN', grade: 'MO', level: 999, score: 890000, time: 612000 },
      { rank: 4, name: 'TAK', grade: 'MV', level: 999, score: 845000, time: 658000 },
      { rank: 5, name: 'SRS', grade: 'M', level: 999, score: 789000, time: 701000 },
      { rank: 6, name: 'TGM', grade: 'm9', level: 999, score: 723000, time: 745000 },
      { rank: 7, name: 'ARS', grade: 'm5', level: 850, score: 654000, time: null },
      { rank: 8, name: 'SYS', grade: 'S13', level: 700, score: 587000, time: null },
    ];

    let content = '{yellow-fg}{bold}═══ LEADERBOARD ═══{/bold}{/yellow-fg}\n\n';
    content += '{white-fg} # NAME  GRADE  LEVEL    SCORE      TIME{/white-fg}\n';
    content += '{gray-fg}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{/gray-fg}\n';

    for (const entry of leaderboard) {
      const rankColor = entry.rank <= 3 ? 'yellow' : 'white';
      const gradeColor = entry.grade.startsWith('GM') ? 'magenta' :
                         entry.grade.startsWith('M') ? 'red' :
                         entry.grade.startsWith('m') ? 'cyan' : 'white';

      const timeStr = entry.time
        ? this.formatTime(entry.time)
        : '--:--:--';

      content += `{${rankColor}-fg}${entry.rank.toString().padStart(2)}{/${rankColor}-fg} `;
      content += `{cyan-fg}${entry.name.padEnd(5)}{/cyan-fg} `;
      content += `{${gradeColor}-fg}{bold}${entry.grade.padEnd(3)}{/bold}{/${gradeColor}-fg}   `;
      content += `{white-fg}${entry.level.toString().padStart(3)}{/white-fg}  `;
      content += `{yellow-fg}${entry.score.toLocaleString().padStart(7)}{/yellow-fg}  `;
      content += `{gray-fg}${timeStr}{/gray-fg}\n`;
    }

    content += '\n           {gray-fg}Press any key to continue{/gray-fg}';

    this.infoBox.setContent(content);
  }

  /**
   * Render tips screen
   */
  private renderTips(): void {
    // Clear main box and manage visibility
    this.mainBox.setContent('');
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.demoBox.setFront();
    this.infoBox.setFront();

    this.demoBox.setContent('{gray-fg}[DEMO PAUSED]{/gray-fg}');

    let content = '{cyan-fg}{bold}═══ TIPS & TRICKS ═══{/bold}{/cyan-fg}\n\n';

    const tips = [
      '{yellow-fg}Finesse:{/yellow-fg} Use optimal movement\n  patterns to reduce key presses',
      '{yellow-fg}IRS/IHS:{/yellow-fg} Rotate or hold during\n  the ARE delay for faster play',
      '{yellow-fg}T-Spins:{/yellow-fg} Rotate T-pieces into\n  tight spaces for bonus points',
      '{yellow-fg}Back-to-Back:{/yellow-fg} Chain Tetrises\n  and T-Spins for 50% bonus',
      '{yellow-fg}20G:{/yellow-fg} At level 500+, pieces\n  drop instantly - stay calm!',
      '{yellow-fg}Credit Roll:{/yellow-fg} Reach M grade to\n  unlock invisible challenge',
    ];

    for (const tip of tips) {
      content += `{white-fg}•{/white-fg} ${tip}\n\n`;
    }

    content += '\n           {gray-fg}Press any key to continue{/gray-fg}';

    this.infoBox.setContent(content);
  }

  /**
   * Render credits screen
   */
  private renderCredits(): void {
    // Clear main box and manage visibility
    this.mainBox.setContent('');
    this.mainBox.hide();
    this.demoBox.show();
    this.infoBox.show();
    this.demoBox.setFront();
    this.infoBox.setFront();

    this.demoBox.setContent('{gray-fg}[DEMO PAUSED]{/gray-fg}');

    let content = '{magenta-fg}{bold}═══ CREDITS ═══{/bold}{/magenta-fg}\n\n';

    content += '{yellow-fg}Original Game:{/yellow-fg}\n';
    content += '{cyan-fg}Tetris: The Grand Master 3{/cyan-fg}\n';
    content += '{gray-fg}© Arika Co., Ltd.{/gray-fg}\n\n';

    content += '{yellow-fg}This Implementation:{/yellow-fg}\n';
    content += '{cyan-fg}GRANDMASTER for AmiExpress BBS{/cyan-fg}\n';
    content += '{gray-fg}2024{/gray-fg}\n\n';

    content += '{yellow-fg}Built With:{/yellow-fg}\n';
    content += '{white-fg}AmiExpress BBS Door SDK v2.0{/white-fg}\n';
    content += '{white-fg}Neo-Blessed UI Engine{/white-fg}\n';
    content += '{white-fg}TypeScript{/white-fg}\n\n';

    content += '{yellow-fg}Special Thanks:{/yellow-fg}\n';
    content += '{gray-fg}TGM Community{/gray-fg}\n';
    content += '{gray-fg}Hard Drop Wiki{/gray-fg}\n';
    content += '{gray-fg}Retro BBS Enthusiasts{/gray-fg}\n\n';

    content += '\n           {gray-fg}Press any key to continue{/gray-fg}';

    this.infoBox.setContent(content);
  }

  /**
   * Get piece shape
   */
  private getPieceShape(type: string, rotation: number): number[][] {
    return this.pieceManager.getShape(type as any, rotation as any);
  }

  /**
   * Format time in MM:SS:MS format
   */
  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
  }

  /**
   * Setup input handlers
   */
  private setupInput(): void {
    // Consume-once exit pattern
    let exited = false;
    const startTime = Date.now();
    const inputGuardMs = 500; // Ignore input for first 500ms to avoid handshake garbage

    const handleExit = () => {
      if (exited) return;
      if (Date.now() - startTime < inputGuardMs) return;
      
      exited = true;
      this.exit();
    };

    this.exitHandler = handleExit;

    // Any key exits attract mode
    this.screen.on('keypress', this.exitHandler);
    
    // Mouse clicks also exit attract mode
    this.screen.on('mouse', this.exitHandler);
    
    // Remove the raw data listener as it's too sensitive to handshake garbage
  }

  /**
   * Exit attract mode
   */
  private exit(): void {
    if (!this.running) return;
    this.running = false;
    this.demoRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Stop music
    this.sounds.stopMusic();

    // Remove listeners
    if (this.exitHandler) {
        this.screen.removeListener('keypress', this.exitHandler);
        this.screen.removeListener('mouse', this.exitHandler);
        this.exitHandler = null;
    }
    if (this.dataHandler) {
        this.screen.program.removeListener('data', this.dataHandler);
        this.dataHandler = null;
    }

    if (this.exitCallback) {
      const cb = this.exitCallback;
      this.exitCallback = null;
      cb();
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.running = false;
    this.demoRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.sounds.stopMusic();

    // Disable mouse tracking
    this.screen.program.disableMouse();
    
    // Destroy UI elements
    this.mainBox?.destroy();
    this.demoBox?.destroy();
    this.infoBox?.destroy();
    this.effectsBox?.destroy();

    // Only remove our specific handler, not all keypress listeners
    if (this.exitHandler) {
      this.screen.removeListener('keypress', this.exitHandler);
      this.screen.removeListener('mouse', this.exitHandler);
      this.exitHandler = null;
    }
    if (this.dataHandler) {
        this.screen.program.removeListener('data', this.dataHandler);
        this.dataHandler = null;
    }
  }
}
