/**
 * F7: the co-sysop's external lookup caches grew for the life of the process.
 *
 * Every external module kept its own Map keyed by CALLER-SUPPLIED text and
 * checked the TTL only on a read, so a key asked about once was never looked
 * at again and never removed. On a board that never restarts that is an
 * unbounded map per module, eight of them. One bounded cache is shared now:
 * these pin the bound, the eviction order, and the expiry.
 */
import {
  createExternalCache,
  EXTERNAL_CACHE_MAX_ENTRIES,
  EXTERNAL_ANSWER_CAP,
} from '../../../src/handlers/sysop-ai/external/cache';
import { searchProductions, setExternalFetcher, resetExternalCache } from '../../../src/handlers/sysop-ai/external/demozoo';

afterEach(() => { setExternalFetcher(null); resetExternalCache(); });

describe('the external lookup cache is bounded', () => {
  it('does not grow past its entry bound when every lookup is a different question', async () => {
    const cache = createExternalCache({ maxEntries: 3 });
    for (let i = 0; i < 200; i++) {
      await cache.lookup(`q:${i}`, async () => `answer ${i}`);
    }
    expect(cache.size()).toBe(3);
  });

  it('evicts the coldest key first, so a key just read survives and the oldest does not', async () => {
    const cache = createExternalCache({ maxEntries: 2 });
    const built: string[] = [];
    const build = (key: string) => async () => { built.push(key); return `v:${key}`; };

    await cache.lookup('a', build('a'));
    await cache.lookup('b', build('b'));
    // Reading 'a' makes it the warmest key; 'b' is now the coldest.
    await cache.lookup('a', build('a'));
    await cache.lookup('c', build('c'));

    expect(built).toEqual(['a', 'b', 'c']);
    // 'a' is still cached (no rebuild); 'b' was evicted (rebuilt).
    await cache.lookup('a', build('a'));
    await cache.lookup('b', build('b'));
    expect(built).toEqual(['a', 'b', 'c', 'b']);
    expect(cache.size()).toBe(2);
  });

  it('drops an entry that outlived its TTL instead of serving it', async () => {
    const cache = createExternalCache({ ttlMs: 10, maxEntries: 50 });
    let builds = 0;
    const build = async () => { builds++; return `built ${builds}`; };

    expect(await cache.lookup('k', build)).toBe('built 1');
    expect(await cache.lookup('k', build)).toBe('built 1');
    expect(builds).toBe(1);

    await new Promise((r) => setTimeout(r, 25));
    expect(await cache.lookup('k', build)).toBe('built 2');
    expect(builds).toBe(2);
    expect(cache.size()).toBe(1);
  });

  it('keeps a value out of the cache when shouldCache refuses it', async () => {
    const cache = createExternalCache({ shouldCache: (v) => !v.startsWith('nothing') });
    await cache.lookup('miss', async () => 'nothing about that');
    expect(cache.size()).toBe(0);
    await cache.lookup('hit', async () => 'something about that');
    expect(cache.size()).toBe(1);
  });

  it('caps the answer and answers a sentence rather than throwing', async () => {
    const cache = createExternalCache();
    const long = await cache.lookup('long', async () => 'x'.repeat(EXTERNAL_ANSWER_CAP + 500));
    expect(long).toHaveLength(EXTERNAL_ANSWER_CAP);
    const dead = await cache.lookup('dead', async () => { throw new Error('ECONNREFUSED'); });
    expect(dead).toContain('No answer from the net right now');
    // A failure is not cached: only the capped answer is.
    expect(cache.size()).toBe(1);
  });

  it('ships a sane default bound', () => {
    expect(EXTERNAL_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(EXTERNAL_CACHE_MAX_ENTRIES).toBeLessThanOrEqual(1000);
  });

  it('still answers a repeated question from the cache after the rewire', async () => {
    let fetched = 0;
    setExternalFetcher(async () => { fetched++; return { results: [{ title: 'Hardwired', author_nicks: [{ name: 'Crionics' }] }] }; });
    const a = await searchProductions('Hardwired');
    const b = await searchProductions('Hardwired');
    expect(a).toBe(b);
    expect(fetched).toBe(1);
  });
});
