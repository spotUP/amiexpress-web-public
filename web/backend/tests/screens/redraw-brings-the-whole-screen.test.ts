/**
 * "Redraw this" means the screen, not one of its files.
 *
 * A screen is a set: `BULL.TXT` for most callers, `BULL255.TXT` for the sysop,
 * `BULL.SEQ` for a C64. The copy route took the one file the artist named, so
 * a theme that redrew the bulletin covered the SYSOP's bulletin with
 * everybody's - the shadowing `theme-validation` rule 5 refuses to publish -
 * and served a C64 caller the board's art under the theme's name. The artist
 * found out at the publish gate, about a file they never touched.
 *
 * The seeder that fills a NEW theme already copied the whole set. This is the
 * same rule, in one place, for both.
 */
process.env.SKIP_DB_INIT = '1';

const users: Array<{ username: string }> = [{ username: 'sysop' }, { username: 'skope' }];
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { readAllUsers: () => users },
}));

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { themesRouter } from '../../src/api/theme-routes';
import { clearThemeRegistryCache, readThemeRegistry } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { validateTheme } from '../../src/screens/theme-validation';

let root: string;
let previousDataDir: string;
let who: { username: string; secLevel: number };

function app() {
  const a = express();
  a.use('/api/themes', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = who;
    next();
  }, express.json(), themesRouter);
  return a;
}
const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};
const themeFile = (rel: string) => path.join(root, 'Themes', 'neon', rel);
const redraw = (boardPath: string) =>
  request(app()).post('/api/themes/neon/copy').send({ path: boardPath });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'redraw-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  who = { username: 'sysop', secLevel: 255 };

  // One screen, four files: the base, the sysop's variant, a C64's and a
  // leftover nobody edits.
  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  write('Screens/BULL255.TXT', 'the sysop bulletin\r\n');
  write('Screens/BULL.SEQ', 'the C64 bulletin\r\n');
  write('Screens/BULL.TXT.bak', 'an old copy nobody edits\r\n');
  // High-bit Amiga art, to prove the copy is bytes and not text.
  write('Screens/MAILSCAN.TXT', 'art \xA1\xC6\xFF here\r\n');

  clearThemeRegistryCache();
  invalidateScreenIndex();
  // An empty theme: created, then emptied, so each test starts from nothing
  // drawn and the copy route is the only thing that writes.
  await request(app()).post('/api/themes').send({ slug: 'neon', title: 'Neon', owner: 'skope', widths: [80] });
  fs.rmSync(path.join(root, 'Themes', 'neon'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'Themes', 'neon'), { recursive: true });
  invalidateScreenIndex();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

test('redrawing a screen brings its security variants with it', async () => {
  const res = await redraw('Screens/BULL.TXT');

  expect(res.status).toBe(200);
  expect(fs.existsSync(themeFile(path.join('Board', 'BULL.TXT')))).toBe(true);
  expect(fs.existsSync(themeFile(path.join('Board', 'BULL255.TXT')))).toBe(true);
});

test('the screen the artist just redrew does not shadow the sysop\'s', async () => {
  await redraw('Screens/BULL.TXT');

  const theme = readThemeRegistry(root).themes.find(t => t.slug === 'neon')!;
  const report = validateTheme(root, theme);
  expect(report.blocking.map(f => f.rule)).not.toContain('shadows-security-variant');
});

test('the PETSCII version comes too, so a C64 caller is not left on the board\'s art', async () => {
  await redraw('Screens/BULL.TXT');

  expect(fs.readFileSync(themeFile(path.join('Board', 'BULL.SEQ')), 'latin1')).toBe('the C64 bulletin\r\n');
});

test('a leftover beside the screen is not copied', async () => {
  await redraw('Screens/BULL.TXT');

  expect(fs.existsSync(themeFile(path.join('Board', 'BULL.TXT.bak')))).toBe(false);
});

test('it says where every file landed, and what was already the artist\'s', async () => {
  const first = await redraw('Screens/BULL.TXT');
  expect(first.body.data.copied.map((c: { target: string }) => c.target).sort())
    .toEqual([path.join('Board', 'BULL.SEQ'), path.join('Board', 'BULL.TXT'), path.join('Board', 'BULL255.TXT')].sort());
  // `to` still names the file the artist asked for, so the editor reopens on it.
  expect(first.body.data.to).toBe(path.join('Themes', 'neon', 'Board', 'BULL.TXT'));

  // Asking again for a file the theme now has is the route's own 409 - the
  // artist is editing it, not starting it.
  const second = await redraw('Screens/BULL255.TXT');
  expect(second.status).toBe(409);
  expect(second.body.error).toMatch(/already has/i);
});

test('what the artist has already drawn is kept, not overwritten', async () => {
  fs.mkdirSync(themeFile('Board'), { recursive: true });
  fs.writeFileSync(themeFile(path.join('Board', 'BULL255.TXT')), 'the artist\'s own\r\n', 'latin1');

  const res = await redraw('Screens/BULL.TXT');

  expect(fs.readFileSync(themeFile(path.join('Board', 'BULL255.TXT')), 'latin1')).toBe('the artist\'s own\r\n');
  // And it says so, rather than leaving the artist to wonder which of the
  // three files it just wrote over.
  expect(res.body.data.kept.map((k: { target: string }) => k.target)).toContain(path.join('Board', 'BULL255.TXT'));
  expect(res.body.data.copied.map((c: { target: string }) => c.target)).toContain(path.join('Board', 'BULL.TXT'));
});

test('high-bit Amiga art survives the copy, byte for byte', async () => {
  await redraw('Screens/MAILSCAN.TXT');

  expect(fs.readFileSync(themeFile(path.join('Board', 'MAILSCAN.TXT'))))
    .toEqual(fs.readFileSync(path.join(root, 'Screens', 'MAILSCAN.TXT')));
});

test('art the index does not know is still copied, on its own', async () => {
  write('Screens/logo.txt', 'somebody\'s logo\r\n');
  invalidateScreenIndex();

  const res = await redraw('Screens/logo.txt');

  expect(res.status).toBe(200);
  expect(res.body.data.copied).toHaveLength(1);
  expect(fs.existsSync(themeFile(path.join('Board', 'logo.txt')))).toBe(true);
});

test('the theme has to be yours', async () => {
  who = { username: 'nobody', secLevel: 100 };

  const res = await redraw('Screens/BULL.TXT');

  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/not yours/i);
});
