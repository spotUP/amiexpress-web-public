/**
 * SVT TEXT-TV via texttv.nu - Swedish news/sport/weather headlines.
 *
 * Keyless REST (official docs: https://texttv.nu/blogg/texttv-api).
 * The `app` client id is REQUIRED - without it the API may stop answering,
 * so it is a constant here, never a parameter. `includePlainTextContent=1`
 * returns content_plain (no HTML stripping on our side), ranges fetch in
 * one call (100-104), and next_page/prev_page paginate. texttv.nu is an
 * unofficial mirror, not SVT - the tool says so when asked, never
 * unprompted. Same demozoo shape otherwise.
 */
import axios from 'axios';

const TEXTTV = 'https://api.texttv.nu/api/get';
/** Client id the API requires. Never omit, never parametrize. */
export const TEXTTV_APP = 'amiexpress-web-bbs';
export const EXTERNAL_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

/** The pages worth naming to the model; anything numeric still works. */
export const TEXTTV_PAGES: Record<string, string> = {
  '100': 'latest news', '101-103': 'domestic news', '104-105': 'foreign news',
  '300-302': 'sport', '330': 'results service', '376-395': 'goal service',
  '400-401': 'weather', '600': 'TV listings', '700': 'index',
};

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetTexttvCache(): void { cache.clear(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setTexttvFetcher(f: Fetcher | null): void {
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

function cleanPlain(raw: unknown): string {
  return String(raw ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .join('\n');
}

export async function texttvPage(page: string): Promise<string> {
  const p = page.trim().slice(0, 11);
  const m = /^(\d{3})(-\d{3})?$/.exec(p);
  const nums = m ? p.split('-').map(Number) : [];
  if (!m || nums.some((n) => n < 100 || n > 999)) {
    return 'Text-TV pages are numbers like 100 (news), 300 (sport) or 400 (weather), or a range like 101-105.';
  }
  return cachedLookup(`ttv:${p}`, async () => {
    const rows: any[] = await fetcher(`${TEXTTV}/${p}?app=${TEXTTV_APP}&includePlainTextContent=1`);
    if (!rows?.length) return `Text-TV page ${p} is not on air.`;
    return rows.map((r) => {
      const body = cleanPlain(r.content_plain).slice(0, 900);
      return `--- page ${r.num}: ${r.title} ---\n${body}`;
    }).join('\n');
  });
}
