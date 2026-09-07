/**
 * SP2's second half: the arms of `loadScreenFile` that never reach
 * `screenSearchLocations`.
 *
 * A bulletin arrives as an ABSOLUTE path - `_displayBulletin` runs the
 * security walk against the conference's own directory and hands the loader
 * the path it found (`display-file-commands.handler.ts:656-668`). `~SS_`
 * hands over an Amiga assign, and `~SR_` resolves one to an absolute path
 * before it does the same. All three push onto `paths[]` and are tried past
 * the directory list, so a themed board served the BOARD's bulletins and the
 * BOARD's pool art no matter what the artist had drawn.
 *
 * The answer is `Themes/<slug>/Files/`, a verbatim mirror of the board root,
 * offered ahead of each candidate. Driven through `displayScreen` - the
 * product's own entry point - because a test that calls the resolver proves
 * the directory list and nothing about what a caller is shown.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { displayScreen } from '../../src/handlers/screen.handler';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;

function socket(emits: Array<{ event: string; data: unknown }>) {
  return {
    id: `theme-files-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: unknown) => emits.push({ event, data }),
    on: () => {},
  } as never;
}

const painted = (emits: Array<{ event: string; data: unknown }>) =>
  emits.filter(e => e.event === 'ansi-output').map(e => String(e.data)).join('');

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

function theme(slug: string, files: Record<string, string>): void {
  writeTheme(root, {
    slug, title: slug, author: '', owner: '', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'live',
  });
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', slug, rel), body);
  clearThemeRegistryCache();
}

const caller = (over: Record<string, unknown> = {}) => ({
  nodeId: 1,
  relConfNum: 1,
  user: { username: 'lamer', secLevel: 20, ...over },
}) as never;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-files-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();

  // The board's own art, in the shapes the three arms reach it by.
  write('Conf1/Bulletins/Bull3.txt', 'the board bulletin three\r\n');
  write('Screens/subhead.txt', 'the board subhead\r\n');
  write('Screens/pool/001.art.txt', 'the board pool art\r\n');
  write('Screens/neonhead.txt', 'the board neonhead\r\n');
  // express.e:6800-6806 - MCI runs only when the file's FIRST byte is `~`.
  write('Screens/BULL.TXT', '~SS_BBS:Screens/subhead.txt|board bull\r\n');
  write('Screens/ONENODE.TXT', '~1SR_BBS:Screens/pool/art.txt|\r\n');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a themed caller reading a bulletin by absolute path gets the THEME bulletin', async () => {
  theme('neon', { 'Files/Conf1/Bulletins/Bull3.txt': 'the neon bulletin three\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(
    socket(emits),
    caller({ screenTheme: 'neon' }),
    path.join(root, 'Conf1', 'Bulletins', 'Bull3.txt'),
  );

  expect(painted(emits)).toContain('the neon bulletin three');
  expect(painted(emits)).not.toContain('the board bulletin three');
});

test('a bulletin the theme does not carry is still the board bulletin', async () => {
  theme('neon', { 'Files/Screens/subhead.txt': 'the neon subhead\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(
    socket(emits),
    caller({ screenTheme: 'neon' }),
    path.join(root, 'Conf1', 'Bulletins', 'Bull3.txt'),
  );

  expect(painted(emits)).toContain('the board bulletin three');
});

test('a caller with no theme reads the board bulletin, as they always did', async () => {
  theme('neon', { 'Files/Conf1/Bulletins/Bull3.txt': 'the neon bulletin three\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(socket(emits), caller(), path.join(root, 'Conf1', 'Bulletins', 'Bull3.txt'));

  expect(painted(emits)).toContain('the board bulletin three');
  expect(painted(emits)).not.toContain('the neon bulletin three');
});

test('~SS_ from a themed screen finds the theme Files mirror', async () => {
  theme('neon', { 'Files/Screens/subhead.txt': 'the neon subhead\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(socket(emits), caller({ screenTheme: 'neon' }), 'BULL');

  expect(painted(emits)).toContain('the neon subhead');
  expect(painted(emits)).not.toContain('the board subhead');
});

test('~SS_ falls through to the board when the theme carries no mirror', async () => {
  // The theme's OWN bull runs - it includes a different board file - and the
  // include lands on the board's copy, because the theme has no mirror of it.
  theme('neon', { 'Board/BULL.TXT': '~SS_BBS:Screens/neonhead.txt|\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(socket(emits), caller({ screenTheme: 'neon' }), 'BULL');

  expect(painted(emits)).toContain('the board neonhead');
  expect(painted(emits)).not.toContain('the board subhead');
});

test('a ~SR_ pool member the theme carries is the theme file; the rest stay the board pool', async () => {
  // Width 1 makes the draw deterministic: express.e picks 1..maxCount, and
  // maxCount is the width, so a one-member pool always draws member one.
  theme('neon', { 'Files/Screens/pool/001.art.txt': 'the neon pool art\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(socket(emits), caller({ screenTheme: 'neon' }), 'ONENODE');

  expect(painted(emits)).toContain('the neon pool art');
  expect(painted(emits)).not.toContain('the board pool art');
});

test('a ~SR_ member the theme does not carry is drawn from the board pool', async () => {
  theme('neon', { 'Files/Screens/subhead.txt': 'the neon subhead\r\n' });

  const emits: Array<{ event: string; data: unknown }> = [];
  await displayScreen(socket(emits), caller({ screenTheme: 'neon' }), 'ONENODE');

  expect(painted(emits)).toContain('the board pool art');
});
