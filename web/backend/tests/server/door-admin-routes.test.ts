/**
 * doorAdminRouter — POST /api/door-admin/installed
 *
 * Mounted at /api/door-admin, not /api/doors (the brief's original prefix):
 * /api/doors is already door-api-routes.ts, which serves browsers with no
 * door token at all (client door bundles, manifests, assets). Putting this
 * router's token-gated middleware on that prefix would 401 every one of
 * those unauthenticated browser requests.
 *
 * This is the one route the DoorRepo C door can reach to report an install
 * it already performed on disk. It is a remote door-wipe surface if left
 * unauthenticated (RepoHost=bbs.uprough.net ships baked into other people's
 * doors), so every request must carry a valid launch token AND secLevel
 * >= 250, checked server-side on every request.
 */
import express from 'express';
import request from 'supertest';

const recorded: any[] = [];
jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn((input: any) => { recorded.push(input); }),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter } from '../../src/server/door-admin.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/door-admin', doorAdminRouter);
  return a;
}

beforeEach(() => { recorded.length = 0; claims = { nodeId: '1', userId: 7, secLevel: 255 }; });

it('records an install the door reports', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('OK');
  expect(recorded[0]).toMatchObject({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });
});

it('refuses without a token', async () => {
  claims = null;
  const res = await request(app())
    .post('/api/door-admin/installed')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(401);
  expect(recorded).toHaveLength(0);
});

it('refuses a user who is not a sysop, token or no token', async () => {
  claims = { nodeId: '1', userId: 9, secLevel: 100 };
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: 'AEHELP', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(403);
  expect(recorded).toHaveLength(0);
});

it('refuses a command that is not a command', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed')
    .set('X-Door-Token', 'valid')
    .send({ command: '../../etc', archiveName: 'AEHELP.LHA' });

  expect(res.status).toBe(400);
  expect(recorded).toHaveLength(0);
});
