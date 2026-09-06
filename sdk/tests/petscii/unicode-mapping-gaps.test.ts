/**
 * The glyphs a C64 CAN print that our encoder turns into '?'.
 *
 * Recorded by `thoughts/shared/research/2026-09-06_cbase-petscii-viewer.md`
 * section 4. Every row below is a screen code our own normative table
 * (`web/backend/src/utils/petscii-unicode-map.ts`, transcribed from the
 * Unicode Consortium's C64IPRI/C64IALT files) assigns a real glyph in BANK 1
 * - the bank all transduced text is printed in - and which
 * `asciiToPetsciiByte` nevertheless resolves to `$3F` '?'
 * (`sdk/petscii/ascii-to-petscii.ts:63`) because
 * `sdk/petscii/unicode-to-petscii.ts` never lists it.
 *
 * Nine of the ten in the first block sit inside `$60-$7F`, which is the
 * admission rule that module's own header states ("Only glyphs whose SCREEN
 * CODE renders the same in BOTH charset banks are mapped as plain bytes:
 * screen codes $60-$7F (PETSCII $A0-$BF), plus $40, $5B and $5D"). They are
 * missing by omission, not by decision: the table enumerated $61-$67,
 * $6B-$6E and $7B-$7F and skipped the rest. $5C is outside that window but
 * qualifies on the same rule - it is the same bitmap in both banks.
 *
 * These are `it.failing` ON PURPOSE. They pass while the gap exists and fail
 * the moment it is closed, which is the signal to delete the `.failing` and
 * fold the rows into `unicode-to-petscii.test.ts`. Closing them also means
 * widening that file's `$C0-$DF` guard (`:12-15`), which today forbids every
 * plain byte in that range except `$C0`, `$DB` and `$DD`.
 *
 * Why it matters to a real caller: U+2582, U+2583, U+258E and U+258D are the
 * eighth-block set every progress bar and meter is drawn from, so a blessed
 * door's bar reaches a C64 as a row of '?' although the machine in front of
 * the caller has the exact glyph in ROM.
 */
import { UNICODE_TO_PETSCII } from '../../petscii/unicode-to-petscii';
import { asciiToPetsciiByte } from '../../petscii/ascii-to-petscii';
import { printablePetsciiToScreenCode, screenCodeToPetscii } from '../../petscii/screen-codes';

/** [name, Unicode code point, bank-1 screen code, the PETSCII byte that screen code is reached by] */
type Gap = readonly [string, number, number, number];

/**
 * Same bitmap in BOTH charset banks, so a plain byte is safe by the module's
 * own rule. Nine live in $60-$7F; $5C is the tenth.
 */
const BANK_INVARIANT_GAPS: readonly Gap[] = [
  ['LEFT HALF MEDIUM SHADE',        0x1fb8c, 0x5c, 0xdc],
  ['LOWER HALF MEDIUM SHADE',       0x1fb8f, 0x68, 0xa8],
  ['RIGHT ONE QUARTER BLOCK',       0x1fb87, 0x6a, 0xaa],
  ['LOWER ONE QUARTER BLOCK',       0x02582, 0x6f, 0xaf],
  ['LEFT ONE QUARTER BLOCK',        0x0258e, 0x74, 0xb4],
  ['LEFT THREE EIGHTHS BLOCK',      0x0258d, 0x75, 0xb5],
  ['RIGHT THREE EIGHTHS BLOCK',     0x1fb88, 0x76, 0xb6],
  ['UPPER ONE QUARTER BLOCK',       0x1fb82, 0x77, 0xb7],
  ['UPPER THREE EIGHTHS BLOCK',     0x1fb83, 0x78, 0xb8],
  ['LOWER THREE EIGHTHS BLOCK',     0x02583, 0x79, 0xb9],
];

/**
 * Printable in bank 1, but the SAME screen code is a different bitmap in
 * bank 0 (pi at $5E, BLACK UPPER RIGHT TRIANGLE at $5F, BLACK UPPER LEFT
 * TRIANGLE at $69). A plain entry would be wrong in bank 0, so these need a
 * bank-aware decision rather than a row - see the research doc's open
 * questions.
 */
const BANK_DIVERGENT_GAPS: readonly Gap[] = [
  ['INVERSE CHECKER BOARD FILL',        0x1fb96, 0x5e, 0xde],
  ['UPPER LEFT TO LOWER RIGHT FILL',    0x1fb98, 0x5f, 0xdf],
  ['UPPER RIGHT TO LOWER LEFT FILL',    0x1fb99, 0x69, 0xa9],
];

describe('UNICODE_TO_PETSCII gaps: glyphs the C64 has and we print "?" for', () => {
  it('the gap list itself is well formed - every byte named IS that screen code', () => {
    const all = [...BANK_INVARIANT_GAPS, ...BANK_DIVERGENT_GAPS];
    expect(all).toHaveLength(13);
    for (const [name, , screenCode, petsciiByte] of all) {
      expect(`${name}: ${screenCodeToPetscii(screenCode)}`).toBe(`${name}: ${petsciiByte}`);
      expect(`${name}: ${printablePetsciiToScreenCode(petsciiByte)}`).toBe(`${name}: ${screenCode}`);
    }
  });

  it.failing('bank-invariant blocks and shades are encodable (10 rows, missing by omission)', () => {
    for (const [name, codePoint, screenCode, petsciiByte] of BANK_INVARIANT_GAPS) {
      const glyph = String.fromCodePoint(codePoint);
      expect(`${name}: ${UNICODE_TO_PETSCII.get(glyph)}`).toBe(`${name}: ${petsciiByte}`);
      const { byte, needsReverse } = asciiToPetsciiByte(codePoint, 1);
      expect(`${name}: ${needsReverse}`).toBe(`${name}: false`);
      expect(`${name}: ${byte}`).toBe(`${name}: ${petsciiByte}`);
      expect(`${name}: ${printablePetsciiToScreenCode(byte)}`).toBe(`${name}: ${screenCode}`);
    }
  });

  it.failing('bank-divergent fills are encodable in bank 1 (3 rows, need a bank-aware decision)', () => {
    for (const [name, codePoint, screenCode, petsciiByte] of BANK_DIVERGENT_GAPS) {
      const { byte, needsReverse } = asciiToPetsciiByte(codePoint, 1);
      expect(`${name}: ${needsReverse}`).toBe(`${name}: false`);
      expect(`${name}: ${byte}`).toBe(`${name}: ${petsciiByte}`);
      expect(`${name}: ${printablePetsciiToScreenCode(byte)}`).toBe(`${name}: ${screenCode}`);
    }
  });

  it.todo('decide whether $5E / $5F / $69 get a bank-aware entry or a written exemption');
});
