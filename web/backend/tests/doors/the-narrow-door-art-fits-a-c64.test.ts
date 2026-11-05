/**
 * The narrow title art a 40-column caller is served.
 *
 * These four files are what a C64 or teletext caller reads instead of a
 * door's own 80-column art, and nothing else checks them: they are DATA, so a
 * drawing 42 columns wide would wrap on the caller's screen and no test would
 * have said a word.
 *
 * Three properties, each with a reason from the pipeline rather than taste:
 *
 *   FORTY COLUMNS  `VARIANT_COLUMNS`, and what a C64 screen is.
 *   LATIN-1 ONLY   `readVariant` reads these as latin1
 *                  (door-art-variants.ts:80), so a block glyph like U+2588
 *                  cannot be written into one - solid cells are reverse-video
 *                  spaces, which is also how a C64 draws them.
 *   ACTUAL ART     the placeholders these replaced were three lines of
 *                  `.---.` and drew nothing anyone would call a logo.
 */
import * as fs from 'fs';
import * as path from 'path';
import { VARIANT_COLUMNS } from '../../src/doors/door-art-variants';

const ART = path.resolve(__dirname, '..', '..', '..', '..', 'board', 'Screens', 'doors');

const VARIANTS = [
  ['B', 'c64'], ['B', 'ttx'], ['J', 'c64'], ['J', 'ttx'],
] as const;

const read = (door: string, alphabet: string) =>
  fs.readFileSync(path.join(ART, door, `title.${alphabet}.ans`));

/** What a caller SEES: the bytes with their colour and video codes removed. */
const visible = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, '');

describe('the art a narrow caller is served', () => {
  it.each(VARIANTS)('%s/%s exists and is not empty', (door, alphabet) => {
    expect(read(door, alphabet).length).toBeGreaterThan(100);
  });

  it.each(VARIANTS)('%s/%s fits a forty-column screen', (door, alphabet) => {
    const lines = read(door, alphabet).toString('latin1').split(/\r?\n/);
    const overWide = lines
      .map(visible)
      .map((l, i) => ({ row: i, width: l.length }))
      .filter(l => l.width > VARIANT_COLUMNS);

    expect(overWide).toEqual([]);
  });

  it.each(VARIANTS)('%s/%s writes nothing a latin-1 file cannot hold', (door, alphabet) => {
    // A high byte here is a drawing character that survived the editor and
    // will reach the caller as whatever latin1 makes of it.
    const stray = [...read(door, alphabet)].filter(b => b > 0x7e && b !== 0x1b);

    expect(stray).toEqual([]);
  });

  it.each(VARIANTS)('%s/%s draws solid cells the way a C64 does', (door, alphabet) => {
    // `ESC[7m` is reverse video, which `ansi-to-petscii` turns into a real
    // RVS block. A drawing with none of them is text, not art.
    const text = read(door, alphabet).toString('latin1');

    expect(text).toContain('\x1b[7m');
  });

  it.each(VARIANTS)('%s/%s leaves no colour or video mode on at the end', (door, alphabet) => {
    // The art is spliced INTO the door's own screen; a pen left on would
    // paint whatever the door draws next.
    const text = read(door, alphabet).toString('latin1').replace(/\r?\n$/, '');

    expect(text.endsWith('\x1b[0m')).toBe(true);
  });

  it('gives the two doors different drawings', () => {
    expect(read('B', 'c64').toString('latin1')).not.toBe(read('J', 'c64').toString('latin1'));
  });
});
