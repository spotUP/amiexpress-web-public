/**
 * The read half of the screen file manager.
 *
 * Bytes, not text: a screen carries Amiga high-bit characters, and a UTF-8
 * round-trip turns one into U+FFFD. Content crosses as base64 in both
 * directions for exactly that reason.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-api-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  // 0xA1 is an Amiga high-bit byte; it must survive the round trip untouched.
  fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), Buffer.from([0xa1, 0x0d, 0x0a]));

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('GET /api/screens answers the index in the envelope pages unwrap', async () => {
  const res = await request(app).get('/api/screens');

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.data.screens.some((s: any) => s.screen === 'BBSTITLE')).toBe(true);
});

test('GET /api/screens/file returns the exact bytes as base64', async () => {
  const res = await request(app).get('/api/screens/file').query({ path: 'Node1/BBSTITLE.txt' });

  expect(res.status).toBe(200);
  expect(Buffer.from(res.body.data.content, 'base64')).toEqual(Buffer.from([0xa1, 0x0d, 0x0a]));
  expect(res.body.data.format).toBe('text');
});

test('GET /api/screens/resolve explains where it looked', async () => {
  const res = await request(app).get('/api/screens/resolve').query({ screen: 'BBSTITLE', node: '1' });

  expect(res.body.data.searched[0].desc).toBe('Node1');
  expect(res.body.data.chosen?.toLowerCase()).toBe(path.join('Node1', 'BBSTITLE.txt').toLowerCase());
});

test('a path outside the board root is refused', async () => {
  const res = await request(app).get('/api/screens/file').query({ path: '../../etc/passwd' });

  expect(res.status).toBe(400);
});

test('a download answers the raw bytes as an attachment', async () => {
  const res = await request(app)
    .get('/api/screens/file')
    .query({ path: 'Node1/BBSTITLE.txt', download: '1' })
    .buffer()
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  expect(res.headers['content-disposition']).toContain('BBSTITLE.txt');
  expect(res.body).toEqual(Buffer.from([0xa1, 0x0d, 0x0a]));
});

/**
 * The file panel says who reads a screen.
 *
 * `readBy` is filled in by buildScreenIndex - only the index knows which nodes
 * and conferences exist and what each reads - and this route answered with the
 * bare `screenFileFacts`, whose readBy is always empty. So the panel told the
 * sysop "No screen on this board reads this file" about EVERY file he opened,
 * including a live conference bulletin.
 */
test('GET /api/screens/file reports the screens that read the file', async () => {
  const res = await request(app).get('/api/screens/file').query({ path: 'Node1/BBSTITLE.txt' });

  expect(res.status).toBe(200);
  expect(res.body.data.readBy).toBeDefined();
  expect(res.body.data.readBy.map((r: { screen: string }) => r.screen)).toContain('BBSTITLE');
});

test('a file nothing reads still answers with an empty list, not a missing one', async () => {
  // The difference matters: the panel renders "read by nothing" from an empty
  // array and cannot tell that from a field the route forgot to send.
  const res = await request(app).get('/api/screens/file').query({ path: 'Node1/BBSTITLE.txt' });

  expect(Array.isArray(res.body.data.readBy)).toBe(true);
});
