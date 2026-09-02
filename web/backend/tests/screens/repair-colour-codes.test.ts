/**
 * Putting the escape byte back.
 *
 * 47 files on the live board hold `[0;1;31m` with the ESC gone - a caller sees
 * the codes printed instead of the colour. The damage is mechanical and so is
 * the repair: a CSI sequence is ESC + `[` + parameters + a final letter, and
 * these files have the whole sequence except the ESC.
 *
 * Deliberately narrow. It refuses a file that has ANY escape byte in it,
 * because then the bare `[` might be art rather than damage, and it writes a
 * backup first - the same one a delete writes.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-'));

jest.mock('../../src/config', () => ({
  config: { get: (key: string) => (key === 'dataDir' ? root : undefined) },
}));

import { screensRouter } from '../../src/api/screens-routes';

function app() {
  const a = express();
  a.use('/api/screens', express.json(), screensRouter);
  return a;
}

beforeEach(() => {
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  // What Screens/Logon24hrs.txt actually looks like today.
  fs.writeFileSync(
    path.join(root, 'Screens', 'BROKEN.TXT'),
    '~f\r\n\r\n [0;1;31m_______ [0;36m____\r\n',
    'latin1',
  );
  fs.writeFileSync(
    path.join(root, 'Screens', 'HEALTHY.TXT'),
    '\x1b[0;1;31mred\x1b[0m and a literal [bracket]\r\n',
    'latin1',
  );
});

afterEach(() => fs.rmSync(path.join(root, 'Screens'), { recursive: true, force: true }));

it('puts the escape byte back in front of every colour code', async () => {
  const res = await request(app())
    .post('/api/screens/repair')
    .send({ path: 'Screens/BROKEN.TXT' });

  expect(res.status).toBe(200);
  expect(res.body.data.repaired).toBe(2);

  const after = fs.readFileSync(path.join(root, 'Screens', 'BROKEN.TXT'), 'latin1');
  expect(after).toContain('\x1b[0;1;31m');
  expect(after).toContain('\x1b[0;36m');
  // The art itself is untouched.
  expect(after).toContain('_______');
});

it('writes a backup before it touches anything', async () => {
  await request(app()).post('/api/screens/repair').send({ path: 'Screens/BROKEN.TXT' });

  const backup = fs.readFileSync(path.join(root, 'Screens', 'BROKEN.TXT.backup'), 'latin1');
  expect(backup).toContain(' [0;1;31m');
  expect(backup).not.toContain('\x1b[');
});

it('refuses a file that already has escape bytes - the brackets may be art', async () => {
  const before = fs.readFileSync(path.join(root, 'Screens', 'HEALTHY.TXT'), 'latin1');

  const res = await request(app())
    .post('/api/screens/repair')
    .send({ path: 'Screens/HEALTHY.TXT' });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/escape/i);
  expect(fs.readFileSync(path.join(root, 'Screens', 'HEALTHY.TXT'), 'latin1')).toBe(before);
});

it('refuses a path outside the board', async () => {
  const res = await request(app())
    .post('/api/screens/repair')
    .send({ path: '../../etc/passwd' });

  expect(res.status).toBe(400);
});
