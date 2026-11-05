/**
 * The panel state machine, transition by transition.
 *
 * These pin the behaviours that the frame tables feed into, and that the chain
 * rules depend on. Each one names the rule it protects, because most of them
 * look like arbitrary arithmetic until you know why:
 *
 *   - a match timer is FLASH + FACE + 1, and the +1 is not slack: a match is
 *     always found before the timer decrements on that same frame
 *   - a panel pops at comboIndex * POP and then waits (comboSize - comboIndex)
 *     * POP, so an entire match finishes together no matter its size
 *   - the LAST panel of a match skips popped state altogether
 *   - a panel that finishes a swap over a gap gets FULL hover time, while a
 *     falling panel inherits the hover of the panel below
 *   - a panel that pops for good raises propagatesChaining for exactly one
 *     frame, which is the root of every chain in the game
 */

import assert from 'assert';
import { Panel, PanelGrid } from '../../core/panels/panel';
import { getModern, FrameConstants } from '../../core/panels/level-data';

const FRAMES: FrameConstants = getModern(1).frameConstants;

/** A grid of empty panels: rows 0..rows, columns 1..cols, as the engine indexes it. */
function makeGrid(rows: number, cols: number): PanelGrid {
  const panels: PanelGrid = [];
  let id = 0;
  for (let row = 0; row <= rows; row++) {
    panels[row] = [];
    for (let col = 1; col <= cols; col++) {
      const panel = new Panel(row, col, id++, FRAMES);
      // The stack owns these; a bare panel throws if they are called.
      panel.onPop = () => {};
      panel.onPopped = () => {};
      panel.onLand = () => {};
      panels[row][col] = panel;
    }
  }
  return panels;
}

export async function swapTakesFourFrames(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.color = 1;
  // Solid ground below: a swap that ends over a GAP hovers instead of settling,
  // which is the sibling case aSwapFinishingOverAGapGetsFullHoverTime covers.
  grid[1][3].color = 2;
  panel.startSwap(true);

  assert.strictEqual(panel.state, 'swapping');
  assert.strictEqual(panel.timer, 4, 'a swap is 4 frames, flat, not a level constant');

  for (let frame = 0; frame < 3; frame++) panel.update(grid);
  assert.strictEqual(panel.state, 'swapping', 'still swapping after 3 frames');

  panel.update(grid);
  assert.strictEqual(panel.state, 'normal', 'settled on the 4th');
}

export async function matchTimerIsFlashPlusFacePlusOne(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.color = 1;
  panel.match(false, 1, 3);

  assert.strictEqual(panel.state, 'matched');
  assert.strictEqual(
    panel.timer, FRAMES.FLASH + FRAMES.FACE + 1,
    'the +1 compensates for matching happening before the decrement',
  );
}

export async function aChainLinkMatchSetsTheChainingFlag(): Promise<void> {
  const grid = makeGrid(3, 6);
  const plain = grid[2][3];
  plain.color = 1;
  plain.match(false, 1, 3);
  assert.strictEqual(plain.chaining, false, 'an ordinary match does not chain');

  const link = grid[2][4];
  link.color = 1;
  link.match(true, 1, 3);
  assert.strictEqual(link.chaining, true, 'a chain-link match does');
}

export async function popTimersFollowPositionWithinTheMatch(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.color = 1;
  panel.match(false, 1, 3); // first of three to pop

  // Run out the flash and face.
  for (let i = 0; i < FRAMES.FLASH + FRAMES.FACE + 1; i++) panel.update(grid);
  assert.strictEqual(panel.state, 'popping');
  assert.strictEqual(panel.timer, 1 * FRAMES.POP, 'popping waits comboIndex * POP');

  for (let i = 0; i < FRAMES.POP; i++) panel.update(grid);
  assert.strictEqual(panel.state, 'popped');
  assert.strictEqual(
    panel.timer, (3 - 1) * FRAMES.POP,
    'then waits (comboSize - comboIndex) * POP so the whole match ends together',
  );
}

export async function theLastPanelOfAMatchSkipsPoppedState(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.color = 1;
  panel.match(false, 3, 3); // index === size: the last to pop

  for (let i = 0; i < FRAMES.FLASH + FRAMES.FACE + 1; i++) panel.update(grid);
  assert.strictEqual(panel.state, 'popping');

  for (let i = 0; i < 3 * FRAMES.POP; i++) panel.update(grid);
  assert.strictEqual(panel.color, 0, 'gone for good, without passing through popped');
  assert.strictEqual(panel.state, 'normal');
}

export async function aPanelThatPopsForGoodPropagatesChainingForOneFrame(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[1][3];
  panel.color = 1;
  panel.state = 'popped';
  panel.timer = 1;
  panel.comboIndex = 1;
  panel.comboSize = 1;

  panel.update(grid);
  assert.strictEqual(panel.propagatesChaining, true, 'the root of every chain');
  assert.strictEqual(panel.color, 0, 'and the cell is now empty');

  // The signal lives exactly one frame.
  panel.update(grid);
  assert.strictEqual(panel.propagatesChaining, false, 'it must not survive a second frame');
}

