/**
 * Core Game Engine
 *
 * Manages game state, piece movement, scoring, and game loop
 */

import type { GameState, GameMode, PlayerSettings, Piece, PieceType, GameResult } from './types';
import { PieceManager, getPieceCells } from './pieces';
import { SectionManager } from './sections';
import { GradeManager } from './grading';
import { getSpeedParams } from './gravity';
import {
  createBoard,
  checkCollision,
  placePiece,
  getGhostY,
  getCompleteLines,
  getClearableLines,
  clearLines,
  isTopOut,
  getVisibleTop,
  isPerfectClear,
  addGarbageLines,
} from './board';
import type { AttackManager } from '../network/attack-system';
import { FinesseEvaluator } from './finesse';
import { ReplayRecorder, type Replay } from '../server/replay-manager';
import { MedalManager, type Medal } from './medals';
import { CreditRollManager, InvisiblePieceManager } from './credit-roll';
import { checkTorikan } from './time-limit';
import { devilGradeForLevel, devilFinalGrade, DEVIL_END_LEVEL } from './devil-grade';
import { SHADOW_TIMER_FRAMES, shadowDecayRate } from './hidden';
import { lockedByUpKey } from './up-key-lock';
import {
  practiceGoalReached, practiceGoalTarget,
  type PracticeGoal,
} from './practice-goal';
import type { SoundEngine } from '../audio/sounds';
import { AnimationManager } from '../effects/animations';
import { BlockGlowManager } from '../effects/block-glow';
import {
  ITEM_NAMES,
  HARD_BLOCK_ITEM,
  TGM_RUNTIME_ITEMS,
  createItemHistory,
  drawItem,
  isSelfTargetItem,
  applySelfItem,
  applyEnemyItem,
  ROLL_ROLL_PERIOD_FRAMES,
  type ItemPresetName,
  type ItemEffectResult,
} from './items';

export class GameEngine {
  private state: GameState;
  private pieceManager: PieceManager;
  private settings: PlayerSettings;
  private sectionManager: SectionManager;
  private gradeManager: GradeManager;
  private medalManager: MedalManager;  // HeborisCE medal system
  private creditRollManager: CreditRollManager;
  private invisiblePieceManager: InvisiblePieceManager;
  private attackManager?: AttackManager;  // Optional for multiplayer
  private finesseEvaluator: FinesseEvaluator;
  private recorder?: ReplayRecorder;  // Optional replay recording
  private onHardDropCallback?: () => void;
  private animations: AnimationManager;
  private glowManager: BlockGlowManager;

  // TGM item system (see core/items.ts). Disabled unless enableItems() is
  // called - every non-versus mode leaves this off, so Cell.item stays
  // undefined everywhere except TGM item versus play.
  private itemsPreset: ItemPresetName | null = null;
  private itemHistory: number[] = createItemHistory();
  /** gamestart.c:834 `item_interval = 20`. */
  private itemInterval = 20;
  /** gamestart.c:831 item_g[player] - counts up toward itemInterval. */
  private itemGauge = 0;
  /** gamestart.c:3896-3907 item_nblk[0] override (HARD BLOCK, item 25). */
  private pendingItemOverride: number | null = null;
  /**
   * Enemy-targeted item collected this lock; the caller (VersusScreen) is
   * responsible for picking a target engine and applying the effect via
   * core/items.ts's applyEnemyItem, since a single GameEngine has no
   * knowledge of any opponent. Self-targeted items are applied internally
   * and never reach this callback.
   */
  private onItemCollectedCallback?: (itemId: number) => void;

  // Stats tracking
  private tetrisCount: number = 0;
  private tSpinCount: number = 0;
  private perfectClearCount: number = 0;

  // Game loop
  private lastUpdate: number = 0;
  private frameAccumulator: number = 0;
  private readonly TARGET_FPS = 60;
  private readonly FRAME_TIME = 1000 / this.TARGET_FPS;
  /**
   * Most game frames one update() may run.
   *
   * Eight frames is 133ms - a wide allowance for a slow repaint, and far
   * short of the lock delay a stall used to be able to burn through in one
   * uninterruptible burst.
   */
  private readonly MAX_CATCHUP_FRAMES = 8;

  // Gravity accumulator for fractional gravity values
  private gravityAccumulator: number = 0;

  // Credit roll pause tracking
  private pauseTime: number | null = null;

  // Shirase garbage tracking
  private devilNextRise: number = 0;
  private readonly SHIRASE_RISE_MIN: Record<number, number> = {
    5: 25, 6: 20, 7: 10, 8: 8, 9: 5
  };
  private readonly SHIRASE_RISE_MAX: Record<number, number> = {
    5: 35, 6: 30, 7: 20, 8: 18, 9: 15
  };

  /**
   * PRACTICE goal for a training run (gamestart.c:11229-11252). null = play
   * until the stack tops out, which is all this door's training mode could do.
   */
  private practiceGoal: PracticeGoal | null = null;

  /** Frames since ROLL ROLL was collected (gamestart.c's gametime % 30). */
  private rollRollFrame = 0;

  private readonly startLevel: number;

  constructor(
    mode: GameMode,
    settings: PlayerSettings,
    private sounds: SoundEngine,
    attackManager?: AttackManager,
    startLevel: number = 0
  ) {
    this.startLevel = startLevel;
    this.settings = settings;
    // Initialize with stub managers (will be set via setters)
    this.animations = new AnimationManager();
    this.glowManager = new BlockGlowManager();
    this.pieceManager = new PieceManager(settings.rotationSystem);
    this.sectionManager = new SectionManager();
    this.gradeManager = new GradeManager();
    this.medalManager = new MedalManager();  // HeborisCE medal system
    this.creditRollManager = new CreditRollManager();
    this.invisiblePieceManager = new InvisiblePieceManager();
    this.finesseEvaluator = new FinesseEvaluator();
    this.attackManager = attackManager;
    this.state = this.createInitialState(mode);

    // gamestart.c:6994 `gameMode[player] == 4 || item_mode[player]`. Versus
    // calls enableItems() itself for the first half; this is the second,
    // and it is what makes items reachable in Master, Death, Marathon and
    // Sprint - modes where they were unreachable at any setting.
    if (settings.itemMode && settings.itemMode !== 'OFF') {
      this.enableItems(settings.itemMode);
    }
  }

  /**
   * Give a training run a finish line (gamestart.c's p_goaltype). Call
   * before start(); 'none' or a zero value leaves the run endless.
   */
  setPracticeGoal(goal: PracticeGoal | null): void {
    this.practiceGoal = goal && practiceGoalTarget(goal) !== null ? goal : null;
  }

  /** The goal this run is playing to, for the HUD. */
  getPracticeGoal(): PracticeGoal | null {
    return this.practiceGoal;
  }

  /**
   * Has the practice goal been met? Checked once per frame and once per lock,
   * because a time goal can fall due while no piece is moving.
   */
  private checkPracticeGoal(): boolean {
    if (!this.practiceGoal || this.state.status !== 'playing') return false;

    const elapsedSeconds = this.state.startTime
      ? (Date.now() - this.state.startTime) / 1000
      : 0;
    const reached = practiceGoalReached(this.practiceGoal, {
      level: this.state.level,
      lines: this.state.lines,
      pieces: this.state.piecesPlaced,
      elapsedSeconds,
    });
    if (!reached) return false;

    this.state.status = 'complete';
    this.state.endTime = Date.now();
    return true;
  }

  /**
   * Apply one item's ItemEffectResult to THIS engine.
   *
   * Board-shape effects (row deletes) and the timed ones (BIG, ROLL ROLL)
   * both land here, so the versus router and single player's own fallback
   * spend an item the same way instead of each handling a subset.
   */
  applyItemEffectResult(result: ItemEffectResult): void {
    if (result.clearRows && result.clearRows.length > 0) {
      clearLines(this.state.board, result.clearRows);
    }
    if (result.insertHardBlockNext) {
      this.insertHardBlockNext();
    }
    if (result.bigPieces) {
      this.state.bigPiecesRemaining = result.bigPieces;
    }
    if (result.rollRollPieces) {
      this.state.rollRollPiecesRemaining = result.rollRollPieces;
      this.rollRollFrame = 0;
    }
  }

