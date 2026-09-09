/**
 * WIKIPEDIA - "what is X", for the co-sysop's general knowledge.
 *
 * Keyless MediaWiki REST (w/rest.php/v1 - the stable path; the legacy
 * rest_v1 summary that games.ts still uses is not copied). Same shape as
 * external/demozoo: time-boxed axios, identifying UA (Wikimedia policy
 * blocks generic UAs), 24h cache, 1800-char cap, honest sentence on
 * failure, injectable fetcher for tests.
 */
import axios from 'axios';

const WIKI = 'https://en.wikipedia.org/w/rest.php/v1';
export const EXTERNAL_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetWikipediaCache(): void { cache.clear(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setWikipediaFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
}

async function cachedLookup(key: string, build: () => Promise<string>): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  try {
    const value = (await build()).slice(0, 1800);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    return `No answer from the net right now (${(err as Error).message}).`;
  }
}

export async function wikipediaSearch(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  return cachedLookup(`wiki:search:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${WIKI}/search/page?q=${encodeURIComponent(q)}&limit=5`);
    const pages: any[] = data?.pages ?? [];
    if (!pages.length) return `Wikipedia has nothing about "${q}".`;
    return pages.map((p) => `${p.title}${p.description ? ` - ${p.description}` : ''} [${p.key}]`).join('\n');
  });
}

export async function wikipediaSummary(title: string): Promise<string> {
  const t = title.trim().replace(/ /g, '_').slice(0, 120);
  return cachedLookup(`wiki:summary:${t.toLowerCase()}`, async () => {
    const s = await fetcher(`${WIKI}/page/summary/${encodeURIComponent(t)}`);
    if (!s || s.type === 'disambiguation' && !s.extract) return `Wikipedia has no article called "${title}".`;
    const kind = s.description ? ` (${s.description})` : '';
    const extract = String(s.extract ?? '').slice(0, 900);
    return `${s.title ?? title}${kind}\n${extract}`;
  });
}

/** Search, then summarize the top hit: one call answers "what is X". */
export async function askWikipedia(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  let data: any;
  try {
    data = await fetcher(`${WIKI}/search/page?q=${encodeURIComponent(q)}&limit=3`);
  } catch (err) {
    return `No answer from the net right now (${(err as Error).message}).`;
  }
  const pages: any[] = data?.pages ?? [];
  if (!pages.length) return `Wikipedia has nothing about "${q}".`;
  const top = pages[0];
  const summary = await wikipediaSummary(top.key ?? top.title);
  if (pages.length > 1) {
    const also = pages.slice(1, 3).map((p) => p.title).join(', ');
    return `${summary}\nAlso matches: ${also}.`;
  }
  return summary;
}
