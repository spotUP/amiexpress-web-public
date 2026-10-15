/**
 * The menu doors admin API (plan M11). A temp board on disk, the real router
 * behind the real requireSysop; only the ACS tables are stubbed (every
 * permission granted) so the preview shows what the menu CAN list.
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('../../src/utils/acs-access-loader', () => ({
  checkAcsPermission: jest.fn(() => true),
  findAcsLevel: jest.fn(() => 255),
}));
jest.mock('../../src/utils/board-owner.util', () => ({ ...jest.requireActual('../../src/utils/board-owner.util'), chownToBoard: jest.fn() }));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { createMenuConfigRouter, menuConfigBodyError } from '../../src/api/menu-config-routes';
import { requireSysop } from '../../src/middleware/auth.middleware';
import { config } from '../../src/config';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { INTERNAL_COMMANDS } from '../../src/screens/menu-config/internal-commands';
import { chownToBoard } from '../../src/utils/board-owner.util';

const FIX = path.join(__dirname, '../fixtures');
let root: string;
let previousDataDir: string;

let bodyLimit = '1mb';
function appFor(secLevel = 255) {
  const app = express();
  app.use(express.json({ limit: bodyLimit }));
  app.use('/api/config/menus', (req: express.Request & { user?: { secLevel: number } }, _res: express.Response, next: express.NextFunction) => { req.user = { secLevel }; next(); }, requireSysop(), createMenuConfigRouter(root), menuConfigBodyError);
  return app;
}
const door = (command: string, t: Record<string, string> = {}) => ({ name: command, type: 'XIM', location: `Doors/${command}/x`, access: undefined, toolTypes: t });
const b64 = (name: string) => fs.readFileSync(path.join(FIX, 'menu-logos', name)).toString('base64');

beforeEach(() => {
  bodyLimit = '1mb';
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-routes-'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Doors', 'FROGGER'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'FROGGER.info'), 'TYPE=XIM\nLOCATION=Doors/FROGGER/frog\nDESCRIPTION=Cross the road\n');
  fs.writeFileSync(path.join(root, 'Doors', 'FROGGER', 'frog'), 'x');
  fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull1.txt'), 'one');
  fs.writeFileSync(path.join(root, 'Bulletins', 'bull2.txt'), 'two');
  fs.writeFileSync(path.join(root, 'Bulletins', 'BullHelp.txt'), 'help');
  fs.mkdirSync(path.join(root, 'Doors', 'emp_tools'), { recursive: true });
  fs.copyFileSync(path.join(FIX, 'bulls-minimal.CFG'), path.join(root, 'Doors', 'emp_tools', 'Bulls.CFG'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  commandCache.bbscmd.clear(); commandCache.syscmd.clear();
  // The registry reads this cache (revalidated from disk only when the BBSCmd dirs change); FROGGER has no MIN_COLUMNS, so it needs 80.
  commandCache.bbscmd.set('FROGGER', door('FROGGER', { DESCRIPTION: 'Cross the road' }) as any);
  (chownToBoard as jest.Mock).mockClear();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  commandCache.bbscmd.clear(); commandCache.syscmd.clear();
  fs.rmSync(root, { recursive: true, force: true });
});

const keys = (sections: any[]) => sections.flatMap(s => s.entries.map((e: any) => e.key));

test('GET answers the defaults for a kind with no file', async () => {
  const res = await request(appFor()).get('/api/config/menus/MAIN');
  expect(res.status).toBe(200);
  expect(res.body.data.config.wipes.open).toBe('X');
  expect(res.body.data.problems).toEqual([]);
});

test('PUT repairs what it can, reports it, stores the repaired config', async () => {
  const app = appFor();
  const put = await request(app).put('/api/config/menus/MAIN').send({ wipes: { open: 'Q' }, descriptions: { R: 'Mail, here' } });
  expect(put.status).toBe(200);
  expect(put.body.data.config.wipes.open).toBe('X');
  expect(put.body.data.problems.join(' ')).toMatch(/wipes open/);
  const back = await request(app).get('/api/config/menus/MAIN');
  expect(back.body.data.config.descriptions.R).toBe('Mail, here');
});

test('a kind is case-insensitive in the URL; an unknown kind is 404 on every route', async () => {
  const app = appFor();
  expect((await request(app).get('/api/config/menus/main')).status).toBe(200);
  for (const [method, url] of [['get', '/NOPE'], ['put', '/NOPE'], ['get', '/NOPE/preview'], ['get', '/NOPE/entries'], ['get', '/NOPE/logos'], ['put', '/NOPE/logos/a.txt'], ['delete', '/NOPE/logos/a.txt']] as const) {
    expect((await (request(app) as any)[method](`/api/config/menus${url}`).send({})).status).toBe(404);
  }
});

test('a caller who is not the sysop is refused', async () => {
  expect((await request(appFor(100)).get('/api/config/menus/MAIN')).status).toBe(403);
  expect((await request(appFor(100)).put('/api/config/menus/MAIN').send({})).status).toBe(403);
});

test('preview: level 10 at 80 columns lists Read Mail and FROGGER; the 40-column C64 caller does not get FROGGER (no MIN_COLUMNS)', async () => {
  const app = appFor();
  const wide = await request(app).get('/api/config/menus/MAIN/preview?level=10&columns=80&conference=1&mode=ansi');
  expect(wide.status).toBe(200);
  expect(keys(wide.body.data.sections)).toEqual(expect.arrayContaining(['R', 'FROGGER']));
  expect(wide.body.data.overflow).toBe('scroll');
  const c64 = await request(app).get('/api/config/menus/MAIN/preview?level=10&columns=40&conference=1&mode=petscii');
  expect(c64.status).toBe(200);
  expect(keys(c64.body.data.sections)).toContain('R');
  expect(keys(c64.body.data.sections)).not.toContain('FROGGER');
  expect(c64.body.data.overflow).toBe('pages');
});

test('preview of BULLETINS lists bulletin 1 titled from Bulls.CFG', async () => {
  const res = await request(appFor()).get('/api/config/menus/BULLETINS/preview?level=10&columns=80');
  expect(res.status).toBe(200);
  const first = res.body.data.sections.flatMap((s: any) => s.entries).find((e: any) => e.key === '1');
  expect(first.label).toBe('Top Uploaders');
});

test('preview answers a refusal when the source refuses the caller, and rejects widths and levels it cannot show', async () => {
  fs.rmSync(path.join(root, 'Bulletins', 'BullHelp.txt'));
  const none = await request(appFor()).get('/api/config/menus/BULLETINS/preview?level=10&columns=80');
  expect(none.body.data).toEqual({ refusal: 'none' });
  for (const q of ['columns=79', 'level=256', 'level=x', 'mode=rip', 'conference=0']) {
    expect((await request(appFor()).get(`/api/config/menus/MAIN/preview?${q}`)).status).toBe(400);
  }
});

test('preview applies the stored config: a hidden entry is gone', async () => {
  const app = appFor();
  await request(app).put('/api/config/menus/MAIN').send({ levels: { '0': { hide: ['FROGGER'], rename: {}, order: [] } } });
  const res = await request(app).get('/api/config/menus/MAIN/preview?level=10&columns=80');
  expect(keys(res.body.data.sections)).not.toContain('FROGGER');
});

test('entries lists every listed internal command plus FROGGER, each with its source', async () => {
  const res = await request(appFor()).get('/api/config/menus/MAIN/entries');
  expect(res.status).toBe(200);
  const rows: any[] = res.body.data;
  const listed = INTERNAL_COMMANDS.filter(r => r.listed);
  expect(listed.length).toBe(63);
  expect(rows.filter(r => r.source === 'internal')).toHaveLength(63);
  expect(rows.find(r => r.key === 'FROGGER')).toMatchObject({ source: 'door', description: 'Cross the road' });
  expect(rows.length).toBe(64);
  expect(rows[0]).toEqual(expect.objectContaining({ key: expect.any(String), label: expect.any(String), section: expect.any(String) }));
});

test('entries of a SysCmd say so, and a door that shadows an internal key says door; bulletins say bulletin', async () => {
  fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'W.info'), 'TYPE=XIM\nLOCATION=Doors/FROGGER/frog\n');   // registrations are read from the board's disk
  commandCache.syscmd.set('SHUTDOWN', door('SHUTDOWN', { DESCRIPTION: 'Stop' }) as any);
  const rows: any[] = (await request(appFor()).get('/api/config/menus/MAIN/entries')).body.data;
  expect(rows.find(r => r.key === 'W').source).toBe('door');
  expect(rows.find(r => r.key === 'SHUTDOWN').source).toBe('syscmd');
  const bulls: any[] = (await request(appFor()).get('/api/config/menus/BULLETINS/entries')).body.data;
  expect(bulls.map(r => r.source)).toEqual(['bulletin', 'bulletin']);
});

test('logo upload answers the measured size; the list shows it with its alphabet', async () => {
  const app = appFor();
  const up = await request(app).put('/api/config/menus/MAIN/logos/cat.txt').send({ base64: b64('cat.txt') });
  expect(up.status).toBe(200);
  expect(up.body.data).toEqual({ file: 'cat.txt', rows: 3, cols: 7 });
  await request(app).put('/api/config/menus/MAIN/logos/cat.seq').send({ base64: b64('cat.seq') });
  const list = await request(app).get('/api/config/menus/MAIN/logos');
  expect(list.body.data.map((l: any) => [l.file, l.alphabet])).toEqual([['cat.seq', 'petscii'], ['cat.txt', 'ansi']]);
  expect(fs.readdirSync(path.join(root, 'Screens/menus/main/logos')).filter(f => f.startsWith('.'))).toEqual([]);
});

test('a bad logo name, a wrong extension, an oversize file and an over-wide ANSI logo are 400 and write nothing', async () => {
  const app = appFor();
  const dir = path.join(root, 'Screens/menus/main/logos');
  const put = (name: string, body: Buffer | string) => request(app).put(`/api/config/menus/MAIN/logos/${encodeURIComponent(name)}`).send({ base64: Buffer.from(body).toString('base64') });
  expect((await put('../x.txt', 'hi')).status).toBe(400);
  expect((await put('..%2Fx.txt', 'hi')).status).toBe(400);
  expect((await put('x.exe', 'hi')).status).toBe(400);
  expect((await put('big.txt', Buffer.alloc(64 * 1024 + 1, 0x41))).status).toBe(400);
  expect((await put('wide.txt', 'A'.repeat(201))).status).toBe(400);
  expect((await request(app).put('/api/config/menus/MAIN/logos/ok.txt').send({})).status).toBe(400);
  expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  expect(fs.existsSync(path.join(root, 'x.txt'))).toBe(false);
  expect((await put('edge.txt', 'A'.repeat(200))).status).toBe(200);
});

test('a logo a logo set still names cannot be deleted (409 with where); an unused one can (204)', async () => {
  const app = appFor();
  await request(app).put('/api/config/menus/MAIN/logos/cat.txt').send({ base64: b64('cat.txt') });
  await request(app).put('/api/config/menus/MAIN').send({ logos: [{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'] }] });
  const refused = await request(app).delete('/api/config/menus/MAIN/logos/cat.txt');
  expect(refused.status).toBe(409);
  expect(refused.body.usedBy).toEqual(['header']);
  expect(fs.existsSync(path.join(root, 'Screens/menus/main/logos/cat.txt'))).toBe(true);
  await request(app).put('/api/config/menus/MAIN').send({});
  expect((await request(app).delete('/api/config/menus/MAIN/logos/cat.txt')).status).toBe(204);
  expect(fs.existsSync(path.join(root, 'Screens/menus/main/logos/cat.txt'))).toBe(false);
  expect((await request(app).delete('/api/config/menus/MAIN/logos/cat.txt')).status).toBe(404);
  expect((await request(app).delete('/api/config/menus/MAIN/logos/..%2Fx.txt')).status).toBe(400);
});

test('preview shows the next logo without using up the caller\'s turn in a rotation', async () => {
  const app = appFor();
  await request(app).put('/api/config/menus/MAIN/logos/a.txt').send({ base64: b64('cat.txt') });
  await request(app).put('/api/config/menus/MAIN/logos/b.txt').send({ base64: b64('cat.txt') });
  await request(app).put('/api/config/menus/MAIN').send({ logos: [{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'rotate', files: ['a.txt', 'b.txt'] }] });
  const picks = [];
  for (let i = 0; i < 3; i++) picks.push((await request(app).get('/api/config/menus/MAIN/preview?level=10&columns=80')).body.data.logos[0].file);
  expect(new Set(picks).size).toBe(1);
});

test('errors never name the disk', async () => {
  fs.mkdirSync(path.join(root, 'Menus'));
  fs.mkdirSync(path.join(root, 'Menus', 'MAIN.json'));   // a directory where the file should be: the write fails on the disk
  const res = await request(appFor()).put('/api/config/menus/MAIN').send({});
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain(root);
  expect(res.body.success).toBe(false);
});

test('every admin write is handed to the board: the config, its backup, a logo', async () => {
  const app = appFor();
  await request(app).put('/api/config/menus/MAIN').send({});
  await request(app).put('/api/config/menus/MAIN').send({});
  await request(app).put('/api/config/menus/MAIN/logos/cat.txt').send({ base64: b64('cat.txt') });
  const owned = (chownToBoard as jest.Mock).mock.calls.map(c => c[0]);
  expect(owned).toEqual(expect.arrayContaining([
    path.join(root, 'Menus', 'MAIN.json'),
    path.join(root, 'Menus', 'MAIN.json.bak'),
    path.join(root, 'Screens/menus/main/logos/cat.txt'),
  ]));
});

test('a body the global parser refuses answers our envelope, not the default error page', async () => {
  bodyLimit = '100kb';   // the app's global express.json() default
  const big = await request(appFor()).put('/api/config/menus/MAIN/logos/big.txt').send({ base64: Buffer.alloc(80 * 1024, 0x41).toString('base64') });
  expect(big.status).toBe(413);
  expect(big.body).toMatchObject({ success: false, message: expect.stringMatching(/64 KB/) });
  expect(big.body.timestamp).toEqual(expect.any(String));
  const bad = await request(appFor()).put('/api/config/menus/MAIN').set('Content-Type', 'application/json').send('{oops');
  expect(bad.status).toBe(400);
  expect(bad.body.success).toBe(false);
});
