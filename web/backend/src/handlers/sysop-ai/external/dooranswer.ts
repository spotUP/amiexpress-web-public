/**
 * SCENE ANSWER - the doorserver's external scene APIs, for the co-sysop's
 * answers about the wider scene (prods, parties, ANSI, films, links).
 *
 * One read-only JSON surface, no key, CORS open (BOT-API.md in
 * amiexpress-doorserver/docs):
 * https://doors.uprough.net/api/integrations/v1/answer. Same shape as
 * external/doorrepo: time-boxed, cached for a day, honest sentence when
 * the net is silent. Position among the tools: search_demozoo owns
 * groups/handles, lookup_game owns retail games, search_doors/search_files
 * own our own archives - ask_scene owns everything else (a prod by title,
 * a party, an ANSI/logo, a film, "surprise me", "latest", "is this link
 * alive").
 */
import axios from 'axios';

const ANSWER = 'https://doors.uprough.net/api/integrations/v1';
export const ANSWER_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = new Map<string, { at: number; value: string }>();
/** Test seam. */
export function resetAnswerCache(): void { cache.clear(); }

export type AnswerFetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: AnswerFetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? ANSWER_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: AnswerFetcher = httpGet;
/** Test seam: what fetches. */
export function setAnswerFetcher(f: AnswerFetcher | null): void {
  fetcher = f ?? httpGet;
}

async function cachedAsk(key: string, build: () => Promise<string>): Promise<string> {
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

function itemLine(r: any): string {
  const detail = r.detail ? ` (${r.detail})` : '';
  return `${r.title ?? 'untitled'}${detail} [${r.source ?? '?'}]${r.url ? ` ${r.url}` : ''}`;
}

function renderAnswer(data: any, q: string, emptyNote: string): string {
  const results: any[] = data?.results ?? [];
  const down: string[] = (data?.sources ?? []).filter((s: any) => !s.ok).map((s: any) => s.name ?? s.id);
  const lines = results.map(itemLine);
  if (data?.stale) lines.unshift('(last-known answer - the sources are unreachable right now)');
  if (!lines.length) return emptyNote;
  const tail = down.length ? `\n(${down.join(', ')} ${down.length === 1 ? 'is' : 'are'} down - these are the sources that answered)` : '';
  return `${lines.join('\n')}${tail}`;
}

export async function askScene(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return 'What should I look up?';
  return cachedAsk(`sc:search:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${ANSWER}/answer?q=${encodeURIComponent(q)}`);
    return renderAnswer(data, q, `The scene has nothing about "${q}".`);
  });
}

export async function sceneRandom(): Promise<string> {
  return cachedAsk('sc:random', async () => {
    const data = await fetcher(`${ANSWER}/answer?q=demo&mode=random`);
    const results: any[] = data?.results ?? [];
    if (!results.length) return 'Nothing surprising right now.';
    return `Surprise from the scene:\n${results.map(itemLine).join('\n')}`;
  });
}

export async function sceneLatest(): Promise<string> {
  return cachedAsk('sc:latest', async () => {
    const data = await fetcher(`${ANSWER}/answer?q=demo&mode=latest`);
    return renderAnswer(data, 'latest', 'No latest arrivals right now.');
  });
}

export async function checkLink(url: string): Promise<string> {
  const u = url.trim().slice(0, 500);
  if (!/^https:\/\//i.test(u)) return 'Give me an https URL to check.';
  return cachedAsk(`sc:check:${u.toLowerCase()}`, async () => {
    const r = await fetcher(`${ANSWER}/check?url=${encodeURIComponent(u)}`);
    if (typeof r?.ok !== 'boolean') return 'The link check answered oddly.';
    return r.ok
      ? `${u} is alive (HTTP ${r.status}).`
      : `${u} looks dead (HTTP ${r.status}).`;
  });
}
