/**
 * Not a suite of the board's own - `.testcase.ts` is outside `testMatch` on
 * purpose. `temp-board-lifecycle.test.ts` runs a whole second jest against
 * this one file to see what a real run leaves on the disk, and reads the
 * report it writes here.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

it('records where this run put its board', () => {
  const bbsRoot = process.env.BBS_ROOT as string;
  const report = process.env.PROBE_REPORT as string;
  expect(bbsRoot).toBeTruthy();
  expect(report).toBeTruthy();

  fs.writeFileSync(
    report,
    JSON.stringify({
      bbsRoot,
      runDir: process.env.AMIEXPRESS_TEST_RUN_DIR,
      tmpdir: os.tmpdir(),
      // The board is only useful if it still carries the board's screens and
      // icons; a run that stopped seeding would read nothing and pass here.
      seededScreens: fs.existsSync(path.join(bbsRoot, 'Screens')),
      seededDoorsLink: fs.existsSync(path.join(bbsRoot, 'Doors')),
      // Something a suite would drop in `os.tmpdir()`, so the parent can see
      // whether that lands inside the run directory too.
      scratch: fs.mkdtempSync(path.join(os.tmpdir(), 'probe-scratch-')),
    }),
  );
  expect(fs.existsSync(bbsRoot)).toBe(true);
});
