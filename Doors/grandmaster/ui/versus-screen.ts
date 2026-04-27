/**
 * Versus Screen
 *
 * Multiplayer game screen with opponent board, garbage strip, hold box,
 * and full visual-effect parity with game-screen.ts.
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState, PieceType } from '../core/types';
import { MinimapRenderer, OpponentTracker } from './minimap';
import type { GrandmasterNetworkManager, GameUpdate } from '../network/network-manager';
import type { AttackManager } from '../network/attack-system';
import { BotPlayer } from '../ai/bot-player';
import { getGhostY } from '../core/board';
import { ScreenShaker } from '../effects/screen-shake';
import { ParticleSystem } from '../effects/particles';
import { AnimationManager, AnimationRenderer } from '../effects/animations';
import { BlockGlowManager } from '../effects/block-glow';
import { LineClearAnimationManager } from '../effects/line-clear-animation';

/**
 * Versus Screen
 *
 * Extends game screen with multiplayer features (online or CPU battle).
 * Full visual-effect parity with GameScreen (particles, shake, board overlay,
 * lock flash, grade-up, combo, section COOL/REGRET, hold piece).
 */
export class VersusScreen {
  private screen: Screen;
  private engine: GameEngine;
  private inputHandler: InputHandler;
  private sounds: SoundEngine;
  private state: AppState;
  private network: GrandmasterNetworkManager | null;
  private attackManager: AttackManager;
  private minimapRenderer: MinimapRenderer;
  private opponentTracker: OpponentTracker;
  private botPlayer: BotPlayer | null = null;
  private versusAI: any | null = null;  // VersusAI controller for CPU Battle mode

  // UI Elements
  // Col  0-21 : player board      (22w, 22h, top=1)
  // Col 22-35 : NEXT (14w, 12h)  + HOLD (14w, 8h, top=13)
  // Col 36-38 : garbage strip     (3w,  22h, top=1)
  // Col 39-60 : opponent board    (22w, 22h, top=1)
  // Col 61-79 : VS info panel     (19w, 22h, top=1)
  // Row 23    : stats bar         (no border)
  private boardBox: any;
  private nextBox: any;
  private holdBox: any;
  private opponentBoardBox: any;
  private opponentInfoBox: any;
  private minimapContainer: any;
  private garbageIndicator: any;
  private attackIndicator: any;
  private statsBox: any;

  // Board overlay compositor for inline effects (same as game-screen)
  private boardOverlay: (string | null)[][] = [];

  private running: boolean = false;
  private unsubscribers: Array<() => void> = [];

  // Visual effect systems
  private shaker: ScreenShaker;
  private particles: ParticleSystem;
  private animations: AnimationManager;
  private glowManager: BlockGlowManager;
  private clearAnimation: LineClearAnimationManager;

  // Track previous state for detecting changes
  private lastGrade: string = '9';
  private lastLines: number = 0;
  private lastLevel: number = 0;
  private lastSection: number = 0;
  private lastPieceExists: boolean = false;
  private lastScore: number = -1;
  private lastCombo: number = -1;
  private lastHold: any = null;
  private lastBoardHash: string = '';

  // Animation state
  private gradeAnimProgress: number = 0;
  private gradeAnimDirection: number = 1;
  private lastComboMilestone: number = 0;
  private twentyGFlashTimer: number = 0;
  private rainbowTimer: number = 0;
  private lastRainbowUpdate: number = 0;

