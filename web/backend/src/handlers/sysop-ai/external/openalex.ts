/**
 * OPENALEX - "studies about X". 250M+ scholarly works, CC0, keyless.
 * Same demozoo shape: UA, timeout, 24h cache, 1800 cap, fetcher seam.
 */
import axios from 'axios';

const OPENALEX = 'https://api.openalex.org/works';
export const EXTERNAL_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetOpenalexCache(): void { cache.clear(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setOpenalexFetcher(f: Fetcher | null): void {
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

export async function openalexSearch(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  return cachedLookup(`oa:${q.toLowerCase()}`, async () => {
    const data = await fetcher(
      `${OPENALEX}?search=${encodeURIComponent(q)}&per-page=5` +
      `&select=title,publication_year,authorships,cited_by_count,doi`,
    );
    const rows: any[] = data?.results ?? [];
    if (!rows.length) return `No papers about "${q}".`;
    return rows.map((w) => {
      const authors = (w.authorships ?? []).slice(0, 3).map((a: any) => a.author?.display_name).filter(Boolean).join(', ');
      return `${w.publication_year ?? '?'}: ${w.title}${authors ? ` - ${authors}` : ''} (cited ${w.cited_by_count ?? 0})${w.doi ? ` ${w.doi}` : ''}`;
    }).join('\n');
  });
}
