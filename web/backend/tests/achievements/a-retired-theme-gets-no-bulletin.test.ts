/**
 * A theme the sysop retired must stop receiving leaderboards.
 *
 * Deleting a theme in the admin MOVES its art aside rather than erasing it -
 * `Themes/<slug>.removed-YYYYMMDD` (api/theme-routes.ts:414), one `mv` from
 * coming back, because a theme directory is somebody's drawings.
 *
 * `themedBulletins` walked every directory under `Themes/` and claimed any
 * that had an `AchieveTop.txt`, so a retired theme kept being written to on
 * every achievements cycle. Seen on the live board 2026-09-15:
 * `Themes/ansiguy.removed-20260915/Board/AchieveTop.txt`, regenerated at
 * 13:52 - minutes after the theme was retired.
 *
 * The rule is not new: `isValidSlug` is what the rest of the theme code uses,
 * and a retired directory fails it on the dot.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { themedBulletins } from '../../src/achievements/bulletin';

/** A board with one live theme and one that was retired. */
function aBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-theme-'));
  for (const dir of ['tango', 'ansiguy.removed-20260915', '607080']) {
    const board = path.join(root, 'Themes', dir, 'Board');
    fs.mkdirSync(board, { recursive: true });
    fs.writeFileSync(path.join(board, 'AchieveTop.txt'), 'leaderboard\r\n', 'latin1');
  }
  return root;
}

describe('themed bulletins', () => {
  it('skips a theme that has been retired', () => {
    const slugs = themedBulletins(aBoard()).map(t => t.slug);

    expect(slugs).not.toContain('ansiguy.removed-20260915');
  });

  it('still writes the themes that are live', () => {
    // The round trip: the guard must not cost a real theme its bulletin.
    const slugs = themedBulletins(aBoard()).map(t => t.slug).sort();

    expect(slugs).toEqual(['607080', 'tango']);
  });

  it('points each live theme at its own Board directory', () => {
    const tango = themedBulletins(aBoard()).find(t => t.slug === 'tango');

    expect(tango).toBeDefined();
    expect(tango!.file.endsWith(path.join('Themes', 'tango', 'Board', 'AchieveTop.txt'))).toBe(true);
    expect(tango!.header.endsWith('AchieveTop.Header')).toBe(true);
    expect(tango!.tailer.endsWith('AchieveTop.Tailer')).toBe(true);
  });

  it('ignores a stray directory that is not a theme at all', () => {
    // Same guard, and the reason it is `isValidSlug` rather than a
    // `.removed-` string match: anything that is not a slug is not a theme.
    const root = aBoard();
    const stray = path.join(root, 'Themes', 'Backup 2026', 'Board');
    fs.mkdirSync(stray, { recursive: true });
    fs.writeFileSync(path.join(stray, 'AchieveTop.txt'), 'x\r\n', 'latin1');

    expect(themedBulletins(root).map(t => t.slug)).toEqual(
      expect.not.arrayContaining(['Backup 2026'])
    );
  });

  it('returns nothing on a board with no Themes directory', () => {
    expect(themedBulletins(fs.mkdtempSync(path.join(os.tmpdir(), 'no-themes-')))).toEqual([]);
  });
});
