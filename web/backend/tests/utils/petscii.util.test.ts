/**
 * Unit tests for petscii.util.ts
 * Tests PETSCII (Commodore 64) character conversion utilities
 */

import {
  convertPetsciiToPetMe64,
  convertPetsciiToAnsi,
  convertAnsiToPetscii,
  convertUnicodePuaToPetscii,
  getPetsciiColorName,
  convertAsciiToPetsciiOutput,
  convertPetsciiInputToAscii,
  isPetsciiSeqFile,
  PetsciiStreamConverter,
} from '../../src/utils/petscii.util';
import {
  C64_PALETTE_COLODORE,
  C64_PALETTE_PEPTO,
  PETSCII_COLOR_TO_VIC,
  vicToSgrForeground,
  vicToSgrBackground,
} from '../../src/utils/c64-palette';

// C64 power-on prologue: light blue pen (VIC 14) on blue background (VIC 6).
const PROLOGUE = vicToSgrForeground(14) + vicToSgrBackground(6);

describe('c64-palette', () => {
  it('maps all 16 PETSCII color codes to distinct VIC indices', () => {
    const indices = Object.values(PETSCII_COLOR_TO_VIC);
    expect(indices.sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
    expect(C64_PALETTE_COLODORE.length).toBe(16);
  });

  it('emits truecolor SGR from Colodore values', () => {
    expect(vicToSgrForeground(2)).toBe('\x1b[38;2;129;51;56m'); // #813338 red
    expect(vicToSgrForeground(8)).toBe('\x1b[38;2;142;80;41m'); // #8E5029 orange, distinct from yellow
  });

  it('pins the Colodore palette to its exact 16 hex values', () => {
    expect(C64_PALETTE_COLODORE).toEqual([
      '#000000', '#FFFFFF', '#813338', '#75CEC8', '#8E3C97', '#56AC4D', '#2E2C9B', '#EDF171',
      '#8E5029', '#553800', '#C46C71', '#4A4A4A', '#7B7B7B', '#A9FF9F', '#706DEB', '#B2B2B2',
    ]);
  });

  it('pins the Pepto palette to its exact 16 hex values', () => {
    expect(C64_PALETTE_PEPTO).toEqual([
      '#000000', '#FFFFFF', '#68372B', '#70A4B2', '#6F3D86', '#588D43', '#352879', '#B8C76F',
      '#6F4F25', '#433900', '#9A6759', '#444444', '#6C6C6C', '#9AD284', '#6C5EB5', '#959595',
    ]);
  });
});

describe('convertPetsciiToPetMe64 palette', () => {
  it('orange and brown are no longer both yellow', () => {
    const orange = convertPetsciiToPetMe64(Buffer.from([0x81, 0x41]));
    const brown = convertPetsciiToPetMe64(Buffer.from([0x95, 0x41]));
    expect(orange).toContain('\x1b[38;2;142;80;41m');
    expect(brown).toContain('\x1b[38;2;85;56;0m');
  });

  it('starts in C64 power-on state: light blue pen on blue background', () => {
    const out = convertPetsciiToPetMe64(Buffer.from([0x41]));
    expect(out.startsWith('\x1b[38;2;112;109;235m\x1b[48;2;46;44;155m')).toBe(true);
  });

  it('clear screen repaints the blue background', () => {
    const out = convertPetsciiToPetMe64(Buffer.from([0x93]));
    // bg SGR must be active before ESC[2J so xterm fills with blue
    expect(out.indexOf('\x1b[48;2;46;44;155m')).toBeLessThan(out.indexOf('\x1b[2J'));
  });
});

describe('petscii.util', () => {
  describe('isPetsciiSeqFile', () => {
    it('should return true for .seq files', () => {
      expect(isPetsciiSeqFile('test.seq')).toBe(true);
      expect(isPetsciiSeqFile('TEST.SEQ')).toBe(true);
      expect(isPetsciiSeqFile('path/to/file.seq')).toBe(true);
    });

    it('should return false for non-.seq files', () => {
      expect(isPetsciiSeqFile('test.txt')).toBe(false);
      expect(isPetsciiSeqFile('test.petscii')).toBe(false);
      expect(isPetsciiSeqFile('test')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isPetsciiSeqFile('test.SEQ')).toBe(true);
      expect(isPetsciiSeqFile('test.Seq')).toBe(true);
      expect(isPetsciiSeqFile('test.sEq')).toBe(true);
    });
  });

  describe('getPetsciiColorName', () => {
    it('should return color names for valid PETSCII color codes', () => {
      expect(getPetsciiColorName(0x05)).toBe('white');
      expect(getPetsciiColorName(0x1C)).toBe('red');
      expect(getPetsciiColorName(0x1E)).toBe('green');
      expect(getPetsciiColorName(0x1F)).toBe('blue');
      expect(getPetsciiColorName(0x81)).toBe('orange');
      expect(getPetsciiColorName(0x90)).toBe('black');
    });

    it('should return color names for all 16 C64 colors', () => {
      expect(getPetsciiColorName(0x95)).toBe('brown');
      expect(getPetsciiColorName(0x96)).toBe('light red');
      expect(getPetsciiColorName(0x97)).toBe('dark grey');
      expect(getPetsciiColorName(0x98)).toBe('grey');
      expect(getPetsciiColorName(0x99)).toBe('light green');
      expect(getPetsciiColorName(0x9A)).toBe('light blue');
      expect(getPetsciiColorName(0x9B)).toBe('light grey');
      expect(getPetsciiColorName(0x9C)).toBe('purple');
      expect(getPetsciiColorName(0x9E)).toBe('yellow');
      expect(getPetsciiColorName(0x9F)).toBe('cyan');
    });

    it('should return "unknown" for invalid color codes', () => {
      expect(getPetsciiColorName(0x00)).toBe('unknown');
      expect(getPetsciiColorName(0x20)).toBe('unknown');
      expect(getPetsciiColorName(0xFF)).toBe('unknown');
    });
  });

  describe('convertPetsciiToPetMe64', () => {
    it('should convert simple ASCII characters', () => {
      const buffer = Buffer.from([0x41, 0x42, 0x43]); // ABC
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain(PROLOGUE); // C64 power-on colors (light blue pen, blue bg)
      expect(result).toContain('\x1b[0m');  // Reset at end
    });

    it('should handle PETSCII colors', () => {
      const buffer = Buffer.from([0x1C, 0x41]); // Red + A
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain(vicToSgrForeground(2)); // Truecolor red (Colodore)
    });

    it('should handle character set switching', () => {
      const buffer = Buffer.from([0x0E, 0x41, 0x8E, 0x41]); // Shift on, A, Shift off, A
      const result = convertPetsciiToPetMe64(buffer);

      // Should not throw and should produce different PUA codes
      expect(result).toBeTruthy();
    });

    it('should handle reverse video control codes via the reverse glyph bank, not SGR', () => {
      const buffer = Buffer.from([0x12, 0x41, 0x92]); // Reverse on, A, Reverse off
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain(String.fromCodePoint(0xE081)); // Reverse A (screen code 0x01 | 0x80)
      expect(result).not.toContain('\x1b[7m');
      expect(result).not.toContain('\x1b[27m');
    });

    it('should handle cursor movement codes', () => {
      const buffer = Buffer.from([0x11, 0x91, 0x1D, 0x9D, 0x13]);
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain('\x1b[B'); // Down
      expect(result).toContain('\x1b[A'); // Up
      expect(result).toContain('\x1b[C'); // Right
      expect(result).toContain('\x1b[D'); // Left
      expect(result).toContain('\x1b[H'); // Home
    });

    it('should handle clear screen code', () => {
      const buffer = Buffer.from([0x93]);
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain('\x1b[2J\x1b[H'); // Clear + home
    });

    it('should handle line breaks', () => {
      const buffer = Buffer.from([0x0D, 0x8D]); // CR, Shift+CR
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain('\r\n');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from([]);
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain(PROLOGUE); // C64 power-on colors
      expect(result).toContain('\x1b[0m');  // Reset
    });

    it('ignores unhandled control codes instead of emitting reverse glyphs', () => {
      // $0A, $0F, $10, $80, $8F are no-ops on a C64
      const out = convertPetsciiToPetMe64(Buffer.from([0x0A, 0x0F, 0x10, 0x80, 0x8F, 0x41]));
      // Only 'A' (screen code 0x01 -> U+E001) plus color/reset framing may appear
      expect(out).toContain(String.fromCodePoint(0xE001));
      for (const cp of [0xE08A, 0xE08F, 0xE090, 0xE0C0, 0xE0CF]) {
        expect(out).not.toContain(String.fromCodePoint(cp));
      }
    });

    it('renders reverse video via +0x80 screen codes, not SGR 7', () => {
      // RVS on, 'A', RVS off, 'A'
      const out = convertPetsciiToPetMe64(Buffer.from([0x12, 0x41, 0x92, 0x41]));
      expect(out).toContain(String.fromCodePoint(0xE081)); // reverse A = screen code 0x01 | 0x80
      expect(out).toContain(String.fromCodePoint(0xE001)); // normal A
      expect(out).not.toContain('\x1b[7m');
    });

    it('RETURN cancels reverse video (KERNAL $0D behavior)', () => {
      // RVS on, 'A', RETURN, 'A' -> second A must NOT be reverse
      const out = convertPetsciiToPetMe64(Buffer.from([0x12, 0x41, 0x0D, 0x41]));
      const afterReturn = out.slice(out.indexOf('\r\n') + 2);
      expect(afterReturn).toContain(String.fromCodePoint(0xE001));
      expect(afterReturn).not.toContain(String.fromCodePoint(0xE081));
    });

    it('Shift+RETURN ($8D) does NOT cancel reverse video', () => {
      const out = convertPetsciiToPetMe64(Buffer.from([0x12, 0x41, 0x8D, 0x41]));
      const afterReturn = out.slice(out.indexOf('\r\n') + 2);
      expect(afterReturn).toContain(String.fromCodePoint(0xE081));
    });
  });

  describe('convertPetsciiToAnsi', () => {
    it('should convert to ANSI for generic terminals', () => {
      const buffer = Buffer.from([0x41, 0x42, 0x43]); // ABC
      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain('A');
      expect(result).toContain('B');
      expect(result).toContain('C');
    });

    it('should handle PETSCII colors', () => {
      const buffer = Buffer.from([0x1C, 0x41]); // Red + A
      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain(vicToSgrForeground(2)); // Truecolor red (Colodore)
      expect(result).toContain('A');
    });

    it('should handle numbers and punctuation', () => {
      const buffer = Buffer.from([0x30, 0x31, 0x21, 0x3F]); // 01!?
      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain('0');
      expect(result).toContain('1');
      expect(result).toContain('!');
      expect(result).toContain('?');
    });

    it('should ignore control codes appropriately', () => {
      const buffer = Buffer.from([0x00, 0x03, 0x08, 0x09, 0x83]);
      const result = convertPetsciiToAnsi(buffer);

      // Control codes should not produce output - just the power-on prologue + reset
      expect(result).toBe(`${PROLOGUE}\x1b[0m`);
    });

    it('should handle space characters', () => {
      const buffer = Buffer.from([0x20, 0xA0, 0xE0]); // Various space codes
      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain(' ');
    });

    // Task 11 (audit D1-D3): the ANSI fallback used to render PETSCII $5C,
    // $5E, $5F as ASCII backslash/caret/underscore. Real PETSCII has no
    // such characters at those codes - pound sign and the two arrows.
    it('renders the real PETSCII punctuation at 0x5C/0x5E/0x5F, not ASCII backslash/caret/underscore', () => {
      const result = convertPetsciiToAnsi(Buffer.from([0x5C, 0x5E, 0x5F]));
      expect(result).toBe(`${PROLOGUE}£↑←\x1b[0m`);
    });

    // Task 11 (audit D1): unshifted PETSCII $61-$7A (screen codes $41-$5A)
    // are graphics glyphs in the up/gfx charset bank on real hardware, not
    // a "lowercase letter approximation" - the old fallback showed a-z here.
    it('renders unshifted 0x61/0x73/0x7A as PETSCII graphics glyphs, not lowercase letters', () => {
      const result = convertPetsciiToAnsi(Buffer.from([0x61, 0x73, 0x7A]));
      expect(result).toBe(`${PROLOGUE}♠♥♦\x1b[0m`);
    });

    // Shifted mode: the same screen codes ($41-$5A) render as uppercase
    // letters, per the C64 shifted/lo-up charset bank.
    it('renders shifted 0x61/0x7A as uppercase letters', () => {
      const result = convertPetsciiToAnsi(Buffer.from([0x0E, 0x61, 0x7A]));
      expect(result).toBe(`${PROLOGUE}AZ\x1b[0m`);
    });

    // Task 11: a printable char under reverse video must not re-emit SGR 7 -
    // the $12 handler already put the terminal into reverse; wrapping every
    // glyph would toggle it straight back off (audit-adjacent regression
    // this rewrite could easily reintroduce).
    it('does not re-wrap SGR 7 per glyph while reverse video is active', () => {
      const result = convertPetsciiToAnsi(Buffer.from([0x12, 0x41, 0x42, 0x92]));
      expect(result).toBe(`${PROLOGUE}\x1b[7mAB\x1b[27m\x1b[0m`);
    });

    it('ignores unhandled control codes without printing stray characters', () => {
      // $0A, $0F, $10, $80, $8F are no-ops on a C64 (audit A5). Before the
      // blanket guard, these fell through to the printable path and each
      // printed as a stray space (or block char) - only 'A' should appear.
      const result = convertPetsciiToAnsi(Buffer.from([0x0A, 0x0F, 0x10, 0x80, 0x8F, 0x41]));
      expect(result).toBe(`${PROLOGUE}A\x1b[0m`);
    });

    it('RETURN cancels reverse video in the ANSI fallback (emits SGR reverse-off)', () => {
      // RVS on, 'A', RETURN, 'A' -> RETURN must emit reverse-off SGR and
      // reset state so nothing downstream treats reverse video as still on.
      const result = convertPetsciiToAnsi(Buffer.from([0x12, 0x41, 0x0D, 0x41]));
      expect(result).toBe(`${PROLOGUE}\x1b[7mA\x1b[27m\r\nA\x1b[0m`);
    });

    it('Shift+RETURN ($8D) does NOT cancel reverse video in the ANSI fallback', () => {
      // RVS on, 'A', Shift+RETURN (must NOT reset RVS), 'A', real RETURN
      // (must still see reverseVideo=true and emit the reverse-off SGR).
      const result = convertPetsciiToAnsi(Buffer.from([0x12, 0x41, 0x8D, 0x41, 0x0D]));
      expect(result).toBe(`${PROLOGUE}\x1b[7mA\r\nA\x1b[27m\r\n\x1b[0m`);
    });
  });

  describe('convertAnsiToPetscii', () => {
    // convertAnsiToPetscii now delegates to convertAsciiToPetsciiOutput with
    // { charsetPrelude: true } (task 4 / audit E4): it prepends 0x0E (switch
    // to shifted/text charset) so a power-on C64 - which boots in
    // unshifted/graphics mode - displays a .seq file's mixed case correctly,
    // and it case-swaps letters the same way convertAsciiToPetsciiOutput
    // always has (ASCII uppercase -> PETSCII shifted-uppercase 0xC1-0xDA,
    // ASCII lowercase -> PETSCII shifted-lowercase 0x41-0x5A).
    it('should convert ASCII text to PETSCII with a charset prelude and case-swap', () => {
      const text = 'HELLO';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x0E); // Charset prelude
      expect(result[1]).toBe(0xC8); // H -> shifted uppercase
      expect(result[2]).toBe(0xC5); // E
      expect(result[3]).toBe(0xCC); // L
      expect(result[4]).toBe(0xCC); // L
      expect(result[5]).toBe(0xCF); // O
    });

    it('should convert numbers (unaffected by case-swap)', () => {
      const text = '0123456789';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x0E); // Charset prelude
      for (let i = 0; i < 10; i++) {
        expect(result[i + 1]).toBe(0x30 + i);
      }
    });

    it('should handle newlines', () => {
      const text = 'A\nB';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x0E); // Charset prelude
      expect(result[1]).toBe(0xC1); // A -> shifted uppercase
      expect(result[2]).toBe(0x0D); // CR (PETSCII return)
      expect(result[3]).toBe(0xC2); // B
    });

    it('should handle lowercase letters', () => {
      const text = 'abc';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x0E); // Charset prelude
      expect(result[1]).toBe(0x41); // a -> shifted lowercase
      expect(result[2]).toBe(0x42); // b
      expect(result[3]).toBe(0x43); // c
    });

    it('should handle punctuation', () => {
      const text = '!@#$%';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x0E); // Charset prelude
      expect(result[1]).toBe(0x21); // !
      expect(result[2]).toBe(0x40); // @
      expect(result[3]).toBe(0x23); // #
      expect(result[4]).toBe(0x24); // $
      expect(result[5]).toBe(0x25); // %
    });

    it('should convert unknown characters to space', () => {
      const text = String.fromCharCode(0x80) + String.fromCharCode(0xFF);
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x0E); // Charset prelude
      expect(result[1]).toBe(0x20); // Space
      expect(result[2]).toBe(0x20); // Space
    });

    it('should still emit the charset prelude for an empty string', () => {
      const text = '';
      const result = convertAnsiToPetscii(text);

      expect(Array.from(result)).toEqual([0x0E]);
    });
  });

  describe('convertAsciiToPetsciiOutput', () => {
    it('should convert uppercase letters to PETSCII uppercase', () => {
      const text = 'ABC';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0xC1); // A -> 0xC1
      expect(result[1]).toBe(0xC2); // B -> 0xC2
      expect(result[2]).toBe(0xC3); // C -> 0xC3
    });

    it('should convert lowercase letters to PETSCII lowercase', () => {
      const text = 'abc';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0x41); // a -> 0x41
      expect(result[1]).toBe(0x42); // b -> 0x42
      expect(result[2]).toBe(0x43); // c -> 0x43
    });

    it('should handle numbers and punctuation', () => {
      const text = '0123!@#';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0x30); // 0
      expect(result[1]).toBe(0x31); // 1
      expect(result[2]).toBe(0x32); // 2
      expect(result[3]).toBe(0x33); // 3
      expect(result[4]).toBe(0x21); // !
      expect(result[5]).toBe(0x40); // @
      expect(result[6]).toBe(0x23); // #
    });

    it('should convert newlines to PETSCII CR', () => {
      const text = 'A\nB';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0xC1); // A
      expect(result[1]).toBe(0x0D); // CR
      expect(result[2]).toBe(0xC2); // B
    });

    it('should handle carriage returns', () => {
      const text = 'A\rB';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0xC1); // A
      expect(result[1]).toBe(0x0D); // CR
      expect(result[2]).toBe(0xC2); // B
    });

    it('should convert backspace to PETSCII delete', () => {
      const text = 'A\x08B\x7F';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0xC1); // A
      expect(result[1]).toBe(0x14); // PETSCII delete
      expect(result[2]).toBe(0xC2); // B
      expect(result[3]).toBe(0x14); // PETSCII delete
    });

    it('should handle brackets and special chars', () => {
      const text = '[\\]^_';
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0x5B); // [
      expect(result[1]).toBe(0x5C); // \
      expect(result[2]).toBe(0x5D); // ]
      expect(result[3]).toBe(0x5E); // ^
      expect(result[4]).toBe(0x5F); // _
    });

    it('should convert unknown characters to space', () => {
      const text = String.fromCharCode(0x80) + String.fromCharCode(0xFF);
      const result = convertAsciiToPetsciiOutput(text);

      expect(result[0]).toBe(0x20); // Space
      expect(result[1]).toBe(0x20); // Space
    });
  });

  describe('convertPetsciiInputToAscii', () => {
    // Case convention flip (2026-09-02 full-canvas PETSCII plan, task 6,
    // conflict #3): this wrapper now delegates to the SDK's
    // petsciiInputToAscii, which unifies on the web keymap's convention
    // (SyncTERM C64-mode) instead of the old telnet-only mapping. On a real
    // C64 the UNSHIFTED key sends $41-$5A and displays uppercase in bank 0,
    // but the BBS runs the text bank where $41-$5A IS lowercase - so
    // unshifted now maps to lowercase ASCII and shifted ($C1-$DA) to
    // uppercase, the INVERSE of what this suite asserted before. Login is
    // unaffected: getUserByUsername matches on LOWER(username) and
    // AuthenticationUseCase tries the lowercased password before the
    // original case, so a real C64 typing either case still logs in.
    it('should convert PETSCII unshifted letters to ASCII lowercase', () => {
      const buffer = Buffer.from([0x41, 0x42, 0x43]); // abc, unshifted
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('abc');
    });

    it('should convert PETSCII shifted letters to ASCII uppercase', () => {
      const buffer = Buffer.from([0xC1, 0xC2, 0xC3]); // ABC, shifted
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('ABC');
    });

    it('should handle numbers and punctuation', () => {
      const buffer = Buffer.from([0x30, 0x31, 0x21, 0x3F]); // 01!?
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('01!?');
    });

    it('should convert PETSCII return to CR', () => {
      const buffer = Buffer.from([0x0D]); // PETSCII return
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('\r');
    });

    it('should convert shifted return to CR', () => {
      const buffer = Buffer.from([0x8D]); // Shift+return
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('\r');
    });

    it('should convert PETSCII delete to backspace', () => {
      const buffer = Buffer.from([0x14, 0x7F]); // PETSCII delete, DEL
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('\x7f\x7f');
    });

    it('should skip line feed (LF)', () => {
      const buffer = Buffer.from([0x41, 0x0A, 0x42]); // a, LF, b (unshifted)
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('ab'); // LF skipped
    });

    it('should handle @ symbol', () => {
      const buffer = Buffer.from([0x40]); // @
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('@');
    });

    it('should handle brackets and special chars', () => {
      const buffer = Buffer.from([0x5B, 0x5C, 0x5D, 0x5E, 0x5F]); // [\]^_
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('[\\]^_');
    });

    it('should handle space', () => {
      const buffer = Buffer.from([0x20]); // Space
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe(' ');
    });

    it('should skip graphics and control codes', () => {
      const buffer = Buffer.from([0x00, 0x03, 0x41, 0x08, 0x42]); // Controls + a + Controls + b (unshifted)
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('ab'); // Only letters extracted
    });

    it('should handle graphics range 0x61-0x7A as lowercase', () => {
      const buffer = Buffer.from([0x61, 0x62, 0x63]); // a, b, c
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('abc');
    });

    it('should convert cursor keys to the ANSI arrow sequences blessed doors decode (previously dropped)', () => {
      const buffer = Buffer.from([0x91, 0x11, 0x1D, 0x9D, 0x13, 0x94]);
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('\x1b[A\x1b[B\x1b[C\x1b[D\x1b[H\x1b[2~');
    });

    it('should convert F1-F8 to the VT sequences client-door-bridge maps to F1-F8 (previously dropped)', () => {
      const buffer = Buffer.from([0x85, 0x89, 0x86, 0x8A, 0x87, 0x8B, 0x88, 0x8C]);
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('\x1bOP\x1bOQ\x1bOR\x1bOS\x1b[15~\x1b[17~\x1b[18~\x1b[19~');
    });

    it('should still drop CLR and other unmapped control bytes', () => {
      const buffer = Buffer.from([0x93, 0x03, 0x05]);
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from([]);
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('');
    });
  });

  describe('convertUnicodePuaToPetscii', () => {
    it('should convert Unicode PUA back to PETSCII', () => {
      // PUA range 0xE000-0xE0FF for unshifted charset
      const text = String.fromCodePoint(0xE041); // Screen code 0x41
      const result = convertUnicodePuaToPetscii(text);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle shifted charset PUA range', () => {
      // PUA range 0xE100-0xE1FF for shifted charset
      const text = String.fromCodePoint(0xE141); // Shifted screen code 0x41
      const result = convertUnicodePuaToPetscii(text);

      // Should include shift mode command (0x0E) as first byte
      expect(result[0]).toBe(0x0E);
      expect(result.length).toBeGreaterThan(1);
    });

    it('should convert ANSI color codes back to PETSCII', () => {
      const text = '\x1b[31mRED';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x1C); // Red color code
    });

    it('should handle cursor movement ANSI codes', () => {
      // A(up) at row 0 is a no-op on both sides; B, C, D move exactly one cell each.
      const result = convertUnicodePuaToPetscii('\x1b[A\x1b[B\x1b[C\x1b[D');
      expect(Array.from(result)).toEqual([0x11, 0x1D, 0x9D]);
    });

    it('should handle home ANSI code', () => {
      const result = convertUnicodePuaToPetscii('ab\x1b[H');
      expect(result[result.length - 1]).toBe(0x13);
    });

    it('should handle clear screen ANSI code', () => {
      const text = '\x1b[2J';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x93); // Clear screen
    });

    it('should skip CR and convert LF to PETSCII return', () => {
      const text = '\r\n';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x0D); // PETSCII return
    });

    it('uppercase ASCII displays uppercase on a shifted-charset C64 (case swap + prelude)', () => {
      const result = convertUnicodePuaToPetscii('ABC');
      expect(Array.from(result)).toEqual([0x0E, 0xC1, 0xC2, 0xC3]);
    });

    it('should handle reverse video codes', () => {
      const text = '\x1b[7m\x1b[27m';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x12); // Reverse on
      expect(result[1]).toBe(0x92); // Reverse off
    });

    it('should handle white color reset', () => {
      const text = '\x1b[97m';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x05); // White
    });

    it('should handle empty string', () => {
      const text = '';
      const result = convertUnicodePuaToPetscii(text);

      expect(result.length).toBe(0);
    });
  });

  describe('Integration tests', () => {
    it('should round-trip ASCII through PETSCII conversion', () => {
      const original = 'Hello World!';
      const petscii = convertAsciiToPetsciiOutput(original);
      const backToAscii = convertPetsciiInputToAscii(petscii);

      expect(backToAscii.toLowerCase()).toBe(original.toLowerCase());
    });

    it('should handle PETSCII color sequences', () => {
      const buffer = Buffer.from([
        0x1C, // Red
        0x48, 0x45, 0x4C, 0x4C, 0x4F, // HELLO
        0x05, // White
        0x20, // Space
        0x1E, // Green
        0x42, 0x42, 0x53, // BBS
      ]);

      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain(vicToSgrForeground(2)); // Red
      expect(result).toContain(vicToSgrForeground(1)); // White
      expect(result).toContain(vicToSgrForeground(5)); // Green
      expect(result).toContain('HELLO');
      expect(result).toContain('BBS');
    });

    it('should handle character set switching in conversion', () => {
      const buffer = Buffer.from([
        0x8E, // Switch to unshifted
        0x41, 0x42, // AB
        0x0E, // Switch to shifted
        0x43, 0x44, // CD
      ]);

      const result = convertPetsciiToPetMe64(buffer);

      // Should produce different PUA ranges
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('\x1b[0m'); // Reset at end
    });

    it('should handle complete PETSCII screen with colors and text', () => {
      const buffer = Buffer.from([
        0x93, // Clear screen
        0x13, // Home
        0x05, // White
        0x48, 0x45, 0x4C, 0x4C, 0x4F, // HELLO
        0x0D, // Return
        0x1C, // Red
        0x57, 0x4F, 0x52, 0x4C, 0x44, // WORLD
      ]);

      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain(vicToSgrBackground(6) + '\x1b[2J\x1b[H'); // Blue bg active before clear + home
      expect(result).toContain(vicToSgrForeground(1)); // White
      expect(result).toContain(vicToSgrForeground(2)); // Red
      expect(result).toContain('HELLO');
      expect(result).toContain('WORLD');
      expect(result).toContain('\r\n'); // Line break
    });
  });

  describe('Edge cases', () => {
    it('should handle all 16 C64 colors', () => {
      const colors = [0x05, 0x1C, 0x1E, 0x1F, 0x81, 0x90, 0x95, 0x96,
                      0x97, 0x98, 0x99, 0x9A, 0x9B, 0x9C, 0x9E, 0x9F];

      colors.forEach(color => {
        const buffer = Buffer.from([color, 0x41]); // Color + A
        const result = convertPetsciiToAnsi(buffer);
        expect(result).toContain('\x1b['); // Should have ANSI code
      });
    });

    it('should handle maximum buffer size', () => {
      const largeBuffer = Buffer.alloc(10000, 0x41); // 10K of 'A'
      const result = convertPetsciiToAnsi(largeBuffer);

      expect(result.length).toBeGreaterThan(10000);
    });

    it('should handle all control codes gracefully', () => {
      const controlCodes = [0x00, 0x03, 0x08, 0x09, 0x0D, 0x0E, 0x11, 0x12, 0x13, 0x14,
                            0x83, 0x8D, 0x8E, 0x90, 0x91, 0x92, 0x93, 0x94];

      controlCodes.forEach(code => {
        const buffer = Buffer.from([code]);
        const result = convertPetsciiToAnsi(buffer);
        expect(result).toBeTruthy(); // Should not throw
      });
    });

    it('should handle function keys', () => {
      const fkeys = [0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x8B, 0x8C];

      fkeys.forEach(fkey => {
        const buffer = Buffer.from([fkey]);
        const result = convertPetsciiToAnsi(buffer);
        expect(result).toBeTruthy(); // Should not throw (ignored)
      });
    });

    it('should handle graphics characters range', () => {
      const graphics = Buffer.from([0xA0, 0xA1, 0xAF, 0xB0, 0xBA, 0xBF]);
      const result = convertPetsciiToAnsi(graphics);

      // Should contain Unicode block elements
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

describe('convertUnicodePuaToPetscii reverse video', () => {
  it('emits $12/$92 around reverse glyphs instead of control-byte garbage', () => {
    // U+E081 = reverse A (bank 0). Old code emitted screenCodeToPetscii(0x81) = 0x01 (a control byte!)
    const bytes = convertUnicodePuaToPetscii(String.fromCodePoint(0xE081, 0xE001));
    expect(Array.from(bytes)).toEqual([0x12, 0x41, 0x92, 0x41]);
  });

  it('keeps currentReverse in sync when an SGR reverse toggle is interleaved with PUA reverse glyphs', () => {
    // Reverse-A (PUA), then SGR reverse-off, then reverse-B (PUA) - the SGR
    // toggle must update the same reverse-state the PUA branch dedups
    // against, or the second reverse glyph's $12 gets silently swallowed
    // (regression: the SGR 'm' branch pushed 0x12/0x92 without touching
    // currentReverse).
    const text = String.fromCodePoint(0xE081) + '\x1b[27m' + String.fromCodePoint(0xE082);
    const bytes = convertUnicodePuaToPetscii(text);
    expect(Array.from(bytes)).toEqual([0x12, 0x41, 0x92, 0x12, 0x42]);
  });

  it('turns reverse off before a non-reverse PUA glyph after an SGR reverse-on', () => {
    // Mirror case: SGR reverse-on, then a NON-reverse PUA glyph. The glyph
    // must emit $92 before printing itself, or it renders in reverse on
    // real hardware (the terminal is still latched from the SGR $12).
    const text = '\x1b[7m' + String.fromCodePoint(0xE001);
    const bytes = convertUnicodePuaToPetscii(text);
    expect(Array.from(bytes)).toEqual([0x12, 0x92, 0x41]);
  });
});

describe('convertUnicodePuaToPetscii ANSI parser', () => {
  it('splits multi-param SGR', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[0;7m' + String.fromCodePoint(0xE001));
    expect(Array.from(bytes)).toContain(0x12);
  });
  it('repeats counted cursor moves', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[5C');
    expect(Array.from(bytes)).toEqual([0x1D, 0x1D, 0x1D, 0x1D, 0x1D]);
  });
  it('converts absolute positioning to deltas from the current cursor', () => {
    const bytes = convertUnicodePuaToPetscii('\x1b[3;5H');
    expect(Array.from(bytes)).toEqual([0x11, 0x11, 0x1D, 0x1D, 0x1D, 0x1D]);
  });
});

describe('convertUnicodePuaToPetscii truecolor SGR', () => {
  it('maps an exact Colodore truecolor match to its VIC index', () => {
    // #813338 is Colodore VIC 2 (red) -> PETSCII byte 0x1C
    const bytes = convertUnicodePuaToPetscii('\x1b[38;2;129;51;56m');
    expect(Array.from(bytes)).toEqual([0x1C]);
  });
  it('maps a non-exact truecolor value to the nearest VIC by RGB distance', () => {
    // Close to Colodore VIC 5 green (#56AC4D) but not exact
    const bytes = convertUnicodePuaToPetscii('\x1b[38;2;90;172;80m');
    expect(Array.from(bytes)).toEqual([0x1E]); // Green PETSCII byte
  });
});

describe('convertAsciiToPetsciiOutput charset prelude', () => {
  it('prepends $0E so a power-on C64 shows mixed case correctly', () => {
    const bytes = convertAsciiToPetsciiOutput('Hi', { charsetPrelude: true });
    expect(Array.from(bytes)).toEqual([0x0E, 0xC8, 0x49]); // 0x0E, 'H'->0xC8, 'i'->0x49
  });
  it('omits the prelude by default (unchanged callers keep old output)', () => {
    const bytes = convertAsciiToPetsciiOutput('Hi');
    expect(Array.from(bytes)).toEqual([0xC8, 0x49]);
  });
});

describe('convertAnsiToPetscii case handling', () => {
  it('case-swaps so a .seq file displays correct case in shifted mode', () => {
    const bytes = convertAnsiToPetscii('Ab');
    // prelude 0x0E, 'A' -> 0xC1 (shifted uppercase), 'b' -> 0x42 (shifted lowercase)
    expect(Array.from(bytes)).toEqual([0x0E, 0xC1, 0x42]);
  });
});

describe('PetsciiStreamConverter', () => {
  it('keeps charset, color and reverse state across chunks', () => {
    const c = new PetsciiStreamConverter();
    c.convert(Buffer.from([0x0E, 0x1C, 0x12])); // shifted charset, red, RVS on
    const out = c.convert(Buffer.from([0x41]));  // 'a' in shifted mode
    expect(out).toContain(String.fromCodePoint(0xE181)); // bank 1 (0xE100) + screen code 0x01 + reverse 0x80
  });
  it('one-shot wrapper still resets per call', () => {
    convertPetsciiToPetMe64(Buffer.from([0x12]));
    const out = convertPetsciiToPetMe64(Buffer.from([0x41]));
    expect(out).toContain(String.fromCodePoint(0xE001)); // fresh state, no reverse
  });
});
