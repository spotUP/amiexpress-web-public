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

/** Directory under the board root that holds the whole magazine. */
export const MAGAZINE_DIR = 'Magazine';
/** The navigation index: one MagazineIndexEntry per published story. */
export const MAGAZINE_INDEX_FILE = 'index.json';
/** The ids a human approved for the front page, in order. A JSON array of strings. */
export const MAGAZINE_FRONTPAGE_FILE = 'frontpage.json';
/** Directory under MAGAZINE_DIR holding one `<storyId>.json` per story. */
export const MAGAZINE_STORIES_DIR = 'stories';

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
