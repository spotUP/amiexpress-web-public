/**
 * DOOR REPOSITORY + BBS FILE LISTING - Up Rough's own archives, for the
 * co-sysop's answers about BBS doors and board files.
 *
 * Two read-only JSON surfaces, no key, CORS open (BOT-API.md in
 * amiexpress-doorserver/docs): the door repo
 * (https://doors.uprough.net/api/door-repo) and the releases listing
 * (https://doors.uprough.net/releases/v1). Same shape as external/demozoo:
 * time-boxed, cached for a day, honest sentence when the net is silent.
 */
import axios from 'axios';

import { createExternalCache } from './cache';

const DOORS = 'https://doors.uprough.net/api/door-repo';
const RELEASES = 'https://doors.uprough.net/releases/v1';
export const EXTERNAL_TIMEOUT_MS = 8000;
const UA = 'amiexpress-web-bbs/1.0 (AI co-sysop lookups; https://bbs.uprough.net)';

const cache = createExternalCache();
/** Test seam. */
export function resetExternalCache(): void { cache.reset(); }

export type Fetcher = (url: string, timeoutMs?: number) => Promise<any>;
const httpGet: Fetcher = async (url, timeoutMs) =>
  (await axios.get(url, { timeout: timeoutMs ?? EXTERNAL_TIMEOUT_MS, headers: { 'User-Agent': UA, Accept: 'application/json' } })).data;
let fetcher: Fetcher = httpGet;
/** Test seam: what fetches. */
export function setExternalFetcher(f: Fetcher | null): void {
  fetcher = f ?? httpGet;
}

const cachedLookup = (key: string, build: () => Promise<string>): Promise<string> =>
  cache.lookup(key, build);

const by = (names: Array<string | undefined>): string =>
  names.filter(Boolean).join(', ') || 'unknown';

function doorLine(r: any): string {
  const who = by([r.author, r.releaseGroupFullName ?? r.releaseGroup]);
  const what = `${r.name ?? r.archiveName} (${r.system ?? 'Amiga'}, ${r.doorType ?? 'door'}) by ${who}`;
  const desc = r.description ? ` - ${r.description}` : '';
  return `${what}${desc} [${r.archiveName}]`;
}

export async function searchDoors(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  return cachedLookup(`dr:search:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${DOORS}/doors?q=${encodeURIComponent(q)}&per_page=5`);
    const rows: any[] = data?.rows ?? [];
    if (!rows.length) return `The door archive has nothing about "${q}".`;
    return rows.map(doorLine).join('\n');
  });
}

/**
 * What doorDetail says when the archive is not there. The tool layer routes a
 * miss on to the right sibling tool, and reads it through isNoSuchDoor rather
 * than matching the prose - so the wording stays changeable here.
 */
export const NO_SUCH_DOOR = 'No door called';
export const isNoSuchDoor = (answer: string): boolean => answer.startsWith(NO_SUCH_DOOR);

export async function doorDetail(archive: string): Promise<string> {
  const a = archive.trim().toUpperCase().slice(0, 40);
  return cachedLookup(`dr:detail:${a}`, async () => {
    const r = await fetcher(`${DOORS}/doors/${encodeURIComponent(a)}`);
    if (!r || r.error) return `${NO_SUCH_DOOR} "${a}" in the archive.`;
    const score = (r.votesUp ?? 0) - (r.votesDown ?? 0);
    const diz = r.fileIdDiz ? `\nDIZ: ${String(r.fileIdDiz).split('\n')[0]}` : '';
    return `${doorLine(r)}\nScore ${score} (${r.votesUp ?? 0}/${r.votesDown ?? 0}). Download: ${r.downloadUrl ?? 'n/a'}.${diz}`;
  });
}

export async function doorRandom(): Promise<string> {
  return cachedLookup('dr:random', async () => {
    const r = await fetcher(`${DOORS}/doors/random`);
    return `Surprise from the archive:\n${doorLine(r)}`;
  });
}

export async function doorStats(): Promise<string> {
  return cachedLookup('dr:stats', async () => {
    const s = await fetcher(`${DOORS}/stats`);
    const systems = (s?.bySystem ?? []).slice(0, 3).map((g: any) => `${g.value} (${g.n})`).join(', ');
    const groups = (s?.byGroup ?? []).slice(0, 3).map((g: any) => `${g.value} (${g.n})`).join(', ');
    return `The archive holds ${s?.total ?? '?'} doors (${s?.hiddenCount ?? 0} hidden)${systems ? `. Systems: ${systems}` : ''}${groups ? `. Biggest groups: ${groups}` : ''}.`;
  });
}

const sizeOf = (bytes: number | null): string => {
  if (bytes === null || bytes === undefined) return 'size?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

function fileLine(r: any): string {
  const nuked = r.flag === 'D' ? ` [NUKED: ${r.sizeNote ?? 'n/a'}]` : '';
  return `${r.filename} (${sizeOf(r.sizeBytes)}, ${r.dateIso ?? 'undated'}) - ${r.description || 'no description'}${nuked}`;
}

export async function searchFiles(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  return cachedLookup(`rel:search:${q.toLowerCase()}`, async () => {
    const data = await fetcher(`${RELEASES}/list?q=${encodeURIComponent(q)}&limit=5`);
    const rows: any[] = data?.rows ?? [];
    if (!rows.length) return `The BBS listing has no files about "${q}".`;
    return rows.map(fileLine).join('\n');
  });
}

export async function fileDetail(id: string): Promise<string> {
  return cachedLookup(`rel:file:${id}`, async () => {
    const r = await fetcher(`${RELEASES}/files/${encodeURIComponent(id)}`);
    if (!r || r.error || r.id === undefined) return `No file ${id} in the listing.`;
    return fileLine(r);
  });
}

export async function fileRandom(): Promise<string> {
  return cachedLookup('rel:random', async () => {
    const r = await fetcher(`${RELEASES}/random`);
    return `Surprise from the listing:\n${fileLine(r)}`;
  });
}

export async function listingStats(): Promise<string> {
  return cachedLookup('rel:stats', async () => {
    const s = await fetcher(`${RELEASES}/stats`);
    return `The listing holds ${s?.total ?? '?'} files.`;
  });
}

export async function listingFacts(): Promise<string> {
  return cachedLookup('rel:facts', async () => {
    const f = await fetcher(`${RELEASES}/facts`);
    const bits: string[] = [];
    if (f?.span) bits.push(`Span ${f.span.firstDate} to ${f.span.lastDate} (first: ${f.span.firstFile?.filename}, last: ${f.span.lastFile?.filename}).`);
    if (f?.firstDiz) bits.push(`First art-DIZ: ${f.firstDiz.filename} (${f.firstDiz.dateIso}).`);
    if (f?.peakYear) bits.push(`Peak year: ${JSON.stringify(f.peakYear).slice(0, 80)}.`);
    if (f?.biggest) bits.push(`Biggest: ${JSON.stringify(f.biggest).slice(0, 80)}.`);
    if (f?.mostDownloaded) bits.push(`Most downloaded: ${JSON.stringify(f.mostDownloaded).slice(0, 80)}.`);
    return bits.length > 0 ? bits.join('\n') : 'The listing keeps no fun facts right now.';
  });
}
