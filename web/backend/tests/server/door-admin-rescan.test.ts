/**
 * POST /api/door-admin/installed/:cmd/rescan
 *
 * Phase C. This is deliberately NOT the spec's POST /:cmd/enabled. The C door
 * already implements enable/disable on disk - ACCESS=255 with DRACCESS
 * remembering the prior level, the ruling at examples/doorrepo-c/flow.h:618
 * marked "do not redesign" - and it has to, because a real AmiExpress board
 * has no API to call. What it cannot do is make this board's in-memory door
 * registry notice the file changed. That is all this route does.
 */
import express from 'express';
import request from 'supertest';

let registered: any[] = [];
const refreshDoorCache = jest.fn(async () => {});
const initializeDoors = jest.fn(async () => {});

jest.mock('../../src/doors/amigaDoorManager', () => ({
  refreshDoorCache: () => refreshDoorCache(),
}));

jest.mock('../../src/handlers/door.handler', () => ({
  getDoors: jest.fn(() => registered),
  initializeDoors: () => initializeDoors(),
}));

jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn(),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter, doorAdminBodyError } from '../../src/server/door-admin.routes';

function app() {
  const a = express();
  a.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
  return a;
}

function rescan(cmd: string) {
  return request(app()).post(`/api/door-admin/installed/${cmd}/rescan`).set('X-Door-Token', 'valid');
}

beforeEach(() => {
  registered = [];
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
  refreshDoorCache.mockClear();
  initializeDoors.mockClear();
});

it('reloads both caches and reports the command as present', async () => {
  registered = [{ id: 'AEHELP', command: 'AEHELP' }];

  const res = await rescan('AEHELP');

  expect(res.status).toBe(200);
  expect(res.text).toBe('RESCAN|1\r\n');
  expect(refreshDoorCache).toHaveBeenCalledTimes(1);
  expect(initializeDoors).toHaveBeenCalledTimes(1);
});

it('reports 0 when the command is gone after the reload', async () => {
  // The door deleted or renamed a registration and wants to know it took.
  registered = [{ id: 'OTHER', command: 'OTHER' }];

  const res = await rescan('AEHELP');

  expect(res.text).toBe('RESCAN|0\r\n');
});

it('matches the command case-insensitively', async () => {
  registered = [{ id: 'AEHELP', command: 'AEHELP' }];

  const res = await rescan('aehelp');

  expect(res.text).toBe('RESCAN|1\r\n');
});

it('400s a name that could not be a BBS command', async () => {
  const res = await request(app())
    .post('/api/door-admin/installed/way_too_long_name/rescan')
    .set('X-Door-Token', 'valid');

  expect([400, 404]).toContain(res.status);
  expect(refreshDoorCache).not.toHaveBeenCalled();
});

it('answers text, never JSON, when a reload throws', async () => {
  refreshDoorCache.mockRejectedValueOnce(new Error('scan failed') as never);

  const res = await rescan('AEHELP');

  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  expect(res.text).toContain('ERROR');
});

it('refuses without a token, and reloads nothing', async () => {
  claims = null;

  const res = await request(app()).post('/api/door-admin/installed/AEHELP/rescan');

  expect(res.status).toBe(401);
  expect(refreshDoorCache).not.toHaveBeenCalled();
});

it('refuses a user who is not a sysop, and reloads nothing', async () => {
  claims = { nodeId: '1', userId: 9, secLevel: 100 };

  const res = await rescan('AEHELP');

  expect(res.status).toBe(403);
  expect(refreshDoorCache).not.toHaveBeenCalled();
});
