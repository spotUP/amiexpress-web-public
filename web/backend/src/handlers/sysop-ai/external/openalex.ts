/**
 * OPENALEX - "studies about X". 250M+ scholarly works, CC0, keyless.
 * Same demozoo shape: UA, timeout, 24h cache, 1800 cap, fetcher seam.
 */
import axios from 'axios';

import { createExternalCache } from './cache';

const OPENALEX = 'https://api.openalex.org/works';
export const EXTERNAL_TIMEOUT_MS = 8000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = createExternalCache();
/** Test seam. */
export function resetOpenalexCache(): void { cache.reset(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setOpenalexFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
}

const cachedLookup = (key: string, build: () => Promise<string>): Promise<string> =>
  cache.lookup(key, build);

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
