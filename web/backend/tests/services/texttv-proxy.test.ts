/**
 * texttv-proxy.service: offline-safe cases. The fetcher is injected, so no
 * test touches the network - the mirror's shape is pinned by recorded
 * bytes, the way knowledge.test.ts pins the chatbot's texttv tool.
 */
import {
  fetchTextTvPage,
  clearTextTvCache,
  isTextTvPage,
  texttvPageUrl,
  slimTextTvBody,
  TEXTTV_API,
  TEXTTV_CACHE_MS,
} from '../../src/services/texttv-proxy.service';

function stubFetcher(status: number, body: string, calls: { n: number }) {
  return async (_url: string, _init?: any) => {
    calls.n++;
    return { status, text: async () => body };
  };
}

describe('texttv-proxy.service', () => {
  beforeEach(() => clearTextTvCache());

  test('page range is 100-999', () => {
    expect(isTextTvPage(100)).toBe(true);
    expect(isTextTvPage(999)).toBe(true);
    expect(isTextTvPage(99)).toBe(false);
    expect(isTextTvPage(1000)).toBe(false);
    expect(isTextTvPage('100' as any)).toBe(false);
    expect(isTextTvPage(NaN)).toBe(false);
  });

  test('URL carries app= and the plaintext flag', () => {
    expect(texttvPageUrl(100)).toBe(
      `${TEXTTV_API}/100?app=amiexpress-web-bbs&includePlainTextContent=1`,
    );
  });

  test('serves the slimmed page (door fields verbatim, HTML gone)', async () => {
    const calls = { n: 0 };
    const fat = '[{"num":"100","title":"News","content":["<div>x</div>"],' +
      '"content_plain":["100 line"],"next_page":"101","prev_page":"100"}]';
    const r = await fetchTextTvPage(100, stubFetcher(200, fat, calls));
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual([{
      num: '100',
      title: 'News',
      content_plain: ['100 line'],
      next_page: '101',
      prev_page: '100',
    }]);
    expect(r.cached).toBe(false);
    expect(calls.n).toBe(1);
  });

  test('second fetch inside TTL comes from cache, not the mirror', async () => {
    const calls = { n: 0 };
    await fetchTextTvPage(300, stubFetcher(200, '[{"num":"300"}]', calls));
    const r = await fetchTextTvPage(300, stubFetcher(200, '[{"num":"300"}]', calls));
    expect(r.cached).toBe(true);
    expect(calls.n).toBe(1);
    expect(TEXTTV_CACHE_MS).toBe(5 * 60 * 1000);
  });

  test('non-200 upstream throws (the route turns it into a 502)', async () => {
    const calls = { n: 0 };
    await expect(fetchTextTvPage(100, stubFetcher(301, '<html>', calls))).rejects.toThrow(
      /upstream answered 301/,
    );
  });

  test('transport failure throws (the route turns it into a 502)', async () => {
    const failing = async () => {
      throw new Error('socket hang up');
    };
    await expect(fetchTextTvPage(100, failing as any)).rejects.toThrow('socket hang up');
  });

  test('out-of-range page never touches the network', async () => {
    const calls = { n: 0 };
    await expect(fetchTextTvPage(99, stubFetcher(200, '[]', calls))).rejects.toThrow();
    expect(calls.n).toBe(0);
  });

  test('slims the HTML content away but keeps the door fields verbatim', () => {
    const fat =
      '[{"num":"100","title":"T","content":["<div>26KB of divs</div>"],' +
      '"content_plain":["100 line"],"next_page":"101","prev_page":"100",' +
      '"date_updated_unix":1,"permalink":"p","id":"i","breadcrumbs":[]}]';
    const slim = JSON.parse(slimTextTvBody(fat));
    expect(slim).toEqual([{
      num: '100',
      title: 'T',
      content_plain: ['100 line'],
      next_page: '101',
      prev_page: '100',
    }]);
    expect(slimTextTvBody(fat)).not.toContain('div');
  });

  test('an off-air page stays an empty array (the door reports it, not silence)', () => {
    expect(slimTextTvBody('[]')).toBe('[]');
  });

  test('a non-array upstream throws', () => {
    expect(() => slimTextTvBody('{"num":"100"}')).toThrow(/array/);
  });
});
