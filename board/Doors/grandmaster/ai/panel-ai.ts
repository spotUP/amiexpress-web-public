/**
 * The CPU player, ported from a544jh/panel-pop's AI/ directory.
 *
 * WHY THIS SOURCE. panel-attack, which every mechanic in this engine comes
 * from, has NO board-playing AI at all - its computerPlayers folder contains
 * only a DummyCpu that holds swap+down forever and is never called. panel-pop's
 * is the only open-source Panel de Pon bot in existence, so it is what a CPU
 * opponent can be ported from rather than invented.
 *
 * BE HONEST ABOUT WHAT IT IS. It does not search, evaluate or plan. Its whole
 * strategy is: find a colour that appears somewhere on three consecutive rows
 * and drag those instances into one column; if the stack is getting high, shove
 * a panel sideways into a hole instead; otherwise press raise. Its chain-
 * planning code exists upstream but is never called and the author's own
 * comment says it "doesn't quite work yet", so it is not ported. It cannot see
 * garbage at all.
 *
 * That is roughly the right calibre. A player who beat the real thing described
 * the level 7 CPU as "actually an extremely inefficient opponent" that "fails
 * in the garbage chaining section" and cannot do solid x13 chains.
 *
 * IT PLAYS THROUGH THE SAME DOOR THE PLAYER DOES. It emits an input mask per
 * frame - cursor, swap, raise - and never touches the board directly. So it is
 * subject to every rule a human is: the four-frame swap, the every-other-frame
 * swap refusal, rise lock, and the cursor's own auto-repeat.
 *
 * THE ONE ADDITION. panel-pop has a single hardcoded speed; the original has
 * eight CPU levels. Its two tunable numbers are lifted into a level table, and
 * the DECISION LOGIC is untouched - every level plays the same way, faster or
 * slower.
 */

import type { Stack } from '../core/panels/stack';
import { INPUT_BITS } from '../core/panels/input-codec';

/** What the controller queues up for itself. */
type InputAction = 'up' | 'down' | 'left' | 'right' | 'swap' | 'raise' | 'wait';

interface BlockMove {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface VerticalMatch {
  found: boolean;
  color: number;
  bottomRow: number;
  topRow: number;
}

export interface AiLevel {
  /** Game frames between actions. Lower is faster. */
  thinkInterval: number;
  /** Consecutive rows that must share a colour before it will act on it. */
  matchThreshold: number;
}

/**
 * The eight CPU levels.
 *
 * Level 5 is panel-pop's own hardcoded speed - one action every five frames -
 * so it is the calibrated middle and the others fan out from it. Only the
 * interval and the threshold change; the algorithm never does.
 */
export const AI_LEVELS: readonly AiLevel[] = [
  { thinkInterval: 12, matchThreshold: 3 }, // 0: slow, misses a great deal
  { thinkInterval: 10, matchThreshold: 3 },
  { thinkInterval: 8, matchThreshold: 3 },
  { thinkInterval: 7, matchThreshold: 3 },
  { thinkInterval: 6, matchThreshold: 3 },
  { thinkInterval: 5, matchThreshold: 3 }, // 5: panel-pop's original speed
  { thinkInterval: 4, matchThreshold: 3 },
  { thinkInterval: 3, matchThreshold: 3 }, // 7: near frame-perfect
];

export const MAX_AI_LEVEL = AI_LEVELS.length - 1;

/** Rows from the top within which the AI considers itself in trouble. */
const PANIC_ROWS = 3;

/**
 * Reads a board the way panel-pop's BoardScanner does.
 *
 * Every query is deliberately shallow: "is there a block here", "which column
 * holds this colour on this row". There is no evaluation function anywhere,
 * because upstream has none.
 */
class BoardScanner {
  constructor(private readonly stack: Stack) {}

  /** A settled, ordinary panel - not empty, not garbage, not mid-anything. */
  private isSettledBlock(row: number, col: number): boolean {
    const panel = this.stack.panels[row]?.[col];
    return !!panel && panel.color !== 0 && !panel.isGarbage && panel.state === 'normal';
  }

