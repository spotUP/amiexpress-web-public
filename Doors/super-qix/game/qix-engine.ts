/**
 * Super Qix - Core Game Engine
 * Main game logic and state management
 */

import {
  SuperQixData,
  GameState,
  CellState,
  Point,
  Direction,
  Stix,
  ClaimResult
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  FIELD_OFFSET_X,
  FIELD_OFFSET_Y,
  GAME_TICK_MS,
  STARTING_LIVES,
  DEFAULT_TARGET_PERCENT,
  EXTRA_LIFE_PERCENT,
  FILL_ANIMATION_FRAMES,
  LEVEL_CLEAR_WIPE_COLUMNS,
  BONUS_PANEL_FRAMES,
  INTRO_PANEL_FRAMES,
  LETTER_END_OF_LEVEL_POINTS,
  LETTER_WORD_COMPLETE_POINTS,
  MARKER_CYCLE,
  MARKER_CYCLE_FRAMES,
  SKULL_CHEW_FRAMES,
  GAME_OVER_BLINK_FRAMES,
  SKULLS_PER_RELEASE,
  POINTS_PER_BONUS_PERCENT,
  BONUS_PERCENT_START,
  CHARS,
  BG_COLORS,
  CELL_WIDTH,
  ART_PALETTE,
  getLevelConfig,
  DEFAULT_HIGHSCORES,
  FUSE_START_DELAY,
  SKILL_LEVELS,
  LEVELS_PER_LAP,
  FINAL_LAP_MESSAGE,
  HURRY_SPEED_SCALE,
  MULTIPLIER_REJOIN_CELLS,
  MULTIPLIER_FIRST,
  MULTIPLIER_CHAINED,
  MULTIPLIER_CHAIN_MS,
  WARP_OPENING_MS,
  WARP_OPEN_MS,
  SKULL_STUN_MS,
} from './constants';
import { Background, ArtCell, artForCell } from './background';
import { DrawingSystem } from './drawing';
import { EnemySystem } from './enemies';
import { PowerUpSystem } from './powerups';

type RenderCallback = (content: string) => void;

/**
 * Main game engine for Super Qix
 */
export class QixEngine {
  private data: SuperQixData;
  private renderCallback: RenderCallback;
  private drawingSystem: DrawingSystem;
  private enemySystem: EnemySystem;
  private powerUpSystem: PowerUpSystem;
  private lastMoveTime: number = 0;

  /**
   * The picture hidden behind the playfield, revealed as area is claimed.
   * Null when the board has no art, in which case claimed area is drawn as
   * a flat colour and the game plays exactly as before.
   */
  private background: Background | null = null;

  /**
   * A claim that is still being painted in.
   *
   * The area is won the instant the shape closes - the score and the
   * percentage are credited then - but the ground is filled in over several
   * frames, sweeping RIGHT TO LEFT, so the player sees the area being taken
   * rather than it appearing all at once. `columns` holds the cells grouped
   * by x, ordered right to left, and each tick consumes a slice of them.
   */
  private pendingFill: { columns: Point[][]; perTick: number } | null = null;

  /**
   * The end-of-level sequence, following the arcade.
   *
   *   reveal - the picture wipes in from the right, taking the player's
   *            lines with it, until the whole image is showing;
   *   bonus  - the BONUS tally sits over the finished picture;
   *   clear  - the picture wipes away again;
   *   intro  - the empty field announces what the next round needs.
   */
  private outro:
    | {
        phase: 'reveal' | 'bonus' | 'clear' | 'intro';
        sweepX: number;
        timer: number;
        areaBonus: number;
        wordBonus: number;
        areaPercent: number;
      }
    | null = null;

  constructor(data: SuperQixData, renderCallback: RenderCallback) {
    this.data = data;
    this.renderCallback = renderCallback;
    this.drawingSystem = new DrawingSystem(data);
    this.enemySystem = new EnemySystem(data);
    this.powerUpSystem = new PowerUpSystem(data);
  }

  /**
   * Set the picture revealed as area is claimed.
   *
   * Loading it reads a file, so the door does that and hands the result in
   * rather than initLevel blocking on I/O.
   */
  setBackground(background: Background | null): void {
    this.background = background;
  }

  /**
   * Initialize a new level
   */
  initLevel(levelNum: number): void {
    const d = this.data;
    const config = getLevelConfig(levelNum);

    const skill = SKILL_LEVELS[d.skill] ?? SKILL_LEVELS.medium;

    d.level = levelNum;
    d.claimedPercent = 0;
    // FAQ 4: the fill area is the operator's skill setting, not the level's.
    d.targetPercent = skill.targetPercent;
    d.scoreMultiplier = 1;
    d.levelWord = config.word;
    d.collectedLetters = [];
    d.activeEffects = [];
    d.levelStartTime = Date.now();
    d.stopTimer = 0;
    d.timeMeter = 0;

    // Initialize playfield
    d.fieldWidth = FIELD_WIDTH;
    d.fieldHeight = FIELD_HEIGHT;
    d.field = this.createField();

    // Initialize border path for Sparx patrol
    d.internalLines = [];
    d.borderPath = this.createBorderPath();

    // Reset marker to bottom center of border
    d.marker = {
      x: Math.floor(FIELD_WIDTH / 2),
      y: FIELD_HEIGHT - 1,
      isDrawing: false,
      hasShield: false,
      speedBoost: false,
      speedBoostTimer: 0
    };

    // Clear stix
    d.currentStix = null;
    d.fuse = null;

    // A doorway does not survive the level it was opened on.
    d.warp = null;
    d.lastMultiplier = 1;
    d.lastMultiplierAt = 0;
    d.scoreMultiplier = 1;

    // Abandon any claim still being painted in. The winning claim of the
    // previous level is a large one, and its remaining columns would
    // otherwise carry on painting into THIS level's fresh field - which
    // handed the player a new level with chunks already filled in.
    this.pendingFill = null;
    this.outro = null;

    // Spawn enemies
    // FAQ 4: "Difficulty refers mainly to how quickly/unpredictably and
    // aggressively the Gremlin and Skulls move".
    this.enemySystem.initLevel({
      ...config,
      qixSpeed: config.qixSpeed * skill.difficulty,
      sparxSpeed: config.sparxSpeed * skill.difficulty,
    });

    // Clear power-ups
    d.powerUps = [];
    d.powerUpIdCounter = 0;

    this.render();
  }

