/**
 * WEB_ plain-HTTP Text-TV proxy for 68K doors (and classic Amigas).
 *
 * api.texttv.nu is HTTPS-only (plain HTTP 301s); the 68K stack cannot do
 * TLS, so no door can fetch it directly. Node fetches over TLS and serves
 * the verbatim JSON array over plain HTTP. Public, read-only, validated
 * page range, short in-memory cache per page (a reader turning pages must
 * not hammer the mirror; five minutes is fresh for teletext).
 *
 * Same upstream contract as handlers/sysop-ai/external/texttv.ts and
 * services/news-bulletins.ts (keyless, `app=` mandatory) - one fetcher
 * shape, three readers.
 */

export const TEXTTV_API = 'https://api.texttv.nu/api/get';
export const TEXTTV_APP = 'amiexpress-web-bbs';
export const TEXTTV_TIMEOUT_MS = 15000;
export const TEXTTV_CACHE_MS = 5 * 60 * 1000;

export type TextTvFetcher = (url: string, init?: any) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

const defaultFetcher: TextTvFetcher = (url, init) =>
  fetch(url, init) as unknown as Promise<{ status: number; text(): Promise<string> }>;

interface CacheEntry {
  at: number;
  status: number;
  body: string;
}

const cache = new Map<number, CacheEntry>();

/** Test seam: drop the cache between cases. */
export function clearTextTvCache(): void {
  cache.clear();
}

export function texttvPageUrl(page: number): string {
  return `${TEXTTV_API}/${page}?app=${TEXTTV_APP}&includePlainTextContent=1`;
}

export function isTextTvPage(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 999
  );
}

export interface TextTvPage {
  status: number;
  body: string;
  cached: boolean;
}

/**
 * Slim an upstream page array to what a 68K door can hold: the HTML
 * `content` half of a page is ~26KB of divs the door never reads, and a
 * door-side buffer big enough for the fattest page is chip RAM that
 * every page pays for. Keeps num/title/content_plain/next_page/
 * prev_page verbatim; an empty upstream array (off-air page) stays an
 * empty array so the door still reports "not on air", not silence.
 */
export function slimTextTvBody(upstreamBody: string): string {
  const parsed: unknown = JSON.parse(upstreamBody);
  if (!Array.isArray(parsed)) {
    throw new Error('texttv: upstream did not answer an array');
  }
  const slim = parsed.map((row: any) => ({
    num: row?.num ?? null,
    title: row?.title ?? null,
    content_plain: row?.content_plain ?? null,
    next_page: row?.next_page ?? null,
    prev_page: row?.prev_page ?? null,
  }));
  return JSON.stringify(slim);
}

/**
 * Fetch one page's JSON array (verbatim bytes - the door parses and
 * converts). Throws on transport failure or non-200 upstream; the route
 * turns that into a 502 so a door can tell "mirror silent" from "no page".
 */
export async function fetchTextTvPage(
  page: number,
  fetcher: TextTvFetcher = defaultFetcher,
): Promise<TextTvPage> {
  if (!isTextTvPage(page)) {
    throw new Error(`texttv: page ${String(page)} is not 100-999`);
  }
  const now = Date.now();
  const hit = cache.get(page);
  if (hit && now - hit.at < TEXTTV_CACHE_MS) {
    return { status: hit.status, body: hit.body, cached: true };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TEXTTV_TIMEOUT_MS);
  try {
    const res = await fetcher(texttvPageUrl(page), {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'amiexpress-web-bbs/1.0 (BBS Text-TV proxy; https://bbs.uprough.net)',
        Accept: 'application/json',
      },
    });
    const body = await res.text();
    if (res.status !== 200) {
      throw new Error(`texttv: upstream answered ${res.status}`);
    }
    const slim = slimTextTvBody(body);
    cache.set(page, { at: now, status: res.status, body: slim });
    return { status: res.status, body: slim, cached: false };
  } finally {
    clearTimeout(timer);
  }
}
