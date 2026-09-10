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
    // A miss is not cached: "Wikipedia has nothing" usually means a
    // throttled edge, and a 24h-cached miss outlives the throttle by a day
    // (live 2026-09-10: "Amiga" missed for hours while the article exists).
    if (!value.startsWith('Wikipedia has nothing')) cache.set(key, { at: Date.now(), value });
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

/** Search, then summarize the top hit: one call answers "what is X".
 *
 * A question-shaped query ("Turrican video game developer") often matches
 * nothing verbatim while its subject ("Turrican") has an article: on a
 * miss the likely subject - the first significant word - is tried next,
 * and a summary that fails falls through to the next hit. Only when every
 * step misses does the caller hear "nothing". Live case 2026-09-10. */
const WIKI_STOPWORDS = new Set([
  'who', 'what', 'when', 'where', 'which', 'how', 'why', 'is', 'are', 'was',
  'were', 'be', 'by', 'for', 'the', 'a', 'an', 'of', 'on', 'in', 'to', 'did',
  'do', 'does', 'made', 'make', 'about',
]);

export async function askWikipedia(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  return cachedLookup(`wiki:ask:${q.toLowerCase()}`, async () => {
    const words = q.split(/\s+/).filter((w) => !WIKI_STOPWORDS.has(w.toLowerCase()));
    const tries = [q, ...(words.length > 1 ? [words[0]] : [])];
    let threw = 0;
    let ran = 0;
    for (const t of tries) {
      let pages: any[] = [];
      try {
        ran++;
        const data = await fetcher(`${WIKI}/search/page?q=${encodeURIComponent(t)}&limit=3`);
        pages = data?.pages ?? [];
      } catch {
        threw++;
        continue;
      }
      for (const top of pages.slice(0, 3)) {
        let s: any = null;
        try {
          ran++;
          s = await fetcher(`${WIKI}/page/summary/${encodeURIComponent(((top.key ?? top.title ?? '') as string).replace(/ /g, '_'))}`);
        } catch {
          threw++;
          continue;
        }
        if (!s?.extract) continue;
        const kind = s.description ? ` (${s.description})` : '';
        const summary = `${s.title ?? top.title}${kind}\n${String(s.extract).slice(0, 900)}`;
        if (top === pages[0] && pages.length > 1) {
          const also = pages.slice(1, 3).map((p) => p.title).join(', ');
          return `${summary}\nAlso matches: ${also}.`;
        }
        return summary;
      }
    }
    // Every fetch threw: the net failed, which is not the same as the
    // article missing. The model must see the difference (grounding rules).
    if (threw > 0 && threw === ran) return 'No answer from the net right now (Wikipedia unreachable).';
    return `Wikipedia has nothing about "${q}".`;
  });
}