  /**
   * Create initial field with borders
   */
  private createField(): CellState[][] {
    const field: CellState[][] = [];

    for (let y = 0; y < FIELD_HEIGHT; y++) {
      field[y] = [];
      for (let x = 0; x < FIELD_WIDTH; x++) {
        // Border on edges
        if (x === 0 || x === FIELD_WIDTH - 1 || y === 0 || y === FIELD_HEIGHT - 1) {
          field[y][x] = 'border';
        } else {
          field[y][x] = 'unclaimed';
        }
      }
    }

    return field;
  }

  /**
   * Create border path for Sparx patrol
   */
  private createBorderPath(): Point[] {
    const path: Point[] = [];

    // Top edge (left to right)
    for (let x = 0; x < FIELD_WIDTH; x++) {
      path.push({ x, y: 0 });
    }
    // Right edge (top to bottom)
    for (let y = 1; y < FIELD_HEIGHT; y++) {
      path.push({ x: FIELD_WIDTH - 1, y });
    }
    // Bottom edge (right to left)
    for (let x = FIELD_WIDTH - 2; x >= 0; x--) {
      path.push({ x, y: FIELD_HEIGHT - 1 });
    }
    // Left edge (bottom to top)
    for (let y = FIELD_HEIGHT - 2; y > 0; y--) {
      path.push({ x: 0, y });
    }

    return path;
  }

  /**
   * Main update loop
   */
  update(): void {
    const d = this.data;

    if (d.state !== 'playing') return;

    const now = Date.now();
    d.frameCount++;

    // Paint in any claim still sweeping across the field
    this.advanceFill();

    // Fill the border Time Meter
    this.advanceTimeMeter();

    // Update active effects
    this.powerUpSystem.updateEffects();

    // Update enemies. A Hurry speeds them up along with the marker.
    this.enemySystem.update(this.enemySpeedScale());

    // Released letters and power-ups travel the field on their own.
    this.powerUpSystem.updateMovement();

    // Update fuse if drawing and stopped
    if (d.marker.isDrawing && d.currentStix) {
      d.stopTimer += GAME_TICK_MS;
      if (d.stopTimer > FUSE_START_DELAY) {
        this.enemySystem.updateFuse(d.currentStix.points);
      }
    }

    // Check collisions
    if (this.checkCollisions()) {
      // Player died
      this.handleDeath();
      return;
    }

    // Check power-up collection
    this.powerUpSystem.checkCollection(d.marker);

    // A free life at each of this skill's score thresholds (FAQ 4).
    this.awardBonusLives();

    // Walking into an open Warp doorway ends the level at once (FAQ 2.3.1).
    if (this.enterWarpIfOpen()) return;

    // Check level complete
    if (d.claimedPercent >= d.targetPercent) {
      this.levelComplete();
      return;
    }

    // Spelling the whole word finishes the level on the spot (FAQ 2.3).
    // The 10,000 per letter is paid by the end-of-level tally, which is
    // also where the area bonus is worked out - there was a second flat
    // 10,000 here, and the percentage was forced to 100 so that the area
    // bonus paid out for ground the player never actually claimed.
    if (this.checkWordComplete()) {
      this.levelComplete();
      return;
    }

    this.render();
  }

  /**
   * How much faster everything is running right now.
   *
   * FAQ 2.3.1: a Hurry "Speeds up EVERYTHING in the game (including the
   * music!) ... These are cumulative, so if you pick up several in quick
   * succession, the game may get unmanageably fast." One Hurry was only
   * ever speeding the marker up, which made it a pure benefit rather than
   * the double-edged thing the arcade hands you.
   */
  enemySpeedScale(): number {
    const hurries = this.data.activeEffects.filter(e => e.type === 'speed').length;
    return Math.pow(HURRY_SPEED_SCALE, hurries);
  }

  /**
   * Pay the skill level's bonus lives as the score passes them (FAQ 4).
   *
   * Hard mode lists none, so its table is empty and nothing is ever paid.
   */
  private awardBonusLives(): void {
    const d = this.data;
    const thresholds = (SKILL_LEVELS[d.skill] ?? SKILL_LEVELS.medium).bonusLives;

    while (
      d.bonusLivesAwarded < thresholds.length &&
      d.score >= thresholds[d.bonusLivesAwarded]
    ) {
      d.lives++;
      d.bonusLivesAwarded++;
    }
  }

  /**
   * Is the Warp doorway fully open?
   *
   * FAQ 2.3.1: it "takes a second or two to open, remains open for another
   * second or so, then closes".
   */
  isWarpOpen(now: number = Date.now()): boolean {
    const warp = this.data.warp;
    if (!warp) return false;

    const age = now - warp.openedAt;
    return age >= WARP_OPENING_MS && age < WARP_OPENING_MS + WARP_OPEN_MS;
  }

