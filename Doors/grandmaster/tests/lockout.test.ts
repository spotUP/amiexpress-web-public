/**
 * Top-out regression tests.
 *
 * Symptom (reported live 2026-08-25): "the actual playfield is taller than
 * the visual playfield - when I am at the top I can play more rows outside
 * the visible playfield; the game doesn't stop when the piece crosses the
 * top border."
 *
 * The board is 24 rows but only 20 are rendered (game-screen draws y=4..23);
 * rows 0-3 are a spawn buffer no screen shows. The ONLY game-over condition
 * was BLOCK OUT - a new piece failing to spawn - so the stack kept growing
 * through those four invisible rows and play continued in space the player
 * could not see. `isTopOut()` existed but had no callers, and checked a
 * hardcoded 4 rows rather than deriving the visible region.
 *
 * Measured before the fix: the stack reached row 0 with 8 cells in the
 * hidden buffer. After: the first piece to rest above the visible top ends
 * the game, leaving only that piece's own cells up there.
 */

import assert from 'assert';
import { GameEngine } from '../core/game';
import { createBoard, getVisibleTop, isTopOut, VISIBLE_ROWS } from '../core/board';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const settings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};

export async function visibleTopMatchesWhatIsRendered(): Promise<void> {
  const b = createBoard(10, 24);
  assert.strictEqual(VISIBLE_ROWS, 20);
  // game-screen renders y=4..23, so the first visible row must be 4.
  assert.strictEqual(getVisibleTop(b), 4);
}

export async function isTopOutDerivesTheVisibleRegion(): Promise<void> {
  const b = createBoard(10, 24);
  assert.strictEqual(isTopOut(b), false);

  // A locked cell inside the visible field is not a top-out.
  b.grid[getVisibleTop(b)][3].filled = true;
  b.grid[getVisibleTop(b)][3].locked = true;
  assert.strictEqual(isTopOut(b), false);

  // A locked cell above it is.
  b.grid[getVisibleTop(b) - 1][3].filled = true;
  b.grid[getVisibleTop(b) - 1][3].locked = true;
  assert.strictEqual(isTopOut(b), true);
}

export async function playDoesNotContinueAboveTheVisibleField(): Promise<void> {
  const engine: any = new GameEngine('versus', settings, sounds);
  engine.start();
  const visibleTop = getVisibleTop(engine.getState().board);

  let drops = 0;
  while (engine.getState().status === 'playing' && drops < 400) {
    engine.hardDrop();
    for (let f = 0; f < 40; f++) engine.update(16);
    drops++;
  }

  const st = engine.getState();
  assert.strictEqual(st.status, 'gameover', 'stacking straight up must end the game');

  // Only the piece that triggered the lock-out may sit above the visible
  // top. Before the fix the stack filled the buffer all the way to row 0.
  let hiddenCells = 0;
  for (let y = 0; y < visibleTop; y++) {
    for (let x = 0; x < st.board.width; x++) {
      if (st.board.grid[y][x].filled) hiddenCells++;
    }
  }
  assert.ok(hiddenCells <= 4,
    `at most one piece may rest above the visible field, found ${hiddenCells} cells`);
}
