/**
 * The garbage queue: what is sent, in what order, and when it arrives.
 *
 * The timing is the game. Garbage spends 91 frames staged where the receiver
 * can SEE it coming, then 60 more in transit where nothing is drawn, and only
 * then may it land. Shorten either and the game stops being fair; lengthen them
 * and an attack stops meaning anything.
 */

import assert from 'assert';
import { GarbageQueue, Garbage } from '../../core/panels/garbage-queue';
import {
  STAGING_DURATION, GARBAGE_DELAY_LAND_TIME, MAX_CHAIN_GARBAGE_HEIGHT,
} from '../../core/panels/consts';

function combo(width: number, frameEarned = 0, isMetal = false): Garbage {
  return { width, height: 1, isMetal, isChain: false, frameEarned };
}

export async function stagingThenTransitIsOneHundredAndFiftyOneFrames(): Promise<void> {
  const queue = new GarbageQueue();
  queue.push(combo(3, 0));

  // Still staged one frame short of the staging duration.
  queue.processStagedGarbageForClock(STAGING_DURATION - 1);
  assert.strictEqual(queue.len(), 1, 'not yet released');

  queue.processStagedGarbageForClock(STAGING_DURATION);
  assert.strictEqual(queue.len(), 0, 'released into transit');

  const landsAt = queue.getOldestFinishedTransitTime();
  assert.strictEqual(landsAt, STAGING_DURATION + GARBAGE_DELAY_LAND_TIME);
  assert.strictEqual(landsAt, 151, 'the whole flight, from earning to landing');
}

/**
 * A real queue may only take the garbage due on the exact frame asked for.
 * Anything else would let a busy board quietly receive an attack early.
 */
export async function garbageOnlyLandsOnItsOwnFrame(): Promise<void> {
  const queue = new GarbageQueue();
  queue.push(combo(3, 0));
  queue.processStagedGarbageForClock(STAGING_DURATION);
  const due = queue.getOldestFinishedTransitTime() as number;

  assert.strictEqual(queue.popFinishedTransitsAt(due - 1), undefined, 'too early');
  assert.strictEqual(queue.popFinishedTransitsAt(due + 1), undefined, 'too late');
  assert.ok(queue.popFinishedTransitsAt(due), 'exactly on time');
}

/**
 * An attack engine is allowed to pop garbage that should have landed earlier,
 * which is how a simulated opponent stays on schedule when the player's board
 * is too busy to accept anything.
 */
export async function anAttackEngineMayDeliverLate(): Promise<void> {
  const queue = new GarbageQueue(true);
  queue.push(combo(3, 0));
  queue.processStagedGarbageForClock(STAGING_DURATION);
  const due = queue.getOldestFinishedTransitTime() as number;

  assert.ok(queue.popFinishedTransitsAt(due + 500), 'late delivery is accepted');
}

/**
 * A chain's garbage cannot leave while the chain is still growing - its size is
 * not known yet. This is why a long chain lands all at once.
 */
export async function chainGarbageWaitsUntilTheChainEnds(): Promise<void> {
  const queue = new GarbageQueue();
  queue.addChainLink(0, 1, 1);

  queue.processStagedGarbageForClock(STAGING_DURATION + 1000);
  assert.strictEqual(queue.len(), 1, 'an unfinished chain never leaves, however long');

  queue.finalizeCurrentChain(10);
  queue.processStagedGarbageForClock(STAGING_DURATION + 1000);
  assert.strictEqual(queue.len(), 0, 'and leaves once the chain has ended');
}

/**
 * A chain sends ONE block whose height is the number of links, not a block per
 * link - which is what makes a long chain a wall rather than a drizzle.
 */
export async function aChainSendsOneBlockThatGrowsWithItsLinks(): Promise<void> {
  const queue = new GarbageQueue();
  queue.addChainLink(0, 1, 1);
  assert.strictEqual(queue.len(), 1);
  assert.strictEqual(queue.peek()?.width, 6, 'chain garbage is always full width');
  assert.strictEqual(queue.peek()?.height, 1, 'chain 2 is one row');

  queue.addChainLink(10, 1, 1);
  queue.addChainLink(20, 1, 1);
  assert.strictEqual(queue.len(), 1, 'still one block, not three');
  assert.strictEqual(queue.peek()?.height, 3);
  assert.strictEqual(queue.peek()?.linkTimes?.length, 3);
}

