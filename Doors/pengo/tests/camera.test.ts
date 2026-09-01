/**
 * The camera that scrolls the 15x17 world through the 11-row window the
 * terminal can show.
 *
 * `buildBoard` used to return the world buffer directly - grid coordinates
 * and board coordinates were the same thing, because the world always fit
 * the screen. Once the world (15 rows) outgrew the view (11 rows) that
 * stopped being true: a grid cell's row in the returned buffer depends on
 * where the camera is currently looking, and something below the window
 * has to say so in the HUD rather than vanish. This is what pins both.
 */

import assert from 'assert';
import { join } from 'path';
import {
  loadSpriteSheet, Cell, CellBuffer,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { buildBoard } from '../game/render';
import { cameraWindowCells, offscreenEnemyMarkers } from '../game/camera';
import { createInitialGameData } from '../game/initial-data';
import { PengoGame } from '../game/pengo-game';
import { PengoData } from '../game/types';
import { GRID_WIDTH, GRID_HEIGHT, VIEW_GRID_ROWS, CELL_W, CELL_H } from '../game/constants';

const sheet = loadSpriteSheet(join(__dirname, '..', 'sprites'));

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
    x: 6, y: 4, direction: 'right',
    isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
  };
  return { game, data };
}

/** Whether the cell at a grid position drew any ink in a (possibly
 *  cropped) board buffer, given the window that buffer was cropped to. */
function isDrawnInView(
  board: CellBuffer, windowCellY: number, gridX: number, gridY: number
): boolean {
  const localY = gridY - windowCellY;
  if (localY < 0 || localY >= VIEW_GRID_ROWS) return false;
  for (let r = 0; r < CELL_H; r++) {
    for (let c = 0; c < CELL_W; c++) {
      const cell = board[localY * CELL_H + r]?.[gridX * CELL_W + c] as Cell | null;
      if (cell && cell.char !== ' ') return true;
    }
  }
  return false;
}

/** cameraWindowCells centres on Pengo, clamped so it never runs off the maze. */
export async function theCameraCentresOnPengoAndClampsToTheMaze(): Promise<void> {
  const top = cameraWindowCells(0);
  assert.strictEqual(top.y, 0, 'clamped at the top of the maze');

  const bottom = cameraWindowCells(GRID_HEIGHT - 1);
  assert.strictEqual(bottom.y, GRID_HEIGHT - VIEW_GRID_ROWS, 'clamped at the bottom of the maze');
  assert.strictEqual(bottom.y + bottom.height, GRID_HEIGHT, 'the last row of the maze is reachable');

  const middle = cameraWindowCells(7);
  assert.ok(middle.y > 0 && middle.y < bottom.y, 'a middling focus scrolls, rather than clamping');
}

/** The camera never scrolls horizontally - the world is exactly as wide as the view. */
export async function theCameraDoesNotScrollHorizontally(): Promise<void> {
  const window = cameraWindowCells(7);
  assert.strictEqual(window.x, 0);
  assert.strictEqual(window.width, GRID_WIDTH);
}

/**
 * A diamond near the bottom of the maze is invisible while Pengo (and so
 * the camera) is near the top, and visible once the camera scrolls down
 * to it - proof buildBoard actually crops, not just resizes the buffer.
 */
export async function theWorldScrollsIntoAndOutOfView(): Promise<void> {
  const { data } = emptyBoard();
  const farRow = GRID_HEIGHT - 2; // deep in the maze, off the top-anchored window
  data.grid[farRow][6] = 'diamond';

  data.pengo.y = 1; // camera clamps to the top; farRow is below the window
  const nearTop = buildBoard(data, sheet, 0);
  assert.strictEqual(
    isDrawnInView(nearTop, cameraWindowCells(data.pengo.y).y, 6, farRow), false,
    'a cell below the camera window must not be drawn'
  );

  data.pengo.y = farRow; // camera follows Pengo down to it
  const scrolled = buildBoard(data, sheet, 0);
  assert.strictEqual(
    isDrawnInView(scrolled, cameraWindowCells(data.pengo.y).y, 6, farRow), true,
    'the same cell must be drawn once the camera has scrolled to cover it'
  );
}

/** An enemy outside the camera window is reported, with which way it lies. */
export async function anEnemyBelowTheWindowIsReportedOffscreen(): Promise<void> {
  const { data } = emptyBoard();
  data.pengo.y = 1; // window clamped to the top: rows 0..(VIEW_GRID_ROWS-1)
  data.enemies = [{
    id: 1, x: 6, y: GRID_HEIGHT - 2, direction: 'up', state: 'walking',
    stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
  }];

  const markers = offscreenEnemyMarkers(data);
  assert.strictEqual(markers.length, 1);
  assert.strictEqual(markers[0].direction, 's');
  assert.strictEqual(markers[0].item, data.enemies[0], 'hands back the real enemy, for the HUD to describe');
}

/** The same enemy stops being offscreen once the camera has scrolled to it. */
export async function anEnemyInsideTheWindowIsNotReportedOffscreen(): Promise<void> {
  const { data } = emptyBoard();
  const enemyY = GRID_HEIGHT - 2;
  data.enemies = [{
    id: 1, x: 6, y: enemyY, direction: 'up', state: 'walking',
    stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
  }];
  data.pengo.y = enemyY; // camera follows Pengo to the enemy's row

  assert.deepStrictEqual(offscreenEnemyMarkers(data), []);
}

/** A dead Sno-Bee is not something to warn about - it cannot reach anyone. */
export async function aDeadEnemyIsNeverReportedOffscreen(): Promise<void> {
  const { data } = emptyBoard();
  data.pengo.y = 1;
  data.enemies = [{
    id: 1, x: 6, y: GRID_HEIGHT - 2, direction: 'up', state: 'dead',
    stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
  }];

  assert.deepStrictEqual(offscreenEnemyMarkers(data), []);
}
