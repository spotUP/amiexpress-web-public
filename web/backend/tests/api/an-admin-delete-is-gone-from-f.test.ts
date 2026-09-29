/**
 * Reachability for the admin file manager (plan 2026-09-29, P4): a file the
 * sysop deletes on the admin site is gone from what a caller sees with F -
 * the admin route and the BBS read and write the same DIR listing.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

import { config } from '../../src/config';
import { setStorageContext } from '../../src/storage/storage-context';
import { createFileListRouter } from '../../src/api/file-list-routes';
import { FileListingHandler } from '../../src/handlers/file/file-listing.handler';
import { flushOutput } from '../../src/utils/output.util';

// Counts calls into the one service while running the real thing: the
// sentinel that the route used it and not a copy of its own.
let deleteEntryCalls = 0;
jest.mock('../../src/services/file-list.service', () => {
  const actual = jest.requireActual('../../src/services/file-list.service');
  return { ...actual, deleteEntry: (...args: unknown[]) => { deleteEntryCalls += 1; return actual.deleteEntry(...args); } };
});

const line = (name: string, date: string) => `${name.padEnd(12)} N  123456  ${date}  a file`;

let root: string;
let spy: jest.SpyInstance;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-to-f-'));
  fs.mkdirSync(path.join(root, 'Conf1', 'Files'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), [line('KEEPME.LHA', '01-01-24'), line('DROPME.LHA', '02-02-24')].join('\r\n'));
  fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'DROPME.LHA'), 'bytes');
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  setStorageContext(null);
});
afterEach(() => {
  spy.mockRestore();
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

async function whatFShows(): Promise<string> {
  const out: string[] = [];
  const socket: any = { id: `f-${Math.random()}`, emit: (e: string, d: unknown) => { if (e === 'ansi-output') out.push(String(d)); return true; }, on: () => socket };
  const session: any = { currentConf: 1, relConfNum: 1, nodeId: 1, tempData: {}, user: { id: 1, username: 'caller', secLevel: 20, securityFlags: 'T'.repeat(100) } };
  await FileListingHandler.handleFileList(socket, session, '1 NS');
  flushOutput(socket);
  return out.join('');
}

test('a file deleted on the admin site is gone from F', async () => {
  expect(await whatFShows()).toContain('DROPME.LHA');

  const app = express();
  app.use(express.json());
  app.use('/api/files', createFileListRouter());
  await request(app).delete('/api/files/conferences/1/dirs/1/entries/DROPME.LHA').expect(200);
  expect(deleteEntryCalls).toBe(1); // the route ran the one service, not a copy

  const after = await whatFShows();
  expect(after).not.toContain('DROPME.LHA');
  expect(after).toContain('KEEPME.LHA');
});