  constructor(
    screen: Screen,
    engine: GameEngine,
    inputHandler: InputHandler,
    sounds: SoundEngine,
    state: AppState,
    network: GrandmasterNetworkManager | null,
    attackManager: AttackManager,
    botOrAI?: number | any  // number = old botDifficulty, object = VersusAI controller
  ) {
    this.screen = screen;
    this.engine = engine;
    this.inputHandler = inputHandler;
    this.sounds = sounds;
    this.state = state;
    this.network = network;
    this.attackManager = attackManager;
    this.minimapRenderer = new MinimapRenderer({ height: 18, compact: true });
    this.opponentTracker = new OpponentTracker();

    // Check if AI controller was passed (new implementation)
    if (botOrAI && typeof botOrAI === 'object') {
      this.versusAI = botOrAI;
    }
    // Legacy: Initialize bot player if difficulty provided (old single-bot mode)
    else if (typeof botOrAI === 'number') {
      this.botPlayer = new BotPlayer(botOrAI as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
    }

    // Initialize visual effect systems
    this.shaker = new ScreenShaker();
    this.particles = new ParticleSystem();
    this.animations = new AnimationManager();
    this.glowManager = new BlockGlowManager();
    this.clearAnimation = new LineClearAnimationManager();

    // Share managers with game engine
    this.engine.setAnimationManager(this.animations);
    this.engine.setGlowManager(this.glowManager);

    // Configure from settings
    this.glowManager.setEnabled(state.settings.blockGlow);
    this.glowManager.setIntensityMultiplier(state.settings.glowIntensity);
    this.clearAnimation.setEnabled(state.settings.clearStyle !== 'instant');

    this.setupUI();
    if (this.network) {
      this.setupNetworkListeners();
    }
  }

  /**
   * Setup UI layout — 80x24 terminal
   *
   * Col  0-21 : player board  (22w, 22h, top=1)
   * Col 22-35 : NEXT (14w,12h,top=1) + HOLD (14w,8h,top=13)
   * Col 36-38 : garbage strip (3w, 22h, top=1)
   * Col 39-60 : opponent board (22w, 22h, top=1)
   * Col 61-79 : VS info panel  (19w, 22h, top=1)
   * Row 23    : stats bar (no border)
   *   22 + 14 + 3 + 22 + 19 = 80 ✓
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Player board
    this.boardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 0,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'white' } },
      fixed: true,
    });

    // Player NEXT queue
    this.nextBox = createBox({
      parent: this.screen,
      top: 1,
      left: 22,
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

    // Player HOLD box
    this.holdBox = createBox({
      parent: this.screen,
      top: 13,
      left: 22,
      width: 14,
      height: 8,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'magenta' } },
      label: ' HOLD ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Garbage strip
    this.garbageIndicator = createBox({
      parent: this.screen,
      top: 1,
      left: 36,
      width: 3,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'red' } },
      content: '',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Opponent full board
    this.opponentBoardBox = createBox({
      parent: this.screen,
      top: 1,
      left: 39,
      width: 22,
      height: 22,
      border: { type: 'line' },
      style: { bg: 'black', border: { fg: 'cyan' } },
      label: ' CPU ',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // VS info panel
    this.opponentInfoBox = createBox({
      parent: this.screen,
      top: 1,
      left: 61,
      width: 19,
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } },
      label: ' VS ',
      content: '',
      fixed: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // attackIndicator is now part of opponentInfoBox content — null it out
    this.attackIndicator = null;

    // Player stats — bottom row, no border
    this.statsBox = createBox({
      parent: this.screen,
      top: 23,
      left: 0,
      width: 61,
      height: 1,
      border: 'none' as any,
      content: '',
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // minimapContainer not used in 1v1
    this.minimapContainer = null;
  }

  /**
   * Setup network event listeners
   */
  private setupNetworkListeners(): void {
    if (!this.network) return;

    const unsubUpdate = this.network.onUpdate((update: GameUpdate) => {
      this.opponentTracker.updateOpponent(update.playerId, {
        id: update.playerId,
        board: update.board,
        level: update.level,
        grade: update.grade,
        alive: true,
      });
    });
    this.unsubscribers.push(unsubUpdate);

    this.attackManager.onGarbageReceivedCallback((_lines: number, _sender: string) => {
      this.sounds.playSfx('garbage');
      this.shaker.shake('garbageReceive');
    });

    this.attackManager.onAttackSentCallback((_lines: number, _type: string) => {
      this.sounds.playSfx('attack');
    });
  }

  /**
   * Run game loop
   */
  async run(): Promise<void> {
    this.running = true;

    this.setupInput();
    await this.showCountdown();
    this.engine.start();

    return new Promise((resolve) => {
      let lastTime = Date.now();
      const updateInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(updateInterval);
          resolve();
          return;
        }

        const now = Date.now();
        const deltaTime = now - lastTime;
        lastTime = now;

        // Update player game
        this.engine.update(deltaTime);
        this.inputHandler.update(deltaTime);

        // Update AI opponents (new CPU Battle mode)
        if (this.versusAI) {
          this.versusAI.update(deltaTime);

          if (now % 100 < deltaTime) {
            const opponentBoards = this.versusAI.getOpponentBoards();
            for (const opponent of opponentBoards) {
              this.opponentTracker.updateOpponent(opponent.id, {
                name: opponent.name,
                board: opponent.board,
                level: 0,
                grade: '5',
                alive: opponent.alive,
              });
            }
          }
        }
        // Legacy: Update bot AI
        else if (this.botPlayer) {
          this.botPlayer.update(deltaTime, this.engine);
        }

        // Send state to opponents (online multiplayer only)
        if (this.network && now % 100 < deltaTime) {
          this.network.sendUpdate(this.engine.getState());
        }

        // Get current state once for all subsystem updates
        const gameState = this.engine.getState();

        // Update visual effects
        this.shaker.update(deltaTime);
        this.particles.update(deltaTime);
        this.animations.update(deltaTime);
        this.glowManager.update(deltaTime);
        this.clearAnimation.update(deltaTime);
        this.updateGradeAnimation(deltaTime);

        // Update 20G flash timer
        if (gameState.gravity >= 20) {
          this.twentyGFlashTimer += deltaTime;
        } else {
          this.twentyGFlashTimer = 0;
        }

        // Check for game events and trigger effects
        this.checkGameEvents();

        // Render
        this.render();

        // Check for game over
        if (gameState.status === 'gameover' || gameState.status === 'complete') {
          this.running = false;
          clearInterval(updateInterval);
          resolve();
        }
      }, 16);  // ~60 FPS
    });
  }

  /**
   * Setup input handlers
   */
  private setupInput(): void {
    this.inputHandler.on('left', () => this.engine.move(-1));
    this.inputHandler.on('right', () => this.engine.move(1));
    this.inputHandler.on('rotate_cw', () => this.engine.rotate(1));
    this.inputHandler.on('rotate_ccw', () => this.engine.rotate(-1));
    this.inputHandler.on('soft_drop', () => this.engine.softDrop());
    this.inputHandler.on('hard_drop', () => this.engine.hardDrop());
    this.inputHandler.on('hold', () => this.engine.hold());
    this.inputHandler.on('pause', () => this.togglePause());
  }

  /**
   * Show countdown (3, 2, 1, GO!)
   */
  private async showCountdown(): Promise<void> {
    this.sounds.playSfx('ready');
    await new Promise(resolve => setTimeout(resolve, 500));

    const countdown = ['3', '2', '1', 'GO!'];
    for (let i = 0; i < countdown.length; i++) {
      const text = countdown[i];

      if (text === 'GO!') {
        this.sounds.playSfx('go');
      } else {
        this.sounds.playSfx('countdown');
      }

      const box = createBox({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 20,
        height: 5,
        content: `{yellow-fg}{bold}${text}{/bold}{/yellow-fg}`,
        focusable: false,
        mouse: false,
        clickable: false,
      });
      this.screen.render();
      await new Promise(resolve => setTimeout(resolve, 1000));
      box.destroy();
    }
  }

  /**
   * Check for game events and trigger visual effects
   * Ported directly from game-screen.ts checkGameEvents().
   */
  private checkGameEvents(): void {
    const gameState = this.engine.getState();

    // Level change
    if (gameState.level > this.lastLevel) {
      const oldSection = Math.floor(this.lastLevel / 100);
      const newSection = Math.floor(gameState.level / 100);
      if (newSection > oldSection && gameState.level < 1000) {
        this.sounds.playSfx('section_up');
      } else {
        this.sounds.playSfx('level_up');
      }
      this.lastLevel = gameState.level;
    }

    // Grade change
    if (gameState.grade !== this.lastGrade) {
      this.animations.gradeUp(this.lastGrade, gameState.grade, 40, 5);
      this.particles.spawn('gradeUp', 5, 7);
      this.shaker.shake('lineClear');
      this.sounds.playSfx('grade_up');
      this.lastGrade = gameState.grade;
    }

    // Line clear
    if (gameState.lines > this.lastLines) {
      const linesCleared = gameState.lines - this.lastLines;

      if (gameState.lastTSpin === 'full') {
        this.particles.spawn('tetris', 5, 14);
        this.shaker.shake('tetris');
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');
      } else if (gameState.lastTSpin === 'mini') {
        this.particles.spawn('lineClear', 5, 14);
        this.animations.tSpin(12, 12);
        this.sounds.playSfx('rotate');
      } else if (linesCleared === 4) {
        this.particles.spawn('tetris', 5, 14);
        this.shaker.shake('tetris');
        this.animations.lineClearFlash([], 4);
        this.sounds.playSfx('tetris');
        this.sounds.playVoice('tetris_voice');
      } else if (linesCleared === 3) {
        this.particles.spawn('lineClear', 5, 14);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('triple');
      } else if (linesCleared === 2) {
        this.particles.spawn('lineClear', 5, 14);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
        this.sounds.playVoice('double');
      } else if (linesCleared >= 1) {
        this.particles.spawn('lineClear', 5, 14);
        this.shaker.shake('lineClear');
        this.animations.lineClearFlash([], linesCleared);
        this.sounds.playSfx('line_clear');
      }

      this.lastLines = gameState.lines;
    }

    // Combo milestones
    const combo = gameState.combo;
    const milestone = Math.floor(combo / 5) * 5;
    if (combo > 0 && milestone > this.lastComboMilestone && milestone >= 5) {
      this.triggerComboAnimation(combo, milestone);
      this.lastComboMilestone = milestone;
    }
    if (combo === 0) this.lastComboMilestone = 0;

    // Recently awarded medals
    const recentMedals = this.engine.getRecentMedals();
    if (recentMedals.length > 0) {
      for (const medal of recentMedals) {
        this.triggerMedalAnimation(medal);
      }
      this.engine.clearRecentMedals();
    }

    // Section completion
    if (gameState.section > this.lastSection) {
      const result = gameState.lastSectionResult;
      if (result) {
        this.handleSectionComplete(this.lastSection, result);
      }
      this.lastSection = gameState.section;
    }

    // Piece spawn (null -> non-null)
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

    // Piece lock (non-null -> null)
    if (!gameState.currentPiece && this.lastPieceExists) {
      this.triggerLockFlash();
    }
    this.lastPieceExists = gameState.currentPiece !== null;
  }

  /**
   * Trigger medal award animation
   */
  private triggerMedalAnimation(medal: any): void {
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
      S: 'spawn_s', T: 'spawn_t', Z: 'spawn_z',
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
    if (milestone >= 10) this.particles.spawn('combo', 5, 14);
    this.animations.comboCounter(combo, milestone);

    if (milestone >= 15) {
      this.sounds.playSfx('tetris');
      this.sounds.playVoice('excellent');
    } else if (milestone >= 10) {
      this.sounds.playSfx('grade_up');
      this.sounds.playVoice('combo');
    } else if (milestone >= 5) {
      this.sounds.playVoice('combo');
    }
  }

  /**
   * Handle section completion
   */
  private handleSectionComplete(section: number, result: 'COOL' | 'REGRET' | 'NORMAL'): void {
    if (result === 'COOL') {
      this.animations.cool(section);
      this.sounds.playSfx('section_cool');
      this.sounds.playVoice('cool');
      this.particles.spawn('cool', 5, 14);
    } else if (result === 'REGRET') {
      this.animations.regret(section);
      this.sounds.playSfx('section_regret');
      this.sounds.playVoice('regret');
    }
  }

  /**
   * Update grade display pulse animation
   */
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
   * Toggle pause
   */
  private togglePause(): void {
    const gameState = this.engine.getState();
    if (gameState.status === 'playing') {
      this.engine.pause();
    } else if (gameState.status === 'paused') {
      this.engine.resume();
    }
  }

  /**
   * Render game state — all effects applied inline
   */
  private render(): void {
    const gameState = this.engine.getState();

    // Build board overlay (particles, animations, floating text, lock glow)
    if (
      this.particles.getRenderableParticles().length > 0 ||
      this.animations.getAnimations().length > 0 ||
      this.animations.getFloatingTexts().length > 0
    ) {
      this.buildBoardOverlay();
    } else {
      this.boardOverlay = [];
    }

    // Render board with shake and overlay
    const isShaking = this.shaker.isShaking();
    if (isShaking) {
      const offset = this.shaker.getOffset();
      this.boardBox.top = 1 + offset.y;
      this.boardBox.left = 0 + offset.x;
    } else {
      this.boardBox.top = 1;
      this.boardBox.left = 0;
    }
    this.renderBoard(gameState);

    // Render next queue
    this.renderNextQueue(gameState.nextQueue ?? []);

    // Render hold piece
    this.renderHold(gameState);

    // Render garbage strip
    const pending = this.attackManager.getPendingGarbage();
    this.renderGarbage(pending);

    // Render opponent board + VS info panel
    const opponents = this.opponentTracker.getAliveOpponents();
    const opp = opponents[0] ?? null;

    if (opp) {
      this.renderOpponentBoard(opp);
      (this.opponentBoardBox as any).setLabel(` ${opp.name || 'CPU'} `);
    }

    const oppName = opp?.name || 'CPU';
    const oppLevel = opp?.level ?? '-';
    const oppGrade = opp?.grade ?? '-';
    const oppAlive = opp ? opp.alive : true;
    const attackPending = this.attackManager.getPendingGarbage();

    this.opponentInfoBox.setContent(
      `{cyan-fg}${oppName}{/cyan-fg}\n\n` +
      `Level: {yellow-fg}${oppLevel}{/yellow-fg}\n` +
      `Grade: {magenta-fg}${oppGrade}{/magenta-fg}\n` +
      `Status: {${oppAlive ? 'green' : 'red'}-fg}${oppAlive ? 'ALIVE' : 'TOPPED OUT'}{/${oppAlive ? 'green' : 'red'}-fg}\n\n` +
      (attackPending > 0
        ? `{red-fg}INCOMING: ${attackPending} line${attackPending > 1 ? 's' : ''}{/red-fg}`
        : `{gray-fg}No incoming attack{/gray-fg}`)
    );

    // Stats bar
    const combo = gameState.combo;
    let comboStr = '';
    if (combo > 0) {
      const comboColor = combo >= 15 ? 'red' : combo >= 10 ? 'yellow' : combo >= 5 ? 'cyan' : 'magenta';
      comboStr = `  Combo: {${comboColor}-fg}${combo}x{/${comboColor}-fg}`;
    }
    let b2bStr = '';
    if (gameState.backToBack) {
      const b2bCount = gameState.backToBackCount ?? 1;
      b2bStr = `  {yellow-fg}B2B${b2bCount > 1 ? ` x${b2bCount}` : ''}{/yellow-fg}`;
    }

    this.statsBox.setContent(
      `Score: {yellow-fg}${gameState.score}{/yellow-fg}` +
      `  Level: {cyan-fg}${gameState.level}{/cyan-fg}` +
      `  Grade: {magenta-fg}${gameState.grade}{/magenta-fg}` +
      comboStr +
      b2bStr
    );

    this.screen.render();
  }

  /**
   * Build board overlay grid from all active effects
   * Z-order (highest priority first):
   *   1. Text announcements (gradeUp, cool/regret, combo, tSpin)
   *   2. Floating text
   *   3. Particles
   *   4. Lock glow (lowest)
   */
  private buildBoardOverlay(): void {
    // Reset overlay: 20 visible rows (y=4..23) x 10 cols
    this.boardOverlay = [];
    for (let r = 0; r < 20; r++) {
      this.boardOverlay[r] = new Array(10).fill(null);
    }

    const setCell = (boardX: number, boardY: number, content: string): void => {
      const row = boardY - 4;
      if (row >= 0 && row < 20 && boardX >= 0 && boardX < 10) {
        this.boardOverlay[row][boardX] = content;
      }
    };

    // Layer 4 (lowest): Lock glow
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

    // Layer 3: Particles
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

    // Layer 2: Floating text
    const floatingTexts = this.animations.getFloatingTexts();
    for (const text of floatingTexts) {
      if (text.mode === 'offboard' && text.x >= 0 && text.x < 10) {
        continue;
      }

      let alpha = 1.0;
      if (text.timer > 80) {
        alpha = 1.0 - ((text.timer - 80) / 20);
      }
      const color = alpha > 0.5 ? text.color : 'gray';
      const boardY = Math.floor(text.y);
      const boardX = Math.floor(text.x);

      for (let lineIdx = 0; lineIdx < text.text.length; lineIdx++) {
        const line = text.text[lineIdx];
        const textBoardY = boardY + lineIdx;
        for (let ci = 0; ci < line.length; ci++) {
          const cellX = boardX + Math.floor(ci / 2);
          const charIdx = ci % 2;
          if (charIdx === 0) {
            const c1 = line[ci] || ' ';
            const c2 = (ci + 1 < line.length) ? line[ci + 1] : ' ';
            setCell(cellX, textBoardY, `{${color}-fg}${c1}${c2}{/${color}-fg}`);
          }
        }
      }
    }

    // Layer 1 (highest): Text announcements
    const animList = this.animations.getAnimations();
    for (const anim of animList) {
      if (anim.type === 'gradeUp') {
        const rendered = AnimationRenderer.renderGradeUp(anim);
        this.overlayTextOnBoard(rendered, 7, setCell);
      } else if (anim.type === 'cool' || anim.type === 'regret') {
        const rendered = AnimationRenderer.renderSectionResult(anim);
        this.overlayTextOnBoard(rendered, 5, setCell);
      } else if (anim.type === 'comboCounter') {
        const data = anim.data as any;
        const cCombo = data.combo;
        const progress = anim.elapsed / anim.duration;
        if (progress < 0.8) {
          const color = cCombo >= 15 ? 'red' : cCombo >= 10 ? 'yellow' : 'cyan';
          const comboText = `${cCombo} COMBO!`;
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
    }
  }

  /**
   * Overlay text centered on the board at a given visible row offset
   */
  private overlayTextOnBoard(
    taggedText: string,
    visibleRow: number,
    setCell: (bx: number, by: number, content: string) => void
  ): void {
    const lines = taggedText.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const plainText = line.replace(/\{[^}]*\}/g, '');
      const boardWidth = 10;
      const textCellWidth = Math.ceil(plainText.length / 2);
      const startCell = Math.floor((boardWidth - textCellWidth) / 2);
      const boardY = 4 + visibleRow + lineIdx;

      let cellChars: string[] = [];
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '{') {
          const end = line.indexOf('}', i);
          if (end !== -1) {
            i = end;
            continue;
          }
        }
        cellChars.push(line[i]);
      }

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
   * Render game board with ghost, glow, line-clear fade, and overlay effects
   */
  private renderBoard(state: any): void {
    const { board, currentPiece } = state;
    let content = '';

    let pieceShape: number[][] | null = null;
    let ghostY: number | null = null;

    if (currentPiece) {
      const pieceManager = (this.engine as any).pieceManager;
      const shape = pieceManager?.getShape(currentPiece.type, currentPiece.rotation);
      if (shape) {
        pieceShape = shape;
        if (currentPiece.y >= 4 || currentPiece.y + shape.length - 1 >= 4) {
          const calculatedGhostY = getGhostY(board, shape, currentPiece.x, currentPiece.y);
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
        const cell = board.grid[y]?.[x];
        let char = '  ';

        // Active piece
        if (currentPiece && pieceShape) {
          const px = x - currentPiece.x;
          const py = y - currentPiece.y;
          if (
            py >= 0 && py < pieceShape.length &&
            px >= 0 && px < pieceShape[py].length &&
            pieceShape[py][px]
          ) {
            char = this.getBlockChar(currentPiece.type);
          }
        }

        // Ghost piece
        if (ghostY !== null && currentPiece && pieceShape && char === '  ') {
          const px = x - currentPiece.x;
          const py = y - ghostY;
          const ghostBlockY = ghostY + py;
          if (
            py >= 0 && py < pieceShape.length &&
            px >= 0 && px < pieceShape[py].length &&
            pieceShape[py][px] &&
            ghostBlockY >= 4 && ghostBlockY < 24 &&
            x >= 0 && x < board.width
          ) {
            char = '{gray-fg}░░{/gray-fg}';
          }
        }

        // Locked cell with effects
        if (char === '  ' && cell?.filled) {
          const clearFade = this.clearAnimation.getCellFade(x, y);

          if (clearFade >= 1.0) {
            char = '  ';
          } else {
            char = this.getBlockChar(cell.color);

            // Block glow
            const glowIntensity = this.glowManager.getGlowIntensity(x, y);
            if (glowIntensity > 0) {
              const glowColor = this.glowManager.getGlowColor(x, y);
              if (glowColor) {
                char = this.applyGlow(char, glowColor, glowIntensity);
              }
            }

            // Line clear fade
            if (clearFade > 0 && clearFade < 1.0) {
              char = LineClearAnimationManager.applyFade(char, clearFade);
            }
          }
        }

        // Board overlay (highest priority)
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
   * Render player's next piece queue
   */
  private renderNextQueue(queue: string[]): void {
    if (!this.nextBox) return;

    const SHAPES: Record<string, string[]> = {
      I: ['████████'],
      O: ['████', '████'],
      T: ['██████', ' ██  '],
      S: [' ████', '████ '],
      Z: ['████ ', ' ████'],
      J: ['██   ', '██████'],
      L: ['   ██', '██████'],
    };

    const COLORS: Record<string, string> = {
      I: 'cyan', O: 'yellow', T: 'magenta',
      S: 'green', Z: 'red', J: 'blue', L: 'white',
    };

    let content = '';
    const show = Math.min(queue.length, 5);
    for (let i = 0; i < show; i++) {
      const type = queue[i];
      const rows = SHAPES[type] ?? ['??'];
      const color = COLORS[type] ?? 'white';
      for (const row of rows) {
        content += `{${color}-fg}${row}{/${color}-fg}\n`;
      }
      if (i < show - 1) content += '\n';
    }

    this.nextBox.setContent(content);
  }

  /**
   * Render hold piece
   */
  private renderHold(state: any): void {
    if (!this.holdBox) return;

    if (!state.holdPiece) {
      this.holdBox.setContent('{gray-fg}(empty){/gray-fg}');
      return;
    }

    const SHAPES: Record<string, string[]> = {
      I: ['████████'],
      O: ['████', '████'],
      T: ['██████', ' ██  '],
      S: [' ████', '████ '],
      Z: ['████ ', ' ████'],
      J: ['██   ', '██████'],
      L: ['   ██', '██████'],
    };

    const COLORS: Record<string, string> = {
      I: 'cyan', O: 'yellow', T: 'magenta',
      S: 'green', Z: 'red', J: 'blue', L: 'white',
    };

    const type = state.holdPiece;
    const color = COLORS[type] ?? 'white';
    const canHold = state.canHold !== false;
    const rows = SHAPES[type] ?? ['??'];
    const fg = canHold ? color : 'gray';
    const content = rows.map(r => `{${fg}-fg}${r}{/${fg}-fg}`).join('\n');
    this.holdBox.setContent(content);
  }

  /**
   * Render garbage strip — stacked red blocks showing pending count
   */
  private renderGarbage(pending: number): void {
    if (!this.garbageIndicator) return;
    if (pending <= 0) {
      this.garbageIndicator.setContent('');
      return;
    }
    const capped = Math.min(pending, 18);
    const bars = '{red-fg}' + ('█\n').repeat(capped).trim() + '{/red-fg}';
    this.garbageIndicator.setContent(`{red-fg}${pending}{/red-fg}\n${bars}`);
  }

  /**
   * Render opponent board (full size)
   */
  private renderOpponentBoard(opponent: any): void {
    if (!this.opponentBoardBox || !opponent.board) return;
    const board = opponent.board;
    let content = '';
    const startY = Math.max(0, board.height - 20);
    for (let y = startY; y < board.height; y++) {
      if (y > startY) content += '\n';
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y]?.[x];
        content += cell?.filled ? this.getBlockChar(cell.color) : '  ';
      }
    }
    this.opponentBoardBox.setContent(content);
  }

  /**
   * Get colored block character for piece type
   */
  private getBlockChar(type: string): string {
    const colors: Record<string, string> = {
      I: '{cyan-fg}██{/cyan-fg}',
      O: '{yellow-fg}██{/yellow-fg}',
      T: '{magenta-fg}██{/magenta-fg}',
      S: '{green-fg}██{/green-fg}',
      Z: '{red-fg}██{/red-fg}',
      J: '{blue-fg}██{/blue-fg}',
      L: '{white-fg}██{/white-fg}',
    };
    return colors[type] || '{gray-fg}██{/gray-fg}';
  }

  /**
   * Apply glow effect to block character
   */
  private applyGlow(baseChar: string, glowColor: string, intensity: number): string {
    const brightMap: Record<string, string> = {
      red: 'lightred', green: 'lightgreen', yellow: 'lightyellow', blue: 'lightblue',
      magenta: 'lightmagenta', cyan: 'lightcyan', white: 'lightwhite', orange: 'yellow',
    };
    const brightColor = brightMap[glowColor] || glowColor;

    if (intensity > 0.7) {
      return `{${brightColor}-bg}${baseChar}{/${brightColor}-bg}`;
    } else if (intensity > 0.3) {
      return `{${glowColor}-bg}${baseChar}{/${glowColor}-bg}`;
    }
    return baseChar;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.running = false;
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}
