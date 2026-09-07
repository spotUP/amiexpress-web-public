/**
 * DEMOZOO - the scene's own database, for the co-sysop's answers about
 * demos, groups and parties. https://demozoo.org/api/v1/ - public JSON, no
 * key. K4 of thoughts/shared/plans/2026-09-08-ai-sysop-knowledge.md.
 *
 * Every call is time-boxed and cached for a day: a reply must not wait on
 * the internet twice for the same question, and never for long.
 */
import axios from 'axios';

const BASE = 'https://demozoo.org/api/v1';
export const EXTERNAL_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetExternalCache(): void { cache.clear(); }

export type Fetcher = (url: string) => Promise<any>;
let fetcher: Fetcher = async (url) => (await axios.get(url, { timeout: EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
/** Test seam: what fetches. */
export function setExternalFetcher(f: Fetcher | null): void {
  fetcher = f ?? (async (url) => (await axios.get(url, { timeout: EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data);
}

/** Cached, time-boxed, and an honest sentence when the net does not answer. */
export async function cachedLookup(key: string, build: () => Promise<string>): Promise<string> {
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

const names = (xs: any[] | undefined) => (xs ?? []).map((x) => x?.name ?? x?.releaser?.name).filter(Boolean);

export async function searchProductions(title: string): Promise<string> {
  const q = title.trim().slice(0, 80);
  return cachedLookup(`dz:prod:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${BASE}/productions/?title=${encodeURIComponent(q)}&limit=5`);
    const rows: any[] = data?.results ?? [];
    if (!rows.length) return `Demozoo has no production called "${q}".`;
    return rows.map((p) =>
      `${p.title} by ${names(p.author_nicks).join(', ') || 'unknown'} (${p.release_date ?? 'undated'}; ${names(p.platforms).join('/') || 'platform?'}; ${names(p.types).join('/') || 'type?'}) ${p.demozoo_url ?? ''}`
    ).join('\n');
  });
}

export async function searchGroups(name: string): Promise<string> {
  const q = name.trim().slice(0, 80);
  return cachedLookup(`dz:group:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${BASE}/releasers/?name=${encodeURIComponent(q)}&limit=5`);
    const rows: any[] = data?.results ?? [];
    if (!rows.length) return `Demozoo has no group or scener called "${q}".`;
    return rows.map((r) => `${r.name} (${r.is_group ? 'group' : 'scener'}) https://demozoo.org/${r.is_group ? 'groups' : 'sceners'}/${r.id}/`).join('\n');
  });
}

export async function searchParties(name: string): Promise<string> {
  const q = name.trim().slice(0, 80);
  return cachedLookup(`dz:party:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${BASE}/parties/?name=${encodeURIComponent(q)}&limit=5`);
    const rows: any[] = data?.results ?? [];
    if (!rows.length) return `Demozoo has no party called "${q}".`;
    return rows.map((p) => `${p.name}: ${p.start_date ?? '?'} to ${p.end_date ?? '?'}${p.location ? `, ${p.location}` : ''} ${p.demozoo_url ?? ''}`).join('\n');
  });
}
