/**
 * SP4, the part that matters: a caller wearing a theme is SERVED the theme's
 * screen, through the real loader.
 *
 * The resolver tests prove the directory list; they would all pass on a board
 * where nothing ever passes a theme to it. This drives `displayScreen` - the
 * product's own entry point for painting a screen - and reads what reached the
 * socket.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { displayScreen } from '../../src/handlers/screen.handler';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;

function socket(emits: Array<{ event: string; data: any }>) {
  return {
    id: `theme-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

const painted = (emits: Array<{ event: string; data: any }>) =>
  emits.filter(e => e.event === 'ansi-output').map(e => String(e.data)).join('');

function write(rel: string, body: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-caller-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();

  // The board's own art.
  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  write('Conf1/MENU250.TXT', 'the board menu\r\n');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function theme(slug: string, files: Record<string, string>, over: Record<string, unknown> = {}): void {
  writeTheme(root, {
    slug, title: slug, author: '', owner: '', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'live', ...over,
  } as never);
  for (const [rel, body] of Object.entries(files)) write(path.join('Themes', slug, rel), body);
  clearThemeRegistryCache();
}

/**
 * The caller as the LOADER sees them - `screenTheme`, the field the user
 * repository maps `users.screentheme` onto (`user-repository.ts:241`), not the
 * column name. Handing this harness the raw column name is how a test passes
 * against a loader that can never see a real caller's preference.
 */
const caller = (over: Record<string, unknown> = {}) => ({
  nodeId: 1,
  relConfNum: 1,
  user: { username: 'lamer', secLevel: 20, ...over },
}) as any;

test('a caller with no theme is served the board own screen', async () => {
  const emits: Array<{ event: string; data: any }> = [];
  await displayScreen(socket(emits), caller(), 'BULL');
  expect(painted(emits)).toContain('the board bulletin');
});

test("a caller wearing a theme is served the THEME's screen", async () => {
  theme('neon', { 'Board/BULL.TXT': 'the neon bulletin\r\n' });

  const emits: Array<{ event: string; data: any }> = [];
  await displayScreen(socket(emits), caller({ screenTheme: 'neon' }), 'BULL');

  expect(painted(emits)).toContain('the neon bulletin');
  expect(painted(emits)).not.toContain('the board bulletin');
});

test('a screen the theme does not carry still comes from the board', async () => {
  // A partial theme is usable from day one - that is the whole of decision 4.
  theme('neon', { 'Board/GOODBYE.TXT': 'the neon goodbye\r\n' });

  const emits: Array<{ event: string; data: any }> = [];
  await displayScreen(socket(emits), caller({ screenTheme: 'neon' }), 'BULL');

  expect(painted(emits)).toContain('the board bulletin');
});

test("a caller who may not wear a draft is served the board's own art", async () => {
  theme('neon', { 'Board/BULL.TXT': 'the neon bulletin\r\n' }, { owner: 'skope', status: 'draft' });

  const stranger: Array<{ event: string; data: any }> = [];
  await displayScreen(socket(stranger), caller({ screenTheme: 'neon' }), 'BULL');
  expect(painted(stranger)).toContain('the board bulletin');

  const owner: Array<{ event: string; data: any }> = [];
  await displayScreen(socket(owner), caller({ username: 'skope', screenTheme: 'neon' }), 'BULL');
  expect(painted(owner)).toContain('the neon bulletin');
});

test('a conference screen comes from the theme by conference NUMBER', async () => {
  // MENU250 for a level-250 caller, out of Themes/neon/Conf/1 - ahead of the
  // conference root, which is where this board's real main menu lives.
  theme('neon', { 'Conf/1/MENU250.TXT': 'the neon menu\r\n' });

  const emits: Array<{ event: string; data: any }> = [];
  await displayScreen(socket(emits), caller({ secLevel: 250, screenTheme: 'neon' }), 'MENU');

  expect(painted(emits)).toContain('the neon menu');
});
