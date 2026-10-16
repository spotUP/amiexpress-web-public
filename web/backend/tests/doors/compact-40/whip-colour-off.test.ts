/**
 * WHIP for a caller with ANSI colour off (colour-aware SDK, P3.2).
 *
 * With colour off the board strips every SGR on the way out, so a state the
 * SDK shows by colour alone is gone. The SDK draws a character marker instead
 * when `Screen.colour` is false, and createScreen takes that from the board's
 * `isAnsiMode()`.
 *
 * REACHABILITY, once: the SHIPPED bundle (Doors/whip/dist, driven through
 * `door.execute()` as executeTypeScriptDoor calls it) asks the board, and its
 * loading screen's progress bar fills with `#` only for the colour-off
 * caller. Each widget's marker is tested where it lives, in
 * sdk/tests/unit/colour-off-*.test.ts.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

jest.setTimeout(120000);

const DRIVER = path.join(__dirname, 'fixtures/drive-whip.cjs');

function drive(colour: boolean): { text: string; ansiAsks: number } {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-colour-'));
  try {
    const out = execFileSync(process.execPath, [DRIVER, JSON.stringify({ cols: 80, rows: 25, colour, settle: 1500 })], {
      cwd: path.dirname(DRIVER), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, BBS_DATA_DIR: data },
    });
    const { captured, errors, ansiAsks } = JSON.parse(out) as { captured: string[]; errors: string[]; ansiAsks: number };
    expect(errors).toEqual([]);
    return { text: captured.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''), ansiAsks };
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
}

describe('WHIP: the shipped bundle marks colour-only state for a colour-off caller', () => {
  it('asks the board and fills the loading bar with # only when colour is off', () => {
    const off = drive(false);
    const on = drive(true);
    expect(off.ansiAsks).toBeGreaterThanOrEqual(1);
    expect(on.ansiAsks).toBeGreaterThanOrEqual(1);
    expect(off.text).toMatch(/#{8,}/);
    expect(on.text).not.toMatch(/##/);
    expect(on.text).toContain('Loading');
  });
});
