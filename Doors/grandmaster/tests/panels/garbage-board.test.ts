/**
 * Garbage on the board: sending it, dropping it, and digging it out.
 *
 * Garbage is matched by CONTACT rather than colour, and only its BOTTOM ROW
 * converts per match - which is why clearing a tall block is a chain rather
 * than one clear, and is the mechanic the whole versus game is built on.
 */

import assert from 'assert';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getModern } from '../../core/panels/level-data';
import { comboGarbageFor, shakeFramesForGarbageSize } from '../../core/panels/consts';
import { getConnectedGarbagePanels, matchOnContact } from '../../core/panels/garbage-match';

function makeStack(): Stack {
  const stack = new Stack({
    levelData: getModern(1),
    panelSource: new GeneratorSource(20260903, true),
  });
  stack.startingState();
  return stack;
}

export async function aFourPanelComboSendsOneThreeWideBlock(): Promise<void> {
  const stack = makeStack();
  stack.pushGarbage({ row: 3, column: 2 }, false, 4, 0);

  assert.strictEqual(stack.outgoingGarbage.len(), 1);
  assert.strictEqual(stack.outgoingGarbage.peek()?.width, 3);
  assert.strictEqual(stack.outgoingGarbage.peek()?.isChain, false);
  assert.deepStrictEqual(comboGarbageFor(4), [3], 'and it matches the table');
}

/** Shock garbage is sent IN ADDITION to combo garbage, never instead of it. */
export async function shockPanelsSendTheirOwnBlocksAsWell(): Promise<void> {
  const stack = makeStack();
  // A combo of five that contained four shock panels.
  stack.pushGarbage({ row: 3, column: 2 }, false, 5, 4);

  const sent = stack.outgoingGarbage.history;
  const shock = sent.filter((g) => g.isMetal);
  const combo = sent.filter((g) => !g.isMetal && !g.isChain);

  assert.strictEqual(shock.length, 2, 'four shock panels send two blocks');
  assert.strictEqual(combo.length, 1, 'and the combo garbage is sent as well');
  assert.strictEqual(combo[0].width, 4, 'a combo of five is a 4-wide');
}

export async function aChainSendsAGrowingBlockRatherThanSeveral(): Promise<void> {
  const stack = makeStack();
  stack.pushGarbage({ row: 3, column: 2 }, true, 3, 0);
  stack.pushGarbage({ row: 4, column: 2 }, true, 3, 0);

  const chains = stack.outgoingGarbage.history.filter((g) => g.isChain);
  assert.strictEqual(chains.length, 1, 'one block, not one per link');
  assert.strictEqual(chains[0].height, 2, 'that grew with the second link');
  assert.strictEqual(chains[0].width, 6, 'chain garbage is always full width');
}

/**
 * A block spawns above the playfield and falls in. Every row it occupies is
 * created across the FULL board width even though the block is narrower - the
 * grid must have no holes, or neighbour lookups above it break.
 */
export async function garbageSpawnsAboveTheBoardAsOneBlock(): Promise<void> {
  const stack = makeStack();
  const originRow = stack.height + 1;

  // One physics frame first. Building the opening board leaves empty rows above
  // the playfield, and dropGarbage refuses to build into a row that already
  // exists - in real play removeExtraRows has trimmed them long before any
  // garbage arrives.
  stack.run();
  assert.strictEqual(stack.panels.length, stack.height + 1, 'the spare rows are gone');

  stack.dropGarbage(4, 2, false);

  let garbagePanels = 0;
  for (let row = originRow; row <= originRow + 1; row++) {
    assert.ok(stack.panels[row], `row ${row} was created`);
    for (let col = 1; col <= stack.width; col++) {
      assert.ok(stack.panels[row][col], 'every column of the row exists');
      if (stack.panels[row][col].isGarbage) garbagePanels += 1;
    }
  }
  assert.strictEqual(garbagePanels, 8, 'four wide by two tall');

  const sample = stack.panels[originRow].find((p) => p && p.isGarbage);
  assert.strictEqual(sample?.color, 9, 'garbage is colour 9');
  assert.strictEqual(sample?.state, 'falling');
  assert.strictEqual(sample?.width, 4);
  assert.strictEqual(sample?.height, 2);
  assert.strictEqual(
    sample?.shakeTime, shakeFramesForGarbageSize(4, 2),
    'and it carries the shake its size earns',
  );
}

/** Repeated blocks of one width cycle their spawn column rather than stacking. */
export async function repeatedGarbageOfOneWidthCyclesItsColumn(): Promise<void> {
  const stack = makeStack();
  const columnOf = () => {
    const row = stack.panels[stack.height + 1];
    for (let col = 1; col <= stack.width; col++) {
      if (row[col]?.isGarbage) return col;
    }
    return -1;
  };

  stack.dropGarbage(3, 1, false);
  const first = columnOf();
  // Clear the row so the next block can spawn there.
  stack.panels.length = stack.height + 1;
  stack.dropGarbage(3, 1, false);
  const second = columnOf();

  assert.notStrictEqual(first, second, 'the second block spawns elsewhere');
}

