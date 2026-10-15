/**
 * A PETSCII caller switches his screen between the two character sets with
 * CTRL+L, the C*Base convention (C*Base 3.3.7 `src/ml0123.a65:1888-1901`:
 * `$8E` on the first press, `$0E` on the next).
 *
 * The board answers with the switch byte and NOTHING else: the caller's
 * terminal changes every character already on screen, as a C64 does. The
 * transducer's half is to keep printing in the set the caller chose instead
 * of forcing the lowercase set back on with the next character - which is
 * what `ensureBank(1)` in every print path did.
 *
 * The board rule is untouched: content is still authored in bank 1
 * (`BOARD_CHARSET_BANK`). This is the caller's DISPLAY choice (sysop D1,
 * 2026-10-04; plan `2026-10-04-petscii-ctrl-l-case-toggle.md`).
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PUA_BANK1 } from '../../petscii/pua';
import { petsciiInputToAscii, PETSCII_CASE_TOGGLE } from '../../petscii/petscii-input';

/** A transducer that has already printed board text, so it is in bank 1. */
function inBankOne(opts: ConstructorParameters<typeof AnsiToPetsciiTransducer>[0] = {}) {
  const t = new AnsiToPetsciiTransducer(opts);
  t.transduce('menu');
  expect(t.machine.state.charsetBank).toBe(1);
  return t;
}

describe('the caller switches the case', () => {
  it('switching to the upper case set sends exactly one $8E and nothing else', () => {
    const t = inBankOne();
    expect(Array.from(t.setCaseBank(0))).toEqual([0x8E]);
    expect(t.caseBank).toBe(0);
  });

  it('in the upper case set the board prints Hello as $48 $45 $4C $4C $4F, with no $0E before it', () => {
    const t = inBankOne();
    t.setCaseBank(0);
    expect(Array.from(t.transduce('Hello'))).toEqual([0x48, 0x45, 0x4C, 0x4C, 0x4F]);
    expect(t.machine.state.charsetBank).toBe(0);
  });

  it('switching back sends $0E and the lower case text prints as before', () => {
    const t = inBankOne();
    t.setCaseBank(0);
    t.transduce('X');
    expect(Array.from(t.setCaseBank(1))).toEqual([0x0E]);
    expect(Array.from(t.transduce('Hello'))).toEqual([0xC8, 0x45, 0x4C, 0x4C, 0x4F]);
  });

  it('a switch to the set already on screen sends nothing', () => {
    const t = inBankOne();
    expect(Array.from(t.setCaseBank(1))).toEqual([]);
  });

  it('a lower case set glyph the board drew stays in the caller\'s upper case set', () => {
    const t = inBankOne();
    t.setCaseBank(0);
    // Bank-1 screen code $41 is the capital A of the lowercase set. In the
    // upper case set that code is a graphic, so it is folded onto $01, the
    // same letter there. A graphic ($60-$7F) keeps its code.
    const out = Array.from(t.transduce(String.fromCodePoint(PUA_BANK1 + 0x41, PUA_BANK1 + 0x01, PUA_BANK1 + 0x66)));
    expect(out).not.toContain(0x0E);
    expect(t.machine.state.charsetBank).toBe(0);
    expect(Array.from(t.machine.state.screen.slice(4, 7))).toEqual([0x01, 0x01, 0x66]);
  });

  it('a Swedish capital prints as the letter the upper case set has for it', () => {
    const t = inBankOne({ swedish: true });
    t.setCaseBank(0);
    // $7B-$7D are graphics in the upper case set; $5B-$5D are the letters.
    expect(Array.from(t.transduce('Ää'))).toEqual([0x5B, 0x5B]);
  });

  it('a caller\'s choice survives a reset and is honoured from construction', () => {
    const t = inBankOne();
    t.setCaseBank(0);
    t.reset();
    expect(t.caseBank).toBe(0);
    const fresh = new AnsiToPetsciiTransducer({ caseBank: 0 });
    expect(Array.from(fresh.transduce('a'))).toEqual([0x41]);   // power-on is bank 0: no switch at all
  });
});

describe('the keys a C*Base caller presses', () => {
  it('CTRL+L is a terminal command, never text', () => {
    expect(PETSCII_CASE_TOGGLE).toBe(0x0C);
    expect(petsciiInputToAscii([0x0C])).toBe('');
  });
  it('CTRL+W reaches the board as ETB, the word wrap key', () => {
    expect(petsciiInputToAscii([0x17])).toBe('\x17');
  });
});
