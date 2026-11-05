/**
 * The gate for the whole port: does our panel supply produce, byte for byte,
 * the boards panel-attack produces from the same seed?
 *
 * These expected strings are lifted verbatim from upstream's own test,
 * common/tests/engine/PanelGenTests.lua (testPanelGenForStartingBoard), which
 * pins the starting board for three modern levels at seed 1.
 *
 * A single one of these passing proves, simultaneously:
 *
 *   - the LOVE RandomGenerator port: Thomas Wang seed hashing, 64-bit
 *     xorshift*, and the bit-pattern reinterpret to a double
 *   - `random(1, n)` = floor(r * n) + 1
 *   - the generator's three colour rules, INCLUDING the NaN bootstrap that
 *     makes the first horizontally adjacent pair of a game always accepted
 *   - isBadRow's rejection-and-regenerate loop, which spends random numbers
 *   - assignMetalLocations' reroll against the row below
 *   - the "arcane magic" starting-board removal, its dummy prepended row, and
 *     its discarded-but-still-spent random picks
 *
 * Any of those being wrong changes the string. That is why this test is worth
 * more than the sum of unit tests for each piece - and why nothing downstream
 * should be trusted until it is green.
 */

import assert from 'assert';
import { GeneratorSource, isBadRow } from '../../core/panels/generator-source';
import { getModern } from '../../core/panels/level-data';
import { RandomGenerator } from '../../core/panels/prng';

/** Upstream's createStackWithGeneratorSource, reduced to what the source reads. */
function startingBoardFor(seed: number, shockEnabled: boolean, level: number): string {
  const stack = { width: 6, levelData: getModern(level) };
  const source = new GeneratorSource(seed, shockEnabled);
  return source.clone(stack).panelBuffer;
}

export async function startingBoardMatchesUpstreamForModern10(): Promise<void> {
  assert.strictEqual(
    startingBoardFor(1, true, 10),
    '0000200020E025A010C4602d4e2F5261E34cE416a4',
  );
}

export async function startingBoardMatchesUpstreamForModern5(): Promise<void> {
  assert.strictEqual(
    startingBoardFor(1, true, 5),
    '0b000003200004A0533520cAaD4323423B5daD2513',
  );
}

export async function startingBoardMatchesUpstreamForModern1(): Promise<void> {
  assert.strictEqual(
    startingBoardFor(1, true, 1),
    '0000000020400254Eb013C231b41E4e4323B42bE44',
  );
}

/**
 * The starting board is seven rows of six, and exactly twelve cells have been
 * emptied out of it - the non-uniform opening the removal loop exists to make.
 */
export async function startingBoardIsSevenRowsWithTwelveRemoved(): Promise<void> {
  const board = startingBoardFor(1, true, 10);
  assert.strictEqual(board.length, 42, 'seven rows of six');
  const empties = board.split('').filter((c) => c === '0').length;
  assert.strictEqual(empties, 12, 'exactly 2 * width panels removed');
}

/**
 * The generator state round-trips through the hex form GeneratorSource uses for
 * rollback. A rollback that restored a call count instead of this state would
 * land on a different stream.
 */
export async function generatorStateRoundTripsThroughHex(): Promise<void> {
  const rng = new RandomGenerator(12345);
  for (let i = 0; i < 10; i++) rng.random();

  const state = rng.getState();
  assert.match(state, /^0x[0-9a-f]{16}$/, 'LOVE serialises state as 0x + 16 lowercase hex');

  const expected = [rng.random(), rng.random(), rng.random()];

  const restored = new RandomGenerator();
  restored.setState(state);
  assert.deepStrictEqual(
    [restored.random(), restored.random(), restored.random()],
    expected,
  );
}

/** randomRange stays inside its bounds and reaches both ends. */
export async function randomRangeCoversItsBoundsInclusively(): Promise<void> {
  const rng = new RandomGenerator(7);
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const value = rng.randomRange(1, 6);
    assert.ok(value >= 1 && value <= 6, `out of range: ${value}`);
    assert.strictEqual(value, Math.floor(value), 'must be an integer');
    seen.add(value);
  }
  assert.strictEqual(seen.size, 6, 'every value in 1..6 should occur');
}

/**
 * isBadRow is true only when every colour present appears exactly twice.
 * Colour 0 is skipped, because upstream walks its count table with ipairs.
 */
export async function isBadRowRejectsOnlyPerfectlyPairedRows(): Promise<void> {
  assert.strictEqual(isBadRow('112233'), true, 'three pairs is a bad row');
  assert.strictEqual(isBadRow('112234'), false, 'two singles is fine');
  assert.strictEqual(isBadRow('111223'), false, 'a triple is fine');
  assert.strictEqual(isBadRow('000000'), true, 'colour 0 is not counted, so this is "bad"');
  assert.strictEqual(isBadRow('001122'), true, 'empties ignored, the rest are pairs');
}
