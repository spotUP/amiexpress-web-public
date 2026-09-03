/**
 * bug-tracker at 40x25 (C64/PETSCII XXS tier) - C64 40-col plan, Task 6.
 *
 * RED, captured from the real door through a 40x25 BBS stub before this
 * change (byte stream rendered into a 40x25 grid):
 *
 *   00|.--------------------------------------.
 *   04|| .- Bug Tracker ---------------------.|
 *   07|| .- Menu ---------..- Statistics ---. |
 *   08|| | >>[N] New Bug  || Quick Stats:   | |
 *   09|| |   Report       ||                | |   <-- every label folded
 *   12|| |   [M] My Bug R || Fixed: 0       | |
 *   13|| |   eports       || Closed: 0      | |
 *   21|| | [Enter] Select   [Hotkey] Quick Ac||   <-- footer clipped
 *
 * Four nested frames ate 8 of 40 columns and the 48%/48% pair left 16 cells
 * per panel. The fix is the whole geometry, not the symptoms: `layout.ts`
 * holds every width rule, driven by the live screen through the SDK's
 * compact profile, and this suite drives that module directly (app.ts reads
 * `import.meta.url`, which a CommonJS runner cannot load).
 *
 * The wide branch of every rule is pinned literally: the same door driven
 * at 80x24 wrote the same bytes before and after this change.
 */
const {
  CompactLayout, listOnScreen, BUG_TRACKER_HINTS, BUG_TRACKER_HINTS_COMPACT,
} = require('../../../../../Doors/bug-tracker/layout');

const at = (width: number) => new CompactLayout(() => width);

describe('bug-tracker layout at 40 columns', () => {
  const narrow = at(40);
  const wide = at(80);

  it('drops the frames that cost 2 of 40 columns', () => {
    expect(narrow.panelBorder()).toBeUndefined();
    expect(narrow.frameless).toEqual({ border: undefined });
  });

  it('collapses the header and footer strips to one row', () => {
    expect(narrow.chromeH).toBe(1);
    expect(narrow.bodyH).toBe('100%-2');
    expect(narrow.panelLeft).toBe(0);
    expect(narrow.panelWidth).toBe('100%');
  });

  it('stacks a side-by-side pair instead of squeezing it to 16 cells', () => {
    const primary = narrow.pairPrimary({ top: 3, left: 1, width: '48%', height: '100%-6' });
    const secondary = narrow.pairSecondary({ top: 3, right: 1, width: '48%', height: '100%-6' });
    expect(primary).toEqual({ top: 1, left: 0, width: '100%', height: '50%-1' });
    expect(secondary).toEqual({ top: '50%', left: 0, width: '100%', height: '50%-1' });
    // Stacked, so neither panel sits beside the other and neither is inset.
    expect(secondary.left).toBe(0);
    expect(secondary.width).toBe('100%');
  });

  it('a bug title is clipped to what the row has left, never folded', () => {
    const title = 'A bug title that runs a very long way past forty columns indeed';
    const row = `#0001 [NEW] ${narrow.bugTitle(title, 0)}`;
    expect(row.length).toBeLessThanOrEqual(40);
  });

  it('a header strip carries its label in the text, since it has no frame', () => {
    expect(narrow.stripText(' Welcome, SYSOP! | 3 total bugs | 2 open', ' BUGS 3  OPEN 2'))
      .toBe(' BUGS 3  OPEN 2');
    expect(narrow.fit(' All Bugs: 3  F cycles', 1).length).toBeLessThanOrEqual(39);
  });

  it('a bar chart takes what the row can spare instead of a fixed 30', () => {
    expect(narrow.barWidth(30, 18)).toBe(22);
    const bar = '='.repeat(narrow.barWidth(30, 18));
    expect(`Critical [${bar}] 9`.length).toBeLessThanOrEqual(40);
  });

  it('80 columns: every rule is the value the door used before the change', () => {
    expect(wide.panelBorder()).toEqual({ type: 'line' });
    expect(wide.frameless).toEqual({});
    expect(wide.chromeH).toBe(3);
    expect(wide.panelLeft).toBe(1);
    expect(wide.panelWidth).toBe('98%');
    expect(wide.bodyH).toBe('100%-6');
    expect(wide.pairPrimary({ top: 3, left: 1, width: '48%', height: '100%-6' }))
      .toEqual({ top: 3, left: 1, width: '48%', height: '100%-6' });
    expect(wide.pairSecondary({ top: 3, right: 1, width: '28%', height: 12 }))
      .toEqual({ top: 3, right: 1, width: '28%', height: 12 });
    expect(wide.stripText('the long sentence', 'short')).toBe('the long sentence');
    expect(wide.bugTitle('x'.repeat(80), 0)).toBe('x'.repeat(50));
    expect(wide.barWidth(30, 18)).toBe(30);
    expect(wide.barWidth(25, 25)).toBe(25);
  });

  /**
   * The glitch target.
   *
   * This door detaches its content pane on every view change, so the chrome
   * is handed a GETTER rather than an element - and the getter has to find
   * whichever list the current view put on screen. Getting this wrong is
   * silent: the glitches simply never fire, which is what "the theme has no
   * chrome" looked like before any of this.
   *
   * The gate that stops the rail and the glitches at 40 lives in the SDK
   * (effectsAllowed, inside attachDoorChrome) and is proven against the real
   * function in sdk/tests/unit/door-chrome.test.ts; that this door reaches
   * that one call at all is pinned in
   * web/backend/tests/doors/theme-chrome-wiring.test.ts. What cannot be
   * driven from here is the door itself - app.ts reads `import.meta.url`,
   * which is why this suite drives layout.ts.
   */
  describe('the pane the theme glitches damage', () => {
    const list = { items: ['a', 'b'], setItems: () => undefined };

    it('finds the list the current view put on screen', () => {
      expect(listOnScreen({ children: [{}, list, {}] })).toBe(list);
    });

    it('is null for a view with no list, so the tick is skipped', () => {
      expect(listOnScreen({ children: [{}, { setItems: 'not a function' }] })).toBeNull();
      expect(listOnScreen({ children: [] })).toBeNull();
      expect(listOnScreen(null)).toBeNull();
    });

    it('never returns a detached pane it was not given', () => {
      // The container IS the door's live mainContainer, so what comes back
      // is whatever is attached right now - the reason this is a getter.
      const container = { children: [list] as unknown[] };
      expect(listOnScreen(container)).toBe(list);
      container.children = [];
      expect(listOnScreen(container)).toBeNull();
    });
  });

  describe('the hint sets', () => {
    /** Printable width, blessed tags removed. */
    const printable = (hints: Array<{ key: string; does: string }>) =>
      ' ' + hints.map((h) => `${h.key}: ${h.does}`).join('  ');

    it('the compact set fits a 40-column row', () => {
      expect(printable(BUG_TRACKER_HINTS_COMPACT).length).toBeLessThanOrEqual(40);
    });

    it('the wide set is the one the door drew before the change', () => {
      expect(BUG_TRACKER_HINTS.map((h: { key: string }) => h.key))
        .toEqual(['Arrows', 'Enter', 'ESC', 'Q']);
    });
  });
});
