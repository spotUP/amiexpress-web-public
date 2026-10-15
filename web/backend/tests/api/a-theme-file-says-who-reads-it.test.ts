/**
 * A theme's own file is read by the screen it replaces, and must say so.
 *
 * The file route answered `readBy` out of the BOARD's index, and the board's
 * walk never enters a theme directory - so every screen an artist had redrawn
 * came back read by nothing, and the panel said it in as many words: "No
 * screen on this board reads this file - at any security level, in any screen
 * type, and no other screen includes it." Reported by the sysop on
 * `Themes/test/Conf/1/bull20.txt`, 2026-09-08, which is the bulletin a caller
 * wearing that theme meets on joining conference 1.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { readAllUsers: () => [{ username: 'sysop' }] },
}));

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { screensRouter } from '../../src/api/screens-routes';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;
let previousDataDir: string;

function app() {
  const a = express();
  a.use('/api/screens', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = { username: 'sysop', secLevel: 255 };
    next();
  }, express.json(), screensRouter);
  return a;
}

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-readby-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONF=1\nNAME.1=Main\nLOCATION.1=Conf1/\n');

  write('Node1/BBSTITLE.txt', 'the board title\r\n');
  write('Conf1/BULL.TXT', 'the board bulletin\r\n');

  fs.mkdirSync(path.join(root, 'Themes', 'test'), { recursive: true });
  clearThemeRegistryCache();
  writeTheme(root, {
    slug: 'test', title: 'Test', author: 'tango', owner: 'tango',
    dir: path.join('Themes', 'test'), widths: [80], doorTheme: '', status: 'draft',
  });
  clearThemeRegistryCache();

  // What the artist redrew.
  write(path.join('Themes', 'test', 'Node', 'BBSTITLE.txt'), 'the theme title\r\n');
  write(path.join('Themes', 'test', 'Conf', '1', 'BULL.TXT'), 'the theme bulletin\r\n');
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

const fileThrough = (rel: string, theme?: string) =>
  request(app()).get('/api/screens/file').query(theme ? { path: rel, theme } : { path: rel });

test('a redrawn screen names the screen that reads it, when looked at through its theme', async () => {
  const res = await fileThrough(path.join('Themes', 'test', 'Node', 'BBSTITLE.txt'), 'test');

  expect(res.status).toBe(200);
  expect(res.body.data.readBy.length).toBeGreaterThan(0);
  expect(res.body.data.readBy.map((r: { screen: string }) => r.screen)).toContain('BBSTITLE');
});

test('a redrawn conference screen too - the case the sysop reported', async () => {
  const res = await fileThrough(path.join('Themes', 'test', 'Conf', '1', 'BULL.TXT'), 'test');

  expect(res.status).toBe(200);
  expect(res.body.data.readBy.map((r: { screen: string }) => r.screen)).toContain('CONF_BULL');
  expect(res.body.data.readBy.map((r: { id: number | null }) => r.id)).toContain(1);
});

test('the board own view is unchanged: no theme asked for, the board answers', async () => {
  const res = await fileThrough('Node1/BBSTITLE.txt');

  expect(res.status).toBe(200);
  expect(res.body.data.readBy.map((r: { screen: string }) => r.screen)).toContain('BBSTITLE');
});
