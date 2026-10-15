/**
 * "i try to upload a petscii requests logo but i get this error:
 *  GET /api/screens/file?path=Conf4%2Fbull20.seq 400 (Bad Request)"
 *
 * `Conf4/bull20.seq` is a perfectly legitimate path on this board - the
 * conference has `bull20.txt` and no PETSCII version yet, which is exactly
 * what adding one means. But `resolveScreenPath` answers null both for a path
 * that climbs OUT of the board and for one that simply is not there (it
 * resolves through the case-insensitive Amiga layer, which answers null for a
 * missing file), and the route turned both into 400 "Path outside the board
 * root". A missing format read as a security refusal, and the sysop reported
 * it as an upload failure.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { screensRouter } from '../../src/api/screens-routes';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;
let previousDataDir: string;

function app() {
  const a = express();
  a.use('/api/screens', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = { username: 'sysop', secLevel: 255 };
    next();
  }, express.json(), screensRouter);
  return a;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-screen-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.mkdirSync(path.join(root, 'Conf4'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf4', 'bull20.txt'), 'the text version\r\n', 'latin1');
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

test('a format the screen has not got yet is NOT FOUND, not refused', async () => {
  const res = await request(app()).get('/api/screens/file').query({ path: 'Conf4/bull20.seq' });

  // Red before: 400 "Path outside the board root", about a path inside it.
  expect(res.status).toBe(404);
  expect(String(res.body.error)).toMatch(/no screen file at/i);
  expect(String(res.body.error)).toContain('Conf4/bull20.seq');
});

test('the version that does exist still comes back', async () => {
  const res = await request(app()).get('/api/screens/file').query({ path: 'Conf4/bull20.txt' });

  expect(res.status).toBe(200);
  expect(Buffer.from(res.body.data.content, 'base64').toString('latin1')).toContain('the text version');
});

test('a path that climbs out of the board is still refused, and says so', async () => {
  const res = await request(app()).get('/api/screens/file').query({ path: '../../etc/passwd' });

  expect(res.status).toBe(400);
  expect(String(res.body.error)).toMatch(/outside the board root/i);
});
