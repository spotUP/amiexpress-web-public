/**
 * The co-sysop knows the door archive and the BBS file listing - cached,
 * time-boxed, and honest when the net does not answer.
 *
 * Fetchers are injected: what is pinned is the shape of the answer, the
 * cache (a second ask does not fetch), and that a dead net yields a
 * sentence rather than a hang or a throw. Fixture shapes come from the
 * live endpoints (probed 2026-09-09), not the doc alone.
 */
import {
  searchDoors, doorDetail, doorRandom, doorStats,
  searchFiles, fileDetail, fileRandom, listingStats, listingFacts,
  setExternalFetcher, resetExternalCache,
} from '../../../src/handlers/sysop-ai/external/doorrepo';

const doorRow = {
  archiveName: 'MST-CM20.LHA', system: 'AmiExpress', name: 'Chat-O-Meter',
  doorType: 'XIM', author: 'Killraven/Mystic', releaseGroup: 'MST',
  releaseGroupFullName: 'Mystic', description: 'Chat-O-meter',
  votesUp: 4, votesDown: 1, downloadUrl: '/api/door-repo/archive/MST-CM20.LHA',
  fileIdDiz: 'CHAT-O-METER v2\nby Mystic',
};

beforeEach(() => { resetExternalCache(); setExternalFetcher(null); });
afterAll(() => { setExternalFetcher(null); });

describe('door archive', () => {
  it('searches, and the second ask comes from the cache', async () => {
    let fetched = 0;
    setExternalFetcher(async (url) => {
      fetched++;
      expect(url).toContain('/doors?q=chat');
      return { rows: [doorRow] };
    });
    const a = await searchDoors('chat');
    expect(a).toContain('Chat-O-Meter');
    expect(a).toContain('MST-CM20.LHA');
    await searchDoors('CHAT');
    expect(fetched).toBe(1);
  });

  it('details a door with score and download', async () => {
    setExternalFetcher(async () => doorRow);
    const a = await doorDetail('mst-cm20.lha');
    expect(a).toContain('Score 3 (4/1)');
    expect(a).toContain('/api/door-repo/archive/MST-CM20.LHA');
  });

  it('admits unknown doors plainly', async () => {
    setExternalFetcher(async () => ({ error: 'no such door' }));
    expect(await doorDetail('NOPE.LHA')).toContain('No door');
  });

  it('randoms and stats', async () => {
    setExternalFetcher(async (url) => {
      if (url.endsWith('/doors/random')) return doorRow;
      return { total: 5690, hiddenCount: 215, bySystem: [{ value: 'AmiExpress', n: 2943 }], byGroup: [{ value: 'SAD', n: 143 }] };
    });
    expect(await doorRandom()).toContain('Surprise from the archive');
    expect(await doorStats()).toContain('5690');
  });
});

describe('file listing', () => {
  const fileRow = {
    id: 860, filename: 'STCOLL.WRP', sizeBytes: 596939, dateIso: '1990-04-18',
    flag: 'N', description: 'Soundtracker Tools.',
  };

  it('searches files with human sizes', async () => {
    setExternalFetcher(async () => ({ rows: [fileRow] }));
    const a = await searchFiles('tracker');
    expect(a).toContain('STCOLL.WRP');
    expect(a).toContain('583 KB');
  });

  it('marks nuked files instead of hiding them', async () => {
    setExternalFetcher(async () => ({ rows: [{ ...fileRow, flag: 'D', sizeBytes: null, sizeNote: '>NUKED<' }] }));
    expect(await searchFiles('x')).toContain('NUKED');
  });

  it('details, randoms, stats and facts', async () => {
    setExternalFetcher(async (url) => {
      if (url.includes('/files/')) return fileRow;
      if (url.endsWith('/random')) return fileRow;
      if (url.endsWith('/stats')) return { total: 299437 };
      return { span: { firstDate: '1988-01-01', lastDate: '2038-08-10', firstFile: { filename: 'DMCS.WRP' }, lastFile: { filename: 'VGS-MIND.LHA' } }, firstDiz: { filename: 'SBDOC1.DMS', dateIso: '1991-03-09' } };
    });
    expect(await fileDetail('860')).toContain('STCOLL.WRP');
    expect(await fileRandom()).toContain('Surprise from the listing');
    expect(await listingStats()).toContain('299437');
    const facts = await listingFacts();
    expect(facts).toContain('1988-01-01');
    expect(facts).toContain('SBDOC1.DMS');
  });

  it('a dead net yields a sentence', async () => {
    setExternalFetcher(async () => { throw new Error('down'); });
    expect(await searchDoors('x')).toContain('No answer from the net');
    expect(await searchFiles('x')).toContain('No answer from the net');
  });
});
