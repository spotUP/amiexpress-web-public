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
import { buildScreenIndex, isCodesOnly } from '../../src/screens/screen-index.service';

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

/**
 * A build asks the disk for each directory ONCE.
 *
 * Three places answered "what files are in this directory" with their own
 * readdir - the index's own listDir, the theme validator's listNames, and
 * amigafs's listing cache - and the first two had no cache at all. One index
 * build on this board came to 3,946 readdir calls across 393 directories,
 * 922 of them of a single theme directory, and 1.5 seconds of a 3 second
 * build (measured, 2026-09-14). They share amigafs's listing now.
 *
 * Pinned the way the file-facts cache above is pinned, because counting
 * syscalls cannot be done from here: ts-jest hands each module its own copy
 * of `fs`, so a spy laid on the test's copy never sees the service's calls.
 * A directory whose mtime has not moved must answer from what was already
 * read - so a file smuggled into it stays invisible until it does.
 */
it('does not read a directory again when its mtime has not moved', () => {
  const dir = path.join(root, 'Node1');
  expect(Object.keys(buildScreenIndex(root).files)).toContain('Node1/BBSTITLE.txt');

  // Put the directory's timestamps back exactly as they were, so nothing
  // about its stat has changed even though its contents have.
  const when = new Date(Date.now() - 60_000);
  fs.utimesSync(dir, when, when);
  buildScreenIndex(root);

  write('Node1/SMUGGLED.TXT', 'nobody asked for this\n');
  fs.utimesSync(dir, when, when);

  const after = buildScreenIndex(root);

  expect(Object.keys(after.files)).not.toContain('Node1/SMUGGLED.TXT');
  expect(after.unused.map(f => f.relPath)).not.toContain('Node1/SMUGGLED.TXT');
});

it('sees the directory again the moment its mtime moves', () => {
  buildScreenIndex(root);

  write('Node1/ARRIVED.TXT', 'a new screen\n');

  const after = buildScreenIndex(root);

  const named = [...Object.keys(after.files), ...after.unused.map(f => f.relPath)];
  expect(named).toContain('Node1/ARRIVED.TXT');
});

/**
 * A screen that is mostly MCI codes is measured in LINEAR time.
 *
 * `isCodesOnly` removed the codes one at a time, back to front, and each
 * removal copied the whole remaining string. Doubling the codes multiplied
 * the time by about seven once the strings stopped fitting V8's ropes: 58 ms,
 * 369 ms, 2,578 ms for 20k, 40k and 80k codes (measured, 2026-09-14). It
 * keeps the text BETWEEN the codes in one pass now - 128 ms at 160k codes.
 *
 * The budget is deliberately twenty times the linear cost and a fraction of
 * the quadratic one, so it says "the shape is wrong", never "the machine was
 * busy".
 */
it('measures a screen of 160,000 codes in linear time', () => {
  const text = '~SN '.repeat(160_000);

  const started = Date.now();
  expect(isCodesOnly(text)).toBe(true);

  expect(Date.now() - started).toBeLessThan(3_000);
});

describe('taking the codes out leaves exactly what lay between them', () => {
  // The rewrite walks forwards where the old code spliced backwards, so the
  // cases where those could disagree are the ones worth holding: a code at
  // either end, two with nothing between them, and the escaped tilde.
  it.each([
    ['a code at the very start', '~SN and then art'],
    ['a code at the very end', 'art and then ~SN'],
    ['nothing between two codes', '~SN~SN'],
    ['an escaped tilde beside a code', '~~~SN'],
  ])('keeps the art visible: %s', (_what, body) => {
    expect(isCodesOnly(body)).toBe(body.replace(/~~|~SN/g, '').trim() === '');
  });

  it('is true for codes and whitespace alone, in any order', () => {
    expect(isCodesOnly('  ~SN\r\n~SN  \t ~~ ')).toBe(true);
  });
});
