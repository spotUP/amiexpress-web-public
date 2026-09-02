/**
 * A dry run that finds blockers is an ANSWER, not a failure.
 *
 * The sysop's console, clicking "Check this directory":
 *
 *   POST https://bbs.uprough.net/api/screens/share 409 (Conflict)
 *
 * Nothing was wrong. The check asks the board which nodes could share a
 * directory, and the board replied "these five cannot, here is why" - with a
 * 409, so the browser logged it as a failed request and the page had to catch
 * an error to read its own answer.
 *
 * A dry run answers 200 with the same facts. A real share that is refused
 * keeps its 409, because that one IS a refusal: nothing was written.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'share-dry-'));

jest.mock('../../src/config', () => ({
  config: { get: (key: string) => (key === 'dataDir' ? root : undefined) },
}));

import { screensRouter } from '../../src/api/screens-routes';

function app() {
  const a = express();
  a.use('/api/screens', express.json(), screensRouter);
  return a;
}

beforeAll(() => {
  // Node 1 has a screen the shared directory does not, so it would lose it.
  fs.mkdirSync(path.join(root, 'Screens', 'Shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'Shared', 'BBSTITLE.txt'), 'shared title\n');
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), 'shared title\n');
  fs.writeFileSync(path.join(root, 'Node1', 'LOGON.TXT'), 'only node 1 has this\n');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('answers a dry run with 200 and says who is blocked', async () => {
  const res = await request(app())
    .post('/api/screens/share')
    .send({ nodes: [1], sharedDir: 'Screens/Shared', dryRun: true });

  expect(res.status).toBe(200);
  expect(res.body.data.blocked).toHaveLength(1);
  expect(JSON.stringify(res.body.data.blocked)).toMatch(/LOGON/i);
  expect(res.body.data.canShare).toEqual([]);
});

it('still refuses a real share with 409, because that one writes', async () => {
  const res = await request(app())
    .post('/api/screens/share')
    .send({ nodes: [1], sharedDir: 'Screens/Shared' });

  expect(res.status).toBe(409);
  // And nothing was written.
  expect(fs.existsSync(path.join(root, 'Node1.info'))).toBe(false);
});
