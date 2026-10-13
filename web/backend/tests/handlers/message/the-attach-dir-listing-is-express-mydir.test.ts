/**
 * Msg. Options F's "5 <dir>" lists a directory as express.e's
 * myDirRecurse/myDirDisplay do (8320-8387): "Directory of <path>", then per
 * entry ' \l\s[25] \s \s \s 00:00:00' - name, size or "     Dir", the
 * hsparwed protection letters, formatLongDateTime - with no colours. A path
 * that does not exist returns silently. The port printed a red "<path> does
 * not exist", coloured columns and an MM/DD/YY date.
 *
 * myDirAnyWhere (express.e 8390-8429) frames the listing in aePuts('\b\n') before
 * and after. Kept on purpose: express passes the whole "5 <dir>" line, so
 * parseParams item(0) is "5" and the real board lists a directory named 5; the
 * port lists <dir>. checkForPause paging and the comment column (no file comments
 * on the host fs) are not ported.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayDirectoryListing } from '../../../src/handlers/message/message-entry.handler';
import { flushOutput } from '../../../src/utils/output.util';

function caller() {
  const said: string[] = [];
  const socket: any = { id: `dir-${Math.random()}`, emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; } };
  return { socket, said: () => { flushOutput(socket); return said.join(''); } };
}

test('a directory lists as myDirDisplay rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydir-'));
  fs.writeFileSync(path.join(dir, 'DEMO.LHA'), Buffer.alloc(1234));
  fs.chmodSync(path.join(dir, 'DEMO.LHA'), 0o644);
  fs.mkdirSync(path.join(dir, 'Sub'));
  const c = caller();

  await displayDirectoryListing(c.socket, {} as any, dir);
  const out = c.said();

  expect(out.startsWith(`\r\nDirectory of ${dir}\r\n`)).toBe(true);
  expect(out).toMatch(/\r\n DEMO\.LHA {17}     1234 ----rw-d \w{3} \d\d-\w{3}-\d{4} \d\d:\d\d:\d\d 00:00:00\r\n/);
  expect(out).toMatch(/ Sub {22}      Dir ----rwed /);
  expect(out.endsWith('\r\n')).toBe(true);
  expect(out).not.toContain('\x1b[');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a path that does not exist says nothing', async () => {
  const c = caller();
  await displayDirectoryListing(c.socket, {} as any, '/no/such/place');
  expect(c.said()).toBe('\r\n\r\n');
});
