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
  MciDispatchMap,
  MciPrefixDispatchMap,
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

describe('processMci with prefixDispatch', () => {
  const dispatch: MciDispatchMap = {
    N: (w) => applyMciWidth('Spot', w),
  };

  // Mirrors express.e:5478-5495 — `~x<n>|` reads <n> as suffix of cmd
  // and emits ANSI cursor row-1, column-n. `~y<n>|` row-n, col-1.
  const prefixDispatch: MciPrefixDispatchMap = {
    X: (suffix) => {
      const n = parseInt(suffix, 10);
      return Number.isFinite(n) && n >= 0 ? `\x1b[;${n}H` : '';
    },
    Y: (suffix) => {
      const n = parseInt(suffix, 10);
      return Number.isFinite(n) && n >= 0 ? `\x1b[${n};H` : '';
    },
    SS_: (suffix) => `<DISPLAY:${suffix}>`,
  };

  test('parameterised ~x<n>| dispatches via prefix', () => {
    expect(processMci('~x10|done', { dispatch, prefixDispatch })).toBe('\x1b[;10Hdone');
  });

  test('parameterised ~y<n>| dispatches via prefix', () => {
    expect(processMci('go ~y5|here', { dispatch, prefixDispatch })).toBe('go \x1b[5;Hhere');
  });

  test('prefix preserves original case in suffix (file paths)', () => {
    // `~SS_FooBar.txt|` — uppercased cmd is "SS_FOOBAR.TXT" but the
    // suffix passed to the handler must be the original "FooBar.txt"
    // so case-sensitive paths round-trip.
    expect(processMci('~SS_FooBar.txt|', { dispatch, prefixDispatch })).toBe('<DISPLAY:FooBar.txt>');
  });

  test('exact dispatch wins over prefix when both apply', () => {
    // `~N|` — exact match "N" should win even if a prefix "N" exists.
    const both: MciPrefixDispatchMap = { N: () => '<PREFIX-N>' };
    expect(processMci('~N|', { dispatch, prefixDispatch: both })).toBe('Spot');
  });

  test('longest prefix wins on ambiguous matches', () => {
    const ambiguous: MciPrefixDispatchMap = {
      S: (s) => `<S:${s}>`,
      SS_: (s) => `<SS_:${s}>`,
    };
    expect(processMci('~SS_path|', { dispatch: {}, prefixDispatch: ambiguous })).toBe('<SS_:path>');
  });

  test('prefix handler returning undefined falls through', () => {
    const fall: MciPrefixDispatchMap = {
      X: () => undefined,
    };
    // With softFallThrough (default), `~xfoo|` re-emits ~ + digits and
    // leaves cmd content. cmd `xfoo|` -> "~xfoo|" (cmd consumed by
    // next iteration as plain text).
    expect(processMci('~xfoo|', { dispatch: {}, prefixDispatch: fall })).toBe('~xfoo|');
  });
});

describe('processMci strict fall-through (express.e exact)', () => {
  const dispatch: MciDispatchMap = { N: () => 'Spot' };

  test('unknown cmd: ~ consumed, cmd emits plain (express.e:5290 fall-through)', () => {
    expect(
      processMci('a~10ZZZ|b', { dispatch, softFallThrough: false }),
    ).toBe('aZZZb');
  });

  test('unknown cmd at end of string: ~ consumed, cmd as plain', () => {
    expect(
      processMci('hello ~XX', { dispatch, softFallThrough: false }),
    ).toBe('hello XX');
  });

  test('lone ~ at end of string: consumed', () => {
    expect(processMci('end ~', { dispatch, softFallThrough: false })).toBe('end ');
  });

  test('known cmd still works in strict mode', () => {
    expect(processMci('~N|!', { dispatch, softFallThrough: false })).toBe('Spot!');
  });
});

describe('processMci with byte-exact case (express.e StrCmp parity)', () => {
  // Express.e uses StrCmp (case-sensitive) with mixed-case keys —
  // lowercase `c0..c7`/`f`/`w`/`x`/`y`/`q`/`h` and uppercase
  // `N`/`UL`/`SP`/etc. With caseSensitive: true, dispatch keys must
  // match the cmd byte-exact as written in the screen file.
  const dispatch: MciDispatchMap = {
    N: () => 'Spot',         // express.e:5292 StrCmp(cmd,'N')
    f: () => '<CLS>',        // express.e:5469 StrCmp(cmd,'f')
    c0: () => '<black>',     // express.e:5651 StrCmp(cmd,'c0')
  };

  test('uppercase dispatch key matches uppercase cmd', () => {
    expect(processMci('hi ~N|', { dispatch, caseSensitive: true })).toBe('hi Spot');
  });

  test('lowercase dispatch key matches lowercase cmd', () => {
    expect(processMci('~f|done', { dispatch, caseSensitive: true })).toBe('<CLS>done');
    expect(processMci('~c0|x', { dispatch, caseSensitive: true })).toBe('<black>x');
  });

  test('case mismatch falls through (~F | does NOT match key f)', () => {
    expect(
      processMci('a~F|b', { dispatch, caseSensitive: true, softFallThrough: false }),
    ).toBe('aFb');
  });

  test('case mismatch falls through (~C0 | does NOT match key c0)', () => {
    expect(
      processMci('a~C0|b', { dispatch, caseSensitive: true, softFallThrough: false }),
    ).toBe('aC0b');
  });

  test('caseSensitive: false (default) keeps author-typo defence', () => {
    const flat: MciDispatchMap = { N: () => 'Spot', F: () => '<CLS>' };
    expect(processMci('~n|', flat)).toBe('Spot');
    expect(processMci('~f|', flat)).toBe('<CLS>');
  });
});

describe('processMci with width-conditional handlers', () => {
  // Models `~SP` / `~CR` (express.e:5455, 5462) which only match when
  // no width prefix is present: `(maxLen=-1) AND (StrCmp(cmd,'SP'))`.
  // The handler returns undefined for any non-default width so the
  // tokenizer falls through.
  test('handler returning undefined for width != -1 falls through', () => {
    let pauseCount = 0;
    const dispatch: MciDispatchMap = {
      SP: (w) => {
        if (w !== -1) return undefined;
        pauseCount++;
        return '';
      },
    };
    expect(processMci('a~SP|b', { dispatch, softFallThrough: false })).toBe('ab');
    expect(pauseCount).toBe(1);
    pauseCount = 0;
    // `~5SP|` width=5 -> handler returns undefined -> strict fall-through
    // emits "SP" as plain text. Express.e behaves identically.
    expect(processMci('a~5SP|b', { dispatch, softFallThrough: false })).toBe('aSPb');
    expect(pauseCount).toBe(0);
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