  /**
   * Step through an open doorway if the marker is standing in one.
   *
   * FAQ 2.3.1: "If you can move your diamond into it while it is fully
   * open, you advance directly to the next level. (NOTE: if you warp, you
   * get no end-of-level bonuses, e.g. for partially-spelled words.)" - so
   * this deliberately does NOT go through startLevelOutro, which is where
   * the bonuses are worked out and paid.
   */
  private enterWarpIfOpen(): boolean {
    const d = this.data;
    const warp = d.warp;
    if (!warp || !this.isWarpOpen()) {
      // A doorway that has closed is simply gone.
      if (warp && Date.now() - warp.openedAt >= WARP_OPENING_MS + WARP_OPEN_MS) {
        d.warp = null;
      }
      return false;
    }

    if (Math.round(d.marker.x) !== warp.x || Math.round(d.marker.y) !== warp.y) {
      return false;
    }

    d.warp = null;
    d.state = 'levelTransition';
    d.transitionMessage = 'WARP';
    d.transitionTimer = 30;
    this.render();
    return true;
  }

  /**
   * Set the score multiplier for a claim about to be made (FAQ 2.4.1).
   *
   * "Multipliers occur when the point where you finish outlining an area is
   * as close as possible (within about 2 pixels) to the point where you
   * began. Achieving a multiplier will give you 20x normal points for the
   * area filled. If you manage another multiplier within a second or two of
   * the last one, it increases to 30x".
   */
  private applyRejoinMultiplier(endPoint: Point): void {
    const d = this.data;
    const start = d.currentStix?.points[0];
    if (!start) return;

    const distance = Math.max(
      Math.abs(endPoint.x - start.x),
      Math.abs(endPoint.y - start.y)
    );

    if (distance > MULTIPLIER_REJOIN_CELLS) {
      d.scoreMultiplier = 1;
      d.lastMultiplier = 1;
      return;
    }

    const now = Date.now();
    const chained =
      d.lastMultiplier >= MULTIPLIER_FIRST &&
      now - d.lastMultiplierAt <= MULTIPLIER_CHAIN_MS;

    d.lastMultiplier = chained ? MULTIPLIER_CHAINED : MULTIPLIER_FIRST;
    d.lastMultiplierAt = now;
    d.scoreMultiplier = d.lastMultiplier;
  }

  /**
   * Fill the border Time Meter, and release Skulls when it tops out.
   *
   * FAQ 1: "The outside border of the playing field is composed of squares
   * which serve as a Time Meter. As you play, they change colour two at a
   * time, until the whole border is red at which point two more Skulls are
   * released onto the field and the counter resets and starts again." Later
   * levels fill it faster (FAQ 1: "the timer counts down more quickly").
   */
  private advanceTimeMeter(): void {
    const d = this.data;
    const config = getLevelConfig(d.level);

    d.timeMeter += GAME_TICK_MS / config.timeMeterMs;

    if (d.timeMeter >= 1) {
      d.timeMeter = 0;
      this.enemySystem.releaseSkulls(SKULLS_PER_RELEASE, config.sparxSpeed);
    }
  }

  /**
   * Queue a won area to be painted in, sweeping right to left.
   *
   * Grouped by column and reversed so the highest x is filled first. The
   * number of columns taken per tick is set so that any claim, from a
   * two-cell sliver to most of the board, finishes in about the same time -
   * a fixed per-column rate would make a big claim crawl.
   */
  private beginFill(points: Point[]): void {
    if (points.length === 0) return;

    const byColumn = new Map<number, Point[]>();
    for (const point of points) {
      const column = byColumn.get(point.x);
      if (column) column.push(point);
      else byColumn.set(point.x, [point]);
    }

    const columns = [...byColumn.keys()]
      .sort((a, b) => b - a)          // right to left
      .map(x => byColumn.get(x)!);

    this.pendingFill = {
      columns,
      perTick: Math.max(1, Math.ceil(columns.length / FILL_ANIMATION_FRAMES)),
    };
  }

  /**
   * Has the Time Meter consumed this border square yet?
   *
   * The meter runs along the border path, and squares are consumed in pairs
   * (FAQ 1: "they change colour two at a time"), so the boundary is rounded
   * down to an even number of squares.
   */
  private isMeterFilled(x: number, y: number): boolean {
    const d = this.data;
    const path = d.borderPath;
    if (path.length === 0) return false;

    const index = path.findIndex(p => p.x === x && p.y === y);
    if (index < 0) return false;

    const consumed = Math.floor((d.timeMeter * path.length) / 2) * 2;
    return index < consumed;
  }

  /** Paint the next slice of a sweeping claim. */
  private advanceFill(): void {
    const fill = this.pendingFill;
    if (!fill) return;

    for (let i = 0; i < fill.perTick && fill.columns.length > 0; i++) {
      const column = fill.columns.shift()!;
      for (const point of column) {
        this.data.field[point.y][point.x] = 'claimed';
      }
    }

    if (fill.columns.length === 0) this.pendingFill = null;
  }

  /**
   * Write centred lines across the middle of the rendered field.
   *
   * Whole rendered rows are replaced rather than individual cells, because
   * each cell is already a run of colour tags. Every replacement row is
   * padded to the full width so the frame still measures SCREEN_WIDTH.
   */
  /**
   * Lay a panel's text over the board, one character at a time.
   *
   * Only the characters of the message are touched: whatever is behind
   * them - usually the picture the level just revealed - keeps its own
   * colours. This used to replace whole rows with a black band, which put
   * a black stripe across the picture the sequence exists to show.
   */
  private overlayPanel(
    grid: Array<Array<{ ch: string; fg?: string; bg?: string }>>,
    panel: Array<{ text: string; colour: string }>
  ): void {
    const width = FIELD_WIDTH * CELL_WIDTH;
    const top = Math.max(0, Math.floor((grid.length - panel.length) / 2));

    panel.forEach((entry, i) => {
      const row = grid[top + i];
      if (!row || !entry.text) return;

      const left = Math.max(0, Math.floor((width - entry.text.length) / 2));

      for (let c = 0; c < entry.text.length; c++) {
        const cell = row[left + c];
        if (!cell) continue;

        cell.ch = entry.text[c];
        cell.fg = entry.colour;
      }
    });
  }