  /**
   * Publish the grade for the mode being played.
   *
   * 'death' is HeborisCE's Devil family (gameMode 3) and climbs dgname by
   * level, not the TGM3 Master ladder the GradeManager scores
   * (gamestart.c:9348-9349). Every other mode keeps the Master ladder.
   */
  private refreshGrade(): void {
    if (this.state.mode === 'death') {
      this.state.grade = devilGradeForLevel(this.state.level);
      this.state.internalGrade = this.gradeManager.getInternalGrade();
      return;
    }
    this.state.grade = this.gradeManager.getGrade();
    this.state.internalGrade = this.gradeManager.getInternalGrade();
  }

  /**
   * Set animation manager (for visual effects)
   */
  setAnimationManager(animations: AnimationManager): void {
    this.animations = animations;
  }

  /**
   * Set glow manager (for block glow effects)
   */
  setGlowManager(glowManager: BlockGlowManager): void {
    this.glowManager = glowManager;
    // Configure from settings
    this.glowManager.setEnabled(this.settings.blockGlow);
    this.glowManager.setIntensityMultiplier(this.settings.glowIntensity);
  }

  /**
   * Create initial game state
   */
  private createInitialState(mode: GameMode): GameState {
    // Get initial speed parameters for starting level
    const speedParams = getSpeedParams(this.startLevel, mode);

    return {
      mode,
      board: createBoard(10, 24),
      currentPiece: null,
      holdPiece: null,
      canHold: true,
      nextQueue: this.pieceManager.fillQueue(this.settings.previewCount),

      level: this.startLevel,
      lines: 0,
      score: 0,
      grade: '9',
      combo: 0,
      backToBack: false,
      backToBackCount: 0,
      piecesPlaced: 0,
      ultraTimeRemaining: mode === 'ultra' ? 120000 : 0,
      digLinesRemaining: mode === 'dig' ? 10 : 0,
      zoneMeter: 0,
      zoneActive: false,
      zoneTimeRemaining: 0,
      zoneBufferedLines: 0,

      // T-Spin tracking (HeborisCE tspin_flag system)
      lastMove: null,
      lastTSpin: null,
      tSpinFlag: 0,
      rotationCount: 0,

      // GM condition flags
      gmFlags: { flag1: false, flag2: false, flag3: false },

      gravity: speedParams.gravity,
      lockDelay: (speedParams.lockDelay / 60) * 1000,  // Convert frames to ms
      lockDelayRemaining: (speedParams.lockDelay / 60) * 1000,
      areRemaining: speedParams.are,

      // Lock delay reset tracking (HeborisCE kickm/kickr/kickc system)
      moveResetCount: 0,
      rotationResetCount: 0,
      floorKickCount: 0,
      // world.c:425-426 skips the kick-count forced lock (bk[player]=100
      // once kickc>=kickm / kickc3>=kickr) specifically when rots==6
      // (DS-WORLD), and DS-WORLD's own kickm/kickr call parameters
      // (game/gamestart.c's rots==6 branch) are -1 - literally "no limit" -
      // outside versus play. That is HeborisCE's "infinite spin" for
      // DS-WORLD: it never gets kicked into a forced lock by move/rotation
      // count the way TI-WORLD/ACE-SRS/SRS-X do. Every other rotation
      // system here keeps the Ti-style defaults below.
      maxMoveResets: this.settings.rotationSystem === 'DS-WORLD' ? Infinity : 15,       // Ti-style defaults
      maxRotationResets: this.settings.rotationSystem === 'DS-WORLD' ? Infinity : 8,    // Ti-style: fewer rotation resets than move resets
      maxFloorKicks: 1,        // Ti-style: only 1 floor kick allowed
      lockResets: 0,           // Legacy compatibility

      pendingIRS: 0,
      pendingIHS: false,

      section: 0,
      sectionTime: 0,
      sectionLines: 0,
      internalGrade: 0,

      creditRollActive: false,
      creditRollTimeRemaining: 180000,  // 3 minutes in ms
      creditRollStartTime: null,

      status: 'ready',
      startTime: null,
      endTime: null,

      torikanExpired: false,
      torikanCheckpointLevel: null,
      itemBanner: null,
      bigPiecesRemaining: 0,
      rollRollPiecesRemaining: 0,
    };
  }

  /**
   * Enable the TGM item system for this engine (gamestart.c:6994 `gameMode
   * == 4 || item_mode[player]` gate). Call once, before start(), for TGM
   * item versus play; every other mode leaves items off.
   */
  enableItems(preset: ItemPresetName = 'TGM'): void {
    this.itemsPreset = preset;
    this.itemHistory = createItemHistory();
    this.itemGauge = 0;
    this.pendingItemOverride = null;
  }

  itemsEnabled(): boolean {
    return this.itemsPreset !== null;
  }

  /** See onItemCollectedCallback above. */
  onItemCollected(callback: (itemId: number) => void): void {
    this.onItemCollectedCallback = callback;
  }

  /**
   * Start the game
   */
  start(): void {
    this.state.status = 'playing';
    this.state.startTime = Date.now();
    this.sectionManager.reset();
    this.gradeManager.reset();  // Reset grade to 9
    this.gradeManager.setStartTime(this.state.startTime);  // Set GM flag timer
    this.medalManager.reset();  // Reset medals
    this.state.section = 0;
    this.state.sectionTime = 0;
    this.state.grade = '9';     // Initialize grade
    this.spawnPiece();
    // Dig mode: pre-fill bottom 10 rows with garbage
    if (this.state.mode === 'dig') {
      addGarbageLines(this.state.board, 10);
    }
  }

  /**
   * Spawn new piece
   */
  /**
   * Decide whether the piece about to spawn carries an item.
   * gamestart.c:6994-6996: `if((gameMode==4 || item_mode) && (item_g >
   * item_inter)) { ...draw... item_g = 0; }` else no item this spawn.
   * gamestart.c:6930 increments item_g by 1 per spawn (guarded here by
   * itemsEnabled()).
   */
  private rollItemForNextPiece(): number | null {
    if (this.pendingItemOverride !== null) {
      const id = this.pendingItemOverride;
      this.pendingItemOverride = null;
      return id;
    }
    if (!this.itemsPreset) return null;

    this.itemGauge++;
    if (this.itemGauge <= this.itemInterval) return null;

    this.itemGauge = 0;
    if (this.itemsPreset !== 'TGM') {
      // ALL/FEW/DS are implemented as pure selection data (see core/items.ts)
      // but nothing wires them into a live engine in this pass - no runtime
      // filtering to apply here.
      return drawItem(this.itemsPreset, this.itemHistory);
    }
    // Redraw past any of the six TGM items with no implemented effect (see
    // TGM_NOT_IMPLEMENTED_ITEMS in core/items.ts) so a pickup is always
    // meaningful. Bounded: TGM_RUNTIME_ITEMS is non-empty and every retry
    // still respects the reference's weighted draw + history rejection.
    let id: number;
    let guard = 0;
    do {
      id = drawItem(this.itemsPreset, this.itemHistory);
      guard++;
    } while (!TGM_RUNTIME_ITEMS.includes(id) && guard < 200);
    return id;
  }

