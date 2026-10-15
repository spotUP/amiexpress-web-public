/**
 * "if the sysop changes his mind and wants to entirely remove a screen
 * entirely from the bbs he needs to be able to delete it globally from all
 * themes and the default theme" (sysop, 2026-09-20).
 *
 * The delete that existed took ONE path, which is right for "drop my version
 * of this" and cannot do this: a screen is a name, and the name is on disk as
 * several security variants, in the board's directory, in node and conference
 * directories, and again inside every theme that redrew it. Doing that by
 * hand leaves the copies the sysop did not know about, and a caller is then
 * served art nobody meant to keep.
 *
 * Driven through the HTTP routes, because the plan the sysop confirms and the
 * delete that follows must agree - a plan built one way and a delete that
 * walks the disk another way is two sources of truth over a destructive
 * button.
 */
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
let who: { username: string; secLevel: number };

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

function app() {
  const a = express();
  a.use('/api/screens', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = who;
    next();
  }, express.json({ limit: '8mb' }), screensRouter);
  return a;
}

function theme(slug: string, files: Record<string, string>): void {
  writeTheme(root, {
    slug, title: slug, author: '', owner: 'skope', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'live',
  } as never);
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', slug, rel), body);
  clearThemeRegistryCache();
  invalidateScreenIndex();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-leaves-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();
  invalidateScreenIndex();
  who = { username: 'sysop', secLevel: 255 };

  // The board's own copies: two security variants and a PETSCII one, in the
  // board directory and in a node's.
  write('Screens/BULL.TXT', 'board bulletin\r\n');
  write('Screens/BULL20.TXT', 'level 20 bulletin\r\n');
  write('Screens/BULL.SEQ', 'petscii bulletin\r\n');
  write('Node1/BULL.TXT', "node 1's bulletin\r\n");
  write('Conf1/BULL.TXT', "conference 1's bulletin\r\n");

  // A screen that is NOT this one, however similarly it is spelled.
  write('Screens/BULLETINS.TXT', 'a different screen\r\n');

  // Two live themes that redrew it, and one archived theme that also holds a
  // copy and must be left alone.
  theme('neon', { 'Board/BULL.TXT': 'neon bulletin\r\n' });
  theme('tango', { 'Board/BULL20.TXT': 'tango level 20\r\n' });
  write('Themes/ansiguy.removed-20260915/Board/BULL.TXT', 'archived copy\r\n');
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

const plan = () =>
  request(app()).get('/api/screens/screen-delete-plan').query({ screen: 'BULL' });

test('the plan names every copy the delete would take, before it takes any', async () => {
  const res = await plan();

  expect(res.status).toBe(200);
  const paths = res.body.data.targets.map((t: { path: string }) => t.path).sort();

  expect(paths).toEqual([
    'Conf1/BULL.TXT',
    'Node1/BULL.TXT',
    'Screens/BULL.SEQ',
    'Screens/BULL.TXT',
    'Screens/BULL20.TXT',
    'Themes/neon/Board/BULL.TXT',
    'Themes/tango/Board/BULL20.TXT',
  ]);
  expect(res.body.data.themes).toEqual(['neon', 'tango']);
  // Nothing on this disk is still there afterwards by accident: the file that
  // merely starts with the same letters is a different screen.
  expect(paths).not.toContain('Screens/BULLETINS.TXT');
});

test('an archived theme keeps its copy, and the plan says so', async () => {
  const res = await plan();

  expect(res.body.data.archivedThemesSkipped).toEqual(['ansiguy.removed-20260915']);
  expect(res.body.data.targets.map((t: { path: string }) => t.path))
    .not.toContain('Themes/ansiguy.removed-20260915/Board/BULL.TXT');
});

test('the plan warns that the board asks for this screen on the way in', async () => {
  // BULL is step two of the login walk (login-sequence.ts). Deleting it
  // changes what every caller sees while logging in, which is the difference
  // between a tidy-up and an incident.
  const res = await plan();

  expect(res.body.data.loginStep).toMatchObject({ screen: 'BULL' });
});

test('a screen the login walk never asks for carries no such warning', async () => {
  write('Screens/NEWS.TXT', 'news\r\n');
  invalidateScreenIndex();

  const res = await request(app())
    .get('/api/screens/screen-delete-plan').query({ screen: 'NEWS' });

  expect(res.body.data.loginStep).toBeNull();
});

test('the delete takes exactly what the plan named, and backs each one up', async () => {
  const intended = (await plan()).body.data.targets.map((t: { path: string }) => t.path);

  const res = await request(app()).delete('/api/screens/screen').query({ screen: 'BULL' });

  expect(res.status).toBe(200);
  expect(res.body.data.deleted.sort()).toEqual([...intended].sort());
  for (const rel of intended) {
    expect(fs.existsSync(path.join(root, rel))).toBe(false);
    expect(fs.existsSync(path.join(root, `${rel}.backup`))).toBe(true);
  }
  // Left standing: the archived theme's copy and the differently-named screen.
  expect(fs.existsSync(path.join(root, 'Themes/ansiguy.removed-20260915/Board/BULL.TXT'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'Screens/BULLETINS.TXT'))).toBe(true);
});

test('what pulled it in is reported, and mended only when asked', async () => {
  write('Screens/Node/LOGON20.TXT', '~SS_BBS:Screens/BULL.TXT\r\nwelcome\r\n');
  invalidateScreenIndex();

  const before = await plan();
  expect(before.body.data.references.map((r: { from: string }) => r.from))
    .toContain('Screens/Node/LOGON20.TXT');
  expect(before.body.data.removableReferences).toBe(1);

  const res = await request(app()).delete('/api/screens/screen').query({ screen: 'BULL' });

  // Default is off: the include line is still there, and the sysop was told.
  expect(res.body.data.fixed).toEqual([]);
  expect(fs.readFileSync(path.join(root, 'Screens/Node/LOGON20.TXT'), 'latin1'))
    .toContain('~SS_BBS:Screens/BULL.TXT');
});

test('asked to mend, it drops the lines that exist only to make the include', async () => {
  write('Screens/Node/LOGON20.TXT', '~SS_BBS:Screens/BULL.TXT\r\nwelcome\r\n');
  invalidateScreenIndex();

  await request(app())
    .delete('/api/screens/screen').query({ screen: 'BULL', fixReferences: '1' });

  const logon = fs.readFileSync(path.join(root, 'Screens/Node/LOGON20.TXT'), 'latin1');
  expect(logon).not.toContain('~SS_BBS:Screens/BULL.TXT');
  expect(logon).toContain('welcome');
});

test('it refuses a path, because a file already has its own delete', async () => {
  const res = await request(app())
    .delete('/api/screens/screen').query({ screen: 'Screens/BULL.TXT' });

  expect(res.status).toBe(400);
  expect(fs.existsSync(path.join(root, 'Screens/BULL.TXT'))).toBe(true);
});

test('an artist cannot delete a screen out of every theme', async () => {
  // `mayWriteScreen` guards one path at a time; this one crosses every
  // theme at once, including other artists'. Sysop only.
  who = { username: 'skope', secLevel: 100 };

  const res = await request(app()).delete('/api/screens/screen').query({ screen: 'BULL' });

  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(fs.existsSync(path.join(root, 'Screens/BULL.TXT'))).toBe(true);
});

test('a screen that is not there is a 404, not a silent success', async () => {
  const res = await request(app()).delete('/api/screens/screen').query({ screen: 'NOSUCH' });

  expect(res.status).toBe(404);
});
