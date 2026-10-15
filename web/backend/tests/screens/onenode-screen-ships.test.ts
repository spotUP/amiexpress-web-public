/**
 * The board ships an ONENODE screen, and it fits the glass.
 *
 * express.e:29715-29727 shows SCREEN_ONENODE when an account is already on
 * another node, falling back to a bare line when the board has no such
 * screen. Until this file the fallback was all any caller ever saw:
 * Screens/ carried no ONENODE.TXT (T18 todo "ONENODE art").
 *
 * Pins the shipped file: present, non-empty, MCI-enabled (first line
 * opens with `~`, screen.handler.ts:2150), every row at most 80 printable
 * cells, single-line box frame in CP437 single bytes (the only corners the
 * PETSCII transducer maps — and UTF-8 multibyte sequences print as
 * mojibake on every terminal, live 2026-09-10), and carrying express's
 * own refusal line.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');
const artPath = path.join(repoRoot, 'Screens', 'ONENODE.TXT');

const stripSgr = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, '');

describe('ONENODE screen ships (express.e:29715-29727)', () => {
  // latin1: the file is CP437 bytes like every shipped screen (BBSTITLE);
  // reading as UTF-8 would fold the box corners into replacement chars.
  const art = fs.readFileSync(artPath, 'latin1');
  const rows = art.split('\n');

  test('file exists and is not a placeholder', () => {
    expect(art.length).toBeGreaterThan(100);
  });

  test('first line opens with a wipe code (and MCI on)', () => {
    expect(rows[0]).toMatch(/^~W[MHVSCRBNTEX]/i);
  });

  test('every row fits 80 printable cells', () => {
    for (const [i, line] of rows.entries()) {
      expect(stripSgr(line).length).toBeLessThanOrEqual(80);
    }
  });

  test('single-line box frame in single bytes, never UTF-8', () => {
    expect(art).toContain('Ú');
    expect(art).toContain('¿');
    expect(art).toContain('À');
    expect(art).toContain('Ù');
    expect(art).not.toMatch(/[É»È¼Íº]/);
    expect(Buffer.from(art, 'latin1').includes(Buffer.from([0xe2, 0x94]))).toBe(false);
  });

  test("carries express's refusal line", () => {
    expect(art).toContain('You are already logged into another node!');
  });
});
