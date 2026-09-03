/**
 * doors-menu at 40x25 (C64/PETSCII XXS tier) - C64 40-col plan, Task 6.
 *
 * RED, captured from the real door through a 40x25 BBS stub before this
 * change (byte stream rendered into a 40x25 grid):
 *
 *   03|>>[-] Games                     (2 door
 *   04|  s)                                     <-- folded onto the next row
 *   05|  [-] Utilities                 (2 door
 *   06|  s)
 *   24|Up/Down: Navigate  Enter: Select  T: Fil <-- footer clipped mid-word
 *
 * The category row, the door row and the footer are built by exported
 * width-driven builders, so these assertions run on the real strings the
 * door hands to its List. The 80-column branch is pinned literally.
 */

/**
 * `export {}` makes this file a MODULE. Without it a test file that only
 * `require()`s is a global script, and its top-level `const printable` collides
 * with the identical helper in its sibling suites - which is what broke the
 * repo's `typecheck:tests` (jest strips types and never noticed).
 */
export {};

const doorsMenu = require('../../../../../Doors/doors-menu/app');
const { buildCategoryRow, buildDoorRow, buildFooterContent } = doorsMenu;
// The compiled modules the door actually loads (its package exports map
// points at sdk/dist), so a spy here is the spy the door sees.
const glitchRunner = require('../../../../../sdk/dist/engines/ui/theme/glitch-runner');
const chrome = require('../../../../../sdk/dist/engines/ui/theme/chrome');

/** Printable width, escape sequences removed. */
const printable = (s: string): number => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;

// Identity styles: these assertions are about LAYOUT, not about which theme
// is active. `rail` is set because the rail tail is one of the things the
// XXS branch has to drop.
const plainStyles = {
  accent: (t: string) => t,
  accentAlt: (t: string) => t,
  ink: (t: string) => t,
  ok: (t: string) => t,
  dim: (t: string) => t,
  key: (t: string) => t,
  rail: '////////',
};

const DOOR = { type: 'TS', command: 'GMASTER', name: 'Grandmaster Chess', size: 245760 };

describe('doors-menu compact (40-column) rows', () => {
  it('a category row fits 40 columns and keeps its count', () => {
    const row = buildCategoryRow('Games', 2, false, plainStyles, 40);
    expect(printable(row)).toBeLessThanOrEqual(40);
    expect(row).toContain('Games');
    expect(row).toContain('(2)');
    expect(row).not.toContain('doors)');
  });

  it('a long category name is clipped, never folded onto the next row', () => {
    const row = buildCategoryRow('Utilities And Other Assorted Sysop Tools', 12, true, plainStyles, 40);
    expect(printable(row)).toBeLessThanOrEqual(40);
  });

  it('a door row fits 40 columns and drops the size column', () => {
    const row = buildDoorRow(DOOR, plainStyles, 40);
    expect(printable(row)).toBeLessThanOrEqual(40);
    expect(row).toContain('GMASTER');
    expect(row).not.toContain('240.0K');
  });

  it('a long door name is clipped rather than wrapped', () => {
    const row = buildDoorRow({ ...DOOR, name: 'A Door Whose Name Runs Well Past Forty Columns' }, plainStyles, 40);
    expect(printable(row)).toBeLessThanOrEqual(40);
  });

  it('the footer hints fit 40 columns and keep Back and Quit', () => {
    const footer = buildFooterContent(plainStyles, 40);
    expect(printable(footer)).toBeLessThanOrEqual(40);
    expect(footer).toContain('Back');
    expect(footer).toContain('Quit');
    // The decorative rail tail has no cells to live in at 40.
    expect(footer).not.toContain('////////');
  });

  // The effect gate. Glitches damage rows on purpose; on a 40-column canvas
  // that damage is the "stray glyphs mid-row" the sysop reported, so at XXS
  // no glitch timer is started at all.
  it('40 columns: attachGlitches is never called; 80 columns: it is', async () => {
    const glitchSpy = jest.spyOn(glitchRunner, 'attachGlitches').mockReturnValue(() => undefined);
    // ...and the door reaches them through the ONE SDK entry point, which is
    // also what stops the 20fps masthead interval leaking out of the test.
    const realChrome = chrome.attachDoorChrome;
    const started: Array<{ stop(): void }> = [];
    const chromeSpy = jest.spyOn(chrome, 'attachDoorChrome')
      .mockImplementation(((...args: unknown[]) => {
        const handle = (realChrome as any)(...args);
        started.push(handle);
        return handle;
      }) as any);
    try {
      for (const [width, expected] of [[40, 0], [80, 1]] as Array<[number, number]>) {
        glitchSpy.mockClear();
        chromeSpy.mockClear();
        const bbs: any = {
          write: () => undefined,
          connectionType: 'web',
          getTerminalSize: () => ({ width, height: width === 40 ? 25 : 24 }),
          getDoorList: async () => ([
            { id: 'gm', command: 'GMASTER', name: 'Grandmaster Chess', description: 'chess',
              type: 'TS', size: 245760, enabled: true, accessLevel: 0, category: 'Games' },
          ]),
          on: () => undefined,
        };
        const socket = { on: () => undefined, once: () => undefined, emit: () => undefined, id: 'spy' };
        const run = doorsMenu.createApp({ bbs, socket, user: { username: 'C64USER', secLevel: 255 }, params: [] });
        await new Promise((r) => setTimeout(r, 30));
        expect(glitchSpy).toHaveBeenCalledTimes(expected);
        // The wiring pin: the door asks the SDK for its chrome, at every
        // width. What that chrome DOES at each width is proven in
        // sdk/tests/unit/door-chrome.test.ts.
        expect(chromeSpy).toHaveBeenCalledTimes(1);
        void run;
      }
    } finally {
      for (const handle of started) { try { handle.stop(); } catch { /* leaving anyway */ } }
      glitchSpy.mockRestore();
      chromeSpy.mockRestore();
    }
  });

  it('80 columns: category row, door row and footer are byte-identical to the pre-change door', () => {
    expect(buildCategoryRow('Games', 2, false, plainStyles, 80))
      .toBe('[-] Games                     (2 doors)');
    expect(buildCategoryRow('Utilities', 1, true, plainStyles, 80))
      .toBe('[+] Utilities                 (1 door)');
    expect(buildDoorRow(DOOR, plainStyles, 80))
      .toBe('[TS ] GMASTER      Grandmaster Chess           240 KB');
    expect(buildFooterContent(plainStyles, 80))
      .toBe('Up/Down: Navigate  Enter: Select  T: Filter Type  Backspace: Back  Q: Quit  ////////');
  });
});
