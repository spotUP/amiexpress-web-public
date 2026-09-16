/**
 * A C64 caller reads the list instead of being refused.
 *
 * The sysop, testing on a PETSCII session: "it says glc needs an 80 col screen
 * its gated". It was - the width gate is default-closed at eighty and GLC
 * declares nothing, which for the 68K binary was the honest answer: an
 * unmodified 80-column door does not fit.
 *
 * The board's frame adapter cannot rescue THIS door either: `ADAPTED_DOOR_TYPES`
 * is `XIM, DD, SIM, FIM` - the 68K wire - and a TypeScript door's output never
 * crosses that seam. So `C64_ADAPT=40` would be a lie about the mechanism and
 * `MIN_COLUMNS=40` a lie about the door.
 *
 * The port draws forty columns itself, which makes MIN_COLUMNS=40 true.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  BOARD_PAUSE_ROWS, C64_ROWS, NARROW_CHROME_ROWS, NARROW_WIDTH,
  compactActions, ellipsis, narrowColumns, narrowFooter, narrowListRows, narrowRow,
  printableWidth, renderNarrowScreen,
} from '../../../../Doors/glc-viewer/src/narrow';

const CALL = {
  Username: 'Spot', Location: 'Sweden', Bbsname: 'uPtOWN',
  Dateon: '16-09-2026', Timeon: '08:38', Timeoff: '08:44',
  Actions: 'UD', Upload: '1024', Download: '2048',
};

const LONG = {
  ...CALL,
  Username: 'A-VERY-LONG-HANDLE-INDEED',
  Bbsname: 'A BBS WITH A VERY LONG NAME',
  Location: 'SOMEWHERE VERY FAR AWAY INDEED',
  Actions: 'UDPOFHAL*BE',
};

const SCREEN = {
  logo: ['\x1b[35mLOGO'],
  showLocation: false,
  screenClear: false,
  calls: [CALL],
  yesterday: { statdate: '15-09', calls: '12', topcps: '9600', uploads: '5', downloads: '9' },
  records: {
    allcalls: '900', recordcalls: '42', calls: '11', mostcalled: 'reference-board',
    calls2: '9', secondmostcalled: 'uPtOWN', calls3: '7', thirdmostcalled: 'Nowhere',
  },
};

describe('the forty-column screen', () => {
  it('never draws a line wider than a C64 screen', () => {
    for (const line of renderNarrowScreen(SCREEN)) {
      expect({ line, width: printableWidth(line) })
        .toEqual({ line, width: expect.any(Number) });
      expect(printableWidth(line)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('holds its columns however long the names are', () => {
    // The row is CUT, not wrapped: a wrapped row would push the next caller
    // down and the list would stop being a table.
    expect(printableWidth(narrowRow(LONG, false))).toBeLessThanOrEqual(NARROW_WIDTH);
    expect(printableWidth(narrowRow(LONG, true))).toBeLessThanOrEqual(NARROW_WIDTH);
    expect(printableWidth(narrowRow(CALL, false))).toBe(printableWidth(narrowRow(LONG, false)));
  });

  it('lines the header up with the rows under it', () => {
    expect(printableWidth(narrowColumns(false))).toBe(printableWidth(narrowRow(CALL, false)));
    expect(printableWidth(narrowColumns(true))).toBe(printableWidth(narrowRow(CALL, true)));
  });

  it('keeps the whole footer inside forty columns too', () => {
    for (const line of narrowFooter(SCREEN.yesterday, SCREEN.records)) {
      expect(printableWidth(line)).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('shows who called, from where and when - the three a caller reads it for', () => {
    const row = narrowRow(CALL, false);
    expect(row).toContain('Spot');
    expect(row).toContain('uPtOWN');
    expect(row).toContain('08:38');
  });

  it('shows the location instead of the BBS when the door was asked to', () => {
    expect(narrowRow(CALL, true)).toContain('Sweden');
    expect(narrowRow(CALL, true)).not.toContain('uPtOWN');
  });

  it('carries the clear on the first drawn line, as the wide screen does', () => {
    const [first] = renderNarrowScreen({ ...SCREEN, screenClear: true });
    expect(first.startsWith('\x0c')).toBe(true);
  });

  it('draws a row per caller between the two rules', () => {
    const lines = renderNarrowScreen({ ...SCREEN, calls: [CALL, CALL, LONG] });
    const rules = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').startsWith('----'));
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules[1].index - rules[0].index - 1).toBe(3);
  });
});

describe('what the registration must say', () => {
  it('claims forty columns, because the door now draws them', () => {
    // The gate is default-closed at 80: a door that declares nothing is
    // refused, which is what the sysop hit. This is the door asserting the
    // thing the test above proves.
    const icon = fs.readFileSync(
      path.join(__dirname, '../../../../Commands/BBSCmd/gl.info'), 'latin1',
    );
    expect(icon).toContain('MIN_COLUMNS=40');
  });

  it('does not claim C64_ADAPT, which would be a lie for a TS door', () => {
    const icon = fs.readFileSync(
      path.join(__dirname, '../../../../Commands/BBSCmd/gl.info'), 'latin1',
    );
    // `ADAPTED_DOOR_TYPES` is XIM/DD/SIM/FIM - the adapter never sees this
    // door's output, so a claim to reach 40 THROUGH it would be false.
    expect(icon).not.toContain('C64_ADAPT');
  });
});

/**
 * The second screenshot, 2026-09-16: the list drew correctly and spent four
 * columns on `--D-`, and `LINES=20` would have scrolled the header away.
 */
