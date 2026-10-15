/**
 * The loading bar is drawn in cells, not glyphs.
 *
 * CARD LOBBY is the only TypeScript door with a working progress bar, and it
 * was drawing it with `Gauge` - a drawille canvas, which paints BRAILLE
 * (U+2800+) as a foreground colour. A real Amiga terminal has no braille.
 *
 * Asked for by the sysop, 2026-09-02: "make sure it uses only amiga
 * characters though and make the bar use ansi bg colors instead". So the bar
 * is `ProgressBar`, which fills with spaces and lets an ANSI background
 * colour be the bar.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { DoorLoader } from '../../utils/DoorLoader';

/** Anything outside printable 7-bit ASCII, once the escapes are gone. */
function nonAsciiIn(output: string): string[] {
  const text = output
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
  return [...new Set([...text].filter((ch) => {
    const code = ch.codePointAt(0)!;
    return code > 126 || (code < 32 && ch !== '\n' && ch !== '\r' && ch !== '\t');
  }))];
}

describe('a door loading bar', () => {
  let screen: any;
  let writes: string[];

  beforeEach(() => {
    writes = [];
    screen = new Screen({
      title: 'loader', width: 80, height: 24,
      output: (d: string) => writes.push(d),
    } as any);
  });

  afterEach(() => screen?.destroy());

  it('paints nothing a real Amiga terminal cannot draw', () => {
    const loader = new DoorLoader(screen, { barColor: 'green' });
    loader.show('Initializing Card Lobby...');
    loader.update(45, 'Loading player profiles...');
    screen.render();

    expect(nonAsciiIn(writes.join(''))).toEqual([]);
  });

  it('draws the fill as a background colour over spaces', () => {
    const loader = new DoorLoader(screen, { barColor: 'green' });
    loader.show('Working...');
    loader.update(50);
    screen.render();

    const bar: any = (loader as any).bar;
    expect(bar).toBeDefined();
    // ProgressBar builds its content as `{colour-bg}<spaces>{/colour-bg}`.
    const content = String(bar.getContent?.() ?? '');
    expect(content.replace(/\{[^}]*\}/g, '').trim()).toBe('');
  });

  it('reports the progress it was given', () => {
    const loader = new DoorLoader(screen, {});
    loader.update(72);
    expect((loader as any).bar.getProgress()).toBe(72);
  });
});
