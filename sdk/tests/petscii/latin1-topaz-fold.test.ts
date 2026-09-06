/**
 * A 68K DOOR'S RULE REACHES A C64 AS A RULE, NOT A ROW OF QUESTION MARKS.
 *
 * A door running under the 68K emulator has its output decoded as latin1
 * (`web/backend/src/amiga-emulation/api/DosLibrary.ts:1222` and the FileHandle
 * path), so the code point that arrives here IS the byte the door wrote and
 * the picture the caller was meant to see is the Amiga Topaz glyph for it.
 * `asciiToPetsciiByte` used to map FOUR of the 96 - $A0, $A3, $AF, $B7 - and
 * send the other 92 to a C64 as '?'. Rules, column dividers and scene handles
 * all came out as question marks.
 *
 * These pins are the RASTER's answer, not a plausible-looking one. Each was
 * chosen by rendering Topaz 8x8 (Topaz_a500_v1.0.ttf, upem 1600 / advance 800,
 * so the native cell is every second row of a 16px render) against every
 * PETSCII bank-1 glyph 8x8 (PetMe64, PUA $E000 + bank*$100 + screen code) and
 * comparing 64 pixels; the distances are quoted in unicode-to-petscii.ts row
 * by row.
 */
import { asciiToPetsciiByte, encodePetsciiValue } from '../../petscii/ascii-to-petscii';
import { LATIN1_TO_PETSCII_FOLD } from '../../petscii/unicode-to-petscii';

const byte = (ch: string, bank: 0 | 1 = 1) => asciiToPetsciiByte(ch.codePointAt(0) as number, bank).byte;
const HIGH = Array.from({ length: 96 }, (_, i) => 0xA0 + i);

