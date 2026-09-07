/**
 * What the board knows ABOUT a file, beyond the row the DIR file holds.
 *
 * A DIR entry gives a filename, a size, a marker, a date and whatever text the
 * uploader typed. A caller on a 40-column screen wants more than that - what
 * the thing IS, what version, whose release - and those facts have to be READ
 * out of the FILE_ID.DIZ that AmiExpress folded into the entry's continuation
 * lines. Reading them costs real work, so the answers are cached here.
 *
 * THIS TABLE IS A CACHE AND NOTHING ELSE. Every column can be recomputed from
 * the DIR file, an empty index is a valid state, and a miss degrades to the
 * DIR row's own text. Nothing in a listing waits on it and nothing breaks
 * without it.
 *
 * THE EXTRACTOR IS THE DOOR SERVER'S. `analyseDoor` here is the vendored
 * mirror of `amiexpress-doorserver/contract/describe.ts`, so a door described
 * on the board reads the same as the same door described in the repo - the
 * two-stores class of bug, closed before it opens. `extractor_ver` and
 * `tags_sha1` are stored per row so a rule change or a corpus change makes the
 * row stale rather than silently wrong.
 */
import * as crypto from 'crypto';

import { analyseDoor, buildGroupTags, looksLikeHandle, DESCRIBE_CONTRACT_VERSION } from '../utils/describe.generated';
import type { DirFileEntry } from '../utils/dir-file-reader.util';

/** Which of the four sources answered for the group. */
export type GroupSource = 'map' | 'catalog' | 'handle' | 'prefix';

export interface FileFacts {
  description: string | null;
  version: string | null;
  requiresBbs: string | null;
  author: string | null;
  releaseGroup: string | null;
  groupSource: GroupSource | null;
  category: string | null;
  dizSha1: string | null;
  tagsSha1: string;
  extractorVer: string;
}

export interface IndexKey {
  confId: number;
  dirNumber: number;
  filename: string;
}

