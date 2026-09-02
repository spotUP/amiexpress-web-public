/**
 * Repairing forty-one copies of one file, and letting the sysop overrule the
 * manager about what a file IS.
 *
 * 41 of this board's 47 damaged screens are copies of one NODE_BULL.TXT, so
 * repairing them one at a time is forty clicks for a single decision. And the
 * manager's classification is a heuristic - by name, and by the signature of
 * the tool that writes a file - which this board has already been told once
 * was wrong about its live screens.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let root: string;
let app: express.Express;

/** Colour codes with the ESC byte gone - what a text-mode copy leaves behind. */
const DAMAGED = '[0;1;31mRED[0m\r\n';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-all-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node2'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });

  fs.writeFileSync(path.join(root, 'Node1', 'NODE_BULL.TXT'), DAMAGED, 'latin1');
  fs.writeFileSync(path.join(root, 'Node2', 'NODE_BULL.TXT'), DAMAGED, 'latin1');
  // Healthy: it already carries a real escape byte.
  fs.writeFileSync(path.join(root, 'Screens', 'good.txt'), '\x1b[31mRED\x1b[0m\r\n', 'latin1');

  process.env.BBS_DATA_DIR = root;
  jest.resetModules();
  const { screensRouter } = require('../../src/api/screens-routes');
  app = express();
  app.use(express.json({ limit: '8mb' }));
  app.use('/api/screens', screensRouter);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const read = (rel: string) => fs.readFileSync(path.join(root, rel)).toString('latin1');

describe('POST /api/screens/repair-all', () => {
  test('a dry run names every file it would write, and writes none of them', async () => {
    const res = await request(app).post('/api/screens/repair-all').send({ dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.data.damaged.sort()).toEqual([
      path.join('Node1', 'NODE_BULL.TXT'),
      path.join('Node2', 'NODE_BULL.TXT'),
    ]);
    expect(read('Node1/NODE_BULL.TXT')).toBe(DAMAGED);
  });

  test('repairs every damaged file and reports them by name, not as a count', async () => {
    const res = await request(app).post('/api/screens/repair-all').send({});

    expect(res.status).toBe(200);
    expect(res.body.data.repaired.map((r: { path: string }) => r.path).sort()).toEqual([
      path.join('Node1', 'NODE_BULL.TXT'),
      path.join('Node2', 'NODE_BULL.TXT'),
    ]);
    expect(read('Node1/NODE_BULL.TXT')).toBe('\x1b[0;1;31mRED\x1b[0m\r\n');
    expect(read('Node2/NODE_BULL.TXT')).toBe('\x1b[0;1;31mRED\x1b[0m\r\n');
  });

  test('leaves a healthy file alone', async () => {
    const before = read('Screens/good.txt');
    await request(app).post('/api/screens/repair-all').send({});

    expect(read('Screens/good.txt')).toBe(before);
    expect(fs.existsSync(path.join(root, 'Screens', 'good.txt.backup'))).toBe(false);
  });

  test('backs each file up before writing it, the way a single repair does', async () => {
    await request(app).post('/api/screens/repair-all').send({});

    expect(read('Node1/NODE_BULL.TXT.backup')).toBe(DAMAGED);
  });

  test('running it twice repairs nothing the second time', async () => {
    await request(app).post('/api/screens/repair-all').send({});
    const second = await request(app).post('/api/screens/repair-all').send({});

    expect(second.body.data.repaired).toEqual([]);
  });
});

describe('POST /api/screens/flag', () => {
  test('a file the sysop marks as written by the board is reported that way', async () => {
    const res = await request(app).post('/api/screens/flag')
      .send({ path: 'Screens/good.txt', flag: 'runtime' });

    expect(res.status).toBe(200);

    const index = await request(app).get('/api/screens');
    expect(index.body.data.files[path.join('Screens', 'good.txt')].generated).toBe('runtime');
  });

  test('marking a file as art overrules the manager rather than adding a third answer', async () => {
    // callerslog.txt matches RUNTIME_NAME, so the heuristic calls it runtime.
    fs.writeFileSync(path.join(root, 'Screens', 'callerslog.txt'), 'art\r\n', 'latin1');

    const before = await request(app).get('/api/screens');
    expect(before.body.data.files[path.join('Screens', 'callerslog.txt')].generated).toBe('runtime');

    await request(app).post('/api/screens/flag')
      .send({ path: 'Screens/callerslog.txt', flag: 'art' });

    const after = await request(app).get('/api/screens');
    expect(after.body.data.files[path.join('Screens', 'callerslog.txt')].generated).toBeUndefined();
  });

  test('clearing the mark gives the heuristic its say back', async () => {
    fs.writeFileSync(path.join(root, 'Screens', 'callerslog.txt'), 'art\r\n', 'latin1');
    await request(app).post('/api/screens/flag')
      .send({ path: 'Screens/callerslog.txt', flag: 'art' });

    await request(app).post('/api/screens/flag')
      .send({ path: 'Screens/callerslog.txt', flag: null });

    const index = await request(app).get('/api/screens');
    expect(index.body.data.files[path.join('Screens', 'callerslog.txt')].generated).toBe('runtime');
  });

  test('the marks live on the board, in a file a sysop can read', async () => {
    await request(app).post('/api/screens/flag')
      .send({ path: 'Screens/good.txt', flag: 'backup' });

    const onDisk = JSON.parse(fs.readFileSync(path.join(root, '.screen-flags.json'), 'utf8'));
    expect(onDisk[path.join('Screens', 'good.txt')]).toBe('backup');
  });

  test('the file is removed once nothing is marked, rather than left as an empty object', async () => {
    await request(app).post('/api/screens/flag').send({ path: 'Screens/good.txt', flag: 'backup' });
    await request(app).post('/api/screens/flag').send({ path: 'Screens/good.txt', flag: null });

    expect(fs.existsSync(path.join(root, '.screen-flags.json'))).toBe(false);
  });

  test('a flag nobody defines is refused rather than silently ignored', async () => {
    const res = await request(app).post('/api/screens/flag')
      .send({ path: 'Screens/good.txt', flag: 'probably-art' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('backup, runtime, art');
  });

  test('a path outside the board root is refused', async () => {
    const res = await request(app).post('/api/screens/flag')
      .send({ path: '../escape.txt', flag: 'art' });

    expect(res.status).toBe(400);
  });
});
