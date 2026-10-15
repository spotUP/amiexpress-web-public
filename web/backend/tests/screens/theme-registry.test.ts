/**
 * SP1 of the screen-themes spec: the registry, and nothing that reads it yet.
 *
 * Every case here is driven through the REAL icon reader and writer
 * (`readTooltypeMap` / `applyTooltypes`), not a hand-built Map, because the
 * format is the point: `Themes.info` has to be a file AmiExpress could read
 * and a sysop could edit by hand.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { applyTooltypes, readTooltypeMap } from '../../src/utils/info-file.util';
import {
  DEFAULT_SLUG,
  clearThemeRegistryCache,
  findTheme,
  isValidSlug,
  readThemeRegistry,
  registryPath,
  setDefaultTheme,
  themeDirectory,
  writeTheme,
  type ThemeEntry,
} from '../../src/screens/theme-registry';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-'));
  clearThemeRegistryCache();
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const entry = (over: Partial<ThemeEntry> = {}): ThemeEntry => ({
  slug: 'neon',
  title: 'Neon',
  author: 'Skope',
  owner: 'skope',
  dir: 'Themes/neon',
  widths: [80],
  doorTheme: 'vapor',
  status: 'draft',
  ...over,
});

/** Write tooltypes straight into the icon, the way a sysop's hand-edit would. */
function icon(pairs: Array<[string, string]>): void {
  applyTooltypes(registryPath(root), pairs);
  clearThemeRegistryCache();
}

describe('a board with no registry', () => {
  it('has no themes and falls back to the default slug', () => {
    const registry = readThemeRegistry(root);
    expect(registry.themes).toEqual([]);
    expect(registry.defaultSlug).toBe(DEFAULT_SLUG);
  });
});

describe('reading the registry', () => {
  it('reads a theme entry whole', () => {
    icon([
      ['TYPE.1', 'neon'], ['TITLE.1', 'Neon'], ['AUTHOR.1', 'Skope'],
      ['OWNER.1', 'skope'], ['DIR.1', 'Themes/neon'], ['WIDTHS.1', '80,40'],
      ['DOORTHEME.1', 'vapor'], ['STATUS.1', 'live'],
    ]);

    expect(readThemeRegistry(root).themes).toEqual([
      {
        slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope',
        dir: 'Themes/neon', widths: [80, 40], doorTheme: 'vapor', status: 'live',
      },
    ]);
  });

  it('lets the default theme own no directory, and nobody else', () => {
    icon([
      ['TYPE.0', 'default'], ['TITLE.0', 'reference-board'], ['DIR.0', ''],
      // A hand-edited entry that claims the board's own screens under another
      // name: that is how one artist's draft becomes everybody's art.
      ['TYPE.1', 'neon'], ['TITLE.1', 'Neon'], ['DIR.1', ''],
    ]);

    const slugs = readThemeRegistry(root).themes.map(t => t.slug);
    expect(slugs).toEqual(['default']);
  });

  it('drops one unusable slug without losing the themes around it', () => {
    icon([
      ['TYPE.1', 'neon'], ['DIR.1', 'Themes/neon'],
      ['TYPE.2', '../escape'], ['DIR.2', 'Themes/escape'],
      ['TYPE.3', 'quiet'], ['DIR.3', 'Themes/quiet'],
    ]);

    expect(readThemeRegistry(root).themes.map(t => t.slug)).toEqual(['neon', 'quiet']);
  });

  it('treats an unreadable status as a draft, never as live', () => {
    icon([['TYPE.1', 'neon'], ['DIR.1', 'Themes/neon'], ['STATUS.1', 'LIVE-ish']]);
    expect(findTheme(root, 'neon')!.status).toBe('draft');
  });

  it('keeps only widths this board can serve', () => {
    icon([['TYPE.1', 'neon'], ['DIR.1', 'Themes/neon'], ['WIDTHS.1', '80, 132 ,40,80']]);
    expect(findTheme(root, 'neon')!.widths).toEqual([80, 40]);
  });

  it('ignores a DEFAULT= naming a theme the board does not have', () => {
    icon([['TYPE.1', 'neon'], ['DIR.1', 'Themes/neon'], ['DEFAULT', 'ghost']]);
    expect(readThemeRegistry(root).defaultSlug).toBe(DEFAULT_SLUG);
  });

  it('honours a DEFAULT= that names a real one', () => {
    icon([['TYPE.1', 'neon'], ['DIR.1', 'Themes/neon'], ['DEFAULT', 'neon']]);
    expect(readThemeRegistry(root).defaultSlug).toBe('neon');
  });
});

describe('the cache', () => {
  it('sees an edit made under it, without a restart', () => {
    icon([['TYPE.1', 'neon'], ['TITLE.1', 'Neon'], ['DIR.1', 'Themes/neon']]);
    expect(findTheme(root, 'neon')!.title).toBe('Neon');

    // A sysop edits the icon by hand. The next screen load must see it - the
    // rule readScreenFlags and resolveNodeScreenDir already use.
    applyTooltypes(registryPath(root), [['TITLE.1', 'Neon Redux']]);
    const stat = fs.statSync(registryPath(root));
    fs.utimesSync(registryPath(root), stat.atime, new Date(stat.mtimeMs + 2000));

    expect(findTheme(root, 'neon')!.title).toBe('Neon Redux');
  });
});

describe('writing the registry', () => {
  it('round-trips a theme through a file the icon reader still understands', () => {
    writeTheme(root, entry());

    const tooltypes = readTooltypeMap(registryPath(root));
    expect(tooltypes.get('TYPE.0')).toBe('neon');
    expect(tooltypes.get('DIR.0')).toBe('Themes/neon');
    expect(findTheme(root, 'neon')).toMatchObject({ title: 'Neon', owner: 'skope' });
  });

  it('updates a theme in place instead of adding a second entry for it', () => {
    writeTheme(root, entry());
    writeTheme(root, entry({ title: 'Neon Redux', status: 'live' }));

    const themes = readThemeRegistry(root).themes;
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({ title: 'Neon Redux', status: 'live' });
  });

  it('refuses a slug that cannot be a directory name', () => {
    expect(() => writeTheme(root, entry({ slug: 'Neon Lights' }))).toThrow(/usable theme slug/i);
    expect(() => writeTheme(root, entry({ slug: '../escape' }))).toThrow(/usable theme slug/i);
    expect(isValidSlug('neon-2')).toBe(true);
    expect(isValidSlug('-neon')).toBe(false);
  });

  it("refuses to let a theme other than the default claim the board's own screens", () => {
    expect(() => writeTheme(root, entry({ dir: '' }))).toThrow(/must name a directory/i);
    expect(() => writeTheme(root, entry({ slug: DEFAULT_SLUG, dir: '' }))).not.toThrow();
  });

  it('names a board default only from themes that exist', () => {
    writeTheme(root, entry());
    expect(() => setDefaultTheme(root, 'ghost')).toThrow(/No such theme/i);

    setDefaultTheme(root, 'neon');
    expect(readThemeRegistry(root).defaultSlug).toBe('neon');
  });
});

describe('where a theme keeps its files', () => {
  it('is a real directory for a theme, and nothing at all for the default', () => {
    expect(themeDirectory(root, entry())).toBe(path.join(root, 'Themes/neon'));
    // The default theme is not a directory: the resolver prepends nothing and
    // returns what it returns today. That is what makes byte-identity for
    // today's callers structural rather than a test result.
    expect(themeDirectory(root, entry({ slug: DEFAULT_SLUG, dir: '' }))).toBeNull();
  });
});
