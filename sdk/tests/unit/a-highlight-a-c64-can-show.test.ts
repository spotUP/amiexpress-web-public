/**
 * A LIST'S HIGHLIGHT ON A SCREEN WITH NO BACKGROUNDS.
 *
 * PETSCII colour is per-cell FOREGROUND only. The transducer drops `bg` on
 * the way out and keeps the pen, so the highlight every door writes - a
 * background with a contrasting foreground - reaches a forty-column caller
 * as `fg: ground` alone: BLACK TEXT ON A BLACK SCREEN, and his own row is
 * the one he cannot read.
 *
 * The sysop found it in WHIP (2026-09-22: "the active row is black"), and
 * DOORMAN, BUGS and GMASTER carry the same style. So the decision is the
 * LIST's rather than each door's: a door asks for a highlight, and what a
 * highlight IS depends on the screen it lands on.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { List } from '../../engines/ui/blessed/widgets/list';

/** The first item's rendered line, tags and all. */
function firstRow(width: number, style: Record<string, unknown>): string {
  const screen = new Screen({ width, height: 25, responsive: true } as any);
  try {
    const list = new List({
      parent: screen, top: 0, left: 0, width: '100%', height: 5,
      items: ['one', 'two'], interactive: true, keys: true,
      style,
    } as any);
    list.select(0);
    return String((list as any).content ?? '').split('\n')[0];
  } finally {
    try { (screen as any).destroy(); } catch { /* leaving anyway */ }
  }
}

const HIGHLIGHT = { selected: { bg: 'cyan', fg: 'black' }, item: { fg: 'white' } };
const ESC = String.fromCharCode(27);

describe('a highlight on a forty-column screen', () => {
  it('is reverse video, the one fill a C64 has', () => {
    const row = firstRow(40, HIGHLIGHT);

    expect(row).toContain(`${ESC}[7m`);
    expect(row).toContain(`${ESC}[27m`);
  });

  it('carries no background, which would be dropped and take the pen with it', () => {
    const row = firstRow(40, HIGHLIGHT);

    expect(row).not.toContain(`${ESC}[46m`);   // cyan background
    expect(row).not.toContain(`${ESC}[30m`);   // black foreground
  });
});

describe('a highlight on an eighty-column board', () => {
  it('is the door\'s own colours, exactly as before', () => {
    const row = firstRow(80, HIGHLIGHT);

    expect(row).toContain(`${ESC}[46m`);
    expect(row).toContain(`${ESC}[30m`);
    expect(row).not.toContain(`${ESC}[7m`);
  });
});

describe('a door that asks for reverse itself', () => {
  it('gets it at either width', () => {
    for (const width of [40, 80]) {
      expect(firstRow(width, { selected: { inverse: true }, item: { fg: 'white' } }))
        .toContain(`${ESC}[7m`);
    }
  });
});
