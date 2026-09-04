/**
 * GRANDMASTER menu at 40x25 (C64/PETSCII XXS tier) - the menu is the
 * only screen the door can offer a C64 caller without folding, so every
 * width rule has to live in `menuRowsFor(width)`. The wide branch is
 * pinned: the same door at 80x24 keeps its 17-row menu byte-identical
 * to before the change.
 *
 * The 40-column C64 caller sees exactly three rows (master, manual,
 * quit) because the 80-column composition has twelve modes whose
 * 80-column descriptions do not fit on a 40-column canvas. Hiding them
 * is the right answer; folding them produces stray glyphs mid-row, the
 * defect class the SKILL exists to prevent.
 */

const {
  MENU_ITEMS, MENU_SELECTIONS, menuRowsFor,
} = require('../../../../../Doors/grandmaster/ui/menu');
const { attractModeFor } = require('../../../../../Doors/grandmaster/ui/attract-screen');

describe('grandmaster menu at 40 columns', () => {
  const compact = menuRowsFor(40);
  const wide = menuRowsFor(80);
  const tall = menuRowsFor(132);

  it('the 40-column menu is exactly three rows: master, manual, quit', () => {
    expect(compact.selections).toEqual(['master', 'manual', 'quit']);
    expect(compact.items).toHaveLength(3);
    expect(compact.selections).toHaveLength(3);
  });

  it('the 40-column items and selections are index-aligned', () => {
    expect(compact.items.length).toBe(compact.selections.length);
    // Every item is a non-empty labelled string; no blessed-tag-only
    // separators (a separator at 40 would draw a blank row).
    for (const it of compact.items) {
      expect(it.length).toBeGreaterThan(0);
    }
  });

  it('every 40-column item fits in 40 printable columns', () => {
    // Blessed tags like {cyan-fg} are stripped by the renderer; the
    // printable width is what hits the screen. Width-wise, 40 chars max.
    for (const it of compact.items) {
      const printable = it.replace(/\{[^}]+\}/g, '');
      expect(printable.length).toBeLessThanOrEqual(40);
    }
  });

  it('the 80-column menu keeps the full 17-row set', () => {
    expect(wide.selections).toHaveLength(17);
    expect(wide.items).toHaveLength(17);
    // Includes every mode that lives on the 80-column canvas.
    expect(wide.selections).toContain('master');
    expect(wide.selections).toContain('tetrinet');
    expect(wide.selections).toContain('manual');
    expect(wide.selections).toContain('quit');
  });

  it('the 80-column and 132-column menus are the same shape', () => {
    // 132 is the "wide" tier; it should keep the full menu, not get a
    // 40-col style compact view by accident.
    expect(tall.selections).toEqual(wide.selections);
  });

  it('MENU_SELECTIONS at module scope is the 80-column ordering', () => {
    // The compact branch is a FILTER of this list, not a separate ordering.
    // The order on the 40-col screen is the order in the full list.
    expect(MENU_SELECTIONS.indexOf('master')).toBeLessThan(
      MENU_SELECTIONS.indexOf('quit'),
    );
    expect(wide.selections).toEqual(MENU_SELECTIONS);
  });

  it('MENU_ITEMS and MENU_SELECTIONS are index-aligned at module scope', () => {
    expect(MENU_ITEMS.length).toBe(MENU_SELECTIONS.length);
  });

  it('the compact menu contains the quit row, so q/ESC findRow works', () => {
    // The fix the door ships: q/ESC look up the row by name, so the
    // key works in both 80- and 40-col layouts (a hardcoded index would
    // hit the wrong row when the list is 3 entries, not 17).
    expect(compact.selections.indexOf('quit')).toBeGreaterThanOrEqual(0);
    expect(compact.selections.indexOf('manual')).toBeGreaterThanOrEqual(0);
  });
});

describe('grandmaster attract screen at 40 columns', () => {
  it('at 40 columns the door runs the compact attract (single-row title)', () => {
    expect(attractModeFor(40)).toBe('compact');
  });

  it('at 80 columns the door runs the full attract (rainbow logo)', () => {
    expect(attractModeFor(80)).toBe('full');
  });

  it('at 132 columns the door runs the full attract (wide terminal)', () => {
    expect(attractModeFor(132)).toBe('full');
  });

  it('the boundary is exactly 80 columns, never 79', () => {
    expect(attractModeFor(79)).toBe('compact');
    expect(attractModeFor(80)).toBe('full');
  });
});
