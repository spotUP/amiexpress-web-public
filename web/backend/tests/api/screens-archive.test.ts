/**
 * Export and import - the sysop's way in and out.
 *
 * A sysop running a release package has no git and no shell on the volume, so
 * an archive is how screens are backed up, carried to another host, or brought
 * in off a real Amiga.
 */
process.env.SKIP_DB_INIT = '1';

import AdmZip from 'adm-zip';
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

const asBuffer = (r: request.Test) =>
  r.buffer().parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-archive-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), Buffer.from([0xa1, 0x0d, 0x0a]));

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json());
  app.use('/api/screens', screensRouter);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('GET /export returns a zip holding the scope, bytes intact', async () => {
  const res = await asBuffer(request(app).get('/api/screens/export').query({ scope: 'Node1' }));

  const zip = new AdmZip(res.body);
  const entry = zip.getEntry('Node1/BBSTITLE.txt');
  expect(entry).toBeTruthy();
  expect(entry!.getData()).toEqual(Buffer.from([0xa1, 0x0d, 0x0a]));
});

test('POST /import with dryRun lists what would land and writes nothing', async () => {
  const zip = new AdmZip();
  zip.addFile('Node1/BBSTITLE.txt', Buffer.from([0xb2]));
  const before = fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'));

  const res = await request(app).post('/api/screens/import')
    .field('dryRun', 'true')
    .attach('archive', zip.toBuffer(), 'screens.zip');

  expect(res.status).toBe(200);
  expect(res.body.data.plan).toEqual([
    { path: path.join('Node1', 'BBSTITLE.txt'), action: 'replace', bytes: 1 },
  ]);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(before);
});

test('a real import writes the bytes and backs up what it replaced', async () => {
  const zip = new AdmZip();
  zip.addFile('Node1/BBSTITLE.txt', Buffer.from([0xb2]));

  const res = await request(app).post('/api/screens/import')
    .attach('archive', zip.toBuffer(), 'screens.zip');

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(Buffer.from([0xb2]));
  expect(fs.existsSync(path.join(root, 'Node1/BBSTITLE.txt.backup'))).toBe(true);
});

test('an entry escaping the board root is refused and nothing is written', async () => {
  const zip = new AdmZip();
  // AdmZip strips `../` when ADDING, so the traversal has to be set on the
  // entry - which is exactly what a hostile archive written by another tool
  // looks like, and the only version of this worth defending against.
  zip.addFile('escape.txt', Buffer.from('x'));
  zip.getEntries()[0].entryName = '../escape.txt';
  zip.addFile('Node1/BBSTITLE.txt', Buffer.from([0xb3]));
  const before = fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'));

  const res = await request(app).post('/api/screens/import')
    .attach('archive', zip.toBuffer(), 'escape.zip');

  expect(res.status).toBe(400);
  expect(fs.existsSync(path.join(path.dirname(root), 'escape.txt'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(before);
});

test('an entry that is not a screen file is refused', async () => {
  const zip = new AdmZip();
  zip.addFile('Node1/user.data', Buffer.from('not a screen'));

  const res = await request(app).post('/api/screens/import')
    .attach('archive', zip.toBuffer(), 'wrong.zip');

  expect(res.status).toBe(400);
  expect(String(res.body.error)).toMatch(/screen file/i);
});
