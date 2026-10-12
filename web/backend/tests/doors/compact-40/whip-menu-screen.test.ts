/**
 * WHIP'S MAIN MENU, DRIVEN ON A REAL 40x25 SCREEN.
 *
 * The geometry tests beside this one ask the layout function where the panes
 * go; this one builds the door's actual screen at a C64's size and measures
 * the boxes that came out. It is the difference between "the sum is right"
 * and "nothing hangs off the glass" - and the second is what the sysop sees.
 *
 * The door is driven through its own exported entry, `showMainMenu`, with
 * the two collaborators it reads: a user and a data manager. Its promise
 * resolves on a keypress, which nothing here sends - the screen is measured
 * while the menu is up, which is when a caller is looking at it.
 */

export {};
const { Screen } = require('../../../../../sdk/engines/ui/blessed');
const { showMainMenu } = require('../../../../../Doors/whip/ui/main-menu');

type Coords = { xi: number; xl: number; yi: number; yl: number };

function coords(el: any): Coords {
  const c = el._getCoords(true) || el._getCoords();
  return { xi: c.xi, xl: c.xl, yi: c.yi, yl: c.yl };
}

/** Every box the door put on the screen, the screen itself excluded. */
function boxes(screen: any): any[] {
  const out: any[] = [];
  const walk = (node: any): void => {
    for (const child of node.children ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(screen);
  return out;
}

const USER = {
  userId: '1', handle: 'sysop', xp: 340, level: 3, tasksCompleted: 7,
  tasksCreated: 12, projectsCreated: 2, achievements: [], streak: 0,
};

const DATA = {
  loadProjects: async () => ([
    { id: 'p1', name: 'Demo One', type: 'demo', status: 'active', tasks: [] },
  ]),
  loadTasks: async () => ([
    { id: 't1', title: 'Write the loader', status: 'todo', priority: 'high', points: 5 },
    { id: 't2', title: 'Fix the scroller', status: 'done', priority: 'low', points: 2 },
  ]),
  getUser: async () => USER,
  loadParties: async () => [],
};

describe('the WHIP main menu on a C64', () => {
  let screen: any;

  afterEach(() => {
    try { screen?.destroy(); } catch { /* leaving anyway */ }
  });

  async function openAt(width: number, height: number): Promise<any[]> {
    screen = new Screen({ width, height, responsive: true } as any);
    // The promise resolves on a keypress; nothing sends one, so the menu
    // stays up and the screen is measured as the caller sees it.
    void showMainMenu(screen, USER as never, DATA as never);
    await new Promise(resolve => setTimeout(resolve, 20));
    screen.render();
    return boxes(screen);
  }

  it('paints nothing off the right edge of a forty-column screen', async () => {
    for (const el of await openAt(40, 25)) {
      expect(coords(el).xl).toBeLessThanOrEqual(40);
    }
  });

  it('paints nothing below a twenty-five row screen', async () => {
    for (const el of await openAt(40, 25)) {
      expect(coords(el).yl).toBeLessThanOrEqual(25);
    }
  });

  it('gives the menu the whole width rather than half of it', async () => {
    const drawn = await openAt(40, 25);
    const menu = drawn.find(el => String(el.options?.label ?? '').includes('MAIN MENU'));

    expect(menu).toBeDefined();
    expect(coords(menu).xl - coords(menu).xi).toBeGreaterThanOrEqual(38);
  });

  it('keeps every box inside the content pane, not on the footer\'s row', async () => {
    /*
     * The content pane has a BORDER - `createBox` draws one when the caller
     * names no `border` key - so its children live between its edges, not on
     * them. Reading its height instead of its interior put the stats panel's
     * bottom edge one row past it, on the footer's row (the sysop, with a
     * screenshot: "the stats panel overlaps other panels").
     */
    const drawn = await openAt(40, 25);
    const container = drawn.find(el => el.children?.some((c: any) => String(c.options?.label ?? '').includes('MAIN MENU')));
    const stats = drawn.find(el => String(el.options?.label ?? '').includes('STATS'));

    expect(container).toBeDefined();
    if (stats) {
      expect(coords(stats).yl).toBeLessThanOrEqual(coords(container).yl - 1);
    }
  });

  it('paints the selected row in REVERSE, which is the only fill a C64 has', async () => {
    const drawn = await openAt(40, 25);
    const list = drawn.find(el => el.type === 'list' || Array.isArray((el as any).items));

    expect(list).toBeDefined();
    const selected = (list as any).options?.style?.selected;
    // PETSCII has no per-cell background: `bg` is dropped on the way out and
    // `fg: ground` arrives as black text on a black screen.
    expect(selected.inverse).toBe(true);
    expect(selected.bg).toBeUndefined();
  });

  it('keeps the stats under the menu, never beside it', async () => {
    const drawn = await openAt(40, 25);
    const menu = drawn.find(el => String(el.options?.label ?? '').includes('MAIN MENU'));
    const stats = drawn.find(el => String(el.options?.label ?? '').includes('STATS'));

    if (stats) {
      expect(coords(stats).yi).toBeGreaterThanOrEqual(coords(menu).yl - 1);
    }
  });

  it('is unchanged on an eighty-column board: the two panes sit side by side', async () => {
    const drawn = await openAt(80, 24);
    const menu = drawn.find(el => String(el.options?.label ?? '').includes('MAIN MENU'));
    const stats = drawn.find(el => String(el.options?.label ?? '').includes('STATS'));

    expect(menu).toBeDefined();
    expect(stats).toBeDefined();
    expect(coords(stats).xi).toBeGreaterThan(coords(menu).xl - 1);
    expect(coords(stats).yi).toBe(coords(menu).yi);
  });

  it('paints the selected row with a background on an eighty-column board', async () => {
    const drawn = await openAt(80, 24);
    const list = drawn.find(el => el.type === 'list' || Array.isArray((el as any).items));

    expect((list as any).options?.style?.selected?.bg).toBeDefined();
    expect((list as any).options?.style?.selected?.inverse).toBeUndefined();
  });

  it('gives the menu every one of its ten entries, unwrapped', async () => {
    const drawn = await openAt(40, 25);
    const list: any = drawn.find(el => Array.isArray((el as any).items));

    // `[D] My Profile (Discord name)` is twenty-nine columns and the marker
    // takes two more; the first cut left thirty-two and the row wrapped,
    // pushing the last entry out of the box.
    const coordsOf = coords(list);
    expect(coordsOf.xl - coordsOf.xi).toBeGreaterThanOrEqual(31);
    expect(list.items).toHaveLength(10);
  });
});
