/**
 * Sysop decision 2026-10-17: uploading a menu logo puts it on screen in one
 * step. Live had no Menus/MAIN.json, so an uploaded logo was stored and never
 * named by any set. The admin's upload dialog answers placeLogo() with the
 * width uploadWidthClass() reads from the size the upload route measured, and
 * saves through the menu save route; the menu door's OPEN then writes a logo
 * line into the caller's catalogue. The dialog itself is tested in the
 * config-app (menu-logos-editor.test.tsx).
 */
jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/utils/board-owner.util', () => ({ ...jest.requireActual('../../src/utils/board-owner.util'), chownToBoard: jest.fn() }));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-upload-'));
process.env.BBS_DATA_DIR = root;
import { config } from '../../src/config';
config.set('dataDir', root);   // boardRoot() reads the config, built before this file's env
import { createMenuConfigRouter } from '../../src/api/menu-config-routes';
import { menuAnswer } from '../../src/amiga-emulation/xim/menu';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { defaultMenuConfig } from '../../src/screens/menu-config/menu-config';
import { placeLogo, uploadWidthClass } from '../../src/screens/menu-config/logo-placement';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/config/menus', createMenuConfigRouter(root));
const session = (): any => ({ nodeId: 4, currentConf: 1, screenWidth: 80, user: { id: 7, secLevel: 10, securityFlags: 'T'.repeat(128), menuStyle: '' } });
const ctx = (s: any) => ({ session: s, socket: { emit: jest.fn() }, emitDoorText: jest.fn() });
const catalogue = () => fs.readFileSync(path.join(root, 'Node4/menu-main.cat'), 'latin1');
beforeEach(() => { commandCache.bbscmd.clear(); commandCache.syscmd.clear(); });

test('an upload placed by the dialog is a logo line in a Standard caller\'s main menu, on a board with no MAIN.json', async () => {
  expect(fs.existsSync(path.join(root, 'Menus/MAIN.json'))).toBe(false);
  await menuAnswer('OPEN MAIN', ctx(session()));
  expect(catalogue()).not.toMatch(/\nL /);

  const bytes = fs.readFileSync(path.join(__dirname, '../fixtures/menu-logos/cat.txt')).toString('base64');
  const up = await request(app).put('/api/config/menus/MAIN/logos/cat.txt').send({ base64: bytes });
  expect(up.status).toBe(200);
  const { file, rows, cols } = up.body.data;
  const stored = (await request(app).get('/api/config/menus/MAIN')).body.data.config;
  const placed = placeLogo(stored, 'header', uploadWidthClass(file, cols), file);
  const saved = await request(app).put('/api/config/menus/MAIN').send(placed);
  expect(saved.body.data.problems).toEqual([]);
  expect(saved.body.data.config.logos).toEqual([expect.objectContaining({ position: 'header', widthClass: 'standard', files: ['cat.txt'] })]);

  expect(await menuAnswer('OPEN MAIN', ctx(session()))).toBe('OK\tBBS:Node4/menu-main.cat');
  expect(catalogue()).toContain(`\nL header\t${rows}\t${cols}\t0`);
});

test('uploadWidthClass: .seq is C64, ANSI up to 80 columns Standard (40 too: a C64 set draws only .seq), wider Wide', () => {
  expect(uploadWidthClass('a.seq', 40)).toBe('c64');
  expect(uploadWidthClass('a.ans', 80)).toBe('standard');
  expect(uploadWidthClass('a.txt', 40)).toBe('standard');
  expect(uploadWidthClass('a.ans', 81)).toBe('wide');
});

test('placeLogo replaces the files of the matching level-0 set, keeps its rule, leaves other sets, else adds one', () => {
  const c = defaultMenuConfig('MAIN');
  c.logos = [
    { position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'rotate', files: ['logo-a.txt', 'logo-b.txt'], afterSection: 0 },
    { position: 'header', widthClass: 'standard', levelFloor: 100, rule: 'fixed', files: ['sysop.txt'], afterSection: 0 },
  ];
  const replaced = placeLogo(c, 'header', 'standard', 'new.ans');
  expect(replaced.logos).toEqual([{ ...c.logos[0], files: ['new.ans'] }, c.logos[1]]);
  const added = placeLogo(c, 'footer', 'standard', 'new.ans');
  expect(added.logos[2]).toEqual({ position: 'footer', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['new.ans'], afterSection: 0 });
  expect(c.logos).toHaveLength(2);   // pure
});
