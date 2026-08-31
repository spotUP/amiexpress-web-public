/**
 * DELETE /api/door-admin/installed/:cmd — remove a door, streaming the log.
 *
 * The steps must arrive as they happen. A door with a few hundred files takes
 * long enough that a silent pause followed by a finished log is what a sysop
 * reads as a hang, which is why DOORMAN's in-process delete already reports
 * step by step and why this route reuses that same onStep contract.
 *
 * Because the first STEP flushes the headers, the status code is fixed before
 * anything is removed. Whether the delete succeeded lives in the DONE line, so
 * these tests assert on DONE, not on the status.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

let root: string;
const deleteDoorAndRefresh = jest.fn();

jest.mock('../../src/doors/door-delete', () => ({
  deleteDoorAndRefresh: (...a: any[]) => deleteDoorAndRefresh(...a),
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

function del(cmd: string) {
  return request(app()).delete(`/api/door-admin/installed/${cmd}`).set('X-Door-Token', 'valid');
}

function lines(text: string): string[] {
  return text.split('\r\n').filter((l) => l !== '');
}

function registerInfo(cmd: string): void {
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', `${cmd}.info`), 'NAME=X\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dooradmin-del-'));
  process.env.BBS_DATA_DIR = root;
  claims = { nodeId: '1', userId: 7, secLevel: 255 };
  deleteDoorAndRefresh.mockReset();
  deleteDoorAndRefresh.mockResolvedValue({ success: true, message: 'Deleted' });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BBS_DATA_DIR;
});

it('streams each step, then a DONE line', async () => {
  registerInfo('AEHELP');
  deleteDoorAndRefresh.mockImplementation(async (_cmd: string, _ts: any, onStep: any) => {
    onStep({ kind: 'ok', text: 'removed Doors/AEHELP/aehelp' });
    onStep({ kind: 'skip', text: 'Doors/AEHELP/missing was not there' });
    onStep({ kind: 'fail', text: 'Doors/AEHELP/locked: EBUSY' });
    return { success: true, message: 'Deleted AEHELP' };
  });

  const res = await del('AEHELP');

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  expect(lines(res.text)).toEqual([
    'STEP|ok|removed Doors/AEHELP/aehelp',
    'STEP|skip|Doors/AEHELP/missing was not there',
    'STEP|fail|Doors/AEHELP/locked: EBUSY',
    'DONE|1|Deleted AEHELP',
  ]);
});

it('passes the upper-cased command to the deleter', async () => {
  registerInfo('AEHELP');

  await del('aehelp');

  expect(deleteDoorAndRefresh.mock.calls[0][0]).toBe('AEHELP');
});

it('lets the manager decide whether it is a TypeScript door', async () => {
  // Passing `true` here would force the TypeScript path for an Amiga command.
  registerInfo('AEHELP');

  await del('AEHELP');

  expect(deleteDoorAndRefresh.mock.calls[0][1]).toBeUndefined();
});

it('reports a failed delete in DONE, with the status already sent as 200', async () => {
  registerInfo('AEHELP');
  deleteDoorAndRefresh.mockResolvedValue({ success: false, message: 'Refused to delete: invalid door name' });

  const res = await del('AEHELP');

  expect(res.status).toBe(200);
  expect(lines(res.text)).toEqual(['DONE|0|Refused to delete: invalid door name']);
});

it('closes the stream with DONE|0 when the deleter throws mid-way', async () => {
  registerInfo('AEHELP');
  deleteDoorAndRefresh.mockImplementation(async (_cmd: string, _ts: any, onStep: any) => {
    onStep({ kind: 'ok', text: 'removed one file' });
    throw new Error('disk went away');
  });

  const res = await del('AEHELP');

  expect(lines(res.text)).toEqual([
    'STEP|ok|removed one file',
    'DONE|0|disk went away',
  ]);
});

it('keeps a step line to three fields when a path contains a pipe', async () => {
  registerInfo('AEHELP');
  deleteDoorAndRefresh.mockImplementation(async (_c: string, _t: any, onStep: any) => {
    onStep({ kind: 'ok', text: 'removed Doors/AEHELP/we|ird\r\nDONE|1|forged' });
    return { success: true, message: 'Deleted' };
  });

  const res = await del('AEHELP');

  const streamed = lines(res.text);
  expect(streamed).toHaveLength(2);
  expect(streamed[0].split('|')).toHaveLength(3);
  expect(streamed[1]).toBe('DONE|1|Deleted');
});

it('404s a command with neither a .info nor a directory, deleting nothing', async () => {
  const res = await del('NOSUCH');

  expect(res.status).toBe(404);
  expect(res.text).toContain('NOT FOUND');
  expect(deleteDoorAndRefresh).not.toHaveBeenCalled();
});

it('deletes a door registered only by its directory', async () => {
  // A TypeScript door has no Commands/BBSCmd entry.
  fs.mkdirSync(path.join(root, 'Doors', 'arkanoid'), { recursive: true });

  const res = await del('arkanoid');

  expect(res.status).toBe(200);
  expect(deleteDoorAndRefresh).toHaveBeenCalled();
});

it('400s a name that could not be a BBS command, deleting nothing', async () => {
  const res = await request(app())
    .delete('/api/door-admin/installed/way_too_long_name')
    .set('X-Door-Token', 'valid');

  expect([400, 404]).toContain(res.status);
  expect(deleteDoorAndRefresh).not.toHaveBeenCalled();
});

it('refuses without a token, and deletes nothing', async () => {
  registerInfo('AEHELP');
  claims = null;

  const res = await request(app()).delete('/api/door-admin/installed/AEHELP');

  expect(res.status).toBe(401);
  expect(deleteDoorAndRefresh).not.toHaveBeenCalled();
});

it('refuses a user who is not a sysop, and deletes nothing', async () => {
  registerInfo('AEHELP');
  claims = { nodeId: '1', userId: 9, secLevel: 100 };

  const res = await del('AEHELP');

  expect(res.status).toBe(403);
  expect(deleteDoorAndRefresh).not.toHaveBeenCalled();
});
