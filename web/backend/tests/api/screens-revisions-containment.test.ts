/**
 * Revision history: PUT /file must snapshot the resolved, contained path -
 * never a raw request string - and the three new revision routes must
 * refuse a backslash before it can collide with revDirFor's own
 * slash-and-backslash-to-underscore sanitisation.
 *
 * Regression coverage for a real arbitrary-file-read: a `targets` entry
 * naming a path outside the board root used to reach saveRevision's bare
 * `path.resolve(baseDir, relPath)` directly, with no containment check at
 * all, and get read into a snapshot inside the board's own revisions
 * directory.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let outsideSecret: string;
let app: express.Express;

const write = (rel: string, body: Buffer | string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body as never);
};

const revisionsDir = () => path.join(root, 'Screens', '.Revisions');

/** Every file under Screens/.Revisions, recursively, relative to that dir. */
function listAllRevisionFiles(): string[] {
  const base = revisionsDir();
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(base, full));
    }
  };
  walk(base);
  return out;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-revisions-'));
  write('Node1/BBSTITLE.txt', 'v1\r\n');

  // A file OUTSIDE the board root entirely - the thing a traversal target
  // must never be able to read into a revision snapshot.
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-revisions-outside-'));
  outsideSecret = path.join(outsideDir, 'secret.env');
  fs.writeFileSync(outsideSecret, 'JWT_SECRET=do-not-leak\n');

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('a normal PUT creates a revision of the file it overwrote', async () => {
  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({ content: Buffer.from('v2\r\n', 'latin1').toString('base64') });
  expect(res.status).toBe(200);

  const list = await request(app).get('/api/screens/revisions')
    .query({ path: 'Node1/BBSTITLE.txt' });
  expect(list.status).toBe(200);
  expect(list.body.data.revisions).toHaveLength(1);
  expect(list.body.data.revisions[0].bytes).toBe(4); // "v1\r\n"
});

test('a traversal target outside the board root is never snapshotted, and the outside file is never touched', async () => {
  // A relative traversal deep enough to walk out of a tmpdir-nested root
  // and reach the sibling directory holding the "secret" file above. Sent
  // ALONE (not mixed with a legitimate target) - writeToTargets refuses it
  // too (a different, pre-existing guard), so the whole PUT 400s; this test
  // is scoped to proving the SNAPSHOT step never touched the outside file
  // regardless of that later failure - the snapshot loop runs first.
  const traversal = path.relative(root, outsideSecret);

  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({
      content: Buffer.from('v2\r\n', 'latin1').toString('base64'),
      targets: [traversal],
    });
  expect(res.status).toBe(400);

  // No revision directory anywhere under Screens/.Revisions holds the
  // outside file's content.
  for (const file of listAllRevisionFiles()) {
    const bytes = fs.readFileSync(path.join(revisionsDir(), file));
    expect(bytes.toString('latin1')).not.toContain('do-not-leak');
  }

  // The outside file itself is untouched - reading it into a revision must
  // never have happened at all, not just "happened but wasn't kept".
  expect(fs.readFileSync(outsideSecret, 'utf8')).toBe('JWT_SECRET=do-not-leak\n');
});

test('GET /revisions rejects a backslash in path instead of passing it to containedScreenPath', async () => {
  const res = await request(app).get('/api/screens/revisions')
    .query({ path: '..\\..\\..\\..\\proc\\self\\environ' });
  expect(res.status).toBe(400);
});

test('GET /revision rejects a backslash in path or file', async () => {
  const byPath = await request(app).get('/api/screens/revision')
    .query({ path: '..\\..\\etc\\passwd', file: 'x.bin' });
  expect(byPath.status).toBe(400);

  const byFile = await request(app).get('/api/screens/revision')
    .query({ path: 'Node1/BBSTITLE.txt', file: '..\\..\\x.bin' });
  expect(byFile.status).toBe(400);
});

test('POST /restore rejects a backslash in path or file', async () => {
  const res = await request(app).post('/api/screens/restore')
    .send({ path: '..\\..\\..\\..\\proc\\self\\environ', file: 'x.bin' });
  expect(res.status).toBe(400);
});