/**
 * Our one deliberate divergence from panel-attack: the block stops growing at
 * twelve rows, as the SNES original does. See MAX_CHAIN_GARBAGE_HEIGHT.
 */
export async function chainGarbageStopsGrowingAtTwelveRows(): Promise<void> {
  const queue = new GarbageQueue();
  for (let link = 0; link < 30; link++) queue.addChainLink(link * 10, 1, 1);

  assert.strictEqual(queue.peek()?.height, MAX_CHAIN_GARBAGE_HEIGHT);
  assert.strictEqual(queue.peek()?.height, 12);
}

/**
 * Priority increases with index, so the highest-priority piece is LAST and can
 * be popped without shifting the array. Chains outrank combos.
 */
export async function chainsOutrankCombos(): Promise<void> {
  const queue = new GarbageQueue();
  queue.push(combo(6, 0));
  queue.addChainLink(0, 1, 1);
  queue.finalizeCurrentChain(1);

  assert.strictEqual(queue.peek()?.isChain, true, 'the chain leaves first');
}

/**
 * THE DIRECTION IS COUNTER-INTUITIVE AND WORTH STATING ONCE.
 *
 * Upstream's comment: "higher priority garbage is at the end so we can pop it
 * without having to shift indexes". The comparator answers "does a sort BEFORE
 * b", so anything it sorts to the FRONT has the LOWEST priority and leaves
 * LAST.
 *
 * Wider combos sort to the front. So the NARROWEST garbage is delivered first,
 * and a big attack arrives behind the small ones rather than ahead of them.
 */
export async function narrowerCombosAreDeliveredFirst(): Promise<void> {
  const queue = new GarbageQueue();
  queue.push(combo(3, 0));
  queue.push(combo(6, 0));
  queue.push(combo(4, 0));

  assert.strictEqual(queue.pop()?.width, 3, 'narrowest leaves first');
  assert.strictEqual(queue.pop()?.width, 4);
  assert.strictEqual(queue.pop()?.width, 6, 'the widest waits its turn');
}

/**
 * Shock sorts to the front alongside the combos, so a COMBO is delivered before
 * shock garbage of the same width.
 */
export async function combosAreDeliveredBeforeShock(): Promise<void> {
  const queue = new GarbageQueue();
  queue.push(combo(6, 0, false));
  queue.push(combo(6, 0, true));

  assert.strictEqual(queue.peek()?.isMetal, false, 'the combo leaves first');
}

/**
 * With metal merged into the combo ordering, TYPE stops mattering and width
 * decides on its own - which is what the armageddon attack pattern wants.
 */
export async function treatingMetalAsComboMergesTheirOrdering(): Promise<void> {
  const queue = new GarbageQueue(false, true);
  queue.push(combo(3, 0, true));
  queue.push(combo(6, 0, false));

  // Merged: the narrower piece leaves first even though it is the shock one.
  assert.strictEqual(queue.peek()?.width, 3);
  assert.strictEqual(queue.peek()?.isMetal, true);
}

/**
 * The telegraph numbers from the next piece to pop, while the array is ordered
 * the other way round. Getting this backwards draws the icons in reverse.
 */
export async function theTelegraphIndexCountsFromTheNextToPop(): Promise<void> {
  const queue = new GarbageQueue();
  const wide = combo(6, 0);
  const narrow = combo(3, 0);
  queue.push(narrow);
  queue.push(wide);

  // Narrower leaves first, so IT is what the telegraph draws at index 0.
  assert.strictEqual(queue.getGarbageIndex(narrow), 0, 'the next to pop is index 0');
  assert.strictEqual(queue.getGarbageIndex(wide), 1);
}

export async function historyRecordsEverythingEverSent(): Promise<void> {
  const queue = new GarbageQueue();
  queue.push(combo(3, 0));
  queue.addChainLink(0, 1, 1);
  queue.finalizeCurrentChain(5);
  queue.processStagedGarbageForClock(STAGING_DURATION + 100);

  assert.strictEqual(queue.len(), 0, 'the queue is empty');
  assert.strictEqual(queue.history.length, 2, 'but the history remembers both');
  assert.strictEqual(queue.history.filter((g) => g.isChain).length, 1);
}
