/**
 * SP4: which theme a caller is wearing, and who may wear what.
 *
 * The picker, the loader and the admin preview all ask these functions, which
 * is the point: three copies of "is this theme selectable" would drift, and
 * the failure mode is a caller selecting a theme the loader then refuses -
 * the board flicking back to default with no explanation.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  canWearTheme, companionDoorTheme, resolveCallerTheme, selectableThemes,
} from '../../src/screens/caller-theme';
import {
  clearThemeRegistryCache, setDefaultTheme, writeTheme, type ThemeEntry, type ThemeStatus,
} from '../../src/screens/theme-registry';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'caller-theme-'));
  clearThemeRegistryCache();
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function theme(slug: string, over: Partial<ThemeEntry> = {}): ThemeEntry {
  const entry: ThemeEntry = {
    slug, title: slug, author: '', owner: '', dir: `Themes/${slug}`,
    widths: [80], doorTheme: '', status: 'live' as ThemeStatus, ...over,
  };
  writeTheme(root, entry);
  clearThemeRegistryCache();
  return entry;
}

const caller = (over: Partial<Parameters<typeof resolveCallerTheme>[1]> = {}) =>
  ({ username: 'lamer', secLevel: 20, ...over });

describe('a board with no themes', () => {
  it('leaves every caller on the board own screens', () => {
    expect(resolveCallerTheme(root, caller())).toBe('default');
    expect(resolveCallerTheme(root, caller({ screenTheme: 'neon' }))).toBe('default');
  });
});

describe('what a caller may wear', () => {
  it('a live theme is for everybody', () => {
    const neon = theme('neon');
    expect(canWearTheme(caller(), neon)).toBe(true);
  });

  it('a draft is for its owner and for sysops, and nobody else', () => {
    const draft = theme('neon', { owner: 'skope', status: 'draft' });
    expect(canWearTheme(caller({ username: 'skope' }), draft)).toBe(true);
    expect(canWearTheme(caller({ username: 'SKOPE' }), draft)).toBe(true);
    expect(canWearTheme(caller({ secLevel: 255 }), draft)).toBe(true);
    expect(canWearTheme(caller(), draft)).toBe(false);
  });

  it('a draft with no owner is for sysops only - empty does not match empty', () => {
    const orphan = theme('neon', { owner: '', status: 'review' });
    expect(canWearTheme(caller({ username: '' }), orphan)).toBe(false);
    expect(canWearTheme(caller({ secLevel: 255 }), orphan)).toBe(true);
  });

  it('lists exactly what the caller may choose', () => {
    theme('live-one');
    theme('mine', { owner: 'skope', status: 'draft' });
    theme('theirs', { owner: 'other', status: 'draft' });

    expect(selectableThemes(root, caller({ username: 'skope' })).map(t => t.slug))
      .toEqual(['live-one', 'mine']);
    expect(selectableThemes(root, caller({ secLevel: 255 })).map(t => t.slug))
      .toEqual(['live-one', 'mine', 'theirs']);
  });
});

describe('resolving what a caller is wearing', () => {
  it('honours their own choice', () => {
    theme('neon');
    expect(resolveCallerTheme(root, caller({ screenTheme: 'neon' }))).toBe('neon');
  });

  it('falls back to the board default when they have not chosen', () => {
    theme('reference-board');
    setDefaultTheme(root, 'reference-board');
    clearThemeRegistryCache();
    expect(resolveCallerTheme(root, caller())).toBe('reference-board');
  });

  it('falls back when the theme they chose is gone', () => {
    theme('neon');
    expect(resolveCallerTheme(root, caller({ screenTheme: 'retired' }))).toBe('default');
  });

  it('falls back when they may no longer wear what they chose', () => {
    // An artist's theme went back to draft, and a caller was wearing it.
    theme('neon', { owner: 'skope', status: 'draft' });
    expect(resolveCallerTheme(root, caller({ screenTheme: 'neon' }))).toBe('default');
    expect(resolveCallerTheme(root, caller({ username: 'skope', screenTheme: 'neon' }))).toBe('neon');
  });

  it('does not let a board default nobody may wear reach a caller', () => {
    theme('draft-default', { owner: 'skope', status: 'draft' });
    setDefaultTheme(root, 'draft-default');
    clearThemeRegistryCache();

    expect(resolveCallerTheme(root, caller())).toBe('default');
    expect(resolveCallerTheme(root, caller({ username: 'skope' }))).toBe('draft-default');
  });
});

describe('the companion door theme', () => {
  it('is named only when the theme names one', () => {
    theme('neon', { doorTheme: 'vapor' });
    theme('plain');
    expect(companionDoorTheme(root, 'neon')).toBe('vapor');
    expect(companionDoorTheme(root, 'plain')).toBeNull();
    expect(companionDoorTheme(root, 'default')).toBeNull();
  });
});

/**
 * The column and the field have to agree, or the loader never sees a
 * preference that is really stored.
 *
 * `users.screentheme` is a column; `User.screenTheme` is what the repository
 * maps it onto and what every reader uses. This spans both, because a test
 * that hands the loader a hand-built object with the COLUMN name on it passes
 * happily while no real caller's theme ever reaches the resolver.
 */
describe('the stored column and the field the loader reads', () => {
  it('are connected by the repository mapper', () => {
    const { UserRepository } = require('../../src/database/user-repository');
    const repo = Object.create(UserRepository.prototype) as {
      mapUserFromDb(row: Record<string, unknown>): { screenTheme?: string };
    };

    const mapped = (repo as any).mapUserFromDb({
      id: 1, username: 'skope', password_hash: '', screentheme: 'neon',
    } as never);

    expect(mapped.screenTheme).toBe('neon');
  });

  it('answers empty for a caller who has never chosen', () => {
    const { UserRepository } = require('../../src/database/user-repository');
    const repo = Object.create(UserRepository.prototype) as {
      mapUserFromDb(row: Record<string, unknown>): { screenTheme?: string };
    };

    expect((repo as any).mapUserFromDb({ id: 1, username: 'lamer', password_hash: '' } as never).screenTheme).toBe('');
  });
});
