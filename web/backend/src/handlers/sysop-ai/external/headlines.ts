/**
 * HEADLINES - earthquakes (USGS, keyless GeoJSON) and tech news (Hacker
 * News Algolia, keyless). Two small surfaces, one file, same demozoo
 * shape: UA, timeout, 24h cache, 1800 cap, fetcher seams.
 */
import axios from 'axios';

const USGS = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const HN = 'https://hn.algolia.com/api/v1/search';
export const EXTERNAL_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetHeadlinesCache(): void { cache.clear(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setHeadlinesFetcher(f: Fetcher | null): void {
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

export async function recentQuakes(minMagnitude = 4.5): Promise<string> {
  return cachedLookup('quakes:recent', async () => {
    const data = await fetcher(`${USGS}?format=geojson&limit=5&orderby=time&minmagnitude=${minMagnitude}`);
    const rows: any[] = data?.features ?? [];
    if (!rows.length) return 'No recent earthquakes over magnitude 4.5.';
    return rows.map((f) => {
      const p = f.properties ?? {};
      const when = p.time ? new Date(p.time).toISOString().slice(0, 16).replace('T', ' ') : 'undated';
      return `M${p.mag ?? '?'} ${p.place ?? 'unknown'} (${when} UTC)`;
    }).join('\n');
  });
}

export async function hnSearch(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  return cachedLookup(`hn:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${HN}?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=5`);
    const rows: any[] = data?.hits ?? [];
    if (!rows.length) return `Hacker News has nothing about "${q}".`;
    return rows.map((h) => `${h.title} (${h.points ?? 0} pts, ${h.num_comments ?? 0} comments)${h.url ? ` ${h.url}` : ''}`).join('\n');
  });
}
