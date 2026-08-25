import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GamepadActionMapper } from '@amiexpress/bbs-door-sdk';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState, GameAction, Piece, PieceType } from '../core/types';
import { PIECE_COLORS, ARS_COLORS } from '../core/pieces';
import { getGhostY } from '../core/board';
import { ScreenShaker } from '../effects/screen-shake';
import { ParticleSystem } from '../effects/particles';
import { TransitionManager } from '../effects/transitions';
import { AnimationManager, AnimationRenderer } from '../effects/animations';
import { BlockGlowManager } from '../effects/block-glow';
import { LineClearAnimationManager } from '../effects/line-clear-animation';
import { ConnectedBlockRenderer } from '../effects/connected-blocks';

/**
 * Main game screen
 */
export class GameScreen {
  private running: boolean = false;
  private stoppedEarly: boolean = false;  // True if stopped externally (not gameover)
  private cleanedUp: boolean = false;  // Prevent double cleanup
  private outerFrame: any;
  private escHandler: ((ch: string | undefined, key: any) => void) | null = null;
  private boardBox: any;
  private nextBox: any;
  private holdBox: any;
  private statsBox: any;
  private gradeBox: any;
  private sectionBox: any;
  private footerBox: any;
  // Board overlay compositor: effects rendered inline in board content
  // Each cell is a blessed-tagged 2-char string or null (no overlay)
  private boardOverlay: (string | null)[][] = [];
  private lastRender: number = 0;
  private readonly RENDER_FPS = 20; // Reduced for BBS efficiency
  private readonly RENDER_INTERVAL = 1000 / this.RENDER_FPS;

  // Visual effects systems
  private shaker: ScreenShaker;
  private particles: ParticleSystem;
  private transitions: TransitionManager;
  private animations: AnimationManager;
  private glowManager: BlockGlowManager;
  private clearAnimation: LineClearAnimationManager;
  private connectedBlocks: ConnectedBlockRenderer;

  // Track previous state for detecting changes
  private lastGrade: string = '9';
  private lastLines: number = 0;
  private lastLevel: number = 0;
  private lastSectionInfoRender: number = 0;
  private lastSection: number = 0;
  private lastPieceExists: boolean = false;
  private lastScore: number = -1;
  private lastCombo: number = -1;
  private lastNext: PieceType[] = [];
  private lastHold: PieceType | null = null;
  private lastBoardHash: string = '';

  // Animation state
  private gradeAnimProgress: number = 0;
  private gradeAnimDirection: number = 1;
  private lastComboMilestone: number = 0;
  private twentyGFlashTimer: number = 0;

