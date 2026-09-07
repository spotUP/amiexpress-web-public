/**
 * Build the file index from the DIR files on disk.
 *
 * Run once by the sysop, and safe to re-run: every write is an upsert keyed by
 * the DIR-file identity, so a second run corrects rows rather than doubling
 * them. Nothing depends on this having been run - the index is a cache, and a
 * board with an empty one lists files exactly as it does today.
 *
 *   npx tsx src/scripts/build-file-index.ts [--conf N] [--open-archives] [--dry-run]
 *
 * `--open-archives` is PARSED BUT NOT YET IMPLEMENTED: it is the opt-in for the
 * expensive path - opening an archive to recover a FILE_ID.DIZ for an entry
 * that carries no continuation block - and it is off by default because a full
 * base of LHA/DMS archives is minutes of work for a field most rows already
 * have. The flag exists so the interface does not change when it lands.
 *
 * PATHS COME FROM THE RESOLVERS. `getDirFiles()` and `getConferenceDir()`, never
 * `Conf${n}` built by hand - conference 1 lives in `Conf2/` on this very board,
 * and the one script in this tree that builds the name itself
 * (`import-from-amiga.ts:62`) is a pre-existing bug this must not copy.
 */
import { config } from '../config';
import { db } from '../database';
import { getDirFiles } from '../utils/max-dirs.util';
import { readDirFile } from '../utils/dir-file-reader.util';
import { groupForFilename } from '../services/group-logo.service';
import {
  clearDirIndex,
  factsForEntry,
  groupTagsFor,
  upsertFileIndex,
} from '../services/file-index.service';

interface Options {
  conf?: number;
  openArchives: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { openArchives: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--conf') opts.conf = parseInt(argv[++i], 10);
    else if (argv[i] === '--open-archives') opts.openArchives = true;
    else if (argv[i] === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

/**
 * Every filename the board holds, which is the corpus `buildGroupTags()`
 * derives its tag set from.
 *
 * It has to be gathered BEFORE anything is indexed: the tag set is an input to
 * every reading, and a row analysed under a different corpus is a row that
 * disagrees with its neighbours for no visible reason.
 */
async function collectCorpus(confIds: readonly number[], bbsRoot: string): Promise<string[]> {
  const names: string[] = [];
  for (const confId of confIds) {
    for (const dir of await getDirFiles(confId, bbsRoot)) {
      try {
        for (const entry of await readDirFile(dir.path)) names.push(entry.filename.trim());
      } catch { /* an unreadable DIR contributes nothing */ }
    }
  }
  return names;
}

export async function buildFileIndex(opts: Options): Promise<{ conferences: number; files: number }> {
  const bbsRoot = config.get('dataDir');
  const confIds = opts.conf ? [opts.conf] : Array.from({ length: 14 }, (_, i) => i + 1);

  const corpus = await collectCorpus(confIds, bbsRoot);
  const groupTags = groupTagsFor(corpus);
  console.log(`[file-index] corpus: ${corpus.length} filenames, ${groupTags.size} group tags`);

  let conferences = 0;
  let files = 0;

  for (const confId of confIds) {
    const dirs = await getDirFiles(confId, bbsRoot);
    if (dirs.length === 0) continue;
    conferences++;

    for (const dir of dirs) {
      let entries;
      try {
        entries = await readDirFile(dir.path);
      } catch (err: any) {
        console.warn(`[file-index] conf ${confId} DIR${dir.index}: ${err?.message ?? err}`);
        continue;
      }

      if (!opts.dryRun) await clearDirIndex(db as any, confId, dir.index);

      for (const entry of entries) {
        const filename = entry.filename.trim();
        if (!filename) continue;

        const facts = factsForEntry({
          entry,
          groupTags,
          // The sysop's own correction, which outranks every derived source.
          mapGroup: groupForFilename(bbsRoot, filename) ?? null,
          catalog: await catalogRowFor(filename),
        });

        if (!opts.dryRun) {
          await upsertFileIndex(db as any, { confId, dirNumber: dir.index, filename }, facts);
        }
        files++;
      }

      console.log(`[file-index] conf ${confId} DIR${dir.index}: ${entries.length} entries`);
    }
  }

  return { conferences, files };
}

/**
 * The door-repo enrichment for this archive, when the catalog knows it.
 *
 * A board with no `door_catalog` is a perfectly ordinary board, so its absence
 * is established ONCE rather than discovered per row - 2,706 caught exceptions
 * and 2,706 error lines is not a diagnostic, it is noise that hides one.
 */
let catalogPresent: boolean | undefined;

async function catalogRowFor(filename: string) {
  if (catalogPresent === undefined) {
    try {
      await db.query(`SELECT 1 FROM door_catalog LIMIT 1`);
      catalogPresent = true;
    } catch {
      catalogPresent = false;
      console.log('[file-index] no door_catalog on this board - skipping catalog enrichment');
    }
  }
  if (!catalogPresent) return null;

  try {
    const { rows } = await db.query(
      `SELECT release_group, author, category FROM door_catalog WHERE archive_name = $1 LIMIT 1`,
      [filename],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  buildFileIndex(opts)
    .then(({ conferences, files }) => {
      console.log(
        `[file-index] ${opts.dryRun ? 'would index' : 'indexed'} ${files} files ` +
        `across ${conferences} conferences`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('[file-index] failed:', err);
      process.exit(1);
    });
}
