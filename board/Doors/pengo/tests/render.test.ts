/**
 * The sprite renderer.
 *
 * buildBoard is pure in (data, sheet, tick), so everything the player sees
 * is assertable: where the penguin is drawn, that a stunned Sno-Bee looks
 * stunned, that death animates and then holds. The four glyph-collision
 * bugs of 2026-08-31 (galaga's '.', donkey-kong's 'H', zoo-keeper's '@',
 * joust's '{') were all "the buffer cannot say what this is" bugs; a Cell
 * carries its own colours, so none of them can come back.
 */

import assert from 'assert';
import { join } from 'path';
import {
  loadSpriteSheet, Cell, CellBuffer,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { buildBoard } from '../game/render';
import { createInitialGameData } from '../game/initial-data';
import { PengoGame } from '../game/pengo-game';
import { PengoData } from '../game/types';
import {
  GRID_WIDTH, GRID_HEIGHT, CELL_W, CELL_H, BOARD_COLS, BOARD_ROWS, CRUSH_FRAMES,
} from '../game/constants';

const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

/** A board the test controls completely (same shape as the sfx suite's). */
function emptyBoard(): { game: PengoGame; data: PengoData } {
  const data = createInitialGameData();
  const game = new PengoGame(data, () => { /* no display */ }, sheet);
  game.initLevel();
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const edge = x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1;
      data.grid[y][x] = edge ? 'wall' : 'empty';
    }
  }
  data.enemies = [];
  data.eggs = [];
  data.state = 'playing';
  data.pengo = {
    x: 4, y: 4, direction: 'right',
    isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
  };
  return { game, data };
}

/** The characters drawn inside one grid cell, as a string. */
function cellChars(board: CellBuffer, gridX: number, gridY: number): string {
  let out = '';
  for (let r = 0; r < CELL_H; r++) {
    for (let c = 0; c < CELL_W; c++) {
      const cell = board[gridY * CELL_H + r][gridX * CELL_W + c];
      out += cell ? (cell as Cell).char : ' ';
    }
  }
  return out;
}

export async function theBoardIsExactlyTheScreenItClaims(): Promise<void> {
  const { data } = emptyBoard();
  const board = buildBoard(data, sheet, 0);
  assert.strictEqual(board.length, BOARD_ROWS);
  assert.strictEqual(board[0].length, BOARD_COLS);
}

export async function thePenguinIsDrawnWhereItStands(): Promise<void> {
  const { data } = emptyBoard();
  const board = buildBoard(data, sheet, 0);
  assert.ok(cellChars(board, 4, 4).trim().length > 0, 'the penguin cell has ink');
  assert.ok(cellChars(board, 5, 5).trim().length === 0, 'an empty floor cell has none');
}

export async function facingIsVisible(): Promise<void> {
  const { data } = emptyBoard();
  data.pengo.direction = 'right';
  const right = cellChars(buildBoard(data, sheet, 0), 4, 4);
  data.pengo.direction = 'left';
  const left = cellChars(buildBoard(data, sheet, 0), 4, 4);
  assert.notStrictEqual(right, left, 'facing must be visible in the sprite');
}

export async function walkingAnimates(): Promise<void> {
  const { data } = emptyBoard();
  const t0 = cellChars(buildBoard(data, sheet, 0), 4, 4);
  const t3 = cellChars(buildBoard(data, sheet, 3), 4, 4);
  assert.notStrictEqual(t0, t3, 'the walk cycle must move between ticks');
}

export async function aStunnedSnoBeeLooksStunned(): Promise<void> {
  const { data } = emptyBoard();
  data.enemies = [{
    id: 1, x: 6, y: 6, direction: 'left', state: 'walking',
    stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
  }];
  const walking = buildBoard(data, sheet, 0);
  data.enemies[0].state = 'stunned';
  const stunned = buildBoard(data, sheet, 0);

  const cellOf = (b: CellBuffer) => {
    const cell = b[6 * CELL_H][6 * CELL_W + 1] as Cell;
    return cell ? cell.fg : -1;
  };
  assert.notStrictEqual(cellOf(walking), cellOf(stunned),
    'a stunned Sno-Bee must not be drawn in the threat colour');
}

