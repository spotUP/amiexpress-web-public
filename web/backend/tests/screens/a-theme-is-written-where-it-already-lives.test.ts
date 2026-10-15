/**
 * PUBLISHING A THEME HAS TO CHANGE THE ENTRY THE BOARD READS.
 *
 * "i switched to h7's theme on the live bbs, most screens show old ones"
 * (sysop, 2026-09-18). The live registry held h7 TWICE - `TYPE.5` with
 * `STATUS.5=draft`, the entry the reader takes, and `TYPE.2` with
 * `STATUS.2=live`, written by the publish he had just done. A draft theme is
 * wearable only by its owner, so the board fell back to its default and served
 * him the old art.
 *
 * `writeTheme` wrote at the theme's POSITION IN THE PARSED LIST, and the
 * registry is not numbered that way: `removeTheme` leaves holes on purpose,
 * so `TYPE.0`, `TYPE.4`, `TYPE.5`, `TYPE.6` is ordinary and h7's position - 2 -
 * belonged to nobody. The same arithmetic gave a NEW theme `TYPE.<length>`,
 * which on that registry is `TYPE.4`: the next artist's theme would have
 * overwritten 607080's, line for line.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  readThemeRegistry, writeTheme, removeTheme, clearThemeRegistryCache, type ThemeEntry,
} from '../../src/screens/theme-registry';

let root: string;

const entry = (over: Partial<ThemeEntry> & { slug: string }): ThemeEntry => ({
  title: `${over.slug}'s screens`,
  author: over.slug,
  owner: over.slug,
  dir: `Themes/${over.slug}`,
  widths: [80],
  doorTheme: '',
  status: 'draft',
  ...over,
});

/** The registry file as text, so the TYPE lines can be counted. */
const registryText = () => fs.readFileSync(path.join(root, 'Themes.info'), 'latin1');
const typeLines = (slug: string) =>
  registryText().split(/\r?\n/).filter(line => /^TYPE\.\d+=/i.test(line) && line.endsWith(`=${slug}`));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-registry-'));
  fs.writeFileSync(path.join(root, 'Themes.info'), '');
  clearThemeRegistryCache();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
});

/** `TYPE.0`, `TYPE.4`, `TYPE.5`, `TYPE.6` - the shape a retirement leaves behind. */
function registryWithAHole(): void {
  for (const slug of ['tango', 'gap1', 'gap2', 'sixzero', 'h7', 'tangotwo']) {
    writeTheme(root, entry({ slug }));
  }
  removeTheme(root, 'gap1');
  removeTheme(root, 'gap2');
  clearThemeRegistryCache();
}

describe('a theme is written where it already lives', () => {
  it('publishing changes the entry the reader takes, and writes no second one', () => {
    registryWithAHole();

    writeTheme(root, entry({ slug: 'h7', status: 'live' }));
    clearThemeRegistryCache();

    expect(typeLines('h7')).toHaveLength(1);
    expect(readThemeRegistry(root).themes.find(t => t.slug === 'h7')?.status).toBe('live');
  });

  it('a new theme takes an index nobody is using, not the next array slot', () => {
    registryWithAHole();
    const before = readThemeRegistry(root).themes.map(t => ({ slug: t.slug, status: t.status }));

    writeTheme(root, entry({ slug: 'newcomer' }));
    clearThemeRegistryCache();

    const after = readThemeRegistry(root).themes;
    // Every theme that was there is still there, unchanged.
    for (const was of before) {
      expect(after.find(t => t.slug === was.slug)?.status).toBe(was.status);
    }
    expect(after.find(t => t.slug === 'newcomer')).toBeTruthy();
    expect(after).toHaveLength(before.length + 1);
  });
});
