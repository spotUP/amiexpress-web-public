/**
 * One scrollbar for the whole board (sysop, 2026-10-15): solid colour bars.
 * Track is a space on the theme's DIM, thumb a space on its BAR, hover INK.
 * No glyphs. A door's own scrollbar options never reach the paint.
 */
import { describe, it, expect } from '@jest/globals';
import { Screen, List } from '../engines/ui/blessed';
import { themeById, setActiveTheme, retintTree, scrollbarRoles } from '../engines/ui/theme';
import { thumbGeometry } from '../engines/ui/blessed/core/scrollbar';

const items = Array.from({ length: 40 }, (_, i) => `row ${i}`);

function build(extra: Record<string, unknown> = {}) {
  const screen = new Screen({ smartCSR: true } as any);
  const list: any = new List({ parent: screen, top: 0, left: 0, width: 20, height: 8, items, ...extra } as any);
  screen.render();
  return { screen: screen as any, list };
}

/** Scrollbar column cells, top to bottom, as [attr, ch]. */
function barCells(screen: any, list: any): Array<[number, string]> {
  const x = 19;
  const out: Array<[number, string]> = [];
  for (let y = 0; y < 8; y++) out.push(screen.buffer[y][x]);
  return out;
}

describe('the one scrollbar', () => {
  for (const id of ['classic', 'uprough-neon']) {
    it(`draws track on DIM and thumb on BAR with no glyph (${id})`, () => {
      const theme = themeById(id);
      setActiveTheme(theme);
      const { screen, list } = build();
      const roles = scrollbarRoles(theme);
      const track = list.sattr({ fg: roles.track, bg: roles.track });
      const thumb = list.sattr({ fg: roles.thumb, bg: roles.thumb });
      const cells = barCells(screen, list);
      const g = thumbGeometry(items.length, 8, 0)!;
      cells.forEach(([attr, ch], y) => {
        expect(ch).toBe(' ');
        expect(attr).toBe(y >= g.start && y < g.start + g.size ? thumb : track);
      });
      expect(cells.some(([a]) => a === thumb)).toBe(true);
      expect(cells.some(([a]) => a === track)).toBe(true);
      screen.destroy();
    });
  }

  it('ignores a door-supplied glyph and style', () => {
    setActiveTheme(themeById('classic'));
    const plain = build();
    const baseline = barCells(plain.screen, plain.list);
    plain.screen.destroy();
    const styled = build({
      scrollbar: { ch: '#', track: { ch: '|', style: { bg: 'red' } }, style: { bg: 'green' } },
    });
    expect(barCells(styled.screen, styled.list)).toEqual(baseline);
    styled.screen.destroy();
  });

  it('can still be switched off', () => {
    const { screen, list } = build({ scrollbar: false });
    expect(list.hasScrollbar()).toBe(false);
    screen.destroy();
  });

  it('recolours on a theme switch', () => {
    const from = themeById('classic');
    const to = themeById('uprough-neon');
    setActiveTheme(from);
    const { screen, list } = build();
    const before = barCells(screen, list).map(([a]) => a);
    retintTree(screen, from, to);
    screen.render();
    const after = barCells(screen, list).map(([a]) => a);
    const roles = scrollbarRoles(to);
    expect(after).not.toEqual(before);
    expect(after).toContain(list.sattr({ fg: roles.track, bg: roles.track }));
    screen.destroy();
    setActiveTheme(from);
  });
});