/** sha1 of a text, or null for nothing. The identity a stale row is spotted by. */
export function sha1Of(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

/**
 * The fingerprint of a groupTags SET.
 *
 * `analyseDoor` is pure in its inputs, but one input is the tag set - derived
 * from the board's OWN corpus of filenames. Two boards legitimately disagree
 * about a door because their corpora differ, so a row records which corpus
 * produced it and goes stale when that changes.
 */
export function tagsFingerprint(tags: ReadonlySet<string>): string {
  return crypto.createHash('sha1').update(Array.from(tags).sort().join('\n'), 'utf8').digest('hex');
}

/**
 * The DIZ text a DIR entry carries.
 *
 * express.e writes the description block as continuation lines indented 33
 * columns (express.e:19499), so the block is the entry's rawLines after the
 * first, with that indent removed. An entry with no continuation lines has no
 * DIZ and the description is whatever was typed on the entry row itself.
 */
export function dizTextOf(entry: Pick<DirFileEntry, 'rawLines'>): string | null {
  const block = entry.rawLines
    .slice(1)
    .filter((line) => line.length > 33 && line.slice(0, 33).trim() === '')
    .map((line) => line.slice(33).replace(/\s+$/, ''));
  while (block.length > 0 && block[block.length - 1] === '') block.pop();
  return block.length > 0 ? block.join('\n') : null;
}

export interface CatalogRow {
  release_group?: string | null;
  author?: string | null;
  category?: string | null;
}

/**
 * The release group, from four sources IN TRUST ORDER.
 *
 * `groupSource` is recorded rather than discarded so a wrong logo can be
 * traced to the rule that produced it in one query, instead of being argued
 * about.
 *
 *   1. GROUPS.MAP    the sysop said so, and the sysop outranks every guess
 *   2. door_catalog  the door-repo's own enrichment for this archive
 *   3. handle tail   `sNoW/OUTLAWS` - the part after the separator
 *   4. name prefix   `OTL-INTRO.LHA` - the leading tag, when the board's own
 *                    corpus knows it as a tag
 */
export function deriveGroup(args: {
  filename: string;
  mapGroup?: string | null;
  catalog?: CatalogRow | null;
  author?: string | null;
  groupTags: ReadonlySet<string>;
}): { group: string | null; source: GroupSource | null } {
  if (args.mapGroup) return { group: args.mapGroup, source: 'map' };
  if (args.catalog?.release_group) return { group: args.catalog.release_group, source: 'catalog' };

  const author = args.author ?? '';
  if (author && looksLikeHandle(author)) {
    const tail = author.split(/[/\\]/).slice(1).join('/').trim();
    if (tail) return { group: tail, source: 'handle' };
  }

  // The leading tag of the filename, when the corpus knows it as one. The
  // separator set is the one the corpus itself uses: `OTL-`, `KDZ!`, `5D-`.
  const prefix = args.filename.match(/^([A-Za-z0-9]{1,6})[-!_.]/)?.[1];
  if (prefix) {
    for (const tag of args.groupTags) {
      if (tag.toUpperCase() === prefix.toUpperCase()) return { group: tag, source: 'prefix' };
    }
  }

  return { group: null, source: null };
}

/**
 * Read one DIR entry into the facts the index stores.
 *
 * Pure: the caller supplies the corpus tags, the sysop's map answer and the
 * catalog row, so this can be tested and re-run without a database.
 */
export function factsForEntry(args: {
  entry: DirFileEntry;
  groupTags: ReadonlySet<string>;
  mapGroup?: string | null;
  catalog?: CatalogRow | null;
}): FileFacts {
  const dizText = dizTextOf(args.entry);
  const filename = args.entry.filename.trim();

  const read = analyseDoor(
    {
      dizText,
      name: null,
      archiveName: filename,
      binaryName: null,
      catalogVersion: null,
      catalogAuthor: args.catalog?.author ?? null,
    },
    args.groupTags as Set<string>,
  );

  const group = deriveGroup({
    filename,
    mapGroup: args.mapGroup,
    catalog: args.catalog,
    author: read.author,
    groupTags: args.groupTags,
  });

  return {
    description: read.description ?? null,
    version: read.version ?? null,
    requiresBbs: read.requiresBbs ?? null,
    author: read.author ?? null,
    releaseGroup: group.group,
    groupSource: group.source,
    category: args.catalog?.category ?? null,
    dizSha1: sha1Of(dizText),
    tagsSha1: tagsFingerprint(args.groupTags),
    extractorVer: DESCRIBE_CONTRACT_VERSION,
  };
}

/**
 * Is a stored row still worth believing?
 *
 * Stale on either input changing: the RULES (a contract bump moves outputs) or
 * the CORPUS (a different tag set is a different reading). Cheaper than
 * re-analysing, and it is what lets a rule change roll out without a manual
 * rebuild.
 */
export function rowIsStale(
  row: { extractor_ver?: string | null; tags_sha1?: string | null },
  tagsSha1: string,
): boolean {
  return row.extractor_ver !== DESCRIBE_CONTRACT_VERSION || row.tags_sha1 !== tagsSha1;
}

/**
 * Resolve `(conf, filename)` across the DIRs of a conference.
 *
 * THE AMBIGUITY RULE. The adapter cannot know which DIR a door is printing, so
 * the lookup is by conference and name. If two DIRs hold that name and their
 * rows AGREE on the fields a reader would see, the answer stands; if they
 * DISAGREE, the answer is null and the record renders from its own parsed row.
 * Guessing the wrong description is worse than showing none.
 */
export function resolveAcrossDirs<T extends {
  description?: string | null;
  version?: string | null;
  release_group?: string | null;
}>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const first = rows[0];
  const agrees = rows.every(
    (row) =>
      (row.description ?? null) === (first.description ?? null) &&
      (row.version ?? null) === (first.version ?? null) &&
      (row.release_group ?? null) === (first.release_group ?? null),
  );
  return agrees ? first : null;
}

/** The board's own corpus of filenames, as the tag builder wants it. */
export function groupTagsFor(filenames: readonly string[]): Set<string> {
  return buildGroupTags(filenames as string[]);
}
