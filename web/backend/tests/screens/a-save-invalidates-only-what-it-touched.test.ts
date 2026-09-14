/**
 * One save does not throw away every index on the board.
 *
 * The cache key was every screen directory joined together, so writing one
 * file invalidated EVERY slot: the board's index and each theme's went at
 * once, and each then rebuilt separately - ~340ms apiece, synchronously, on
 * the one thread that also answers telnet. Saving three times in a row while
 * an artist worked is what the sysop met as "it seems stuck".
 *
 * What a slot actually reads:
 *
 *   the BOARD reads the board, and never enters a theme directory - which is
 *   why a theme's file shows as read by nothing in the board's own index;
 *   a THEME reads itself AND the board, because a screen it has not drawn
 *   falls through to the board's copy.
 *
 * So a theme watches itself and the board; the board watches only itself;
 * neither watches a stranger.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

process.env.SKIP_DB_INIT = '1';

import { getScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

/** A board with two themes, and one screen each so the walk has something to do. */
function makeBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-keys-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.TXT'), 'board art', 'latin1');

  for (const slug of ['alpha', 'beta']) {
    fs.mkdirSync(path.join(root, 'Themes', slug, 'Node'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Themes', slug, 'Node', 'BBSTITLE.TXT'), `${slug} art`, 'latin1');
    // Through the REAL writer: the registry is `Themes.info`, an Amiga icon
    // AmiExpress itself can read, not a JSON file this test could invent.
    writeTheme(root, {
      slug, title: slug, author: slug, owner: slug,
      dir: `Themes/${slug}`, widths: [80], doorTheme: '', status: 'draft',
    });
  }
  return root;
}

/** Move a directory's mtime the way writing a file into it does. */
const touch = (dir: string) => fs.utimesSync(dir, new Date(), new Date());

describe('a save invalidates only what it touched', () => {
  let root: string;

  beforeEach(() => {
    root = makeBoard();
    invalidateScreenIndex();
    clearThemeRegistryCache();
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('a save in one theme leaves the other theme and the board alone', () => {
    const board = getScreenIndex(root);
    const alpha = getScreenIndex(root, 'alpha');
    const beta = getScreenIndex(root, 'beta');

    touch(path.join(root, 'Themes', 'alpha', 'Node'));
    touch(path.join(root, 'Themes', 'alpha'));

    // Identity is the test: a cache hit returns the very same object, a
    // rebuild cannot.
    expect(getScreenIndex(root, 'alpha')).not.toBe(alpha);
    expect(getScreenIndex(root)).toBe(board);
    expect(getScreenIndex(root, 'beta')).toBe(beta);
  });

  it('a save on the BOARD still reaches every theme, because they fall through to it', () => {
    const board = getScreenIndex(root);
    const alpha = getScreenIndex(root, 'alpha');
    const beta = getScreenIndex(root, 'beta');

    touch(path.join(root, 'Node1'));

    expect(getScreenIndex(root)).not.toBe(board);
    expect(getScreenIndex(root, 'alpha')).not.toBe(alpha);
    expect(getScreenIndex(root, 'beta')).not.toBe(beta);
  });

  it('nothing changed means nothing rebuilds', () => {
    const board = getScreenIndex(root);
    const alpha = getScreenIndex(root, 'alpha');

    expect(getScreenIndex(root)).toBe(board);
    expect(getScreenIndex(root, 'alpha')).toBe(alpha);
  });
});