describe('what the second screenshot changed', () => {
  it('prints the actions that happened, not the places they did not', () => {
    // The server's field is POSITIONAL - ten slots, a dash where nothing
    // occurred. Eighty columns can afford the shape; forty cannot.
    expect(compactActions('-U--------')).toBe('U');
    expect(compactActions('-UD-------')).toBe('UD');
    expect(compactActions('----------')).toBe('');
    expect(compactActions('')).toBe('');
  });

  it('never lets the action column overflow, however many fired', () => {
    expect(compactActions('UDPOFHAL*BE').length).toBeLessThanOrEqual(3);
  });

  it('sizes the list so the header survives to be read', () => {
    // 25 rows, less the chrome and the board's own pause, less the logo.
    expect(narrowListRows(0)).toBe(C64_ROWS - NARROW_CHROME_ROWS - BOARD_PAUSE_ROWS);
    expect(narrowListRows(5)).toBe(C64_ROWS - NARROW_CHROME_ROWS - BOARD_PAUSE_ROWS - 5);
    // A logo big enough to eat the screen still leaves a caller to look at.
    expect(narrowListRows(99)).toBe(1);
  });

  it('draws a whole screen inside a C64\'s rows, logo and all', () => {
    const logo = ['a', 'b', 'c', 'd', 'e'];
    const callers = narrowListRows(logo.length);
    const lines = renderNarrowScreen({
      ...SCREEN,
      logo,
      calls: Array.from({ length: callers }, () => CALL),
    });
    expect(lines.length + BOARD_PAUSE_ROWS).toBeLessThanOrEqual(C64_ROWS);
  });
});

describe('the placeholder logo the door ships', () => {
  const placeholder = (style: number) => fs.readFileSync(
    path.join(__dirname, '../../../../Doors/glc-viewer/art', `style${style}.c64.ans`), 'latin1',
  );

  it('exists for every style, so a C64 screen is never bare', () => {
    for (const style of [1, 2, 3, 4]) {
      expect(placeholder(style).length).toBeGreaterThan(0);
    }
  });

  it('fits a C64 screen - forty columns, and inside the art budget', () => {
    const rows = placeholder(1).replace(/\r?\n$/, '').split(/\r?\n/);
    expect(rows.length).toBeLessThanOrEqual(6);
    for (const row of rows) expect(printableWidth(row)).toBeLessThanOrEqual(NARROW_WIDTH);
  });

  it('is drawn with REVERSE VIDEO, not a block glyph latin-1 cannot hold', () => {
    // U+2588 is not a latin-1 byte and these files are read as latin-1. The
    // C64 draws a solid cell by reversing a space, and the transducer already
    // latches SGR 7 (`ansi-to-petscii.ts:331`).
    expect(placeholder(1)).toContain('\x1b[7m');
    expect(placeholder(1)).not.toMatch(/[\u2580-\u259F]/);
  });
});

describe('a name too long for its column', () => {
  it('says it was cut, rather than stopping mid-word in silence', () => {
    // `The Northern` and `The Northern Palace` are both real BBS names, and a
    // caller reading the first cannot tell which he is looking at.
    expect(ellipsis('The Northern Palace', 14)).toBe('The Norther...');
    expect(ellipsis('METAL iMPACT', 14)).toBe('METAL iMPACT  ');
  });

  it('pads a short one to the column, so the table stays a table', () => {
    expect(ellipsis('abc', 8)).toBe('abc     ');
    expect(ellipsis('  abc  ', 8)).toBe('abc     ');
  });

  it('keeps the name when the column is too narrow for the dots themselves', () => {
    // Three dots alone say nothing; at this width the letters are worth more.
    expect(ellipsis('abcdef', 3)).toBe('abc');
    expect(ellipsis('abcdef', 2)).toBe('ab');
  });

  it('never widens the row it is cutting for', () => {
    expect(ellipsis('A VERY LONG SYSTEM NAME INDEED', 14)).toHaveLength(14);
    expect(printableWidth(narrowRow(LONG, false))).toBeLessThanOrEqual(NARROW_WIDTH);
  });

  it('marks the cut in the row a caller actually reads', () => {
    expect(narrowRow(LONG, false)).toContain('...');
  });
});