  /**
   * The panel the end-of-level sequence is showing: the BONUS tally over the
   * finished picture, then what the next round asks for.
   */
  private outroPanel(): Array<{ text: string; colour: string }> | null {
    const outro = this.outro;
    if (!outro) return null;

    if (outro.phase === 'bonus') {
      const row = (label: string, value: number) =>
        `${label.padEnd(12)}${String(value).padStart(8)}`;
      const panel = [
        { text: 'BONUS', colour: 'lightcyan' },
        { text: '', colour: 'white' },
        { text: row(`AREA  ${outro.areaPercent}%`, outro.areaBonus), colour: 'lightblue' },
        { text: row('WORD', outro.wordBonus), colour: 'lightblue' },
      ];

      // FAQ 3.1: clearing the sixteenth level is the end of a lap, and
      // everyone in the picture - the girl in the convertible and every one
      // of the cats - says the same three lines before you start again.
      if (this.data.level >= LEVELS_PER_LAP) {
        panel.push({ text: '', colour: 'white' });
        for (const line of FINAL_LAP_MESSAGE) {
          panel.push({ text: line, colour: 'lightyellow' });
        }
      }

      return panel;
    }

    if (outro.phase === 'intro') {
      // The lap wraps, so the level after the sixteenth is the first again.
      const nextLevel = this.data.level >= LEVELS_PER_LAP ? 1 : this.data.level + 1;
      const next = getLevelConfig(nextLevel);
      return [
        { text: 'CHALLENGE TO', colour: 'lightred' },
        { text: `TAKE ${next.targetPercent}% AREA`, colour: 'lightred' },
        { text: '', colour: 'white' },
        { text: 'NEXT TRY', colour: 'lightred' },
        { text: 'READY', colour: 'lightyellow' },
      ];
    }

    return null;
  }

  /**
   * The GAME OVER panel.
   *
   * The arcade blinks "GAME OVER / INSERT COIN" over the field; a BBS door
   * has no coin slot, so it asks for a key. Nothing drew this state at all
   * before - losing the last life simply froze the board.
   */
  private gameOverPanel(): Array<{ text: string; colour: string }> | null {
    const d = this.data;
    if (d.state !== 'gameover') return null;

    const showPrompt = Math.floor(d.frameCount / GAME_OVER_BLINK_FRAMES) % 2 === 0;

    return [
      { text: 'GAME OVER', colour: 'lightred' },
      { text: '', colour: 'white' },
      { text: `SCORE ${d.score}`, colour: 'lightgreen' },
      { text: `ROUND ${d.level}`, colour: 'lightgreen' },
      { text: '', colour: 'white' },
      { text: showPrompt ? 'PRESS ENTER' : '', colour: 'lightyellow' },
    ];
  }

  /**
   * Work out the end-of-level bonuses and start the arcade sequence.
   *
   * FAQ 2.4.2: "1000 points x (each 1% above required fill threshold)",
   * "1000 points x (Key letters collected) if word is still incomplete",
   * and "10,000 points x (Key letters collected) if word is completed".
   * This is where banked letters finally pay: FAQ 2.3 says collecting them
   * "will not give you any points until you complete the level".
   */
  private startLevelOutro(): void {
    const d = this.data;

    const above = Math.max(0, Math.floor(d.claimedPercent) - d.targetPercent);
    const areaBonus = above * POINTS_PER_BONUS_PERCENT;

    const perLetter = this.checkWordComplete()
      ? LETTER_WORD_COMPLETE_POINTS
      : LETTER_END_OF_LEVEL_POINTS;
    const wordBonus = d.collectedLetters.length * perLetter;

    d.score += areaBonus + wordBonus;

    this.outro = {
      phase: 'reveal',
      sweepX: FIELD_WIDTH,
      timer: 0,
      areaBonus,
      wordBonus,
      areaPercent: Math.floor(d.claimedPercent),
    };
  }

  /**
   * Advance the end-of-level sequence one frame and repaint.
   *
   * Called by the door while the level is handed over - update() only runs
   * while playing. Returns true while the sequence is still running.
   */
  advanceLevelOutro(): boolean {
    const outro = this.outro;
    if (!outro) return false;

    switch (outro.phase) {
      case 'reveal':
        outro.sweepX -= LEVEL_CLEAR_WIPE_COLUMNS;
        if (outro.sweepX <= 0) {
          outro.sweepX = 0;
          outro.phase = 'bonus';
          outro.timer = BONUS_PANEL_FRAMES;
        }
        break;

      case 'bonus':
        outro.timer--;
        if (outro.timer <= 0) {
          outro.phase = 'clear';
          outro.sweepX = FIELD_WIDTH;
        }
        break;

      case 'clear':
        outro.sweepX -= LEVEL_CLEAR_WIPE_COLUMNS;
        if (outro.sweepX <= 0) {
          outro.sweepX = 0;
          outro.phase = 'intro';
          outro.timer = INTRO_PANEL_FRAMES;
        }
        break;

      case 'intro':
        outro.timer--;
        if (outro.timer <= 0) {
          // Deliberately no repaint: the intro panel from the previous
          // frame should stay up, and the door advances the level next,
          // which paints the new one. Repainting here would flash the
          // finished level's field again.
          this.outro = null;
          return false;
        }
        break;
    }

    this.render();
    return true;
  }

  /**
   * Cut the end-of-level sequence short.
   *
   * The reveal, the tally and the announcement together run for several
   * seconds, which is a long time to sit through once you have seen it.
   * Enter skips straight to the next level.
   */
  skipOutro(): boolean {
    if (!this.outro) return false;

    this.outro = null;
    this.data.transitionTimer = 0;
    return true;
  }

  /** Is the end-of-level sequence still running? */
  isRevealing(): boolean {
    return this.outro !== null;
  }