  private isAir(row: number, col: number): boolean {
    const panel = this.stack.panels[row]?.[col];
    return !!panel && panel.color === 0;
  }

  /** Is anything sitting near the top? */
  isPanicking(): boolean {
    const { height, width } = this.stack;
    for (let row = height - PANIC_ROWS + 1; row <= height; row++) {
      for (let col = 1; col <= width; col++) {
        if (this.isSettledBlock(row, col)) return true;
      }
    }
    return false;
  }

  /** How many of each colour sit on each row. */
  private countRowColors(): Map<number, number>[] {
    const rows: Map<number, number>[] = [];
    for (let row = 0; row <= this.stack.height; row++) {
      const counts = new Map<number, number>();
      for (let col = 1; col <= this.stack.width; col++) {
        if (!this.isSettledBlock(row, col)) continue;
        const color = this.stack.panels[row][col].color;
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
      rows[row] = counts;
    }
    return rows;
  }

  /**
   * A colour present on `threshold` consecutive rows.
   *
   * Note this is NOT a match - it is "these rows each contain this colour
   * somewhere", which is the loose condition the bot then tries to turn into a
   * real vertical match by dragging them into one column.
   */
  findVerticalMatch(threshold: number): VerticalMatch {
    const rowColors = this.countRowColors();
    const { height } = this.stack;

    for (let color = 1; color <= 8; color++) {
      let topRow = height;
      let sameColorFound = 0;

      for (let row = height; row >= 1; row--) {
        if ((rowColors[row].get(color) ?? 0) > 0) {
          sameColorFound += 1;
        } else {
          if (sameColorFound >= threshold) {
            return { found: true, color, bottomRow: row + 1, topRow };
          }
          topRow = row - 1;
          sameColorFound = 0;
        }
      }

      if (sameColorFound >= threshold) {
        return { found: true, color, bottomRow: 1, topRow };
      }
    }

    return { found: false, color: 0, bottomRow: 0, topRow: 0 };
  }

  /** The column holding `color` on `row`, or -1. */
  findColorCol(color: number, row: number): number {
    for (let col = 1; col <= this.stack.width; col++) {
      const panel = this.stack.panels[row]?.[col];
      if (panel && !panel.isGarbage && panel.color === color) return col;
    }
    return -1;
  }

  /**
   * A panel that can be pushed sideways into a hole, so it falls and flattens
   * the stack. This is the bot's entire panic response.
   */
  findStackFlatteningMove(): BlockMove | null {
    const { height, width } = this.stack;

    for (let row = height; row >= 2; row--) {
      for (let col = 1; col <= width; col++) {
        if (!this.isSettledBlock(row, col)) continue;

        // Leftwards across contiguous air, into a column with air beneath.
        for (let target = col - 1; target >= 1; target--) {
          if (!this.isAir(row, target)) break;
          if (this.isAir(row - 1, target)) return { x: col, y: row, dx: target, dy: row };
        }
        // And rightwards.
        for (let target = col + 1; target <= width; target++) {
          if (!this.isAir(row, target)) break;
          if (this.isAir(row - 1, target)) return { x: col, y: row, dx: target, dy: row };
        }
      }
    }

    return null;
  }
}

/**
 * The controller.
 *
 * Three FIFO queues drained in strict priority order, one item per think tick:
 * raw inputs first, then a queued cursor destination, then a block to carry.
 * Only when all three are empty does it look at the board again - so a plan,
 * once made, is played out even if the board has moved under it. That is
 * upstream's behaviour and part of why the bot is beatable.
 */
export class PanelAi {
  private readonly scanner: BoardScanner;
  private readonly level: AiLevel;
  private inputQueue: InputAction[] = [];
  private blockMoveQueue: BlockMove[] = [];

  constructor(private readonly stack: Stack, level = 5) {
    this.level = AI_LEVELS[Math.max(0, Math.min(level, MAX_AI_LEVEL))];
    this.scanner = new BoardScanner(stack);
  }

