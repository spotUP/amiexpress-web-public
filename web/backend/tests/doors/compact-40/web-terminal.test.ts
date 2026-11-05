/**
 * WEBTERM on the three screens the board serves (door-three-screens, section 5).
 *
 *  - the door's own suites (Doors/web-terminal/tests: layout.test, screen.test)
 *    run here too, so `test:ci` fails when they do. They are the single copy of
 *    those assertions; they also run under dev/scripts/run-door-suites.ts.
 *  - REACHABILITY, once: the SHIPPED bundle (Doors/web-terminal/dist, driven
 *    through `door.execute()` as executeTypeScriptDoor calls it) draws the
 *    board's values at 80 and 40, a keypress reaches the board's toggle
 *    (sentinel: the call is recorded), and Esc ends execute().
 *  - the .info mark is read off the file the board registers; the executeDoor
 *    gate is exercised for WEBTERM in marked-doors-launch-on-c64.test.ts.
 */
import 'reflect-metadata';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readTooltypeMap } from '../../../src/utils/info-file.util';
import * as layoutSuite from '../../../../../board/Doors/web-terminal/tests/layout.test';
import * as screenSuite from '../../../../../board/Doors/web-terminal/tests/screen.test';

jest.setTimeout(120000);

describe('WEBTERM layout (pure rows)', () => {
  for (const [name, fn] of Object.entries(layoutSuite)) it(name, fn as () => Promise<void>);
});

describe('WEBTERM on a driven blessed screen', () => {
  for (const [name, fn] of Object.entries(screenSuite)) it(name, fn as () => Promise<void>);
});

const REPO = path.resolve(__dirname, '../../../../..');
const DRIVER = path.join(__dirname, 'fixtures/drive-web-terminal.cjs');
const DOWN = '\x1b[B';

interface Driven { text: string; calls: string[]; ended: boolean }

/** The wire is cell-diffed: runs of blanks arrive as cursor moves, so words are matched across gaps. */
function drive(cols: number, rows: number, petscii: boolean, steps: Array<{ key: string; wait: number }> = []): Driven {
  const out = execFileSync(process.execPath, [DRIVER, JSON.stringify({ cols, rows, petscii, steps })], {
    cwd: path.dirname(DRIVER), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const { captured, errors, calls, ended } = JSON.parse(out) as { captured: string[]; errors: string[]; calls: string[]; ended: boolean };
  expect(errors).toEqual([]);
  return { text: captured.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''), calls, ended };
}

describe('WEBTERM: the shipped bundle shows the board\'s values and calls the board', () => {
  it('at 80 columns the modem row carries its value on the same line', () => {
    expect(drive(80, 25, false).text).toMatch(/Modem\s*emulation\s*speed\s*2400\s*bps/);
  });

  it('at 40 columns the palette value sits under its label', () => {
    expect(drive(40, 25, true).text).toMatch(/PETSCII\s*80\s*colours\s*C128\s*\(VDC\)/);
  });

  it('Enter on PETSCII 80 colours reaches the board\'s toggle once, and Esc ends execute()', () => {
    const r = drive(80, 25, false, [
      { key: DOWN, wait: 100 }, { key: DOWN, wait: 100 }, { key: '\r', wait: 200 }, { key: '\x1b', wait: 400 },
    ]);
    expect(r.calls).toEqual(['togglePetsciiPalette']);
    expect(r.text).toMatch(/64\s*\(VIC-II\)/); // cell-diffed: the shared "C" is not resent
    expect(r.ended).toBe(true);
  });
});

describe('WEBTERM.info', () => {
  it('is marked for 40 columns and listed under W', () => {
    const tt = readTooltypeMap(path.join(REPO, 'board', 'Commands/BBSCmd/WEBTERM.info'));
    expect(tt.get('MIN_COLUMNS')).toBe('40');
    expect(tt.get('SETTINGS')).toBe('YES');
    expect(tt.get('SETTINGS_SECTION')).toBe('Web terminal');
    expect(tt.get('LOCATION')).toBe('Doors/web-terminal');
  });
});