export async function deathAnimatesAndThenHolds(): Promise<void> {
  const { data } = emptyBoard();
  data.pengo.isDead = true;
  data.pengo.deathFrame = 0;
  const start = cellChars(buildBoard(data, sheet, 0), 4, 4);
  data.pengo.deathFrame = 18;
  const late = cellChars(buildBoard(data, sheet, 0), 4, 4);
  data.pengo.deathFrame = 40;
  const held = cellChars(buildBoard(data, sheet, 0), 4, 4);

  assert.notStrictEqual(start, late, 'death is an animation, not a pose');
  assert.strictEqual(late, held, 'and it holds the last frame');
}

export async function aFreshSlidePlaysTheSlideFlash(): Promise<void> {
  const { data } = emptyBoard();
  data.grid[3][7] = 'ice';
  const calm = cellChars(buildBoard(data, sheet, 100), 7, 3);
  data.lastSlide = { x: 7, y: 3, tick: 100 };
  const flash = cellChars(buildBoard(data, sheet, 102), 7, 3);
  const after = cellChars(buildBoard(data, sheet, 160), 7, 3);

  assert.notStrictEqual(calm, flash, 'a just-pushed block flashes');
  assert.strictEqual(after, calm, 'and calms back down');
}

export async function renderEmitsTagsNotGlyphPairs(): Promise<void> {
  const { game } = emptyBoard();
  let content = '';
  const g = new PengoGame(
    (game as any).data, (c: string) => { content = c; }, sheet
  );
  g.render();
  const rows = content.split('\n');
  assert.strictEqual(rows.length, BOARD_ROWS, 'render emits exactly the board');
  assert.ok(rows[0].includes('-fg}'), 'rows are tagged');
}

/**
 * A crushed Sno-Bee is visible while it is being crushed.
 *
 * Reported live: "when i push a block against an enemy it doesn't animate
 * it's buggy". The crush set the enemy straight to 'dead', which the
 * renderer skips and the tick filters out, so the enemy vanished on the
 * same frame the block reached it - the one moment the whole game is about.
 */
export async function aCrushedSnoBeeIsDrawnWhileItIsCrushed(): Promise<void> {
  const { data } = emptyBoard();
  data.enemies.push({
    id: 1, x: 3, y: 3, direction: 'left', state: 'crushed',
    stunTimer: 0, crushTimer: CRUSH_FRAMES, hatchTimer: 0, moveTimer: 0,
  });
  const enemy = data.enemies[data.enemies.length - 1];

  // Both rows of the cell: a squash is flattened into the BOTTOM row, so
  // looking only at the top one would find nothing and prove nothing.
  const board = buildBoard(data, sheet, 0);
  const drawn: Array<Cell | null> = [];
  for (let r = enemy.y * CELL_H; r < enemy.y * CELL_H + CELL_H; r++) {
    drawn.push(...(board[r]?.slice(enemy.x * CELL_W, enemy.x * CELL_W + CELL_W) ?? []));
  }
  assert.ok(drawn.some(c => c && c.char !== ' '),
    'a Sno-Bee being crushed still draws something');
}

/** And it is gone once the squash has played out. */
export async function aCrushedSnoBeeIsRemovedAfterItsAnimation(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies.push({
    id: 1, x: 3, y: 3, direction: 'left', state: 'crushed',
    stunTimer: 0, crushTimer: 2, hatchTimer: 0, moveTimer: 0,
  });
  const enemy = data.enemies[data.enemies.length - 1];

  for (let i = 0; i < 4; i++) game.update();

  assert.ok(!data.enemies.includes(enemy),
    'the Sno-Bee is removed once its squash has finished');
}
