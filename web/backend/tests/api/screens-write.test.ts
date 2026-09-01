/**
 * The write half: replace, upload, delete - and the fan-out, which is the
 * dangerous one. A replace that touches forty nodes must either touch all of
 * them or none, because half a fan-out leaves a board in two states nobody
 * asked for.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

const write = (rel: string, body: Buffer | string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body as never);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-write-'));
  write('Node1/BBSTITLE.txt', Buffer.from([0xa1, 0x0d, 0x0a]));
  write('Node2/BBSTITLE.txt', Buffer.from([0xa1, 0x0d, 0x0a]));
  write('Node1/LOGON20.TXT', 'sysop\n');
  fs.mkdirSync(path.join(root, 'Node3'), { recursive: true });

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterEach(() => {
  try { fs.chmodSync(path.join(root, 'Node3'), 0o700); } catch { /* already writable */ }
  fs.rmSync(root, { recursive: true, force: true });
});

test('PUT replaces the bytes and leaves a backup', async () => {
  const bytes = Buffer.from([0xa1, 0x41, 0x0a]);

  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({ content: bytes.toString('base64') });

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(bytes);
  expect(fs.existsSync(path.join(root, 'Node1/BBSTITLE.txt.backup'))).toBe(true);
});

test('a fan-out writes every target and backs each one up', async () => {
  const bytes = Buffer.from('shared\n', 'latin1');

  await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({
      content: bytes.toString('base64'),
      targets: ['Node1/BBSTITLE.txt', 'Node2/BBSTITLE.txt'],
    });

  expect(fs.readFileSync(path.join(root, 'Node2/BBSTITLE.txt'))).toEqual(bytes);
  expect(fs.existsSync(path.join(root, 'Node2/BBSTITLE.txt.backup'))).toBe(true);
});

test('a rename that changes the security suffix is refused', async () => {
  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/LOGON20.TXT', rename: 'LOGON.TXT' })
    .send({ content: Buffer.from('x').toString('base64') });

  expect(res.status).toBe(400);
  expect(String(res.body.error)).toMatch(/routing|security/i);
});

test('a rename that changes the type extension is refused', async () => {
  const res = await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt', rename: 'BBSTITLE.rip' })
    .send({ content: Buffer.from('x').toString('base64') });

  expect(res.status).toBe(400);
});

test('DELETE backs up and says what stops resolving', async () => {
  const res = await request(app).delete('/api/screens/file').query({ path: 'Node2/BBSTITLE.txt' });

  expect(res.status).toBe(200);
  expect(res.body.data.stopsResolving).toContain('BBSTITLE node=2');
  expect(fs.existsSync(path.join(root, 'Node2/BBSTITLE.txt'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'Node2/BBSTITLE.txt.backup'))).toBe(true);
});

test('a failed write in a fan-out restores every file already written', async () => {
  fs.chmodSync(path.join(root, 'Node3'), 0o500);

  await request(app).put('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt' })
    .send({
      content: Buffer.from('new\n').toString('base64'),
      targets: ['Node1/BBSTITLE.txt', 'Node3/BBSTITLE.txt'],
    });

  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(Buffer.from([0xa1, 0x0d, 0x0a]));
});

test('an upload lands the bytes and backs up what it replaced', async () => {
  const bytes = Buffer.from([0xb0, 0xb1, 0x0a]);

  const res = await request(app).post('/api/screens/upload')
    .field('path', 'Node1/BBSTITLE.txt')
    .attach('file', bytes, 'newtitle.txt');

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1/BBSTITLE.txt'))).toEqual(bytes);
  expect(fs.existsSync(path.join(root, 'Node1/BBSTITLE.txt.backup'))).toBe(true);
});

test('RIP bytes uploaded under a .txt name are refused - the extension is the routing', async () => {
  const res = await request(app).post('/api/screens/upload')
    .field('path', 'Node1/BBSTITLE.txt')
    .attach('file', Buffer.from('!|1B00000000\n', 'latin1'), 'art.rip');

  expect(res.status).toBe(400);
  expect(String(res.body.error)).toMatch(/RIP/);
});
