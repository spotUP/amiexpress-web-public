import { fetchArchiveFiles, fetchDoc } from '../../../../Doors/door-manager/repo-client';

/**
 * A consumer BBS has no catalog of its own - it moved to the door server -
 * so DOORMAN's two per-archive views had nothing to read. [V]iew doc did
 * nothing, and the file list said "no file data in catalog", on a server
 * that answers both:
 *
 *   GET /api/door-repo/files/:archiveName
 *   GET /api/door-repo/doc/:archiveName
 *
 * The files format is the one the C door parses, so these tests pin the
 * parsing rather than trusting a shape.
 */

const CFG = { url: 'https://doors.example.test', cacheFile: '/tmp/unused-cache.json' };

function mockFetch(body: string, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
  });
}

describe('fetchArchiveFiles', () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });

  it('parses the header and every row', async () => {
    global.fetch = mockFetch(
      'FILES|3|1\r\n950|0|7hE-EdGE\r\n305|0|FILE_ID.DIZ\r\n2217|1|S-ANCTUA-RY\r\n'
    ) as never;

    const listing = await fetchArchiveFiles(CFG, '-D-CALC.LHA');

    expect(listing?.count).toBe(3);
    expect(listing?.junkCount).toBe(1);
    expect(listing?.files).toEqual([
      { size: 950, isJunk: false, path: '7hE-EdGE' },
      { size: 305, isJunk: false, path: 'FILE_ID.DIZ' },
      { size: 2217, isJunk: true, path: 'S-ANCTUA-RY' },
    ]);
  });

  it('keeps a path that contains the separator', async () => {
    // The format is split-on-pipe with the path last, so a path carrying a
    // pipe must not lose its tail.
    global.fetch = mockFetch('FILES|1|0\n100|0|dir/we|rd.txt\n') as never;

    expect((await fetchArchiveFiles(CFG, 'X.LHA'))?.files[0].path).toBe('dir/we|rd.txt');
  });

  it('reads LF-only output as well as CRLF', async () => {
    global.fetch = mockFetch('FILES|1|0\n10|1|ad.txt\n') as never;

    const listing = await fetchArchiveFiles(CFG, 'X.LHA');
    expect(listing?.files).toHaveLength(1);
    expect(listing?.files[0].isJunk).toBe(true);
  });

  it('returns null for a body that is not this format', async () => {
    global.fetch = mockFetch('<html>404</html>') as never;
    expect(await fetchArchiveFiles(CFG, 'X.LHA')).toBeNull();
  });

  it('returns null on a failed request rather than throwing', async () => {
    global.fetch = mockFetch('', false, 404) as never;
    expect(await fetchArchiveFiles(CFG, 'X.LHA')).toBeNull();

    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;
    expect(await fetchArchiveFiles(CFG, 'X.LHA')).toBeNull();
  });

  it('asks for the archive by name, encoded', async () => {
    const spy = mockFetch('FILES|0|0\n');
    global.fetch = spy as never;

    await fetchArchiveFiles(CFG, 'a b&c.LHA');

    expect(spy.mock.calls[0][0]).toBe(
      'https://doors.example.test/api/door-repo/files/a%20b%26c.LHA'
    );
  });
});

describe('fetchDoc', () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });

  it('returns the documentation as it came', async () => {
    global.fetch = mockFetch('   ___\n  /  /  DOC\n') as never;

    expect(await fetchDoc(CFG, 'X.LHA')).toBe('   ___\n  /  /  DOC\n');
  });

  it('returns null for an archive with no documentation', async () => {
    global.fetch = mockFetch('', true, 200) as never;
    expect(await fetchDoc(CFG, 'X.LHA')).toBeNull();

    global.fetch = mockFetch('', false, 404) as never;
    expect(await fetchDoc(CFG, 'X.LHA')).toBeNull();
  });

  it('does not throw when the server cannot be reached', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as never;
    expect(await fetchDoc(CFG, 'X.LHA')).toBeNull();
  });
});
