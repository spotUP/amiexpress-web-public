/**
 * The magazine on disk, as the reader sees it.
 *
 * The board's content layer (web/backend/src/services/magazine) writes
 * `Magazine/index.json`, `Magazine/frontpage.json` and one
 * `Magazine/stories/<id>.json` per story. This module only READS them, and
 * never the `pages/pNNN.txt` teletext output: those are 40-column pre-wrapped
 * text with the row roles baked into SGR, so a reader that re-flowed them
 * into columns would be guessing.
 *
 * Everything is stale-safe. The magazine is republished while callers read,
 * so the view re-reads on entry and tolerates a missing directory, a missing
 * file, a half-written file or a story that has since gone: each degrades to
 * "less magazine", never to an exception on a caller's screen.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveBbsRoot } from '@amiexpress/bbs-door-sdk/settings';
import {
  MAGAZINE_DIR,
  MAGAZINE_FRONTPAGE_FILE,
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  normalizeFront,
  type MagazineIndexEntry,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';

/** `<bbsRoot>/Magazine`, found the way every other board path is found. */
export function magazineRoot(startDir: string = __dirname): string {
  return path.join(resolveBbsRoot(startDir), MAGAZINE_DIR);
}

/** What the reader needs from one read of the magazine. */
export interface MagazineSnapshot {
  /** Every published story, in page order. */
  index: MagazineIndexEntry[];
  /** Story ids a human approved for the front page, in the editor's order. */
  front: string[];
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isIndexEntry(value: unknown): value is MagazineIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return typeof e.page === 'number' && typeof e.storyId === 'string' && typeof e.title === 'string'
    && typeof e.desk === 'string' && typeof e.date === 'string';
}

/** `index.json`, entries that do not have the shape dropped. */
export function loadIndex(root: string = magazineRoot()): MagazineIndexEntry[] {
  const parsed = readJson(path.join(root, MAGAZINE_INDEX_FILE));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isIndexEntry).sort((a, b) => a.page - b.page);
}

/** `frontpage.json`: the editor's order, and only the editor's. */
export function loadFront(root: string = magazineRoot()): string[] {
  const parsed = readJson(path.join(root, MAGAZINE_FRONTPAGE_FILE));
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Who may edit the front page: the full sysop. The same tier and the same
 * field the other TS doors read off the door session (`session.user.secLevel`,
 * Doors/livechat/server.ts, Doors/door-manager/app.ts), and the backend's own
 * SYSOP_LEVEL (web/backend/src/server/socket-guard.ts).
 */
export const SYSOP_SEC_LEVEL = 255;

export function isSysopCaller(session: { user?: { secLevel?: number } | null }): boolean {
  return (session.user?.secLevel ?? 0) >= SYSOP_SEC_LEVEL;
}

/** Write `frontpage.json` atomically: a temp file in the same directory, then a rename. */
export function writeFront(ids: readonly string[], root: string = magazineRoot()): void {
  const target = path.join(root, MAGAZINE_FRONTPAGE_FILE);
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(ids, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* the target is untouched */ }
    throw err;
  }
}

/**
 * One edit of the front page. The file is re-read first so two sysops only
 * overwrite each other's edit of the SAME moment, not a stale copy; ids no
 * longer in the index are dropped; nothing is written when nothing changed.
 * Returns the front page as it now stands.
 */
export function editFront(edit: (ids: string[]) => string[], root: string = magazineRoot()): string[] {
  const current = loadFront(root);
  const known = loadIndex(root).map((e) => e.storyId);
  const next = normalizeFront(edit(normalizeFront(current, known)), known);
  if (JSON.stringify(next) !== JSON.stringify(current)) writeFront(next, root);
  return next;
}

export function loadSnapshot(root: string = magazineRoot()): MagazineSnapshot {
  return { index: loadIndex(root), front: loadFront(root) };
}

/** A story id is a hex hash; anything else is not a file name we will build. */
const STORY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** One story, or null when it is gone or unreadable. */
export function loadStory(storyId: string, root: string = magazineRoot()): Story | null {
  if (!STORY_ID.test(storyId)) return null;
  const parsed = readJson(path.join(root, MAGAZINE_STORIES_DIR, `${storyId}.json`));
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed as Partial<Story>;
  if (typeof s.id !== 'string' || typeof s.headline !== 'string') return null;
  return {
    ...(s as Story),
    summary: typeof s.summary === 'string' ? s.summary : '',
    source: typeof s.source === 'string' ? s.source : '',
    date: typeof s.date === 'string' ? s.date : '',
  };
}

/**
 * Typographic characters feeds love, folded to what an Amiga and a C64 can
 * show, then anything left outside Latin-1 becomes `?`. The reader prints
 * other people's text, so this is the paint boundary (the TIP door does the
 * same for the same reason).
 */
export function paintSafe(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\r\t]/g, ' ')
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');
}

/** Stories per calendar day, oldest first: the data behind the desk sparkline. */
export function storiesPerDay(entries: readonly MagazineIndexEntry[], days: number): number[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const latest = [...counts.keys()].sort().slice(-days);
  return latest.map((d) => counts.get(d) ?? 0);
}

/**
 * Stories whose headline or summary contain every word of the query, in the magazine's own page order.
 */
export function searchStories(
  entries: readonly MagazineIndexEntry[],
  query: string,
  load: (storyId: string) => Story | null = (id) => loadStory(id),
  limit = 200,
): MagazineIndexEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out: MagazineIndexEntry[] = [];
  for (const entry of entries) {
    const story = load(entry.storyId);
    const haystack = `${entry.title} ${story?.headline ?? ''} ${story?.summary ?? ''}`.toLowerCase();
    if (words.every((w) => haystack.includes(w))) out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}
