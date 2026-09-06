/**
 * theme-picker at 40x25 (C64/PETSCII XXS tier) - C64 40-col plan, Task 6.
 *
 * RED, captured from the real door through a 40x25 BBS stub before this
 * change (scratch harness, byte stream rendered into a 40x25 grid):
 *
 *   02|>>[*] Classic          The original Ami
 *   03|  Express look and feel            <-- the row folded
 *   04|  [ ] Midnight         Low-light theme
 *   (the third theme never appeared; the note and the footer both clipped)
 *
 * The rows are built by exported builders so the assertion is on the real
 * strings the door hands to the List, not on a source pin. The 80-column
 * branch is pinned literally: a compact change that alters an 80-column
 * board's screen is a regression, not a feature.
 */
import { getCompactProfile } from '../../../../../sdk/engines/ui/blessed/core/responsive-constants';
const { Screen } = require('../../../../../sdk/engines/ui/blessed');
// The compiled module the door actually loads (its package exports map points
// at sdk/dist), so a spy here is the spy the door sees through the barrel.
const chrome = require('../../../../../sdk/dist/engines/ui/theme/chrome');

const {
  buildThemeItems,
  buildNote,
  buildFooterHints,
} = require('../../../../../Doors/theme-picker/app');

/** Printable width, escape sequences removed. */
const printable = (s: string): number => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;

// A no-op style bag: the builders only ever wrap text, so an identity style
// makes the assertions about LAYOUT, not about the active theme's colours.
const plainStyles = {
  accent: (t: string) => t,
  dim: (t: string) => t,
  ink: (t: string) => t,
};

const THEMES = [
  { id: 'classic', name: 'Classic', blurb: 'The original AmiExpress look and feel' },
  { id: 'midnight', name: 'Midnight', blurb: 'Low-light theme with muted accents' },
  { id: 'amber', name: 'Amber', blurb: 'Monochrome amber phosphor, like a VT' },
];

