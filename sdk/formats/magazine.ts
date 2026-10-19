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
/** The front page's own name: it is a view, not a desk, so no desk label carries it. */
export const FRONT_PAGE_LABEL = 'FRONT PAGE';

export const DESK_LABEL: Record<Desk, string> = {
  general: 'MISCELLANEOUS SIGNALS',
  hack: 'HACKING & PHREAKING',
  scene: 'SCENE & RETRO',
  graffiti: 'GRAFFITI & URBEX',
  music: 'MUSIC & RADIO',
  people: 'PEOPLE & LONG READS',
  archive: 'ARCHIVE',
  stream: 'LATEST TRANSMISSIONS',
};

/**
 * The page families of §12, in the 100-999 range the teletext engine already
 * serves. The exact numbers are the brief's suggestion; what matters is that a
 * reader can tell where they are.
 *
 * `general` starts at 101, not 100: page 100 is the magazine's front page and
 * is composed from approved stories, so a story may not take it.
 */
export const FRONT_PAGE = 100;

export const PAGE_FAMILIES: Record<Desk, { first: number; last: number; label: string }> = {
  general: { first: 101, last: 119, label: DESK_LABEL.general },
  hack: { first: 120, last: 139, label: DESK_LABEL.hack },
  scene: { first: 200, last: 219, label: DESK_LABEL.scene },
  graffiti: { first: 300, last: 319, label: DESK_LABEL.graffiti },
  music: { first: 400, last: 419, label: DESK_LABEL.music },
  people: { first: 500, last: 519, label: DESK_LABEL.people },
  // ARCHIVE is history that was always history: §5.F scene histories,
  // recovered recordings, lost publications.
  archive: { first: 900, last: 949, label: DESK_LABEL.archive },
  // STREAM is §5.A "latest transmissions" - a chronological surface for
  // everything the desks could not hold. It is NOT the archive, and calling a
  // story from Tuesday "archive" because its section filled up is an editorial
  // lie: on the first full run it mislabelled 85 of 164 stories.
  stream: { first: 950, last: 999, label: DESK_LABEL.stream },
};

/**
 * Where a story's text came from. A `feed` story is a teaser a source sent
 * (about 200 characters, then "[...]" or "Read more"): never shown as a story
 * unless its page gives a full body (it then passes `isArticle`); its headline
 * may still scroll in the ticker. An `authored` story is long-form text a
 * human wrote or curated and keeps the article layout.
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
 * material: hidden from every list and given no page. 1,200 characters is about
 * six paragraphs of a narrow column, the least that fills a spread without
 * padding.
 */
export const ARTICLE_MIN_BODY_CHARS = 1200;

/**
 * `image` and `video` are files the board can fetch; `embed` is a YouTube or
 * Vimeo `<iframe>` (a page, not a file: it needs a resolver before it plays).
 */
export type StoryMediaKind = 'image' | 'video' | 'embed';

/**
 * A picture or clip found in the story page, in the position it had in the
 * text. Found by the ONE walk that also yields the body paragraphs
 * (`toBulletinWalk`), so `anchor` cannot drift from the text. The converted
 * rows are not here: they live in the story's sidecar.
 */
export interface StoryMedia {
  /** Absolute address (relative ones are resolved against the article URL). */
  url: string;
  kind: StoryMediaKind;
  /** The page's own alt text, plain; '' when it had none. */
  alt: string;
  /** The site credited under the picture: the article's host, without `www.`. */
  site: string;
  /** Index of the body paragraph it follows; 0 = before the first paragraph. */
  anchor: number;
  /** A video's poster image address, when the page gave one. */
  poster?: string;
  /** Why it was dropped (recorded once, never retried). Absent when it is usable. */
  failure?: string;
}

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
   * asking again; the story stays hidden and is purged after three days.
   */
  bodyFailed?: { at: string; reason: string };
  /**
   * Pictures and clips of the story page in document order, each anchored to
   * the body paragraph it follows. Absent when the page had none, or on a story
   * stored before the field existed.
   */
  media?: StoryMedia[];
}

/**
 * Is this story shown at all? The ONE predicate: the board's publisher gives a
 * page only to a story that passes it, and the MAG reader lists only stories
 * that pass it. A human-written story always does; a feed story does once it
 * carries real full text. A teaser, or a story still waiting for its text, is
 * hidden (its headline may still scroll in the ticker).
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
