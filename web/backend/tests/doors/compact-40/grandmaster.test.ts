/**
 * GRANDMASTER menu at 40x25 (C64/PETSCII XXS tier) - the menu is the
 * same at every width: all 19 rows, scrollable. The layout adapts
 * (single-column at 40, three-panel at 80) but the item list is always
 * the full set so PETSCII callers see the same modes as ANSI callers.
 */

const {
  MENU_ITEMS, MENU_SELECTIONS, menuRowsFor,
} = require('../../../../../Doors/grandmaster/ui/menu');
const { attractModeFor } = require('../../../../../Doors/grandmaster/ui/attract-screen');

describe('grandmaster menu at 40 columns', () => {
  const compact = menuRowsFor(40);
  const wide = menuRowsFor(80);
  const tall = menuRowsFor(132);

  it('the menu is the same 19 rows at every width', () => {
    expect(compact.selections).toHaveLength(19);
    expect(compact.items).toHaveLength(19);
    expect(wide.selections).toHaveLength(19);
    expect(tall.selections).toHaveLength(19);
  });

  it('the 40-column items and selections are index-aligned', () => {
    expect(compact.items.length).toBe(compact.selections.length);
  });

  it('every 40-column item fits in 40 printable columns', () => {
    for (const it of compact.items) {
      const printable = it.replace(/\{[^}]+\}/g, '');
      expect(printable.length).toBeLessThanOrEqual(40);
    }
  });

  it('the 80-column menu keeps the full 19-row set', () => {
    expect(wide.selections).toHaveLength(19);
    expect(wide.items).toHaveLength(19);
    expect(wide.selections).toContain('master');
    expect(wide.selections).toContain('tetrinet');
    expect(wide.selections).toContain('manual');
    expect(wide.selections).toContain('quit');
  });

  it('the 80-column and 132-column menus are the same shape', () => {
    expect(tall.selections).toEqual(wide.selections);
  });

  it('MENU_SELECTIONS at module scope is the 80-column ordering', () => {
    expect(MENU_SELECTIONS.indexOf('master')).toBeLessThan(
      MENU_SELECTIONS.indexOf('quit'),
    );
    expect(wide.selections).toEqual(MENU_SELECTIONS);
  });

  it('MENU_ITEMS and MENU_SELECTIONS are index-aligned at module scope', () => {
    expect(MENU_ITEMS.length).toBe(MENU_SELECTIONS.length);
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