import { fetchDoorDetail } from '../../../../Doors/door-manager/repo-client';

/**
 * A consumer BBS has no catalog of its own - it moved to the door server -
 * so every per-archive view had nothing to read: the file list said "no file
 * data in catalog", [V]iew doc did nothing, and version /
 * suggestedTooltypes / FILE_ID.DIZ sat at mapManifestDoorToEntry's neutral
 * defaults for all 5900 rows.
 *
 * One endpoint answers all of it:
 *
 *   GET /api/door-repo/doors/:archiveName
 *
 * It replaced the two narrower calls (/files, /doc). These tests pin the
 * parse rather than trusting a shape, including everything a proxy or a
 * half-dead server can put in front of it.
 */

const CFG = { url: 'https://doors.example.test', cacheFile: '/tmp/unused-cache.json' };

const FULL_ROW = {
  archiveName: '-D-CALC.LHA',
  name: 'Calculator',
  version: 'v1.2',
  description: 'A calculator door',
  category: 'Utility',
  author: 'Someone',
  releaseGroup: 'DLT',
  fileIdDiz: '  CALC  \n  v1.2  ',
  docFilename: 'Calc.doc',
  doc: 'HOW TO INSTALL\n',
  suggestedTooltypes: '{"TYPE":"XIM","STACK":"10000"}',
  junkCount: 1,
  hasDoc: true,
  md5: 'aa',
  sha256: 'bb',
  files: [
    { path: '7hE-EdGE', size: 950, isJunk: false, junkReason: null },
    { path: 'FILE_ID.DIZ', size: 305, isJunk: false, junkReason: null },
    { path: 'S-ANCTUA-RY', size: 2217, isJunk: true, junkReason: 'ad' },
  ],
};

function mockJson(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe('fetchDoorDetail', () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });

  it('carries every field DOORMAN leaves at a neutral default', async () => {
    global.fetch = mockJson(FULL_ROW) as never;

    const detail = await fetchDoorDetail(CFG, '-D-CALC.LHA');

    expect(detail).toMatchObject({
      archiveName: '-D-CALC.LHA',
      version: 'v1.2',
      suggestedTooltypes: '{"TYPE":"XIM","STACK":"10000"}',
      fileIdDiz: '  CALC  \n  v1.2  ',
      docFilename: 'Calc.doc',
      doc: 'HOW TO INSTALL\n',
      hasDoc: true,
      md5: 'aa',
      sha256: 'bb',
    });
    expect(detail?.files).toEqual([
      { path: '7hE-EdGE', size: 950, isJunk: false },
      { path: 'FILE_ID.DIZ', size: 305, isJunk: false },
      { path: 'S-ANCTUA-RY', size: 2217, isJunk: true },
    ]);
  });

  it('counts the junk the file rows actually flag, not the row summary', async () => {
    // The catalog's junk_count can lag its own file rows (a strip re-derives
    // one and not the other). The rows are what the browse view shows.
    global.fetch = mockJson({ ...FULL_ROW, junkCount: 9 }) as never;

    expect((await fetchDoorDetail(CFG, 'X.LHA'))?.junkCount).toBe(1);
  });

  it('falls back to the row summary when no file rows came', async () => {
    global.fetch = mockJson({ ...FULL_ROW, files: [], junkCount: 4 }) as never;

    expect((await fetchDoorDetail(CFG, 'X.LHA'))?.junkCount).toBe(4);
  });

  it('reads hasDoc from the doc itself when the flag is missing', async () => {
    global.fetch = mockJson({ archiveName: 'X.LHA', doc: 'READ ME' }) as never;

    expect((await fetchDoorDetail(CFG, 'X.LHA'))?.hasDoc).toBe(true);
  });

  it('normalises absent and empty fields to null', async () => {
    global.fetch = mockJson({ archiveName: 'X.LHA', version: '', doc: null }) as never;

    const detail = await fetchDoorDetail(CFG, 'X.LHA');
    expect(detail?.version).toBeNull();
    expect(detail?.doc).toBeNull();
    expect(detail?.suggestedTooltypes).toBeNull();
    expect(detail?.hasDoc).toBe(false);
    expect(detail?.files).toEqual([]);
  });

  it('skips file rows with no path rather than rendering blank lines', async () => {
    global.fetch = mockJson({
      archiveName: 'X.LHA',
      files: [{ size: 10 }, null, 'nope', { path: 'ok.txt', size: 5, isJunk: true }],
    }) as never;

    expect((await fetchDoorDetail(CFG, 'X.LHA'))?.files).toEqual([
      { path: 'ok.txt', size: 5, isJunk: true },
    ]);
  });

  it('returns null for a 200 that is not a door row', async () => {
    // A proxy error page, or a redirect that landed on the SPA: rendering
    // that as an empty door is worse than saying nothing.
    global.fetch = mockJson({ error: 'no such door' }) as never;
    expect(await fetchDoorDetail(CFG, 'X.LHA')).toBeNull();

    global.fetch = mockJson('<html>404</html>') as never;
    expect(await fetchDoorDetail(CFG, 'X.LHA')).toBeNull();
  });

  it('returns null rather than throwing on a failed or unparseable response', async () => {
    global.fetch = mockJson({}, false, 404) as never;
    expect(await fetchDoorDetail(CFG, 'X.LHA')).toBeNull();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    }) as never;
    expect(await fetchDoorDetail(CFG, 'X.LHA')).toBeNull();

    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as never;
    expect(await fetchDoorDetail(CFG, 'X.LHA')).toBeNull();
  });

  it('asks for the archive by name, encoded', async () => {
    const spy = mockJson({ archiveName: 'a b&c.LHA' });
    global.fetch = spy as never;

    await fetchDoorDetail(CFG, 'a b&c.LHA');

    expect(spy.mock.calls[0][0]).toBe(
      'https://doors.example.test/api/door-repo/doors/a%20b%26c.LHA'
    );
  });
});
