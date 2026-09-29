/**
 * The admin file manager's API (plan 2026-09-29-admin-file-manager, P2):
 * list, edit a description, move, delete, and the listing-vs-folder report -
 * all through services/file-list.service, the functions FM uses. Driven
 * over HTTP against a temporary board.
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
import { authenticateToken, requireSysop } from '../../src/middleware/auth.middleware';

const line = (name: string, date: string, desc = 'a file') => `${name.padEnd(12)} N  123456  ${date}  ${desc}`;

let root: string;
let spy: jest.SpyInstance;
let app: express.Express;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-routes-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=2\nNAME.1=Main\nLOCATION.1=BBS:Conf1/\nNAME.2=Games\nLOCATION.2=BBS:Conf2/\n');
  for (const c of ['Conf1', 'Conf2']) {
    fs.mkdirSync(path.join(root, c, 'Files'), { recursive: true });
    fs.writeFileSync(path.join(root, `${c}.info`), 'NDIRS=1\n');
  }
  fs.writeFileSync(path.join(root, 'Conf1', 'DIR1'), [line('ONE.LHA', '01-01-24'), line('GHOST.LHA', '02-02-24')].join('\r\n'));
  fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'ONE.LHA'), 'ONE');
  fs.writeFileSync(path.join(root, 'Conf1', 'Files', 'STRAY.LHA'), 'nobody lists me');
  fs.writeFileSync(path.join(root, 'Conf2', 'DIR1'), '');
  const original = config.get.bind(config);
  spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? root : original(key as never)));
  setStorageContext(null);
  app = express();
  app.use(express.json());
  app.use('/api/files', createFileListRouter());
});

afterEach(() => {
  spy.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

test('lists conferences with their directories and Hold', async () => {
  const res = await request(app).get('/api/files/conferences');
  expect(res.status).toBe(200);
  expect(res.body.data[0]).toEqual({ conf: 1, name: 'Main', dirs: [{ dir: 1, entries: 2 }, { dir: -1, entries: 0 }] });
});

test('lists a directory with where each file is', async () => {
  const res = await request(app).get('/api/files/conferences/1/dirs/1/entries');
  expect(res.body.data.map((e: any) => [e.filename, e.bytes])).toEqual([['ONE.LHA', 'disk'], ['GHOST.LHA', 'missing']]);
});

test('edits a description, moves and deletes - on the listings the board reads', async () => {
  await request(app).patch('/api/files/conferences/1/dirs/1/entries/ONE.LHA').send({ description: ['New text', 'second line'] }).expect(200);
  expect(fs.readFileSync(path.join(root, 'Conf1', 'DIR1'), 'latin1')).toMatch(/ONE\.LHA .*01-01-24  New text\r\n {33}second line/);

  await request(app).post('/api/files/conferences/1/dirs/1/entries/ONE.LHA/move').send({ toConf: 2, toDir: 1 }).expect(200);
  expect(fs.readFileSync(path.join(root, 'Conf2', 'DIR1'), 'latin1')).toContain('ONE.LHA');

  const del = await request(app).delete('/api/files/conferences/2/dirs/1/entries/ONE.LHA').expect(200);
  expect(del.body.data.bytesError).toBeNull();
  expect(fs.readFileSync(path.join(root, 'Conf2', 'DIR1'), 'latin1')).not.toContain('ONE.LHA');
});

test('reports files no listing names, and listings with no file', async () => {
  const res = await request(app).get('/api/files/conferences/1/mismatches');
  expect(res.body.data.unlisted.map((u: any) => u.filename)).toEqual(['STRAY.LHA']);
  expect(res.body.data.missing).toEqual([{ dir: 1, filename: 'GHOST.LHA' }]);
});

test('an unknown entry is a 404', async () => {
  await request(app).delete('/api/files/conferences/1/dirs/1/entries/NOPE.LHA').expect(404);
});

test('mounted as the board mounts it, a caller without a sysop token gets nothing', async () => {
  const gated = express();
  gated.use('/api/files', authenticateToken({ verifyAccessToken: async () => null } as any), requireSysop(), createFileListRouter());
  const res = await request(gated).get('/api/files/conferences');
  expect([401, 403]).toContain(res.status);
});
