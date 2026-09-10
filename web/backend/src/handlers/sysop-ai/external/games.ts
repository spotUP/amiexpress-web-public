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
  const q = extractGameTitle(title);
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

/**
 * Forced RAWG pre-fetch (2026-09-10): the models answer game questions
 * from training weights and never call lookup_game (zero calls in 72h of
 * live logs while the other tools fired), so a stored RAWG key sat unused.
 * Game-looking messages get one RAWG lookup up front and the hits ride
 * the prompt as context - this works even for models without tool support.
 *
 * Conservative by design: a cue that does not fire leaves the old behavior
 * (the model may still call the tool); a cue that fires on a non-game
 * costs one cached lookup and contributes nothing when RAWG knows no rows.
 */
const GAME_CUES = [
  /\bgames?\b/i,
  /\bgaming\b/i,
  /\bvideogames?\b/i,
  /\bvideo games?\b/i,
  /\bplaystation\b/i,
  /\bps[1-5]\b/i,
  /\bxbox\b/i,
  /\bnintendo\b/i,
  /\bsega\b/i,
  /\batari\b/i,
  /\bamiga games?\b/i,
  /\bmetacritic\b/i,
  /who (made|developed|published|created)/i,
  /when (was|were|did).{0,50}(releas|come out|publish|launch)/i,
  /release date/i,
];

export function looksLikeGameQuestion(message: string): boolean {
  return GAME_CUES.some((re) => re.test(message));
}

const MISS_PREFIXES = ['Nothing known about a game', 'No answer from the net', 'Which game?'];

/**
 * Title extraction (2026-09-10): the pre-fetch hands over whole
 * questions ("who made turrican?"), which match no RAWG title and then
 * 404 Wikipedia too. Strip the question scaffolding down to the likely
 * title; clean titles pass through unchanged (idempotent - the tool
 * path calls lookupGame with bare titles already).
 */
export function extractGameTitle(message: string): string {
  let s = message.trim().slice(0, 80).replace(/\?+$/g, '').trim();
  s = s.replace(/^(who (made|developed|published|created|designed)|when (was|were|did|is)|what (is|are|was|were)|tell me about|tell me|show me|find me|search for|looking for|do you know|have you heard of|i mean)\b\s*/i, '');
  s = s.replace(/\bmetacritic( score| rating)? of\b\s*/i, '');
  s = s.replace(/\b(the )?(release date|release|released|launch|game|games|review|reviews|gameplay|remake|sequel)\b\s*$/i, '');
  s = s.replace(/^(the|a|an)\b\s+/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s || message.trim().slice(0, 80);
}

/** RAWG card for the prompt, or undefined when there is nothing worth saying. Never throws. */
export async function gameCardFor(message: string, rawgKey?: string): Promise<string | undefined> {
  if (!looksLikeGameQuestion(message)) return undefined;
  if (!rawgKey) return undefined;
  try {
    const text = await lookupGame(message, rawgKey);
    if (!MISS_PREFIXES.some((p) => text.startsWith(p))) return `RAWG games database:\n${text}`;
    return undefined;
  } catch {
    return undefined;
  }
}
