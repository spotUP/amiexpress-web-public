/**
 * What the MCI picker is offered, and where each list comes from.
 *
 * Every choice here is the board's own files - a command icon, the screen
 * index, the Doors directory. The two things worth pinning are that the
 * command picker shows the name the ICON carries rather than the filename,
 * and that an argument kind nobody defined is an error rather than an empty
 * list: "no doors installed" is a sentence a sysop would believe.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-mci-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'DOORMAN'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'archives'), { recursive: true });

  // A screen using three codes, so the census has something to count.
  fs.writeFileSync(
    path.join(root, 'Node1', 'LOGON.TXT'),
    '~\n~f~SS_BBS:Node1/BBSTITLE.txt|\n~CC_gwall|\n~SP\n',
    'latin1'
  );
  fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), 'title\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Node1', 'MENU.TXT'), 'menu\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'GWALL.info'), 'NAME=Global Wall\nACCESS=10\n');

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('GET /api/screens/mci/catalog', () => {
  test('describes every code, grouped into families that all have codes', async () => {
    const res = await request(app).get('/api/screens/mci/catalog');

    expect(res.status).toBe(200);
    expect(res.body.data.codes.length).toBeGreaterThan(90);

    const familiesUsed = new Set(res.body.data.codes.map((c: any) => c.family));
    for (const { family } of res.body.data.families) {
      expect(familiesUsed.has(family)).toBe(true);
    }
  });

  test('counts what THIS board does with each code, not what is possible', async () => {
    const res = await request(app).get('/api/screens/mci/catalog');
    const byCode = Object.fromEntries(res.body.data.codes.map((c: any) => [c.code, c]));

    expect(byCode['f'].files).toBe(1);
    expect(byCode['CC_'].files).toBe(1);
    expect(byCode['SS_'].files).toBe(1);
    expect(byCode['SP'].files).toBe(1);
    // Live, implemented, and never used here - which is the whole point of
    // showing a count rather than a checkmark.
    expect(byCode['TR'].uses).toBe(0);
  });

  test('reports the bare leading tilde separately, because it is a switch and not a code', async () => {
    const res = await request(app).get('/api/screens/mci/catalog');
    expect(res.body.data.enablingTilde.files).toBe(1);
  });
});

describe('GET /api/screens/mci/targets', () => {
  test('the command picker shows the name the icon carries, not the filename', async () => {
    const res = await request(app).get('/api/screens/mci/targets').query({ kind: 'command' });

    expect(res.status).toBe(200);
    const gwall = res.body.data.targets.find((t: any) => t.value === 'GWALL');
    expect(gwall).toBeDefined();
    expect(gwall.label).toBe('Global Wall');
    expect(gwall.detail).toBe('access 10');
  });

  test('the door picker lists installed doors and never the archives directory', async () => {
    const res = await request(app).get('/api/screens/mci/targets').query({ kind: 'door' });

    expect(res.body.data.targets.map((t: any) => t.value)).toEqual(['DOORMAN']);
  });

  test('the screen picker offers the BBS: path a ~SS_ would carry', async () => {
    const res = await request(app).get('/api/screens/mci/targets').query({ kind: 'screen' });

    const values = res.body.data.targets.map((t: any) => t.value);
    expect(values).toContain('BBS:Node1/BBSTITLE.txt');
  });

  test('the menu picker offers menus', async () => {
    const res = await request(app).get('/api/screens/mci/targets').query({ kind: 'menu' });

    expect(res.body.data.targets.map((t: any) => t.value)).toContain('MENU');
  });

  test('an argument kind nobody defined is an error, not an empty list', async () => {
    const res = await request(app).get('/api/screens/mci/targets').query({ kind: 'nonsense' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('command');
  });

  test('a missing kind is the same error', async () => {
    const res = await request(app).get('/api/screens/mci/targets');
    expect(res.status).toBe(400);
  });
});
