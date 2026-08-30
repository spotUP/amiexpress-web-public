/**
 * ANSI art loading: CP437 decoding, cursor movement and margin wrap.
 *
 * Found 2026-08-30 while adding revealed background art to the Super Qix
 * door. Four separate defects meant the loaders could not read the art the
 * BBS is built to display:
 *
 * 1. `new TextDecoder('cp437')` - "cp437" is not a label the encoding
 *    standard defines, so Node threw and .ans/.asc loading failed outright.
 * 2. Characters were taken as `String.fromCharCode(byte)`, i.e. Latin-1, so
 *    byte 0xDB (the full block that ANSI art is largely made of) became "U".
 * 3. Only ESC[H and ESC[f were handled. Art uses ESC[C constantly to skip
 *    runs of background rather than writing spaces, so those gaps collapsed
 *    and the rest of the line shifted left.
 * 4. No wrap at the right margin. Art that never emits a newline and simply
 *    runs past column 80 collapsed onto one row, everything past the margin
 *    discarded - one real file went from 1829 painted cells to 66.
 */

import { loadANSFile, saveANSFile, loadASCFile } from '../../engines/ui/ansi-editor/core/file-ops';
import { decodeCP437, encodeCP437, cp437ByteToChar, CP437_TO_UNICODE } from '../../engines/ui/ansi-editor/core/cp437';

const FULL_BLOCK = '█';   // CP437 0xDB
const LIGHT_SHADE = '░';  // CP437 0xB0

/** Build a .ans byte stream from a plain string of escape codes and text. */
function ans(text: string): Uint8Array {
  return encodeCP437(text);
}

describe('CP437 mapping', () => {
  it('covers all 256 byte values', () => {
    expect(CP437_TO_UNICODE.length).toBe(256);
  });

  it('maps the block glyphs ANSI art is drawn with', () => {
    expect(cp437ByteToChar(0xdb)).toBe(FULL_BLOCK);
    expect(cp437ByteToChar(0xb0)).toBe(LIGHT_SHADE);
    expect(cp437ByteToChar(0xc4)).toBe('─'); // horizontal line
    expect(cp437ByteToChar(0x20)).toBe(' ');
    expect(cp437ByteToChar(0x41)).toBe('A');
  });

  it('round-trips bytes through decode and encode', () => {
    const bytes = new Uint8Array([0x41, 0xdb, 0xb0, 0xc4, 0x20, 0xff]);
    const decoded = decodeCP437(bytes);
    expect(Array.from(encodeCP437(decoded))).toEqual(Array.from(bytes));
  });

  it('maps a space back to 0x20, not to the non-breaking space at 0xFF', () => {
    expect(Array.from(encodeCP437(' '))).toEqual([0x20]);
  });
});

describe('loadANSFile', () => {
  it('loads without throwing, which the cp437 TextDecoder used to prevent', async () => {
    const result = await loadANSFile(ans('hello'));
    expect(result.canvas.length).toBeGreaterThan(0);
    expect(result.canvas[0][0].char).toBe('h');
  });

  it('decodes high bytes as CP437 block glyphs, not Latin-1 letters', async () => {
    // 0xDB is the full block. Latin-1 would render it as U-circumflex.
    const result = await loadANSFile(new Uint8Array([0xdb, 0xb0]));
    expect(result.canvas[0][0].char).toBe(FULL_BLOCK);
    expect(result.canvas[0][1].char).toBe(LIGHT_SHADE);
  });

  it('advances the column for ESC[C instead of ignoring it', async () => {
    // "A", skip 5 columns, "B" -> B belongs at column 6.
    const result = await loadANSFile(ans('A\x1b[5CB'));
    expect(result.canvas[0][0].char).toBe('A');
    expect(result.canvas[0][6].char).toBe('B');
  });

  it('handles the other relative cursor moves', async () => {
    // Down 2, forward 3, write, then back 1 and up 1 and write.
    const result = await loadANSFile(ans('\x1b[2B\x1b[3CX\x1b[2D\x1b[1AY'));
    expect(result.canvas[2][3].char).toBe('X');
    expect(result.canvas[1][2].char).toBe('Y');
  });

  it('restores a saved cursor position', async () => {
    const result = await loadANSFile(ans('\x1b[5;5HA\x1b[s\x1b[1;1HB\x1b[uC'));
    expect(result.canvas[4][4].char).toBe('A');
    expect(result.canvas[0][0].char).toBe('B');
    // After restore the cursor is back where 'A' was written, one column on.
    expect(result.canvas[4][5].char).toBe('C');
  });

  it('wraps at the right margin rather than discarding the overflow', async () => {
    // 85 characters with no newline: a terminal wraps at column 80, so the
    // last five belong on row 1. Without wrapping they were thrown away.
    const result = await loadANSFile(ans('X'.repeat(85)));
    expect(result.canvas[0][79].char).toBe('X');
    expect(result.canvas[1][0].char).toBe('X');
    expect(result.canvas[1][4].char).toBe('X');
  });

  it('keeps colours across a wrap', async () => {
    const result = await loadANSFile(ans('\x1b[31m' + 'X'.repeat(82)));
    expect(result.canvas[0][79].fg).toBe(1); // red
    expect(result.canvas[1][0].fg).toBe(1);
  });

  it('reads SGR colours', async () => {
    const result = await loadANSFile(ans('\x1b[31;44mR'));
    expect(result.canvas[0][0].fg).toBe(1); // red
    expect(result.canvas[0][0].bg).toBe(4); // blue
  });
});

describe('loadASCFile', () => {
  it('loads and decodes as CP437', async () => {
    const result = await loadASCFile(new Uint8Array([0xdb, 0x41]));
    expect(result.canvas[0][0].char).toBe(FULL_BLOCK);
    expect(result.canvas[0][1].char).toBe('A');
  });
});

describe('saveANSFile', () => {
  it('writes CP437 bytes, so a block stays one byte rather than becoming UTF-8', async () => {
    const loaded = await loadANSFile(new Uint8Array([0xdb]));
    const saved = saveANSFile(loaded.canvas);
    // The block must appear as the single byte 0xDB somewhere in the output.
    expect(Array.from(saved)).toContain(0xdb);
    // ...and must NOT appear as the UTF-8 encoding of U+2588 (E2 96 88).
    const bytes = Array.from(saved);
    const utf8Run = bytes.findIndex((b, i) =>
      b === 0xe2 && bytes[i + 1] === 0x96 && bytes[i + 2] === 0x88);
    expect(utf8Run).toBe(-1);
  });

  it('round-trips art through save and load', async () => {
    const original = await loadANSFile(new Uint8Array([0xdb, 0xb0, 0x41]));
    const reloaded = await loadANSFile(saveANSFile(original.canvas));

    expect(reloaded.canvas[0][0].char).toBe(FULL_BLOCK);
    expect(reloaded.canvas[0][1].char).toBe(LIGHT_SHADE);
    expect(reloaded.canvas[0][2].char).toBe('A');
  });
});
