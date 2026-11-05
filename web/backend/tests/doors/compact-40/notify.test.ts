/**
 * NOTIFY on the three screens the board serves (door-three-screens, section 5).
 *
 *  - the door's own suites (Doors/notify/tests: layout.test, screen.test) run
 *    here too, so `test:ci` fails when they do: the 80-column rows pinned
 *    cell by cell, 40x25 within 39 columns in a compact summary with a stacked
 *    detail view and nothing moving by itself, 132x40 growing columns and a
 *    description, a cell change saving through the API, a refused cell not.
 *    They are the single copy of those assertions; they also run under
 *    dev/scripts/run-door-suites.ts.
 *  - REACHABILITY, once: the SHIPPED bundle (Doors/notify/dist, driven through
 *    `door.execute()` as executeTypeScriptDoor calls it) draws the caller's
 *    stored choice on the wire at 80 and at 40.
 *  - the .info mark is read off the file the board registers; the executeDoor
 *    gate is exercised for NOTIFY in marked-doors-launch-on-c64.test.ts.
 */
import 'reflect-metadata';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readTooltypeMap } from '../../../src/utils/info-file.util';
import * as layoutSuite from '../../../../../board/Doors/notify/tests/layout.test';
import * as screenSuite from '../../../../../board/Doors/notify/tests/screen.test';

jest.setTimeout(120000);

describe('NOTIFY layout (pure rows)', () => {
  for (const [name, fn] of Object.entries(layoutSuite)) it(name, fn as () => Promise<void>);
});

describe('NOTIFY on a driven blessed screen', () => {
  for (const [name, fn] of Object.entries(screenSuite)) it(name, fn as () => Promise<void>);
});

const REPO = path.resolve(__dirname, '../../../../..');
const DRIVER = path.join(__dirname, 'fixtures/drive-notify.cjs');

/** The wire is cell-diffed: runs of blanks arrive as cursor moves, so words are matched across gaps. */
function drive(cols: number, rows: number, petscii: boolean): string {
  const out = execFileSync(process.execPath, [DRIVER, JSON.stringify({ cols, rows, petscii, steps: [] })], {
    cwd: path.dirname(DRIVER), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const { captured, errors } = JSON.parse(out) as { captured: string[]; errors: string[] };
  expect(errors).toEqual([]);
  return captured.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

describe('NOTIFY: the shipped bundle shows the caller\'s stored choice', () => {
  it('at 80 columns the Reply row reads Instant under Email', () => {
    expect(drive(80, 25, false)).toMatch(/Reply\s*to\s*my\s*message\s*Instant\s*Unavailable\s*Off/);
  });

  it('at 40 columns it is one row with the compact summary', () => {
    expect(drive(40, 25, true)).toMatch(/E:Inst\s*P:-\s*B:Off/);
  });
});

describe('NOTIFY.info', () => {
  it('is marked MIN_COLUMNS=40 and registered for Doors/notify at access level 1', () => {
    const tt = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands/BBSCmd/NOTIFY.info')));
    expect(tt.MIN_COLUMNS).toBe('40');
    expect(tt.BBSCMD).toBe('NOTIFY');
    expect(tt.LOCATION).toBe('Doors/notify');
    expect(tt.ACCESS).toBe('1');
  });
});