describe('theme-picker compact (40-column) layout', () => {
  const compact = getCompactProfile(40);
  const wide = getCompactProfile(80);

  it('every theme row fits a 40-column screen', () => {
    const items = buildThemeItems(THEMES, 'classic', plainStyles, compact);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(printable(item)).toBeLessThanOrEqual(40);
    }
  });

  it('the 40-column row is the mark plus the name, with no blurb column', () => {
    const [first] = buildThemeItems(THEMES, 'classic', plainStyles, compact);
    expect(first).toBe('[*] Classic');
    expect(first).not.toContain('The original');
  });

  it('a long theme name is clipped to the SCREEN, never folded onto the next row', () => {
    const long = [{ id: 'x', name: 'A Theme Name Far Longer Than Any Screen Allows', blurb: 'b' }];
    for (const width of [40, 32, 24]) {
      const [row] = buildThemeItems(long, 'none', plainStyles, getCompactProfile(width), width);
      expect(printable(row)).toBeLessThanOrEqual(width);
    }
  });

  it('the note and the footer hints fit 40 columns', () => {
    expect(printable(buildNote(plainStyles, compact))).toBeLessThanOrEqual(40);
    const hints = buildFooterHints(compact);
    // ' ' + 'Key: Does' joined by two spaces is what the footer renders.
    const rendered = ' ' + hints.map((h: { key: string; does: string }) => `${h.key}: ${h.does}`).join('  ');
    expect(printable(rendered)).toBeLessThanOrEqual(40);
  });

  // The effect gate. A rail repainting its row twenty times a second is
  // ~4KB/s of PETSCII for one row of decoration; at XXS no timer is started.
  it('40 columns: the chrome does not animate; 80 columns: it does', async () => {
    const { createApp } = require('../../../../../Doors/theme-picker/app');
    // The door asks the SDK for its whole chrome in one call; the spy passes
    // through so the real handle can be stopped and no timer outlives the
    // test. What the chrome DOES at each width is proven in
    // sdk/tests/unit/door-chrome.test.ts.
    const real = chrome.attachDoorChrome;
    const started: Array<{ stop(): void; animated: boolean }> = [];
    const spy = jest.spyOn(chrome, 'attachDoorChrome').mockImplementation(((...args: unknown[]) => {
      const handle = (real as any)(...args);
      started.push(handle);
      return handle;
    }) as any);
    const screens: any[] = [];
    // Screens are created by createScreen inside the door; grabbing them back
    // is not needed - the spy records the call (or its absence) either way.
    try {
      for (const [width, expected] of [[40, 0], [80, 1]] as Array<[number, number]>) {
        spy.mockClear();
        const bbs: any = {
          write: () => undefined,
          connectionType: 'web',
          getTerminalSize: () => ({ width, height: width === 40 ? 25 : 24 }),
          listThemes: () => THEMES,
          getActiveThemeId: () => 'classic',
          on: () => undefined,
        };
        const run = createApp({ bbs, user: { username: 'C64USER' } });
        await new Promise((r) => setTimeout(r, 20));
        // The wiring pin: the chrome is asked for at EVERY width - it is the
        // chrome itself that decides what moves.
        expect(spy).toHaveBeenCalledTimes(1);
        // jest's SpyInstance infers `unknown` for this call's args here (the
        // spied module comes through a plain `require`, so @types/jest
        // cannot recover attachDoorChrome's real parameter types); narrow
        // back to the fields these assertions read.
        expect((spy.mock.calls[0][1] as { width: number }).width).toBe(width);
        expect(started[started.length - 1].animated).toBe(expected === 1);
        void run;
      }
    } finally {
      for (const handle of started) { try { handle.stop(); } catch { /* leaving anyway */ } }
      spy.mockRestore();
      for (const s of screens) { try { s.destroy(); } catch { /* leaving anyway */ } }
    }
  });

  /**
   * Choosing a theme wears it, here, without leaving.
   *
   * The door used to save and immediately tear its screen down - "Open a
   * door to see it" - so the one screen built for judging themes was the
   * one screen that never showed you one (sysop, 2026-09-06: "theme exits
   * instead of applies the theme directly in the door").
   *
   * Driven through the real createApp: the promise it returns settles when
   * the door closes, and the point of this case is that it does NOT settle
   * on a selection.
   */
  it('picking a theme applies it and leaves the door open', async () => {
    const { createApp } = require('../../../../../Doors/theme-picker/app');
    const themeMod = require('../../../../../sdk/dist/engines/ui/theme');
    // The door builds its screen through the SDK helper, so the helper is
    // where a test can catch it - the same trick the chrome case above uses.
    const helpers = require('../../../../../sdk/dist/utils/blessed-helpers');
    const realScreen = helpers.createScreen;
    const screens: any[] = [];
    const screenSpy = jest.spyOn(helpers, 'createScreen')
      .mockImplementation(((...args: unknown[]) => {
        const scr = (realScreen as any)(...args);
        screens.push(scr);
        return scr;
      }) as any);

    // REAL ids, unlike the layout fixture above: this case follows the
    // choice all the way into the SDK's active theme, and themeById() sends
    // an id this board does not have back to classic - which would make the
    // door's "already wearing it" check skip the whole thing.
    const REAL = [
      { id: 'classic', name: 'Classic', blurb: 'The board as it has always looked.' },
      { id: 'uprough-neon', name: 'Uprough Neon', blurb: 'Demoscene magenta and cyan.' },
    ];

    let saved: string | null = null;
    const bbs: any = {
      write: () => undefined,
      connectionType: 'web',
      getTerminalSize: () => ({ width: 80, height: 24 }),
      listThemes: () => REAL,
      getTheme: () => themeMod.themeById('classic'),
      setTheme: async (id: string) => { saved = id; return id; },
      on: () => undefined,
    };

    let closed = false;
    const run = createApp({ bbs, user: { username: 'SYSOP' } })
      .then(() => { closed = true; })
      .catch(() => { closed = true; });

    try {
      await new Promise((r) => setTimeout(r, 80));
      const screen = screens[screens.length - 1];
      expect(screen).toBeTruthy();

      const findList = (node: any): any => {
        if (!node) return null;
        if (typeof node.select === 'function' && Array.isArray(node.items)) return node;
        for (const child of node.children || []) {
          const hit = findList(child);
          if (hit) return hit;
        }
        return null;
      };
      const list = findList(screen);
      expect(list).toBeTruthy();

      list.select(1);
      list.emit('select', null, 1);
      await new Promise((r) => setTimeout(r, 60));

      // Saved, and STILL OPEN - the assertion the old door failed, because
      // it destroyed its screen the moment a theme was chosen.
      expect(saved).toBe('uprough-neon');
      expect(closed).toBe(false);

      // And the door is WEARING it: the SDK's active theme is the new one,
      // so everything built from here takes its colours.
      expect(themeMod.activeTheme().id).toBe('uprough-neon');

      // Leaving is not driven here: blessed delivers keys through its
      // program, not screen.emit, and faking that would test the fake. The
      // screen is destroyed in the finally, which settles the door.
    } finally {
      screenSpy.mockRestore();
      for (const scr of screens) { try { scr.destroy(); } catch { /* leaving anyway */ } }
      void run;
    }
  });

  it('the 80-column rows, note and hints are byte-identical to the pre-change door', () => {
    expect(buildThemeItems(THEMES, 'classic', plainStyles, wide)).toEqual([
      '[*] Classic          The original AmiExpress look and feel',
      '[ ] Midnight         Low-light theme with muted accents',
      '[ ] Amber            Monochrome amber phosphor, like a VT',
    ]);
    expect(buildNote(plainStyles, wide)).toBe('  A theme applies the next time a door draws.');
    expect(buildFooterHints(wide)).toEqual([
      { key: 'Up/Down', does: 'Choose' },
      { key: 'Enter', does: 'Use it' },
      { key: 'Q', does: 'Leave' },
    ]);
  });
});