  /**
   * The input mask for this frame.
   *
   * Idle on every frame that is not a think tick, which is what makes a level
   * slow: the bot is not thinking harder, it is simply acting less often.
   */
  update(): number {
    if (this.stack.gameEnded()) return 0;
    if (this.stack.clock % this.level.thinkInterval !== 0) return 0;

    if (this.inputQueue.length === 0 && this.blockMoveQueue.length === 0) {
      this.plan();
    }

    if (this.inputQueue.length > 0) {
      return PanelAi.maskFor(this.inputQueue.shift() as InputAction);
    }
    if (this.blockMoveQueue.length > 0) {
      const move = this.blockMoveQueue.shift() as BlockMove;
      this.expandBlockMove(move);
      if (this.inputQueue.length > 0) {
        return PanelAi.maskFor(this.inputQueue.shift() as InputAction);
      }
    }
    return 0;
  }

  /** Decide what to do next. Called only when nothing is queued. */
  private plan(): void {
    const match = this.scanner.findVerticalMatch(this.level.matchThreshold);
    const flattening = this.scanner.findStackFlatteningMove();

    // In trouble: flatten rather than build.
    if (this.scanner.isPanicking() && flattening) {
      this.blockMoveQueue.push(flattening);
      return;
    }

    // Nothing to build with: feed itself a new row.
    if (!match.found) {
      this.inputQueue.push('raise');
      return;
    }

    this.planVerticalMatch(match);
  }

  /**
   * Drag every instance of the colour into the column the topmost one is in.
   *
   * Rows are visited outside-in - top, bottom, next-to-top, next-to-bottom -
   * which is upstream's ordering. A column lookup can return -1 when the panel
   * has moved or popped since the plan was made; those moves simply produce
   * harmless nonsense presses rather than an error, exactly as in the original.
   */
  private planVerticalMatch(match: VerticalMatch): void {
    const targetColumn = this.scanner.findColorCol(match.color, match.topRow);
    const firstRow = match.topRow - 1;
    let alt = 0;

    for (let i = 0; i <= firstRow - match.bottomRow; i++) {
      const row = i % 2 === 0 ? firstRow - alt : match.bottomRow + alt++;
      const column = this.scanner.findColorCol(match.color, row);
      this.blockMoveQueue.push({ x: column, y: row, dx: targetColumn, dy: row });
    }
  }

  /**
   * Turn "carry this panel to that column" into presses.
   *
   * Moving right means swapping repeatedly from the panel's own cell; moving
   * left means standing one cell to the left and doing the same. The bot only
   * ever moves panels horizontally - upstream throws if asked to move one up.
   */
  private expandBlockMove(move: BlockMove): void {
    if (move.dy > move.y) return; // upstream errors here; nothing calls it that way

    if (move.dx > move.x) {
      this.queueCursorMove(move.x, move.y);
      for (let i = 0; i < move.dx - move.x; i++) {
        this.inputQueue.push('swap');
        this.inputQueue.push('right');
      }
    } else if (move.dx < move.x) {
      this.queueCursorMove(move.x - 1, move.y);
      for (let i = 0; i < move.x - move.dx; i++) {
        this.inputQueue.push('swap');
        this.inputQueue.push('left');
      }
    }
  }

  /** Manhattan walk to a cell: horizontal first, then vertical. */
  private queueCursorMove(x: number, y: number): void {
    const curX = this.stack.curCol;
    const curY = this.stack.curRow;

    for (let i = 0; i < x - curX; i++) this.inputQueue.push('right');
    for (let i = 0; i < curX - x; i++) this.inputQueue.push('left');
    for (let i = 0; i < y - curY; i++) this.inputQueue.push('up');
    for (let i = 0; i < curY - y; i++) this.inputQueue.push('down');
  }

  private static maskFor(action: InputAction): number {
    switch (action) {
      case 'up': return INPUT_BITS.UP;
      case 'down': return INPUT_BITS.DOWN;
      case 'left': return INPUT_BITS.LEFT;
      case 'right': return INPUT_BITS.RIGHT;
      case 'swap': return INPUT_BITS.SWAP;
      case 'raise': return INPUT_BITS.RAISE;
      case 'wait':
      default: return 0;
    }
  }
}
