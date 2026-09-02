/**
 * The health check has to look at the BOARD, not at /app.
 *
 * The sysop, reading its report: "can i really trust the auto fix here? are
 * they real issues?" No, and no. Every path in it was `/app/ConfConfig.info`,
 * `/app/Screens`, `/app/Node0` - but this board's data lives at
 * `/app/data/bbs`, which is what BBS_DATA_DIR says and what every other route
 * reads. `/app` is a bare skeleton, so the check reported the whole board
 * missing, and each "auto-fix" would have created an empty directory in the
 * wrong place - or worse, a ConfConfig.info that the real board would then
 * shadow.
 *
 * The offer to FIX is what makes this dangerous rather than merely wrong.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-root-'));

jest.mock('../../src/config', () => ({
  config: {
    get: (key: string) => (key === 'dataDir' ? root : undefined),
    getConfig: () => ({ dataDir: root }),
  },
}));

import { createConfigRouter } from '../../src/api/config-routes';

const stubDatabase = {
  getConfigRepository: () => ({}),
  getUserRepository: () => ({}),
  getDoorRepository: () => ({}),
  getConferenceRepository: () => ({}),
  getMessageRepository: () => ({}),
  getFileRepository: () => ({}),
} as any;

function app() {
  const a = express();
  a.use('/api/config', express.json(), createConfigRouter(stubDatabase));
  return a;
}

beforeAll(() => {
  // A board that is entirely fine.
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=1\nNAME.1=Amiga Demoscene\nLOCATION.1=BBS:Conf1/\n');
  fs.writeFileSync(path.join(root, 'bbsConfig.info'), 'NEW_USER_SEC_LEVEL=30\n');
  fs.writeFileSync(path.join(root, 'Access.info'), 'x\n');
  for (const dir of ['Screens', 'Commands', 'Commands/BBSCmd', 'Commands/SysCmd', 'Conf1', 'Node0', 'Node1', 'Doors', 'Protocols', 'SysopStats', 'Utils']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('checks the configured board, and says which one it checked', async () => {
  const res = await request(app()).get('/api/config/health');

  expect(res.status).toBe(200);
  // The report names its own root now, so a finding can never again be about
  // a directory the sysop was not looking at.
  expect(res.body.data.bbsRoot).toBe(root);
});

it('finds nothing wrong with a board that is complete', async () => {
  const res = await request(app()).get('/api/config/health');
  const report = JSON.stringify(res.body);

  expect(report).not.toMatch(/ConfConfig\.info missing/);
  expect(report).not.toMatch(/Screens\/ directory missing/);
  expect(report).not.toMatch(/Commands\/ directory missing/);
});