  /**
   * What the end-of-level sequence paints at this cell, if anything.
   */
  private outroCellAt(
    x: number,
    y: number,
    cell: CellState
  ): { ch: string; fg?: string; bg?: string; art?: ArtCell[] } | null {
    const outro = this.outro;
    if (!outro || cell === 'border') return null;

    const picture = () =>
      this.background
        ? { ch: ' ', art: artForCell(this.background, x, y) }
        : { ch: ' ', bg: BG_COLORS.claimed };
    const bare = () => ({ ch: ' ', bg: BG_COLORS.unclaimed });

    switch (outro.phase) {
      case 'reveal':
        return x >= outro.sweepX ? picture() : null;
      case 'bonus':
        return picture();
      case 'clear':
        return x >= outro.sweepX ? bare() : picture();
      case 'intro':
        return bare();
    }
  }

  /** Is a claim still sweeping across the field? */
  isFilling(): boolean {
    return this.pendingFill !== null;
  }

  /**
   * Handle direction input
   */
  handleDirection(dir: Direction): void {
    const d = this.data;
    const now = Date.now();

    // Rate limit movement
    const moveDelay = d.marker.speedBoost ? 25 : 50;
    if (now - this.lastMoveTime < moveDelay) return;
    this.lastMoveTime = now;

    // Calculate next position
    let nextX = d.marker.x;
    let nextY = d.marker.y;

    switch (dir) {
      case 'up': nextY--; break;
      case 'down': nextY++; break;
      case 'left': nextX--; break;
      case 'right': nextX++; break;
    }

    // Bounds check
    if (nextX < 0 || nextX >= FIELD_WIDTH || nextY < 0 || nextY >= FIELD_HEIGHT) {
      return;
    }

    const nextCell = d.field[nextY][nextX];

    // Stepping off safe ground into open field starts a line by itself.
    //
    // The arcade holds a Draw button to detach, but that assumes a stick
    // and a button under one hand. In a BBS terminal the arrow keys are
    // the whole controller, so an arrow pointed into unclaimed area IS the
    // intent to draw - nothing else can be meant by it, since without
    // drawing that move is simply refused.
    if (!d.marker.isDrawing && nextCell === 'unclaimed') {
      this.startDrawing();
    }

    if (d.marker.isDrawing && d.currentStix) {
      // Retracing one step back along the line (FAQ 2.1: backtracking IS
      // allowed in Super Qix). The line shortens and the abandoned cell goes
      // back to open field. Deliberately does NOT reset stopTimer: FAQ 2.2
      // says "backtracking counts as not moving for the purposes of the
      // Fuse", so the fuse keeps burning while the player reverses out.
      if (this.drawingSystem.isBacktrack({ x: nextX, y: nextY })) {
        if (this.drawingSystem.retractStix()) {
          d.marker.x = nextX;
          d.marker.y = nextY;
        }
        return;
      }

      // Drawing mode - can move into unclaimed or back to border/claimed
      if (nextCell === 'unclaimed') {
        // Extend stix
        if (this.drawingSystem.extendStix({ x: nextX, y: nextY })) {
          d.marker.x = nextX;
          d.marker.y = nextY;
          d.stopTimer = 0;  // Reset fuse timer
        }
      } else if (nextCell === 'border' || nextCell === 'claimed') {
        // Rejoining close to where the line left pays a multiplier, so it
        // has to be settled before the claim is scored.
        this.applyRejoinMultiplier({ x: nextX, y: nextY });

        // Complete stix - claim area
        // The line's own cells, kept before the claim clears them. A small
        // claim encloses NOTHING - the ground it takes is the line itself -
        // so result.filled comes back empty and a bonus released from "the
        // area just filled" had nowhere to come from.
        const linePoints = (d.currentStix?.points ?? []).map(p => ({ ...p }));

        const result = this.drawingSystem.completeStix({ x: nextX, y: nextY });
        if (result.success) {
          d.marker.x = nextX;
          d.marker.y = nextY;
          d.marker.isDrawing = false;
          d.currentStix = null;
          d.fuse = null;
          d.stopTimer = 0;

          // The area is won now - score and percentage are credited
          // immediately - but the ground is painted in over the next few
          // frames, sweeping right to left.
          if (result.filled) {
            this.beginFill(result.filled);
          }

          // Award points
          if (result.points) {
            d.score += result.points;
          }
          if (result.percent) {
            d.claimedPercent += result.percent;
          }

          // The multiplier is spent on the claim that earned it.
          d.scoreMultiplier = 1;

          // FAQ 2.4.1: a fill "no matter how small" gets its chance at a
          // bonus, even one too small to have scored a single point.
          this.powerUpSystem.trySpawnPowerUp([...(result.filled ?? []), ...linePoints]);

          // Update border path for Sparx, then re-anchor existing Sparx to
          // it - the rebuilt array reorders points, so a stale pathIndex
          // would otherwise teleport a Sparx onto the marker's landing cell.
          d.borderPath = this.rebuildPatrolPath();
          this.enemySystem.reanchorBorderPositions();
        }
      } else if (nextCell === 'stix') {
        // Can't cross own stix - die!
        this.handleDeath();
        return;
      }
    } else {
      // Not drawing: the outer frame, and the EDGES of claimed ground only.
      // The inside of a claimed region is not walkable - see isWalkable.
      if (this.drawingSystem.isWalkable({ x: nextX, y: nextY })) {
        d.marker.x = nextX;
        d.marker.y = nextY;
      } else if (
        !this.drawingSystem.isWalkable({ x: d.marker.x, y: d.marker.y }) &&
        (nextCell === 'border' || nextCell === 'claimed')
      ) {
        // Escape hatch: a claim can bury the cell the marker is standing on,
        // and a marker with nowhere legal to go would be stuck for good. From
        // a buried cell, any safe ground is allowed until it is back on an edge.
        d.marker.x = nextX;
        d.marker.y = nextY;
      }
      // Moving into unclaimed area without drawing: stay put
    }
  }

