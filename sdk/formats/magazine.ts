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
import { BREAKPOINT_MD, BREAKPOINT_SM, getCompactProfile } from '../engines/ui/blessed/core/responsive-constants';

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
  /**
   * The article-extraction revision the story page was last read under.
   * Absent on a story read before the field existed (revision 1). A story
   * read under an older revision is read once more for the media the newer
   * extractor finds; its body is kept.
   */
  extracted?: number;
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

// ---------------------------------------------------------------------------
// Column geometry (moved from Doors/magazine/columns.ts, which re-exports it)
// ---------------------------------------------------------------------------

/** The widest a column of reading text is allowed to be. */
export const MAX_MEASURE = 38;

export function columnCount(width: number): 1 | 2 | 3 {
  if (width >= BREAKPOINT_MD) return 3;
  if (width >= BREAKPOINT_SM) return 2;
  return 1;
}

export interface ColumnGeometry {
  cols: 1 | 2 | 3;
  /** Characters in one column. */
  colWidth: number;
  /** Characters between two columns (0 with one column). */
  gutter: number;
  /** Blank columns left of the first column: the set text is centred. */
  margin: number;
  /** Columns the whole set text occupies, margins excluded. */
  contentWidth: number;
}

/**
 * Where the columns sit on a screen this wide.
 *
 * The gutter is one rule character flanked by the profile's gap on each side,
 * so the column rule between two columns is always a character and never the
 * boundary of the text.
 */
export function columnGeometry(width: number): ColumnGeometry {
  const profile = getCompactProfile(width);
  const cols = columnCount(width);
  const gutter = cols > 1 ? profile.gap * 2 + 1 : 0;
  const usable = Math.max(1, width - profile.padding * 2);
  const fitted = Math.floor((usable - gutter * (cols - 1)) / cols);
  const colWidth = Math.max(1, Math.min(MAX_MEASURE, fitted));
  const contentWidth = colWidth * cols + gutter * (cols - 1);
  const margin = Math.max(0, Math.floor((width - contentWidth) / 2));
  return { cols, colWidth, gutter, margin, contentWidth };
}

// ---------------------------------------------------------------------------
// Picture sidecar (plan 2026-10-19-mag-linked-media-ascii, M7)
// ---------------------------------------------------------------------------

/** Rows stored for one picture at one size. */
export type SidecarTerminal = 'ansi' | 'petscii';
/**
 * `column` is the inline still; `span` is the still set across every column
 * of an ANSI spread (one size, centred on wider screens); `full` is the
 * fullscreen viewer (D11).
 */
export type SidecarPlacement = 'column' | 'span' | 'full';

/** The fullscreen sizes (D11): 80x24 on ANSI, 40x24 on the C64. */
export const FULLSCREEN_COLS: Record<SidecarTerminal, number> = { ansi: 80, petscii: 40 };
export const FULLSCREEN_ROWS = 24;
/** Row caps of the column stills (Limits table). */
export const COLUMN_ROW_CAP = { amiga: 10, wide: 12, petscii: 8 } as const;
/**
 * Row cap of the span still: the tallest band an 80x24 article spread holds
 * (20 panel rows less the running headline, the gap above and the credit).
 * A 16:9 picture at the full 77 columns would need 22 rows, so it is set 57
 * columns wide at this cap rather than falling back to a column still.
 */
export const SPAN_ROW_CAP = 16;

/** The key a rendering is stored under: `ansi-37-column`, `petscii-40-full`. */
export function renderingKey(terminal: SidecarTerminal, cols: number, placement: SidecarPlacement): string {
  return `${terminal}-${cols}-${placement}`;
}

export interface SidecarSize {
  terminal: SidecarTerminal;
  placement: SidecarPlacement;
  cols: number;
  /** The most rows the rendering may have. */
  maxRows: number;
  key: string;
}

/** Every size a picture is rendered at, taken from columnGeometry (never hardcoded widths). */
export function sidecarSizes(): SidecarSize[] {
  const mk = (terminal: SidecarTerminal, placement: SidecarPlacement, cols: number, maxRows: number): SidecarSize =>
    ({ terminal, placement, cols, maxRows, key: renderingKey(terminal, cols, placement) });
  return [
    mk('ansi', 'column', columnGeometry(BREAKPOINT_SM).colWidth, COLUMN_ROW_CAP.amiga),
    mk('ansi', 'column', MAX_MEASURE, COLUMN_ROW_CAP.wide),
    mk('petscii', 'column', columnGeometry(40).colWidth, COLUMN_ROW_CAP.petscii),
    mk('ansi', 'span', columnGeometry(BREAKPOINT_SM).contentWidth, SPAN_ROW_CAP),
    mk('ansi', 'full', FULLSCREEN_COLS.ansi, FULLSCREEN_ROWS),
    mk('petscii', 'full', FULLSCREEN_COLS.petscii, FULLSCREEN_ROWS),
  ];
}

/**
 * Rows for a picture of `width` x `height` pixels in `cols` columns: terminal
 * cells are about twice as tall as wide, so rows = cols * (h / w) / 2, at
 * least 1, at most `maxRows`.
 */
export function rowsForAspect(width: number, height: number, cols: number, maxRows: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.max(1, Math.min(maxRows, Math.round((cols * height) / (width * 2))));
}

/**
 * The box a span still is rendered in: the full `maxCols` when the picture is
 * wide enough, else narrower so a tall picture keeps its shape at `maxRows`
 * instead of standing in black side bars. Its key names the actual width.
 */
export function spanBox(width: number, height: number, maxCols: number, maxRows: number): { cols: number; rows: number } {
  const cols = width > 0 && height > 0
    ? Math.max(1, Math.min(maxCols, Math.round((maxRows * 2 * width) / height)))
    : maxCols;
  return { cols, rows: rowsForAspect(width, height, cols, maxRows) };
}

/** One stored rendering. ANSI: text rows. PETSCII: base64 of each .seq row's bytes. */
export interface SidecarRendering {
  cols: number;
  rows: string[];
}

export interface SidecarPicture {
  /** Index into the story's `media`. */
  media: number;
  /** The address it was fetched from (a republish does not refetch the same one). */
  url: string;
  /** SIDECAR_RENDER_REVISION it was rendered under; absent on the first renders. */
  render?: number;
  renderings: Record<string, SidecarRendering>;
}

/**
 * Bumped when the renderer changes what a picture looks like, so stored
 * renderings are redone instead of reused. 2: pictures keep their aspect
 * inside the box (letterboxed like the video), Topaz glyph shape match that
 * dithers towards a cell's mean colour. 3: the span still, set across both
 * columns at 80. 4: the span still is two rows taller (SPAN_ROW_CAP 16).
 */
export const SIDECAR_RENDER_REVISION = 4;

/** `<story id>.media.json`, beside `<story id>.json`. */
export interface StoryMediaSidecar {
  version: 1;
  pictures: SidecarPicture[];
}

/** The sidecar's path from the story file's path. */
export function sidecarPath(storyFilePath: string): string {
  return storyFilePath.replace(/\.json$/, '') + '.media.json';
}

/** True for a story file in the stories directory, false for its picture sidecar sitting beside it. */
export function isStoryFileName(name: string): boolean {
  return name.endsWith('.json') && !name.endsWith('.media.json');
}
