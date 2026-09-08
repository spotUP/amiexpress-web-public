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
/**
 * The enrichment calls get longer than a search does, because they measurably
 * need it: `/releasers/456/` plus a three-year production window took 3.3s and
 * the same call without a window took 6.7s, against a 3s ceiling - so every
 * one of them failed silently into `.catch(() => null)` and the group answer
 * came back with no releases in it at all. The tool loop's budget is 35s and
 * these three run in parallel, so this costs one round trip, once a day, per
 * group asked about.
 */
export const DETAIL_TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetExternalCache(): void { cache.clear(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setExternalFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
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

/** `Up Rough (group) https://demozoo.org/groups/456/` - one row of a list. */
const releaserLine = (r: any): string =>
  `${r.name} (${r.is_group ? 'group' : 'scener'}) ${releaserUrl(r)}`;

const releaserUrl = (r: any): string =>
  `https://demozoo.org/${r.is_group ? 'groups' : 'sceners'}/${r.id}/`;

/** At most `n` names, then how many were left out. */
function some(names: string[], n: number): string {
  if (names.length <= n) return names.join(', ');
  return `${names.slice(0, n).join(', ')} and ${names.length - n} more`;
}

/**
 * A group, the way someone who knows the scene would answer.
 *
 * The search endpoint gives a NAME and an ID and nothing else, so this used to
 * reply "Up Rough (group) <url>" and stop - true, and no use to anyone. The
 * detail endpoint carries the aliases, the members, the subgroups and the
 * group's own links, and `productions/?author=<id>` carries the releases, so
 * ask for those and say something worth reading.
 *
 * The three calls go together rather than in turn: the tool loop's budget is
 * generous (35s) but a caller is sitting at a prompt.
 *
 * WHAT DEMOZOO'S API DOES NOT CARRY, so this cannot say it: BBS affiliations
 * (The Yard, Aquarium, ...) and which parties a group organised. Both are on
 * the HTML page and neither is in /api/v1/. Don't invent them.
 */
async function describeReleaser(pick: any, alsoMatched: any[], known?: any): Promise<string> {
  const id = pick.id;
  const sinceYear = new Date().getUTCFullYear() - 3;

  // NOT a third call for the lifetime total: Demozoo ignores `limit`, so
  // asking for one row downloads a hundred - 78 KB and 6.7 seconds - to answer
  // a single number. The window's own count is honest and already paid for.
  const [fetched, recent] = await Promise.all([
    known ? Promise.resolve(known) : fetcher(`${BASE}/releasers/${id}/`, DETAIL_TIMEOUT_MS).catch(() => null),
    fetcher(`${BASE}/productions/?author=${id}&released_since=${sinceYear}-01-01&limit=100`, DETAIL_TIMEOUT_MS).catch(() => null),
  ]);
  const detail = fetched;

  const out: string[] = [];
  const nicks: any[] = detail?.nicks ?? [];
  const primary = nicks.find((n) => n.is_primary_nick) ?? nicks[0];
  const abbrev = primary?.abbreviation ? ` (${primary.abbreviation})` : '';
  const aliases = nicks.filter((n) => !n.is_primary_nick).map((n) => n.name);
  out.push(`${pick.name}${abbrev} - ${pick.is_group ? 'group' : 'scener'} ${releaserUrl(pick)}`);
  if (aliases.length) out.push(`Also known as: ${some(aliases, 4)}`);

  const members: any[] = detail?.members ?? [];
  if (members.length) {
    const current = members.filter((m) => m.is_current);
    const shown = (current.length ? current : members).map((m) => m.member?.name).filter(Boolean);
    out.push(`Members (${members.length}, ${current.length} current): ${some(shown, 14)}`);
  }

  const memberOf: string[] = (detail?.member_of ?? []).map((m: any) => m.group?.name).filter(Boolean);
  if (memberOf.length) out.push(`Member of: ${some(memberOf, 6)}`);

  const subs: any[] = detail?.subgroups ?? [];
  if (subs.length) {
    out.push(`Subgroups: ${some(subs.map((g) => `${g.subgroup?.name}${g.is_current === false ? ' (past)' : ''}`).filter(Boolean), 6)}`);
  }

  const links: string[] = (detail?.external_links ?? []).map((l: any) => l.url).filter(Boolean);
  if (links.length) out.push(`Links: ${some(links, 4)}`);

  const count = typeof recent?.count === 'number' ? recent.count : null;
  // Demozoo will not sort for us - `ordering` is ignored - so the window comes
  // back unsorted and is sorted here. A title of "?" is Demozoo's placeholder
  // for an untitled track and says nothing to a caller.
  const rows: any[] = (recent?.results ?? [])
    .filter((p: any) => p?.title && p.title !== '?')
    .sort((a: any, b: any) => String(b.release_date ?? '').localeCompare(String(a.release_date ?? '')));
  if (count !== null) out.push(`Releases credited since ${sinceYear}: ${count}`);
  if (rows.length) {
    out.push(`Recent: ${rows.slice(0, 6).map((p) =>
      `${p.title} (${(p.release_date ?? '').slice(0, 7) || '?'}, ${names(p.types).join('/') || 'release'})`).join('; ')}`);
  }

  if (alsoMatched.length) out.push(`Also matched: ${some(alsoMatched.map((r) => r.name), 4)}`);
  return out.join('\n');
}

export async function searchGroups(name: string): Promise<string> {
  const q = name.trim().slice(0, 80);
  return cachedLookup(`dz:group:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${BASE}/releasers/?name=${encodeURIComponent(q)}&limit=5`);
    const rows: any[] = data?.results ?? [];
    if (!rows.length) return `Demozoo has no group or scener called "${q}".`;

    const exact = rows.filter((r) => String(r.name).toLowerCase() === q.toLowerCase());

    // One hit, or one that IS the name asked for: answer about that one.
    const single = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
    if (single) return describeReleaser(single, rows.filter((r) => r !== single));

    // SEVERAL GROUPS OF THE SAME NAME - Demozoo holds two called Spaceballs.
    // Listing them was two identical lines and a shrug. The records themselves
    // tell them apart, so fetch them (in parallel, capped) and answer about the
    // one that is actually a group with people in it, naming the others with
    // the counts that make the difference visible. That is the data deciding,
    // not a guess about which id is "the real one".
    if (exact.length > 1 && exact.length <= 3) {
      const details = await Promise.all(exact.map((r) =>
        fetcher(`${BASE}/releasers/${r.id}/`, DETAIL_TIMEOUT_MS).catch(() => null)));
      const size = (d: any) => (d?.members?.length ?? 0) + (d?.subgroups?.length ?? 0);
      let best = 0;
      for (let i = 1; i < exact.length; i++) if (size(details[i]) > size(details[best])) best = i;
      if (size(details[best]) > 0) {
        const others = exact
          .map((r, i) => ({ r, n: size(details[i]) }))
          .filter((_, i) => i !== best)
          .map(({ r, n }) => `${r.name} (${releaserUrl(r)}, ${n} members)`);
        return `${await describeReleaser(exact[best], [], details[best])}\nDemozoo also has: ${some(others, 3)}`;
      }
    }

    // Genuinely ambiguous, or nothing to tell them apart: the list is the
    // honest answer, because picking for the caller would be guessing.
    return rows.map(releaserLine).join('\n');
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
