/**
 * A screen crossing into the editor and back.
 *
 * The board's screens are CP437 bytes with ANSI escapes, and the API carries
 * them as base64 precisely so no UTF-8 round trip can touch them. This is the
 * seam where that guarantee either holds or quietly stops holding.
 */
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, screenToCanvas, canvasToScreen } from '../pages/screen-bytes';

describe('base64 at the edge', () => {
  it('round-trips a high-bit byte untouched', () => {
    const bytes = new Uint8Array([0xa1, 0x0d, 0x0a, 0xdb]);

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('survives a screen larger than one fromCharCode call can take', () => {
    // 80x25 of block characters is ordinary; the naive
    // String.fromCharCode(...bytes) blows the argument limit well before this.
    const bytes = new Uint8Array(64 * 1024).fill(0xdb);

    expect(base64ToBytes(bytesToBase64(bytes)).length).toBe(bytes.length);
  });
});

describe('a screen becoming cells', () => {
  it('plain text lands one character per cell', async () => {
    const canvas = await screenToCanvas(bytesToBase64(new TextEncoder().encode('HI')));

    expect(canvas[0][0].char).toBe('H');
    expect(canvas[0][1].char).toBe('I');
  });

  it('colour is carried on the cell, not left in the text', async () => {
    const canvas = await screenToCanvas(bytesToBase64(new TextEncoder().encode('\x1b[31mR')));

    expect(canvas[0][0].char).toBe('R');
    // The SDK stores the SGR number minus 30, so red is 1 - NOT the BIOS
    // palette index, where red is 4. Whatever renders a Cell has to use this
    // convention or every colour on screen is wrong by a rotation.
    expect(canvas[0][0].fg).toBe(1);
    expect(canvas[0][0].fg).not.toBe(7);   // and not the default
  });

  it('a CP437 block is the block character, not a mojibake pair', async () => {
    const canvas = await screenToCanvas(bytesToBase64(new Uint8Array([0xdb])));

    expect(canvas[0][0].char).toBe('█');
  });
});

describe('cells becoming a screen again', () => {
  it('a block written back is byte 0xDB, the way the board stores it', async () => {
    const canvas = await screenToCanvas(bytesToBase64(new Uint8Array([0xdb])));

    expect(base64ToBytes(canvasToScreen(canvas))).toContain(0xdb);
  });

  it('text and colour survive a full round trip through the editor', async () => {
    const once = await screenToCanvas(bytesToBase64(new TextEncoder().encode('\x1b[31mRED')));
    const twice = await screenToCanvas(canvasToScreen(once));

    expect(twice[0].slice(0, 3).map(c => c.char).join('')).toBe('RED');
    // Identity across the trip matters more than the number: whatever the
    // editor loaded, the board gets back.
    expect(twice[0][0].fg).toBe(once[0][0].fg);
    expect(twice[0][0].bg).toBe(once[0][0].bg);
  });
});

describe('the rows the art has, not the rows the canvas is', () => {
  /** A canvas of `rows` rows, `cols` wide, blank except where `ink` says. */
  const canvasOf = (rows: number, cols: number, ink: Record<number, string>) =>
    Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => ({
        char: (ink[y] ?? '')[x] ?? ' ', fg: 7, bg: 0,
      })),
    );

  const rowsOf = (base64: string) =>
    new TextDecoder('latin1').decode(base64ToBytes(base64)).split('\r\n').length;

  it('does not pad a seven-row logo out to the canvas height', async () => {
    // The sysop: "saving art in the ansi studio needs to save the amount i row
    // it has not pad it" - and then, when told his logo was 23 rows, "my logo
    // is not 23 rows..". It was seven; the other sixteen were canvas. The
    // Studio gives no way to delete a row ("atm i cant delete rows so it gets
    // less tall than 25"), so trimming on save is the only place this can go.
    const saved = canvasToScreen(canvasOf(25, 10, { 0: 'LOGO', 6: 'HERE' }));

    expect(rowsOf(saved)).toBe(7);
  });

  it('keeps a blank row BETWEEN two inked rows, because that is composition', async () => {
    const saved = canvasToScreen(canvasOf(25, 10, { 0: 'TOP', 4: 'BOTTOM' }));

    expect(rowsOf(saved)).toBe(5);
    const text = new TextDecoder('latin1').decode(base64ToBytes(saved));
    expect(text.split('\r\n')[2].trim()).toBe('');
  });

  it('counts a row painted in background colour as art, not as padding', async () => {
    // `isCellEmpty` is the shared rule: a space on a non-black background is a
    // drawn cell. A trim of its own that only looked at `char` would eat a
    // colour bar.
    const canvas = canvasOf(25, 10, { 0: 'TOP' });
    for (const cell of canvas[9]) cell.bg = 4;

    expect(rowsOf(canvasToScreen(canvas))).toBe(10);
  });

  it('a canvas nobody drew on saves as no rows at all', async () => {
    // Not zero BYTES: the writer signs off with a reset either way. Zero rows
    // is the claim - an empty screen is empty, not twenty-five blank lines.
    const saved = base64ToBytes(canvasToScreen(canvasOf(25, 10, {})));

    expect(new TextDecoder('latin1').decode(saved)).toBe('\x1b[0m');
  });
});
