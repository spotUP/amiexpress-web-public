/**
 * "doorman is stuck loading central door catalog" - sysop, 2026-09-29.
 *
 * The manifest came down in under a second. Then every one of its 5,690 rows
 * was resolved against the local catalog through getCatalogEntryByArchive,
 * which opens, checks and closes a SQLite connection per call - 13 ms each on
 * the live board, so over a minute with the whole process (the BBS, in a TS
 * door) frozen, and the screen on "Loading central door-repo catalog...".
 *
 * The lookup now comes from one query.
 */
import { buildLocalCatalogLookup } from '../../../../board/Doors/door-manager/doorman-services';

const row = (archive: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${archive}`, archive_name: archive, installed: 0, installed_as: null, install_dir: null,
  binary_name: 'prog', archive_path: `X/${archive}`, ...extra,
});

describe('the local catalog lookup behind the central browse', () => {
  it('reads the catalog once, however many rows it is asked about', () => {
    const listCatalogArchiveIndex = jest.fn(() => [row('A.LHA'), row('B.LHA', { installed: 1, installed_as: 'BEE' })]);
    const getCatalogEntryByArchive = jest.fn();
    const lookup = buildLocalCatalogLookup({ listCatalogArchiveIndex, getCatalogEntryByArchive });

    for (let i = 0; i < 5690; i++) lookup(`ROW${i}.LHA`);

    expect(listCatalogArchiveIndex).toHaveBeenCalledTimes(1);
    expect(getCatalogEntryByArchive).not.toHaveBeenCalled();
  });

  it('answers by archive name in any case, with the facts the browse shows', () => {
    const lookup = buildLocalCatalogLookup({
      listCatalogArchiveIndex: () => [row('Fame-Pack.LHA', { installed: 1, installed_as: 'FAME', install_dir: 'Doors/FAME' })],
    });
    expect(lookup('FAME-PACK.lha')).toMatchObject({ installed: 1, installed_as: 'FAME', install_dir: 'Doors/FAME', binary_name: 'prog' });
    expect(lookup('other.lha')).toBeNull();
  });

  it('falls back to the per-archive getter on a backend without the index', () => {
    const getCatalogEntryByArchive = jest.fn((name: string) => (name === 'X.LHA' ? row('X.LHA') : null));
    const lookup = buildLocalCatalogLookup({ getCatalogEntryByArchive });
    expect(lookup('X.LHA')?.id).toBe('id-X.LHA');
    expect(lookup('Y.LHA')).toBeNull();
  });

  it('a failing read is "nothing known locally", never a failed browse', () => {
    const broken = buildLocalCatalogLookup({ listCatalogArchiveIndex: () => { throw new Error('db locked'); }, getCatalogEntryByArchive: () => { throw new Error('db locked'); } });
    expect(broken('A.LHA')).toBeNull();
    expect(buildLocalCatalogLookup(null)('A.LHA')).toBeNull();
  });
});
