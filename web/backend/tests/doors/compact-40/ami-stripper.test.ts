/**
 * ami-stripper at 40 columns (C64/PETSCII XXS tier) - C64 40-col plan, Task 6.
 *
 * RED (the literals the door emitted before this change, on a 40-column
 * screen):
 *
 *   ' AMIGA ARCHIVE STRIPPER' + pad to 80 + '[scene db: 12 patterns]'
 *      -> 80 characters on a 40-column row: it wraps and the banner sits
 *         on two rows, the second of them blue-on-white padding
 *   '-'.repeat(80)                 -> two full rows of rule
 *   path.substring(0,38).padEnd(38) + size(7) + ' [reason]'
 *      -> a listing row of 55+ characters, wrapping mid-path
 *
 * Every rule is now sized from the caller's real width, and the 80-column
 * strings are pinned literally below.
 */
const {
  stripperHeader,
  stripperRule,
  pathColumn,
  showsReason,
} = require('../../../../../Doors/ami-stripper/layout');

describe('ami-stripper at 40 columns', () => {
  it('the banner fills exactly the row, no more', () => {
    const header = stripperHeader('12', 40);
    expect(header).toHaveLength(40);
    expect(header).toContain('ARCHIVE STRIPPER');
    expect(header).toContain('12');
  });

  it('the rule is one row, not two', () => {
    expect(stripperRule(40)).toHaveLength(40);
  });

  it('a listing row fits: indent, path, size', () => {
    const col = pathColumn(38, 40);
    const row = `  ${'x'.repeat(col)} ${'240 KB'.padStart(7)}`;
    expect(row.length).toBeLessThanOrEqual(40);
  });

  it('the [reason] tail is dropped when there is nowhere to put it', () => {
    expect(showsReason(40)).toBe(false);
    expect(showsReason(80)).toBe(true);
  });

  it('80 columns: every string is the one the door emitted before', () => {
    expect(stripperHeader('12', 80)).toBe(
      ' AMIGA ARCHIVE STRIPPER' +
      ' '.repeat(80 - ' AMIGA ARCHIVE STRIPPER'.length - '[scene db: 12 patterns]'.length) +
      '[scene db: 12 patterns]'
    );
    expect(stripperHeader('12', 80)).toHaveLength(80);
    expect(stripperRule(80)).toBe('─'.repeat(80));
    expect(pathColumn(38, 80)).toBe(38);
    expect(pathColumn(40, 80)).toBe(40);
  });
});