  /**
   * Detach from the edge and start drawing.
   *
   * Super Qix has a single Draw button - there is no slow/fast choice
   * (FAQ 2.5.3: "There's no longer an option to complete lines quickly
   * for safety or slowly for extra points"), so one entry point.
   */
  handleDraw(): void {
    this.startDrawing();
  }

  /**
   * Start drawing in the current direction
   */
  private startDrawing(): void {
    const d = this.data;

    if (d.marker.isDrawing) return;

    // Must be on border or claimed area to start drawing
    const currentCell = d.field[d.marker.y][d.marker.x];
    if (currentCell !== 'border' && currentCell !== 'claimed') return;

    d.marker.isDrawing = true;
    d.currentStix = {
      points: [{ x: d.marker.x, y: d.marker.y }],
      startTime: Date.now()
    };
    d.stopTimer = 0;
  }

  /**
   * Stop drawing (release key)
   */
  handleStopDraw(): void {
    // Drawing continues until you return to safe area
    // This method is called when draw key is released
    // Fuse mechanic will start if stopped
  }

  /**
   * Rebuild the path the Skulls patrol.
   *
   * The frame and the edges of claimed ground, plus every line the player
   * has finished. FAQ 2.2: the Skulls "can follow any line on the screen
   * (including internal lines which you can't travel on anymore)" - a line
   * the marker can no longer reach, because a later claim buried it, is
   * still a road for them, and that is how a Skull cuts you off from a
   * direction you thought was safe.
   *
   * A buried line is spliced into the walk beside the cell it joins, and
   * walked out and back again, so the patrol stays a single continuous tour
   * - a Skull that turns down one of these has to come back out of it
   * rather than jumping across the board.
   */
  rebuildPatrolPath(): Point[] {
    const d = this.data;
    const path: Point[] = [];
    const onPath = new Set<string>();
    const key = (p: Point) => `${p.x},${p.y}`;

    for (let y = 0; y < FIELD_HEIGHT; y++) {
      for (let x = 0; x < FIELD_WIDTH; x++) {
        const cell = d.field[y][x];
        const walkable =
          cell === 'border' ||
          (cell === 'claimed' && this.drawingSystem.touchesUnclaimed(x, y));

        if (walkable && !onPath.has(`${x},${y}`)) {
          onPath.add(`${x},${y}`);
          path.push({ x, y });
        }
      }
    }

    for (const line of d.internalLines) {
      // Only the part of it the marker has lost access to.
      const buried = line.filter(p => !onPath.has(key(p)));
      if (buried.length === 0) continue;

      for (const p of buried) onPath.add(key(p));

      // Out along the buried line and back, spliced in beside whichever
      // cell of the walk it starts closest to.
      const detour = [...buried, ...buried.slice(0, -1).reverse()];
      const joinAt = this.closestIndex(path, buried[0]);
      path.splice(joinAt + 1, 0, ...detour);
    }

    return path;
  }

  /** Where in a path the cell closest to `to` sits. */
  private closestIndex(path: Point[], to: Point): number {
    let best = 0;
    let bestDistance = Infinity;

    path.forEach((point, index) => {
      const distance = Math.hypot(point.x - to.x, point.y - to.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });

    return best;
  }

  /**
   * Check all collisions
   */
  private checkCollisions(): boolean {
    const d = this.data;

    // The Gremlin, while drawing. FAQ 2.3.1 is explicit that the Shield
    // "will NOT protect you from the Gremlin hitting either you or your
    // line" - it used to, which made the Shield a free pass against the
    // one enemy the arcade never lets you buy your way past.
    if (d.marker.isDrawing && d.currentStix) {
      if (this.enemySystem.checkQixCollision(d.marker, d.currentStix.points)) {
        return true;
      }
    }

    // Skulls, always. This is what the Shield is for: it "will protect you
    // from one encounter with a Skull" and "will also stun the Skull in
    // question for one second".
    const struck = this.enemySystem.sparxTouching(d.marker);
    if (struck) {
      if (d.marker.hasShield) {
        d.marker.hasShield = false;
        struck.frozen = true;
        struck.frozenTimer = Math.ceil(SKULL_STUN_MS / GAME_TICK_MS);
        return false;
      }
      return true;
    }

    // Check Fuse collision (while drawing)
    if (d.fuse && d.fuse.active) {
      if (this.enemySystem.checkFuseCollision(d.marker)) {
        return true;  // Fuse always kills
      }
    }

    return false;
  }

  /**
   * Handle player death
   */
  private handleDeath(): void {
    const d = this.data;

    d.lives--;

    // Where the marker goes back to.
    //
    // NOT the level's spawn point. Losing a life in a far corner and being
    // sent back to the middle of the bottom edge costs the whole walk out
    // again, and reads as the game having reset itself. The marker returns
    // to where it LEFT safe ground - the start of the line it was drawing.
    const retreat = d.currentStix?.points[0];

    // Clear current stix
    if (d.currentStix) {
      for (const point of d.currentStix.points) {
        if (d.field[point.y][point.x] === 'stix') {
          d.field[point.y][point.x] = 'unclaimed';
        }
      }
    }
    d.currentStix = null;
    d.marker.isDrawing = false;
    // FAQ 2.2: "If you should die, all but two Skulls will disappear."
    this.enemySystem.cullSkullsAfterDeath();
    d.fuse = null;
    d.stopTimer = 0;

    if (d.lives <= 0) {
      d.state = 'gameover';
    } else if (retreat && this.drawingSystem.isWalkable(retreat)) {
      // Back to where the line started - safe ground by definition, since
      // that is what a line has to start from.
      d.marker.x = retreat.x;
      d.marker.y = retreat.y;
    } else if (!this.drawingSystem.isWalkable({ x: d.marker.x, y: d.marker.y })) {
      // Killed on ground a claim has since buried: fall back to the
      // nearest safe cell rather than the spawn point.
      const safe = this.nearestWalkable(d.marker.x, d.marker.y);
      d.marker.x = safe.x;
      d.marker.y = safe.y;
    }
    // Otherwise the marker is already on safe ground: leave it alone.

    this.render();
  }

  /**
   * The closest cell the marker may stand on, searched outwards in rings.
   */
  private nearestWalkable(fromX: number, fromY: number): Point {
    for (let r = 1; r < Math.max(FIELD_WIDTH, FIELD_HEIGHT); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

          const point = { x: fromX + dx, y: fromY + dy };
          if (this.drawingSystem.isWalkable(point)) return point;
        }
      }
    }

