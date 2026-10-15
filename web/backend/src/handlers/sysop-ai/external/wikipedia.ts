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

import { createExternalCache } from './cache';

const WIKI = 'https://en.wikipedia.org/w/rest.php/v1';
export const EXTERNAL_TIMEOUT_MS = 8000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = createExternalCache({
  // A throttled edge answers a miss; a 24h-cached miss outlives the
  // throttle by a day (live 2026-09-10: "Amiga" missed for hours while
  // the article exists).
  shouldCache: (value) => !value.startsWith('Wikipedia has nothing'),
});
/** Test seam. */
export function resetWikipediaCache(): void { cache.reset(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setWikipediaFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
}

const cachedLookup = (key: string, build: () => Promise<string>): Promise<string> =>
  cache.lookup(key, build);

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

/** Search, then summarize: one call answers "what is X".
 *
 * A question-shaped query ("who made Turrican") matches *something*
 * verbatim (Turrican II) while its subject ("Turrican") owns the article
 * that names the designer: stopping at the first usable summary answers
 * with the wrong article. So every distinct subject word gets its own
 * best summary, and different articles are joined - the model then holds
 * both the stub and the attribution. Only when every step misses does the
 * caller hear "nothing". Live cases 2026-09-10. */
const WIKI_STOPWORDS = new Set([
  'who', 'what', 'when', 'where', 'which', 'how', 'why', 'is', 'are', 'was',
  'were', 'be', 'by', 'for', 'the', 'a', 'an', 'of', 'on', 'in', 'to', 'did',
  'do', 'does', 'made', 'make', 'about',
]);

async function bestSummary(t: string): Promise<
  { status: 'hit'; key: string; text: string; also: string[] } | { status: 'empty' } | { status: 'failed' }
> {
  let pages: any[] = [];
  try {
    const data = await fetcher(`${WIKI}/search/page?q=${encodeURIComponent(t)}&limit=3`);
    pages = data?.pages ?? [];
  } catch {
    return { status: 'failed' };
  }
  // Exact title first, then title containing the subject, then rank order.
  const subject = t.split(/\s+/).find((w) => !WIKI_STOPWORDS.has(w.toLowerCase())) ?? t;
  const ordered = [...pages].sort((a, b) => {
    const score = (p: any) => {
      const title = String(p.title ?? '').toLowerCase();
      if (title === t.toLowerCase() || title === subject.toLowerCase()) return 0;
      if (title.includes(subject.toLowerCase())) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  for (const top of ordered.slice(0, 3)) {
    try {
      const key = ((top.key ?? top.title ?? '') as string).replace(/ /g, '_');
      const s: any = await fetcher(`${WIKI}/page/summary/${encodeURIComponent(key)}`);
      if (!s?.extract) continue;
      const kind = s.description ? ` (${s.description})` : '';
      const also = ordered.filter((pp) => pp !== top).slice(0, 2).map((pp) => pp.title).filter(Boolean);
      return { status: 'hit', key: key.toLowerCase(), also, text: `${s.title ?? top.title}${kind}\n${String(s.extract).slice(0, 700)}` };
    } catch {
      continue;
    }
  }
  // Summaries failing while search worked is absence, not outage: the
  // outage case is the search itself throwing (status failed above).
  return { status: 'empty' };
}

export async function askWikipedia(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  return cachedLookup(`wiki:ask:${q.toLowerCase()}`, async () => {
    const words = q.split(/\s+/).filter((w) => !WIKI_STOPWORDS.has(w.toLowerCase()));
    const tries = [q, ...(words[0] && words[0].toLowerCase() !== q.toLowerCase() ? [words[0]] : [])];
    const found: Array<{ key: string; text: string; also: string[] }> = [];
    let failed = 0;
    for (const t of tries) {
      const r = await bestSummary(t);
      if (r.status === 'failed') {
        failed++;
        continue;
      }
      if (r.status === 'hit' && !found.some((f) => f.key === r.key)) found.push(r);
    }
    if (!found.length) {
      // Every search threw: the net failed, which is not the same as the
      // article missing. The model must see the difference (grounding rules).
      if (failed === tries.length) return 'No answer from the net right now (Wikipedia unreachable).';
      return `Wikipedia has nothing about "${q}".`;
    }
    const also = found[0].also.filter((a) => !found.some((f) => f.text.startsWith(a)));
    return found.map((f) => f.text).join('\n') + (also.length ? `\nAlso matches: ${also.join(', ')}.` : '');
  });
}
