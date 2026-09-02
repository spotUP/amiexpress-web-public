/**
 * Changing a running door's theme.
 *
 * "all typescript doors with menus could have a theme menu that let's the
 * user change blessed theme inside the doors on the fly" (sysop,
 * 2026-09-02). A door reads its theme once at startup, into widget styles
 * and into tags already inside setContent, so the switch has to reach both
 * carriers - a test that only checks `style.fg` would pass on a door whose
 * every label stayed the old colour.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen, Box, List, openThemeMenu } from '../engines/ui/blessed';
import { themeById, tokenMap, retintTags, retintTree, THEMES } from '../engines/ui/theme';

const CLASSIC = themeById('classic');
const NEON = themeById('uprough-neon');

describe('tokenMap', () => {
  it('maps a role to the same role in the other theme', () => {
    const map = tokenMap(CLASSIC, NEON);
    expect(map.get(CLASSIC.tokens.chrome)).toBe(NEON.tokens.chrome);
    expect(map.get(CLASSIC.tokens.accent)).toBe(NEON.tokens.accent);
  });

  it('is empty between a theme and itself, so a re-tint is a no-op', () => {
    expect(tokenMap(CLASSIC, CLASSIC).size).toBe(0);
  });

  it('gives an ambiguous colour to the role that measured commonest', () => {
    // classic paints body text, bar text and selected text all in 'white',
    // and bars and the selection both in 'blue'. tokens.ts counted the uses:
    // white is body text 44 times, blue is a bar 20 times.
    const map = tokenMap(CLASSIC, NEON);
    expect(map.get(CLASSIC.tokens.ink)).toBe(NEON.tokens.ink);
    expect(map.get(CLASSIC.tokens.bar)).toBe(NEON.tokens.bar);
  });
});

describe('retintTags', () => {
  const map = tokenMap(CLASSIC, NEON);

  it('rewrites an opening tag and the tag that closes it', () => {
    const out = retintTags(`{${CLASSIC.tokens.accent}-fg}READY{/${CLASSIC.tokens.accent}-fg}`, map);
    expect(out).toBe(`{${NEON.tokens.accent}-fg}READY{/${NEON.tokens.accent}-fg}`);
  });

  it('rewrites backgrounds as well as foregrounds', () => {
    expect(retintTags(`{${CLASSIC.tokens.chrome}-bg}`, map)).toBe(`{${NEON.tokens.chrome}-bg}`);
  });

  it('leaves a colour word in prose alone', () => {
    expect(retintTags('the white cliffs', map)).toBe('the white cliffs');
  });
});

describe('retintTree', () => {
  it('rewrites styles and content through a whole tree', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const panel = new Box({
      parent: screen,
      width: 20, height: 5,
      border: { type: 'line' },
      style: { fg: CLASSIC.tokens.ink, bg: CLASSIC.tokens.ground, border: { fg: CLASSIC.tokens.chrome } },
    } as any);
    const label = new Box({
      parent: panel,
      tags: true,
      content: `{${CLASSIC.tokens.accent}-fg}CHIPS{/${CLASSIC.tokens.accent}-fg}`,
    } as any);

    const result = retintTree(screen, CLASSIC, NEON);

    expect((panel as any).style.border.fg).toBe(NEON.tokens.chrome);
    expect((panel as any).style.fg).toBe(NEON.tokens.ink);
    expect((label as any).content).toContain(NEON.tokens.accent);
    expect(result.styles).toBeGreaterThan(0);
    expect(result.contents).toBeGreaterThan(0);
    screen.destroy();
  });

  it('rewrites a list through its items, which is what it repaints from', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const list = new List({
      parent: screen,
      width: 20, height: 5,
      items: [`{${CLASSIC.tokens.accent}-fg}One{/${CLASSIC.tokens.accent}-fg}`, 'Two'],
    } as any);
    (list as any).select(1);

    retintTree(screen, CLASSIC, NEON);

    expect((list as any).items[0]).toContain(NEON.tokens.accent);
    expect((list as any).selected).toBe(1);
    screen.destroy();
  });

  it('changes nothing when the theme has not changed', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const box = new Box({ parent: screen, style: { fg: CLASSIC.tokens.ink } } as any);
    expect(retintTree(screen, CLASSIC, CLASSIC)).toEqual({ styles: 0, contents: 0 });
    expect((box as any).style.fg).toBe(CLASSIC.tokens.ink);
    screen.destroy();
  });
});

describe('openThemeMenu', () => {
  const press = (screen: any, name: string) =>
    screen.program.emit('keypress', null, { name, full: name });

  /** The List debounces navigation keys by 50ms. */
  const wait = () => new Promise((resolve) => setTimeout(resolve, 60));

  it('re-tints the door behind it as the highlight moves, and saves on ENTER', async () => {
    const screen = new Screen({ smartCSR: true } as any);
    const board = new Box({
      parent: screen,
      width: 20, height: 5,
      style: { fg: CLASSIC.tokens.ink, border: { fg: CLASSIC.tokens.chrome } },
    } as any);

    const saved: string[] = [];
    const applied: string[] = [];
    const bbs = {
      getTheme: () => CLASSIC,
      setTheme: async (id: string) => { saved.push(id); return id; },
    };

    const closed = openThemeMenu({
      screen, bbs, onApply: (theme) => applied.push(theme.id),
    });

    await wait();
    press(screen, 'down');
    await wait();

    const second = THEMES[1];
    expect(applied).toEqual([second.id]);
    expect((board as any).style.border.fg).toBe(second.tokens.chrome);

    press(screen, 'enter');
    const chosen = await closed;
    expect(chosen.id).toBe(second.id);
    expect(saved).toEqual([second.id]);
    screen.destroy();
  });

  it('puts the door back on ESC and saves nothing', async () => {
    const screen = new Screen({ smartCSR: true } as any);
    const board = new Box({
      parent: screen,
      width: 20, height: 5,
      style: { fg: CLASSIC.tokens.ink, border: { fg: CLASSIC.tokens.chrome } },
    } as any);

    const saved: string[] = [];
    const bbs = {
      getTheme: () => CLASSIC,
      setTheme: async (id: string) => { saved.push(id); return id; },
    };

    const closed = openThemeMenu({ screen, bbs });
    await wait();
    press(screen, 'down');
    await wait();
    press(screen, 'escape');

    const chosen = await closed;
    expect(chosen.id).toBe(CLASSIC.id);
    expect((board as any).style.border.fg).toBe(CLASSIC.tokens.chrome);
    expect(saved).toEqual([]);
    screen.destroy();
  });
});
