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
