/**
 * The input codec and the board serialiser.
 *
 * The headline test here is startingBoardMatchesUpstreamsPuzzleString, which is
 * a SECOND independent oracle on top of the panel-buffer one: it checks the
 * board after the opening rows have actually been pushed into the stack, so it
 * covers newRow's switch-everything-down ordering, the dimmed-to-normal
 * promotion of row 1, and startingState's row count - none of which the buffer
 * test can see.
 *
 * The expected string is lifted from upstream's ReplayTests.lua endlessSaveTest,
 * which asserts the same 36 characters for seed 1 at modern level 10.
 */

import assert from 'assert';
import {
  encodeInput, decodeInput, INPUT_CHARS, INPUT_BITS,
  inputStateToMask, maskToInputState,
  compressInputString, decompressInputString,
} from '../../core/panels/input-codec';
import {
  toPuzzleString, bottomRowsOf, parsePuzzleString, fillMissingPanels,
} from '../../core/panels/puzzle-string';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getModern } from '../../core/panels/level-data';

/**
 * The alphabet is NOT standard base64: digits start at '1', so '0' sits at
 * index 62. Decoding with a stock alphabet would misread every replay.
 */
export async function theAlphabetIsPanelAttacksNotStandardBase64(): Promise<void> {
  assert.strictEqual(encodeInput(0), 'A', 'idle');
  assert.strictEqual(encodeInput(25), 'Z');
  assert.strictEqual(encodeInput(26), 'a');
  assert.strictEqual(encodeInput(51), 'z');
  assert.strictEqual(encodeInput(52), '1', 'digits start at one, not zero');
  assert.strictEqual(encodeInput(61), '0', 'and zero is last of them');
  assert.strictEqual(encodeInput(62), '+');
  assert.strictEqual(encodeInput(63), '/');
}

export async function eachActionHasItsDocumentedCharacter(): Promise<void> {
  assert.strictEqual(INPUT_CHARS.idle, 'A');
  assert.strictEqual(INPUT_CHARS.right, 'B');
  assert.strictEqual(INPUT_CHARS.left, 'C');
  assert.strictEqual(INPUT_CHARS.down, 'E');
  assert.strictEqual(INPUT_CHARS.up, 'I');
  assert.strictEqual(INPUT_CHARS.swap, 'Q');
  assert.strictEqual(INPUT_CHARS.raise, 'g');
}

export async function combinedButtonsEncodeAsOneCharacter(): Promise<void> {
  // Upstream's own worked example: swap + down is 16 + 4 = 20 -> 'U'.
  const mask = INPUT_BITS.SWAP + INPUT_BITS.DOWN;
  assert.strictEqual(mask, 20);
  assert.strictEqual(encodeInput(mask), 'U');
  assert.strictEqual(decodeInput('U'), 20);

  const state = maskToInputState(decodeInput('U'));
  assert.strictEqual(state.swap, true);
  assert.strictEqual(state.down, true);
  assert.strictEqual(state.up, false);
}

export async function inputStateRoundTripsThroughAMask(): Promise<void> {
  const state = { right: true, left: false, down: false, up: true, swap: true, raise: false };
  assert.deepStrictEqual(maskToInputState(inputStateToMask(state)), state);
}

export async function encodeRejectsMasksOutOfRange(): Promise<void> {
  assert.throws(() => encodeInput(64), /out of range/);
  assert.throws(() => encodeInput(-1), /out of range/);
  assert.throws(() => decodeInput('!'), /not an input character/);
}

export async function runLengthCompressionRoundTrips(): Promise<void> {
  const inputs = 'A'.repeat(909);
  assert.strictEqual(compressInputString(inputs), 'A909', "upstream's own example");
  assert.strictEqual(decompressInputString('A909'), inputs);
}

/**
 * Digits are legal input characters, so a digit run cannot be written as
 * character-plus-count - it would be ambiguous with the count. They are written
 * out literally inside parentheses instead.
 */
export async function digitRunsAreWrappedInParenthesesNotCounted(): Promise<void> {
  assert.strictEqual(compressInputString('555'), '(555)');
  assert.strictEqual(decompressInputString('(555)'), '555');

  const mixed = 'AAA555BB';
  assert.strictEqual(compressInputString(mixed), 'A3(555)B2');
  assert.strictEqual(decompressInputString(compressInputString(mixed)), mixed);
}

export async function anUncompressedStringIsReturnedUnchanged(): Promise<void> {
  // Two identical non-digit characters where a count was expected: not compressed.
  assert.strictEqual(decompressInputString('AABB'), 'AABB');
}

export async function aRealReplayInputStringDecompresses(): Promise<void> {
  // From the smallest committed fixture, v046-2023-01-30-00-35-24-Spd1-Dif3-endless.
  const compressed = 'A33E5A6E4A8E4A6E5A7E6A18I7A15I7A11Q1A75Q1A15Q1A5g163';
  const expanded = decompressInputString(compressed);
  assert.strictEqual(
    expanded.length,
    33 + 5 + 6 + 4 + 8 + 4 + 6 + 5 + 7 + 6 + 18 + 7 + 15 + 7 + 11 + 1 + 75 + 1 + 15 + 1 + 5 + 163,
    'one character per frame, and they add up',
  );
  assert.ok(expanded.startsWith('A'.repeat(33)), 'starts with 33 idle frames');
  assert.ok(expanded.endsWith('g'.repeat(163)), 'and ends holding raise');
}

// --- board serialisation ---

export async function aBoardSerialisesTopRowFirst(): Promise<void> {
  const stack = new Stack({
    levelData: getModern(1), panelSource: new GeneratorSource(1, false),
  });
  // Empty board: two rows, bottom one filled by hand.
  for (let col = 1; col <= 6; col++) stack.panels[1][col].color = col;

  const bottom = bottomRowsOf(stack.panels, 1);
  assert.strictEqual(bottom, '123456', 'the LAST characters are the bottom row');
}

export async function puzzleStringsParseBottomRowFirst(): Promise<void> {
  const rows = parsePuzzleString('111222' + '333444');
  assert.deepStrictEqual(rows[0], [3, 3, 3, 4, 4, 4], 'index 0 is the bottom row');
  assert.deepStrictEqual(rows[1], [1, 1, 1, 2, 2, 2]);
}

export async function shortPuzzleStringsPadIntoTheBottomRight(): Promise<void> {
  const filled = fillMissingPanels('123');
  assert.strictEqual(filled.length, 72);
  assert.ok(filled.endsWith('000123'), 'right-aligned into the bottom row');
  assert.strictEqual(filled.slice(0, 66), '0'.repeat(66));
}

export async function garbageNotationIsRejectedWhileUnsupported(): Promise<void> {
  assert.throws(() => parsePuzzleString('[====]'), /garbage notation/);
  assert.throws(() => parsePuzzleString('12345f'), /invalid character/);
}

/**
 * The second seed oracle, and a stronger one than the panel buffer: this is the
 * board AFTER startingState has pushed the opening rows in, so it covers
 * newRow's ordering and the promotion of row 1 out of dimmed state.
 *
 * Expected value from upstream's ReplayTests.lua endlessSaveTest, which builds
 * its endless match with GeneratorSource(1, false) - shock DISABLED - at modern
 * level 10, and asserts these same 36 characters.
 */
export async function startingBoardMatchesUpstreamsPuzzleString(): Promise<void> {
  const stack = new Stack({
    levelData: getModern(10),
    panelSource: new GeneratorSource(1, false),
  });
  stack.startingState();

  assert.strictEqual(
    bottomRowsOf(stack.panels, 6),
    '350000540056256135534246123164452652',
  );
}
