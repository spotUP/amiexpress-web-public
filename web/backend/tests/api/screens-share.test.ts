/**
 * POST /api/screens/share - the one action with teeth.
 *
 * It writes a tooltype that changes which directory a node reads EVERY screen
 * from, so it checks every node first and writes nothing at all if any of them
 * fails. A partial share is how forty nodes end up in two states.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTooltypeMap } from '../../src/utils/info-file.util';

let root: string;
let app: express.Express;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-share-api-'));
  write('Node1/BBSTITLE.txt', 'title\n');
  write('Node1/LOGON.TXT', 'logon\n');
  write('Node2/BBSTITLE.txt', 'title\n');
  write('Node2/LOGON.TXT', 'logon\n');
  write('Screens/Shared/BBSTITLE.txt', 'title\n');
  write('Screens/Shared/LOGON.TXT', 'logon\n');

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json());
  app.use('/api/screens', screensRouter);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('a dry run reports what would happen and writes nothing', async () => {
  const res = await request(app).post('/api/screens/share')
    .send({ nodes: [1], sharedDir: 'Screens/Shared', dryRun: true });

  expect(res.status).toBe(200);
  expect(res.body.data.wouldWrite).toEqual(['Node1.info']);
  expect(fs.existsSync(path.join(root, 'Node1.info'))).toBe(false);
});

test('refuses when any node would lose a file, and writes nothing for any of them', async () => {
  write('Node1/EXTRA.TXT', 'only node 1 has this\n');

  const res = await request(app).post('/api/screens/share')
    .send({ nodes: [1, 2], sharedDir: 'Screens/Shared' });

  expect(res.status).toBe(409);
  expect(res.body.data.blocked[0].id).toBe(1);
  expect(res.body.data.blocked[0].losing).toContain('EXTRA.TXT');
  expect(fs.existsSync(path.join(root, 'Node1.info'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'Node2.info'))).toBe(false);
});

test('writes the tooltype with its trailing slash and deletes nothing', async () => {
  const res = await request(app).post('/api/screens/share')
    .send({ nodes: [1, 2], sharedDir: 'Screens/Shared' });

  expect(res.status).toBe(200);
  expect(readTooltypeMap(path.join(root, 'Node1.info')).get('SCREENS')).toBe('BBS:Screens/Shared/');
  expect(readTooltypeMap(path.join(root, 'Node2.info')).get('SCREENS')).toBe('BBS:Screens/Shared/');
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.txt'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'Node2', 'LOGON.TXT'))).toBe(true);
});

test('after sharing, the node resolves from the shared directory', async () => {
  await request(app).post('/api/screens/share').send({ nodes: [1], sharedDir: 'Screens/Shared' });

  const res = await request(app).get('/api/screens/resolve').query({ screen: 'BBSTITLE', node: '1' });

  expect(res.body.data.chosen).toBe(path.join('Screens', 'Shared', 'BBSTITLE.txt'));
});
