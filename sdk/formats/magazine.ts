/**
 * The magazine's on-disk shapes, in ONE place.
 *
 * The board writes them (web/backend/src/services/magazine) and the MAG door
 * reads them (Doors/magazine). A writer and a reader that each declare the
 * shape they expect drift apart silently - the reader then paints "undefined"
 * for a field the writer renamed. Both import from here, the way the CTOP
 * writer and reader share `formats/ctop-data`.
 *
 * Types and file names only. No filesystem access: the board root is found
 * by the caller (`resolveBbsRoot`), this module only says what is under it.
 */

/** The magazine's name: the reader's masthead and the composer's masthead row. ONE constant. */
export const MAGAZINE_TITLE = 'THE UNKNOWN FREQUENCY';

/** Directory under the board root that holds the whole magazine. */
export const MAGAZINE_DIR = 'Magazine';
/** The navigation index: one MagazineIndexEntry per published story. */
export const MAGAZINE_INDEX_FILE = 'index.json';
/** The ids a human approved for the front page, in order. A JSON array of strings. */
export const MAGAZINE_FRONTPAGE_FILE = 'frontpage.json';
/** Directory under MAGAZINE_DIR holding one `<storyId>.json` per story. */
export const MAGAZINE_STORIES_DIR = 'stories';

/**
 * The front page is an ordered list of story ids; the FIRST is the lead (the
 * front article). These pure edits are the ONE definition of how the list may
 * change, for whoever writes `frontpage.json` (the MAG door's sysop mode today).
 * Filesystem access stays with the caller.
 */

/** Ids in order, de-duplicated, with any id not in `known` dropped. */
export function normalizeFront(ids: readonly string[], known: Iterable<string>): string[] {
  const exists = new Set(known);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !exists.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Add the story at the end of the front page, or take it off when it is already there. */
export function frontToggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Move a story one place towards the lead (`-1`) or away from it (`1`). Unchanged at the ends. */
export function frontMove(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= ids.length) return [...ids];
  const out = [...ids];
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}

/** Make the story the lead: first on the front page, the rest keep their order. */
export function frontLead(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [id, ...ids.filter((x) => x !== id)] : [...ids];
}

/**
 * The editorial formats. The page family a story lands in follows from its
 * format, so a RELEASE is discoverable where a reader looks for releases.
 */
export type StoryFormat =
  | 'NEWS'
  | 'RELEASE'
  | 'HISTORY'
  | 'EVENT'
  | 'DISCOVERY'
  | 'ARCHIVE'
  | 'OPINION'
  | 'INTERVIEW'
  | 'TECHNIQUE';

/** Which scene a story belongs to. Drives the page family and the reader's sections. */
export type Desk =
  | 'hack'
  | 'scene'
  | 'music'
  | 'graffiti'
  | 'people'
  | 'stream'
  | 'archive'
  | 'general';

/** The name of each desk as a caller reads it, on page headers and in the reader's sections. */
export const DESK_LABEL: Record<Desk, string> = {
  general: 'FRONT PAGE',
  hack: 'HACKING & PHREAKING',
  scene: 'SCENE & RETRO',
  graffiti: 'GRAFFITI & URBEX',
  music: 'MUSIC & RADIO',
  people: 'PEOPLE & LONG READS',
  archive: 'ARCHIVE',
  stream: 'LATEST TRANSMISSIONS',
};

/**
 * Where a story's text came from. A `feed` story is a teaser a source sent
 * (about 200 characters, then "[...]" or "Read more"): wire material, shown as
 * a headline and one line, never laid out as an article. An `authored` story
 * is long-form text a human wrote or curated and keeps the article layout.
 */
export type StoryOrigin = 'feed' | 'authored';

/**
 * The most body text a story keeps: 20,000 characters (about 3,000 words).
 * A feed that sends a whole long read is cut at the last paragraph break
 * under the cap, so the reader never opens a half-sentence.
 */
export const STORY_BODY_CAP = 20000;

/**
 * How much body text makes a story an ARTICLE. Below it the story is wire
 * material: a headline, a teaser and a detail panel. 1,200 characters is about
 * six paragraphs of a narrow column, the least that fills a spread without
 * padding.
 */
export const ARTICLE_MIN_BODY_CHARS = 1200;

export interface Story {
  /** Stable across runs: a hash of the normalised headline. */
  id: string;
  headline: string;
  /** The compact summary. Never a truncated article. */
  summary: string;
  format: StoryFormat;
  desk: Desk;
  /** ISO date the story is ABOUT - when it happened, when the feed says. */
  date: string;
  source: string;
  url?: string;
  /** First tick that saw it. The archive's chronology. */
  firstSeen: string;
  /** Ticks it has survived. A story nobody returns to is not a story. */
  seenCount: number;
  /** Set once a human approves it for the front page. */
  approvedAt?: string;
  /** Absent on a story stored before the field existed: read it with `storyOrigin`. */
  origin?: StoryOrigin;
  /**
   * The story's full text as plain paragraphs separated by a blank line, from
   * the feed's own full content or from the story page (prefetched at ingest).
   * At most `STORY_BODY_CAP` characters. Absent on a teaser-only story.
   */
  body?: string;
  /**
   * Set when the story page could not give a body (robots.txt, 403, 404,
   * timeout, no article text). It is the record that stops the next tick from
   * asking again; the story stays wire material.
   */
  bodyFailed?: { at: string; reason: string };
}

/**
 * Does this story open in the article layout? A human-written story always
 * does; a feed story does once it carries real full text. Everything else is
 * a teaser and belongs on the wire.
 */
export function isArticle(story: Pick<Story, 'origin' | 'body'>): boolean {
  return story.origin === 'authored' || (story.body?.length ?? 0) >= ARTICLE_MIN_BODY_CHARS;
}

/**
 * A source as the reader names it: the site, never an address. `www.` goes,
 * and so does a trailing "via ..." or "(note)" ("news.ycombinator.com via Algolia").
 * The ONE place this lives: the MAG reader and the teletext pages both print it.
 */
export function sourceName(source: string): string {
  return source
    .replace(/\s+via\s+.*$/i, '')
    .replace(/\s*\(.*$/, '')
    .replace(/^\s*(?:https?:\/\/)?(?:www\.)?/i, '')
    .replace(/\/.*$/, '')
    .trim();
}

/** A stored story without the field is a feed story (back-compat). */
export function storyOrigin(story: Pick<Story, 'origin'>): StoryOrigin {
  return story.origin === 'authored' ? 'authored' : 'feed';
}

/**
 * One row of `index.json`. `page` is re-allocated on every publish, so
 * anything that must outlive a publish (bookmarks, read state) is keyed by
 * `storyId`, never by `page`.
 */
export interface MagazineIndexEntry {
  page: number;
  title: string;
  desk: Desk;
  format: string;
  storyId: string;
  date: string;
}