  private spawnPiece(): void {
    const pieceType = this.state.nextQueue.shift()!;
    this.state.nextQueue.push(this.pieceManager.getRandomPiece());

    // Timed item effects are counted in PIECES, not frames or seconds
    // (gamestart.c:7092-7100 spends item_t once per piece and clears the
    // flag when it passes the item's own limit).
    const big = this.state.bigPiecesRemaining > 0;
    if (big) this.state.bigPiecesRemaining--;
    if (this.state.rollRollPiecesRemaining > 0) this.state.rollRollPiecesRemaining--;

    const spawnPos = this.pieceManager.getSpawnPosition(pieceType, this.state.board.width);

    // A BIG piece is twice as wide, so the ordinary spawn column can put its
    // right-hand cells off the board - an I piece spawning at x=3 reaches
    // column 11 of a 10-wide field. HeborisCE never meets this because its
    // own spawn columns are chosen inside a doubled coordinate space
    // (judgeBigBlock, gamestart.c:16241); here the shape is doubled instead,
    // so the spawn column is nudged back until the piece fits.
    if (big) {
      const shape = this.pieceManager.getShape(pieceType, 0, true);
      let rightmost = 0;
      for (const row of shape) {
        for (let x = 0; x < row.length; x++) if (row[x]) rightmost = Math.max(rightmost, x);
      }
      const overflow = spawnPos.x + rightmost - (this.state.board.width - 1);
      if (overflow > 0) spawnPos.x = Math.max(0, spawnPos.x - overflow);
    }

    // Determine if piece should be invisible
    let invisible = false;
    if (this.state.creditRollActive) {
      // Credit roll: ALL pieces invisible
      invisible = true;
    } else {
      // Normal play: Bone block probability
      const boneChance = this.getBoneBlockChance(this.state.grade);
      if (Math.random() < boneChance) {
        invisible = true;
      }
    }

    // Apply IRS (Initial Rotation System)
    let initialRotation: 0 | 1 | 2 | 3 = 0;
    if (this.state.pendingIRS !== 0) {
      // Apply rotation based on pending input
      if (this.state.pendingIRS > 0) {
        initialRotation = 1;  // Clockwise
      } else {
        initialRotation = 3;  // Counter-clockwise
      }
    }

    this.state.currentPiece = {
      type: pieceType,
      rotation: initialRotation,
      x: spawnPos.x,
      y: spawnPos.y,
      invisible,
      itemId: this.rollItemForNextPiece(),
      big,
    };

    this.state.canHold = true;
    this.state.lockDelayRemaining = this.state.lockDelay;
    this.state.lockResets = 0;

    // Reset lock delay counters (HeborisCE kickc system)
    this.state.moveResetCount = 0;
    this.state.rotationResetCount = 0;
    this.state.floorKickCount = 0;

    // Reset gravity accumulator for new piece
    this.gravityAccumulator = 0;

    // Reset T-Spin tracking for new piece (HeborisCE tspin_flag system)
    this.state.lastMove = null;
    this.state.lastTSpin = null;
    this.state.tSpinFlag = 0;
    this.state.rotationCount = 0;

    // Apply level stop logic: Level increases by 1 upon piece spawn
    // unless it's a level stop (xx9)
    // TGM3: Level pauses at 99, 199... 999 until piece locks
    if (this.state.level % 100 !== 99 && (this.state.mode !== 'master' || this.state.level < 999)) {
      this.state.level++;
    }

    // HeborisCE Shirase Piece-Spawn Garbage Rising
    if (this.state.mode === 'death' && this.state.level >= 500) {
      this.devilNextRise--;
      if (this.devilNextRise <= 0) {
        this.applyShiraseGarbage();
        this.resetDevilNextRise();
      }
    }

    // Check if piece can spawn (game over if not)
    const shape = this.pieceManager.getShape(pieceType, initialRotation, big);
    if (checkCollision(this.state.board, shape, spawnPos.x, spawnPos.y)) {
      this.state.status = 'gameover';
      this.state.endTime = Date.now();
      return;
    }

    // Apply IHS (Initial Hold System)
    const shouldHold = this.state.pendingIHS;

    // Reset IRS/IHS pending flags
    this.state.pendingIRS = 0;
    this.state.pendingIHS = false;

    // Execute hold if IHS was pending
    if (shouldHold && this.state.canHold) {
      this.hold();
    }
  }

  /**
   * Update game state (called every frame)
   */
  update(deltaTime: number): void {
    if (this.state.status !== 'playing') return;

    // Catch up, but only so far.
    //
    // The loop that calls this also repaints the board and polls the
    // keyboard (game-screen run()), so a slow repaint delays all three. With
    // no cap, a 500ms hitch ran thirty game frames back to back with no
    // input sampled between any of them - at 20G, where the piece is already
    // on the floor and only lock delay stands between it and the stack,
    // that is the piece locking somewhere the player never chose. Running
    // the game a few frames behind wall clock is the cheaper mistake.
    this.frameAccumulator = Math.min(
      this.frameAccumulator + deltaTime,
      this.FRAME_TIME * this.MAX_CATCHUP_FRAMES
    );

    while (this.frameAccumulator >= this.FRAME_TIME) {
      this.frameAccumulator -= this.FRAME_TIME;
      this.updateFrame();
    }
  }

  /**
   * Update single frame
   */
  private updateFrame(): void {
    // HIDDEN: spend every locked cell's shadow timer. The reference counts
    // these down in the frame handler itself (gamestart.c:4794-4803), so
    // they keep running through ARE and line-clear delays too, not only
    // while a piece is falling.
    const shadowDecay = shadowDecayRate(this.settings.hiddenMode);
    if (shadowDecay > 0) {
      for (const row of this.state.board.grid) {
        for (const cell of row) {
          if (cell.shadowFrames !== undefined && cell.shadowFrames > 0) {
            cell.shadowFrames -= shadowDecay;
          }
        }
      }
    }

    // PRACTICE: a time goal comes due whether or not a piece is falling.
    if (this.checkPracticeGoal()) return;

    if (this.state.itemBanner) {
      this.state.itemBanner.ttl--;
      if (this.state.itemBanner.ttl <= 0) this.state.itemBanner = null;
    }

    if (!this.state.currentPiece) {
      // During ARE (Appearance Delay), count down frames
      this.state.areRemaining--;
      if (this.state.areRemaining <= 0) {
        this.spawnPiece();
      }
      return;
    }

    // ROLL ROLL (item 2): the piece rotates BY ITSELF while the item lasts.
    // Every rotation module folds it straight into the rotation input -
    // `move = (BTN_B || rolling) - ...` (ars.c:78, world.c:208) - and in
    // versus and item mode the timing is `gametime % p_rollroll_timer == 0`
    // (ars.c:66-70), 30 frames (init.c:729).
    this.rollRollFrame++;
    if (this.state.rollRollPiecesRemaining > 0
        && this.rollRollFrame % ROLL_ROLL_PERIOD_FRAMES === 0) {
      this.rotate(1);
    }

    // Apply gravity
    this.applyGravity();

    // Ultra mode: count down the 2-minute time limit
    if (this.state.mode === 'ultra' && this.state.ultraTimeRemaining > 0) {
      this.state.ultraTimeRemaining -= this.FRAME_TIME;
      if (this.state.ultraTimeRemaining <= 0) {
        this.state.ultraTimeRemaining = 0;
        this.state.status = 'complete';
        this.state.endTime = Date.now();
        return;
      }
    }

    // Zone mode: tick down active zone timer
    if (this.state.mode === 'zone' && this.state.zoneActive) {
      this.state.zoneTimeRemaining -= this.FRAME_TIME;
      if (this.state.zoneTimeRemaining <= 0) {
        this.deactivateZone();
      }
    }

    // HeborisCE: update decay every frame
    this.gradeManager.updateDecay(this.state.combo, this.state.level, this.state.creditRollActive);
    this.refreshGrade();

    // Update credit roll timer
    if (this.state.creditRollActive) {
      this.creditRollManager.update(this.FRAME_TIME);
      const crState = this.creditRollManager.getState();
      this.state.creditRollTimeRemaining = crState.timeRemaining;
      
      if (!crState.active) {
        this.completeCreditRoll();
      }
    }

    // Check for credit roll trigger
    this.checkCreditRollTrigger();

    // Update lock delay if piece is grounded
    if (this.isPieceGrounded()) {
      this.state.lockDelayRemaining -= this.FRAME_TIME;
      if (this.state.lockDelayRemaining <= 0) {
        this.lockPiece();
      }
    } else {
      // Reset lock delay if not grounded
      this.state.lockDelayRemaining = this.state.lockDelay;
    }

    // Update section state from SectionManager
    this.state.section = this.sectionManager.getCurrentSection();
    this.state.sectionTime = this.sectionManager.getCurrentSectionTime() * 1000; // Convert to ms

    // Update replay recorder
    if (this.recorder) {
      this.recorder.updateFrame();
      this.recorder.recordSnapshot(this.state);
    }
  }

