/**
 * The HTTP routes that took no login (open-surface audit, 2026-10-04).
 *
 * Each case is a route a visitor with no account could reach and use to do
 * what only the sysop, or one caller's own door, should: store an upload,
 * write into the door archives, reload the door commands, spend the board's
 * AI quota, or read a file above the file areas. Each must now ask who is
 * calling - a sysop token, a logged-in token, or the one-time ticket the
 * board issued to that caller's session - and a file name must be one
 * plain name.
 */
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).__openRoutesDb = {
  query: jest.fn(async () => ({ rows: [] })),
  getFileEntry: jest.fn(async () => null),
  getUserById: jest.fn(async () => null),
};
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__openRoutesDb[prop] ?? jest.fn(async () => undefined) }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { config } from '../../src/config';
import { setStorageContext } from '../../src/storage/storage-context';
import { setSession, deleteSession } from '../../src/server/session-manager';

let dataDir = '';
let spy: jest.SpyInstance;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-routes-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'user.data'), 'every caller');
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  setStorageContext(null);
});

afterEach(() => {
  spy.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function app(): express.Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerHttpRoutes } = require('../../src/server/routes-setup');
  const server = express();
  server.use(express.json());
  registerHttpRoutes(server, { emit: () => undefined });
  return server;
}

const DOOR_ARCHIVE = Buffer.from('PK\x03\x04 an archive');

test('an upload with no ticket from the board is refused, and nothing is stored', async () => {
  const res = await request(app()).post('/api/upload').attach('file', DOOR_ARCHIVE, 'DOOR.ZIP');
  expect(res.status).toBe(403);
  expect(fs.existsSync(path.join(dataDir, 'Node0', 'Playpen', 'DOOR.ZIP'))).toBe(false);
});

test('an upload under a ticket cannot name a file above the playpen', async () => {
  const { issueUploadTicket } = require('../../src/handlers/file/download-ticket');
  const url: string = issueUploadTicket('caller-socket');
  const res = await request(app()).post(url).attach('file', DOOR_ARCHIVE, '../../evil.zip');
  expect(fs.existsSync(path.join(dataDir, 'evil.zip'))).toBe(false);
  expect(res.status).toBe(200);
  expect(fs.existsSync(path.join(dataDir, 'Node0', 'Playpen', 'evil.zip'))).toBe(true);
});

test('a ticket is good for one upload', async () => {
  const { issueUploadTicket } = require('../../src/handlers/file/download-ticket');
  const url: string = issueUploadTicket('caller-socket');
  expect((await request(app()).post(url).attach('file', DOOR_ARCHIVE, 'ONE.ZIP')).status).toBe(200);
  expect((await request(app()).post(url).attach('file', DOOR_ARCHIVE, 'TWO.ZIP')).status).toBe(403);
});

test.each([
  ['post', '/api/upload/door'],
  ['post', '/api/doors/reload'],
  ['post', '/api/wizard/enhance'],
  ['post', '/api/wizard/generate'],
])('%s %s without a login is refused', async (method, route) => {
  const res = await (request(app()) as any)[method](route).send({});
  expect(res.status).toBe(401);
});

test('a download name that decodes to a path above the file areas is not served', async () => {
  const res = await request(app()).get('/api/download/1/1/..%252f..%252fuser.data');
  expect(res.status).toBe(404);
  expect(res.text).not.toContain('every caller');
});

test("a door's upload completes with the file the board saved, never a path the browser names", async () => {
  const { processDoorUploadForTest } = require('../../src/server/file-socket-handlers');
  const saved = path.join(dataDir, 'Node0', 'Playpen', 'GOOD.ZIP');
  fs.mkdirSync(path.dirname(saved), { recursive: true });
  fs.writeFileSync(saved, 'the upload');
  const done = jest.fn();
  const session: any = { pendingDoorUpload: true, pendingDoorUploadCallback: done, doorUploadSavedPath: saved };
  setSession('door-socket', session);
  try {
    await processDoorUploadForTest(session, { filename: 'GOOD.ZIP', size: 10, path: path.join(dataDir, 'user.data') });
  } finally {
    deleteSession('door-socket');
  }
  const archived = path.join(dataDir, 'Doors', 'archives', 'GOOD.ZIP');
  expect(fs.readFileSync(archived, 'latin1')).toBe('the upload');
  expect(done).toHaveBeenCalledWith({ path: archived, filename: 'GOOD.ZIP' });
});
