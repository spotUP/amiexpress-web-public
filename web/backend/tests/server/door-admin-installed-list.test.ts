/**
 * GET /api/door-admin/installed — the list the DoorRepo C door reads.
 *
 * Phase B of docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md.
 *
 * Two things are being pinned here. First, that the route is gated exactly as
 * POST /installed already is: a valid launch token AND secLevel >= 250,
 * checked server-side per request, because RepoHost=bbs.uprough.net ships
 * baked into doors on other people's boards and this host is reachable from
 * them. Second, the field hygiene: the client splits each line on '|', so a
 * door NAME containing a pipe would not corrupt one field, it would shift
 * every field after it into the wrong column. Some NAME tooltypes on this
 * board are ASCII art.
 */
import express from 'express';
import request from 'supertest';

let doors: any[] = [];
jest.mock('../../src/doors/door-list', () => ({
  buildDoorList: jest.fn(async () => doors),
}));

jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn(),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter, doorAdminBodyError } from '../../src/server/door-admin.routes';
import { buildDoorList } from '../../src/doors/door-list';

function app() {
  const a = express();
  a.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
  return a;
}

function get() {
  return request(app()).get('/api/door-admin/installed').set('X-Door-Token', 'valid');
}

beforeEach(() => {
  doors = [];
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
  (buildDoorList as jest.Mock).mockClear();
});

it('answers a DOORS header and one row per registered command', async () => {
  doors = [
    {
      command: 'AEHELP', type: 'XIM', size: 4096, enabled: true, accessLevel: 10,
      archiveName: 'AEHELP.LHA', name: 'AE Help', category: 'Utility',
      description: 'Online help',
    },
    {
      command: 'WALL', type: 'XIM', size: 100, enabled: false, accessLevel: 0,
      name: 'The Wall', description: '',
    },
  ];

  const res = await get();

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  const lines = res.text.split('\r\n');
  expect(lines[0]).toBe('DOORS|2');
  expect(lines[1]).toBe('AEHELP|XIM|4096|1|10|AEHELP.LHA|AE Help|Utility|Online help');
  expect(lines[2]).toBe('WALL|XIM|100|0|0||The Wall||');
});

it('leaves archive empty for a door with no install record', async () => {
  // The 370 doors already on the board have none. They must still be listed.
  doors = [{ command: 'LEGACY', type: 'AMI', size: 0, enabled: true, accessLevel: 0, name: 'LEGACY' }];

  const res = await get();

  expect(res.text.split('\r\n')[1].split('|')[5]).toBe('');
});

it('answers DOORS|0 for a board with no registered commands', async () => {
  const res = await get();

  expect(res.status).toBe(200);
  expect(res.text).toBe('DOORS|0\r\n');
});

it('keeps a row at nine fields when a name contains a pipe, CR or LF', async () => {
  doors = [{
    command: 'ART', type: 'XIM', size: 1, enabled: true, accessLevel: 0,
    name: 'DOOR|MANAGER\r\nsecond line', category: 'a|b', description: 'x\ny',
  }];

  const res = await get();

  const row = res.text.split('\r\n')[1];
  expect(row.split('|')).toHaveLength(9);
  expect(row).toContain('DOOR MANAGER');
  expect(res.text.split('\r\n')).toHaveLength(3); // header, row, trailing empty
});

it('truncates a description past its cap rather than sending an unbounded line', async () => {
  doors = [{
    command: 'LONG', type: 'XIM', size: 0, enabled: true, accessLevel: 0,
    name: 'Long', description: 'x'.repeat(500),
  }];

  const res = await get();

  expect(res.text.split('\r\n')[1].split('|')[8]).toHaveLength(160);
});

it('refuses without a token', async () => {
  claims = null;
  const res = await request(app()).get('/api/door-admin/installed');

  expect(res.status).toBe(401);
  expect(res.text).toContain('UNAUTHORIZED');
  expect(buildDoorList).not.toHaveBeenCalled();
});

it('refuses a user who is not a sysop', async () => {
  claims = { nodeId: '1', userId: 9, secLevel: 100 };
  const res = await get();

  expect(res.status).toBe(403);
  expect(res.text).toContain('FORBIDDEN');
  expect(buildDoorList).not.toHaveBeenCalled();
});

it('answers text, never JSON, when the list cannot be built', async () => {
  (buildDoorList as jest.Mock).mockRejectedValueOnce(new Error('db gone'));

  const res = await get();

  expect(res.status).toBe(500);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  expect(res.text).toContain('ERROR');
});
