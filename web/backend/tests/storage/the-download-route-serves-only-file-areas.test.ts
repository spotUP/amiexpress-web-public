/**
 * The unauthenticated download routes serve a conference's file areas -
 * never the sysop's review directories or a node's upload staging.
 *
 * `/api/download/:conf/:dir/:name` and `/api/download/:fileId` take no login.
 * After the file areas they also looked in `Conf<n>/HOLD` (uploads waiting
 * for the sysop: bad format, duplicates), `Conf<n>/PRIVATE` (uploads
 * addressed to the sysop alone, a `/` description, express.e:19361) and
 * `Node0/Playpen` (an upload still being received), so anyone who guessed a
 * name could fetch a file the board had not released. A file the board
 * hands a caller from outside the file areas goes through a one-time ticket
 * (handlers/file/download-ticket.ts).
 */
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  getFileEntry: jest.fn(async () => null as any),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
  verifyAccessToken: jest.fn(async () => ({ userId: '1', username: 'sysop', secLevel: 255 })),
};
(globalThis as any).__routeOnlyAreasDb = mockDb;
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__routeOnlyAreasDb[prop] ?? jest.fn(async () => undefined) }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { config } from '../../src/config';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { setStorageContext } from '../../src/storage/storage-context';
import { issueAreaDownloadTicket } from '../../src/handlers/file/download-ticket';

let dataDir = '';
let spy: jest.SpyInstance;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-areas-'));
  for (const dir of ['Conf1/Files', 'Conf1/HOLD', 'Conf1/PRIVATE', 'Node0/Playpen']) {
    fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
  }
  applyTooltypes(path.join(dataDir, 'Conf1.info'), [['NDIRS', '1'], ['DLPATH.1', 'BBS:Conf1/Files/']]);
  fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'PUBLIC.LHA'), 'public');
  fs.writeFileSync(path.join(dataDir, 'Conf1', 'HOLD', 'HELD.LHA'), 'held');
  fs.writeFileSync(path.join(dataDir, 'Conf1', 'PRIVATE', 'FORSYSOP.LHA'), 'private');
  fs.writeFileSync(path.join(dataDir, 'Node0', 'Playpen', 'INCOMING.LHA'), 'partial');
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
  registerHttpRoutes(server, { emit: () => undefined });
  return server;
}

test('a file in a file area downloads', async () => {
  const res = await request(app()).get(issueAreaDownloadTicket(1, 1, 'PUBLIC.LHA'));
  expect(res.status).toBe(200);
});

test.each(['HELD.LHA', 'FORSYSOP.LHA', 'INCOMING.LHA'])('%s, outside the file areas, is not served by name', async (name) => {
  const res = await request(app()).get(issueAreaDownloadTicket(1, 1, name));
  expect(res.status).toBe(404);
});

test('a catalogue id for a held file is not served either', async () => {
  mockDb.getFileEntry.mockResolvedValueOnce({
    id: 7, filename: 'HELD.LHA', conferenceId: 1, areaId: 1, size: 4, status: 'held',
    filePath: path.join(dataDir, 'Conf1', 'HOLD', 'HELD.LHA'),
  });
  const res = await request(app()).get('/api/download/7').set('Authorization', 'Bearer sysop');
  expect(res.status).toBe(404);
});