    // The frame is always walkable, so this is unreachable in practice.
    return { x: Math.floor(FIELD_WIDTH / 2), y: FIELD_HEIGHT - 1 };
  }

  /**
   * Check if word is complete
   */
  private checkWordComplete(): boolean {
    const d = this.data;
    if (!d.levelWord) return false;

    const needed = d.levelWord.split('');
    return needed.every(letter => d.collectedLetters.includes(letter));
  }

  /**
   * Level complete
   */
  private levelComplete(): void {
    const d = this.data;

    // The area and word bonuses are worked out and credited by
    // startLevelOutro, which also owns the tally the player is shown.
    // There was a second area bonus here as well, so every cleared level
    // paid for the same percentage twice.

    // Extra life for 98%+
    if (d.claimedPercent >= EXTRA_LIFE_PERCENT) {
      d.lives++;
    }

    this.startLevelOutro();

    d.state = 'levelTransition';
    d.transitionMessage = `LEVEL ${d.level} COMPLETE!`;
    d.transitionTimer = 90;  // 3 seconds at 30fps

    this.render();
  }

  /**
   * Advance to next level
   */
  advanceLevel(): void {
    const d = this.data;

    // FAQ 3: "Once you uncover them all, you go back to level 1 and
    // continue playing to increase your score."
    if (d.level >= LEVELS_PER_LAP) {
      d.level = 1;
      d.lap = (d.lap || 1) + 1;
    } else {
      d.level++;
    }

    this.initLevel(d.level);
    d.state = 'playing';
  }

  /**
   * Main render function
   */
  render(): void {
    const d = this.data;
    const lines: string[] = [];

    // Render buffer holds a glyph plus its own fg/bg, painted directly per
    // layer - not a char code looked up afterwards. Terrain cells share the
    // same space glyph (border/unclaimed/claimed/stix are all blocks), so a
    // char->color lookup can no longer tell them apart; bg is now what
    // carries the meaning.
    // `art` carries the CELL_WIDTH characters of the hidden picture that sit
    // behind this cell, each with its own colours. A claimed cell is drawn
    // as those characters; everything else uses ch/fg/bg.
    type Cell = { ch: string; fg?: string; bg?: string; art?: ArtCell[] };
    const buffer: Cell[][] = [];
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      buffer[y] = [];
      for (let x = 0; x < FIELD_WIDTH; x++) {
        buffer[y][x] = { ch: ' ', bg: BG_COLORS.unclaimed };
      }
    }

    // Draw field
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      for (let x = 0; x < FIELD_WIDTH; x++) {
        const cell = d.field[y][x];

        // The end-of-level sequence paints the field itself: the picture
        // once the reveal has passed a column, plain ground once the
        // clearing wipe has.
        const outroCell = this.outroCellAt(x, y, cell);
        if (outroCell) {
          buffer[y][x] = outroCell;
          continue;
        }

        switch (cell) {
          case 'border':
            // The frame is also the Time Meter: the squares already
            // consumed show red, two at a time, until the whole border
            // is red and two more Skulls are released (FAQ 1).
            buffer[y][x] = {
              ch: ' ',
              bg: this.isMeterFilled(x, y) ? BG_COLORS.borderMeter : BG_COLORS.border,
            };
            break;
          case 'unclaimed':
            buffer[y][x] = { ch: ' ', bg: BG_COLORS.unclaimed };
            break;
          case 'claimed':
            // Claiming ground is what uncovers the picture. With no art
            // loaded this falls back to the flat colour it used to be.
            buffer[y][x] = this.background
              ? { ch: ' ', art: artForCell(this.background, x, y) }
              : { ch: ' ', bg: BG_COLORS.claimed };
            break;
          case 'stix':
            // The line being drawn is yellow (FAQ 2.1).
            buffer[y][x] = { ch: ' ', bg: BG_COLORS.stix };
            break;
        }
      }
    }

    // While the level is handing over, the picture has the board to itself.
    //
    // The player's lines, the marker, the Gremlin, the Skulls, the fuse and
    // any uncollected bonus are all held back until the sequence is done:
    // the whole point of the reveal is to show the finished picture, and
    // the lines were being drawn straight back over it.
    const handingOver = this.outro !== null;

    // The lines the player has already closed off stay drawn over the
    // picture they revealed.
    //
    // FAQ 2.1: the line you are drawing is yellow and "turns blue and
    // becomes 'Safe' if you can connect the other end either back to the
    // border or to part of a previously-finished line". Nothing drew them,
    // so the moment a claim filled in, the shape the player had just drawn
    // vanished into the artwork and the board lost its geometry.
    if (!handingOver) for (const line of d.internalLines) {
      for (const point of line) {
        if (point.y < 0 || point.y >= FIELD_HEIGHT) continue;
        if (point.x < 0 || point.x >= FIELD_WIDTH) continue;
        // Only where the claim actually took the ground: a line's ends sit
        // on the frame, which is drawn as the Time Meter.
        if (d.field[point.y][point.x] !== 'claimed') continue;

        buffer[point.y][point.x] = { ch: ' ', bg: BG_COLORS.stixSafe };
      }
    }

    // Draw current stix
    if (d.currentStix && !handingOver) {
      const bg = BG_COLORS.stix;
      for (const point of d.currentStix.points) {
        if (point.y >= 0 && point.y < FIELD_HEIGHT && point.x >= 0 && point.x < FIELD_WIDTH) {
          buffer[point.y][point.x] = { ch: ' ', bg };
        }
      }
    }

    // Draw Qix
    if (!handingOver) for (const qix of d.qixList) {
      const char = d.frameCount % 2 === 0 ? CHARS.qix : CHARS.qixAlt;
      const qx = Math.floor(qix.x);
      const qy = Math.floor(qix.y);
      if (qy >= 0 && qy < FIELD_HEIGHT && qx >= 0 && qx < FIELD_WIDTH) {
        buffer[qy][qx] = { ch: char, fg: 'white', bg: BG_COLORS.qix };
      }
      // Draw segments
      for (const seg of qix.segments) {
        const sx = Math.floor(seg.x);
        const sy = Math.floor(seg.y);
        if (sy >= 0 && sy < FIELD_HEIGHT && sx >= 0 && sx < FIELD_WIDTH) {
          buffer[sy][sx] = { ch: CHARS.qix, fg: 'white', bg: BG_COLORS.qix };
        }
      }
    }

    // Draw Sparx
    if (!handingOver) for (const sparx of d.sparxList) {
      const sx = Math.floor(sparx.x);
      const sy = Math.floor(sparx.y);
      if (sy >= 0 && sy < FIELD_HEIGHT && sx >= 0 && sx < FIELD_WIDTH) {
        // Every Skull looks the same: there are no Super Skulls.
        // Skulls chew, alternating an open and a closed mouth.
        const chewing = Math.floor(d.frameCount / SKULL_CHEW_FRAMES) % 2 === 0;
        buffer[sy][sx] = {
          ch: chewing ? CHARS.sparx : CHARS.sparxChew,
          fg: 'lightyellow',
          bg: BG_COLORS.sparx
        };
      }
    }

    // Draw Fuse
    if (d.fuse && d.fuse.active && !handingOver) {
      const fx = Math.floor(d.fuse.x);
      const fy = Math.floor(d.fuse.y);
      if (fy >= 0 && fy < FIELD_HEIGHT && fx >= 0 && fx < FIELD_WIDTH) {
        const char = d.frameCount % 2 === 0 ? CHARS.fuse : CHARS.fuseHead;
        buffer[fy][fx] = { ch: char, fg: 'black', bg: BG_COLORS.fuse };
      }
    }

    // Draw power-ups
    if (!handingOver) for (const powerUp of d.powerUps) {
      if (!powerUp.collected) {
        const px = Math.floor(powerUp.x);
        const py = Math.floor(powerUp.y);
        if (py >= 0 && py < FIELD_HEIGHT && px >= 0 && px < FIELD_WIDTH) {
          buffer[py][px] = { ch: powerUp.letter || CHARS.powerUp, fg: 'white', bg: BG_COLORS.powerUp };
        }
      }
    }

    // Draw marker
    const mx = d.marker.x;
    const my = d.marker.y;
    if (!handingOver && my >= 0 && my < FIELD_HEIGHT && mx >= 0 && mx < FIELD_WIDTH) {
      // The arcade marker is an animated sprite. No glyph: the cycling
      // block IS the sprite, and a character on top only muddies it
      // against the picture behind.
      const cycle = MARKER_CYCLE[
        Math.floor(d.frameCount / MARKER_CYCLE_FRAMES) % MARKER_CYCLE.length
      ];
      buffer[my][mx] = { ch: ' ', bg: cycle };
    }

    // Convert the buffer to characters, one entry per screen column.
    //
    // Each logical cell is CELL_WIDTH characters wide so that a cell is as
    // wide as it is tall on screen. Panels are laid over these characters
    // rather than over whole rows, so the picture behind a message still
    // shows - the tally used to be painted on a black band that wiped out
    // the very picture the reveal exists to show.
    type Painted = { ch: string; fg?: string; bg?: string };
    const grid: Painted[][] = [];

    for (let y = 0; y < buffer.length; y++) {
      const row: Painted[] = [];

      for (let x = 0; x < buffer[y].length; x++) {
        const { ch, fg, bg, art } = buffer[y][x];

        // Revealed picture: each art character keeps its own colours, so
        // the two columns of a cell can differ - which is what makes it
        // read as artwork rather than a coloured block.
        if (art) {
          for (const part of art) {
            row.push({
              ch: part.char,
              fg: ART_PALETTE[part.fg] || 'white',
              bg: ART_PALETTE[part.bg] || 'black',
            });
          }
          continue;
        }

        row.push({ ch, fg, bg });
        for (let i = 1; i < CELL_WIDTH; i++) row.push({ ch: ' ', fg, bg });
      }

      grid.push(row);
    }

    // The end-of-level sequence and the game-over screen speak for
    // themselves. Without any of this the field simply froze.
    const panel = this.gameOverPanel() ?? this.outroPanel();
    if (panel) {
      this.overlayPanel(grid, panel);
    } else if (d.transitionMessage && d.state === 'levelTransition') {
      this.overlayPanel(grid, [
        { text: d.transitionMessage, colour: 'lightyellow' },
      ]);
    }

    for (const row of grid) {
      let line = '';
      let run = '';
      let fg: string | undefined;
      let bg: string | undefined;

      const flush = () => {
        if (!run) return;
        let piece = run;
        if (fg) piece = `{${fg}-fg}${piece}{/${fg}-fg}`;
        if (bg) piece = `{${bg}-bg}${piece}{/${bg}-bg}`;
        line += piece;
        run = '';
      };

      for (const cell of row) {
        if (cell.fg !== fg || cell.bg !== bg) { flush(); fg = cell.fg; bg = cell.bg; }
        run += cell.ch;
      }
      flush();
      lines.push(line);
    }

    this.renderCallback(lines.join('\n'));
  }
}
