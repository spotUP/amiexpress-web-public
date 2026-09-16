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
  NARROW_WIDTH, narrowColumns, narrowFooter, narrowRow,
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
