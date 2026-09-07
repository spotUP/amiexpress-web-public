/**
 * A theme that was valid when it went live, and is wrong now.
 *
 * Publication is gated, and that gate was the whole of the checking: the
 * themes plan recorded this as knowingly undone - "a sysop who adds a
 * security variant to the BOARD after a theme has gone live re-opens the
 * shadowing hole, because nothing revalidates a live theme. The spec names
 * the index rebuild as the hook; it is not wired."
 *
 * The security walk finishes INSIDE the theme before the board is tried, so a
 * theme carrying a base BULL.TXT shadows a BULL255.TXT the sysop adds
 * afterwards, and the sysop gets the ordinary bulletin instead of
 * the one written for them. Nothing said so.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { themesRouter } from '../../src/api/theme-routes';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';
import { getScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { liveThemeRegressions, clearLiveThemeCache } from '../../src/screens/theme-live-check';

let root: string;
let previousDataDir: string;

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

function app() {
  const a = express();
  a.use('/api/themes', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = { username: 'sysop', secLevel: 255 };
    next();
  }, express.json(), themesRouter);
  return a;
}

/** A theme that is LIVE and carries a base BULL for the whole board. */
function liveTheme(status: 'live' | 'draft' = 'live'): void {
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: 'skope', owner: 'skope', dir: 'Themes/neon',
    widths: [80], doorTheme: '', status,
  } as never);
  write('Themes/neon/Board/BULL.TXT', 'the neon bulletin\r\n');
  clearThemeRegistryCache();
  invalidateScreenIndex();
  clearLiveThemeCache();
}

const reports = () => liveThemeRegressions(root, getScreenIndex(root).builtAt);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-theme-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();
  invalidateScreenIndex();
  clearLiveThemeCache();

  write('Screens/BULL.TXT', 'the board bulletin\r\n');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
  clearLiveThemeCache();
});

test('a live theme with nothing wrong is reported as nothing wrong', () => {
  liveTheme();

  expect(reports()).toEqual([]);
});

test('adding a security variant to the board makes the live theme shadow it', () => {
  liveTheme();
  expect(reports()).toEqual([]);

  // The sysop writes a sysop-only logon, months after the theme went live.
  write('Screens/BULL255.TXT', 'the sysop bulletin\r\n');
  invalidateScreenIndex();
  clearLiveThemeCache();

  const found = reports();

  expect(found).toHaveLength(1);
  expect(found[0].slug).toBe('neon');
  expect(found[0].blocking.map(f => f.rule)).toContain('shadows-security-variant');
});

test('a DRAFT theme is not reported: it serves nobody', () => {
  liveTheme('draft');
  write('Screens/BULL255.TXT', 'the sysop bulletin\r\n');
  invalidateScreenIndex();
  clearLiveThemeCache();

  expect(reports()).toEqual([]);
});

test('the themes list tells the sysop which live theme went wrong', async () => {
  liveTheme();
  write('Screens/BULL255.TXT', 'the sysop bulletin\r\n');
  invalidateScreenIndex();
  clearLiveThemeCache();

  const res = await request(app()).get('/api/themes');

  const neon = res.body.data.themes.find((t: { slug: string }) => t.slug === 'neon');
  expect(neon.regressed).not.toBeNull();
  expect(neon.regressed.blocking).toBeGreaterThan(0);
  expect(String(neon.regressed.first)).toBeTruthy();
});

test('a healthy live theme carries no regression in the list', async () => {
  liveTheme();

  const res = await request(app()).get('/api/themes');

  const neon = res.body.data.themes.find((t: { slug: string }) => t.slug === 'neon');
  expect(neon.regressed).toBeNull();
});
