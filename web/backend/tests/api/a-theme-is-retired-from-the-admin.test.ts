/**
 * DELETE /api/themes/:slug - the retirement the board already told artists to do.
 *
 * `POST /themes` refuses a sixth theme with "You already own 5 themes - retire
 * one before starting another". Nothing could retire one. This is that route.
 *
 * The art is MOVED ASIDE, never removed: a theme directory holds somebody's
 * drawings and this is one click in an admin page. `Themes/<slug>` becomes
 * `Themes/<slug>.removed-YYYYMMDD`, which is the convention the live volume
 * already uses and which one `mv` undoes.
 */
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { themesRouter } from '../../src/api/theme-routes';
import { clearThemeRegistryCache, readThemeRegistry, setDefaultTheme, writeTheme } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;
let who: { username?: string; secLevel?: number };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-delete-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  clearThemeRegistryCache();
  who = { username: 'sysop', secLevel: 255 };
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
});

const theme = (slug: string, owner = '') => {
  writeTheme(root, {
    slug, title: slug.toUpperCase(), author: owner, owner,
    dir: `Themes/${slug}`, widths: [80], doorTheme: '', status: 'live',
  });
  fs.mkdirSync(path.join(root, 'Themes', slug, 'Files', 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Themes', slug, 'Files', 'Screens', 'LOGON.TXT'), 'art', 'latin1');
};

const app = () => {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as unknown as { user: unknown }).user = who; next(); });
  a.use('/api/themes', themesRouter);
  return a;
};

const slugs = () => readThemeRegistry(root).themes.map(t => t.slug).sort();

it('retires a theme and moves its art aside', async () => {
  theme('neon');

  const res = await request(app()).delete('/api/themes/neon');

  expect(res.status).toBe(200);
  expect(slugs()).toEqual([]);
  expect(fs.existsSync(path.join(root, 'Themes', 'neon'))).toBe(false);
  const aside = fs.readdirSync(path.join(root, 'Themes')).find(d => d.startsWith('neon.removed-'));
  expect(aside).toBeDefined();
  // The drawings are still there, one `mv` from coming back.
  expect(fs.readFileSync(path.join(root, 'Themes', aside!, 'Files', 'Screens', 'LOGON.TXT'), 'latin1'))
    .toBe('art');
});

it('refuses the board own screens', async () => {
  const res = await request(app()).delete('/api/themes/default');

  expect(res.status).toBe(400);
});

it('refuses while the theme is the board default', async () => {
  theme('neon');
  setDefaultTheme(root, 'neon');

  const res = await request(app()).delete('/api/themes/neon');

  expect(res.status).toBe(409);
  expect(slugs()).toEqual(['neon']);
  expect(fs.existsSync(path.join(root, 'Themes', 'neon'))).toBe(true);
});

it('lets an artist retire their OWN theme', async () => {
  theme('neon', 'spot');
  who = { username: 'spot', secLevel: 100 };

  const res = await request(app()).delete('/api/themes/neon');

  expect(res.status).toBe(200);
  expect(slugs()).toEqual([]);
});

it('refuses to let an artist retire somebody else theme', async () => {
  // The create path is careful that naming another owner would hand out write
  // access to a directory; deleting one is the same question with a worse
  // answer.
  theme('neon', 'someone-else');
  who = { username: 'spot', secLevel: 100 };

  const res = await request(app()).delete('/api/themes/neon');

  expect(res.status).toBe(403);
  expect(slugs()).toEqual(['neon']);
});

it('answers 404 for a theme that is not there', async () => {
  const res = await request(app()).delete('/api/themes/ghost');

  expect(res.status).toBe(404);
});
