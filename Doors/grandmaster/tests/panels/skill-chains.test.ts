/**
 * The techniques, driven through the real engine.
 *
 * The manual makes claims about how this game is played - that a panel falling
 * into a match continues the chain, that a swap can continue one but only
 * inside a window of a few frames, that four at once is a combo and not a
 * chain. Those claims are worth exactly as much as the engine's agreement with
 * them, so each one is a board here, played frame by frame, with the numbers
 * the manual quotes taken from these tests rather than from memory.
 *
 * Two of them pin behaviour that SURPRISES, which is the better reason for a
 * test than the happy path: an authored panel with air beneath it does not
 * fall, and the SNES "chainless chain" does not exist here.
 */

import assert from 'assert';
import { Stack } from '../../core/panels/stack';
import { PuzzleSource } from '../../core/panels/puzzle-source';
import { getModern } from '../../core/panels/level-data';

/**
 * A still board: no rise, no countdown, so a fixture is exactly what it says.
 * The string is top row first, six characters to a row.
 */
function board(rows: string): Stack {
  const stack = new Stack({
    levelData: getModern(10),
    panelSource: new PuzzleSource(rows),
    behaviours: { passiveRaise: false, allowManualRaise: false, delaySimulationUntil: null },
  });
  stack.startingState();
  return stack;
}

/** Run frames, optionally swapping at the cursor on one of them. */
function play(
  stack: Stack, frames: number, swap?: { atFrame: number; row: number; column: number },
): number {
  let highestChain = 0;
  for (let frame = 0; frame < frames; frame++) {
    if (swap && frame === swap.atFrame) {
      stack.curRow = swap.row;
      stack.curCol = swap.column;
      stack.swapThisFrame = true;
    }
    stack.run();
    highestChain = Math.max(highestChain, stack.chainCounter);
  }
  return highestChain;
}

/** Three in a row clears, and clearing three is not a chain. */
export async function threeInARowClearsAndIsNotAChain(): Promise<void> {
  const stack = board('222000');
  const chain = play(stack, 120);
  assert.strictEqual(stack.panelsCleared, 3);
  assert.strictEqual(chain, 0, 'the first link of a chain is not a chain');
}

export async function threeInAColumnClearsToo(): Promise<void> {
  const stack = board('020000' + '020000' + '020000');
  play(stack, 120);
  assert.strictEqual(stack.panelsCleared, 3);
}

/**
 * Four at once is a COMBO, which is a different thing from a chain and sends
 * different garbage. The chain counter must not move.
 */
export async function fourAtOnceIsAComboNotAChain(): Promise<void> {
  const stack = board('222200');
  const chain = play(stack, 120);
  assert.strictEqual(stack.panelsCleared, 4);
  assert.strictEqual(chain, 0);
}

/**
 * The chain everyone learns first: clear underneath, and what falls into the
 * gap lands in a match of its own.
 *
 *     . . 1 . . .        the three 2s clear, the 1 drops into the
 *     2 2 2 1 1 .        row and joins the two 1s beside it
 */
export async function apanelFallingIntoAMatchContinuesTheChain(): Promise<void> {
  const stack = board('001000' + '222110');
  const chain = play(stack, 200);

  assert.strictEqual(chain, 2, 'the drop is the second link');
  assert.strictEqual(stack.panelsCleared, 6, 'three 2s and three 1s');
}

/**
 * Chaining by SWAPPING rather than by dropping, and the window it has to
 * happen in.
 *
 *     1 1 . . . .        the 2s clear and the 1s drop, leaving
 *     2 2 2 1 . .        1 1 _ 1 - one swap away from a match
 *
 * The swap only counts as a chain for four frames after the panels land. That
 * is a fifteenth of a second, and it is the whole skill in the technique: a
 * moment later the same swap clears the same three panels for none of the
 * garbage.
 */
const SWITCH_WINDOW = { first: 59, last: 62 };

export async function aSwapCanContinueAChain(): Promise<void> {
  const stack = board('110000' + '222100');
  const chain = play(stack, 200, { atFrame: SWITCH_WINDOW.first, row: 1, column: 3 });

  assert.strictEqual(chain, 2);
  assert.strictEqual(stack.panelsCleared, 6);
}