  /**
   * Apply gravity to current piece
   */
  private applyGravity(): void {
    if (!this.state.currentPiece) return;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);

    // Accumulate gravity (supports fractional values < 1.0)
    this.gravityAccumulator += this.state.gravity;

    // Calculate how many rows to drop
    const dropAmount = Math.floor(this.gravityAccumulator);

    if (dropAmount > 0) {
      let moved = false;
      // Move piece down by dropAmount
      for (let i = 0; i < dropAmount; i++) {
        if (!checkCollision(this.state.board, shape, piece.x, piece.y + 1)) {
          piece.y++;
          moved = true;
        } else {
          break;
        }
      }
      // Gravity-driven drop disqualifies T-spin (Apotris/Guideline rule)
      if (moved) {
        this.state.lastMove = 'drop';
        this.state.tSpinFlag = 0;
      }

      // Subtract the integer part from accumulator
      this.gravityAccumulator -= dropAmount;
    }
  }

  /**
   * Check if piece is on ground
   */
  private isPieceGrounded(): boolean {
    if (!this.state.currentPiece) return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);

    return checkCollision(this.state.board, shape, piece.x, piece.y + 1);
  }

  /**
   * Move piece left/right
   */
  move(direction: -1 | 1): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);
    const newX = piece.x + direction;

    if (!checkCollision(this.state.board, shape, newX, piece.y)) {
      piece.x = newX;
      this.state.lastMove = 'move';

      // HeborisCE behavior: horizontal movement clears T-Spin potential
      // tspin_flag[player] = 0 when piece moves horizontally
      this.state.tSpinFlag = 0;

      this.finesseEvaluator.trackMovement(piece, false);  // Track horizontal movement
      this.resetLockDelay('move');

      // Record input for replay
      if (this.recorder) {
        this.recorder.recordInput(direction < 0 ? 'move_left' : 'move_right', piece.type);
      }

      return true;
    }

    return false;
  }

  /**
   * Rotate piece.
   *
   * `direction` is normally 1 (CW) or -1 (CCW). SRS-X additionally supports 2
   * (a genuine single-step 180-degree rotation) because HeborisCE's SRS-X is
   * the only ruleset with dedicated 180-degree kick tables (world.c:118-135,
   * otherBlock180KickTable / iBlock180KickTable) -- every other rotation
   * system here has no such data and must approximate 180 as two 90-degree
   * rotations (see ui/game-screen.ts's rotate_180 handler).
   */
  rotate(direction: 1 | -1 | 2): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const newRotation = ((piece.rotation + direction + 4) % 4) as 0 | 1 | 2 | 3;
    const newShape = this.pieceManager.getShape(piece.type, newRotation, !!piece.big);

    // Try rotation with wall kicks
    const kicks = this.pieceManager.getKicks(piece.type, piece.rotation, newRotation);

    for (let kickIndex = 0; kickIndex < kicks.length; kickIndex++) {
      const [offsetX, offsetY] = kicks[kickIndex];
      const testX = piece.x + offsetX;
      const testY = piece.y + offsetY;

      if (!checkCollision(this.state.board, newShape, testX, testY)) {
        // Track if this is a floor kick (kick used while grounded)
        const wasGrounded = this.isPieceGrounded();
        const isFloorKick = wasGrounded && kickIndex > 0 && offsetY < 0;

        if (isFloorKick) {
          // Check floor kick limit (Ti-style: only 1 floor kick allowed)
          if (this.state.floorKickCount >= this.state.maxFloorKicks) {
            continue;  // Skip this kick, try next one
          }
          this.state.floorKickCount++;
        }

        piece.rotation = newRotation;
        piece.x = testX;
        piece.y = testY;
        this.state.lastMove = 'rotate';

        // HeborisCE behavior: rotation sets T-Spin flag to potential (1)
        // Only for T-piece rotations
        if (piece.type === 'T') {
          this.state.tSpinFlag = 1;
        }
        this.state.rotationCount++;

        this.finesseEvaluator.trackMovement(piece, true);  // Track rotation
        this.resetLockDelay('rotate');

        // Record input for replay
        if (this.recorder) {
          this.recorder.recordInput(direction > 0 ? 'rotate_cw' : 'rotate_ccw', piece.type);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Soft drop (faster gravity)
   */
  softDrop(): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);

    if (!checkCollision(this.state.board, shape, piece.x, piece.y + 1)) {
      piece.y++;
      this.state.score += 1;  // Soft drop points
      this.state.lastMove = 'drop';

      // Record input for replay
      if (this.recorder) {
        this.recorder.recordInput('soft_drop', piece.type);
      }

      return true;
    }

    // SRS-X: down input locks instantly once the piece is grounded
    // (world.c:440, "if((rots[player] == 7) || (heboGB[player]!=0))
    // bk[player] = 100;" - the comment there literally reads "SRS-X即接着"
    // i.e. "SRS-X instant lock"). Every other rotation system here just
    // leaves a grounded piece alone on a down-press that can't move it -
    // same as before this change - and waits out the normal lock delay.
    if (this.settings.rotationSystem === 'SRS-X') {
      if (this.recorder) {
        this.recorder.recordInput('soft_drop', piece.type);
      }
      this.lockPiece();
      return true;
    }

    return false;
  }

  /**
   * Hard drop (instant lock)
   */
  hardDrop(): void {
    if (!this.state.currentPiece || this.state.status !== 'playing') return;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);
    const ghostY = getGhostY(this.state.board, shape, piece.x, piece.y);

    const dropDistance = ghostY - piece.y;
    this.state.score += dropDistance * 2;  // Hard drop points

    piece.y = ghostY;
    this.state.lastMove = 'drop';

    // Trigger callback for visual effects (like trails)
    if (this.onHardDropCallback) {
      this.onHardDropCallback();
    }

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput('hard_drop', piece.type);
    }

    this.lockPiece();
  }

  /**
   * Sonic drop - the TGM-lineage up key: fall to the floor in one step.
   *
   * HeborisCE spends one key on this and gives ACE-ARS (rots==4) its own
   * behavior for it:
   *   - airborne, ars.c:361-389 (the T.L.S. branch): ACE-ARS sets
   *     `by[player] = bottom - 1` and then runs the lock block in the same
   *     frame - the piece drops AND locks. Every other rots takes the else
   *     branch, where the piece drops and stays live on the floor.
   *   - grounded, ars.c:331: the same key does `bk[player] += lockT`, which
   *     the `if(bk[player] > lockT)` test on the next line turns into an
   *     immediate lock. Every other rots leaves a grounded piece alone.
   *
   * Returns true when the press did something (moved the piece, locked it, or
   * both), false when it was a no-op - the same contract as softDrop().
   */
  sonicDrop(): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);
    const ghostY = getGhostY(this.state.board, shape, piece.x, piece.y);
    const dropDistance = ghostY - piece.y;
    const locksOnUp = lockedByUpKey(this.settings.rotationSystem);

    // Grounded and no lock to give: nothing happened.
    if (dropDistance <= 0 && !locksOnUp) return false;

    if (dropDistance > 0) {
      piece.y = ghostY;
      this.state.lastMove = 'drop';
      // Only the locking drop scores. A sonic drop that leaves the piece
      // live is a positioning move, and TGM pays nothing for it.
      if (locksOnUp) this.state.score += dropDistance * 2;
      if (locksOnUp && this.onHardDropCallback) this.onHardDropCallback();
    }

    if (this.recorder) {
      this.recorder.recordInput('sonic_drop', piece.type);
    }

    if (locksOnUp) this.lockPiece();

    return true;
  }

  /**
   * Hold current piece
   */
  hold(): boolean {
    if (!this.state.currentPiece || !this.state.canHold || this.state.status !== 'playing') {
      return false;
    }

    const currentType = this.state.currentPiece.type;

    if (this.state.holdPiece) {
      // Swap with held piece
      const heldType = this.state.holdPiece;
      this.state.holdPiece = currentType;

      const spawnPos = this.pieceManager.getSpawnPosition(heldType, this.state.board.width);
      // Held pieces lose bone block status when swapped back
      this.state.currentPiece = {
        type: heldType,
        rotation: 0,
        x: spawnPos.x,
        y: spawnPos.y,
        invisible: false,
      };
    } else {
      // First hold
      this.state.holdPiece = currentType;
      this.spawnPiece();
    }

    this.state.canHold = false;

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput('hold', currentType);
    }

    return true;
  }

  /**
   * Set pending IRS (Initial Rotation System) input
   * Only works during ARE (when no piece is active)
   */
  setIRS(direction: -1 | 0 | 1): boolean {
    // IRS only works when no current piece (during ARE)
    if (this.state.currentPiece !== null) {
      return false;
    }

    this.state.pendingIRS = direction;

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput(direction > 0 ? 'irs_cw' : 'irs_ccw');
    }

    return true;
  }

  /**
   * Set pending IHS (Initial Hold System) input
   * Only works during ARE (when no piece is active)
   */
  setIHS(): boolean {
    // IHS only works when no current piece (during ARE)
    if (this.state.currentPiece !== null) {
      return false;
    }

    this.state.pendingIHS = true;

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput('ihs');
    }

    return true;
  }

  /**
   * Activate Zone — requires meter >= 20%. Duration proportional to meter fill.
   * Returns true if activated, false if not enough meter or already active.
   */
  activateZone(): boolean {
    if (this.state.mode !== 'zone') return false;
    if (this.state.zoneActive) return false;
    if (this.state.zoneMeter < 0.2) return false;

    this.state.zoneActive = true;
    this.state.zoneTimeRemaining = Math.round(this.state.zoneMeter * 10000); // up to 10s
    this.state.zoneMeter = 0;
    this.state.zoneBufferedLines = 0;
    return true;
  }

  /**
   * Deactivate Zone — award buffered line bonus.
   */
  private deactivateZone(): void {
    this.state.zoneActive = false;
    this.state.zoneTimeRemaining = 0;
    const n = this.state.zoneBufferedLines;
    if (n > 0) {
      // Triangular bonus: n*(n+1)/2 * 100 * (level+1)
      const bonus = Math.floor(n * (n + 1) / 2) * 100 * (this.state.level + 1);
      this.state.score += bonus;
    }
    this.state.zoneBufferedLines = 0;
  }

  /**
   * Detect T-Spin using the 3-corner rule (HeborisCE isTSpin)
   * Returns 'full' for T-Spin, 'mini' for T-Spin Mini, or 'none'
   *
   * HeborisCE behavior:
   * - tspin_flag must be 1 (set by rotation, cleared by horizontal move)
   * - rotationCount must be > 0 (piece was rotated at least once)
   * - 3-corner check must pass
   */
  private detectTSpin(): 'full' | 'mini' | 'none' {
    const piece = this.state.currentPiece;

    // Must be a T-piece
    if (!piece || piece.type !== 'T') return 'none';

    // HeborisCE: tspin_flag must be set (rotation without subsequent horizontal move)
    // and rotationCount > 0 (statusc[player * 10 + 5] > 0 in HeborisCE)
    if (this.state.tSpinFlag === 0 || this.state.rotationCount === 0) return 'none';

    // Also check lastMove for compatibility
    if (this.state.lastMove !== 'rotate') return 'none';

    // Get the center position of the T-piece
    // T-piece center is at [1,1] in its 3x3 bounding box
    const centerX = piece.x + 1;
    const centerY = piece.y + 1;

    // Check the 4 corners around the center
    const corners = [
      { x: centerX - 1, y: centerY - 1 },  // Top-left
      { x: centerX + 1, y: centerY - 1 },  // Top-right
      { x: centerX - 1, y: centerY + 1 },  // Bottom-left
      { x: centerX + 1, y: centerY + 1 },  // Bottom-right
    ];

    // Count filled corners
    let filledCorners = 0;
    const board = this.state.board;

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      let cx = corner.x;
      let cy = corner.y;
      
      // TGM3/HeborisCE ARS: if T is up-facing (flat side down), 
      // the detection area shifts for specific corners
      if (this.settings.rotationSystem === 'ARS' && piece.rotation === 2) {
          // HeborisCE gamestart.c: if(rt == 2) tmp_y = tmp_y + 1;
          cy += 1;
      }

      // Out of bounds counts as filled
      if (cx < 0 || cx >= board.width ||
          cy < 0 || cy >= board.height) {
        filledCorners++;
        continue;
      }

      // Check if cell is filled
      if (board.grid[cy][cx].filled) {
        filledCorners++;
      }
    }

    // 3-corner rule: at least 3 corners must be filled
    if (filledCorners >= 3) {
      // Check if it's a mini T-Spin (T facing away from wall)
      // Full T-Spin: both front corners filled
      // Mini T-Spin: only back corners filled

      // Determine front corners based on rotation
      let frontCorners: typeof corners;
      switch (piece.rotation) {
        case 0: // T facing up
          frontCorners = [corners[0], corners[1]];  // Top corners
          break;
        case 1: // T facing right
          frontCorners = [corners[1], corners[3]];  // Right corners
          break;
        case 2: // T facing down
          frontCorners = [corners[2], corners[3]];  // Bottom corners
          break;
        case 3: // T facing left
          frontCorners = [corners[0], corners[2]];  // Left corners
          break;
      }

      // Count front corners filled
      let frontFilled = 0;
      for (const corner of frontCorners) {
        if (corner.x < 0 || corner.x >= board.width ||
            corner.y < 0 || corner.y >= board.height ||
            board.grid[corner.y][corner.x].filled) {
          frontFilled++;
        }
      }

      // Full T-Spin if both front corners filled, otherwise Mini
      return frontFilled >= 2 ? 'full' : 'mini';
    }

    return 'none';
  }

  /**
   * Lock piece to board
   */
  private lockPiece(): void {
    if (!this.state.currentPiece) return;

    // gamestart.c's tcbuf - the level as it stood before this lock's level-up,
    // so the torikan check below can tell a checkpoint was JUST crossed.
    const levelBeforeLock = this.state.level;

    this.state.piecesPlaced++;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation, !!piece.big);

    // Detect T-Spin before placing piece (HeborisCE: confirm tspin_flag = 2)
    const tSpin = this.detectTSpin();
    this.state.lastTSpin = tSpin;
    if (tSpin !== 'none') {
      this.state.tSpinFlag = 2;  // Confirmed T-Spin
    }

    // Place piece on board with timestamp for credit roll fade
    const lockTime = Date.now();
    this.placePieceWithTimestamp(shape, piece.x, piece.y, piece.type, lockTime);

    // TGM item: stamp every cell of the piece with its item id
    // (gamestart.c:16230 `fldi[bx2+by2*w+pl*220] = item[player]` - the whole
    // piece becomes the item, not just one cell of it).
    if (piece.itemId) {
      this.stampItemOnPiece(shape, piece.x, piece.y, piece.itemId);
    }

    // Get locked cells for visual effects
    const lockedCells = shape.map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }));

    // LOCK OUT: the board (24 rows) is taller than the rendered playfield
    // (20 rows); rows above getVisibleTop() are a spawn buffer that nothing
    // draws. The only game-over condition used to be BLOCK OUT - a new piece
    // failing to spawn - so the stack could keep growing through those
    // hidden rows and the player carried on playing in space they could not
    // see, well past the visible ceiling. A piece that comes to rest even
    // partly above the visible top now ends the game, which makes the
    // playable field exactly the field on screen.
    const visibleTop = getVisibleTop(this.state.board);
    if (lockedCells.some(c => c.y < visibleTop)) {
      this.state.status = 'gameover';
      this.state.endTime = Date.now();
      this.sounds.playSfx('game_over');
      return;
    }

    // Trigger placement effect (before particles/shake)
    const pieceColor = this.getPieceColorName(piece.type);
    if (this.settings.placementEffects) {
      this.animations.placementEffect(piece.type, lockedCells, piece.rotation, pieceColor);
    }

    // Evaluate finesse for this placement
    const hadFinesse = this.finesseEvaluator.evaluatePlacement(piece);

    // Check for line clears. A row carrying a HARD BLOCK item cell (item 25)
    // is excluded even when every cell is filled - gamestart.c:10127-10131,
    // 10148: the whole row's erase flag is cancelled. getClearableLines() is
    // a no-op outside item mode (Cell.item is never set there).
    const allCompleteLines = getCompleteLines(this.state.board);
    const clearedLines = getClearableLines(this.state.board, allCompleteLines);
    const lineCount = clearedLines.length;

    // TGM item: collect (but don't yet apply) any item riding a row that's
    // actually about to clear - gamestart.c:10127-10138.
    const collectedItemId = lineCount > 0 ? this.collectItemFromLines(clearedLines) : null;

    // TGM Level Stop Logic:
    // Level stops at xx9 (99, 199, etc.) and only advances when a piece locks.
    // If lines were cleared, level advances by lines.
    // If no lines were cleared, we ensure the level reaches the next section if it was stopped.
    if (lineCount > 0) {
      this.state.level += lineCount;
    } else {
      // If we were at xx9, move to x00
      if (this.state.level % 100 === 99) {
        this.state.level += 1;
      }
    }

    // Cap level at 999 for Master mode (unless in credit roll)
    if (this.state.mode === 'master' && this.state.level > 999 && !this.state.creditRollActive) {
      this.state.level = 999;
    }

    // Torikan: gamestart.c calls checkEnding(player, tcbuf) right here, once
    // per lock, immediately after tc[player] (our state.level) is finalized
    // for this piece. Missing the mode's qualifying deadline at the instant
    // the level crosses 500 (or, in 'death', 1000) forces the run to end at
    // that checkpoint instead of continuing. See core/time-limit.ts.
    if (this.state.startTime !== null) {
      const gametimeFrames = ((Date.now() - this.state.startTime) / 1000) * 60;
      const torikan = checkTorikan({
        mode: this.state.mode,
        levelBefore: levelBeforeLock,
        levelAfter: this.state.level,
        gametimeFrames,
        rotationSystem: this.settings.rotationSystem,
      });
      if (torikan.expired) {
        this.state.level = torikan.checkpointLevel!;
        this.state.torikanExpired = true;
        this.state.torikanCheckpointLevel = torikan.checkpointLevel;
        this.state.status = 'complete';
        this.state.endTime = Date.now();
        return;
      }

      // "DEVILなら1300で終了させる" (gamestart.c:11108-11122). The run stops
      // at 1300 and keeps GOD if it got there inside the window for its
      // rotation family, S13 otherwise. Before this, 'death' ran on past
      // 1300 with no ending and no top rank to reach at all.
      if (this.state.mode === 'death' && this.state.level >= DEVIL_END_LEVEL) {
        this.state.level = DEVIL_END_LEVEL;
        this.state.grade = devilFinalGrade(gametimeFrames, this.settings.rotationSystem);
        this.state.status = 'complete';
        this.state.endTime = Date.now();
        return;
      }
    }

    const newSection = Math.floor(this.state.level / 100);

    if (lineCount > 0) {
      // Trigger line clear glow
      const clearType = tSpin !== 'none' ? 'tspin' : (lineCount === 4 ? 'tetris' : 'normal');
      const centerX = lockedCells.reduce((sum, cell) => sum + cell.x, 0) / lockedCells.length;
      const centerY = lockedCells.reduce((sum, cell) => sum + cell.y, 0) / lockedCells.length;
      this.glowManager.addLineClearGlow(clearedLines, clearType, centerX, centerY);

      // Trigger lock glow with radial patterns for combos/T-spins
      const isCombo = this.state.combo > 0;
      const isTSpin = tSpin !== 'none';
      this.glowManager.addLockGlow(lockedCells, isCombo, isTSpin);

      // Clear lines
      clearLines(this.state.board, clearedLines);

      // TGM item: apply the collected item's effect now that the normal
      // clear has resolved (gamestart.c:10380-10383, end of the erase loop).
      if (collectedItemId !== null) {
        this.processCollectedItem(collectedItemId);
      }

      // Dig mode: track remaining garbage lines
      if (this.state.mode === 'dig' && this.state.digLinesRemaining > 0) {
        this.state.digLinesRemaining = Math.max(0, this.state.digLinesRemaining - lineCount);
        if (this.state.digLinesRemaining === 0) {
          this.state.status = 'complete';
          this.state.endTime = Date.now();
        }
      }

      // Record lines for credit roll qualification
      if (this.state.creditRollActive) {
        this.creditRollManager.addLines(lineCount);
      }

      // Update stats
      this.state.lines += lineCount;
      this.state.combo++;

      // Update speed parameters based on new level
      const speedParams = getSpeedParams(this.state.level, this.state.mode);
      this.state.gravity = speedParams.gravity;
      this.state.lockDelay = (speedParams.lockDelay / 60) * 1000;  // Convert frames to ms

      // Scoring
      let baseScore = this.calculateLineScore(lineCount);

      // T-Spin scoring bonuses
      if (tSpin === 'full') {
        // T-Spin bonuses (standard scoring)
        if (lineCount === 1) baseScore = 800;    // T-Spin Single
        else if (lineCount === 2) baseScore = 1200;  // T-Spin Double
        else if (lineCount === 3) baseScore = 1600;  // T-Spin Triple
      } else if (tSpin === 'mini') {
        // T-Spin Mini bonuses
        if (lineCount === 1) baseScore = 200;    // T-Spin Mini Single
        else if (lineCount === 2) baseScore = 400;   // T-Spin Mini Double
      }

      // Back-to-back bonus (T-Spins and Tetrises)
      const isBackToBackAction = tSpin !== 'none' || lineCount === 4;
      if (isBackToBackAction && this.state.backToBack) {
        baseScore = Math.floor(baseScore * 1.5);  // 50% bonus
        // Increment B2B chain
        this.state.backToBackCount++;

        // Trigger B2B glow animation
        if (this.settings.b2bGlowEnabled) {
          const b2bType = lineCount === 4 ? 'tetris' : 'tspin';
          this.animations.backToBackGlow(lockedCells, this.state.backToBackCount, b2bType);
          this.glowManager.addBackToBackGlow(lockedCells);
        }
      } else if (isBackToBackAction) {
        // Start new B2B chain
        this.state.backToBackCount = 1;
      } else if (lineCount > 0) {
        // Break B2B chain (single/double/triple without T-spin)
        this.state.backToBackCount = 0;
      }
      this.state.backToBack = isBackToBackAction;

      this.state.score += baseScore * (this.state.level + 1);

      // Track stats
      if (lineCount === 4) {
        this.tetrisCount++;
      }
      if (tSpin !== 'none') {
        this.tSpinCount++;
      }

      // Trigger floating text for clear types
      let clearMessage = '';
      let clearColor = 'white';

      if (tSpin === 'full') {
        if (lineCount === 3) {
          clearMessage = 'T-SPIN TRIPLE';
          clearColor = 'magenta';
        } else if (lineCount === 2) {
          clearMessage = 'T-SPIN DOUBLE';
          clearColor = 'magenta';
        } else if (lineCount === 1) {
          clearMessage = 'T-SPIN SINGLE';
          clearColor = 'magenta';
        }
      } else if (tSpin === 'mini') {
        if (lineCount === 2) {
          clearMessage = 'T-SPIN MINI DOUBLE';
          clearColor = 'cyan';
        } else if (lineCount === 1) {
          clearMessage = 'T-SPIN MINI';
          clearColor = 'cyan';
        }
      } else if (lineCount === 4) {
        clearMessage = 'QUAD';
        clearColor = 'yellow';
      }

      if (clearMessage) {
        const avgY = clearedLines.reduce((sum, y) => sum + y, 0) / clearedLines.length;
        this.animations.floatingText(clearMessage, centerX, avgY, clearColor, this.settings.floatTextMode);
      }

      // Check for perfect clear
      const perfectClear = isPerfectClear(this.state.board);
      if (perfectClear) {
        this.state.score += 10000 * (this.state.level + 1);
        this.perfectClearCount++;
        // Award AC medal
        this.medalManager.checkPerfectClear(this.state.level);
        // Trigger floating text
        this.animations.floatingText('PERFECT CLEAR', 5, 12, 'cyan', this.settings.floatTextMode);
      }

      // Trigger combo milestone floating text
      const combo = this.state.combo;
      if (combo === 5 || combo === 10 || (combo >= 15 && combo % 5 === 0)) {
        this.animations.floatingText(`${combo} COMBO!`, 5, 12, 'yellow', this.settings.floatTextMode);
      }

      // Award SK medal (Skill - Tetrises and T-Spins)
      this.medalManager.checkSkill(lineCount, tSpin !== 'none', this.state.level);

      // Award CO medal (Combo)
      this.medalManager.checkCombo(this.state.combo, this.state.level);

      // Process attack (multiplayer)
      if (this.attackManager) {
        this.attackManager.processLineClear(
          lineCount,
          tSpin,
          this.state.combo,
          this.state.backToBack,
          perfectClear
        );
      }

      // Award grade points for line clear
      this.gradeManager.awardPoints(lineCount, this.state.combo, this.state.level, isTSpin);
      this.refreshGrade();

      // Sync GM flags from grade manager
      this.state.gmFlags = this.gradeManager.getGMFlags();

      // Track section completion
      const sectionResult = this.sectionManager.update(this.state.level, lineCount);
      if (sectionResult !== null) {
        // Section just completed!
        this.state.lastSectionResult = sectionResult;
        
        // Award ST medal (Section Time)
        this.medalManager.checkSectionTime(sectionResult, this.state.level);

        // HeborisCE/TGM3: Process evaluation (COOL!!/REGRET)
        // This can trigger Grade Skips and speed increases
        this.gradeManager.processSectionResult(sectionResult, this.state.level);
        this.state.grade = this.gradeManager.getGrade();
        this.state.internalGrade = this.gradeManager.getInternalGrade();
      }

      // Zone mode: fill meter on line clears
      if (this.state.mode === 'zone') {
        this.state.zoneMeter = Math.min(1.0, this.state.zoneMeter + lineCount * 0.08);
        if (this.state.zoneActive) {
          // Buffer lines cleared during zone (don't double-count for score)
          this.state.zoneBufferedLines += lineCount;
        }
      }
    } else {
      // No lines cleared, reset combo
      this.state.combo = 0;
    }

    // Apply grade decay (handled per-frame now)
    // this.gradeManager.applyDecay(this.state.level); // Removed legacy call
    this.refreshGrade();

    // HeborisCE Shirase Garbage Rising
    if (this.state.mode === 'death' && this.state.level >= 500) {
      this.devilNextRise--;
      if (this.devilNextRise <= 0) {
        this.applyShiraseGarbage();
        this.resetDevilNextRise();
      }
    }

    // Apply incoming garbage (multiplayer)
    if (this.attackManager) {
      this.attackManager.applyGarbage(this.state.board);
    }

    // Reset ARE delay for next piece
    const speedParams = getSpeedParams(this.state.level, this.state.mode);
    this.state.areRemaining = speedParams.are;
    this.state.gravity = speedParams.gravity;
    this.state.lockDelay = (speedParams.lockDelay / 60) * 1000;

    // Spawn next piece (will happen after ARE delay)
    this.state.currentPiece = null;
  }

  /**
   * Calculate score for line clear
   */
  private calculateLineScore(lines: number): number {
    const SCORES = [0, 100, 300, 500, 800];  // 0, single, double, triple, tetris
    return SCORES[lines] || 0;
  }

  /**
   * Reset lock delay (when piece moves/rotates)
   * HeborisCE tracks move and rotation resets separately
   */
  private resetLockDelay(type: 'move' | 'rotate'): void {
    // Only reset if piece is grounded
    if (!this.isPieceGrounded()) {
      return;
    }

    if (type === 'move') {
      // Check move reset limit (kickc vs kickm)
      if (this.state.moveResetCount < this.state.maxMoveResets) {
        this.state.lockDelayRemaining = this.state.lockDelay;
        this.state.moveResetCount++;
        this.state.lockResets++;  // Legacy counter
      }
      // If move limit exceeded, piece locks immediately (bk[player] = 100 in HeborisCE)
    } else if (type === 'rotate') {
      // Check rotation reset limit (kickc3 vs kickr)
      if (this.state.rotationResetCount < this.state.maxRotationResets) {
        this.state.lockDelayRemaining = this.state.lockDelay;
        this.state.rotationResetCount++;
        this.state.lockResets++;  // Legacy counter
      }
      // If rotation limit exceeded, piece locks immediately
    }
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Get current medal state (HeborisCE medal system)
   */
  getMedals() {
    return this.medalManager.getMedals();
  }

  /**
   * Get recently awarded medals for display
   */
  getRecentMedals(): Medal[] {
    return this.medalManager.getRecentMedals();
  }

  /**
   * Clear recent medals after displaying
   */
  clearRecentMedals(): void {
    this.medalManager.clearRecentMedals();
  }

  /**
   * Reset the Shirase garbage counter
   */
  private resetDevilNextRise(): void {
    const section = Math.floor(this.state.level / 100);
    const min = this.SHIRASE_RISE_MIN[section] || 0;
    const max = this.SHIRASE_RISE_MAX[section] || 0;
    
    if (min > 0 && max > 0) {
      this.devilNextRise = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      this.devilNextRise = 0;
    }
  }

  /**
   * Apply a line of garbage for Shirase mode
   */
  private applyShiraseGarbage(): void {
    const board = this.state.board;
    const holePosition = Math.floor(Math.random() * board.width);
    
    // Shift board up
    for (let y = 0; y < board.height - 1; y++) {
      board.grid[y] = board.grid[y + 1];
    }
    
    // Add new garbage line
    board.grid[board.height - 1] = Array(board.width).fill(0).map((_, x) => ({
      filled: x !== holePosition,
      color: null,
      locked: true,
    }));
    
    this.sounds.playSfx('garbage');
  }

  /**
   * Get total finesse errors accumulated so far
   */
  getFinesseErrors(): number {
    return this.finesseEvaluator.getStats().finesseErrors;
  }

  /**
   * Get game result
   */
  getResult(): GameResult {
    const time = this.state.endTime && this.state.startTime
      ? this.state.endTime - this.state.startTime
      : null;

    const finesseStats = this.finesseEvaluator.getStats();

    return {
      mode: this.state.mode,
      score: this.state.score,
      level: this.state.level,
      lines: this.state.lines,
      linesCleared: this.state.lines,
      grade: this.state.grade,
      time,
      combo: this.state.combo,
      tetrisCount: this.tetrisCount,
      tSpinCount: this.tSpinCount,
      perfectClears: this.perfectClearCount,
      completed: this.state.status === 'complete',
      finesseRate: 1 - finesseStats.errorRate,
      finesseErrors: finesseStats.finesseErrors,
    };
  }

  /**
   * Get bone block probability for current grade
   */
  private getBoneBlockChance(grade: string): number {
    // No bone blocks before S13
    if (!this.gradeManager.isGradeAtLeast('S13')) {
      return 0;
    }

    // Grade tier probabilities
    const BONE_PROBABILITIES: Record<string, number> = {
      'S13': 0.20,
      'm1': 0.30, 'm2': 0.30, 'm3': 0.30,
      'm4': 0.40, 'm5': 0.40, 'm6': 0.40,
      'm7': 0.50, 'm8': 0.50, 'm9': 0.50,
      'M': 0.60, 'MK': 0.60,
      'MV': 0.70, 'MO': 0.70,
      'GM': 0.80,
    };

    return BONE_PROBABILITIES[grade] || 0;
  }

  /**
   * Check if M grade reached and trigger credit roll
   */
  private checkCreditRollTrigger(): void {
    // Only trigger once
    if (this.state.creditRollActive) return;

    // Check if grade qualifies for M rank
    if (this.gradeManager.isQualifiedForM()) {
      this.startCreditRoll();
    }
  }

  /**
   * Start credit roll mode
   */
  private startCreditRoll(): void {
    this.state.creditRollActive = true;
    this.creditRollManager.start(this.state.level);
    const crState = this.creditRollManager.getState();
    this.state.creditRollStartTime = crState.startTime;
    this.state.creditRollTimeRemaining = crState.timeRemaining;
  }

  /**
   * Complete credit roll and award rank based on qualification
   */
  private completeCreditRoll(): void {
    if (this.creditRollManager.isQualified()) {
      this.state.grade = 'GM';  // Qualified for Grand Master
    } else {
      this.state.grade = 'M';   // Failed invisible challenge, stay at Master
    }
    
    this.state.status = 'complete';
    this.state.endTime = Date.now();
    this.state.creditRollActive = false;
  }

  /**
   * Place piece with lock timestamp for credit roll fade
   */
  private placePieceWithTimestamp(
    shape: number[][],
    x: number,
    y: number,
    pieceType: PieceType,
    lockTime: number
  ): void {
    const board = this.state.board;

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const boardX = x + col;
          const boardY = y + row;

          if (boardY >= 0 && boardY < board.height) {
            board.grid[boardY][boardX] = {
              filled: true,
              color: pieceType,
              locked: true,
              lockTime,
              // HIDDEN: the cell starts its shadow timer the moment it locks
              // (gamestart.c:16224-16225).
              shadowFrames: shadowDecayRate(this.settings.hiddenMode) > 0
                ? SHADOW_TIMER_FRAMES
                : undefined,
            };
          }
        }
      }
    }
  }

  /**
   * Stamp an item id onto every cell of a just-locked piece.
   * gamestart.c:16230/16317: `fldi[bx2+by2*w+pl*220] = item[player]` inside
   * the same 4-cell loop that locks the piece into fld[] - the whole piece
   * carries the item, not one cell of it.
   */
  private stampItemOnPiece(shape: number[][], x: number, y: number, itemId: number): void {
    const board = this.state.board;
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (!shape[row][col]) continue;
        const boardX = x + col;
        const boardY = y + row;
        if (boardY >= 0 && boardY < board.height && board.grid[boardY]?.[boardX]) {
          board.grid[boardY][boardX].item = itemId;
        }
      }
    }
  }

  /**
   * Scan a set of about-to-clear rows for a collectible item, matching
   * gamestart.c:10127-10138: for each cleared row, ascending column, the
   * LAST item cell found wins (item_waiting is overwritten each hit); across
   * multiple simultaneously-cleared rows the loop runs row-ascending too, so
   * the bottom-most cleared row's item wins ties. Hard block cells never
   * reach here since getClearableLines() already excluded their whole row
   * (see core/board.ts) - a simplification of an edge case in the reference
   * where a hard block elsewhere in an otherwise-cancelled row could still
   * leave an item_waiting write before the row-level cancellation landed.
   */
  private collectItemFromLines(rows: number[]): number | null {
    let found: number | null = null;
    for (const y of [...rows].sort((a, b) => a - b)) {
      const row = this.state.board.grid[y];
      for (let x = 0; x < row.length; x++) {
        const item = row[x].item;
        if (item && item !== HARD_BLOCK_ITEM) {
          found = item;
        }
      }
    }
    return found;
  }

  /**
   * Apply a collected item's effect and show the HUD banner.
   * gamestart.c:10383 `eraseItem(player, item_waiting[player]);` and
   * gamestart.c:13451-13454 target selection (self-targeted "support"
   * items vs. enemy-targeted "attack" items - see SELF_TARGET_ITEMS).
   */
  private processCollectedItem(itemId: number): void {
    this.state.itemBanner = { name: ITEM_NAMES[itemId] ?? `ITEM ${itemId}`, ttl: 90 };

    if (isSelfTargetItem(itemId)) {
      const result = applySelfItem(itemId, this.state.board);
      if (result.clearRows && result.clearRows.length > 0) {
        clearLines(this.state.board, result.clearRows);
      }
      return;
    }

    // Enemy-targeted (attack) item - HARD (25) and EXCHG (24) included.
    // GameEngine has no notion of an opponent; the caller (VersusScreen)
    // resolves a target engine and applies core/items.ts's applyEnemyItem.
    if (this.onItemCollectedCallback) {
      this.onItemCollectedCallback(itemId);
      return;
    }

    // Nobody is listening, which is single player: the reference's own
    // fallback applies the attack to the collector (gamestart.c:14358-14365,
    // "enemy = 1 - player", falling back to "enemy = player"). Without this
    // an item outside versus was collected, named on the HUD, and then did
    // nothing at all.
    this.applyItemEffectResult(applyEnemyItem(itemId, this.state.board, this.state.board));
  }

  /**
   * Force the next spawned piece to carry a specific item id, bypassing the
   * normal gauge/draw (gamestart.c:3896-3907 item_nblk[0] override). Used
   * by insertHardBlockNext() and by tests that need a deterministic item
   * without waiting out the 20-piece gauge.
   */
  setPendingItem(itemId: number): void {
    this.pendingItemOverride = itemId;
  }

  /**
   * Insert a HARD BLOCK (item 25) into this engine's very next piece.
   * gamestart.c:13600-13603 `item_nblk[0+enemy*6] = fldihardno;` - called by
   * the caller-side item-effect resolution when this engine is an item's
   * target.
   */
  insertHardBlockNext(): void {
    this.setPendingItem(HARD_BLOCK_ITEM);
  }

  /** Board accessor for cross-engine item effects (mirror/exchg/laser/etc). */
  getBoard(): GameState['board'] {
    return this.state.board;
  }

  /**
   * Pause game
   */
  pause(): void {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      // Store pause time for credit roll timer preservation
      if (this.state.creditRollActive) {
        this.pauseTime = Date.now();
      }
    }
  }

  /**
   * Resume game
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'playing';
      // Adjust credit roll timer for pause duration (no penalty)
      if (this.state.creditRollActive && this.pauseTime) {
        const pauseDuration = Date.now() - this.pauseTime;
        this.state.creditRollTimeRemaining += pauseDuration;
        this.pauseTime = null;
      }
    }
  }

  /**
   * Start replay recording
   */
  startRecording(userId: string, username: string, seed?: number): void {
    this.recorder = new ReplayRecorder(userId, username, this.state.mode, seed);
  }

  /**
   * Stop and finalize replay recording
   */
  finalizeRecording(): Replay | null {
    if (!this.recorder) return null;
    return this.recorder.finalize(this.state);
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recorder !== undefined;
  }

  /**
   * Set callback for hard drop event
   */
  onHardDrop(callback: () => void): void {
    this.onHardDropCallback = callback;
  }

  /**
   * Get color name for piece type (for visual effects)
   */
  private getPieceColorName(type: PieceType): string {
    const colorMap: Record<PieceType, string> = {
      'I': 'cyan',
      'O': 'yellow',
      'T': 'magenta',
      'S': 'green',
      'Z': 'red',
      'J': 'blue',
      'L': 'white'
    };
    return colorMap[type];
  }
}
