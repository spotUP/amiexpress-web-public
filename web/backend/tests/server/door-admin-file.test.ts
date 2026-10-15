/**
 * GET /api/door-admin/installed/:cmd/file?p= — one file, and everything it
 * must refuse.
 *
 * This is the route that turns a bad containment check into an
 * arbitrary-file-read of the BBS host, on a URL other people's boards can
 * reach: RepoHost ships baked to bbs.uprough.net in the DoorRepo doors handed
 * out to sysops. Real files on a real temp root, and every refusal test also
 * asserts the target's contents are absent from the body - a 403 that still
 * leaked the bytes would pass a status-only assertion.
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

const SECRET = 'SECRET-ACCESS-DATA';

function app() {
  const a = express();
  a.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);
  return a;
}

function file(cmd: string, p?: string) {
  const url = p === undefined
    ? `/api/door-admin/installed/${cmd}/file`
    : `/api/door-admin/installed/${cmd}/file?p=${encodeURIComponent(p)}`;
  return request(app()).get(url).set('X-Door-Token', 'valid');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dooradmin-file-'));
  process.env.BBS_DATA_DIR = root;
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
  registered = [];
  // Something worth stealing, one level above every door directory.
  fs.mkdirSync(path.join(root, 'Access'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Access', 'ACS.INFO'), SECRET);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BBS_DATA_DIR;
});

function makeDoor(command: string): string {
  const dir = path.join(root, 'Doors', command);
  fs.mkdirSync(dir, { recursive: true });
  registered.push({ id: command, command, name: command, type: 'XIM', path: `Doors/${command}` });
  return dir;
}

it('serves a text file with a FILE header carrying its length', async () => {
  const dir = makeDoor('AEHELP');
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello door\n');

  const res = await file('AEHELP', 'readme.txt');

  expect(res.status).toBe(200);
  expect(res.text).toBe('FILE|11|0\r\nhello door\n');
});

it('serves a file from a subdirectory', async () => {
  const dir = makeDoor('AEHELP');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'guide.txt'), 'nodes');

  const res = await file('AEHELP', 'docs/guide.txt');

  expect(res.status).toBe(200);
  expect(res.text).toContain('nodes');
});

it('400s when p is missing', async () => {
  makeDoor('AEHELP');

  const res = await file('AEHELP');

  expect(res.status).toBe(400);
  expect(res.text).toContain('BAD REQUEST');
});

it('refuses a traversal out of the door directory, and leaks nothing', async () => {
  makeDoor('AEHELP');

  const res = await file('AEHELP', '../../Access/ACS.INFO');

  expect(res.status).toBe(403);
  expect(res.text).toContain('FORBIDDEN');
  expect(res.text).not.toContain(SECRET);
});

it('refuses an absolute path, and leaks nothing', async () => {
  makeDoor('AEHELP');

  const res = await file('AEHELP', path.join(root, 'Access', 'ACS.INFO'));

  expect(res.status).toBe(403);
  expect(res.text).not.toContain(SECRET);
});

it('refuses a symlink inside the door that points out of it, and leaks nothing', async () => {
  // The case string containment alone does not catch: path.relative is happy,
  // because the path really is inside the door. Only realpath sees the escape.
  const dir = makeDoor('LINKY');
  fs.symlinkSync(path.join(root, 'Access', 'ACS.INFO'), path.join(dir, 'innocent.txt'));

  const res = await file('LINKY', 'innocent.txt');

  expect(res.status).toBe(403);
  expect(res.text).not.toContain(SECRET);
});

it('refuses a symlink reached through a subdirectory link', async () => {
  const dir = makeDoor('LINKY2');
  fs.symlinkSync(path.join(root, 'Access'), path.join(dir, 'sub'));

  const res = await file('LINKY2', 'sub/ACS.INFO');

  expect(res.status).toBe(403);
  expect(res.text).not.toContain(SECRET);
});

it('refuses the door directory itself', async () => {
  makeDoor('AEHELP');

  const res = await file('AEHELP', '.');

  expect(res.status).toBe(403);
});

it('400s a directory inside the door', async () => {
  const dir = makeDoor('AEHELP');
  fs.mkdirSync(path.join(dir, 'docs'));

  const res = await file('AEHELP', 'docs');

  expect(res.status).toBe(400);
});

it('404s a path that does not exist', async () => {
  makeDoor('AEHELP');

  const res = await file('AEHELP', 'nope.txt');

  expect(res.status).toBe(404);
  expect(res.text).toContain('NOT FOUND');
});

it('415s a binary, rather than pushing an LHA archive down a BBS socket', async () => {
  const dir = makeDoor('AEHELP');
  fs.writeFileSync(path.join(dir, 'door.lha'), Buffer.from([0x1a, 0x00, 0x4c, 0x48, 0x00, 0xff]));

  const res = await file('AEHELP', 'door.lha');

  expect(res.status).toBe(415);
  expect(res.text).toContain('BINARY');
});

it('truncates a file past the cap and says so in the header', async () => {
  const dir = makeDoor('AEHELP');
  fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(40000));

  const res = await file('AEHELP', 'big.txt');

  expect(res.status).toBe(200);
  const [header, ...rest] = res.text.split('\r\n');
  expect(header).toBe('FILE|32768|1');
  expect(rest.join('\r\n')).toHaveLength(32768);
});

it('404s a command that is not registered', async () => {
  const res = await file('NOSUCH', 'readme.txt');

  expect(res.status).toBe(404);
});

it('refuses without a token', async () => {
  makeDoor('AEHELP');
  claims = null;

  const res = await request(app()).get('/api/door-admin/installed/AEHELP/file?p=readme.txt');

  expect(res.status).toBe(401);
});

it('refuses a user who is not a sysop', async () => {
  const dir = makeDoor('AEHELP');
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello');
  claims = { nodeId: '1', userId: 9, secLevel: 100 };

  const res = await file('AEHELP', 'readme.txt');

  expect(res.status).toBe(403);
  expect(res.text).not.toContain('hello');
});
