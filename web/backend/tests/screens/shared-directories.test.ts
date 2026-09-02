/**
 * Sharing a screen directory, on a board that has one.
 *
 * Reported live: clicking "40 copies with identical content - they can be read
 * from one directory instead" answered "The shared directory is outside the
 * board root". It was not outside anything. The page asks for `Screens/Shared`,
 * which does not exist on that board, and the guard resolves a path through
 * the Amiga filesystem - which answers null for a path that is not there, and
 * the route reported that as an escape attempt.
 *
 * Two separate facts, and the sysop needs to be told which one applies:
 * containment, which is a refusal, and existence, which is a choice to make.
 * The board's real shared directory is `Screens/Node`, where 215 nodes already
 * read from.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-dirs-'));

jest.mock('../../src/config', () => ({
  config: { get: (key: string) => (key === 'dataDir' ? root : undefined) },
}));

import { screensRouter } from '../../src/api/screens-routes';

function app() {
  const a = express();
  a.use('/api/screens', express.json(), screensRouter);
  return a;
}

beforeAll(() => {
  fs.mkdirSync(path.join(root, 'Screens', 'Node'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'Node', 'BBSTITLE.txt'), 'title\n');
  fs.writeFileSync(path.join(root, 'Screens', 'LOGON.TXT'), 'logon\n');
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf2'), { recursive: true });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the directories a node can be pointed at', () => {
  it('lists the ones that exist and hold screens', async () => {
    const res = await request(app()).get('/api/screens/shared-directories');

    expect(res.status).toBe(200);
    const dirs = res.body.data.directories.map((d: { dir: string }) => d.dir);
    expect(dirs).toContain('Screens/Node');
    expect(dirs).toContain('Screens');
  });

  it('leaves out a node or conference directory - those belong to one of them', async () => {
    const res = await request(app()).get('/api/screens/shared-directories');

    const dirs = res.body.data.directories.map((d: { dir: string }) => d.dir);
    expect(dirs).not.toContain('Node1');
    expect(dirs).not.toContain('Conf2');
  });

  it('says how many screens each holds, so a choice can be made', async () => {
    const res = await request(app()).get('/api/screens/shared-directories');

    const node = res.body.data.directories.find((d: { dir: string }) => d.dir === 'Screens/Node');
    expect(node.files).toBe(1);
  });
});

describe('sharing a directory that is not there', () => {
  it('says it does not exist, rather than accusing the sysop of escaping the root', async () => {
    const res = await request(app())
      .post('/api/screens/share')
      .send({ nodes: [1], sharedDir: 'Screens/Shared', dryRun: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no such directory|does not exist/i);
    expect(res.body.error).not.toMatch(/outside the board root/i);
  });

  it('still refuses a path that really is outside the board', async () => {
    const res = await request(app())
      .post('/api/screens/share')
      .send({ nodes: [1], sharedDir: '../../etc', dryRun: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/outside the board root/i);
  });

  it('accepts a directory that exists', async () => {
    const res = await request(app())
      .post('/api/screens/share')
      .send({ nodes: [1], sharedDir: 'Screens/Node', dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.data.tooltype).toBe('BBS:Screens/Node/');
  });
});
