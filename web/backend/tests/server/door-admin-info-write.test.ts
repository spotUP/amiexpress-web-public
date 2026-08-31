/**
 * PUT /api/door-admin/installed/:cmd/info — replace a command's tooltypes.
 *
 * Real files, and one of them a real binary DiskObject: tests/fixtures/wall.info,
 * checked in. It has to be - reading the board's own Commands/BBSCmd copy is
 * untracked runtime state, which passed locally and died with ENOENT in CI. The assertion that matters is that the icon survives:
 * an .info is an icon with a tooltype array inside it, and a writer that
 * rebuilt the file from a template would silently throw the imagery away. That
 * is the mistake caf489708 fixed in the C door for the same reason.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

let root: string;

jest.mock('../../src/doors/door-install-record', () => ({
  recordDoorInstall: jest.fn(),
}));

let claims: any = { nodeId: '1', userId: 7, secLevel: 255 };
jest.mock('../../src/doors/door-launch-token', () => ({
  verifyLaunchToken: jest.fn(() => claims),
}));

import { doorAdminRouter, doorAdminBodyError } from '../../src/server/door-admin.routes';
import { parseInfoFile } from '../../src/utils/info-file.util';

const REAL_INFO = path.join(__dirname, '..', 'fixtures', 'wall.info');

function app() {
  const a = express();
  a.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
  return a;
}

function put(cmd: string, body: any) {
  return request(app())
    .put(`/api/door-admin/installed/${cmd}/info`)
    .set('X-Door-Token', 'valid')
    .send(body);
}

function infoPath(cmd: string): string {
  return path.join(root, 'Commands', 'BBSCmd', `${cmd}.info`);
}

function writeText(cmd: string, lines: string[]): void {
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.writeFileSync(infoPath(cmd), lines.join('\n') + '\n');
}

function copyBinary(cmd: string): void {
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.copyFileSync(REAL_INFO, infoPath(cmd));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dooradmin-infow-'));
  process.env.BBS_DATA_DIR = root;
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BBS_DATA_DIR;
});

it('replaces the tooltypes and reports how many it wrote', async () => {
  writeText('AEHELP', ['NAME=Old', 'ACCESS=0']);

  const res = await put('AEHELP', {
    tooltypes: [
      { key: 'NAME', value: 'New Name' },
      { key: 'ACCESS', value: '255' },
      { key: 'DRACCESS', value: '0' },
    ],
  });

  expect(res.status).toBe(200);
  expect(res.text).toBe('INFOWRITE|3\r\n');
  const after = parseInfoFile(infoPath('AEHELP')).tooltypes;
  expect(after.map((t) => `${t.key}=${t.value}`)).toEqual([
    'NAME=New Name', 'ACCESS=255', 'DRACCESS=0',
  ]);
});

it('replaces rather than merges, so a tooltype can be removed', async () => {
  writeText('AEHELP', ['NAME=Old', 'ACCESS=0', 'STACK=65536']);

  await put('AEHELP', { tooltypes: [{ key: 'NAME', value: 'Only' }] });

  const after = parseInfoFile(infoPath('AEHELP')).tooltypes;
  expect(after).toHaveLength(1);
  expect(after[0].key).toBe('NAME');
});

it('keeps a binary DiskObject an icon - the imagery is not thrown away', async () => {
  copyBinary('WALL');
  const before = fs.readFileSync(infoPath('WALL'));

  const res = await put('WALL', { tooltypes: [{ key: 'NAME', value: 'The Wall' }] });

  expect(res.status).toBe(200);
  const after = fs.readFileSync(infoPath('WALL'));
  // Still a DiskObject: the e3 10 magic survives.
  expect(after[0]).toBe(0xe3);
  expect(after[1]).toBe(0x10);
  // The header the icon is drawn from is byte-identical.
  expect(after.subarray(0, 78)).toEqual(before.subarray(0, 78));
  expect(parseInfoFile(infoPath('WALL')).tooltypes.map((t) => t.key)).toEqual(['NAME']);
});

it('writes a commented tooltype back as commented', async () => {
  writeText('AEHELP', ['NAME=X']);

  await put('AEHELP', {
    tooltypes: [
      { key: 'NAME', value: 'X' },
      { key: 'INTERNAL', value: '1', commented: true },
    ],
  });

  const after = parseInfoFile(infoPath('AEHELP')).tooltypes;
  expect(after.find((t) => t.key === 'INTERNAL')?.commented).toBe(true);
});

it('accepts an empty array, leaving a file with no tooltypes', async () => {
  writeText('AEHELP', ['NAME=X']);

  const res = await put('AEHELP', { tooltypes: [] });

  expect(res.status).toBe(200);
  expect(res.text).toBe('INFOWRITE|0\r\n');
  expect(parseInfoFile(infoPath('AEHELP')).tooltypes).toHaveLength(0);
});

it('rejects a key containing = and does not touch the file', async () => {
  writeText('AEHELP', ['NAME=Original']);
  const before = fs.readFileSync(infoPath('AEHELP'));

  const res = await put('AEHELP', { tooltypes: [{ key: 'NA=ME', value: 'x' }] });

  expect(res.status).toBe(400);
  expect(fs.readFileSync(infoPath('AEHELP'))).toEqual(before);
});

it('rejects a value containing a line break and does not touch the file', async () => {
  writeText('AEHELP', ['NAME=Original']);
  const before = fs.readFileSync(infoPath('AEHELP'));

  const res = await put('AEHELP', { tooltypes: [{ key: 'NAME', value: 'a\nACCESS=0' }] });

  expect(res.status).toBe(400);
  expect(fs.readFileSync(infoPath('AEHELP'))).toEqual(before);
});

it('rejects an empty key', async () => {
  writeText('AEHELP', ['NAME=Original']);

  const res = await put('AEHELP', { tooltypes: [{ key: '   ', value: 'x' }] });

  expect(res.status).toBe(400);
});

it('rejects a body that is not a tooltype array', async () => {
  writeText('AEHELP', ['NAME=Original']);

  expect((await put('AEHELP', {})).status).toBe(400);
  expect((await put('AEHELP', { tooltypes: 'NAME=x' })).status).toBe(400);
});

it('rejects more tooltypes than an .info plausibly holds', async () => {
  writeText('AEHELP', ['NAME=Original']);
  const many = Array.from({ length: 65 }, (_, i) => ({ key: `K${i}`, value: 'v' }));

  const res = await put('AEHELP', { tooltypes: many });

  expect(res.status).toBe(400);
});

it('404s a command with no .info on disk', async () => {
  const res = await put('NOSUCH', { tooltypes: [{ key: 'NAME', value: 'x' }] });

  expect(res.status).toBe(404);
});

it('refuses without a token, and writes nothing', async () => {
  writeText('AEHELP', ['NAME=Original']);
  const before = fs.readFileSync(infoPath('AEHELP'));
  claims = null;

  const res = await request(app())
    .put('/api/door-admin/installed/AEHELP/info')
    .send({ tooltypes: [{ key: 'NAME', value: 'hacked' }] });

  expect(res.status).toBe(401);
  expect(fs.readFileSync(infoPath('AEHELP'))).toEqual(before);
});

it('refuses a user who is not a sysop, and writes nothing', async () => {
  writeText('AEHELP', ['NAME=Original']);
  const before = fs.readFileSync(infoPath('AEHELP'));
  claims = { nodeId: '1', userId: 9, secLevel: 100 };

  const res = await put('AEHELP', { tooltypes: [{ key: 'NAME', value: 'hacked' }] });

  expect(res.status).toBe(403);
  expect(fs.readFileSync(infoPath('AEHELP'))).toEqual(before);
});