  // Rainbow border animation
  private rainbowTimer: number = 0;
  private lastRainbowUpdate: number = 0;
  private readonly RAINBOW_INTERVAL = 100; // Much slower update
  private readonly RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];

  // Block shine effect (sweep animation like arkanoid2)
  private shineTimer: number = 0;
  private readonly SHINE_INTERVAL = 300;  // Frames between shine sweeps
  private shineCells: Map<string, number> = new Map();  // "x,y" -> frames remaining
  private hardDropTrails: Array<{
    x: number;
    y: number;
    color: string;
    strength: number;
    createdAt: number;
  }> = [];

  constructor(
    private screen: Screen,
    private engine: GameEngine,
    private input: InputHandler | null,  // Null for attract mode (AI-controlled)
    private sounds: SoundEngine,
    private state: AppState,
    private gamepadMapper: GamepadActionMapper<GameAction> | null = null
  ) {
    // Initialize effect systems
    this.shaker = new ScreenShaker();
    this.particles = new ParticleSystem();
    this.transitions = new TransitionManager();
    this.animations = new AnimationManager();
    this.glowManager = new BlockGlowManager();
    this.clearAnimation = new LineClearAnimationManager();
    this.connectedBlocks = new ConnectedBlockRenderer();

    // Share managers with game engine for trigger integration
    this.engine.setAnimationManager(this.animations);
    this.engine.setGlowManager(this.glowManager);

    // Configure managers from settings
    this.glowManager.setEnabled(state.settings.blockGlow);
    this.glowManager.setIntensityMultiplier(state.settings.glowIntensity);
    this.clearAnimation.setEnabled(state.settings.clearStyle !== 'instant');
    this.connectedBlocks.setEnabled(state.settings.connectedBlocks);
  }

  /**
   * Show READY -> GO countdown before game starts.
   * Renders the next queue so the player can plan ahead.
   */
  private async showReadyGo(): Promise<void> {
    const state = this.engine.getState();

    // Show next queue preview during countdown
    this.renderNext(state.nextQueue);

    const readyBox = createBox({
      parent: this.screen,
      top: 10,
      left: 2,
      width: 22,
      height: 3,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'yellow' } },
      align: 'center',
      content: '{bold}{yellow-fg}READY{/yellow-fg}{/bold}',
      fixed: true,
      tags: true,
    });

    try {
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 900));

      readyBox.setContent('{bold}{green-fg}  GO !{/green-fg}{/bold}');
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      readyBox.destroy();
      this.screen.render();
    }
  }

  /**
   * Run the game loop
   */
  async run(): Promise<void> {
    // Setup UI and input
    this.setupUI();
    this.setupInput();

    // Ready-Go sequence shows next queue before pieces start falling
    await this.showReadyGo();

    return new Promise<void>((resolve) => {
      // Start game
      this.engine.start();
      this.running = true;
      this.sounds.playMusic('master_1', true);

      // Game loop using setInterval
      let lastUpdate = Date.now();
      const gameLoop = setInterval(() => {
        if (!this.running) {
          clearInterval(gameLoop);
          // Only show game over if not stopped early (e.g., attract mode exit)
          if (this.stoppedEarly) {
            this.cleanup();
            resolve();
          } else {
            this.showGameOver().then(() => {
              this.cleanup();
              resolve();
            });
          }
          return;
        }

        const now = Date.now();
        const deltaTime = now - lastUpdate;
        lastUpdate = now;

        // Update game (always at 60Hz logic)
        this.engine.update(deltaTime);
        if (this.input) {
          this.input.update(deltaTime);
        }

        // Get current state once for all checks
        const gameState = this.engine.getState();

        // Update effects
        this.shaker.update(deltaTime);
        this.particles.update(deltaTime);
        this.transitions.update(deltaTime);
        this.animations.update(deltaTime);
        this.glowManager.update(deltaTime);
        this.clearAnimation.update(deltaTime);
        this.updateGradeAnimation(deltaTime);

        // Update rainbow border animation
        if (now - this.lastRainbowUpdate >= this.RAINBOW_INTERVAL) {
          this.rainbowTimer++;
          this.updateRainbowBorders();
          this.lastRainbowUpdate = now;
        }

        // Update block shine effect
        this.updateShineEffect();

        // Update 20G flash timer
        if (gameState.gravity >= 20) {
          this.twentyGFlashTimer += deltaTime;
        } else {
          this.twentyGFlashTimer = 0;
        }

        // Check for game events and trigger effects
        this.checkGameEvents();

        // Render at target FPS
        if (now - this.lastRender >= this.RENDER_INTERVAL) {
          this.render();
          this.lastRender = now;
        }

        // Check for game over or ultra completion
        if (gameState.status === 'gameover' || gameState.status === 'complete') {
          this.running = false;
        }
      }, 16); // Logic at ~60 FPS
    });
  }

  /**
   * Check for game events and trigger visual effects
   */
  private checkGameEvents(): void {
    const gameState = this.engine.getState();

    // Check for level change
    if (gameState.level > this.lastLevel) {
      // TGM3 plays level change (section up) every 100 levels
      const oldSection = Math.floor(this.lastLevel / 100);
      const newSection = Math.floor(gameState.level / 100);
      
      if (newSection > oldSection && gameState.level < 1000) {
        this.sounds.playSfx('section_up');
      } else {
        this.sounds.playSfx('level_up');
      }
      this.lastLevel = gameState.level;
    }

    // Check for grade change
    if (gameState.grade !== this.lastGrade) {
      this.animations.gradeUp(this.lastGrade, gameState.grade, 40, 5);
      this.particles.spawn('gradeUp', 5, 7);  // Board center, upper area
      this.shaker.shake('lineClear');
      this.sounds.playSfx('grade_up');
      this.lastGrade = gameState.grade;
    }

    // Check for line clear
    if (gameState.lines > this.lastLines) {
      const linesCleared = gameState.lines - this.lastLines;

      // Check for T-Spin
      if (gameState.lastTSpin === 'full') {
        // T-Spin!
        this.particles.spawn('tetris', 5, 14);
        this.shaker.shake('tetris');
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');  // Voice callout
      } else if (gameState.lastTSpin === 'mini') {
        // T-Spin Mini
        this.particles.spawn('lineClear', 5, 14);
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('rotate');
      } else if (linesCleared === 4) {
        // Tetris!
        this.particles.spawn('tetris', 5, 14);
        this.shaker.shake('tetris');
        this.animations.lineClearFlash([], 4);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');  // Voice callout
      } else if (linesCleared === 3) {
        // Triple
        this.particles.spawn('lineClear', 5, 14);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('triple');  // Voice callout
      } else if (linesCleared === 2) {
        // Double
        this.particles.spawn('lineClear', 5, 14);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('double');  // Voice callout
      } else if (linesCleared >= 1) {
        // Single line clear (no voice)
        this.particles.spawn('lineClear', 5, 14);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
      }

      this.lastLines = gameState.lines;
    }

    // Check for combo milestones
    const combo = gameState.combo;
    const milestone = Math.floor(combo / 5) * 5;
    if (combo > 0 && milestone > this.lastComboMilestone && milestone >= 5) {
      this.triggerComboAnimation(combo, milestone);
      this.lastComboMilestone = milestone;
    }
    if (combo === 0) this.lastComboMilestone = 0;

    // Check for recently awarded medals
    const recentMedals = this.engine.getRecentMedals();
    if (recentMedals.length > 0) {
      for (const medal of recentMedals) {
        this.triggerMedalAnimation(medal);
      }
      this.engine.clearRecentMedals();
    }

    // Check for section completion
    if (gameState.section > this.lastSection) {
      const result = gameState.lastSectionResult;
      if (result) {
        this.handleSectionComplete(this.lastSection, result);
      }
      this.lastSection = gameState.section;
    }

    // Check for piece spawn (null -> non-null)
    if (gameState.currentPiece && !this.lastPieceExists) {
      this.sounds.playSfx(this.getSpawnSfx(gameState.currentPiece.type));
      
      // IRS visual/audio feedback
      if (gameState.currentPiece.rotation !== 0) {
        this.animations.tSpin(gameState.currentPiece.x + 1, gameState.currentPiece.y + 1); // Use tspin flash for IRS
        this.sounds.playSfx('pre_rotate');
      }
    }

    // IHS visual feedback
    if (!gameState.canHold && gameState.holdPiece && this.lastHold !== gameState.holdPiece && !this.lastPieceExists) {
        this.sounds.playSfx('pre_hold');
    }

    // Check for piece lock (detect when currentPiece becomes null after being non-null)
    if (!gameState.currentPiece && this.lastPieceExists) {
      // Piece just locked - trigger lock flash
      this.triggerLockFlash();
    }
    this.lastPieceExists = gameState.currentPiece !== null;
  }

  /**
   * Trigger medal award animation
   */
  private triggerMedalAnimation(medal: any): void {
    const color = (medal.tier === 3) ? 'cyan' : (medal.tier === 2) ? 'yellow' : (medal.tier === 1) ? 'white' : 'yellow';
    const tierName = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'][medal.tier];
    
    this.animations.gradeUp('', `${tierName} ${medal.type}`, 40, 10);
    this.sounds.playSfx('grade_up');
  }

  /**
   * Get spawn sound for piece type
   */
  private getSpawnSfx(type: PieceType): any {
    const map: Record<PieceType, string> = {
      I: 'spawn_i', J: 'spawn_j', L: 'spawn_l', O: 'spawn_o',
      S: 'spawn_s', T: 'spawn_t', Z: 'spawn_z'
    };
    return map[type] || 'move';
  }

  /**
   * Trigger lock flash effect
   */
  private triggerLockFlash(): void {
    const gameState = this.engine.getState();
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

  /**
   * Trigger combo animation for milestone achievements
   */
  private triggerComboAnimation(combo: number, milestone: number): void {
    if (milestone >= 10) this.particles.spawn('combo', 5, 14);  // Board center
    this.animations.comboCounter(combo, milestone);

    // Voice callouts for combo milestones
    if (milestone >= 15) {
      this.sounds.playSfx('tetris');
      this.sounds.playVoice('excellent');  // High combo voice
    } else if (milestone >= 10) {
      this.sounds.playSfx('grade_up');
      this.sounds.playVoice('combo');  // Combo voice
    } else if (milestone >= 5) {
      this.sounds.playVoice('combo');  // Combo voice
    }
  }

  /**
   * Handle section completion
   */
  private handleSectionComplete(section: number, result: 'COOL' | 'REGRET' | 'NORMAL'): void {
    // Trigger animation
    if (result === 'COOL') {
      this.animations.cool(section);
      this.sounds.playSfx('section_cool');
      this.sounds.playVoice('cool');  // Voice callout
      // Optional: spawn particles for COOL achievement
      this.particles.spawn('cool', 5, 14);  // Board center
    } else if (result === 'REGRET') {
      this.animations.regret(section);
      this.sounds.playSfx('section_regret');
      this.sounds.playVoice('regret');  // Voice callout
    }
  }

  /**
   * Setup UI elements
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Outer frame wrapping the entire game area (consistency with main menu)
    this.outerFrame = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'gray' } },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    this.boardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 2,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
      fixed: true,
    });

    this.nextBox = createBox({
      parent: this.screen,
      top: 1,
      left: 25,
      width: 14,
      height: 12,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      label: ' NEXT ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    this.holdBox = createBox({
      parent: this.screen,
      top: 16,
      left: 25,
      width: 14,
      height: 6,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'magenta' } },
      label: ' HOLD ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    this.gradeBox = createBox({
      parent: this.screen,
      top: 1,
      left: 40,
      width: 15,
      height: 7,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'yellow' } },
      label: ' GRADE ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    this.statsBox = createBox({
      parent: this.screen,
      top: 8,
      left: 40,
      width: 15,
      height: 8,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'green' } },
      label: ' STATS ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    this.sectionBox = createBox({
      parent: this.screen,
      top: 16,
      left: 40,
      width: 15,
      height: 6,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      label: ' SECTION ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // No footer in game screen - 24-row terminal has no room inside outer frame
    // (outerFrame border uses 2 rows, board needs 22 rows = exactly 24)
    // Key hints are shown on menu screen and in settings

    // Effects are now rendered inline in board content via boardOverlay compositor
    // No effectsBox needed - eliminates ghost artifacts from transparent overlays
  }

  /**
   * Setup input handlers
   */
  private setupInput(): void {
    // Skip input setup for attract mode (AI-controlled)
    if (!this.input) return;

    // Helper: register a callback on both keyboard and gamepad inputs.
    // Every input-driven engine change renders IMMEDIATELY instead of
    // waiting for the next 50 ms render tick - that wait (0-50 ms, avg 25)
    // was the single largest guaranteed input latency in the whole path.
    // renderNow() has its own 8 ms floor, so DAS/ARR repeats cannot flood.
    const on = (action: GameAction, cb: () => void) => {
      const wrapped = () => { cb(); this.renderNow(); };
      this.input!.on(action, wrapped);
      this.gamepadMapper?.on(action, wrapped);
    };

    on('left', () => {
      if (this.engine.move(-1)) {
        this.sounds.playSfx('move');
      }
    });

    on('right', () => {
      if (this.engine.move(1)) {
        this.sounds.playSfx('move');
      }
    });

    on('rotate_cw', () => {
      if (this.engine.rotate(1)) {
        this.sounds.playSfx('rotate');
      } else {
        if (this.engine.setIRS(1)) {
          this.sounds.playSfx('pre_rotate');
        }
      }
    });

    on('rotate_ccw', () => {
      if (this.engine.rotate(-1)) {
        this.sounds.playSfx('rotate');
      } else {
        if (this.engine.setIRS(-1)) {
          this.sounds.playSfx('pre_rotate');
        }
      }
    });

    on('rotate_180', () => {
      // In Zone mode, rotate_180 activates Zone (if meter >= 20%); otherwise rotates normally
      if (this.state.currentMode === 'zone') {
        if (this.engine.activateZone()) {
          this.sounds.playSfx('section_cool');  // Zone activation sound
          return;
        }
      }
      // 180 = two CW rotations
      const r1 = this.engine.rotate(1);
      const r2 = this.engine.rotate(1);
      if (r1 || r2) this.sounds.playSfx('rotate');
    });

    on('soft_drop', () => {
      this.engine.softDrop();
    });

    on('hard_drop', () => {
      this.addHardDropTrail();
      this.engine.hardDrop();
      this.sounds.playSfx('hard_drop');
    });

    on('hold', () => {
      if (this.engine.hold()) {
        this.sounds.playSfx('hold');
      } else {
        if (this.engine.setIHS()) {
          this.sounds.playSfx('pre_hold');
        }
      }
    });

    on('pause', () => {
      if (this.engine.getState().status === 'playing') {
        this.engine.pause();
        this.showPauseMenu();
      }
    });

    // ESC directly quits the game (bypass pause menu)
    // Handled via screen keypress since ESC is not mapped in input config
    this.escHandler = (_ch: string | undefined, key: any) => {
      if (!key || !this.input) return;
      if (key.name === 'escape' && this.engine.getState().status === 'playing') {
        this.stoppedEarly = true;
        this.running = false;
      }
    };
    this.screen.on('keypress', this.escHandler);
  }

  /**
   * Render game state
   */
  private render(): void {
    const state = this.engine.getState();
    let needsRender = false;

    // Detect board changes via hash
    const boardHash = this.getBoardHash(state);
    const isShaking = this.shaker.isShaking();
    
    if (boardHash !== this.lastBoardHash || this.particles.getRenderableParticles().length > 0 || this.animations.getAnimations().length > 0 || isShaking) {
      // Apply shake offset
      if (isShaking) {
        const offset = this.shaker.getOffset();
        this.boardBox.top = 1 + offset.y;
        this.boardBox.left = 2 + offset.x;
      } else {
        this.boardBox.top = 1;
        this.boardBox.left = 2;
      }

      this.renderBoard(state);
      this.lastBoardHash = boardHash;
      needsRender = true;
    }

    // Update next/hold if changed
    if (JSON.stringify(state.nextQueue.slice(0, 3)) !== JSON.stringify(this.lastNext)) {
      this.renderNext(state.nextQueue.slice(0, 3));
      this.lastNext = [...state.nextQueue.slice(0, 3)];
      needsRender = true;
    }

    if (state.holdPiece !== this.lastHold) {
      this.renderHold(state.holdPiece);
      this.lastHold = state.holdPiece;
      needsRender = true;
    }

    // Stats update (always update if lines/score changed)
    if (state.score !== this.lastScore || state.level !== this.lastLevel || state.combo !== this.lastCombo) {
      this.renderStats(state);
      this.lastScore = state.score;
      this.lastLevel = state.level;
      this.lastCombo = state.combo;
      needsRender = true;
    }

    // Grade and Section (always updated)
    if (state.grade !== this.lastGrade || this.gradeAnimProgress > 0) {
      const gradeColor = this.getAnimatedGradeColor(state.grade);
      const gradeSize = this.getAnimatedGradeSize(state.grade);
      const gradePadding = ' '.repeat(Math.floor((13 - state.grade.length) / 2));
      this.gradeBox.setContent(
        `\n\n${gradePadding}{${gradeColor}-fg}${gradeSize.prefix}${state.grade}${gradeSize.suffix}{/${gradeColor}-fg}`
      );
      this.lastGrade = state.grade;
      needsRender = true;
    }

    // sectionTime is nonzero for the entire game, so the old
    // `sectionTime !== 0` made this branch (and needsRender) true on every
    // pass. The timer readout only needs ~4 Hz.
    if (state.section !== this.lastSection || Date.now() - this.lastSectionInfoRender >= 250) {
      this.renderSectionInfo(state);
      this.lastSection = state.section;
      this.lastSectionInfoRender = Date.now();
      needsRender = true;
    }

    // Build board overlay for inline effects rendering (replaces effectsBox)
    if (this.particles.getRenderableParticles().length > 0 || this.animations.getAnimations().length > 0 || this.animations.getFloatingTexts().length > 0) {
      this.buildBoardOverlay();
      needsRender = true;
    } else {
      // Clear overlay when no effects active
      this.boardOverlay = [];
    }

    // Only render to screen if content changed
    if (needsRender) {
      this.screen.render();
    }
  }

  /** Render immediately (used for input feedback), floored at 8 ms. */
  private renderNow(): void {
    const now = Date.now();
    if (now - this.lastRender >= 8) {
      this.render();
      this.lastRender = now;
    }
  }

  private getBoardHash(state: any): string {
    const piece = state.currentPiece ? `${state.currentPiece.x},${state.currentPiece.y},${state.currentPiece.rotation}` : 'null';
    // The shine animation only affects pixels while sweep cells are live.
    // Including the raw shineTimer here made the hash change EVERY 16 ms
    // tick, which defeated the render gate permanently - the board
    // repainted at full rate even with nothing moving.
    const shine = this.shineCells.size > 0 ? this.shineTimer : 0;
    return `${piece}-${state.lines}-${shine}`;
  }

  private getPPS(state: any): string {
    if (!state.startTime || state.piecesPlaced === 0) return '0.00';
    const elapsed = (Date.now() - state.startTime) / 1000;
    if (elapsed < 0.1) return '0.00';
    return (state.piecesPlaced / elapsed).toFixed(2);
  }

  private getDigHud(state: any): string {
    if (state.mode !== 'dig') return '';
    const remaining = state.digLinesRemaining ?? 0;
    const color = remaining <= 3 ? 'green' : remaining <= 6 ? 'yellow' : 'red';
    const filled = 10 - remaining;
    const bar = '#'.repeat(filled) + '-'.repeat(remaining);
    return `\n{${color}-fg}DIG: ${remaining} left{/${color}-fg}\n{gray-fg}[${bar}]{/gray-fg}`;
  }

  private getZoneHud(state: any): string {
    if (state.mode !== 'zone') return '';
    if (state.zoneActive) {
      const s = Math.ceil(Math.max(0, state.zoneTimeRemaining) / 1000);
      const n = state.zoneBufferedLines ?? 0;
      return `\n{cyan-fg}ZONE: ${s}s (${n} lines){/cyan-fg}`;
    }
    const pct = Math.round((state.zoneMeter ?? 0) * 100);
    const filled = Math.round((state.zoneMeter ?? 0) * 10);
    const bar = '#'.repeat(filled) + '-'.repeat(10 - filled);
    const color = pct >= 100 ? 'yellow' : pct >= 20 ? 'cyan' : 'gray';
    return `\n{${color}-fg}ZONE ${pct}%{/${color}-fg}\n{gray-fg}[${bar}]{/gray-fg}`;
  }

  private getUltraTime(state: any): string {
    if (state.mode !== 'ultra' || state.ultraTimeRemaining === undefined) return '';
    const ms = Math.max(0, state.ultraTimeRemaining);
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = (totalSecs % 60).toString().padStart(2, '0');
    const color = ms < 30000 ? 'red' : ms < 60000 ? 'yellow' : 'green';
    return `\n  {${color}-fg}TIME: ${m}:${s}{/${color}-fg}`;
  }

  private renderStats(state: any): void {
    const comboDisplay = this.getAnimatedComboDisplay(state.combo);
    let gravDisplay: string;
    if (state.gravity >= 20) {
      const flash = Math.floor(this.twentyGFlashTimer / 250) % 2 === 0;
      gravDisplay = `{${flash ? 'red' : 'yellow'}-fg}{bold}20.00{/bold}{/${flash ? 'red' : 'yellow'}-fg}`;
    } else {
      gravDisplay = `{yellow-fg}${state.gravity.toFixed(2)}{/yellow-fg}`;
    }

    let statsContent =
      `\n  Level: {cyan-fg}${state.level}{/cyan-fg}\n` +
      `  Lines: {green-fg}${state.lines}{/green-fg}\n` +
      `  Score: {white-fg}${state.score.toLocaleString()}{/white-fg}\n` +
      `  Combo: ${comboDisplay}\n` +
      `  Grav:  ${gravDisplay}G\n` +
      `  PPS:   {white-fg}${this.getPPS(state)}{/white-fg}` +
      this.getUltraTime(state) +
      this.getDigHud(state) +
      this.getZoneHud(state);

    if (state.lastTSpin === 'full') {
      statsContent += `\n\n  {magenta-fg}{bold}T-SPIN!{/bold}{/magenta-fg}`;
    } else if (state.lastTSpin === 'mini') {
      statsContent += `\n\n  {cyan-fg}T-SPIN MINI{/cyan-fg}`;
    }

    if (state.backToBack && state.backToBackCount > 1) {
      statsContent += `\n  {yellow-fg}{bold}B2B x${state.backToBackCount}{/bold}{/yellow-fg}`;
    } else if (state.backToBack) {
      statsContent += `\n  {yellow-fg}{bold}B2B{/bold}{/yellow-fg}`;
    }

    if (state.creditRollActive) {
      const timeLeft = Math.ceil(state.creditRollTimeRemaining / 1000);
      const color = timeLeft < 30 ? 'red' : 'yellow';
      statsContent += `\n\n  {${color}-fg}CREDIT{/${color}-fg}\n`;
      statsContent += `  {${color}-fg}${timeLeft}s{/${color}-fg}`;
    }

    this.statsBox.setContent(statsContent);
  }

  /**
   * Build board overlay grid from all active effects
   * 
   * Z-order (highest priority first):
   * 1. Text announcements (gradeUp, cool/regret, combo, tSpin)
   * 2. Floating text (score popups)
   * 3. Particles (converted to board coords)
   * 4. Lock glow (piece lock flash)
   * 
   * Board coordinates: x=0..9, y=4..23 (visible area)
   * Each overlay cell is a 2-char blessed-tagged string or null
   */
  private buildBoardOverlay(): void {
    // Reset overlay grid: 20 visible rows (y=4..23) x 10 cols
    this.boardOverlay = [];
    for (let r = 0; r < 20; r++) {
      this.boardOverlay[r] = new Array(10).fill(null);
    }

    // Helper to set overlay cell (lowest-priority callers go first, higher overwrite)
    const setCell = (boardX: number, boardY: number, content: string): void => {
      const row = boardY - 4;
      if (row >= 0 && row < 20 && boardX >= 0 && boardX < 10) {
        this.boardOverlay[row][boardX] = content;
      }
    };

    // --- Layer 4 (lowest): Lock glow ---
    const lockGlowAnims = this.animations.getAnimationsByType('lockGlow');
    for (const anim of lockGlowAnims) {
      const intensity = AnimationRenderer.getLockGlowIntensity(anim);
      if (intensity > 0.3) {
        const data = anim.data as any;
        for (const cell of data.cells) {
          if (intensity > 0.7) {
            setCell(cell.x, cell.y, '{white-fg}{bold}██{/bold}{/white-fg}');
          } else {
            setCell(cell.x, cell.y, '{white-fg}░░{/white-fg}');
          }
        }
      }
    }

    // --- Layer 3: Particles (now spawned in board coordinates) ---
    const particles = this.particles.getRenderableParticles();
    for (const particle of particles) {
      const boardX = Math.floor(particle.x);
      const boardY = Math.floor(particle.y);
      
      if (boardX >= 0 && boardX < 10 && boardY >= 4 && boardY < 24) {
        const alpha = particle.alpha;
        if (alpha > 0.7) {
          setCell(boardX, boardY, `{${particle.color}-fg}${particle.char}${particle.char}{/${particle.color}-fg}`);
        } else if (alpha > 0.3) {
          setCell(boardX, boardY, `{gray-fg}${particle.char}${particle.char}{/gray-fg}`);
        }
      }
    }

    // --- Layer 2: Floating text (score popups) ---
    const floatingTexts = this.animations.getFloatingTexts();
    for (const text of floatingTexts) {
      // Filter by mode
      if (text.mode === 'offboard' && text.x >= 0 && text.x < 10) {
        continue; // Don't render on playfield in offboard mode
      }

      // Calculate alpha (fade out frames 80-100)
      let alpha = 1.0;
      if (text.timer > 80) {
        alpha = 1.0 - ((text.timer - 80) / 20);
      }
      const color = alpha > 0.5 ? text.color : 'gray';

      // text.x is board X, text.y is board Y (floating upward from originY)
      const boardY = Math.floor(text.y);
      const boardX = Math.floor(text.x);

      // Render each line of text into board cells
      for (let lineIdx = 0; lineIdx < text.text.length; lineIdx++) {
        const line = text.text[lineIdx];
        const textBoardY = boardY + lineIdx;
        // Each board cell is 2 chars. Spread text across cells starting at boardX.
        for (let ci = 0; ci < line.length; ci++) {
          const cellX = boardX + Math.floor(ci / 2);
          // Build 2-char cell content for this position
          const charIdx = ci % 2;
          if (charIdx === 0) {
            // Get both chars for this cell
            const c1 = line[ci] || ' ';
            const c2 = (ci + 1 < line.length) ? line[ci + 1] : ' ';
            setCell(cellX, textBoardY, `{${color}-fg}${c1}${c2}{/${color}-fg}`);
          }
        }
      }
    }

    // --- Layer 1 (highest): Text announcements ---
    const animations = this.animations.getAnimations();
    for (const anim of animations) {
      if (anim.type === 'gradeUp') {
        const rendered = AnimationRenderer.renderGradeUp(anim);
        // Center "GRADE UP!" (9 chars) on board (10 cells = 20 chars)
        // Then second line with grade transition
        this.overlayTextOnBoard(rendered, 7, setCell); // Board center area
      } else if (anim.type === 'cool' || anim.type === 'regret') {
        const rendered = AnimationRenderer.renderSectionResult(anim);
        this.overlayTextOnBoard(rendered, 5, setCell); // Mid-upper area
      } else if (anim.type === 'comboCounter') {
        const data = anim.data as any;
        const combo = data.combo;
        const progress = anim.elapsed / anim.duration;

        if (progress < 0.8) {
          const color = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : 'cyan';
          const comboText = `${combo} COMBO!`;
          const boldTag = progress < 0.2 ? '{bold}' : '';
          const boldEnd = progress < 0.2 ? '{/bold}' : '';
          this.overlayTextOnBoard(`{${color}-fg}${boldTag}${comboText}${boldEnd}{/${color}-fg}`, 10, setCell);
        }
      } else if (anim.type === 'tSpin') {
        const progress = anim.elapsed / anim.duration;
        if (progress < 0.6) {
          this.overlayTextOnBoard('{magenta-fg}{bold}T-SPIN!{/bold}{/magenta-fg}', 9, setCell);
        }
      }
      // lockGlow handled in layer 4 above
    }
  }

  /**
   * Overlay text centered on the board at a given visible row offset
   * Text may contain blessed tags. Plain text chars are extracted for positioning.
   * visibleRow: 0-19 offset from top of visible board (board y=4+visibleRow)
   */
  private overlayTextOnBoard(taggedText: string, visibleRow: number, setCell: (bx: number, by: number, content: string) => void): void {
    // Split multi-line text
    const lines = taggedText.split('\n');
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      // Strip blessed tags to get plain text length for centering
      const plainText = line.replace(/\{[^}]*\}/g, '');
      const boardWidth = 10; // cells
      const textCellWidth = Math.ceil(plainText.length / 2); // Each cell is 2 chars
      const startCell = Math.floor((boardWidth - textCellWidth) / 2);
      const boardY = 4 + visibleRow + lineIdx;

      // Build cells from the tagged text
      // Strategy: extract plain chars with their surrounding tags
      // For simplicity, render the entire line into consecutive board cells
      let charCount = 0;
      let currentTags = '';
      let cellChars: string[] = [];
      
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '{') {
          const end = line.indexOf('}', i);
          if (end !== -1) {
            currentTags += line.substring(i, end + 1);
            i = end;
            continue;
          }
        }
        cellChars.push(line[i]);
      }

      // Now spread cellChars into 2-char board cells, wrapped in original tags
      // Re-extract the tag prefix and suffix from the line
      const tagPrefix = line.match(/^(\{[^}]*\})+/)?.[0] || '';
      const tagSuffix = line.match(/(\{\/[^}]*\})+$/)?.[0] || '';

      for (let ci = 0; ci < cellChars.length; ci += 2) {
        const c1 = cellChars[ci] || ' ';
        const c2 = cellChars[ci + 1] || ' ';
        const cellX = startCell + Math.floor(ci / 2);
        setCell(cellX, boardY, `${tagPrefix}${c1}${c2}${tagSuffix}`);
      }
    }
  }

  /**
   * Update grade display animation
   */
  private updateGradeAnimation(deltaTime: number): void {
    const PULSE_SPEED = 0.001; // Slower
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
   * Update rainbow border colors for all panels
   */
  private updateRainbowBorders(): void {
    const baseIndex = this.rainbowTimer % this.RAINBOW_COLORS.length;

    // Only update if grade is high enough to justify the distraction
    const state = this.engine.getState();
    const isRainbowMode = state.grade === 'GM' || state.grade === 'GMM' || state.creditRollActive;
    
    if (!isRainbowMode) {
        if (this.boardBox?.style?.border) this.boardBox.style.border.fg = 'white';
        if (this.nextBox?.style?.border) this.nextBox.style.border.fg = 'cyan';
        if (this.holdBox?.style?.border) this.holdBox.style.border.fg = 'magenta';
        if (this.gradeBox?.style?.border) this.gradeBox.style.border.fg = 'yellow';
        if (this.statsBox?.style?.border) this.statsBox.style.border.fg = 'green';
        if (this.sectionBox?.style?.border) this.sectionBox.style.border.fg = 'cyan';
        return;
    }

    // Each panel gets a different offset for a wave effect
    if (this.boardBox?.style?.border) {
      this.boardBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 0) % this.RAINBOW_COLORS.length];
    }
    if (this.nextBox?.style?.border) {
      this.nextBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 1) % this.RAINBOW_COLORS.length];
    }
    if (this.holdBox?.style?.border) {
      this.holdBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 2) % this.RAINBOW_COLORS.length];
    }
    if (this.gradeBox?.style?.border) {
      this.gradeBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 3) % this.RAINBOW_COLORS.length];
    }
    if (this.statsBox?.style?.border) {
      this.statsBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 4) % this.RAINBOW_COLORS.length];
    }
    if (this.sectionBox?.style?.border) {
      this.sectionBox.style.border.fg = this.RAINBOW_COLORS[(baseIndex + 5) % this.RAINBOW_COLORS.length];
    }
  }

  /**
   * Update block shine effect (sweeping glare like arkanoid2)
   */
  private updateShineEffect(): void {
    this.shineTimer++;

    // Trigger new shine sweep periodically
    if (this.shineTimer >= this.SHINE_INTERVAL) {
      this.shineTimer = 0;

      const gameState = this.engine.getState();
      const board = gameState.board;
      let delay = 0;

      // Sweep from top-left to bottom-right
      for (let y = 4; y < 24; y++) {
        for (let x = 0; x < board.width; x++) {
          const cell = board.grid[y][x];
          if (cell.filled && cell.locked) {
            const key = `${x},${y}`;
            this.shineCells.set(key, delay + 5);
            delay += 1;
          }
        }
      }
    }

    for (const [key, frames] of this.shineCells.entries()) {
      if (frames <= 0) {
        this.shineCells.delete(key);
      } else {
        this.shineCells.set(key, frames - 1);
      }
    }
  }

  /**
   * Check if a cell should be rendered with shine effect
   */
  private hasShineEffect(x: number, y: number): boolean {
    const key = `${x},${y}`;
    const frames = this.shineCells.get(key);
    return frames !== undefined && frames > 0 && frames < 5;
  }

  /**
   * Get animated color for grade
   */
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

  /**
   * Get animated size for grade
   */
  private getAnimatedGradeSize(grade: string): { prefix: string; suffix: string } {
    const pulse = Math.sin(this.gradeAnimProgress * Math.PI * 2) * 0.5 + 0.5;
    return pulse > 0.7 ? { prefix: '{bold}', suffix: '{/bold}' } : { prefix: '', suffix: '' };
  }

  /**
   * Get animated combo display with milestone colors
   */
  private getAnimatedComboDisplay(combo: number): string {
    const comboAnim = this.animations.getAnimationsByType('comboCounter')[0];
    if (comboAnim) {
      const color = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : combo >= 5 ? 'cyan' : 'magenta';
      return `{${color}-fg}{bold}${combo}x{/bold}{/${color}-fg}`;
    }
    const color = combo >= 5 ? 'magenta' : 'white';
    return `{${color}-fg}${combo}x{/${color}-fg}`;
  }

  /**
   * Render section information
   */
  private renderSectionInfo(state: any): void {
    // COOL targets (seconds) - from TGM3 Master mode
    const COOL_TARGETS: Record<number, number> = {
      0: 52, 1: 48, 2: 46, 3: 44, 4: 36,
      5: 36, 6: 40, 7: 44, 8: 44, 9: 44,
    };

    const section = state.section;
    const sectionTime = state.sectionTime / 1000;
    const coolTarget = COOL_TARGETS[section] || 45;

    let timeColor = 'white';
    if (sectionTime < coolTarget) {
      timeColor = 'green';
    } else {
      timeColor = 'yellow';
    }

    let content = `\n {cyan-fg}SEC:{/cyan-fg} ${section}\n`;
    content += ` {${timeColor}-fg}${sectionTime.toFixed(1)}s{/${timeColor}-fg}\n`;
    content += ` {green-fg}${coolTarget}s{/green-fg}`;

    if (state.lastSectionResult) {
      const resultColor = state.lastSectionResult === 'COOL' ? 'green'
        : state.lastSectionResult === 'REGRET' ? 'red' : 'yellow';
      content += `\n {${resultColor}-fg}${state.lastSectionResult}{/${resultColor}-fg}`;
    }

    this.sectionBox.setContent(content);
  }

  /**
   * Render board with pieces
   */
  private renderBoard(state: any): void {
    const { board, currentPiece } = state;
    const rotationSystem = this.state.settings.rotationSystem;
    const creditRoll = (this.engine as any).creditRollManager;
    const invisibleManager = (this.engine as any).invisiblePieceManager;
    const isMasterRoll = state.creditRollActive;

    // Update connected blocks cache if enabled
    if (this.state.settings.connectedBlocks) {
      this.connectedBlocks.updateCache(board);
    }
    
    let content = '';
    const now = Date.now();
    this.hardDropTrails = this.hardDropTrails.filter(trail => now - trail.createdAt < 160);

    let pieceShape: number[][] | null = null;
    let ghostY: number | null = null;

    if (currentPiece) {
      const pieceManager = (this.engine as any).pieceManager;
      const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
      if (shape) {
        pieceShape = shape;
        // Only calculate ghost if piece is visible or will land in visible area
        if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
          const calculatedGhostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
          // Only use ghost if ANY part of it is in visible area (ghostY + shape height >= 4)
          // This prevents ghost rendering when the entire ghost is in vanish zone
          const ghostBottom = calculatedGhostY + shape.length - 1;
          if (ghostBottom >= 4 && calculatedGhostY !== currentPiece.y) {
            ghostY = calculatedGhostY;
          }
        }
      }
    }

    for (let y = 4; y < 24; y++) {
      if (y > 4) content += '\n';

      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        let char = '  ';

        if (currentPiece && pieceShape) {
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px]) {
            if (currentPiece.invisible) {
              char = '{black-fg}░░{/black-fg}';
            } else {
              // TGM3: In Master Roll, board is invisible, but active piece is visible
              char = this.getBlockChar(currentPiece.type, rotationSystem);
            }
          }
        }

        if (ghostY !== null && currentPiece && pieceShape && char === '  ' && !isMasterRoll) {
          const px = x - currentPiece.x;
          const py = y - ghostY;
          // Calculate the actual board row this ghost block represents
          const ghostBlockY = ghostY + py;
          // Additional bounds check: ensure ghost block is within board and shape bounds
          // AND ensure the ghost block's board position is in visible area (>= 4)
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px] &&
              ghostBlockY >= 4 && ghostBlockY < 24 &&  // Ghost block must be in visible board area
              x >= 0 && x < board.width) {  // Within board width
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
          // Check line clear animation fade
          const clearFade = this.clearAnimation.getCellFade(x, y);

          if (clearFade >= 1.0) {
            // Cell fully cleared by animation - render as empty
            char = '  ';
          } else if (this.hasShineEffect(x, y) && !isMasterRoll) {
            char = '{white-bg}{white-fg}██{/white-fg}{/white-bg}';
          } else if (isMasterRoll && cell.lockTime) {
            // Apply TGM3 authentic credit roll fade
            const age = Date.now() - cell.lockTime;
            const fadeStage = creditRoll.getFadeStage(cell.lockTime);

            if (fadeStage === 'full') {
              char = this.getBlockChar(cell.color as PieceType, rotationSystem);
            } else if (fadeStage === 'bright') {
              char = this.getFadedBlockChar(cell.color as PieceType, 'medium', rotationSystem);
            } else if (fadeStage === 'medium' || fadeStage === 'faint') {
              char = this.getFadedBlockChar(cell.color as PieceType, 'faint', rotationSystem);
            } else {
              char = '  '; // Fully invisible
            }
          } else if (!isMasterRoll) {
            // Get base character (connected blocks or simple blocks)
            const pieceColor = this.getPieceColorName(cell.color as PieceType);

            if (this.state.settings.connectedBlocks) {
              char = this.connectedBlocks.getConnectedChar(x, y, pieceColor);
            } else {
              char = this.getBlockChar(cell.color as PieceType, rotationSystem);
            }

            // Apply block glow overlay if active
            const glowIntensity = this.glowManager.getGlowIntensity(x, y);
            if (glowIntensity > 0) {
              const glowColor = this.glowManager.getGlowColor(x, y);
              if (glowColor) {
                char = this.applyGlow(char, glowColor, glowIntensity);
              }
            }

            // Apply line clear fade effect if animating
            if (clearFade > 0 && clearFade < 1.0) {
              char = LineClearAnimationManager.applyFade(char, clearFade);
            }

            // Apply placement effect overlay if active
            const placementEffects = this.animations.getPlacementEffects();
            for (const effect of placementEffects) {
              const effectChar = AnimationRenderer.renderPlacementEffect(effect, x, y);
              if (effectChar) {
                char = effectChar;
                break; // Only apply first matching effect
              }
            }

            // Apply back-to-back glow overlay if active
            const b2bAnimations = this.animations.getAnimationsByType('backToBackGlow');
            for (const anim of b2bAnimations) {
              const b2bChar = AnimationRenderer.renderBackToBackGlow(
                anim.data,
                anim.elapsed,
                anim.duration,
                x,
                y
              );
              if (b2bChar) {
                char = b2bChar;
                break;
              }
            }
          }
        }

        // Apply board overlay (text announcements, particles, floating text, lock glow)
        // This is the highest-priority visual layer
        if (this.boardOverlay.length > 0) {
          const overlayRow = y - 4;
          if (overlayRow >= 0 && overlayRow < this.boardOverlay.length) {
            const overlayCell = this.boardOverlay[overlayRow][x];
            if (overlayCell !== null) {
              char = overlayCell;
            }
          }
        }

        content += char;
      }
    }

    this.boardBox.setContent(content);
  }

  /**
   * Get ANSI block character for piece type
   */
  private getBlockChar(type: PieceType | null, rotationSystem: string): string {
    const gameState = this.engine.getState();
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    
    // Handle garbage blocks (type is null)
    if (type === null) {
      return '{gray-fg}██{/gray-fg}';
    }

    const color = colors[type] || 'white';
    
    // TGM3 Shirase: Bone blocks at level 1000+
    if (gameState.mode === 'death' && gameState.level >= 1000) {
      return '{white-fg}[]{/white-fg}';
    }
    
    return `{${color}-fg}██{/${color}-fg}`;
  }

  /**
   * Get faded block character for credit roll
   */
  private getFadedBlockChar(type: PieceType, intensity: 'medium' | 'faint', rotationSystem: string): string {
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    const color = colors[type] || 'white';

    if (intensity === 'medium') {
      return `{${color}-fg}▒▒{/${color}-fg}`;
    } else {
      return `{${color}-fg}░░{/${color}-fg}`;
    }
  }

  private addHardDropTrail(): void {
    const state = this.engine.getState();
    const { board, currentPiece } = state;
    if (!currentPiece) {
      return;
    }

    const pieceManager = (this.engine as any).pieceManager;
    const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
    if (!shape) {
      return;
    }

    const ghostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
    const dropDistance = ghostY - currentPiece.y;
    if (dropDistance <= 0) {
      return;
    }

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
            x: startX,
            y,
            color,
            strength,
            createdAt: now,
          });
        }
      }
    }
  }

  /**
   * Render next queue
   */
  private renderNext(queue: PieceType[]): void {
    let content = '\n';
    const rotationSystem = this.state.settings.rotationSystem;

    for (let i = 0; i < Math.min(3, queue.length); i++) {
      const piece = queue[i];
      const mini = this.getMiniPiece(piece, rotationSystem);
      content += mini + (i < 2 ? '\n\n' : '\n');
    }

    this.nextBox.setContent(content);
  }

  /**
   * Render hold piece
   */
  private renderHold(piece: PieceType | null): void {
    if (!piece) {
      this.holdBox.setContent('\n   {gray-fg}---{/gray-fg}');
      return;
    }

    const mini = this.getMiniPiece(piece, this.state.settings.rotationSystem);
    this.holdBox.setContent('\n' + mini);
  }

  /**
   * Get mini piece preview
   */
  private getMiniPiece(type: PieceType, rotationSystem: string): string {
    const block = this.getBlockChar(type, rotationSystem);
    const patterns: Record<PieceType, string> = {
      I: `  ${block}${block}${block}${block}`,
      O: `    ${block}${block}\n    ${block}${block}`,
      T: `      ${block}\n    ${block}${block}${block}`,
      S: `      ${block}${block}\n    ${block}${block}`,
      Z: `    ${block}${block}\n      ${block}${block}`,
      J: `    ${block}\n    ${block}${block}${block}`,
      L: `        ${block}\n    ${block}${block}${block}`,
    };
    return patterns[type] || '';
  }

  /**
   * Calculate credit roll opacity based on block age
   */
  private getCreditRollOpacity(age: number): number {
    const HALF_LIFE = 5000;
    return Math.exp(-age / HALF_LIFE);
  }

  /**
   * Get color for piece type
   */
  private getPieceGlowColor(type: PieceType, rotationSystem: string): string {
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    return colors[type];
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
   * Get color name for piece type (for visual effects)
   */
  private getPieceColorName(type: PieceType): string {
    const rotationSystem = this.state.settings.rotationSystem;
    const colors = rotationSystem === 'ARS' ? ARS_COLORS : PIECE_COLORS;
    return colors[type] || 'white';
  }

  /**
   * Apply glow effect to block character
   */
  private applyGlow(baseChar: string, glowColor: string, intensity: number): string {
    // intensity 1.0 = full glow, 0.0 = no glow
    const brightColor = this.getBrightColor(glowColor);

    if (intensity > 0.7) {
      // Strong glow - bright background
      return `{${brightColor}-bg}${baseChar}{/${brightColor}-bg}`;
    } else if (intensity > 0.3) {
      // Medium glow - normal background
      return `{${glowColor}-bg}${baseChar}{/${glowColor}-bg}`;
    } else {
      // Minimal glow - just use base
      return baseChar;
    }
  }

  /**
   * Show pause menu with live stats
   */
  private showPauseMenu(): void {
    const state = this.engine.getState();
    const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0;
    const mins = Math.floor(elapsed / 60);
    const secs = (elapsed % 60).toString().padStart(2, '0');
    const pps = this.getPPS(state);
    const finErr = this.engine.getFinesseErrors();
    const secMs = state.sectionTime ?? 0;
    const secSecs = Math.floor(secMs / 1000);
    const secMins = Math.floor(secSecs / 60);
    const secS = (secSecs % 60).toString().padStart(2, '0');

    const content =
      `\n{bold}{yellow-fg}PAUSED{/yellow-fg}{/bold}\n\n` +
      `{white-fg}Time:    ${mins}:${secs}{/white-fg}\n` +
      `{cyan-fg}Grade:   ${state.grade}{/cyan-fg}\n` +
      `{white-fg}Level:   ${state.level}{/white-fg}\n` +
      `{green-fg}PPS:     ${pps}{/green-fg}\n` +
      `{white-fg}Section: ${secMins}:${secS}{/white-fg}\n` +
      `{${finErr === 0 ? 'green' : 'red'}-fg}Finesse: ${finErr} err{/${finErr === 0 ? 'green' : 'red'}-fg}\n\n` +
      `{gray-fg}P=resume  ESC/Q=quit{/gray-fg}`;

    const pauseBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 32,
      height: 14,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'yellow' } },
      align: 'left',
      content,
      tags: true,
      fixed: true,
    });

    this.screen.render();

    const handler = (ch: string | undefined, key: any) => {
      if (!key) return;
      if (key.name === 'p') {
        this.screen.removeListener('keypress', handler);
        pauseBox.destroy();
        this.engine.resume();
        this.screen.render();
      } else if (key.name === 'escape' || key.name === 'q') {
        this.screen.removeListener('keypress', handler);
        pauseBox.destroy();
        this.stoppedEarly = true;
        this.running = false;
        this.screen.render();
      }
    };

    this.screen.on('keypress', handler);
  }

  /**
   * Show game over screen
   */
  private async showGameOver(): Promise<void> {
    const result = this.engine.getResult();
    const gameState = this.engine.getState();
    let gameOverTitle = '{bold}{red-fg}GAME OVER{/red-fg}{/bold}';
    let gameOverColor = 'red';

    // Dig mode complete
    if (gameState.mode === 'dig' && gameState.status === 'complete') {
      gameOverTitle = '{bold}{green-fg}DIG COMPLETE!{/green-fg}{/bold}';
      gameOverColor = 'green';
    } else if (gameState.mode === 'ultra' && gameState.status === 'complete') {
      // Ultra mode time-up
      gameOverTitle = '{bold}{cyan-fg}TIME UP!{/cyan-fg}{/bold}';
      gameOverColor = 'cyan';
    } else if (result.grade === 'GMM' || result.grade === 'GM') {
      gameOverTitle = result.grade === 'GMM'
        ? '{bold}{yellow-fg}GRAND MASTER MARU!{/yellow-fg}{/bold}'
        : '{bold}{yellow-fg}GRAND MASTER!{/yellow-fg}{/bold}';
      gameOverColor = 'yellow';
      this.sounds.playVoice('bravo');
    }

    // Clear all game UI to prevent border overlap
    this.cleanup();

    // Full-screen black background
    const bg = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: 'black' },
    });

    const gameOverBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 14,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: gameOverColor } },
      align: 'center',
      content: `\n${gameOverTitle}\n\n` +
        `Grade:  {yellow-fg}${result.grade}{/yellow-fg}\n` +
        `Level:  ${result.level}\n` +
        `Lines:  ${result.lines}\n` +
        `Score:  ${result.score.toLocaleString()}\n` +
        `Combo:  ${result.combo}x\n\n` +
        '{gray-fg}Press any key to continue{/gray-fg}',
      fixed: true,
    });

    this.screen.render();
    this.sounds.playSfx('game_over');
    this.sounds.stopMusic();
    this.sounds.playMusic('game_over', false);

    await this.waitForKey();
    gameOverBox.destroy();
    bg.destroy();
  }

  private waitForKey(): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        this.screen.removeListener('keypress', handler);
        resolve();
      };
      this.screen.on('keypress', handler);
    });
  }

  private cleanup(): void {
    if (this.cleanedUp) return;  // Prevent double cleanup
    this.cleanedUp = true;

    if (this.input) {
      this.input.reset();
    }
    if (this.escHandler) {
      this.screen.removeListener('keypress', this.escHandler);
      this.escHandler = null;
    }
    this.sounds.stopMusic();
    this.boardBox?.destroy();
    this.nextBox?.destroy();
    this.holdBox?.destroy();
    this.statsBox?.destroy();
    this.gradeBox?.destroy();
    this.sectionBox?.destroy();
    this.footerBox?.destroy();
    this.outerFrame?.destroy();
  }

  /**
   * Stop the game loop early without showing game over (for attract mode exit)
   */
  stop(): void {
    if (!this.running) return;
    this.stoppedEarly = true;  // Prevent showGameOver from being called
    this.running = false;
    // Game loop will detect running=false and call cleanup() on next tick
    // Call cleanup immediately for faster resource release
    this.cleanup();
  }
}
