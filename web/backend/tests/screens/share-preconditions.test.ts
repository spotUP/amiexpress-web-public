/**
 * Whether a node can be pointed at a shared screen directory.
 *
 * The SCREENS tooltype redirects the node's WHOLE screen set, not one file
 * (ACP.e:2666-2673). Sharing because BBSTITLE happens to match would silently
 * repoint LOGON, LOGOFF, JOIN and everything else that node reads - which is
 * why every file has to match, by bytes, before the action is offered.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkShare } from '../../src/screens/share-preconditions';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'share-'));
  write('Node1/BBSTITLE.txt', 'title\n');
  write('Node1/LOGON.TXT', 'logon\n');
  write('Screens/Shared/BBSTITLE.txt', 'title\n');
  write('Screens/Shared/LOGON.TXT', 'logon\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('identical sets pass', () => {
  expect(checkShare(root, 1, 'Screens/Shared').ok).toBe(true);
});

test('a byte difference blocks it, even one trailing newline', () => {
  fs.appendFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), '\n');

  const check = checkShare(root, 1, 'Screens/Shared');

  expect(check.ok).toBe(false);
  expect(check.reasons.join(' ')).toMatch(/BBSTITLE\.txt differs/);
});

test('a file the node has and the shared set lacks is reported as losing', () => {
  write('Node1/JOIN.TXT', 'join\n');

  const check = checkShare(root, 1, 'Screens/Shared');

  expect(check.ok).toBe(false);
  expect(check.losing).toContain('JOIN.TXT');
});

test('a file only the shared set has is reported as gaining', () => {
  write('Screens/Shared/JOINED.TXT', 'joined\n');

  const check = checkShare(root, 1, 'Screens/Shared');

  expect(check.ok).toBe(false);
  expect(check.gaining).toContain('JOINED.TXT');
});

test('a node-specific MCI reference blocks it', () => {
  write('Node1/LOGON.TXT', '~SS_BBS:Node1/extra.txt');
  write('Screens/Shared/LOGON.TXT', '~SS_BBS:Node1/extra.txt');

  const check = checkShare(root, 1, 'Screens/Shared');

  expect(check.ok).toBe(false);
  expect(check.reasons.join(' ')).toMatch(/names a node or conference/i);
});

test('filenames are matched case-insensitively, an Amiga volume', () => {
  fs.renameSync(path.join(root, 'Node1', 'LOGON.TXT'), path.join(root, 'Node1', 'logon.txt'));

  const check = checkShare(root, 1, 'Screens/Shared');

  expect(check.losing).toEqual([]);
  expect(check.gaining).toEqual([]);
  expect(check.ok).toBe(true);
});

test('a node with no directory of its own can always share', () => {
  const check = checkShare(root, 42, 'Screens/Shared');

  expect(check.ok).toBe(true);
  expect(check.gaining.sort()).toEqual(['BBSTITLE.txt', 'LOGON.TXT']);
});