export async function theSwitchWindowIsFourFrames(): Promise<void> {
  const chained: number[] = [];
  for (let frame = SWITCH_WINDOW.first - 6; frame <= SWITCH_WINDOW.last + 6; frame++) {
    const stack = board('110000' + '222100');
    if (play(stack, 200, { atFrame: frame, row: 1, column: 3 }) >= 2) chained.push(frame);
  }

  assert.deepStrictEqual(
    chained,
    [59, 60, 61, 62],
    'the window is four frames wide and starts when the panels land',
  );
}

/**
 * Too late is not a failure - it is a WORSE SUCCESS, which is the trap. The
 * same swap clears the same three panels and sends nothing.
 */
export async function aLateSwapStillClearsButSendsNothing(): Promise<void> {
  const stack = board('110000' + '222100');
  const chain = play(stack, 200, { atFrame: SWITCH_WINDOW.last + 8, row: 1, column: 3 });

  assert.strictEqual(chain, 0, 'no chain');
  assert.strictEqual(stack.panelsCleared, 6, 'but the panels cleared all the same');
}

/**
 * A panel with air beneath it does NOT fall, if the air was there from the
 * start.
 *
 * Surprising, and deliberate: a panel only looks down when the panel below it
 * CHANGES STATE, so a board authored with something floating in it leaves that
 * panel hanging for ever. Upstream behaves the same way and its own boards are
 * always authored resting on something. Worth pinning because a puzzle or a
 * generated stage that floated a panel would look like an engine bug.
 */
export async function anAuthoredFloatingPanelHangsThere(): Promise<void> {
  const stack = board('030000' + '000000');
  play(stack, 200);

  assert.strictEqual(stack.panels[2][2].color, 3, 'still up there');
  assert.strictEqual(stack.panels[1][2].color, 0, 'and the floor is still empty');
  assert.strictEqual(stack.panels[2][2].state, 'normal', 'not even hovering');
}

/**
 * The SNES "chainless chain" is NOT reproduced, and that is a decision rather
 * than an oversight.
 *
 * On the original, a match made above panels that are still popping is credited
 * as a chain even though nothing fell into it - a quirk of that machine's
 * physics that FAQ writers documented as an exploit. panel-attack does not have
 * it, and every oracle that proves this port is correct comes from panel-attack:
 * two frame-exact replays and 234 recorded puzzle solutions. Adding the quirk
 * would falsify all of them to gain one trick.
 *
 * So it is tested in the negative. If this ever starts chaining, something
 * changed in the matcher and this test is the one that should say so.
 */
export async function theChainlessChainIsNotReproduced(): Promise<void> {
  const stack = board('000400' + '004000' + '000400' + '222000');
  // Swap the stray 4 into the column while the 2s below are popping.
  const chain = play(stack, 200, { atFrame: 10, row: 3, column: 3 });

  assert.strictEqual(stack.panelsCleared, 6, 'both matches happen');
  assert.strictEqual(chain, 0, 'but the second one is not credited as a chain');
}

/**
 * The manual must not drift away from the engine.
 *
 * It quotes a number - four frames - that is measured by the test above. If
 * the engine's window ever changes, the measurement changes with it and this
 * test catches the manual still claiming the old one.
 */
export async function theManualQuotesTheWindowTheEngineActuallyHas(): Promise<void> {
  const { getManualContent } = require('../../ui/manual');
  const manual: string = getManualContent();

  const width = SWITCH_WINDOW.last - SWITCH_WINDOW.first + 1;
  assert.strictEqual(width, 4, 'the measured window');
  assert.ok(
    manual.includes('four frames'),
    'the manual states the window the engine has',
  );
}

export async function theManualCoversEveryModeTheMenuOffers(): Promise<void> {
  const { getManualContent } = require('../../ui/manual');
  const manual: string = getManualContent();

  assert.ok(manual.includes('TETRIS ATTACK'), 'the mode is documented at all');
  for (const mode of ['ENDLESS', 'TIME ATTACK', 'VS CPU', 'CHALLENGE', 'PUZZLE', 'STAGE CLEAR']) {
    assert.ok(manual.includes(mode), `the manual is missing ${mode}`);
  }
}

/** The one deliberate divergence is disclosed to the player, not buried. */
export async function theManualDisclosesTheChainlessChainDifference(): Promise<void> {
  const { getManualContent } = require('../../ui/manual');
  const manual: string = getManualContent();
  assert.ok(manual.includes('ONE DIFFERENCE FROM THE CARTRIDGE'));
  assert.ok(manual.includes('panel-attack'), 'and says what it follows instead');
}
