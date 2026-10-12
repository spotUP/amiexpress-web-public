/**
 * F lists the DIR file of the asked directory exactly as express.e's
 * displayFileList does (express.e:24877-24881 internalCommandF, 27626-27721
 * displayFileList, 26857-26912 getDirSpan, 27722-27790 displayIt/displayIt2).
 *
 * Driven through processBBSCommand, the dispatcher express.e's
 * processInternalCommand (28289-28397) maps to.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { processBBSCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

let root = '';
let previous = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'f-cmd-'));
  previous = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Conf1', 'Uploads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=2\nDLPATH.1=BBS:Conf1/Uploads/\n');
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), 'ONE.LHA      P    12345 01-02-95 first file\n');
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR2'), 'TWO.LHA      P    22345 01-02-95 second file\n');
});
afterEach(() => {
  config.set('dataDir', previous);
  fs.rmSync(root, { recursive: true, force: true });
});

function caller(flags = 'T'.repeat(100)) {
  const wire: string[] = [];
  const socket: any = {
    id: `f-cmd-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output') wire.push(String(data)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 255, securityFlags: flags, confAccess: 'XX' },
  };
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

test('F 2 scans only directory 2 and lists its record (express.e:27659-27684, 27737)', async () => {
  const c = caller();
  await processBBSCommand(c.socket, c.session, 'F', '2');
  const out = c.out();
  expect(out.startsWith('\r\n')).toBe(true); // 27636
  expect(out).toContain('Scanning directory 2\r\n'); // 27677
  expect(out).toContain('TWO.LHA');
  expect(out).not.toContain('ONE.LHA');
  expect(out).not.toContain('Scanning directory 1');
});

test('F A scans every directory in order, with a blank line after each (express.e:27644-27646, 27712-27718)', async () => {
  const c = caller();
  await processBBSCommand(c.socket, c.session, 'F', 'A');
  const out = c.out();
  expect(out.indexOf('Scanning directory 1\r\n')).toBeGreaterThanOrEqual(0);
  expect(out.indexOf('Scanning directory 2\r\n')).toBeGreaterThan(out.indexOf('ONE.LHA'));
  expect(out.indexOf('TWO.LHA')).toBeGreaterThan(out.indexOf('Scanning directory 2'));
  expect(out).toMatch(/ONE\.LHA[^\n]*\r\n\r\n[^]*Scanning directory 2/); // 27717 aePuts('\b\n')
});

test('F 9 says No such directory (express.e:26904-26906)', async () => {
  const c = caller();
  await processBBSCommand(c.socket, c.session, 'F', '9');
  expect(c.out()).toContain('\r\nNo such directory.\r\n\r\n');
});

test('F without a listing permission is refused with the dispatcher sentence (express.e:24878, 28400)', async () => {
  const c = caller('F'.repeat(100));
  await processBBSCommand(c.socket, c.session, 'F', '1');
  const out = c.out();
  expect(out).toContain('Command requires higher access.');
  expect(out).not.toContain('Scanning directory');
});

test('F H without hold access is No such directory, Val(H)=0 (express.e:26896-26906)', async () => {
  const c = caller();
  c.session.user.secLevel = 1;
  c.session.user.securityFlags = 'T'.repeat(79) + 'F' + 'T'.repeat(20); // ACS_HOLD_ACCESS off
  await processBBSCommand(c.socket, c.session, 'F', 'H');
  const out = c.out();
  expect(out).not.toContain('Scanning directory HOLD');
  expect(out).toContain('\r\nNo such directory.\r\n\r\n');
});

test('F with no argument prompts for directories, Enter backs out (express.e:26864-26874)', async () => {
  const c = caller();
  await processBBSCommand(c.socket, c.session, 'F', '');
  expect(c.out()).toContain('Directories: ');
  expect(c.session.subState).toBe(LoggedOnSubState.FILE_LIST_DIR_INPUT);
});