test('a forward-slash traversal in path is rejected by the existing containment check', async () => {
  const res = await request(app).get('/api/screens/revisions')
    .query({ path: '../../../../etc/passwd' });
  expect(res.status).toBe(400);
});

test('restoring a revision reverts the file and itself creates a new revision', async () => {
  await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({ content: Buffer.from('version-two\r\n', 'latin1').toString('base64') });

  const list = await request(app).get('/api/screens/revisions')
    .query({ path: 'Node1/BBSTITLE.txt' });
  const rev = list.body.data.revisions[0]; // the "v1\r\n" snapshot (only one exists at this point)

  const revContent = await request(app).get('/api/screens/revision')
    .query({ path: 'Node1/BBSTITLE.txt', file: rev.file });
  expect(Buffer.from(revContent.body.data.content, 'base64').toString('latin1')).toBe('v1\r\n');

  const restore = await request(app).post('/api/screens/restore')
    .send({ path: 'Node1/BBSTITLE.txt', file: rev.file });
  expect(restore.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'), 'latin1')).toBe('v1\r\n');

  // The restore snapshotted "version-two\r\n" (what was live just before
  // the restore overwrote it) as a second revision - undoable in turn.
  const listAfter = await request(app).get('/api/screens/revisions')
    .query({ path: 'Node1/BBSTITLE.txt' });
  expect(listAfter.body.data.revisions.length).toBeGreaterThanOrEqual(2);

  const contents: string[] = [];
  for (const r of listAfter.body.data.revisions as Array<{ file: string }>) {
    const one = await request(app).get('/api/screens/revision').query({ path: 'Node1/BBSTITLE.txt', file: r.file });
    contents.push(Buffer.from(one.body.data.content, 'base64').toString('latin1'));
  }
  expect(contents).toEqual(expect.arrayContaining(['v1\r\n', 'version-two\r\n']));
});

test('a differently-cased request still finds the same revision the canonical case wrote', async () => {
  await request(app).put('/api/screens/file')
    .query({ path: 'node1/bbstitle.txt' }) // wrong case; resolves case-insensitively
    .send({ content: Buffer.from('v2\r\n', 'latin1').toString('base64') });

  const list = await request(app).get('/api/screens/revisions')
    .query({ path: 'Node1/BBSTITLE.txt' }); // canonical case
  expect(list.body.data.revisions).toHaveLength(1);
});

// The HTTP-level case test passes on ANY host, including one with a
// case-sensitive filesystem, because revDirFor() itself now normalises the
// key - but it would ALSO pass on a case-insensitive host (macOS) even
// without that fix, because the host filesystem folds two differently-cased
// directory names into the same inode regardless of what string this code
// produces. That made the HTTP test blind to the real bug on the exact
// platform most of this project's development happens on. This test
// bypasses the filesystem entirely and asserts the STRING revDirFor()
// produces is identical for two differently-cased paths - the actual
// invariant PUT (canonical/resolved casing) and GET/POST /restore (raw
// request casing) both depend on to ever look at the same revisions
// directory in production (case-sensitive Linux containers).
test('revDirFor keys two differently-cased paths to the identical directory string', () => {
  const { revDirFor } = require('../../src/screens/screen-revisions');
  expect(revDirFor('node1/bbstitle.txt')).toBe(revDirFor('Node1/BBSTITLE.txt'));
});

test('GET /revisions reports a valid, recent timestamp, not a raw filename fallback', async () => {
  await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({ content: Buffer.from('v2\r\n', 'latin1').toString('base64') });

  const list = await request(app).get('/api/screens/revisions')
    .query({ path: 'Node1/BBSTITLE.txt' });
  const ts = list.body.data.revisions[0].ts;
  const parsed = new Date(ts);
  expect(Number.isNaN(parsed.getTime())).toBe(false);
  expect(Date.now() - parsed.getTime()).toBeLessThan(60_000);
});
