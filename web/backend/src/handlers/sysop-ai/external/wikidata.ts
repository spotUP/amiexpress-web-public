/**
 * WIKIDATA - structured facts ("when was X born"), for the co-sysop.
 *
 * Keyless Wikibase API, same demozoo shape: UA (Wikimedia requires an
 * identifying one), 3s search + 9s entity timeouts, 24h cache, 1800 cap,
 * fetcher seam. Answers label + description + aliases + a pointer to the
 * Wikipedia article when one exists (ask_wikipedia reads it).
 */
import axios from 'axios';

const WBSEARCH = 'https://www.wikidata.org/w/api.php';
const ENTITY = 'https://www.wikidata.org/wiki/Special:EntityData';
export const EXTERNAL_TIMEOUT_MS = 3000;
export const DETAIL_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetWikidataCache(): void { cache.clear(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setWikidataFetcher(f: Fetcher | null): void {
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

export async function wikidataSearch(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  return cachedLookup(`wd:search:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${WBSEARCH}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=5`);
    const rows: any[] = data?.search ?? [];
    if (!rows.length) return `Wikidata knows nothing called "${q}".`;
    return rows.map((r) => `${r.label}${r.description ? ` - ${r.description}` : ''} [${r.id}]`).join('\n');
  });
}

export async function wikidataFacts(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  return cachedLookup(`wd:facts:${q.toLowerCase()}`, async () => {
    const found = await fetcher(`${WBSEARCH}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=1`, DETAIL_TIMEOUT_MS).catch(() => null);
    const top = found?.search?.[0];
    if (!top) return `Wikidata knows nothing called "${q}".`;
    const entity = await fetcher(`${ENTITY}/${top.id}.json`, DETAIL_TIMEOUT_MS).catch(() => null);
    const e = entity?.entities?.[top.id];
    if (!e) return `${top.label}${top.description ? ` - ${top.description}` : ''} [${top.id}].`;
    const aliases: string[] = (e.aliases?.en ?? []).slice(0, 4).map((a: any) => a.value);
    const wikiTitle: string | undefined = e.sitelinks?.enwiki?.title;
    const lines = [`${e.labels?.en?.value ?? top.label}${e.descriptions?.en?.value ? ` - ${e.descriptions.en.value}` : ''} [${top.id}]`];
    if (aliases.length) lines.push(`Also called: ${aliases.join(', ')}.`);
    if (wikiTitle) lines.push(`Read more with ask_wikipedia "${wikiTitle}".`);
    return lines.join('\n');
  });
}
