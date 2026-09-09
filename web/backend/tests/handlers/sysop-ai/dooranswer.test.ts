/**
 * The co-sysop asks the wider scene through the doorserver's /answer
 * fan-out - cached, time-boxed, and honest when the net does not answer.
 *
 * Fetchers are injected: what is pinned is the shape of the answer
 * (attributed lines, down-source honesty, stale marking), the cache (a
 * second ask does not fetch), and that a dead net yields a sentence
 * rather than a hang or a throw. Fixture shapes come from the live
 * endpoints (probed 2026-09-10), not the doc alone.
 */
import {
  askScene, sceneRandom, sceneLatest, checkLink,
  setAnswerFetcher, resetAnswerCache,
} from '../../../src/handlers/sysop-ai/external/dooranswer';

const answerRow = {
  query: 'revision', mode: 'search', stale: false,
  results: [
    { source: 'Pouët', title: 'Revision 2011 Invitation', detail: 'demo,invitation by edhellon', url: 'https://www.pouet.net/prod.php?which=56621' },
    { source: 'AsciiArena', title: 'Revision 11 Fix', detail: '2o81-rEx.txt', url: 'https://asciiarena.se/release/2o81-rEx.txt' },
  ],
  sources: [
    { id: 'pouet', name: 'Pouët.net', ok: true, ms: 300 },
    { id: 'demozoo', name: 'Demozoo', ok: false, ms: 5, detail: 'boom' },
  ],
};

beforeEach(() => { resetAnswerCache(); setAnswerFetcher(null); });
afterAll(() => { setAnswerFetcher(null); });

describe('scene answer', () => {
  it('searches with attributed lines and names the down sources', async () => {
    let fetched = 0;
    setAnswerFetcher(async (url) => {
      fetched++;
      expect(url).toContain('/answer?q=revision');
      return answerRow;
    });
    const a = await askScene('revision');
    expect(a).toContain('Revision 2011 Invitation');
    expect(a).toContain('[Pouët]');
    expect(a).toContain('https://www.pouet.net/prod.php?which=56621');
    expect(a).toContain('Demozoo is down');
    await askScene('REVISION');
    expect(fetched).toBe(1);
  });

  it('marks a stale answer as last-known', async () => {
    setAnswerFetcher(async () => ({ ...answerRow, stale: true }));
    expect(await askScene('x')).toContain('last-known answer');
  });

  it('admits an empty scene plainly', async () => {
    setAnswerFetcher(async () => ({ results: [], sources: [] }));
    expect(await askScene('zzz')).toContain('nothing about');
  });

  it('randoms and latests', async () => {
    setAnswerFetcher(async (url) => {
      if (url.includes('mode=random')) return { results: [answerRow.results[0]], sources: [] };
      return { results: [], sources: [] };
    });
    expect(await sceneRandom()).toContain('Surprise from the scene');
    expect(await sceneRandom()).toContain('Revision 2011 Invitation');
    expect(await sceneLatest()).toContain('No latest arrivals');
  });

  it('checks links alive and dead', async () => {
    setAnswerFetcher(async () => ({ url: 'https://files.scene.org/', ok: true, status: 200 }));
    expect(await checkLink('https://files.scene.org/')).toContain('is alive');
    expect(await checkLink('http://insecure/')).toContain('https URL');
  });

  it('a dead net yields a sentence', async () => {
    setAnswerFetcher(async () => { throw new Error('down'); });
    expect(await askScene('x')).toContain('No answer from the net');
  });
});