describe('latin-1 high bytes a 68K door writes', () => {
  it('leaves exactly three of the 96 as ?, and they are the three with no shape and no letter', () => {
    const unresolved = HIGH.filter((cp) => asciiToPetsciiByte(cp, 1).byte === 0x3F)
      .map((cp) => cp.toString(16).toUpperCase());
    // $A7 SECTION SIGN  - nearest bitmap is a lowercase 's' (d=10), a letter
    //                     the author did not write, and no capture in the
    //                     corpus uses it as one.
    // $B6 PILCROW       - nearest is the upper-left quadrant block (d=14).
    // $BF INVERTED '?'  - its own ASCII fold IS '?', so the fallback is right.
    expect(unresolved).toEqual(['A7', 'B6', 'BF']);
  });

  it('resolves the other 93 in bank 0 as well - no fold reaches for a bank-1-only graphic', () => {
    const unresolved = HIGH.filter((cp) => asciiToPetsciiByte(cp, 0).byte === 0x3F)
      .map((cp) => cp.toString(16).toUpperCase());
    expect(unresolved).toEqual(['A7', 'B6', 'BF']);
  });

  it('a rule, a divider and an ornament come out as PETSCII furniture', () => {
    expect(byte('¦')).toBe(0xDD); // BROKEN BAR   -> vertical bar   (d=4) - GWALL's HANDLE/BBS separator
    expect(byte('¬')).toBe(0xA3); // NOT SIGN     -> upper 1/8 rule (d=5)
    expect(byte('¯')).toBe(0xA3); // MACRON       -> upper 1/8 rule (d=2) - mapped before this table
    expect(byte('­')).toBe(0x2D); // SOFT HYPHEN  -> '-' (d=6): Topaz draws a real 2px bar for it
    expect(byte('÷')).toBe(0x2B); // DIVISION     -> '+' (d=4) - HSTStat's `-÷-+---+-÷-` rule
    expect(byte('·')).toBe(0x2E); // MIDDLE DOT   -> '.'      - mapped before this table
    expect(byte('¼')).toBe(0x2F); // ONE QUARTER  -> '/' (d=12) diagonal hatch, not a fraction
    expect(byte('½')).toBe(0x2F); // ONE HALF     -> '/' (d=12)
    expect(byte('¾')).toBe(0x2F); // THREE QUARTERS -> '/' (d=15)
    expect(byte('°')).toBe(0x2A); // DEGREE       -> '*'
    expect(byte('¤')).toBe(0x2A); // CURRENCY     -> '*', as this table already folds the diamond
    expect(byte('×')).toBe(0x2A); // MULTIPLY     -> '*' (d=13)
  });

  it('keeps ¡ distinct from | - JoinCnf\'s logo row draws with both', () => {
    // ` /   ¡   \  ¡   \  |   \  | /   ¡   \` is one captured row of `j`. The
    // nearest bitmap for ¡ is the solid vertical bar (d=8), which is exactly
    // where '|' goes ($DD), so taking it would erase the artist's distinction.
    expect(byte('¡')).toBe(0x21); // '!'
    expect(byte('|')).toBe(0xDD);
    expect(byte('¡')).not.toBe(byte('|'));
  });

  it('punctuation folds the way an ASCII terminal has always folded it', () => {
    expect(byte('¨')).toBe(0x22); // DIAERESIS  -> '"'
    expect(byte('«')).toBe(0x3C); // «          -> '<'
    expect(byte('»')).toBe(0x3E); // »          -> '>'
    expect(byte('±')).toBe(0x2B); // ±          -> '+'
    expect(byte('´')).toBe(0x27); // ACUTE      -> "'" (TurboLister writes `Co´s: DjaX`)
    expect(byte('¸')).toBe(0x2C); // CEDILLA    -> ',' (d=2)
  });

  it('a symbol the scene types as a letter arrives as that letter', () => {
    // HackCheck prints `EnTe® thE laST foU® digiTs`; MultiTop lists `®eaÇtø®`;
    // uSTATS writes `S¥$øP` and `CøS¥SøPs`. © and ® have no PETSCII counterpart
    // as symbols at all (nearest measures d=24 and d=28).
    expect(byte('®')).toBe(0xD2); // ® -> 'R'
    expect(byte('©')).toBe(0xC3); // © -> 'C'
    expect(byte('¥')).toBe(0xD9); // ¥ -> 'Y'
    expect(byte('¢')).toBe(0x43); // ¢ -> 'c'
    expect(byte('µ')).toBe(0x55); // µ -> 'u' (d=13)
    expect(byte('²')).toBe(0x32); // ² -> '2'
    expect(byte('³')).toBe(0x33); // ³ -> '3'
    expect(byte('¹')).toBe(0x31); // ¹ -> '1'
    expect(byte('ª')).toBe(0x41); // ª -> 'a'
    expect(byte('º')).toBe(0x4F); // º -> 'o'
  });

  it('an accented letter arrives as its base letter, not as art and not as ?', () => {
    // Deliberate: a C64 has no accented letter, so the only two answers are
    // the base letter or '?', and `S?N?` destroys the handle `SONY` merely
    // bruises. Nothing here resolves to a graphic - every target is a letter.
    expect(byte('é')).toBe(0x45); // é -> 'e' (d=3)
    expect(byte('ü')).toBe(0x55); // ü -> 'u' (d=6)
    expect(byte('ñ')).toBe(0x4E); // ñ -> 'n' (d=8)
    expect(byte('ø')).toBe(0x4F); // ø -> 'o'  - HSTStat's `SøNÝ`, TurboLister's `CøRteX`
    expect(byte('Ý')).toBe(0xD9); // Ý -> 'Y'
    expect(byte('Ð')).toBe(0xC4); // Ð -> 'D' (d=4) - JoinCnf's `[Ð!]`
    expect(byte('ß')).toBe(0xC2); // ß -> 'B' (d=4) - DoorRepo lists `$CP-BUß1.lha`
    expect(byte('Þ')).toBe(0xD0); // Þ -> 'P'
    expect(byte('Æ')).toBe(0xC1); // Æ -> 'A' (the ligature's left half; "AE" needs two bytes)
    expect(byte('Ø')).toBe(0xCF); // Ø -> 'O'
  });

  it('a folded uppercase letter still obeys the bank rule', () => {
    expect(byte('É', 1)).toBe(0xC5); // É -> 'E' -> $C5 in the text bank
    expect(byte('É', 0)).toBe(0x45); // ... and folds up in the graphics bank
    expect(byte('é', 1)).toBe(0x45); // é -> 'e' is $45 in both
    expect(byte('é', 0)).toBe(0x45);
  });

  it('every fold target resolves in ONE more step and is never itself a latin-1 high byte', () => {
    expect(LATIN1_TO_PETSCII_FOLD.size).toBe(89);
    for (const [from, to] of LATIN1_TO_PETSCII_FOLD) {
      const src = from.codePointAt(0) as number;
      expect(src).toBeGreaterThanOrEqual(0xA0);
      expect(src).toBeLessThanOrEqual(0xFF);
      expect(Array.from(to)).toHaveLength(1);
      const target = to.codePointAt(0) as number;
      // No cycle is possible: a target is never in the table's own key range.
      expect(target >= 0xA0 && target <= 0xFF).toBe(false);
      expect(LATIN1_TO_PETSCII_FOLD.has(to)).toBe(false);
      // ... and it really resolves, in both banks.
      expect(asciiToPetsciiByte(target, 1).byte).not.toBe(0x3F);
      expect(asciiToPetsciiByte(target, 0).byte).not.toBe(0x3F);
    }
  });

  it('no fold spends the reverse toggle - a substituted value never disturbs the art\'s state', () => {
    for (const cp of HIGH) expect(asciiToPetsciiByte(cp, 1).needsReverse).toBe(false);
  });

  it('encodes a captured door line without a single ?', () => {
    // HackCheck's question, exactly as the 68K binary writes it.
    const line = 'EnTe® thE laST foU® digiTs';
    expect(encodePetsciiValue(line, 1)).not.toContain(0x3F);
    expect(encodePetsciiValue(line, 1)).toEqual(encodePetsciiValue('EnTeR thE laST foUR digiTs', 1));
  });
});
