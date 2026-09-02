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
  fitToWidth,
} = require('../../../../../Doors/ami-stripper/layout');

/** Printable length of one terminal row. */
const printable = (s: string): number => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;

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

  // The two status lines the review found: they carry a filename, so no
  // literal can be short enough on its own - they have to be wrapped.
  it('a status line carrying a filename wraps instead of eating the next row', () => {
    const line = '\x1b[32mStripped archive written to SOME-LONG-SCENE-RELEASE.zip\x1b[0m (portable ZIP format).\r\n';
    for (const row of fitToWidth(line, 40).split('\r\n')) {
      expect(printable(row)).toBeLessThanOrEqual(40);
    }
    // Wrapped, not truncated.
    const joined = fitToWidth(line, 40).replace(/\r\n/g, ' ').replace(/\s+/g, ' ');
    expect(joined).toContain('portable ZIP format');
    expect(joined).toContain('SOME-LONG-SCENE-RELEASE.zip');
  });

  it('the Done. size summary wraps too', () => {
    const line = '\x1b[32mDone.\x1b[0m 1.2 MB -> 840 KB (saved 384 KB)\r\n';
    for (const row of fitToWidth(line, 40).split('\r\n')) {
      expect(printable(row)).toBeLessThanOrEqual(40);
    }
  });

  it('a prompt keeps the cursor on its own row (no break appended)', () => {
    const prompt = '\x1b[90mPress ENTER to continue...\x1b[0m';
    expect(fitToWidth(prompt, 40).endsWith('\r\n')).toBe(false);
  });

  it('80 columns: every string is the one the door emitted before', () => {
    // fitToWidth is a straight pass-through at 80 and wider.
    const long = '\x1b[32mStripped archive written to A-VERY-LONG-NAME.zip\x1b[0m (portable ZIP format).\r\n';
    expect(fitToWidth(long, 80)).toBe(long);
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
