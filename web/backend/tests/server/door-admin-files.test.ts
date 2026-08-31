/**
 * GET /api/door-admin/installed/:cmd/files — a door's directory listing.
 *
 * Against a real temp BBS root with real files and a real symlink, per the
 * spec's testing rule: "The filesystem is not mocked - the two failures this
 * work exists to fix were both 'the disk disagreed with the record'"
 * (docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md:205).
 *
 * The assertion that matters most is the symlink one. `path.relative`
 * containment compares strings, and a link inside a door pointing out of it
 * satisfies that test while reading something else. The walk uses `lstat` and
 * never descends, so a link is reported as a link and its target's contents
 * never appear.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

let root: string;
let registered: any[] = [];

jest.mock('../../src/handlers/door.handler', () => ({
  getDoors: jest.fn(() => registered),
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

function files(cmd: string) {
  return request(app()).get(`/api/door-admin/installed/${cmd}/files`).set('X-Door-Token', 'valid');
}

/** Rows only, without the header or the trailing empty element. */
function rowsOf(text: string): string[] {
  return text.split('\r\n').slice(1).filter((l) => l !== '');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dooradmin-files-'));
  process.env.BBS_DATA_DIR = root;
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
  registered = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BBS_DATA_DIR;
});

function makeDoor(command: string, location = `Doors/${command}`): string {
  const dir = path.join(root, 'Doors', command);
  fs.mkdirSync(dir, { recursive: true });
  registered.push({ id: command, command, name: command, type: 'XIM', path: location });
  return dir;
}

it('lists a door\'s files, directories before their contents', async () => {
  const dir = makeDoor('AEHELP');
  fs.writeFileSync(path.join(dir, 'aehelp'), 'binary');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'readme.guide'), 'hello');

  const res = await files('AEHELP');

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  const rows = rowsOf(res.text);
  expect(res.text.split('\r\n')[0]).toBe(`DIR|${rows.length}`);
  expect(rows).toEqual([
    '6|0|aehelp',
    '0|1|docs',
    '5|0|docs/readme.guide',
  ]);
});

it('answers DIR|0 for a door whose directory is empty', async () => {
  makeDoor('EMPTY');

  const res = await files('EMPTY');

  expect(res.status).toBe(200);
  expect(res.text).toBe('DIR|0\r\n');
});

it('404s a command that is not registered', async () => {
  const res = await files('NOSUCH');

  expect(res.status).toBe(404);
  expect(res.text).toContain('NOT FOUND');
});

it('404s a registered command whose directory is not on disk', async () => {
  // The BROADCAST shape: a .info pointing at DOORS:ANNOUNCE/ANNOUNCE.REXX
  // where Doors/ANNOUNCE has never existed.
  registered.push({ id: 'BROADCAST', command: 'BROADCAST', type: 'AIM', path: 'Doors/ANNOUNCE/ANNOUNCE.REXX' });

  const res = await files('BROADCAST');

  expect(res.status).toBe(404);
});

it('400s a command name that could not name a Commands/BBSCmd/<CMD>.info', async () => {
  const res = await request(app())
    .get('/api/door-admin/installed/..%2F..%2Fetc/files')
    .set('X-Door-Token', 'valid');

  expect([400, 404]).toContain(res.status);
  expect(res.text).not.toContain('DIR|');
});

it('reports a symlink pointing outside the door without descending into it', async () => {
  const dir = makeDoor('LINKY');
  const secrets = path.join(root, 'Access');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'ACS.INFO'), 'SECRET-ACCESS-DATA');
  fs.symlinkSync(secrets, path.join(dir, 'escape'));

  const res = await files('LINKY');

  const rows = rowsOf(res.text);
  expect(rows.some((r) => r.endsWith('|escape'))).toBe(true);
  // The link is listed. Its target's contents are not.
  expect(res.text).not.toContain('ACS.INFO');
  expect(res.text).not.toContain('SECRET-ACCESS-DATA');
});

it('stops at the row cap and reports what it emitted, not what exists', async () => {
  const dir = makeDoor('MANY');
  for (let i = 0; i < 2100; i++) {
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}`), '');
  }

  const res = await files('MANY');

  const rows = rowsOf(res.text);
  expect(rows).toHaveLength(2000);
  expect(res.text.split('\r\n')[0]).toBe('DIR|2000');
});

it('refuses without a token', async () => {
  makeDoor('AEHELP');
  claims = null;

  const res = await request(app()).get('/api/door-admin/installed/AEHELP/files');

  expect(res.status).toBe(401);
});

it('refuses a user who is not a sysop', async () => {
  makeDoor('AEHELP');
  claims = { nodeId: '1', userId: 9, secLevel: 100 };

  const res = await files('AEHELP');

  expect(res.status).toBe(403);
  expect(res.text).toContain('FORBIDDEN');
});
