/**
 * THE TWO DOORS THAT CANNOT PROMISE FORTY COLUMNS, AND WHAT THEY DO INSTEAD.
 *
 * BBSLINK is a telnet PROXY: from the moment it connects, the bytes on the
 * wire are a remote DOS game's screen, drawn on games.bbslink.net for eighty
 * columns. LINKWALL prints a wall fetched from the same place. Neither door
 * lays that content out and neither can.
 *
 * So "adapt them" means two things they CAN do: stop adding eighty-column
 * furniture of their own - LINKWALL's banner was a fifty-column rule, ten
 * past the edge of a C64 - and say ONCE, before the wide content arrives,
 * that it is wide. The caller is let in, because a door he cannot open is
 * worse than a game he has to squint at.
 */
import { banner, screenColumns, widthNotice } from '../../../../../Doors/bbslinkwall/layout';

/** Printable columns, escapes removed. */
const printable = (s: string): number => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;

describe('LINKWALL\'s own banner', () => {
  it('fits a C64 screen', () => {
    for (const row of banner('BBSLINK GRAFFITI WALL', 40)) {
      expect(printable(row)).toBeLessThanOrEqual(40);
    }
  });

  it('is the fifty columns it always was on a wide board', () => {
    const rows = banner('BBSLINK GRAFFITI WALL', 80);

    expect(printable(rows[0])).toBe(50);
    expect(rows[0]).toContain('+=');
  });

  it('centres its title without spilling either side', () => {
    for (const width of [40, 64, 80]) {
      const [rule, middle] = banner('BBSLINK GRAFFITI WALL', width);
      expect(printable(middle)).toBe(printable(rule));
    }
  });

  it('draws real escapes, not the text of one', () => {
    // The middle row carried DOUBLE-escaped sequences and printed a literal
    // `\x1b[0m` at the caller.
    const middle = banner('BBSLINK GRAFFITI WALL', 80)[1];

    expect(middle).not.toContain('\\x1b');
    expect(middle).toContain('BBSLINK GRAFFITI WALL');
  });
});

describe('the warning before somebody else\'s screen', () => {
  it('is given to a C64 caller', () => {
    expect(widthNotice(40)).toContain('80 columns');
  });

  it('is not given to anybody who does not need it', () => {
    expect(widthNotice(80)).toBeNull();
    expect(widthNotice(132)).toBeNull();
  });

  it('fits the screen it warns about', () => {
    expect(printable(widthNotice(40)!)).toBeLessThanOrEqual(40);
  });
});

describe('the caller\'s width', () => {
  it('comes from the session, and falls back to eighty', () => {
    expect(screenColumns({ bbsSession: { screenWidth: 40 } })).toBe(40);
    expect(screenColumns({ bbsSession: {} })).toBe(80);
    expect(screenColumns({})).toBe(80);
  });
});
