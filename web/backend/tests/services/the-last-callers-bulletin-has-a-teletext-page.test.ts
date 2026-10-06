/**
 * The Last Callers bulletin has a teletext page.
 *
 * `bull6.txt` is a 76-column picture under an ANSI logo; a teletext caller
 * reads `bull6.ttx` in its place (screen.handler's twin rule), and nothing
 * wrote one (sysop, 2026-10-06: "fix teletext versions of them"). The logoff
 * batch's SAmiLog line now writes both, at the same moment, from the same
 * store - driven here through the batch file the board runs.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** Printed columns of a teletext row: SGR, DECDHL and the mosaic shifts are weightless. */
const columns = (row: string) =>
  row.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b#\d|[\x0e\x0f]/g, '').length;

function board(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samilog-ttx-'));
  fs.mkdirSync(path.join(dir, 'Utils', 'samilog'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Bulletins'), { recursive: true });
  // The board's real store, so the callers are real records.
  fs.copyFileSync(path.join(REPO, 'S', 'SAmiLog.Store'), path.join(dir, 'Utils', 'samilog', 'SAmiLog.Store'));
  return dir;
}

test('the logoff batch writes bull6.ttx beside bull6.txt, a forty-column page of the same callers', async () => {
  const dir = board();
  process.env.BBS_DATA_DIR = dir;
  process.env.BBS_ROOT = dir;
  jest.resetModules();
  const batchFile = path.join(dir, 'batch-test');
  fs.writeFileSync(batchFile, 'typescript:samilog -O"BBS:Bulletins/bull6.txt"15\n', 'latin1');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runBatchFile } = require('../../src/services/batch-scheduler');

  await runBatchFile(batchFile, 1);

  const ansi = fs.readFileSync(path.join(dir, 'Bulletins', 'bull6.txt'), 'latin1');
  const ttx = fs.readFileSync(path.join(dir, 'Bulletins', 'bull6.ttx'), 'latin1');
  const rows = ttx.replace(/\n$/, '').split('\n');

  expect(rows[0]).toBe('~f');
  expect(ttx).toContain('\x1b#3');
  expect(ttx).toContain('LAST CALLERS');
  // At most a teletext page, and no row wider than one.
  expect(rows.length - 1).toBeLessThanOrEqual(24);
  for (const row of rows) expect(columns(row)).toBeLessThanOrEqual(40);
  // The same callers as the ANSI bulletin, as far as the page holds them:
  // the first one listed there is listed here.
  const firstCaller = /\x1b\[32m(\S+)/.exec(ansi)?.[1];
  expect(firstCaller).toBeTruthy();
  expect(ttx).toContain(firstCaller!.slice(0, 12));
  // Every column the ANSI table has: the actions and the traffic too, and
  // the group as long as the ANSI table shows it (sysop, 2026-10-06, "fix it").
  const plain = ttx.replace(/\x1b\[[0-9;]*m/g, '');
  expect(plain).toMatch(/\d\d:\d\d +\d+:\d\d \([-HCPDdUuS]{6}\) +\d+ +\d+/);
  expect(plain).toContain('Group / Location');
});
