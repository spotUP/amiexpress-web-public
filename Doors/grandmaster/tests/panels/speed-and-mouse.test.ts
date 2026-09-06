/**
 * Two things a live caller hit, and one thing that must never be "fixed".
 *
 * "The animation when they disappear is very slow" and "sometimes when I click
 * to swap tiles it doesn't work". The first is a default, the second was a
 * mirrored coordinate; neither is a reason to touch the ported engine.
 */

import assert from 'assert';
import {
  DIFFICULTY_ROWS, DIFFICULTY_VALUES, DEFAULT_DIFFICULTY, defaultDifficultyIndex,
} from '../../ui/panels/difficulty';
import { getClassicEndless, getModern } from '../../core/panels/level-data';
import { engineRowFor, bufferRowFor, boardSize } from '../../ui/panels/board-view';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';

function makeStack(): Stack {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(4242, true),
  });
  stack.startingState();
  return stack;
}

/** How long a three-panel match takes to leave the board, in frames. */
function clearFrames(difficulty: 'easy' | 'normal' | 'hard' | 'ex'): number {
  const { FLASH, FACE, POP } = getClassicEndless(difficulty).frameConstants;
  return FLASH + FACE + POP * 3;
}

/**
 * THE FRAME TABLE IS NOT OURS TO EDIT.
 *
 * It is panel-attack's, and the port is proved by two frame-exact replays and
 * 234 recorded puzzle solutions that are pinned to exactly these numbers.
 * Making the game feel snappier by shortening them would falsify every one of
 * those oracles - the tests would still pass, because they would be measuring
 * the new numbers, and the port would quietly stop being a port.
 *
 * A session handoff from 2026-09-04 records exactly that being attempted
 * ("Reduced FLASH ... FACE ... POP ..."). It did not reach main. This is the
 * test that says why it must not.
 */
export async function theClassicFrameTableIsPanelAttacksOwn(): Promise<void> {
  const normal = getClassicEndless('normal').frameConstants;
  assert.strictEqual(normal.FLASH, 36);
  assert.strictEqual(normal.FACE, 13);
  assert.strictEqual(normal.POP, 8);

  const modern10 = getModern(10).frameConstants;
  assert.strictEqual(modern10.FLASH, 28);
  assert.strictEqual(modern10.FACE, 10);
  assert.strictEqual(modern10.POP, 7);
}

/** The speeds get faster in the order they are offered. */
export async function theSpeedsAreOfferedSlowestFirst(): Promise<void> {
  assert.strictEqual(DIFFICULTY_ROWS.length, DIFFICULTY_VALUES.length);
  assert.deepStrictEqual([...DIFFICULTY_VALUES], ['easy', 'normal', 'hard', 'ex']);

  for (let i = 1; i < DIFFICULTY_VALUES.length; i++) {
    const slower = clearFrames(DIFFICULTY_VALUES[i - 1] as 'easy');
    const faster = clearFrames(DIFFICULTY_VALUES[i] as 'easy');
    assert.ok(
      faster < slower,
      `${DIFFICULTY_VALUES[i]} (${faster}) is not quicker than ${DIFFICULTY_VALUES[i - 1]} (${slower})`,
    );
  }
}

/**
 * The list opens on a speed that feels like the arcade.
 *
 * Endless used to run on NORMAL, where a match takes 73 frames - a fifth over
 * a second - before the board moves again. That is what "very slow" was.
 */
export async function theDefaultSpeedIsNotTheSluggishOne(): Promise<void> {
  assert.strictEqual(DEFAULT_DIFFICULTY, 'hard');
  assert.strictEqual(defaultDifficultyIndex(), 2);
  assert.ok(
    clearFrames('hard') < clearFrames('normal'),
    'the default is quicker than the one that was reported as slow',
  );
  assert.ok(clearFrames('normal') > 70, 'and normal really is that slow');
}

/**
 * A click lands on the row under the pointer.
 *
 * The board is drawn UPSIDE DOWN relative to the engine - buffer row 0 is the
 * top of the playfield, engine row 1 is the floor - so reading a click as
 * `y + 1` mirrored it. Clicking the stack asked to swap the empty rows above
 * it, canSwap refused because both cells were air, and nothing happened.
 */
export async function aClickMapsToTheRowUnderThePointer(): Promise<void> {
  const stack = makeStack();
  const { rows } = boardSize(stack);

  // The top of the box is the top of the playfield.
  assert.strictEqual(engineRowFor(stack, 0), stack.height);
  // The last playfield row is the floor; below it is the dimmed incoming row.
  assert.strictEqual(engineRowFor(stack, stack.height - 1), 1);
  assert.strictEqual(engineRowFor(stack, stack.height), 0, 'the incoming row');
  assert.strictEqual(rows, stack.height + 1);

  // And it is exactly the inverse of the mapping the renderer uses.
  for (let row = 0; row <= stack.height; row++) {
    assert.strictEqual(engineRowFor(stack, bufferRowFor(stack, row)), row);
  }
}

/** The old formula really was wrong, and this says how wrong. */
export async function theOldClickFormulaWasMirrored(): Promise<void> {
  const stack = makeStack();
  const oldWay = (bufferY: number) => bufferY + 1;

  // Clicking the bottom of the stack asked for the top of the board.
  const floorClick = stack.height - 1;
  assert.strictEqual(engineRowFor(stack, floorClick), 1);
  assert.strictEqual(oldWay(floorClick), stack.height);
  assert.notStrictEqual(oldWay(floorClick), engineRowFor(stack, floorClick));

  // The one row where the two agree is the middle, which is why it sometimes
  // appeared to work.
  const agree = [];
  for (let y = 0; y <= stack.height; y++) {
    if (oldWay(y) === engineRowFor(stack, y)) agree.push(y);
  }
  assert.deepStrictEqual(agree, [(stack.height - 1) / 2].filter(Number.isInteger));
}
