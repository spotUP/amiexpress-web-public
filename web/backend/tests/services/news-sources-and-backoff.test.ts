/**
 * The magazine's source list after the 2026-10-14 live-host probe, and the
 * per-host back-off that stops a throttled host (Reddit answers 429 to a
 * datacenter IP) from being asked again on every tick.
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
  NEWS_BULLETIN_SOURCES,
  REDDIT_HOST_GAP_MS,
  REDDIT_INTERVAL_MS,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  backoffDelayMs,
  parseRetryAfter,
  fetchFeedUrl,
  hostHeldUntil,
  resetHostBackoff,
} from '../../src/services/news-bulletins';

jest.mock('axios');
const get = axios.get as unknown as jest.Mock;

const byFile = (f: string) => NEWS_BULLETIN_SOURCES.find((s) => s.file === f);

describe('news sources', () => {
  it('oss-security reads the seclists RSS, not the HTML index', () => {
    const s = byFile('bull16.txt')!;
    expect(s.url).toBe('https://seclists.org/rss/oss-sec.rss');
    expect(s.title).toBe('oss-security - the open wall');
  });

  it('dead or unfetchable sources are gone, remaining numbers unchanged', () => {
    for (const f of ['bull13.txt', 'bull17.txt', 'bull46.txt', 'bull47.txt', 'bull48.txt', 'bull49.txt']) {
      expect(byFile(f)).toBeUndefined();
    }
    const urls = NEWS_BULLETIN_SOURCES.map((s) => s.url ?? '').join('\n');
    expect(urls).not.toMatch(/packetstorm|phrack\.org|spycloud|0x00sec|socradar|www\.textfiles\.com|kelacyber/);
    expect(byFile('bull14.txt')!.title).toBe('Crackmes - new challenges to reverse');
    expect(byFile('bull44.txt')!.title).toMatch(/urbex/);
    // textfiles.com has no HTTPS and no blog.xml; Jason Scott's blog feed lives on ascii.textfiles.com.
    expect(byFile('bull54.txt')!.url).toBe('https://ascii.textfiles.com/feed');
  });

  it('BullHelp lists exactly the sources that exist', () => {
    const help = fs.readFileSync(path.join(__dirname, '../../../../Bulletins/BullHelp.txt'), 'utf8');
    const listed = [...help.matchAll(/^#(\d+)\s+(.+?)\s*$/gm)].map((m) => `${m[1]}`).filter((n) => parseInt(n, 10) >= 13);
    const have = NEWS_BULLETIN_SOURCES.map((s) => s.file.replace(/\D/g, '')).filter((n) => parseInt(n, 10) >= 13);
    expect(listed.sort()).toEqual(have.sort());
  });

  it('Project Zero reads its current feed (the Blogger URL redirects away from ?max-results)', () => {
    expect(byFile('bull22.txt')!.url).toBe('https://projectzero.google/feed.xml');
  });

  it('every subreddit is slow: 60 s host gap, one ask per 3 hours', () => {
    const reddit = NEWS_BULLETIN_SOURCES.filter((s) => /reddit\.com/.test(s.url ?? ''));
    expect(reddit).toHaveLength(11);
    for (const s of reddit) {
      expect(s.hostGapMs).toBe(REDDIT_HOST_GAP_MS);
      expect(s.intervalMs).toBe(REDDIT_INTERVAL_MS);
    }
    expect(REDDIT_HOST_GAP_MS).toBeGreaterThanOrEqual(60_000);
    expect(REDDIT_INTERVAL_MS).toBeGreaterThanOrEqual(3 * 3600_000);
  });
});

describe('host back-off on HTTP 429', () => {
  beforeEach(() => { resetHostBackoff(); get.mockReset(); });

  const throttled = (retryAfter?: string) =>
    Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} },
    });

  it('parses Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfter('120', 0)).toBe(120_000);
    expect(parseRetryAfter(new Date(90_000).toUTCString(), 30_000)).toBe(60_000);
    expect(parseRetryAfter(undefined, 0)).toBeNaN();
  });

  it('doubles per consecutive 429 up to a cap, and Retry-After wins', () => {
    expect(backoffDelayMs(1, NaN)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelayMs(2, NaN)).toBe(2 * BACKOFF_BASE_MS);
    expect(backoffDelayMs(3, NaN)).toBe(4 * BACKOFF_BASE_MS);
    expect(backoffDelayMs(30, NaN)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelayMs(5, 90_000)).toBe(90_000);
    expect(backoffDelayMs(1, 99 * 3600_000)).toBe(BACKOFF_MAX_MS);
  });

  it('after one 429 the host is not asked again, whichever subreddit is next', async () => {
    get.mockRejectedValueOnce(throttled('300'));
    const first = await fetchFeedUrl('https://www.reddit.com/r/Amiga/.rss', { hostGapMs: 0 });
    expect(first.body).toBeNull();
    expect(first.status).toBe(429);
    expect(hostHeldUntil('https://www.reddit.com/r/sdr/.rss')).toBeGreaterThan(Date.now() + 250_000);
    const second = await fetchFeedUrl('https://www.reddit.com/r/sdr/.rss', { hostGapMs: 0 });
    expect(second.body).toBeNull();
    expect(second.error).toMatch(/on hold/);
    expect(get).toHaveBeenCalledTimes(1);          // the second request never left the board
  });

  it('another host is unaffected, and a success after the hold clears the strikes', async () => {
    get.mockRejectedValueOnce(throttled());
    await fetchFeedUrl('https://www.reddit.com/r/Amiga/.rss', { hostGapMs: 0 });
    get.mockResolvedValueOnce({ status: 200, data: '<rss/>', headers: {} });
    const other = await fetchFeedUrl('https://seclists.org/rss/oss-sec.rss', { hostGapMs: 0 });
    expect(other.body).toBe('<rss/>');
    expect(hostHeldUntil('https://seclists.org/x')).toBe(0);
  });
});
