/**
 * MCI tokenizer — tests pin the express.e behaviour we ported.
 *
 * Each test references the express.e line range that defines the
 * behaviour, so future contributors can map back to source. The most
 * important regression cases are the ones that the previous
 * regex-pipeline got wrong:
 *
 *   - `~N.` (no `|` terminator, period suffix) — express.e fall-
 *     through emits "N." with the `~` consumed; the regex left the
 *     entire `~N.` literal in output. Logon24hrs.txt uses this form.
 *
 *   - `~N` alone (end-of-line) — express.e treats end-of-string as a
 *     valid terminator for the cmd boundary; the regex required an
 *     explicit `|` so this also fell through.
 *
 *   - `~N|` — explicit terminator path; should still work the same
 *     way the regex did.
 *
 *   - `~10N|` — width prefix; truncates the substituted value to the
 *     first 10 chars (express.e:5288 Val(num) + aePuts2 truncation).
 */

import {
  processMci,
  applyMciWidth,
  type MciDispatchMap,
} from '../../src/utils/mci-tokenizer.util';

describe('processMci tokenizer', () => {
  const dispatch: MciDispatchMap = {
    N: (w) => applyMciWidth('Spot', w),
    UL: (w) => applyMciWidth('Sweden', w),
    RN: (w) => applyMciWidth('John Smith', w),
    P: () => '',
  };

  test('substitutes ~N| (explicit terminator)', () => {
    expect(processMci('Hello ~N|, welcome', dispatch)).toBe('Hello Spot, welcome');
  });

  test('substitutes ~N at end of line (express.e end-of-string terminator)', () => {
    expect(processMci('Hello ~N', dispatch)).toBe('Hello Spot');
  });

  test('substitutes ~N followed by space (express.e space terminator)', () => {
    expect(processMci('~N hello', dispatch)).toBe('Spot hello');
  });

  test('passes through ~N. (period not a terminator, N. not in dispatch)', () => {
    // The cmd parsed is "N." — fails dispatch lookup. Permissive
    // fall-through: emit `~` + digits + leave cmd content for
    // downstream handlers / plain text. Strict express.e would emit
    // "N." (drop `~`); see comment in mci-tokenizer.util.ts for the
    // rationale. Logon24hrs.txt's `~N.` author likely wanted "Spot.";
    // this is a screen-file bug, not a tokenizer bug.
    expect(processMci('Hello ~N.', dispatch)).toBe('Hello ~N.');
  });

  test('width prefix truncates value (express.e:5288 + aePuts2)', () => {
    expect(processMci('~3N|', dispatch)).toBe('Spo');
    expect(processMci('~10RN|', dispatch)).toBe('John Smith');
    expect(processMci('~4RN|', dispatch)).toBe('John');
  });

  test('unknown code is preserved in output for downstream handlers', () => {
    // Permissive fall-through: re-emit `~` + width digits so later
    // MCI passes (e.g. ~XC_, ~CR_, color codes c0-c7) can still
    // match. The cmd content stays as plain text.
    expect(processMci('a~10ZZZ|b', dispatch)).toBe('a~10ZZZ|b');
  });

  test('multiple codes in one string', () => {
    expect(processMci('~N| from ~UL|', dispatch)).toBe('Spot from Sweden');
  });

  test('no MCI codes — returns input unchanged', () => {
    expect(processMci('plain text only', dispatch)).toBe('plain text only');
  });

  test('lone tilde at end of string — preserved (permissive)', () => {
    // express.e strict fall-through would consume the `~`; our
    // permissive variant keeps it for downstream regex passes.
    expect(processMci('end ~', dispatch)).toBe('end ~');
  });

  test('empty input', () => {
    expect(processMci('', dispatch)).toBe('');
  });

  test('custom terminator (express.e ~D<char> support)', () => {
    expect(processMci('~N.foo', dispatch, '.')).toBe('Spotfoo');
  });

  test('handler returning empty string (e.g. ~P password)', () => {
    expect(processMci('pass=[~P|]', dispatch)).toBe('pass=[]');
  });

  test('case-insensitive code matching', () => {
    // express.e StrCmp is byte-exact, but our parser uppercases cmd
    // before lookup so dispatch keys are uppercase regardless of how
    // the screen file wrote the code. Author-typo defence.
    expect(processMci('~n|', dispatch)).toBe('Spot');
    expect(processMci('~rN|', dispatch)).toBe('John Smith');
  });

  test('handler exception is swallowed (render must continue)', () => {
    const throwing: MciDispatchMap = {
      N: () => { throw new Error('boom'); },
    };
    expect(processMci('a~N|b', throwing)).toBe('ab');
  });
});

describe('applyMciWidth', () => {
  test('width <= 0 returns full value', () => {
    expect(applyMciWidth('hello', -1)).toBe('hello');
    expect(applyMciWidth('hello', 0)).toBe('hello');
  });

  test('positive width truncates', () => {
    expect(applyMciWidth('hello world', 5)).toBe('hello');
    expect(applyMciWidth('hi', 5)).toBe('hi');
  });
});
