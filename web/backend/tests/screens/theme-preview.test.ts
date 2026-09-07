/**
 * SP6's preview: what a caller in that theme, at that level, would be shown.
 *
 * Driven through the mounted router, because the point of the route is that it
 * runs the BOARD's resolver and the BOARD's MCI parser rather than a second
 * copy of either. A test that called `loadScreenFile` directly would prove
 * nothing about the answer a sysop gets.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

const processCommand = jest.fn(async () => true);
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: (...args: unknown[]) => processCommand(...(args as [])),
}));

import { config } from '../../src/config';
import { screensRouter } from '../../src/api/screens-routes';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;
let who: { username: string; secLevel: number };

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

function theme(slug: string, files: Record<string, string>, over: Record<string, unknown> = {}): void {
  writeTheme(root, {
    slug, title: slug, author: '', owner: '', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'live', ...over,
  } as never);
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', slug, rel), body);
  clearThemeRegistryCache();
}

function app() {
  const a = express();
  a.use('/api/screens', (req, _res, next) => {
    (req as unknown as { user: unknown }).user = who;
    next();
  }, express.json(), screensRouter);
  return a;
}

const decoded = (body: { data: { content: string } }) =>
  Buffer.from(body.data.content, 'base64').toString('latin1');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-preview-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();
  processCommand.mockClear();
  who = { username: 'sysop', secLevel: 255 };

  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  write('Node1/LOGON.txt', 'the board logon\r\n');
  write('Node1/Logon100.txt', 'the board sysop logon\r\n');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

test('previews the theme file a caller wearing that theme would be served', async () => {
  theme('neon', { 'Board/BULL.TXT': 'the neon bulletin\r\n' });

  const res = await request(app()).get('/api/screens/preview').query({ screen: 'BULL', theme: 'neon' });

  expect(res.status).toBe(200);
  expect(res.body.data.theme).toBe('neon');
  expect(res.body.data.filePath).toBe(path.join('Themes', 'neon', 'Board', 'BULL.TXT'));
  expect(decoded(res.body)).toContain('the neon bulletin');
});

test('with no theme it previews exactly what the board serves today', async () => {
  theme('neon', { 'Board/BULL.TXT': 'the neon bulletin\r\n' });

  const res = await request(app()).get('/api/screens/preview').query({ screen: 'BULL' });

  expect(res.body.data.theme).toBe('default');
  expect(decoded(res.body)).toContain('the board bulletin');
});

test('a previewed ~CC_ names the command and does not run it', async () => {
  // A preview must not launch a door. `parseMciCodes` executes only when it is
  // handed a socket, and the preview hands it none.
  theme('neon', { 'Board/BULL.TXT': '~CC_BULL|\r\n' });

  const res = await request(app()).get('/api/screens/preview').query({ screen: 'BULL', theme: 'neon' });

  expect(res.status).toBe(200);
  expect(res.body.data.commands).toContain('BULL');
  expect(processCommand).not.toHaveBeenCalled();
});

test('a security level above the requester own is clamped down to it', async () => {
  who = { username: 'artist', secLevel: 20 };

  const res = await request(app()).get('/api/screens/preview').query({ screen: 'LOGON', sec: 255 });

  expect(res.body.data.secLevel).toBe(20);
  // The board's sysop-only logon is content this account is never served, and
  // a preview is not the way around that.
  expect(decoded(res.body)).toContain('the board logon');
  expect(decoded(res.body)).not.toContain('the board sysop logon');
});

test('a sysop previewing a draft at a low level still sees the draft', async () => {
  // Two questions at once: "may this ACCOUNT look at it" is answered with the
  // requester's real level, and "what would a level-20 caller see" with the
  // clamped one. The second must not answer the first.
  theme('neon', { 'Board/BULL.TXT': 'the neon bulletin\r\n' }, { status: 'draft', owner: 'skope' });

  const res = await request(app()).get('/api/screens/preview').query({ screen: 'BULL', theme: 'neon', sec: 20 });

  expect(res.body.data.theme).toBe('neon');
  expect(decoded(res.body)).toContain('the neon bulletin');
});

test('an artist cannot preview somebody else unpublished theme', async () => {
  who = { username: 'lamer', secLevel: 100 };
  theme('neon', { 'Board/BULL.TXT': 'the neon bulletin\r\n' }, { status: 'draft', owner: 'skope' });

  const res = await request(app()).get('/api/screens/preview').query({ screen: 'BULL', theme: 'neon' });

  expect(res.body.data.theme).toBe('default');
  expect(decoded(res.body)).toContain('the board bulletin');
});

test('a screen that resolves nowhere is a 404, not an empty preview', async () => {
  const res = await request(app()).get('/api/screens/preview').query({ screen: 'NOSUCHSCREEN' });

  expect(res.status).toBe(404);
});

/**
 * Previewing the WIDE PETSCII screen (petscii80, 2026-09-07).
 *
 * `?term=petscii` answered 40 columns for every PETSCII request, so what a
 * `P8` caller is served could not be judged from the admin at all - only by
 * logging in as one. The observable difference is which FILE answers: a
 * `.seq` is 40-column art the sysop drew, and an 80-column caller is served
 * the ordinary screen instead (handlers/screen.handler.ts servesPetsciiArt).
 */
test('previews the file each PETSCII width is really served', async () => {
  write('Screens/BULL.TXT', 'the eighty-column bulletin\r\n');
  // A `.seq` beside it: 40-column art, raw PETSCII bytes.
  fs.writeFileSync(path.join(root, 'Screens', 'BULL.SEQ'), Buffer.from([0x93, 0x0e, 0x48, 0x49, 0x0d]));

  const c64 = await request(app()).get('/api/screens/preview').query({ screen: 'BULL', term: 'petscii' });
  const wide = await request(app()).get('/api/screens/preview').query({ screen: 'BULL', term: 'petscii80' });

  expect([c64.status, wide.status]).toEqual([200, 200]);

  // The C64 gets the art...
  expect(c64.body.data.isPetscii).toBe(true);
  expect(String(c64.body.data.filePath).toUpperCase()).toContain('BULL.SEQ');

  // ...and the wide screen gets the screen every 80-column caller gets.
  expect(wide.body.data.isPetscii).toBe(false);
  expect(String(wide.body.data.filePath).toUpperCase()).toContain('BULL.TXT');
  expect(decoded(wide.body)).toContain('the eighty-column bulletin');
});
