/**
 * The screen index has to be fast enough to click through.
 *
 * "Why does it take so long to read the screen files when i click them in the
 * gallery?" Measured on this board: buildScreenIndex took 12.7 SECONDS for
 * 1,145 files, and a delete builds it twice.
 *
 * The cost was not reading the files. express.e's level walk tries security
 * levels 255 down to 5 in fives, each against four extensions, and every one
 * of those lookups did a full readdir of the directory - roughly a quarter of
 * a million readdir calls for one index. Listings are now remembered until a
 * directory's mtime moves, and a file's facts until the file's own mtime
 * moves.
 *
 * This test pins the SHAPE of that fix rather than a millisecond count, which
 * would be a flake on shared hardware: the second build of an unchanged board
 * must not re-read the files.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'index-perf-'));
  for (let node = 1; node <= 8; node += 1) {
    write(`Node${node}/BBSTITLE.txt`, 'the title\n');
    write(`Node${node}/LOGON.TXT`, 'welcome\n');
  }
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('does not read a file again when nothing about it changed', () => {
  const target = path.join(root, 'Node1', 'BBSTITLE.txt');
  const before = buildScreenIndex(root);
  expect(before.files['Node1/BBSTITLE.txt'].bytes).toBe('the title\n'.length);

  // Change the CONTENT while putting the timestamps back exactly as they were.
  // Nothing about the file's stat has moved, so a cache must answer with what
  // it already knows - and a build that re-reads would see the new bytes.
  // Same LENGTH as well as the same timestamps - the key is size and mtime,
  // so a different size is a change the cache is right to notice.
  // utimesSync rounds sub-millisecond precision away, so the timestamp is set
  // FIRST and the index built from that, and only then is the content swapped
  // underneath it - same size, same mtime, different bytes.
  const sha = before.files['Node1/BBSTITLE.txt'].sha256;
  const when = new Date(Date.now() - 60_000);
  fs.utimesSync(target, when, when);
  buildScreenIndex(root);

  fs.writeFileSync(target, 'the TITLE\n', 'latin1');
  fs.utimesSync(target, when, when);

  const after = buildScreenIndex(root);

  expect(after.files['Node1/BBSTITLE.txt'].sha256).toBe(sha);
});

it('reads a file again the moment it changes', () => {
  buildScreenIndex(root);
  write('Node1/BBSTITLE.txt', 'a NEW title\n');

  const index = buildScreenIndex(root);

  expect(index.files['Node1/BBSTITLE.txt'].bytes).toBe('a NEW title\n'.length);
});

it('leaves a config file s text sidecar out of the screens', () => {
  write('bbsConfig.info.txt', 'NEW_USER_SEC_LEVEL=30\n');

  const index = buildScreenIndex(root);

  expect(Object.keys(index.files)).not.toContain('bbsConfig.info.txt');
  expect(index.unused.map(f => f.relPath)).not.toContain('bbsConfig.info.txt');
});
