/**
 * "petscii is missing swedish characters as well" - the sysop, 2026-09-13,
 * on a Swedish board.
 *
 * Standard PETSCII has no a-ring or umlauts: keymap.ts maps a-z, A-Z, digits,
 * punctuation and @[\]^_, and everything else returns null - so the key did
 * nothing at all. C64s sold in Sweden shipped a modified character ROM that
 * put the three letters where the bracket/pound trio had been.
 *
 * A VARIANT, never the default. PETSCII $5C is the pound sign, and this
 * board's MCI already uses it for the column tab; in a Swedish session that
 * byte is O-umlaut instead. An ordinary session must keep its pound sign.
 */
import { keyEventToPetscii, pastedTextToPetscii } from '../../../../packages/terminal/src/petscii/keymap';
import { petsciiInputToAscii } from '../../../../sdk/petscii/petscii-input';
import { SWEDISH_GLYPHS } from '../../../../packages/terminal/src/petscii/swedish';

describe('a Swedish caller typing', () => {
  it('gets a byte for each of their own letters', () => {
    expect(keyEventToPetscii('å', false, true)).toEqual([0x5D]);
    expect(keyEventToPetscii('ä', false, true)).toEqual([0x5B]);
    expect(keyEventToPetscii('ö', false, true)).toEqual([0x5C]);
    expect(keyEventToPetscii('Å', false, true)).toEqual([0x5D]);
  });

  it('and the board reads them back as the letters it already speaks', () => {
    // Latin-1, which is what toAmigaLatin1 keeps and what the ANSI side uses.
    expect(petsciiInputToAscii([0x5D], true)).toBe('å');
    expect(petsciiInputToAscii([0x5B], true)).toBe('ä');
    expect(petsciiInputToAscii([0x5C], true)).toBe('ö');
  });

  it('round-trips a name through the wire', () => {
    const bytes = pastedTextToPetscii('Måns Ärlig', true);
    expect(petsciiInputToAscii(bytes, true).toLowerCase()).toBe('måns ärlig');
  });

  it('does nothing at all when the session is not Swedish', () => {
    // The key is unmapped, exactly as before - not silently turned into a
    // bracket, which would put rubbish in a caller's message.
    expect(keyEventToPetscii('å', false)).toBeNull();
    expect(keyEventToPetscii('ö', false, false)).toBeNull();
  });

  it('leaves the pound sign alone in an ordinary session', () => {
    // $5C is MCI's column tab on this board. A session that did not ask for
    // Swedish must still read it as the pound sign, not as O-umlaut.
    expect(petsciiInputToAscii([0x5C])).toBe('\\');
    expect(petsciiInputToAscii([0x5C], false)).toBe('\\');
  });

  it('draws the letters over the three symbols they replace, in both banks', () => {
    // The glyphs come from the shipped PetMe64, which carries real a-ring and
    // umlaut letterforms - nothing here is an invented bitmap.
    expect(SWEDISH_GLYPHS).toHaveLength(6);
    expect(SWEDISH_GLYPHS.filter((g) => g.bank === 0).map((g) => g.char)).toEqual(['Ä', 'Ö', 'Å']);
    expect(SWEDISH_GLYPHS.filter((g) => g.bank === 1).map((g) => g.char)).toEqual(['ä', 'ö', 'å']);
    // Every letter draws where its own byte would have drawn its symbol.
    for (const g of SWEDISH_GLYPHS) expect(g.screenCode).toBe(g.petscii & 0x3F);
  });
});
