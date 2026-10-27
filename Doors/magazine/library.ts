/**
 * The magazine on disk, as the reader sees it.
 *
 * The board's content layer (web/backend/src/services/magazine) writes
 * `Magazine/index.json` and one
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
  MAGAZINE_INDEX_FILE,
  MAGAZINE_STORIES_DIR,
  isArticle,
  sidecarPath,
  type MagazineIndexEntry,
  type Story,
  type StoryMediaSidecar,
} from '@amiexpress/bbs-door-sdk/formats/magazine';

/** `<bbsRoot>/Magazine`, found the way every other board path is found. */
export function magazineRoot(startDir: string = __dirname): string {
  return path.join(resolveBbsRoot(startDir), MAGAZINE_DIR);
}

/** What the reader needs from one read of the magazine. */
export interface MagazineSnapshot {
  /** Every published story, in page order. */
  index: MagazineIndexEntry[];
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

/**
 * Is this story shown to a caller? Only an article is: the SDK's `isArticle`,
 * the same predicate the board's publisher uses to give a story a page. A
 * story that is gone, a teaser, or one still waiting for its text is hidden.
 */
export function isListed(storyId: string, root: string = magazineRoot()): boolean {
  const story = loadStory(storyId, root);
  return story !== null && isArticle(story);
}

/** `index.json`, entries that do not have the shape dropped and stories that are not articles hidden. */
export function loadIndex(root: string = magazineRoot()): MagazineIndexEntry[] {
  const parsed = readJson(path.join(root, MAGAZINE_INDEX_FILE));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isIndexEntry).filter((e) => isListed(e.storyId, root)).sort((a, b) => a.page - b.page);
}

/**
 * The ticker's material: the newest headlines of EVERY story in the store,
 * teasers included. A ticker scrolls past; it is not a list a caller opens, so
 * a headline with no article behind it is still news worth a glance.
 */
export function loadTickerItems(limit: number, root: string = magazineRoot()): Array<{ source: string; title: string }> {
  const dir = path.join(root, MAGAZINE_STORIES_DIR);
  let names: string[];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return []; }
  const stories: Story[] = [];
  for (const name of names) {
    const story = loadStory(name.slice(0, -'.json'.length), root);
    if (story) stories.push(story);
  }
  return stories
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((s) => ({ source: s.source, title: s.headline }));
}

export function loadSnapshot(root: string = magazineRoot()): MagazineSnapshot {
  return { index: loadIndex(root) };
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

/** The story's picture sidecar (`<id>.media.json`), or null when it has none or it is unreadable. */
export function loadSidecar(storyId: string, root: string = magazineRoot()): StoryMediaSidecar | null {
  if (!STORY_ID.test(storyId)) return null;
  const parsed = readJson(sidecarPath(path.join(root, MAGAZINE_STORIES_DIR, `${storyId}.json`))) as Partial<StoryMediaSidecar> | null;
  return parsed && parsed.version === 1 && Array.isArray(parsed.pictures) ? (parsed as StoryMediaSidecar) : null;
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
