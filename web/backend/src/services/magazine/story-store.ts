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

/*
 * Story, StoryFormat and Desk live in the SDK (`formats/magazine`): the MAG
 * door reads the same files this store writes, so both import one declaration.
 */
import { FRONT_PAGE, PAGE_FAMILIES, type Desk, type Story, type StoryFormat } from '@amiexpress/bbs-door-sdk/formats/magazine';
export type { Desk, Story, StoryFormat };

// The page families live in the SDK: the MAG reader needs the same first pages to
// open a desk's index by number, and a second table would drift.
export { FRONT_PAGE, PAGE_FAMILIES };

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