export async function aPanelAboveAnEmptyCellHoversForTheLevelsHoverTime(): Promise<void> {
  const grid = makeGrid(3, 6);
  const upper = grid[2][3];
  upper.color = 1;

  const below = grid[1][3];
  below.color = 0;
  below.state = 'normal';
  below.stateChanged = true; // the cell below just became empty

  upper.update(grid);
  assert.strictEqual(upper.state, 'hovering');
  assert.strictEqual(upper.timer, FRAMES.HOVER, 'a normal fall gets full hover time');
}

export async function aSwapFinishingOverAGapGetsFullHoverTime(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.color = 1;
  panel.startSwap(true);

  const below = grid[1][3];
  below.color = 0;

  for (let i = 0; i < 4; i++) panel.update(grid);

  assert.strictEqual(panel.state, 'hovering');
  assert.strictEqual(
    panel.timer, FRAMES.HOVER,
    'swapping panels always get FULL hover time, never an inherited one',
  );
}

export async function aFallingPanelInheritsTheHoverBelowRatherThanTakingChaining(): Promise<void> {
  const grid = makeGrid(4, 6);
  const falling = grid[3][3];
  falling.color = 1;
  falling.state = 'falling';
  falling.chaining = false;

  const below = grid[2][3];
  below.color = 2;
  below.state = 'hovering';
  below.timer = 5;
  below.propagatesChaining = true;

  falling.update(grid);

  assert.strictEqual(falling.state, 'hovering');
  assert.strictEqual(falling.timer, 5, 'inherits the hover time below it');
  assert.strictEqual(
    falling.chaining, false,
    'but does NOT gain a chaining flag it did not already have',
  );
  assert.strictEqual(falling.propagatesChaining, true, 'it still passes the signal on');
}

export async function landingLastsTwelveFrames(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[1][3];
  panel.color = 1;
  panel.state = 'falling';

  panel.update(grid); // row 1 always lands
  assert.strictEqual(panel.state, 'landing');
  assert.strictEqual(panel.timer, 12);

  for (let i = 0; i < 12; i++) panel.update(grid);
  assert.strictEqual(panel.state, 'normal');
}

export async function allowsSwapAcceptsSettledPanelsAndRefusesClearingOnes(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.color = 1;

  for (const state of ['normal', 'swapping', 'falling', 'landing'] as const) {
    panel.state = state;
    assert.strictEqual(panel.allowsSwap(), true, `${state} should be swappable`);
  }
  for (const state of ['matched', 'popping', 'popped', 'hovering', 'dimmed', 'dead'] as const) {
    panel.state = state;
    assert.strictEqual(panel.allowsSwap(), false, `${state} should not be swappable`);
  }

  panel.state = 'normal';
  panel.isGarbage = true;
  assert.strictEqual(panel.allowsSwap(), false, 'garbage is never swappable');
}

export async function dangerousCountsAnythingButFallingGarbage(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];

  panel.color = 0;
  assert.strictEqual(panel.dangerous(), false, 'an empty cell is not dangerous');

  panel.color = 1;
  assert.strictEqual(panel.dangerous(), true, 'a coloured panel is');

  panel.isGarbage = true;
  panel.state = 'falling';
  assert.strictEqual(panel.dangerous(), false, 'garbage still on its way down is not');

  panel.state = 'normal';
  assert.strictEqual(panel.dangerous(), true, 'garbage that has settled is');
}

/**
 * Garbage converts one row at a time, and only the bottom row. The row that has
 * been consumed is marked with yOffset -1 and becomes a real panel; rows above
 * simply go back to being garbage and wait their turn.
 */
export async function onlyTheBottomRowOfGarbageBecomesAPanel(): Promise<void> {
  const grid = makeGrid(3, 6);

  const bottom = grid[2][3];
  bottom.color = 9;
  bottom.isGarbage = true;
  bottom.state = 'matched';
  bottom.timer = 1;
  bottom.yOffset = -1;
  bottom.update(grid);

  assert.strictEqual(bottom.isGarbage, false, 'the bottom row converts to a real panel');
  assert.strictEqual(bottom.state, 'hovering');
  assert.strictEqual(bottom.timer, FRAMES.GARBAGE_HOVER, 'and hovers for GARBAGE_HOVER');
  assert.strictEqual(bottom.chaining, true, 'panels out of garbage always chain');

  const upper = grid[2][4];
  upper.color = 9;
  upper.isGarbage = true;
  upper.state = 'matched';
  upper.timer = 1;
  upper.yOffset = 0;
  upper.update(grid);

  assert.strictEqual(upper.isGarbage, true, 'rows above stay garbage');
  assert.strictEqual(upper.state, 'normal');
}

/**
 * Classic presets have no GARBAGE_HOVER at all, which is why classic cannot be
 * used for any mode with garbage. Converting one must fail loudly rather than
 * hover for undefined frames.
 */
export async function convertingGarbageWithoutGarbageHoverThrows(): Promise<void> {
  const grid = makeGrid(3, 6);
  const panel = grid[2][3];
  panel.frameTimes = { HOVER: 12, FLASH: 44, FACE: 17, POP: 9 }; // classic easy
  panel.color = 9;
  panel.isGarbage = true;
  panel.state = 'matched';
  panel.timer = 1;
  panel.yOffset = -1;

  assert.throws(() => panel.update(grid), /garbage hover/);
}
