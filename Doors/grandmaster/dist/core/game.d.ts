/**
 * Core Game Engine
 *
 * Manages game state, piece movement, scoring, and game loop
 */
import type { GameState, GameMode, PlayerSettings, GameResult } from './types';
import type { AttackManager } from '../network/attack-system';
import { type Replay } from '../server/replay-manager';
import { type Medal } from './medals';
import type { LockEvent } from './mission-run';
import type { MissionModifiers, MissionSpeed } from './mission-types';
import { type EraserPattern } from './eraser';
import { type Stage } from './stage';
import { type PracticeGoal } from './practice-goal';
import type { SoundEngine } from '../audio/sounds';
import { AnimationManager } from '../effects/animations';
import { BlockGlowManager } from '../effects/block-glow';
import { type ItemPresetName, type ItemEffectResult } from './items';
export declare class GameEngine {
    private sounds;
    private state;
    private pieceManager;
    private settings;
    private sectionManager;
    private gradeManager;
    private medalManager;
    private creditRollManager;
    private invisiblePieceManager;
    private attackManager?;
    private finesseEvaluator;
    private recorder?;
    private onHardDropCallback?;
    private animations;
    private glowManager;
    private itemsPreset;
    private itemHistory;
    /** gamestart.c:834 `item_interval = 20`. */
    private itemInterval;
    /** gamestart.c:831 item_g[player] - counts up toward itemInterval. */
    private itemGauge;
    /** gamestart.c:3896-3907 item_nblk[0] override (HARD BLOCK, item 25). */
    private pendingItemOverride;
    /**
     * Enemy-targeted item collected this lock; the caller (VersusScreen) is
     * responsible for picking a target engine and applying the effect via
     * core/items.ts's applyEnemyItem, since a single GameEngine has no
     * knowledge of any opponent. Self-targeted items are applied internally
     * and never reach this callback.
     */
    private onItemCollectedCallback?;
    /** See onLock(). */
    private onLockCallback?;
    private tetrisCount;
    private tSpinCount;
    /**
     * The combo a SINGLE does not advance - the reference's `combo2`
     * (`gamestart.c:10256`). A lock clearing nothing breaks it like the normal
     * combo (`gamestart.c:10159`); a single neither advances nor breaks it.
     * MISSION's COMBO objective reads this one when its NOT1LINE option is set.
     */
    private comboIgnoringSingles;
    /**
     * The live piece came OUT of hold (the reference's `dhold2` +
     * `hold_used >= 2`, mission.c:989-1000). The ORDER objectives can ask for
     * a piece that was held, so the judge has to be told.
     */
    private currentCameFromHold;
    /**
     * ROTATELOCK's queue of six rotations. Each spawn takes the head and pushes
     * a fresh random one on the end (gamestart.c:3880-3887). Empty in every
     * other run.
     */
    private rotationQueue;
    /**
     * A mission's own timings, which override the mode's curve for the whole
     * run (the reference gives six of its types a speed table apiece,
     * mission.c:1192-1308). Null in every other run.
     */
    private missionSpeed;
    /**
     * One id per placement, stamped on the cells it locks (the reference's
     * `flds`). SQUARE reads it; nothing else does.
     */
    private nextPieceId;
    /** SQUARE mode: the scan runs after every lock (reference types 40/41). */
    private squareMode;
    /** ERASER: the pattern a mission asked for, and how many it still needs. */
    private eraserPattern;
    private eraserRemaining;
    /** TARGET: the stages this mission plays, and which one is up. */
    private stages;
    private stageIndex;
    private perfectClearCount;
    private lastUpdate;
    private frameAccumulator;
    private readonly TARGET_FPS;
    private readonly FRAME_TIME;
    /**
     * Most game frames one update() may run.
     *
     * Eight frames is 133ms - a wide allowance for a slow repaint, and far
     * short of the lock delay a stall used to be able to burn through in one
     * uninterruptible burst.
     */
    private readonly MAX_CATCHUP_FRAMES;
    private gravityAccumulator;
    private pauseTime;
    private devilNextRise;
    private readonly SHIRASE_RISE_MIN;
    private readonly SHIRASE_RISE_MAX;
    /**
     * PRACTICE goal for a training run (gamestart.c:11229-11252). null = play
     * until the stack tops out, which is all this door's training mode could do.
     */
    private practiceGoal;
    /** Frames since ROLL ROLL was collected (gamestart.c's gametime % 30). */
    private rollRollFrame;
    private readonly startLevel;
    constructor(mode: GameMode, settings: PlayerSettings, sounds: SoundEngine, attackManager?: AttackManager, startLevel?: number);
    /**
     * Give a training run a finish line (gamestart.c's p_goaltype). Call
     * before start(); 'none' or a zero value leaves the run endless.
     */
    setPracticeGoal(goal: PracticeGoal | null): void;
    /** The goal this run is playing to, for the HUD. */
    getPracticeGoal(): PracticeGoal | null;
    /**
     * Has the practice goal been met? Checked once per frame and once per lock,
     * because a time goal can fall due while no piece is moving.
     */
    private checkPracticeGoal;
    /**
     * Apply one item's ItemEffectResult to THIS engine.
     *
     * Board-shape effects (row deletes) and the timed ones (BIG, ROLL ROLL)
     * both land here, so the versus router and single player's own fallback
     * spend an item the same way instead of each handling a subset.
     */
    applyItemEffectResult(result: ItemEffectResult): void;
    /**
     * Publish the grade for the mode being played.
     *
     * 'death' is HeborisCE's Devil family (gameMode 3) and climbs dgname by
     * level, not the TGM3 Master ladder the GradeManager scores
     * (gamestart.c:9348-9349). Every other mode keeps the Master ladder.
     */
    private refreshGrade;
    /**
     * Set animation manager (for visual effects)
     */
    setAnimationManager(animations: AnimationManager): void;
    /**
     * Set glow manager (for block glow effects)
     */
    setGlowManager(glowManager: BlockGlowManager): void;
    /**
     * Create initial game state
     */
    private createInitialState;
    /**
     * Enable the TGM item system for this engine (gamestart.c:6994 `gameMode
     * == 4 || item_mode[player]` gate). Call once, before start(), for TGM
     * item versus play; every other mode leaves items off.
     */
    enableItems(preset?: ItemPresetName): void;
    itemsEnabled(): boolean;
    /**
     * Called once per locked piece with everything a MISSION needs to judge it
     * (core/mission-run.ts's LockEvent). The engine itself knows nothing about
     * missions - it reports, and the run decides.
     */
    onLock(callback: (event: LockEvent) => void): void;
    /**
     * Rules a mission switches on for its whole run. BIG, HIDE NEXT and ROLL
     * ROLL exist as items too; a mission simply never lets them expire.
     */
    /**
     * The timings a MISSION plays at, for its whole run.
     *
     * Applied through the same path the mode's curve takes, so a mission that
     * names only `gravity` still gets the mode's ARE and lock delay.
     */
    /**
     * Look for 4x4 squares after every lock (the reference's `squaremode`,
     * mission.c:1451-1455). Only SQUARE and GOLD SQUARE missions ask for it -
     * a scan every lock is not free, and no other mode is judged on it.
     */
    setSquareMode(on: boolean): void;
    /**
     * Mark rows for an ERASER mission, and keep them marked.
     *
     * `remaining` is the norm: the reference never marks more rows than the
     * mission still needs (mission.c:1484-1487), and marks a fresh set when
     * every marked row has been cleared.
     */
    setEraserPattern(pattern: EraserPattern | null, remaining: number): void;
    /**
     * Play a TARGET mission's stages, starting with the first.
     *
     * A stage is cleared when no platinum block is left (tomoyo.c:334-352);
     * the field is then wiped and the next stage laid out, which is the
     * reference's status-25 wipe (mission.c:882-902).
     */
    setStages(stages: Stage[]): void;
    /** The stage on the board, for the screen and for the tests. */
    getStage(): Stage | null;
    setMissionSpeed(speed: MissionSpeed | null): void;
    /** The mode's curve, with the mission's own timings on top of it. */
    private speedParams;
    setMissionModifiers(modifiers: MissionModifiers | null): void;
    /**
     * Fill the bottom `rows` rows with garbage before the run starts
     * (HeborisCE's mission_erase, mission.c:226-236). Each row gets its own
     * hole, so the stack is dug rather than merely tall.
     */
    seedGarbageRows(rows: number): void;
    /** See onItemCollectedCallback above. */
    onItemCollected(callback: (itemId: number) => void): void;
    /**
     * Start the game
     */
    start(): void;
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
    private rollItemForNextPiece;
    private spawnPiece;
    /**
     * Update game state (called every frame)
     */
    update(deltaTime: number): void;
    /**
     * Update single frame
     */
    private updateFrame;
    /**
     * Apply gravity to current piece
     */
    private applyGravity;
    /**
     * Check if piece is on ground
     */
    private isPieceGrounded;
    /**
     * Move piece left/right
     */
    move(direction: -1 | 1): boolean;
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
    rotate(direction: 1 | -1 | 2): boolean;
    /**
     * Soft drop (faster gravity)
     */
    softDrop(): boolean;
    private doSoftDrop;
    /**
     * Hard drop (instant lock)
     */
    hardDrop(): void;
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
    sonicDrop(): boolean;
    private doSonicDrop;
    /**
     * Hold current piece
     */
    hold(): boolean;
    /**
     * Set pending IRS (Initial Rotation System) input
     * Only works during ARE (when no piece is active)
     */
    setIRS(direction: -1 | 0 | 1): boolean;
    /**
     * Set pending IHS (Initial Hold System) input
     * Only works during ARE (when no piece is active)
     */
    setIHS(): boolean;
    /**
     * Activate Zone — requires meter >= 20%. Duration proportional to meter fill.
     * Returns true if activated, false if not enough meter or already active.
     */
    activateZone(): boolean;
    /**
     * Deactivate Zone — award buffered line bonus.
     */
    private deactivateZone;
    /**
     * Detect T-Spin using the 3-corner rule (HeborisCE isTSpin)
     * Returns 'full' for T-Spin, 'mini' for T-Spin Mini, or 'none'
     *
     * HeborisCE behavior:
     * - tspin_flag must be 1 (set by rotation, cleared by horizontal move)
     * - rotationCount must be > 0 (piece was rotated at least once)
     * - 3-corner check must pass
     */
    private detectTSpin;
    /**
     * Lock piece to board
     */
    private lockPiece;
    /**
     * Calculate score for line clear
     */
    private calculateLineScore;
    /**
     * Reset lock delay (when piece moves/rotates)
     * HeborisCE tracks move and rotation resets separately
     */
    private resetLockDelay;
    /**
     * Get current game state
     */
    getState(): GameState;
    /**
     * Get current medal state (HeborisCE medal system)
     */
    getMedals(): import("./medals").MedalState;
    /**
     * Get recently awarded medals for display
     */
    getRecentMedals(): Medal[];
    /**
     * Clear recent medals after displaying
     */
    clearRecentMedals(): void;
    /**
     * Reset the Shirase garbage counter
     */
    private resetDevilNextRise;
    /**
     * Apply a line of garbage for Shirase mode
     */
    private applyShiraseGarbage;
    /**
     * Get total finesse errors accumulated so far
     */
    getFinesseErrors(): number;
    /**
     * Get game result
     */
    getResult(): GameResult;
    /**
     * Get bone block probability for current grade
     */
    private getBoneBlockChance;
    /** Check if M grade reached and trigger credit roll */
    private checkCreditRollTrigger;
    private startCreditRoll;
    private completeCreditRoll;
    /**
     * Place piece with lock timestamp for credit roll fade
     */
    private placePieceWithTimestamp;
    private stampItemOnPiece;
    private collectItemFromLines;
    /**
     * Apply a collected item's effect and show the HUD banner.
     * gamestart.c:10383 `eraseItem(player, item_waiting[player]);` and
     * gamestart.c:13451-13454 target selection (self-targeted "support"
     * items vs. enemy-targeted "attack" items - see SELF_TARGET_ITEMS).
     */
    private processCollectedItem;
    /**
     * Force the next spawned piece to carry a specific item id, bypassing the
     * normal gauge/draw (gamestart.c:3896-3907 item_nblk[0] override). Used
     * by insertHardBlockNext() and by tests that need a deterministic item
     * without waiting out the 20-piece gauge.
     */
    setPendingItem(itemId: number): void;
    /**
     * Insert a HARD BLOCK (item 25) into this engine's very next piece.
     * gamestart.c:13600-13603 `item_nblk[0+enemy*6] = fldihardno;` - called by
     * the caller-side item-effect resolution when this engine is an item's
     * target.
     */
    insertHardBlockNext(): void;
    /** Board accessor for cross-engine item effects (mirror/exchg/laser/etc). */
    getBoard(): GameState['board'];
    /**
     * Pause game
     */
    pause(): void;
    /**
     * Resume game
     */
    resume(): void;
    /**
     * Start replay recording
     */
    startRecording(userId: string, username: string, seed?: number): void;
    /**
     * Stop and finalize replay recording
     */
    finalizeRecording(): Replay | null;
    /**
     * Check if currently recording
     */
    isRecording(): boolean;
    /**
     * Set callback for hard drop event
     */
    onHardDrop(callback: () => void): void;
    /**
     * Get color name for piece type (for visual effects)
     */
    private getPieceColorName;
}
//# sourceMappingURL=game.d.ts.map