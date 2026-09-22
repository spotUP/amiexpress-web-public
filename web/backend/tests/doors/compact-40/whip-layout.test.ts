/**
 * WHIP'S PANES, at the three widths the board owes every door.
 *
 * The sysop, 2026-09-22: "some of our typescript doors dont have a 40 column
 * mode, whip for example". A TypeScript door's output never crosses the
 * frame adapter, so a door with no forty-column layout is not merely ugly
 * there - the gate REFUSES it to a PETSCII caller.
 *
 * Every WHIP screen puts two boxes side by side: a list at `width: '50%'`
 * and a stats or detail panel at `width: '45%'`. On a C64 that is twenty
 * columns for a bordered list whose longest row is
 * `[D] My Profile (Discord name)` - twenty-nine - and eighteen for the
 * panel. The geometry is a pure function of the live width now
 * (`Doors/whip/ui/layout.ts`), which is what this file drives.
 *
 * The EIGHTY-column answers are pinned literally: they are what the screens
 * drew before this change, and a compact change that moves an eighty-column
 * board's boxes is a regression rather than a feature.
 */
import { whipPanes, sideFits } from '../../../../../Doors/whip/ui/layout';
import { columnGeometry } from '../../../../../Doors/whip/ui/kanban-board';

/** The content pane of a WHIP screen at 80x24: menu bar 1, header 3, footer 3. */
const EIGHTY_ROWS = 24 - (1 + 7);
/** ...and at 40x25, where the menu bar stands down below sixty columns. */
const FORTY_ROWS = 25 - 7;

describe('an eighty-column board', () => {
  it('keeps the two panes side by side, exactly where they were', () => {
    const panes = whipPanes(80, EIGHTY_ROWS);

    expect(panes.stacked).toBe(false);
    expect(panes.main).toEqual({ top: 1, left: 1, width: '50%', height: 13 });
    expect(panes.side).toEqual({ top: 1, right: 1, width: '45%', height: 12 });
  });

  it('answers the same for a wider caller, which is what `width: %` is for', () => {
    expect(whipPanes(132, 40).stacked).toBe(false);
    expect(whipPanes(132, 40).main.width).toBe('50%');
  });
});

describe('a C64 caller', () => {
  const panes = whipPanes(40, FORTY_ROWS);

  it('gets the list across the whole screen, not half of it', () => {
    expect(panes.stacked).toBe(true);
    expect(panes.main.width).toBe('100%');
    expect(panes.main.left).toBe(0);
  });

  it('gets the panel UNDER the list, never beside it', () => {
    expect(panes.side.width).toBe('100%');
    expect(panes.side.left).toBe(0);
    expect(panes.side.right).toBeUndefined();
    expect(panes.side.top).toBeGreaterThanOrEqual(Number(panes.main.height));
  });

  it('gets a menu tall enough for all ten entries', () => {
    // The box's interior is its height less the two border rows and the row
    // the list is inset by.
    expect(Number(panes.main.height) - 3).toBeGreaterThanOrEqual(10);
  });

  it('keeps both panes inside the content pane it was given', () => {
    expect(sideFits(panes)).toBe(true);
    expect(panes.side.top + panes.side.height).toBeLessThanOrEqual(FORTY_ROWS);
  });

  it('still has room to say something in the panel', () => {
    expect(sideFits(panes)).toBe(true);
    expect(panes.sideContentRows).toBeGreaterThanOrEqual(2);
  });
});

describe('a screen with no room left under the list', () => {
  it('drops the panel rather than drawing an empty frame', () => {
    // Eight rows of content: the list takes them and there is nothing under.
    // THE LIST WINS THE ROWS - it is what the caller came for, and a panel
    // that has to take four of the menu's rows to exist is not worth having.
    const panes = whipPanes(40, 8);

    expect(sideFits(panes)).toBe(false);
    expect(panes.side.height).toBe(0);
    expect(Number(panes.main.height)).toBe(8);
  });

  it('never gives the list more rows than the screen has', () => {
    for (const rows of [4, 6, 8, 12, 18, 25]) {
      const panes = whipPanes(40, rows);
      expect(Number(panes.main.height)).toBeLessThanOrEqual(Math.max(3, rows));
    }
  });
});


describe('the kanban board', () => {
  it('spreads four columns across an eighty-column screen, as it always has', () => {
    const geo = columnGeometry(80, 0, 4);

    expect(geo.onePerScreen).toBe(false);
    expect(geo.colWidth).toBe(19);
    expect([0, 1, 2, 3].map(geo.leftOf)).toEqual([0, 19, 38, 57]);
  });

  it('shows ONE column on a C64, because a quarter of forty is not a card', () => {
    const geo = columnGeometry(40, 0, 4);

    expect(geo.onePerScreen).toBe(true);
    expect(geo.colWidth).toBe(40);
  });

  it('slides the board so the focused column is the one on screen', () => {
    for (const focused of [0, 1, 2, 3]) {
      const geo = columnGeometry(40, focused, 4);

      expect(geo.leftOf(focused)).toBe(0);
      // ...and every other column is parked off one edge or the other.
      for (const other of [0, 1, 2, 3].filter(i => i !== focused)) {
        expect(Math.abs(geo.leftOf(other))).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('leaves a card enough room to be a card', () => {
    // The interior of the box, borders off.
    expect(columnGeometry(40, 0, 4).colWidth - 2).toBeGreaterThanOrEqual(36);
  });
});
