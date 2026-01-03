/**
 * Game Screen
 *
 * Main gameplay screen with board rendering and HUD
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState, Piece, PieceType } from '../core/types';
import { PIECE_COLORS } from '../core/pieces';
import { getGhostY } from '../core/board';
import { ScreenShaker } from '../effects/screen-shake';
import { ParticleSystem } from '../effects/particles';
import { TransitionManager } from '../effects/transitions';
import { AnimationManager, AnimationRenderer } from '../effects/animations';

/**
 * Main game screen
 */
export class GameScreen {
  private running: boolean = false;
  private boardBox: any;
  private nextBox: any;
  private holdBox: any;
  private statsBox: any;
  private gradeBox: any;
  private sectionBox: any;
  private effectsBox: any;  // Overlay for effects
  private lastRender: number = 0;
  private readonly RENDER_FPS = 60;
  private readonly RENDER_INTERVAL = 1000 / this.RENDER_FPS;

  // Visual effects systems
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

  // Animation state
  private gradeAnimProgress: number = 0;
  private gradeAnimDirection: number = 1;
  private lastComboMilestone: number = 0;
  private twentyGFlashTimer: number = 0;

  // Rainbow border animation
  private rainbowTimer: number = 0;
  private readonly RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];

  // Block shine effect (sweep animation like arkanoid2)
  private shineTimer: number = 0;
  private readonly SHINE_INTERVAL = 300;  // Frames between shine sweeps
  private shineCells: Map<string, number> = new Map();  // "x,y" -> frames remaining

  constructor(
    private screen: Screen,
    private engine: GameEngine,
    private input: InputHandler,
    private sounds: SoundEngine,
    private state: AppState
  ) {
    // Initialize effect systems
    this.shaker = new ScreenShaker();
    this.particles = new ParticleSystem();
    this.transitions = new TransitionManager();
    this.animations = new AnimationManager();
  }

  /**
   * Run the game loop
   */
  async run(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Setup UI
      this.setupUI();

      // Setup input handlers
      this.setupInput();

      // Start game
      this.engine.start();
      this.running = true;
      this.sounds.playMusic('master', true);

      // Game loop using setInterval
      let lastUpdate = Date.now();
      const gameLoop = setInterval(() => {
        if (!this.running) {
          clearInterval(gameLoop);
          this.showGameOver().then(() => {
            this.cleanup();
            resolve();
          });
          return;
        }

        const now = Date.now();
        const deltaTime = now - lastUpdate;
        lastUpdate = now;

        // Update game
        this.engine.update(deltaTime);
        this.input.update(deltaTime);

        // Get current state once for all checks
        const gameState = this.engine.getState();

        // Update effects
        this.shaker.update(deltaTime);
        this.particles.update(deltaTime);
        this.transitions.update(deltaTime);
        this.animations.update(deltaTime);
        this.updateGradeAnimation(deltaTime);

        // Update rainbow border animation
        this.rainbowTimer++;
        this.updateRainbowBorders();

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

        // Check for game over
        if (gameState.status === 'gameover') {
          this.running = false;
        }
      }, 16); // ~60 FPS (16ms)
    });
  }

  /**
   * Check for game events and trigger visual effects
   */
  private checkGameEvents(): void {
    const gameState = this.engine.getState();

    // Check for level change
    if (gameState.level > this.lastLevel) {
      this.sounds.playSfx('level_up');
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

      // Check for T-Spin
      if (gameState.lastTSpin === 'full') {
        // T-Spin!
        this.particles.spawn('tetris', 12, 12);
        this.shaker.shake('tetris');
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');  // Voice callout
      } else if (gameState.lastTSpin === 'mini') {
        // T-Spin Mini
        this.particles.spawn('lineClear', 12, 12);
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('rotate');
      } else if (linesCleared === 4) {
        // Tetris!
        this.particles.spawn('tetris', 12, 12);
        this.shaker.shake('tetris');
        this.animations.lineClearFlash([], 4);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');  // Voice callout
      } else if (linesCleared === 3) {
        // Triple
        this.particles.spawn('lineClear', 12, 12);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('triple');  // Voice callout
      } else if (linesCleared === 2) {
        // Double
        this.particles.spawn('lineClear', 12, 12);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('double');  // Voice callout
      } else if (linesCleared >= 1) {
        // Single line clear (no voice)
        this.particles.spawn('lineClear', 12, 12);
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

    // Check for section completion
    if (gameState.section > this.lastSection) {
      const result = gameState.lastSectionResult;
      if (result) {
        this.handleSectionComplete(this.lastSection, result);
      }
      this.lastSection = gameState.section;
    }

    // Check for piece lock (detect when currentPiece becomes null after being non-null)
    if (!gameState.currentPiece && this.lastPieceExists) {
      // Piece just locked - trigger lock flash
      this.triggerLockFlash();
    }
    this.lastPieceExists = gameState.currentPiece !== null;
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
    if (milestone >= 10) this.particles.spawn('combo', 40, 12);
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
      this.particles.spawn('cool', 40, 12);
    } else if (result === 'REGRET') {
      this.animations.regret(section);
      this.sounds.playSfx('section_regret');
      this.sounds.playVoice('regret');  // Voice callout
    }

    // Note: lastSectionResult is already stored in GameState
  }

  /**
   * Setup UI elements
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Board playfield:
    // - Board logic: 24 rows (0-23), rows 0-3 are spawn buffer (hidden)
    // - Visible rows: 4-23 (20 rows) displayed in the box
    // - Box: width 22 (10 cells x 2 chars + 2 border), height 22 (20 content + 2 border)
    // - Content area: 20 chars x 20 rows for the playfield
    this.boardBox = createBox({
      parent: this.screen,
      top: 1,  // Leave row 0 for padding, helps prevent top clipping
      left: 2,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
    });

    // Next queue (aligned with board at top:1)
    this.nextBox = createBox({
      parent: this.screen,
      top: 1,
      left: 25,
      width: 12,
      height: 12,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      label: ' NEXT ',
    });

    // Hold piece
    this.holdBox = createBox({
      parent: this.screen,
      top: 14,
      left: 25,
      width: 12,
      height: 6,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'magenta' } },
      label: ' HOLD ',
    });

    // Grade display
    this.gradeBox = createBox({
      parent: this.screen,
      top: 1,
      left: 38,
      width: 15,
      height: 7,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'yellow' } },
      label: ' GRADE ',
    });

    // Stats
    this.statsBox = createBox({
      parent: this.screen,
      top: 9,
      left: 38,
      width: 15,
      height: 8,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'green' } },
      label: ' STATS ',
    });

    // Section tracking
    this.sectionBox = createBox({
      parent: this.screen,
      top: 17,
      left: 38,
      width: 15,
      height: 6,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      label: ' SECTION ',
    });

    // Instructions
    createBox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      right: 0,
      height: 1,
      align: 'center',
      style: { bg: 'black', fg: 'gray' },
      content: '←→ Move | Z/X Rotate | ↓ Soft | Enter Hard | C Hold | ESC Pause',
    });

    // Effects overlay (for particles and animations) - must be transparent!
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
   * Setup input handlers
   */
  private setupInput(): void {
    this.input.on('left', () => {
      if (this.engine.move(-1)) {
        this.sounds.playSfx('move');
      }
    });

    this.input.on('right', () => {
      if (this.engine.move(1)) {
        this.sounds.playSfx('move');
      }
    });

    this.input.on('rotate_cw', () => {
      if (this.engine.rotate(1)) {
        this.sounds.playSfx('rotate');
      }
    });

    this.input.on('rotate_ccw', () => {
      if (this.engine.rotate(-1)) {
        this.sounds.playSfx('rotate');
      }
    });

    this.input.on('soft_drop', () => {
      if (this.engine.softDrop()) {
        this.sounds.playSfx('move');
      }
    });

    this.input.on('hard_drop', () => {
      this.engine.hardDrop();
      this.sounds.playSfx('hard_drop');
    });

    this.input.on('hold', () => {
      if (this.engine.hold()) {
        this.sounds.playSfx('hold');
      }
    });

    this.input.on('pause', () => {
      if (this.engine.getState().status === 'playing') {
        this.engine.pause();
        this.showPauseMenu();
      }
    });
  }

  /**
   * Render game state
   */
  private render(): void {
    const state = this.engine.getState();

    // Update board border color for 20G warning
    if (state.gravity >= 20) {
      const flash = Math.floor(this.twentyGFlashTimer / 250) % 2 === 0;
      if (this.boardBox.style && this.boardBox.style.border) {
        this.boardBox.style.border.fg = flash ? 'red' : 'white';
      }
    } else {
      if (this.boardBox.style && this.boardBox.style.border) {
        this.boardBox.style.border.fg = 'white';
      }
    }

    // Render board
    this.renderBoard(state);

    // Render next queue
    this.renderNext(state.nextQueue.slice(0, 3));

    // Render hold piece
    this.renderHold(state.holdPiece);

    // Render grade
    const gradeColor = this.getAnimatedGradeColor(state.grade);
    const gradeSize = this.getAnimatedGradeSize(state.grade);
    const gradePadding = ' '.repeat(Math.floor((13 - state.grade.length) / 2));
    this.gradeBox.setContent(
      `\n\n${gradePadding}{${gradeColor}-fg}${gradeSize.prefix}${state.grade}${gradeSize.suffix}{/${gradeColor}-fg}`
    );

    // Render stats
    const comboDisplay = this.getAnimatedComboDisplay(state.combo);

    // Format gravity display with 20G warning
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
      `  Grav:  ${gravDisplay}G`;

    // T-Spin indicator
    if (state.lastTSpin === 'full') {
      statsContent += `\n\n  {magenta-fg}{bold}T-SPIN!{/bold}{/magenta-fg}`;
    } else if (state.lastTSpin === 'mini') {
      statsContent += `\n\n  {cyan-fg}T-SPIN MINI{/cyan-fg}`;
    }

    // Back-to-Back indicator
    if (state.backToBack) {
      statsContent += `\n  {yellow-fg}{bold}B2B{/bold}{/yellow-fg}`;
    }

    // Credit roll timer
    if (state.creditRollActive) {
      const timeLeft = Math.ceil(state.creditRollTimeRemaining / 1000);
      const color = timeLeft < 30 ? 'red' : 'yellow';
      statsContent += `\n\n  {${color}-fg}CREDIT{/${color}-fg}\n`;
      statsContent += `  {${color}-fg}${timeLeft}s{/${color}-fg}`;
    }

    this.statsBox.setContent(statsContent);

    // Render section info
    this.renderSectionInfo(state);

    // Render effects overlay (particles and animations)
    this.renderEffects();

    this.screen.render();
  }

  /**
   * Render visual effects overlay
   */
  private renderEffects(): void {
    let effectsContent = '';
    const screenWidth = this.screen.width;
    const screenHeight = this.screen.height;

    // Render particles
    const particles = this.particles.getRenderableParticles();
    for (const particle of particles) {
      const x = Math.floor(particle.x);
      const y = Math.floor(particle.y);

      // Only render if on screen
      if (x >= 0 && x < screenWidth && y >= 0 && y < screenHeight) {
        const alpha = particle.alpha;
        const color = particle.color;
        const char = particle.char;

        // Fade particle based on alpha
        if (alpha > 0.7) {
          effectsContent += `\x1b[${y};${x}H{${color}-fg}${char}{/${color}-fg}`;
        } else if (alpha > 0.3) {
          effectsContent += `\x1b[${y};${x}H{gray-fg}${char}{/gray-fg}`;
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
            // Only render for visible rows (board rows 4-23)
            if (cell.y < 4) continue;
            // Convert board coordinates to ANSI screen coordinates:
            // BoardBox at blessed top:1 (blessed 0-indexed) = ANSI row 2 (ANSI 1-indexed)
            // Border at ANSI row 2, content starts at ANSI row 3
            // Board row 4 (first visible) should appear at ANSI row 3
            // Formula: ANSI_y = blessed_top + 1 (border) + (cell.y - 4) + 1 (ANSI offset)
            //                 = 1 + 1 + cell.y - 4 + 1 = cell.y - 1
            const x = 4 + cell.x * 2;
            const y = cell.y + 1;  // Board row + offset for box border + ANSI 1-indexing
            if (intensity > 0.7) {
              effectsContent += `\x1b[${y};${x}H{white-fg}{bold}██{/bold}{/white-fg}`;
            } else {
              effectsContent += `\x1b[${y};${x}H{white-fg}░░{/white-fg}`;
            }
          }
        }
      }
    }

    // Screen shake is tracked but not visually applied in terminal
    // (Terminal elements can't be repositioned after creation in blessed)
    // The shake effect is still calculated for potential future use
    const shakeOffset = this.shaker.getOffset();

    if (this.effectsBox) {
      this.effectsBox.setContent(effectsContent);
    }
  }

  /**
   * Update grade display animation
   */
  private updateGradeAnimation(deltaTime: number): void {
    const PULSE_SPEED = 0.003;
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
    const speed = 8;  // Lower = faster color cycling
    const baseIndex = Math.floor(this.rainbowTimer / speed) % this.RAINBOW_COLORS.length;

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
            // Stagger delay based on position (diagonal sweep)
            const key = `${x},${y}`;
            this.shineCells.set(key, delay + 5);  // 5 frames of shine
            delay += 1;  // Each cell starts 1 frame later
          }
        }
      }
    }

    // Decrement all shine timers
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
      0: 50, 1: 45, 2: 45, 3: 45, 4: 45,
      5: 40, 6: 40, 7: 40, 8: 40, 9: 35,
    };

    // REGRET thresholds (seconds)
    const REGRET_THRESHOLD: Record<number, number> = {
      0: 90, 1: 80, 2: 75, 3: 70, 4: 65,
      5: 60, 6: 55, 7: 50, 8: 45, 9: 40,
    };

    const section = state.section;
    const sectionTime = state.sectionTime / 1000; // Convert ms to seconds
    const coolTarget = COOL_TARGETS[section] || 45;
    const regretThreshold = REGRET_THRESHOLD[section] || 90;

    // Determine time color
    let timeColor = 'white';
    if (sectionTime < coolTarget) {
      timeColor = 'green';
    } else if (sectionTime < regretThreshold) {
      timeColor = 'yellow';
    } else {
      timeColor = 'red';
    }

    // Build content
    let content = `\n {cyan-fg}SEC:{/cyan-fg} ${section}\n`;
    content += ` {${timeColor}-fg}${sectionTime.toFixed(1)}s{/${timeColor}-fg}\n`;
    content += ` {green-fg}${coolTarget}s{/green-fg}`;

    // Show last section result if available
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
    let content = '';

    // Get piece shape and ghost position
    let pieceShape: number[][] | null = null;
    let ghostY: number | null = null;

    if (currentPiece) {
      const pieceManager = (this.engine as any).pieceManager;
      const shape = pieceManager.getShape(currentPiece.type, currentPiece.rotation);
      if (shape) {
        pieceShape = shape;

        // Only show ghost if piece top is visible (entered the playfield at row 4+)
        if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
          ghostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
        }
      }
    }

    // Render each row (visible rows 4-23, rows 0-3 are spawn buffer zone)
    // Board coordinates: 0-23 (24 total), visible: 4-23 (20 rows)
    // Visual coordinates: 0-19 (20 rows), maps to board rows 4-23
    // Box has height 22 (2 border + 20 content rows)
    for (let y = 4; y < 24; y++) {
      // Add newline before rows (except first) to avoid trailing newline
      if (y > 4) content += '\n';

      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        let char = '  ';  // Empty cell (2 chars)

        // Check if current piece occupies this cell
        if (currentPiece && pieceShape) {
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px]) {
            // Render bone blocks differently (invisible/faded)
            if (currentPiece.invisible) {
              char = '{black-fg}░░{/black-fg}';  // Bone block (faint)
            } else {
              char = this.getBlockChar(currentPiece.type);  // Normal block
            }
          }
        }

        // Check if ghost piece occupies this cell
        if (ghostY !== null && currentPiece && pieceShape && char === '  ') {
          const px = x - currentPiece.x;
          const py = y - ghostY;
          if (py >= 0 && py < pieceShape.length &&
              px >= 0 && px < pieceShape[py].length &&
              pieceShape[py][px]) {
            // Ghost is always grayscale, no colored blocks
            char = '{gray-fg}░░{/gray-fg}';
          }
        }

        // Check if locked cell
        if (char === '  ' && cell.filled) {
          // Check for shine effect (sweeping glare)
          if (this.hasShineEffect(x, y)) {
            char = '{white-bg}{white-fg}██{/white-fg}{/white-bg}';  // Bright white shine
          } else if (state.creditRollActive && cell.lockTime) {
            // Apply credit roll fade
            const age = Date.now() - cell.lockTime;
            const opacity = this.getCreditRollOpacity(age);

            if (opacity > 0.7) {
              char = this.getBlockChar(cell.color as PieceType);  // Full brightness
            } else if (opacity > 0.4) {
              char = this.getFadedBlockChar(cell.color as PieceType, 'medium');
            } else if (opacity > 0.2) {
              char = this.getFadedBlockChar(cell.color as PieceType, 'faint');
            } else {
              char = '{black-fg}░░{/black-fg}';  // Nearly invisible
            }
          } else {
            // Normal rendering
            char = this.getBlockChar(cell.color as PieceType);
          }
        }

        content += char;
      }
    }

    this.boardBox.setContent(content);
  }

  /**
   * Render next queue
   */
  private renderNext(queue: PieceType[]): void {
    let content = '\n';

    for (let i = 0; i < Math.min(3, queue.length); i++) {
      const piece = queue[i];
      const mini = this.getMiniPiece(piece);
      content += mini + '\n';
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

    const mini = this.getMiniPiece(piece);
    this.holdBox.setContent('\n' + mini);
  }

  /**
   * Get ANSI block character for piece type
   */
  private getBlockChar(type: PieceType): string {
    const colors: Record<PieceType, string> = {
      I: '{cyan-fg}██{/cyan-fg}',
      O: '{yellow-fg}██{/yellow-fg}',
      T: '{magenta-fg}██{/magenta-fg}',
      S: '{green-fg}██{/green-fg}',
      Z: '{red-fg}██{/red-fg}',
      J: '{blue-fg}██{/blue-fg}',
      L: '{white-fg}██{/white-fg}',
    };
    return colors[type] || '  ';
  }

  /**
   * Calculate credit roll opacity based on block age
   * Exponential decay: opacity = e^(-age/5000)
   * Half-life = 5 seconds
   */
  private getCreditRollOpacity(age: number): number {
    const HALF_LIFE = 5000;  // 5 seconds in milliseconds
    return Math.exp(-age / HALF_LIFE);
  }

  /**
   * Get color for piece type (used by ghost gradient)
   */
  private getPieceGlowColor(type: PieceType): string {
    const colors: Record<PieceType, string> = {
      I: 'cyan', O: 'yellow', T: 'magenta', S: 'green', Z: 'red', J: 'blue', L: 'white'
    };
    return colors[type];
  }

  /**
   * Get faded block character for credit roll
   */
  private getFadedBlockChar(type: PieceType, intensity: 'medium' | 'faint'): string {
    const colors: Record<PieceType, string> = {
      I: 'cyan',
      O: 'yellow',
      T: 'magenta',
      S: 'green',
      Z: 'red',
      J: 'blue',
      L: 'white',
    };

    const color = colors[type] || 'white';

    if (intensity === 'medium') {
      return `{${color}-fg}▒▒{/${color}-fg}`;  // Medium fade
    } else {
      return `{${color}-fg}░░{/${color}-fg}`;  // Faint
    }
  }

  /**
   * Get mini piece preview
   */
  private getMiniPiece(type: PieceType): string {
    const block = this.getBlockChar(type);
    const patterns: Record<PieceType, string> = {
      I: `  ${block}${block}${block}${block}`,
      O: `  ${block}${block}\n  ${block}${block}`,
      T: `   ${block}\n  ${block}${block}${block}`,
      S: `   ${block}${block}\n  ${block}${block}`,
      Z: `  ${block}${block}\n   ${block}${block}`,
      J: `  ${block}\n  ${block}${block}${block}`,
      L: `     ${block}\n  ${block}${block}${block}`,
    };
    return patterns[type] || '';
  }

  /**
   * Show pause menu
   */
  private showPauseMenu(): void {
    const pauseBox = createBox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 30,
      height: 8,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'yellow' } },
      align: 'center',
      content: '\n{bold}PAUSED{/bold}\n\nPress ESC to resume\nPress Q to quit',
    });

    this.screen.render();

    const resumeHandler = () => {
      this.screen.removeListener('keypress', resumeHandler);
      pauseBox.destroy();
      this.engine.resume();
      this.screen.render();
    };

    this.screen.on('keypress', (ch: string | undefined, key: any) => {
      if (key.name === 'escape') {
        resumeHandler();
      } else if (key.name === 'q' || key.name === 'Q') {
        this.running = false;
        resumeHandler();
      }
    });
  }

  /**
   * Show game over screen
   */
  private async showGameOver(): Promise<void> {
    const result = this.engine.getResult();

    // Check for GMM completion
    let gameOverTitle = '{bold}{red-fg}GAME OVER{/red-fg}{/bold}';
    let gameOverColor = 'red';

    if (result.grade === 'GMM' || result.grade === 'GM') {
      gameOverTitle = result.grade === 'GMM'
        ? '{bold}{yellow-fg}GRAND MASTER MARU!{/yellow-fg}{/bold}'
        : '{bold}{yellow-fg}GRAND MASTER!{/yellow-fg}{/bold}';
      gameOverColor = 'yellow';
      this.sounds.playVoice('bravo');  // Victory voice
    }

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
    });

    this.screen.render();
    this.sounds.playSfx('game_over');
    this.sounds.playMusic('game_over', false);  // Play game over music (no loop)

    await this.waitForKey();
    gameOverBox.destroy();
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

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.input.reset();
    this.sounds.stopMusic();
    this.boardBox?.destroy();
    this.nextBox?.destroy();
    this.holdBox?.destroy();
    this.statsBox?.destroy();
    this.gradeBox?.destroy();
  }
}
