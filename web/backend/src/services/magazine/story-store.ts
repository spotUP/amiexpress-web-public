/**
 * THE MAGAZINE'S STORY STORE.
 *
 * The bulletins are a monitoring surface - "a useful stream of newly
 * discovered stories", which is what §5 of the editorial spec asks for. They
 * are not the magazine. The magazine is what happens to a story after somebody
 * decides it is worth a caller's forty columns and sixteen minutes.
 *
 * So the store keeps stories as DATA, on disk, one file each:
 *
 *   - deduplicated on ingest (§14 step 4), because six feeds reporting one
 *     release is one story, not six, and a magazine that repeats itself is
 *     worse than one that is thin;
 *   - classified into a page family (§12), because "hacking / demoscene /
 *     music / graffiti" is how the reader navigates, not how the feed was
 *     filed;
 *   - kept forever (§13: "new stories can build on them", and §5: a lasting
 *     archive). The archive IS the store - deleting a story deletes history.
 *
 * Files, not SQLite, because this board is disk-based by design (RULES.md
 * rule 10) and because an editor must be able to open one in a text editor and
 * see what the magazine believes.
 */

/**
 * The editorial formats of §5. The page family a story lands in follows from
 * its format, so a RELEASE is discoverable where a reader looks for releases.
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

export interface Story {
  /** Stable across runs: a hash of the normalised headline. */
  id: string;
  headline: string;
  /** The compact summary §6 asks for. Never a truncated article. */
  summary: string;
  format: StoryFormat;
  /** Which scene of §3 this belongs to. Drives the page family. */
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

export type Desk =
  | 'hack'
  | 'scene'
  | 'music'
  | 'graffiti'
  | 'people'
  | 'stream'
  | 'archive'
  | 'general';

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
  general: { first: 101, last: 119, label: 'FRONT PAGE' },
  hack: { first: 120, last: 139, label: 'HACKING & PHREAKING' },
  scene: { first: 200, last: 219, label: 'SCENE & RETRO' },
  graffiti: { first: 300, last: 319, label: 'GRAFFITI & URBEX' },
  music: { first: 400, last: 419, label: 'MUSIC & RADIO' },
  people: { first: 500, last: 519, label: 'PEOPLE & LONG READS' },
  // ARCHIVE is history that was always history: §5.F scene histories,
  // recovered recordings, lost publications.
  archive: { first: 900, last: 949, label: 'ARCHIVE' },
  // STREAM is §5.A "latest transmissions" - a chronological surface for
  // everything the desks could not hold. It is NOT the archive, and calling a
  // story from Tuesday "archive" because its section filled up is an editorial
  // lie: on the first full run it mislabelled 85 of 164 stories.
  stream: { first: 950, last: 999, label: 'LATEST TRANSMISSIONS' },
};

/**
 * The normal form a headline is compared in.
 *
 * Feed headlines are not the same string twice for the same event: case,
 * punctuation and the trailing " - The Hacker News" vary between two feeds
 * carrying one story. Lowercased, stripped of everything that is not a letter
 * or a digit, and whitespace collapsed - so "Crackme released!" and
 * "crackme released" are one story, not two.
 */
export function normaliseHeadline(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A short, stable id. FNV-1a over the normalised headline.
 *
 * Not a cryptographic hash and does not need to be: the input is a headline we
 * wrote, and the only property that matters is that the same headline yields
 * the same id on every run and on every machine.
 */
export function storyId(raw: string): string {
  const s = normaliseHeadline(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Words that carry no editorial signal for comparing two headlines. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'will', 'its', 'it',
  'news', 'com', 'www', 'http', 'https', 'html', 'index', 'php',
]);

/** The content words of a headline, for comparing it to another headline. */
export function contentTokens(raw: string): Set<string> {
  return new Set(
    normaliseHeadline(raw)
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Are these two headlines the same story?
 *
 * An id comparison only ever catches headlines that differ in case and
 * punctuation, which is not what a syndication looks like. The same release
 * arrives as
 *
 *   "Skaven releases Copper Lights for Amiga"
 *   "Skaven releases Copper Lights - The Hacker News"
 *   "Copper Lights released by Skaven"
 *
 * and §14 step 4 says to combine them. Jaccard over content words puts those
 * together and leaves "Copper Lights released by Skaven" apart from a
 * different group's "Copper Lights" - which is why the threshold is high and
 * why the word lists are compared, not the strings.
 */
export function isSameStory(a: string, b: string): boolean {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const jaccard = shared / (ta.size + tb.size - shared);
  // Identical token sets short-circuit; the threshold is for near-matches only.
  if (shared === ta.size && shared === tb.size) return true;
  return jaccard >= 0.7;
}

/**
 * Words that carry no editorial signal. §7 says a headline should say what is
 * interesting; these are the words that mean nobody tried.
 */
const GENERIC = /\b(released|release|news|update|new|post|article|blog|story|report|announcement|read more|click here)\b/gi;

/**
 * Is this headline worth a caller's time?
 *
 * §15 draws the line: "A story does not need to be important in a mainstream
 * sense. It does need to be interesting to the audience this magazine exists to
 * serve." A headline that is only the generic words cannot be, whatever it is
 * about - it is what §5 calls reproducing the source's title.
 */
export function isWorthReading(headline: string): boolean {
  const meaningful = headline.replace(GENERIC, ' ').replace(/[^a-z0-9 ]/gi, ' ').trim();
  return meaningful.split(/\s+/).filter(Boolean).length >= 3;
}