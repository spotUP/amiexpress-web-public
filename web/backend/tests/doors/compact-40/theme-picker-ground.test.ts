/**
 * THEME door: every cell it paints sits on the active theme's GROUND.
 *
 * Sysop, 2026-10-15: "Classic" leaked a blue background and "Quiet Phosphor
 * (muted)" a lime-green one where black belongs. The invariant is the board's
 * token map (door-three-screens 5a): background is GROUND everywhere except
 * the one selected row, which wears selectionBg.
 *
 * The assertion is on the real bytes the door writes, replayed into a cell
 * grid, for EVERY theme the SDK ships.
 */
const { createApp } = require('../../../../../Doors/theme-picker/app');
const themeMod = require('../../../../../sdk/dist/engines/ui/theme');

type Cell = { ch: string; bg: string };

const NAMED = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** Replay a CSI/text stream into a width x height grid of {ch, bg}. */
export function replay(stream: string, width: number, height: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ch: ' ', bg: 'unpainted' })));
  let x = 0, y = 0, bg = 'default';
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|([^\x1b])/g;
  let m: RegExpExecArray | null;
  const color = (n: number): string => (n < 8 ? NAMED[n] : n < 16 ? 'bright' + NAMED[n - 8] : 'idx' + n);
  while ((m = re.exec(stream))) {
    if (m[3] !== undefined) {
      const c = m[3];
      if (c === '\r') x = 0;
      else if (c === '\n') y = Math.min(height - 1, y + 1);
      else if (y < height && x < width) { grid[y][x] = { ch: c, bg }; x++; }
      continue;
    }
    const args = m[1].split(';').filter(a => a !== '' && a[0] !== '?').map(Number);
    switch (m[2]) {
      case 'H': case 'f': y = (args[0] || 1) - 1; x = (args[1] || 1) - 1; break;
      case 'C': x += args[0] || 1; break;
      case 'D': x = Math.max(0, x - (args[0] || 1)); break;
      case 'A': y = Math.max(0, y - (args[0] || 1)); break;
      case 'B': y = Math.min(height - 1, y + (args[0] || 1)); break;
      case 'G': x = (args[0] || 1) - 1; break;
      case 'J': if (args[0] === 2 || args.length === 0) for (const r of grid) for (let i = 0; i < width; i++) r[i] = { ch: ' ', bg }; break;
      case 'K': for (let i = x; i < width; i++) grid[y][i] = { ch: ' ', bg }; break;
      case 'm': {
        const a = args.length ? args : [0];
        for (let i = 0; i < a.length; i++) {
          const v = a[i];
          if (v === 0 || v === 49) bg = v === 0 ? 'default' : 'black';
          else if (v >= 40 && v <= 47) bg = NAMED[v - 40];
          else if (v >= 100 && v <= 107) bg = 'bright' + NAMED[v - 100];
          else if (v === 48 && a[i + 1] === 5) { bg = color(a[i + 2]); i += 2; }
          else if (v === 48 && a[i + 1] === 2) { bg = `rgb${a[i + 2]},${a[i + 3]},${a[i + 4]}`; i += 4; }
          else if (v === 38 && a[i + 1] === 5) i += 2;
          else if (v === 38 && a[i + 1] === 2) i += 4;
        }
        break;
      }
    }
  }
  return grid;
}

async function paint(themeId: string, width: number, height: number, walk: string[] = []): Promise<{ grid: Cell[][]; selRow: number }> {
  const out: string[] = [];
  const themes = themeMod.THEMES.map((t: any) => ({ id: t.id, name: t.name, blurb: t.blurb }));
  const bbs: any = {
    write: (d: string) => { out.push(d); },
    connectionType: 'web',
    getTerminalSize: () => ({ width, height }),
    listThemes: () => themes,
    getTheme: () => themeMod.themeById(themeId),
    setTheme: async (id: string) => id,
    on: () => undefined,
  };
  const helpers = require('../../../../../sdk/dist/utils/blessed-helpers');
  const realScreen = helpers.createScreen;
  const screens: any[] = [];
  const spy = jest.spyOn(helpers, 'createScreen').mockImplementation(((...a: unknown[]) => {
    const s = (realScreen as any)(...a); screens.push(s); return s;
  }) as any);
  const run = createApp({ bbs, user: { username: 'SYSOP' } }).catch(() => undefined);
  await new Promise(r => setTimeout(r, 120));
  const findList = (node: any): any => {
    if (!node) return null;
    if (typeof node.select === 'function' && Array.isArray(node.items)) return node;
    for (const child of node.children || []) { const hit = findList(child); if (hit) return hit; }
    return null;
  };
  let idx = themes.findIndex((t: any) => t.id === themeId);
  for (const id of walk) {
    idx = themes.findIndex((t: any) => t.id === id);
    findList(screens[screens.length - 1]).select(idx);
    await new Promise(r => setTimeout(r, 60));
  }
  const grid = replay(out.join(''), width, height);
  spy.mockRestore();
  for (const s of screens) { try { s.destroy(); } catch { /* leaving */ } }
  void run;
  return { grid, selRow: 2 + idx };
}

/**
 * The only rows allowed off the ground: the selected row (selectionBg) and
 * the footer bar (footerStyle: `{ fg: dim, bg: bar }`, which THEMEC draws
 * the same way). Everything else - blank rows, masthead, note - is ground.
 */
function offGround(grid: Cell[][], theme: any, selRow: number): string[] {
  const bad: string[] = [];
  grid.forEach((row, y) => {
    const allowed = new Set<string>([theme.tokens.ground]);
    if (y === selRow) allowed.add(theme.tokens.selectionBg);
    if (y === grid.length - 1) allowed.add(theme.tokens.bar);
    for (const bg of new Set(row.map(c => c.bg))) {
      if (!allowed.has(bg)) bad.push(`row ${y}: ${bg}`);
    }
  });
  return bad;
}

describe('theme-picker paints on the theme GROUND', () => {
  afterEach(() => { themeMod.setActiveTheme(themeMod.themeById('classic')); });

  // Opening on a theme.
  for (const theme of themeMod.THEMES) {
    it(`opened on ${theme.id}: only ground, the selected row and the footer bar are coloured`, async () => {
      const { grid, selRow } = await paint(theme.id, 80, 24);
      expect(offGround(grid, theme, selRow)).toEqual([]);
    });
  }

  // Moving the cursor wears the theme under it (retintTree). Every ordered
  // pair, because the leak depended on where you came FROM.
  for (const from of themeMod.THEMES) {
    for (const to of themeMod.THEMES) {
      if (from.id === to.id) continue;
      it(`${from.id} -> ${to.id}: no colour of the old theme is left on the ground`, async () => {
        const { grid, selRow } = await paint(from.id, 80, 24, [to.id]);
        expect(offGround(grid, to, selRow)).toEqual([]);
      });
    }
  }

  it('at 40x25 as well, walking every theme', async () => {
    const ids = themeMod.THEMES.map((t: any) => t.id);
    for (const to of themeMod.THEMES) {
      const { grid, selRow } = await paint('classic', 40, 25, [...ids, to.id]);
      expect(offGround(grid, to, selRow)).toEqual([]);
    }
  });
});

describe('tokenMap', () => {
  it('never re-routes a colour that is the ground of both themes', () => {
    for (const from of themeMod.THEMES) {
      for (const to of themeMod.THEMES) {
        const map = themeMod.tokenMap(from, to);
        const moved = map.get(from.tokens.ground);
        expect(moved === undefined || moved === to.tokens.ground).toBe(true);
      }
    }
  });
});
