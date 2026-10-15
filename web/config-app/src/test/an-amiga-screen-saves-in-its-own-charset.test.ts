/**
 * An Amiga (Topaz) screen comes back from the editor in its own character set.
 *
 * h7's logoff screen carries SAUCE font "Amiga Topaz 2+": its bytes are
 * Latin-1 (0xD8 Ø, 0xBC ¼, 0xB7 ·). The editor read it as Latin-1, then saved
 * through the CP437 table - ¼ became 0xAC, · 0xFA, while Ø stayed 0xD8 - and
 * dropped the SAUCE record, so the board guessed CP437 and drew ╪ (sysop,
 * 2026-09-30: "renders incorrect in the web ui ansi editor and in the bbs but
 * correct in moebius").
 */
import { describe, it, expect } from 'vitest';
import { screenToArt, canvasToScreen, base64ToBytes, bytesToBase64 } from '../pages/screen-bytes';

function sauce(font: string, flags: number): Uint8Array {
  const rec = new Uint8Array(128);
  const put = (at: number, text: string) => { for (let i = 0; i < text.length; i++) rec[at + i] = text.charCodeAt(i); };
  put(0, 'SAUCE00');
  put(42, 'H7');
  rec[94] = 1; rec[95] = 1;          // character / ANSi
  rec[96] = 80; rec[98] = 2;         // 80 x 2
  rec[105] = flags;
  put(106, font);
  return rec;
}

function file(body: number[], font: string, flags = 0b10): string {
  const bytes = new Uint8Array([...body, 0x1a, ...sauce(font, flags)]);
  return bytesToBase64(bytes);
}

describe('saving a screen from the editor', () => {
  it('writes an Amiga Topaz piece back as Latin-1, with its SAUCE record', async () => {
    // "Ø¼·" then CR LF
    const opened = await screenToArt(file([0xd8, 0xbc, 0xb7, 0x0d, 0x0a], 'Amiga Topaz 2+'));
    expect(opened.canvas[0].slice(0, 3).map((c) => c.char).join('')).toBe('Ø¼·');

    const saved = base64ToBytes(canvasToScreen(opened.canvas, opened.sauce));
    const text = Array.from(saved);
    expect(text).toContain(0xd8);
    expect(text).toContain(0xbc);
    expect(text).toContain(0xb7);
    expect(text).not.toContain(0xac);
    expect(text).not.toContain(0xfa);

    const again = await screenToArt(bytesToBase64(saved));
    expect(again.sauce?.tInfoS.replace(/\0+$/, '').trim()).toBe('Amiga Topaz 2+');
    expect(again.sauce?.author.replace(/\0+$/, '').trim()).toBe('H7');
    expect((again.sauce?.tFlags ?? 0) & 0b10).toBe(0b10);
    expect(again.canvas[0].slice(0, 3).map((c) => c.char).join('')).toBe('Ø¼·');
  });

  it('still writes a PC piece as CP437', async () => {
    // CP437 0xDB (█) and 0xB0 (░)
    const opened = await screenToArt(file([0xdb, 0xb0, 0x0d, 0x0a], 'IBM VGA', 0));
    const saved = Array.from(base64ToBytes(canvasToScreen(opened.canvas, opened.sauce)));
    expect(saved.slice(0, 20)).toEqual(expect.arrayContaining([0xdb, 0xb0]));
  });
});
