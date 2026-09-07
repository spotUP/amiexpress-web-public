/**
 * The editor's PUT can add a screen's missing format, and refuses bytes that
 * disagree with the name it is asked to write.
 *
 * "there is no way to upload/complete a screen with .seq/.rip in the screen
 * editor admin ui?" The admin now offers the formats a screen lacks, and they
 * go through PUT /api/screens/file to a path that does not exist yet. The
 * upload route already refused RIP bytes under a non-.rip name (the extension
 * is what the loader routes on); the PUT did not, and the PUT is what the new
 * button uses.
 */
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
  }, express.json({ limit: '8mb' }), screensRouter);
  return a;
}
const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'put-format-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  for (const n of [1, 2]) {
    fs.mkdirSync(path.join(root, `Node${n}`), { recursive: true });
    fs.writeFileSync(path.join(root, `Node${n}`, 'BBSTITLE.txt'), 'the ansi title\r\n', 'latin1');
  }
  invalidateScreenIndex();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

test('a RIP file becomes the screen\'s .rip on every node it is asked for', async () => {
  const res = await request(app())
    .put('/api/screens/file?path=Node1/BBSTITLE.rip')
    .send({ content: b64('!|1K\r\n'), targets: ['Node1/BBSTITLE.rip', 'Node2/BBSTITLE.rip'], carryCodes: 'none' });

  expect(res.status).toBe(200);
  expect(fs.readFileSync(path.join(root, 'Node1', 'BBSTITLE.rip'), 'latin1')).toBe('!|1K\r\n');
  expect(fs.readFileSync(path.join(root, 'Node2', 'BBSTITLE.rip'), 'latin1')).toBe('!|1K\r\n');
  // The ANSI copy is untouched: a new format is a sibling, not a replacement.
  expect(fs.readFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), 'latin1')).toBe('the ansi title\r\n');
});

test('a PETSCII file becomes the screen\'s .seq', async () => {
  const res = await request(app())
    .put('/api/screens/file?path=Node1/BBSTITLE.seq')
    .send({ content: b64('\x93\x05hello\r'), targets: ['Node1/BBSTITLE.seq'], carryCodes: 'none' });

  expect(res.status).toBe(200);
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.seq'))).toBe(true);
});

test('RIP bytes under a name the loader will not route as RIP are refused', async () => {
  const res = await request(app())
    .put('/api/screens/file?path=Node1/BBSTITLE.seq')
    .send({ content: b64('!|1K\r\n'), targets: ['Node1/BBSTITLE.seq'], carryCodes: 'none' });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/RIP bytes/);
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.seq'))).toBe(false);
});

test('a .rip that does not hold RIP is refused', async () => {
  const res = await request(app())
    .put('/api/screens/file?path=Node1/BBSTITLE.rip')
    .send({ content: b64('just ansi\r\n'), targets: ['Node1/BBSTITLE.rip'], carryCodes: 'none' });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/not RIP/);
});
