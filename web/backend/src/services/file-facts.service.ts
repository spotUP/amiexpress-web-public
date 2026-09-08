/**
 * The indexed facts a record view can show, and the corpus fingerprint it
 * takes to ask for them.
 *
 * `lookupFileFacts` (file-index.service.ts) has been correct and callerless
 * since SP4: reading it needs the SAME group-tag fingerprint the indexer
 * stored, and that fingerprint is built from every filename on the board -
 * far too expensive to rebuild for one record on one keypress. So it is built
 * once and cached here, and the record view finally has something to call.
 *
 * WHY A TTL AND NOT A WATCHER. The fingerprint changes when the board's
 * corpus changes - an upload, a new DIR file, a sysop's edit. A stale one does
 * not show wrong facts: `rowIsStale` compares it and answers null, and the
 * record then renders from its own parsed row, which is the same thing that
 * happens on a board that has never run the indexer. So the cost of staleness
 * is a record that shows less, never one that shows something false, and a
 * five-minute window buys back a full corpus walk per keypress.
 */
import {
  groupTagsFor,
  lookupFileFacts,
  tagsFingerprint,
  type FileIndexRow,
  type IndexDb,
} from './file-index.service';
import { getDirFiles } from '../utils/max-dirs.util';
import { readDirFile } from '../utils/dir-file-reader.util';

/** How long a corpus fingerprint is trusted before it is rebuilt. */
export const CORPUS_TTL_MS = 5 * 60 * 1000;

/** Conferences the board can hold - the same span the indexer walks. */
const CONFERENCES = Array.from({ length: 14 }, (_, i) => i + 1);

let cachedFingerprint: string | null = null;
let cachedAt = 0;

/** Drop the cache - for the tests, and for a sysop tool that rebuilds. */
export function forgetCorpusFingerprint(): void {
  cachedFingerprint = null;
  cachedAt = 0;
}

/**
 * Every filename the board holds, as the tag builder wants it.
 *
 * The same corpus `src/scripts/build-file-index.ts` collects, so the
 * fingerprint matches the one stored in the rows.
 */
async function collectCorpus(bbsRoot: string): Promise<string[]> {
  const names: string[] = [];
  for (const confId of CONFERENCES) {
    let dirs: Array<{ path: string }>;
    try {
      dirs = (await getDirFiles(confId, bbsRoot)) as Array<{ path: string }>;
    } catch {
      continue; // a conference the board does not have
    }
    for (const dir of dirs) {
      try {
        for (const entry of await readDirFile(dir.path)) {
          const filename = String(entry.filename ?? '').trim();
          if (filename) names.push(filename);
        }
      } catch {
        // an unreadable DIR contributes nothing and stops nothing
      }
    }
  }
  return names;
}

/** The cached fingerprint, rebuilt when it has aged out. */
export async function corpusFingerprint(bbsRoot: string, now: number = Date.now()): Promise<string> {
  if (cachedFingerprint !== null && now - cachedAt < CORPUS_TTL_MS) return cachedFingerprint;
  cachedFingerprint = tagsFingerprint(groupTagsFor(await collectCorpus(bbsRoot)));
  cachedAt = now;
  return cachedFingerprint;
}

/**
 * What the index knows about one file, or null.
 *
 * Null is an ordinary answer: an empty index, a row from an older extractor,
 * two DIRs that disagree. The caller renders from the record's own row and,
 * when there is nothing at all to render from, falls back to the DIZ.
 */
export async function factsForRecord(
  db: IndexDb,
  confId: number,
  filename: string,
  bbsRoot: string,
): Promise<FileIndexRow | null> {
  const name = String(filename ?? '').trim();
  if (!name) return null;
  try {
    return await lookupFileFacts(db, confId, name, await corpusFingerprint(bbsRoot));
  } catch (error) {
    console.error('[file-facts] lookup failed:', error);
    return null;
  }
}