/**
 * Contact spreads a clear only between blocks OF THE SAME KIND. Shock never
 * drags normal garbage into its clear, or the reverse.
 */
export async function contactSpreadsOnlyBetweenGarbageOfTheSameKind(): Promise<void> {
  const normalA = { left: 1, right: 3, bottom: 1, top: 1, metal: false };
  const normalB = { left: 1, right: 3, bottom: 2, top: 2, metal: false };
  const shock = { left: 1, right: 3, bottom: 2, top: 2, metal: true };
  const distant = { left: 1, right: 3, bottom: 5, top: 5, metal: false };

  assert.strictEqual(matchOnContact(normalA, normalB), true, 'stacked, same kind');
  assert.strictEqual(matchOnContact(normalA, shock), false, 'stacked, different kinds');
  assert.strictEqual(matchOnContact(normalA, distant), false, 'same kind, not touching');
}

/**
 * The heart of it: a match touching a block clears it. The panels do not have
 * to be the garbage's colour - garbage has no colour to match.
 */
export async function aMatchTouchingGarbageClearsIt(): Promise<void> {
  const stack = makeStack();

  // A 6-wide block sitting at row 5.
  stack.panels[5] = [];
  for (let col = 1; col <= stack.width; col++) {
    const panel = stack.createPanelAt(5, col);
    panel.isGarbage = true;
    panel.color = 9;
    panel.garbageId = 1;
    panel.width = 6;
    panel.height = 1;
    panel.xOffset = col - 1;
    panel.yOffset = 0;
    panel.state = 'normal';
  }

  // Three matching panels directly beneath it.
  const matching = [];
  for (let col = 1; col <= 3; col++) {
    const panel = stack.panels[4][col];
    panel.color = 1;
    panel.state = 'normal';
    matching.push(panel);
  }

  const cleared = getConnectedGarbagePanels(stack, matching);

  assert.ok(cleared, 'the block was reached');
  assert.strictEqual(cleared?.length, 6, 'all six of its panels clear together');
  assert.strictEqual(stack.highestGarbageIdMatched, 1, 'and it is remembered as matched');
}

export async function aMatchNowhereNearGarbageClearsNothing(): Promise<void> {
  const stack = makeStack();

  stack.panels[9] = [];
  for (let col = 1; col <= stack.width; col++) {
    const panel = stack.createPanelAt(9, col);
    panel.isGarbage = true;
    panel.color = 9;
    panel.garbageId = 1;
    panel.width = 6;
    panel.height = 1;
    panel.xOffset = col - 1;
    panel.yOffset = 0;
    panel.state = 'normal';
  }

  // A match far below, touching nothing.
  const matching = [1, 2, 3].map((col) => {
    const panel = stack.panels[2][col];
    panel.color = 1;
    panel.state = 'normal';
    return panel;
  });

  assert.strictEqual(getConnectedGarbagePanels(stack, matching), null);
}

/**
 * Only the BOTTOM row of a block converts per match. Its yOffset reaching -1 is
 * the signal that the row has been consumed and becomes real panels; the rows
 * above simply go back to being garbage and wait.
 */
export async function onlyTheBottomRowOfATallBlockIsConsumed(): Promise<void> {
  const stack = makeStack();

  // Two rows of garbage, at rows 5 and 6.
  for (let row = 5; row <= 6; row++) {
    stack.panels[row] = [];
    for (let col = 1; col <= stack.width; col++) {
      const panel = stack.createPanelAt(row, col);
      panel.isGarbage = true;
      panel.color = 9;
      panel.garbageId = 1;
      panel.width = 6;
      panel.height = 2;
      panel.xOffset = col - 1;
      panel.yOffset = row - 5;
      panel.state = 'normal';
    }
  }

  const matching = [1, 2, 3].map((col) => {
    const panel = stack.panels[4][col];
    panel.color = 1;
    panel.state = 'normal';
    return panel;
  });

  const cleared = getConnectedGarbagePanels(stack, matching) as any[];
  stack.matchGarbagePanels(cleared, 60, false, cleared.length);

  const bottom = stack.panels[5][1];
  const upper = stack.panels[6][1];

  assert.strictEqual(bottom.yOffset, -1, 'the bottom row is consumed');
  assert.notStrictEqual(bottom.color, 9, 'and has been given a real colour');
  assert.strictEqual(upper.yOffset, 0, 'the row above drops to become the new bottom');
  assert.strictEqual(upper.color, 9, 'and is still garbage');
}
