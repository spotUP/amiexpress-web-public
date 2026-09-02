/**
 * The orphan-directory routes have to be REACHABLE.
 *
 * `/conferences/:conferenceId` is declared in the same router, and Express
 * matches in declaration order: a GET for `/conferences/orphan-directories`
 * declared after it is swallowed as conference id "orphan-directories". This
 * drives the real router, so the ordering is proved rather than asserted about
 * the source.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-route-'));

jest.mock('../../src/config', () => ({
  config: { get: (key: string) => (key === 'dataDir' ? root : undefined) },
}));

import { createConfigRouter } from '../../src/api/config-routes';

/**
 * The router builds a ConfigService, which asks the database for its
 * repositories. These routes touch none of them - they read the volume - so
 * the stub answers with empty objects rather than a real database.
 */
const stubDatabase = {
  getConfigRepository: () => ({}),
  getUserRepository: () => ({}),
  getDoorRepository: () => ({}),
  getConferenceRepository: () => ({}),
  getMessageRepository: () => ({}),
  getFileRepository: () => ({}),
  prepare: () => ({ all: () => [], get: () => undefined, run: () => undefined }),
  db: { prepare: () => ({ all: () => [], get: () => undefined, run: () => undefined }) },
} as any;

function app() {
  const a = express();
  a.use('/api/config', express.json(), createConfigRouter(stubDatabase));
  return a;
}

beforeAll(() => {
  for (const n of [2, 9, 12]) fs.mkdirSync(path.join(root, `Conf${n}`), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf9', 'bull20.txt'), 'left behind\n');
  fs.writeFileSync(
    path.join(root, 'ConfConfig.info'),
    'NCONFS=2\nNAME.1=Amiga Demoscene\nLOCATION.1=BBS:Conf2/\nNAME.2=Up Rough Internal\nLOCATION.2=BBS:Conf12/\n',
  );
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('answers with the directories nothing points at', async () => {
  const res = await request(app()).get('/api/config/conferences/orphan-directories');

  expect(res.status).toBe(200);
  expect(res.body.data.orphans.map((o: { dir: string }) => o.dir)).toEqual(['Conf9']);
  expect(res.body.data.bytes).toBeGreaterThan(0);
});

it('refuses to remove a directory a conference still reads', async () => {
  const res = await request(app()).delete('/api/config/conferences/orphan-directories/Conf12');

  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(fs.existsSync(path.join(root, 'Conf12'))).toBe(true);
});

it('removes an orphan and stops listing it', async () => {
  const res = await request(app()).delete('/api/config/conferences/orphan-directories/Conf9');

  expect(res.status).toBe(200);
  expect(fs.existsSync(path.join(root, 'Conf9'))).toBe(false);

  const after = await request(app()).get('/api/config/conferences/orphan-directories');
  expect(after.body.data.orphans).toEqual([]);
});
