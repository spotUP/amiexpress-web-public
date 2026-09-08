/**
 * A new theme starts as a copy of the board, owned by a real account.
 *
 * Creating one used to make three empty directories - the copy route's own
 * comment said so: "without this a new theme is a set of empty directories
 * with nothing to open". The sysop asked for the obvious thing: "all new
 * themes should be a copy of the default theme", `default` being the board
 * itself.
 *
 * And ownership is not a label. `theme-sandbox` grants write access by
 * matching the owner against the caller's account, so an owner the board does
 * not have is a theme its artist cannot open.
 */
process.env.SKIP_DB_INIT = '1';

const users: Array<{ username: string }> = [{ username: 'sysop' }, { username: 'skope' }, { username: 'Tango' }];
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
const themeFile = (slug: string, rel: string) => path.join(root, 'Themes', slug, rel);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'new-theme-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  who = { username: 'sysop', secLevel: 255 };

  // A board with a plain screen, a screen that has a SECURITY VARIANT, and a
  // node screen every node carries a copy of.
  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  write('Screens/BULL255.TXT', 'the sysop bulletin\r\n');
  write('Node1/BBSTITLE.txt', 'the title\r\n');
  write('Node2/BBSTITLE.txt', 'the title\r\n');
  write('Screens/BULL.TXT.bak', 'an old copy nobody edits\r\n');
  // The achievements bulletin: written by the board every fifteen minutes,
  // with an art slot beside it.
  write('Screens/AchieveTop.txt', 'the leaderboards as they stood at 08:41\r\n');
  write('Screens/AchieveTop.Header', 'the board own masthead\r\n');

  clearThemeRegistryCache();
  invalidateScreenIndex();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

const create = (body: Record<string, unknown>) =>
  request(app()).post('/api/themes').send({ slug: 'neon', title: 'Neon', widths: [80], ...body });

test('a new theme carries the board\'s screens, not three empty directories', async () => {
  const res = await create({ owner: 'skope' });

  expect(res.status).toBe(200);
  expect(fs.readFileSync(themeFile('neon', path.join('Board', 'BULL.TXT')), 'latin1')).toBe('the board bulletin\r\n');
  expect(fs.readFileSync(themeFile('neon', path.join('Node', 'BBSTITLE.txt')), 'latin1')).toBe('the title\r\n');
  expect(res.body.data.seeded.copied).toBeGreaterThan(0);
  expect(res.body.message).toMatch(/copied from the board/);
});

test('the security variants come too, so the theme is publishable the day it is made', async () => {
  await create({ owner: 'skope' });

  // Rule 5: a theme with BULL.TXT and no BULL255.TXT shadows the board's
  // sysop bulletin, and the publish gate refuses it.
  expect(fs.existsSync(themeFile('neon', path.join('Board', 'BULL255.TXT')))).toBe(true);

  const theme = readThemeRegistry(root).themes.find(t => t.slug === 'neon')!;
  const report = validateTheme(root, theme);
  expect(report.blocking.map(f => f.rule)).not.toContain('shadows-security-variant');
  expect(report.publishable).toBe(true);
});

test('every node\'s copy collapses into the theme\'s one Node screen', async () => {
  await create({ owner: 'skope' });

  // The theme applies to the whole board: one Node/BBSTITLE.txt, not one per node.
  expect(fs.readdirSync(themeFile('neon', 'Node')).filter(n => /^BBSTITLE/i.test(n))).toEqual(['BBSTITLE.txt']);
});

test('a leftover the board does not read is not copied', async () => {
  await create({ owner: 'skope' });

  expect(fs.existsSync(themeFile('neon', path.join('Board', 'BULL.TXT.bak')))).toBe(false);
});

/**
 * A theme copy WINS the global screen walk, so a copy of a file the board
 * rewrites every fifteen minutes freezes it at the moment the theme was made.
 * Measured on the live board 2026-09-08: the sysop seeded a theme a minute
 * after the first achievements bulletin appeared and the leaderboards stopped
 * moving.
 */
test('the achievements bulletin is not copied - the board rewrites it', async () => {
  await create({ owner: 'skope' });

  expect(fs.existsSync(themeFile('neon', path.join('Board', 'AchieveTop.txt')))).toBe(false);
});

/**
 * Its art slot is not a screen either way, and that is right rather than a
 * gap: the board produces ONE bulletin, so its furniture is the board's, not
 * per-theme. An artist who wants the leaderboards drawn their way edits the
 * board's slot.
 */
test('its art slot stays with the board - one bulletin, one set of furniture', async () => {
  await create({ owner: 'skope' });

  expect(fs.existsSync(themeFile('neon', path.join('Board', 'AchieveTop.Header')))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'Screens', 'AchieveTop.Header'), 'latin1'))
    .toBe('the board own masthead\r\n');
});

test('an owner the board does not have is refused, and no theme is made', async () => {
  const res = await create({ owner: 'nosuchuser' });

  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/no account called "nosuchuser"/i);
  expect(readThemeRegistry(root).themes.some(t => t.slug === 'neon')).toBe(false);
  expect(fs.existsSync(path.join(root, 'Themes', 'neon'))).toBe(false);
});

test('the owner is stored as the board spells it, whatever case the sysop typed', async () => {
  const res = await create({ slug: 'tangos', title: 'Tangos', owner: 'TANGO' });

  expect(res.status).toBe(200);
  expect(readThemeRegistry(root).themes.find(t => t.slug === 'tangos')!.owner).toBe('Tango');
});

test('no owner still means sysops only', async () => {
  const res = await create({ owner: '' });

  expect(res.status).toBe(200);
  expect(readThemeRegistry(root).themes.find(t => t.slug === 'neon')!.owner).toBe('');
});

test('a board whose user list cannot be read still lets a sysop assign an owner', async () => {
  // No opinion is not a refusal: a fresh board, or one whose user.data is
  // momentarily unreadable, must not lock the sysop out of naming an artist.
  const saved = users.splice(0, users.length);
  try {
    const res = await create({ slug: 'blind', title: 'Blind', owner: 'someone-new' });
    expect(res.status).toBe(200);
    expect(readThemeRegistry(root).themes.find(t => t.slug === 'blind')!.owner).toBe('someone-new');
  } finally {
    users.push(...saved);
  }
});

test('a sysop reassigning ownership is held to the same rule', async () => {
  await create({ owner: 'skope' });

  const bad = await request(app()).put('/api/themes/neon').send({ owner: 'ghost' });
  expect(bad.status).toBe(400);
  expect(readThemeRegistry(root).themes.find(t => t.slug === 'neon')!.owner).toBe('skope');

  const good = await request(app()).put('/api/themes/neon').send({ owner: 'Tango' });
  expect(good.status).toBe(200);
  expect(readThemeRegistry(root).themes.find(t => t.slug === 'neon')!.owner).toBe('Tango');
});

test('an artist still gets their own name, and cannot name somebody else', async () => {
  who = { username: 'skope', secLevel: 100 };

  const res = await create({ slug: 'skopes', title: 'Skopes', owner: 'Tango' });

  expect(res.status).toBe(200);
  expect(readThemeRegistry(root).themes.find(t => t.slug === 'skopes')!.owner).toBe('skope');
});
