/**
 * RETRO GAMES - what the co-sysop knows about a game it did not write.
 *
 * K4 of the plan. RAWG (https://rawg.io/apidocs) when the sysop has put a
 * key in the admin - every platform, release dates, genres, ratings; and
 * Wikipedia's summary endpoint behind it, which needs no key and knows
 * Turrican. OpenRetro, the Amiga database FS-UAE uses, has no public API
 * endpoint (404 on 2026-09-08), so it is not here. Same time-box and cache
 * as Demozoo.
 */
import { cachedLookup, setExternalFetcher, resetExternalCache } from './demozoo';
import axios from 'axios';

export { setExternalFetcher, resetExternalCache };

const RAWG = 'https://api.rawg.io/api/games';
const WIKI = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const TIMEOUT = 3000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

let fetcher = async (url: string): Promise<any> => (await axios.get(url, { timeout: TIMEOUT, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
/** Test seam (games only; demozoo has its own). */
export function setGamesFetcher(f: ((url: string) => Promise<any>) | null): void {
  fetcher = f ?? (async (url) => (await axios.get(url, { timeout: TIMEOUT, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data);
}

export async function lookupGame(title: string, rawgKey?: string): Promise<string> {
  const q = title.trim().slice(0, 80);
  if (!q) return 'Which game?';
  return cachedLookup(`game:${rawgKey ? 'rawg' : 'wiki'}:${q.toLowerCase()}`, async () => {
    if (rawgKey) {
      const data = await fetcher(`${RAWG}?key=${encodeURIComponent(rawgKey)}&search=${encodeURIComponent(q)}&page_size=3`);
      const rows: any[] = data?.results ?? [];
      if (rows.length) {
        return rows.map((g) =>
          `${g.name} (${g.released ?? 'undated'}; ${(g.platforms ?? []).map((p: any) => p?.platform?.name).filter(Boolean).slice(0, 6).join(', ') || 'platforms?'}; ${(g.genres ?? []).map((x: any) => x?.name).filter(Boolean).join('/') || 'genre?'}${g.metacritic ? `; metacritic ${g.metacritic}` : ''}) https://rawg.io/games/${g.slug}`
        ).join('\n');
      }
    }
    const page = await fetcher(`${WIKI}${encodeURIComponent(q.replace(/ /g, '_'))}`);
    if (page?.extract) return `${page.title}${page.description ? ` - ${page.description}` : ''}: ${String(page.extract).slice(0, 900)} ${page.content_urls?.desktop?.page ?? ''}`;
    return `Nothing known about a game called "${q}".`;
  });
}
