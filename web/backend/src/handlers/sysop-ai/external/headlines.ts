/**
 * HEADLINES - earthquakes (USGS, keyless GeoJSON) and tech news (Hacker
 * News Algolia, keyless). Two small surfaces, one file, same demozoo
 * shape: UA, timeout, 24h cache, 1800 cap, fetcher seams.
 */
import axios from 'axios';

import { createExternalCache } from './cache';

const USGS = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const HN = 'https://hn.algolia.com/api/v1/search';
export const EXTERNAL_TIMEOUT_MS = 8000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = createExternalCache();
/** Test seam. */
export function resetHeadlinesCache(): void { cache.reset(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setHeadlinesFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
}

const cachedLookup = (key: string, build: () => Promise<string>): Promise<string> =>
  cache.lookup(key, build);

export async function recentQuakes(minMagnitude = 4.5): Promise<string> {
  return cachedLookup('quakes:recent', async () => {
    const data = await fetcher(`${USGS}?format=geojson&limit=5&orderby=time&minmagnitude=${minMagnitude}`);
    const rows: any[] = data?.features ?? [];
    if (!rows.length) return 'No recent earthquakes over magnitude 4.5.';
    // Everything the model may say about a quake must come from here:
    // a one-liner starves it into inventing depth, towns and dates
    // (live 2026-09-10: a whole JSON block of fiction). So the line
    // carries magnitude, depth, place and full UTC time - and nothing
    // beyond this list exists.
    return rows.map((f) => {
      const p = f.properties ?? {};
      const depth = f.geometry?.coordinates?.[2];
      const when = p.time ? new Date(p.time).toISOString().replace(/\.\d+Z$/, 'Z') : 'undated';
      const deep = depth !== undefined && depth !== null ? `, ${Math.round(depth)} km deep` : '';
      return `M${p.mag ?? '?'}${deep}, ${p.place ?? 'unknown place'}, ${when}`;
    }).join('\n') + '\nThese are the only recent quakes known - do not add others.';
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
