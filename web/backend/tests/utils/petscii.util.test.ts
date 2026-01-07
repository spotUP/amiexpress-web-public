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
} from '../../src/utils/petscii.util';

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

      expect(result).toContain('\x1b[97m'); // White color prefix
      expect(result).toContain('\x1b[0m');  // Reset at end
    });

    it('should handle PETSCII colors', () => {
      const buffer = Buffer.from([0x1C, 0x41]); // Red + A
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain('\x1b[31m'); // ANSI red
    });

    it('should handle character set switching', () => {
      const buffer = Buffer.from([0x0E, 0x41, 0x8E, 0x41]); // Shift on, A, Shift off, A
      const result = convertPetsciiToPetMe64(buffer);

      // Should not throw and should produce different PUA codes
      expect(result).toBeTruthy();
    });

    it('should handle reverse video control codes', () => {
      const buffer = Buffer.from([0x12, 0x41, 0x92]); // Reverse on, A, Reverse off
      const result = convertPetsciiToPetMe64(buffer);

      expect(result).toContain('\x1b[7m');  // Reverse on
      expect(result).toContain('\x1b[27m'); // Reverse off
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

      expect(result).toContain('\x1b[97m'); // White prefix
      expect(result).toContain('\x1b[0m');  // Reset
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

      expect(result).toContain('\x1b[31m'); // ANSI red
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

      // Control codes should not produce output (except ANSI codes)
      expect(result.length).toBeLessThan(20); // Just color + reset codes
    });

    it('should handle space characters', () => {
      const buffer = Buffer.from([0x20, 0xA0, 0xE0]); // Various space codes
      const result = convertPetsciiToAnsi(buffer);

      expect(result).toContain(' ');
    });
  });

  describe('convertAnsiToPetscii', () => {
    it('should convert ASCII text to PETSCII', () => {
      const text = 'HELLO';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x48); // H
      expect(result[1]).toBe(0x45); // E
      expect(result[2]).toBe(0x4C); // L
      expect(result[3]).toBe(0x4C); // L
      expect(result[4]).toBe(0x4F); // O
    });

    it('should convert numbers', () => {
      const text = '0123456789';
      const result = convertAnsiToPetscii(text);

      for (let i = 0; i < 10; i++) {
        expect(result[i]).toBe(0x30 + i);
      }
    });

    it('should handle newlines', () => {
      const text = 'A\nB';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x41); // A
      expect(result[1]).toBe(0x0D); // CR (PETSCII return)
      expect(result[2]).toBe(0x42); // B
    });

    it('should handle lowercase letters', () => {
      const text = 'abc';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x61); // a
      expect(result[1]).toBe(0x62); // b
      expect(result[2]).toBe(0x63); // c
    });

    it('should handle punctuation', () => {
      const text = '!@#$%';
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x21); // !
      expect(result[1]).toBe(0x40); // @
      expect(result[2]).toBe(0x23); // #
      expect(result[3]).toBe(0x24); // $
      expect(result[4]).toBe(0x25); // %
    });

    it('should convert unknown characters to space', () => {
      const text = String.fromCharCode(0x80) + String.fromCharCode(0xFF);
      const result = convertAnsiToPetscii(text);

      expect(result[0]).toBe(0x20); // Space
      expect(result[1]).toBe(0x20); // Space
    });

    it('should handle empty string', () => {
      const text = '';
      const result = convertAnsiToPetscii(text);

      expect(result.length).toBe(0);
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
    it('should convert PETSCII uppercase to ASCII uppercase', () => {
      const buffer = Buffer.from([0x41, 0x42, 0x43]); // ABC
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('ABC');
    });

    it('should convert PETSCII lowercase to ASCII lowercase', () => {
      const buffer = Buffer.from([0xC1, 0xC2, 0xC3]); // abc in PETSCII
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('abc');
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
      const buffer = Buffer.from([0x41, 0x0A, 0x42]); // A, LF, B
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('AB'); // LF skipped
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
      const buffer = Buffer.from([0x00, 0x03, 0x41, 0x08, 0x42]); // Controls + A + Controls + B
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('AB'); // Only letters extracted
    });

    it('should handle graphics range 0x61-0x7A as lowercase', () => {
      const buffer = Buffer.from([0x61, 0x62, 0x63]); // a, b, c
      const result = convertPetsciiInputToAscii(buffer);

      expect(result).toBe('abc');
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
      const text = '\x1b[A\x1b[B\x1b[C\x1b[D';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x91); // Up
      expect(result[1]).toBe(0x11); // Down
      expect(result[2]).toBe(0x1D); // Right
      expect(result[3]).toBe(0x9D); // Left
    });

    it('should handle home ANSI code', () => {
      const text = '\x1b[H';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x13); // Home
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

    it('should handle regular ASCII pass-through', () => {
      const text = 'ABC';
      const result = convertUnicodePuaToPetscii(text);

      expect(result[0]).toBe(0x41); // A
      expect(result[1]).toBe(0x42); // B
      expect(result[2]).toBe(0x43); // C
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

      expect(result).toContain('\x1b[31m'); // Red
      expect(result).toContain('\x1b[97m'); // White
      expect(result).toContain('\x1b[32m'); // Green
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

      expect(result).toContain('\x1b[2J\x1b[H'); // Clear + home
      expect(result).toContain('\x1b[97m'); // White
      expect(result).toContain('\x1b[31m'); // Red
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
