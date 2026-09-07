/**
 * SP4: what a door (the picker) can ask and set.
 *
 * The picker and the loader must agree about what a caller may wear, so both
 * go through `caller-theme`. These tests drive `BBSApi` - the surface a door
 * actually has - rather than that module directly.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const updateUser = jest.fn();
jest.mock('../../src/database', () => ({
  db: { updateUser: (...args: unknown[]) => updateUser(...args) },
}));

import { config } from '../../src/config';
import { createBBSApi } from '../../src/doors/BBSApi';
import { clearThemeRegistryCache, writeTheme, type ThemeEntry } from '../../src/screens/theme-registry';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-api-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  clearThemeRegistryCache();
  updateUser.mockReset();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function theme(slug: string, over: Partial<ThemeEntry> = {}): void {
  writeTheme(root, {
    slug, title: slug.toUpperCase(), author: 'Skope', owner: '', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'live', ...over,
  });
  clearThemeRegistryCache();
}

function api(user: Record<string, unknown> = {}): any {
  const socket: any = { id: 'sock-theme', emit: () => {}, on: () => {} };
  return createBBSApi(socket, {
    user: { id: 7, username: 'lamer', secLevel: 20, ...user },
    nodeId: 1,
  } as any);
}

test('a door is offered exactly the themes the caller may wear', () => {
  theme('neon');
  theme('mine', { owner: 'skope', status: 'draft' });

  expect(api().listScreenThemes().map((t: { slug: string }) => t.slug)).toEqual(['neon']);
  expect(api({ username: 'skope' }).listScreenThemes().map((t: { slug: string }) => t.slug))
    .toEqual(['neon', 'mine']);
});

test('a door can read what the caller is wearing now', () => {
  theme('neon');
  expect(api().getScreenTheme()).toBe('default');
  expect(api({ screenTheme: 'neon' }).getScreenTheme()).toBe('neon');
});

test('choosing a theme stores it, in the column the loader reads', async () => {
  theme('neon');
  const bbs = api();

  await expect(bbs.setScreenTheme('neon')).resolves.toBe('neon');
  expect(updateUser).toHaveBeenCalledWith(7, { screenTheme: 'neon' });
});

test('choosing a theme the caller may not wear changes nothing', async () => {
  theme('secret', { owner: 'skope', status: 'draft' });
  const bbs = api();

  // Answers what is REALLY in force rather than the refused slug: a stored
  // preference the loader will not honour is a caller seeing the default board
  // while the picker claims otherwise.
  await expect(bbs.setScreenTheme('secret')).resolves.toBe('default');
  expect(updateUser).not.toHaveBeenCalled();
});

test('going back to the board own art is always allowed', async () => {
  theme('neon');
  const bbs = api({ screenTheme: 'neon' });

  await expect(bbs.setScreenTheme('default')).resolves.toBe('default');
  expect(updateUser).toHaveBeenCalledWith(7, { screenTheme: 'default' });
});

test('a theme that names a companion door theme applies it in the same action', async () => {
  theme('neon', { doorTheme: 'vapor' });
  const bbs = api();

  await bbs.setScreenTheme('neon');

  const fields = updateUser.mock.calls.map(call => Object.keys(call[1] as object)[0]);
  expect(fields).toContain('screenTheme');
  // Through setTheme, so an unknown id resolves to a real theme rather than
  // leaving a door with a broken palette.
  expect(fields).toContain('themePreference');
});

test('a theme with no companion leaves the door theme exactly as it was', async () => {
  theme('plain');
  const bbs = api();

  await bbs.setScreenTheme('plain');

  const fields = updateUser.mock.calls.map(call => Object.keys(call[1] as object)[0]);
  expect(fields).toEqual(['screenTheme']);
});
