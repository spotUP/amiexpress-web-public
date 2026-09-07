/**
 * SP3: the screen manager can SEE a theme's screens.
 *
 * Without this a theme is a directory nobody can reach - the sysop creates one
 * through the admin and then cannot fill it, and the artist would have to put
 * files on the volume by hand. `listScreenDirectories` is what the index walks,
 * so it is where the theme's scopes have to appear.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { listScreenDirectories } from '../../src/screens/screen-index.service';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-index-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  clearThemeRegistryCache();
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function theme(slug: string, scopes: string[]): void {
  writeTheme(root, {
    slug, title: slug, author: '', owner: 'skope', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'draft',
  });
  for (const scope of scopes) fs.mkdirSync(path.join(root, 'Themes', slug, scope), { recursive: true });
  clearThemeRegistryCache();
}

const listed = () => listScreenDirectories(root).map(dir => dir.replace(root, '<root>'));

it("lists a theme's scope directories, so its screens can be opened and edited", () => {
  theme('neon', ['Node', 'Board', 'Conf/1']);

  const dirs = listed();
  expect(dirs).toContain('<root>/Themes/neon/Node');
  expect(dirs).toContain('<root>/Themes/neon/Board');
  expect(dirs).toContain('<root>/Themes/neon/Conf/1');
});

it("still lists the board's own directories", () => {
  theme('neon', ['Board']);
  const dirs = listed();
  expect(dirs).toContain('<root>');
  expect(dirs).toContain('<root>/Screens');
});

it('ignores a directory under Themes/ that no registry entry claims', () => {
  // A directory with no entry is not a theme: listing it would offer files
  // that nothing can ever resolve for a caller.
  fs.mkdirSync(path.join(root, 'Themes', 'orphan', 'Board'), { recursive: true });
  expect(listed()).not.toContain('<root>/Themes/orphan/Board');
});

it('does not invent a directory for the default theme', () => {
  // `default` IS the board's own screens; it has no directory of its own.
  writeTheme(root, {
    slug: 'default', title: 'reference-board', author: '', owner: '', dir: '',
    widths: [80], doorTheme: '', status: 'live',
  });
  clearThemeRegistryCache();

  expect(listed().some(dir => dir.includes('Themes/default'))).toBe(false);
});
