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
const {
  buildCategoryRow,
  buildDoorRow,
  buildFooterContent,
} = require('../../../../../Doors/doors-menu/app');

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
