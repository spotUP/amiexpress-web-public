/**
 * An Amiga screen with no SAUCE record reads the same in the editor as on the
 * board, and saves back to its own bytes.
 *
 * The board weighed an unstamped screen's bytes and read it as Latin-1; the
 * editor read every unstamped file as CP437. So a theme's macron (0xAF, the
 * overline under its logos) was `¯` to a caller and `»` in the editor
 * ("upperscore blir ett >> tecken i vissa av skärmarna", GOTO8O,
 * 2026-10-01). Both now ask the SDK's isAmigaText.
 */
import { describe, it, expect } from 'vitest';
import { screenToArt, canvasToScreen, bytesToBase64, base64ToBytes } from '../pages/screen-bytes';

const AMIGA = new Uint8Array([
  ...Buffer.from('\x1b[0;34m_____\r\n'),
  0xaf, 0xaf, 0xaf, 0xaf, 0xaf, 0x0d, 0x0a,
  0x7f, 0x7f, 0x0d, 0x0a,
]);

const row = (canvas: { char: string }[][], y: number, n: number) =>
  canvas[y].slice(0, n).map(c => c.char).join('');

describe('an unstamped Amiga screen in the editor', () => {
  it('shows the macron and the Topaz checker, not CP437', async () => {
    const { canvas, amiga } = await screenToArt(bytesToBase64(AMIGA), undefined, 'Conf/1/Menu.txt');
    expect(amiga).toBe(true);
    expect(row(canvas, 1, 5)).toBe('¯'.repeat(5));
    expect(row(canvas, 2, 2)).toBe('▒▒');
  });

  it('saves the same bytes back', async () => {
    const { canvas, sauce, amiga } = await screenToArt(bytesToBase64(AMIGA), undefined, 'Conf/1/Menu.txt');
    const out = base64ToBytes(canvasToScreen(canvas, sauce, amiga));
    expect(Array.from(out).filter(b => b >= 0x7f)).toEqual([0xaf, 0xaf, 0xaf, 0xaf, 0xaf, 0x7f, 0x7f]);
  });

  it('a .ans with no record is still PC art', async () => {
    const { amiga } = await screenToArt(bytesToBase64(AMIGA), undefined, 'art.ans');
    expect(amiga).toBe(false);
  });
});
