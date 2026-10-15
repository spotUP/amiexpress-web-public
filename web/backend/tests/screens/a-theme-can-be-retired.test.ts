/**
 * A theme can be retired, and retiring one takes nothing else with it.
 *
 * THE DEAD END THIS OPENS. An artist may own at most five themes, and the
 * sixth attempt is refused with "You already own 5 themes - retire one before
 * starting another" (api/theme-routes.ts). Nothing could retire one: the
 * router had GET, POST, PUT and /default and no DELETE at all. The board told
 * artists to do something it did not let them do.
 *
 * The registry is indexed tooltypes - TYPE.0, TITLE.0, DIR.0 and so on - and
 * the reader scans every `TYPE.<n>` rather than walking 0..n, so removing one
 * theme's block leaves a HOLE that costs nothing and no renumbering is needed.
 * That is the property these tests pin: the neighbours survive.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  clearThemeRegistryCache,
  readThemeRegistry,
  removeTheme,
  setDefaultTheme,
  writeTheme,
  DEFAULT_SLUG,
} from '../../src/screens/theme-registry';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-retire-'));
  clearThemeRegistryCache();
});

const theme = (slug: string, owner = '') => {
  writeTheme(root, {
    slug, title: slug.toUpperCase(), author: owner, owner,
    dir: `Themes/${slug}`, widths: [80], doorTheme: '', status: 'live',
  });
  fs.mkdirSync(path.join(root, 'Themes', slug, 'Files'), { recursive: true });
};

const slugs = () => readThemeRegistry(root).themes.map(t => t.slug).sort();

it('removes the theme and leaves its neighbours alone', () => {
  theme('neon');
  theme('reference-board');
  theme('uprough');

  removeTheme(root, 'reference-board');

  expect(slugs()).toEqual(['neon', 'uprough']);
});

it('leaves a hole in the indices without disturbing the rest', () => {
  // The middle entry, so a reader that walked 0..n sequentially would stop
  // short and lose `uprough` as well.
  theme('neon');
  theme('reference-board');
  theme('uprough');

  removeTheme(root, 'reference-board');
  clearThemeRegistryCache();

  expect(slugs()).toEqual(['neon', 'uprough']);
});

it('refuses to remove the board own screens', () => {
  // `default` is not a theme, it IS the board. Removing it would leave every
  // caller with a registry whose default names nothing.
  expect(() => removeTheme(root, DEFAULT_SLUG)).toThrow(/default/i);
});

it('refuses while the theme is the board default', () => {
  theme('neon');
  setDefaultTheme(root, 'neon');

  // Silently falling back would change what every caller with no preference
  // sees, as a side effect of a delete. Make the sysop move it first.
  expect(() => removeTheme(root, 'neon')).toThrow(/default/i);
  expect(slugs()).toEqual(['neon']);
});

it('refuses a theme that is not there', () => {
  expect(() => removeTheme(root, 'ghost')).toThrow(/no such theme/i);
});

it('does not touch the theme directory', () => {
  // The registry entry is the board's business; the ART is somebody's work.
  // Moving or deleting a directory is the caller's decision, made once, above
  // this function - which is what keeps this one safe to call from a test.
  theme('neon');

  removeTheme(root, 'neon');

  expect(fs.existsSync(path.join(root, 'Themes', 'neon', 'Files'))).toBe(true);
});
