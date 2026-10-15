/**
 * A file pulled in by ~SS_ is read by every screen that pulls it in - each
 * of them, with the callers each one serves.
 *
 * Crediting the include to the FIRST reader of the including file gave this
 * board's logon art two readers that both said "20-99" when one of them was
 * the level-100 screen, and credited a shared node screen's include to one
 * node out of sixty.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;
const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'include-credit-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Node1'));
  fs.mkdirSync(path.join(root, 'Node2'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('two security variants including the same art each credit it with their own callers', () => {
  write('Node1/logon20.txt', '~SS_BBS:Screens/art.txt|\r\n');
  write('Node1/Logon100.txt', '~SS_BBS:Screens/art.txt|\r\n');
  write('Screens/art.txt', '\x1b[31mthe art\r\n');

  const index = buildScreenIndex(root);
  const readers = index.files[path.join('Screens', 'art.txt')].readBy ?? [];

  expect(readers.map(r => r.serves).sort()).toEqual(['100 and above', '20-99']);
  expect(readers.every(r => r.via === 'include')).toBe(true);
});

test('one shared logon screen read by many nodes credits its include to every node', () => {
  // The live shape: 215 nodes point SCREENS at one directory, so the one
  // logon.txt there has 215 readers - and its include was credited to the first.
  fs.writeFileSync(path.join(root, 'Node1.info'), 'SCREENS=BBS:Screens/Shared/\n');
  fs.writeFileSync(path.join(root, 'Node2.info'), 'SCREENS=BBS:Screens/Shared/\n');
  write('Screens/Shared/Logon.txt', '~SS_BBS:Screens/art.txt|\r\n');
  write('Screens/art.txt', '\x1b[31mthe art\r\n');

  const index = buildScreenIndex(root);
  const readers = index.files[path.join('Screens', 'art.txt')].readBy ?? [];

  expect(readers.map(r => `${r.scope}${r.id}`).sort()).toEqual(['node1', 'node2']);
});
