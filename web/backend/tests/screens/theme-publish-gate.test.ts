/**
 * Validation, where it actually bites.
 *
 * The rules are unit-tested in `theme-validation.test.ts`; these prove they
 * are REACHED - that a sysop pressing Publish on a broken theme is refused,
 * and that an artist saving a broken screen is told rather than stopped.
 * A validator nothing calls is a validator that has never run.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { themesRouter } from '../../src/api/theme-routes';
import { screensRouter } from '../../src/api/screens-routes';
import { clearThemeRegistryCache, readThemeRegistry, writeTheme } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;
let previousDataDir: string;
let who: { username: string; secLevel: number };

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

function app(mount: '/api/themes' | '/api/screens') {
  const a = express();
  a.use(mount, (req, _res, next) => {
    (req as unknown as { user: unknown }).user = who;
    next();
  }, express.json({ limit: '8mb' }), mount === '/api/themes' ? themesRouter : screensRouter);
  return a;
}

function theme(files: Record<string, string>, over: Record<string, unknown> = {}): void {
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: '', owner: 'skope', dir: 'Themes/neon',
    widths: [80], doorTheme: '', status: 'draft', ...over,
  } as never);
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', 'neon', rel), body);
  clearThemeRegistryCache();
  invalidateScreenIndex();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-gate-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();
  invalidateScreenIndex();
  who = { username: 'sysop', secLevel: 255 };

  write('Screens/BULL.TXT', 'the board bulletin\r\n');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

test('a sysop cannot publish a theme whose menu calls a door this board does not have', async () => {
  theme({ 'Board/BULL.TXT': '~CC_nosuchdoor|\r\n' });

  const res = await request(app('/api/themes')).put('/api/themes/neon').send({ status: 'live' });

  expect(res.status).toBe(400);
  expect(res.body.data.blocking.map((f: { rule: string }) => f.rule)).toContain('unresolved-reference');
  // And the registry still says draft, so no caller can have picked it up.
  expect(readThemeRegistry(root).themes[0].status).toBe('draft');
});

test('a sysop can publish a theme with nothing wrong in it', async () => {
  theme({ 'Board/BULL.TXT': 'the neon bulletin\r\n' });

  const res = await request(app('/api/themes')).put('/api/themes/neon').send({ status: 'live' });

  expect(res.status).toBe(200);
  clearThemeRegistryCache();
  expect(readThemeRegistry(root).themes[0].status).toBe('live');
});

test('the page can ask for the same report the gate uses', async () => {
  theme({ 'Board/BULL.TXT': '' });

  const res = await request(app('/api/themes')).get('/api/themes/neon/validation');

  expect(res.status).toBe(200);
  expect(res.body.data.publishable).toBe(false);
  expect(res.body.data.blocking.map((f: { rule: string }) => f.rule)).toContain('file-problem');
});

test('saving a broken screen into a theme reports it and still saves', async () => {
  // An artist saves half-drawn work all day. The gate is publication, not the
  // save - but the save says what is wrong, so nobody is surprised at Publish.
  theme({ 'Board/BULL.TXT': 'starting point\r\n' });

  const res = await request(app('/api/screens'))
    .put('/api/screens/file?path=' + encodeURIComponent('Themes/neon/Board/BULL.TXT'))
    .send({ content: Buffer.from('~CC_nosuchdoor|\r\n', 'latin1').toString('base64'), carryCodes: 'none' });

  expect(res.status).toBe(200);
  expect(res.body.data.themeFindings[0].theme).toBe('neon');
  expect(res.body.data.themeFindings[0].findings.map((f: { rule: string }) => f.rule))
    .toContain('unresolved-reference');
  expect(fs.readFileSync(path.join(root, 'Themes/neon/Board/BULL.TXT'), 'latin1')).toContain('nosuchdoor');
});

test("saving a board screen outside every theme reports no theme findings", async () => {
  theme({ 'Board/BULL.TXT': 'the neon bulletin\r\n' });

  const res = await request(app('/api/screens'))
    .put('/api/screens/file?path=' + encodeURIComponent('Screens/BULL.TXT'))
    .send({ content: Buffer.from('a new board bulletin\r\n', 'latin1').toString('base64'), carryCodes: 'none' });

  expect(res.status).toBe(200);
  expect(res.body.data.themeFindings).toEqual([]);
});
