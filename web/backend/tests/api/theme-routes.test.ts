/**
 * SP6's backend: what a sysop and an artist may do to the registry.
 *
 * Real HTTP against the real router. The rules here are the same ones the
 * loader and the sandbox enforce - this file's job is to prove the admin
 * cannot offer something the board would then refuse.
 */
process.env.SKIP_DB_INIT = '1';

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

import { config } from '../../src/config';
import { clearThemeRegistryCache, readThemeRegistry, writeTheme } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;

function app(user: { username: string; secLevel: number }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as express.Request & { user?: unknown }).user = { ...user, userId: '1' };
    next();
  });
  const { themesRouter } = require('../../src/api/theme-routes');
  a.use('/api/themes', themesRouter);
  return a;
}

const sysop = { username: 'sysop', secLevel: 255 };
const artist = { username: 'skope', secLevel: 100 };
const stranger = { username: 'lamer', secLevel: 100 };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-routes-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  clearThemeRegistryCache();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function seed(slug: string, over: Record<string, unknown> = {}): void {
  writeTheme(root, {
    slug, title: slug, author: '', owner: 'skope', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'draft', ...over,
  } as never);
  clearThemeRegistryCache();
}

describe('creating a theme', () => {
  it('makes the registry entry and the directories an artist will fill', async () => {
    const res = await request(app(sysop))
      .post('/api/themes')
      .send({ slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope', widths: [80, 40] });

    expect(res.status).toBe(200);
    clearThemeRegistryCache();
    const theme = readThemeRegistry(root).themes.find(t => t.slug === 'neon');
    expect(theme).toMatchObject({ title: 'Neon', owner: 'skope', dir: 'Themes/neon', widths: [80, 40] });
    for (const scope of ['Node', 'Board', 'Conf', 'Files']) {
      expect(fs.existsSync(path.join(root, 'Themes', 'neon', scope))).toBe(true);
    }
  });

  it('is a draft however it is asked for - a live theme with no screens is a caller wearing nothing', async () => {
    await request(app(sysop)).post('/api/themes').send({ slug: 'neon', status: 'live' });
    clearThemeRegistryCache();
    expect(readThemeRegistry(root).themes[0].status).toBe('draft');
  });

  it('is refused to anybody but a sysop', async () => {
    // An account that could name itself the owner of a new theme could grant
    // itself a writable directory: the sandbox, handed out by the sandboxed.
    const res = await request(app(artist)).post('/api/themes').send({ slug: 'neon', owner: 'skope' });
    expect(res.status).toBe(403);
  });

  it('refuses a slug that cannot be a directory name, and a duplicate', async () => {
    expect((await request(app(sysop)).post('/api/themes').send({ slug: 'Neon Lights' })).status).toBe(400);
    expect((await request(app(sysop)).post('/api/themes').send({ slug: '../escape' })).status).toBe(400);
    expect((await request(app(sysop)).post('/api/themes').send({ slug: 'default' })).status).toBe(400);

    await request(app(sysop)).post('/api/themes').send({ slug: 'neon' });
    clearThemeRegistryCache();
    expect((await request(app(sysop)).post('/api/themes').send({ slug: 'neon' })).status).toBe(409);
  });
});

describe('editing a theme', () => {
  it('lets its owner change what it says about itself', async () => {
    seed('neon');
    const res = await request(app(artist))
      .put('/api/themes/neon')
      .send({ title: 'Neon Redux', author: 'Skope', widths: [80, 40] });

    expect(res.status).toBe(200);
    clearThemeRegistryCache();
    expect(readThemeRegistry(root).themes[0]).toMatchObject({ title: 'Neon Redux', widths: [80, 40] });
  });

  it('lets its owner send it for review but not make it live', async () => {
    seed('neon');
    expect((await request(app(artist)).put('/api/themes/neon').send({ status: 'review' })).status).toBe(200);
    clearThemeRegistryCache();
    const res = await request(app(artist)).put('/api/themes/neon').send({ status: 'live' });
    expect(res.status).toBe(403);
    clearThemeRegistryCache();
    expect(readThemeRegistry(root).themes[0].status).toBe('review');
  });

  it('does not let an artist hand their theme to somebody else, or take one', async () => {
    seed('neon');
    expect((await request(app(artist)).put('/api/themes/neon').send({ owner: 'lamer' })).status).toBe(403);
    expect((await request(app(stranger)).put('/api/themes/neon').send({ title: 'mine now' })).status).toBe(403);
  });

  it('lets a sysop publish it', async () => {
    seed('neon');
    expect((await request(app(sysop)).put('/api/themes/neon').send({ status: 'live' })).status).toBe(200);
  });
});

describe('the board default', () => {
  it('must be a theme callers can actually wear', async () => {
    seed('neon', { status: 'draft' });
    const refused = await request(app(sysop)).post('/api/themes/default').send({ slug: 'neon' });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/only a live theme/i);

    await request(app(sysop)).put('/api/themes/neon').send({ status: 'live' });
    clearThemeRegistryCache();
    expect((await request(app(sysop)).post('/api/themes/default').send({ slug: 'neon' })).status).toBe(200);
    clearThemeRegistryCache();
    expect(readThemeRegistry(root).defaultSlug).toBe('neon');
  });

  it('can always go back to the board own screens', async () => {
    expect((await request(app(sysop)).post('/api/themes/default').send({ slug: 'default' })).status).toBe(200);
  });

  it('is a sysop decision', async () => {
    seed('neon', { status: 'live' });
    expect((await request(app(artist)).post('/api/themes/default').send({ slug: 'neon' })).status).toBe(403);
  });
});

describe('the list a page renders', () => {
  it('says what THIS account may do with each theme, rather than leaving the page to guess', async () => {
    seed('mine', { owner: 'skope', status: 'draft' });
    seed('theirs', { owner: 'other', status: 'draft' });
    seed('published', { owner: 'other', status: 'live' });
    fs.mkdirSync(path.join(root, 'Themes', 'mine', 'Board'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Themes', 'mine', 'Board', 'BULL.TXT'), 'art');

    const res = await request(app(artist)).get('/api/themes');
    const byslug = Object.fromEntries(
      (res.body.data.themes as Array<Record<string, unknown>>).map(t => [t.slug, t])
    );

    expect(byslug.mine).toMatchObject({ mine: true, writable: true, wearable: true, screens: 1 });
    expect(byslug.theirs).toMatchObject({ mine: false, writable: false, wearable: false });
    expect(byslug.published).toMatchObject({ mine: false, writable: false, wearable: true });
    expect(res.body.data.canCreate).toBe(false);
  });

  it('tells a sysop they may create, and shows them everything', async () => {
    seed('theirs', { owner: 'other', status: 'draft' });
    const res = await request(app(sysop)).get('/api/themes');
    expect(res.body.data.canCreate).toBe(true);
    expect(res.body.data.themes[0]).toMatchObject({ writable: true, wearable: true });
  });
});

describe('starting a theme screen from the board', () => {
  const { themeTargetFor } = require('../../src/api/theme-routes');

  it('translates a board path into the theme SCOPE, not a mirror of the directory', () => {
    // The tree is keyed on the scope the loader computes; a node's directory
    // is whatever its SCREENS tooltype says and a conference's is what
    // LOCATION.n names, so mirroring those names would break on a renumber.
    expect(themeTargetFor('Screens/BULL.TXT')).toBe('Board/BULL.TXT');
    expect(themeTargetFor('BULL.TXT')).toBe('Board/BULL.TXT');
    expect(themeTargetFor('Conf1/MENU250.TXT')).toBe('Conf/1/MENU250.TXT');
    expect(themeTargetFor('Conf2/Screens/MENU.TXT')).toBe('Conf/2/MENU.TXT');
    expect(themeTargetFor('Node3/LOGON.txt')).toBe('Node/LOGON.txt');
    expect(themeTargetFor('Node3/Screens/LOGON.txt')).toBe('Node/LOGON.txt');
  });

  it('keeps anything reached by PATH under Files/, which is the mirror those arms read', () => {
    expect(themeTargetFor('Conf1/Screens/Bulletins/Bull3.txt')).toBe('Files/Conf1/Screens/Bulletins/Bull3.txt');
    expect(themeTargetFor('Screens/reference-board/001.txt')).toBe('Files/Screens/reference-board/001.txt');
  });

  it('refuses to climb out of the board', () => {
    expect(themeTargetFor('../../etc/passwd')).toBeNull();
    expect(themeTargetFor('')).toBeNull();
  });

  it('copies the board bytes in, so the artist starts from what callers see', async () => {
    seed('neon');
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    // High-bit Amiga art: the copy must be bytes, never a text round trip.
    fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0x0a]));

    const res = await request(app(artist)).post('/api/themes/neon/copy').send({ path: 'Screens/BULL.TXT' });

    expect(res.status).toBe(200);
    const copied = fs.readFileSync(path.join(root, 'Themes', 'neon', 'Board', 'BULL.TXT'));
    expect([...copied]).toEqual([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0x0a]);
  });

  it('will not overwrite what the artist has already drawn', async () => {
    seed('neon');
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), 'the board');
    fs.mkdirSync(path.join(root, 'Themes', 'neon', 'Board'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Themes', 'neon', 'Board', 'BULL.TXT'), 'the artist');

    const res = await request(app(artist)).post('/api/themes/neon/copy').send({ path: 'Screens/BULL.TXT' });

    expect(res.status).toBe(409);
    expect(fs.readFileSync(path.join(root, 'Themes', 'neon', 'Board', 'BULL.TXT'), 'utf8')).toBe('the artist');
  });

  it("is refused for somebody else's theme", async () => {
    seed('neon', { owner: 'other' });
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Screens', 'BULL.TXT'), 'the board');

    expect((await request(app(artist)).post('/api/themes/neon/copy').send({ path: 'Screens/BULL.TXT' })).status).toBe(403);
  });

  it('says so when the board has no such screen', async () => {
    seed('neon');
    expect((await request(app(artist)).post('/api/themes/neon/copy').send({ path: 'Screens/NOPE.TXT' })).status).toBe(404);
  });
});
