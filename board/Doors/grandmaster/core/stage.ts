/**
 * TARGET's stages: a field laid out in advance, with blocks you must clear.
 *
 * Reference type 6 (`mission.c:882-902`, loader at `tomoyo.c:1403-1440`). A
 * stage is a fixed field of ordinary blocks and PLATINUM ones; the stage is
 * cleared when no platinum block is left (`tomoyo.c:334-352` counts them),
 * and the mission then wipes the field and loads the next stage.
 *
 * The 173 shipped stages are the reference's own, converted by
 * `dev/scripts/convert-heboris-stages.py` into `assets/stages/stages.json`.
 * Cells are characters there: '.' empty, '2'..'9' an ordinary block in the
 * reference's numbering, 'A' upwards platinum.
 */
import type { Board, Cell, PieceType } from './types';

/** One stage, as it is stored. */
export interface Stage {
  /** Three digits, the reference's own stage number. */
  id: string;
  /** 21 rows of 10 characters. */
  rows: string[];
  /** The rising field, when the stage has one: 20 rows of 10. */
  rise?: string[];
  /**
   * Rules the stage itself switches on, over whatever the mission asked for
   * (`tomoyo.c:1420-1448`). Eleven of the shipped stages carry one.
   */
  rules?: {
    mirror?: boolean;
    rollRoll?: boolean;
    big?: boolean;
    xray?: boolean;
    color?: boolean;
    blind?: boolean;
    hideNext?: boolean;
  };
  /**
   * How often this stage's floor rises, in PIECES (`tomoyo.c:1453`, spent in
   * `statBlock` at `gamestart.c:6908-6912` - the per-piece handler, which is
   * what makes the reference's small numbers mean anything). Absent is off.
   */
  riseEveryPieces?: number;
}

/** A whole pack of stages, as the JSON holds it. */
export interface StageSet {
  source: string;
  stages: Stage[];
}

/**
 * The colour an ordinary stage block is drawn in.
 *
 * The reference's block ids are its own palette; a door that has seven piece
 * colours spends them in order, so a stage keeps the SHAPE of its colouring -
 * two blocks that matched in the reference still match here.
 */
const STAGE_COLOURS: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Is this cell character a platinum block - the thing TARGET is about? */
export function isPlatinum(char: string): boolean {
  return char >= 'A' && char <= 'Z';
}

/** Turn one stage character into a cell. */
export function stageCell(char: string): Cell {
  if (char === '.') {
    return { filled: false, color: null, locked: false };
  }
  const platinum = isPlatinum(char);
  const index = platinum
    ? char.charCodeAt(0) - 'A'.charCodeAt(0)
    : char.charCodeAt(0) - '1'.charCodeAt(0);
  return {
    filled: true,
    color: STAGE_COLOURS[((index % STAGE_COLOURS.length) + STAGE_COLOURS.length) % STAGE_COLOURS.length],
    locked: true,
    platinum: platinum || undefined,
  };
}

/**
 * Lay a stage out on the board.
 *
 * The stage's 21 rows sit at the BOTTOM of the field: the reference writes
 * them from index 10 of a 220-cell field (`tomoyo.c:1412`), which is one row
 * of spawn space above them, and this board is taller still.
 */
export function applyStage(board: Board, stage: Stage): void {
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      board.grid[y][x] = { filled: false, color: null, locked: false };
    }
  }

  const top = board.height - stage.rows.length;
  for (let row = 0; row < stage.rows.length; row++) {
    const y = top + row;
    if (y < 0) continue;
    for (let x = 0; x < board.width && x < stage.rows[row].length; x++) {
      board.grid[y][x] = stageCell(stage.rows[row][x]);
    }
  }
}

/**
 * The next row of a stage's rising field, as cells.
 *
 * The reference feeds them onto the floor in order, oldest first, tracking
 * how far it has got with `upLineNo` (`gamestart.c:8348-8360`). A stage whose
 * rows have all been spent stops rising rather than repeating them.
 */
export function riseRow(stage: Stage, index: number): Cell[] | null {
  const rows = stage.rise;
  if (!rows || index < 0 || index >= rows.length) return null;
  return [...rows[index]].map(stageCell);
}

/** How many platinum blocks are left - zero means the stage is cleared. */
export function platinumLeft(board: Board): number {
  let left = 0;
  for (let y = 0; y < board.height; y++) {
    for (const cell of board.grid[y]) {
      if (cell.filled && cell.platinum) left++;
    }
  }
  return left;
}

/**
 * Which stages a mission plays, in order.
 *
 * The reference takes a MINSTAGE and a MAXSTAGE and, with RANDTGT set, picks
 * at random inside that band (`mission.c:244-330`); with it off the stages
 * run in order from the minimum.
 */
export function stageOrder(
  stages: Stage[],
  min: number,
  max: number,
  count: number,
  random: (() => number) | null = null,
): Stage[] {
  const first = Math.max(0, Math.min(min, stages.length - 1));
  const last = Math.max(first, Math.min(max, stages.length - 1));
  const band = stages.slice(first, last + 1);
  if (band.length === 0) return [];

  const order: Stage[] = [];
  for (let i = 0; i < count; i++) {
    order.push(random
      ? band[Math.min(band.length - 1, Math.floor(random() * band.length))]
      : band[i % band.length]);
  }
  return order;
}

/**
 * Read the shipped stages.
 *
 * `assets/`, not `data/`: stages are CONTENT that ships with the door, the
 * way the mission packs are. A board with no stage file simply has no TARGET
 * missions - the loader refuses them by name - rather than a door that will
 * not start.
 */
export function loadStages(file: string): Stage[] {
  const fs = require('fs') as typeof import('fs');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as StageSet;
  if (!raw || !Array.isArray(raw.stages)) {
    throw new Error(`${file}: no stages in it`);
  }
  for (const stage of raw.stages) {
    if (typeof stage.id !== 'string' || !Array.isArray(stage.rows)) {
      throw new Error(`${file}: a stage has no id or no rows`);
    }
  }
  return raw.stages;
}
