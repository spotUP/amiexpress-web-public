/**
 * A conference's file lists - the ONE place that edits them.
 *
 * FM at the BBS prompt and the admin site's file manager both come here
 * (plan thoughts/shared/plans/2026-09-29-admin-file-manager.md). The DIR
 * listings are the board's record of its files (it reads them, not the
 * catalogue), so every change goes: bytes first, listings after, nothing
 * changed if the bytes could not move - the rules FM already had, lifted out
 * of its socket handler so a second front end cannot grow a second copy.
 */
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

import { getConferenceDir } from '../utils/file-hold.util';
import { getHoldDirFilePath, parseDirFile, type DirFileEntry } from '../utils/dir-file-reader.util';
import { conferenceDownloadDirs, conferenceUploadDirs } from '../conferences/conference-paths';
import { getStorageContext } from '../storage/storage-context';
import { usableAreasFor } from '../storage/usable-areas';
import { putUploadIntoPool, uploadObjectKey } from '../storage/remote-upload';
import { storageFailureText } from '../storage/remote-download';
import { objectPrefixFor } from '../storage/remote-areas';

/** Where the board is, and the catalogue to keep in step (both optional in tests). */
export interface FileListContext {
  dataDir: string;
  db?: any;
}

/** A listing: DIR<n> of a conference, or its Hold (-1). */
export function listingPath(ctx: FileListContext, conf: number, dir: number): string {
  const conferencePath = getConferenceDir(conf, ctx.dataDir);
  return dir === -1 ? getHoldDirFilePath(conferencePath) : path.join(conferencePath, `DIR${dir}`);
}

/** The entries of one listing, parsed as the board reads them. */
export async function listEntries(ctx: FileListContext, conf: number, dir: number): Promise<DirFileEntry[]> {
  const file = listingPath(ctx, conf, dir);
  if (!fs.existsSync(file)) return [];
  return parseDirFile(fs.readFileSync(file, 'latin1'));
}

/** Where an entry sits in its listing: the header line and how many lines it spans. */
export interface EntryLines {
  start: number;
  count: number;
}

/**
 * Find a file's entry by name (case-insensitive, as the Amiga matches). FM
 * already knows the line from its search and passes it; the admin site asks
 * by name.
 */
export function findEntryLines(lines: string[], filename: string): EntryLines | null {
  const wanted = filename.toUpperCase();
  const isHeader = (line: string) => dateOfDirLine(line) !== '' && /^\S/.test(line);
  for (let i = 0; i < lines.length; i += 1) {
    if (!isHeader(lines[i]) || lines[i].split(/\s+/)[0].toUpperCase() !== wanted) continue;
    let end = i + 1;
    while (end < lines.length && !isHeader(lines[end]) && lines[end] !== '') end += 1;
    return { start: i, count: end - i };
  }
  return null;
}

export interface DeleteOutcome {
  /** The provider may keep a pooled file's bytes for a while (RETENTION). */
  retentionWarning: string | null;
  /** The listing entry went but the bytes did not; the old listing is in .bak. */
  bytesError: string | null;
}

/**
 * express.e FM D: the entry comes out of the listing and the bytes go
 * (local, or the pool object). The listing is rewritten first, as FM always
 * did, and a bytes failure is reported rather than hidden.
 */
export async function deleteEntry(
  ctx: FileListContext,
  conf: number,
  dir: number,
  filename: string,
  at?: EntryLines,
): Promise<DeleteOutcome> {
  const file = listingPath(ctx, conf, dir);
  if (!fs.existsSync(file)) throw new Error('Directory list not found');
  const lines = readDirLines(file);
  const where = at ?? findEntryLines(lines, filename);
  if (!where) throw new Error(`${filename} is not in that listing`);
  writeDirLines(file, [...lines.slice(0, where.start), ...lines.slice(where.start + where.count)]);

  let retentionWarning: string | null = null;
  let bytesError: string | null = null;
  try {
    retentionWarning = await deleteBytes(ctx, conf, filename, dir);
  } catch (error) {
    bytesError = error instanceof Error ? error.message : String(error);
    console.error('[FileList] Physical delete failed:', error);
  }
  return { retentionWarning, bytesError };
}

/**
 * express.e FM M: bytes to the destination conference's ULPATH.1 (or pool)
 * first; only then does the entry leave its listing and go into the
 * destination's, spliced by date. Throws, with nothing changed, when the
 * bytes cannot move. Out of Hold is how a file is released, so the catalogue
 * row stops saying 'hold'.
 */
export async function moveEntry(
  ctx: FileListContext,
  from: { conf: number; dir: number; filename: string; at?: EntryLines },
  to: { conf: number; dir: number },
): Promise<void> {
  const source = listingPath(ctx, from.conf, from.dir);
  const destination = listingPath(ctx, to.conf, to.dir);
  const srcLines = readDirLines(source);
  const where = from.at ?? findEntryLines(srcLines, from.filename);
  if (!where) throw new Error(`${from.filename} is not in that listing`);

  await moveBytes(ctx, from.conf, from.filename, from.dir, to.dir, to.conf);

  const entryLines = srcLines.slice(where.start, where.start + where.count);
  writeDirLines(source, [...srcLines.slice(0, where.start), ...srcLines.slice(where.start + where.count)]);
  const destLines = fs.existsSync(destination) ? readDirLines(destination) : [];
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  writeDirLines(destination, spliceByDate(destLines, entryLines));

  if (from.dir === -1) {
    try {
      ctx.db?.releaseFromHold?.(from.filename, from.conf);
    } catch (err) {
      console.error(`[FileList] released ${from.filename} from Hold but could not update its catalog row:`, err);
    }
  }
}

/**
 * DIR files hold Amiga text: high-bit bytes carrying ANSI art, not UTF-8.
 * Reading one as 'utf-8' turns every such byte into U+FFFD and writing it
 * back makes that permanent - a single FM delete destroyed 42 bytes of art
 * belonging to OTHER entries in Conf2/Dir1 on 2026-09-06. 'latin1' is a
 * byte-preserving round trip: every byte maps to the code point of the same
 * value and back again unchanged.
 */
export function readDirLines(dirFilePath: string): string[] {
  return fs.readFileSync(dirFilePath, 'latin1').split(/\r?\n/);
}

/**
 * Rewrite a DIR file, keeping a copy of what was there.
 *
 * The listing is the board's only record of a file - it is not in the
 * database and the DIR files are gitignored, so a bad rewrite is
 * unrecoverable. The .bak is what makes it recoverable.
 */
export function writeDirLines(dirFilePath: string, lines: string[]): void {
  try {
    fs.copyFileSync(dirFilePath, `${dirFilePath}.bak`);
  } catch (error) {
    console.error('[FileList] Could not back up the directory listing:', error);
  }
  fs.writeFileSync(dirFilePath, lines.join('\r\n'), 'latin1');
}

/**
 * express's `getDateCompareVal` (MiscFuncs.e:422-436), which is what makes
 * two `mm-dd-yy` strings comparable:
 *
 *     year*10000 + month*100 + day
 *
 * with a two-digit year above TWODIGITYEARSWITCHOVER (axconsts.e:41, 77)
 * meaning the 1900s. A file stamped 03-28-92 is 1992, not 2092.
 */
export function dateCompareValue(dateStr: string): number {
  const match = /^(\d{2})-(\d{2})-(\d{2})$/.exec((dateStr || '').trim());
  if (!match) return 0;
  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  const twoDigit = Number.parseInt(match[3], 10);
  const year = twoDigit > 77 ? 1900 + twoDigit : 2000 + twoDigit;
  return year * 10000 + month * 100 + day;
}

/** The `mm-dd-yy` field of a DIR line, or '' when the line has none. */
export function dateOfDirLine(line: string): string {
  // express blanks column 13 before splitting, because the filename column
  // is fixed-width and can run straight into the size (express.e:27204).
  const spaced = line.length > 13 ? `${line.slice(0, 13)} ${line.slice(14)}` : line;
  const fields = spaced.trim().split(/\s+/);
  const candidate = fields.length > 2 ? fields[2] : '';
  return /^\d{2}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
}

/**
 * Put the entry where its date belongs, rather than at the end.
 *
 * express.e:27196-27230 walks the destination listing and splices the moved
 * entry in front of the first entry dated the same or LATER (`brk:=(d2>=d1)`,
 * 27211). A DIR file runs oldest first - an upload is appended - so that
 * keeps it in date order. Appending dropped every moved file to the bottom;
 * the earlier fix inserted before the first OLDER entry, which put a moved
 * file above everything older than it, at the top of an oldest-first list.
 *
 * An entry spans however many lines it has (a description continues on the
 * lines after the header), so both sides move as a block.
 */
export function spliceByDate(destLines: string[], entryLines: string[]): string[] {
  const header = entryLines.find((line) => dateOfDirLine(line) !== '');
  if (!header) return destLines.concat(entryLines);

  const entryDate = dateCompareValue(dateOfDirLine(header));

  for (let index = 0; index < destLines.length; index += 1) {
    const lineDate = dateOfDirLine(destLines[index]);
    if (lineDate === '') continue;
    if (dateCompareValue(lineDate) >= entryDate) {
      return [
        ...destLines.slice(0, index),
        ...entryLines,
        ...destLines.slice(index),
      ];
    }
  }

  return destLines.concat(entryLines);
}

/**
 * Deletes the bytes behind a DIR entry - local disk, or the pool object
 * when the area is pooled.
 *
 * Before this, a pooled area's DELETE only unlinked LOCAL candidates
 * (HOLD/LCFILES/DIRn/DLPATH/ULPATH - see `buildFileCandidates`), none of
 * which exist for a file whose bytes live in a bucket. The DIR line went;
 * the object did not - it still resolved, still served through `D` and
 * both HTTP download routes, and still consumed quota. `forget` drops it
 * from the pool's own name index (so `D`/listings stop finding it without
 * waiting on a re-list) and `backend.delete` removes the object itself;
 * any local cache copy is dropped too so a stale hit does not go on
 * serving it until the next eviction sweep happens to reclaim it.
 *
 * THE KEY IS RESOLVED, NOT RECONSTRUCTED - gate 2, blocker 4.
 * `uploadObjectKey` concatenates the area prefix with the filename AS THE
 * DIR LINE SPELLS IT, but the name index `D` reads through resolves
 * case-insensitively (`byLowerName`). For an object whose real key differs
 * in case from its DIR line - a hand-edited DIR file, a bucket migrated in
 * from elsewhere - the reconstructed key names nothing: `backend.delete`
 * no-ops (an S3 DELETE of a missing key succeeds), `forget` matches
 * nothing, the DIR line goes, and the sysop is told the delete is complete
 * while `D` goes on serving the file through that same case-insensitive
 * index. So this asks the index the same question `D` asks
 * (`locateRemoteFile`: `resolve(filename)`, then `sizeOf(key)`) and deletes
 * what it answers. A volume that cannot answer falls back to the
 * reconstructed key rather than treating the file as absent - the
 * unavailable/missing distinction the whole subsystem rests on.
 *
 * Returns a warning to show the sysop when this drive is RETENTION-bound:
 * `DeleteObject` on a bucket with object-lock/versioning or a lifecycle
 * retention policy can leave the bytes recoverable (or simply retained)
 * for the configured period despite this call succeeding - this codebase
 * has no way to know which providers enforce that, so it says so rather
 * than implying the delete is unconditionally final everywhere.
 */
export async function deleteBytes(
  ctx: FileListContext,
  conf: number,
  filename: string,
  dirNum?: number
): Promise<string | null> {
  const confNum = conf;
  const dataDir = ctx.dataDir;

  const storage = getStorageContext();
  const pooledArea =
    storage && dirNum !== undefined
      ? usableAreasFor(confNum, storage).find(area => area.dirNumber === dirNum)
      : undefined;

  if (pooledArea && storage && pooledArea.storageVolume !== undefined) {
    const driveNumber = pooledArea.storageVolume;
    const prefix = objectPrefixFor(pooledArea);
    const index = storage.names.forArea(driveNumber, prefix);
    let key = uploadObjectKey(pooledArea, filename);
    try {
      const resolved = await index.resolve(filename);
      if (resolved !== null) key = resolved;
    } catch (error) {
      // The volume could not answer. That is NOT "no such object": keep
      // the reconstructed key and let the delete below report its own
      // failure, rather than silently deciding there is nothing to remove.
      console.error(
        `[FileMaintenance] could not resolve ${filename} on DRIVE.${driveNumber} before deleting it, ` +
          `falling back to ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const state = storage.volumes.byNumber(driveNumber);
    // Read before the delete and before `forget`, which drops it: the size
    // the listing gave this key is what the quota credit below is worth.
    const sizeBytes = index.sizeOf(key) ?? 0;

    if (!state) {
      // There is nothing to delete THROUGH. The DIR line is already gone by
      // the time this runs, so returning quietly is how a sysop loses the
      // listing and keeps bytes that still occupy the drive.
      throw new Error(
        `DRIVE.${driveNumber} is not mounted, so ${key} was not removed from the pool`
      );
    }

    try {
      await state.backend.delete(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[FileMaintenance] could not delete ${filename} (DRIVE.${driveNumber}:${key}) from the pool: ${message}`
      );
      // The object is still in the bucket. Everything below - forgetting the
      // name index entry, crediting the quota back, dropping the local copy -
      // describes a delete that happened, and applying any of it to one that
      // did not makes a file that still costs quota invisible to every route
      // that could remove it. Report the failure instead: `performDelete`
      // tells the sysop the listing went and the file did not.
      throw new Error(`DRIVE.${driveNumber}:${key} - ${message}`);
    }

    index.forget(key);

    // Gate 2, blocker 3: a pooled delete has to give the quota back, in
    // BOTH places that hold it, or the two disagree at the next rebuild.
    //
    //   - the CATALOG's location record, because `usedBytesByVolume` is
    //     `SUM(size) WHERE storage_volume IS NOT NULL` and the boot seed
    //     reads exactly that. Leave the record and the next rebuild
    //     re-seeds `usedBytes` with the deleted object's bytes all over
    //     again, undoing the in-process decrement below.
    //   - the IN-PROCESS counter, because nothing re-reads the catalog
    //     until that rebuild, and `roomOn` (`quota - usedBytes`) is what
    //     the upload gate asks in the meantime.
    //
    // Only reached on a delete that actually happened - a failed
    // DeleteObject throws above, because the bytes are still there and
    // still occupy the drive, and crediting them back would be the same
    // lie in the opposite direction.
    storage.cache.creditDeleted(driveNumber, key, sizeBytes);
    try {
      // The key, not just the DIR line's spelling: the two can differ in
      // case and the row is cleared by the key that was really deleted.
      ctx.db?.clearLocation?.(filename, pooledArea.id, key);
    } catch (err) {
      console.error(
        `[FileMaintenance] deleted ${filename} from DRIVE.${driveNumber} but could not clear its catalog ` +
          `location, so the next rebuild will re-seed those bytes: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }

    // A staged, un-uploaded copy is the only copy of something the pool
    // does not have yet - never delete a dirty local file, budget or no
    // budget, delete command or eviction.
    if (!storage.cache.isDirty(driveNumber, key)) {
      try {
        fs.unlinkSync(storage.cache.localPathFor(driveNumber, key));
      } catch {
        // Not cached locally right now - nothing to remove.
      }
    }

    return state.volume.retentionDays !== undefined
      ? `DRIVE.${driveNumber} has a ${state.volume.retentionDays}-day RETENTION policy - the provider may ` +
          `keep these bytes recoverable for that long even though the delete succeeded here.`
      : null;
  }

  const candidates = await buildFileCandidates(ctx, confNum, filename, dirNum);
  for (const filePath of candidates) {
    try {
      await fsp.unlink(filePath);
      return null;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Moves the file itself into the destination directory.
 *
 * WHEN THE DESTINATION AREA LIVES IN THE POOL this is a put, not a rename,
 * and the difference is not cosmetic: a rename leaves the bytes on local
 * disk, where nothing Task 8 built will ever look for them - the area's
 * files are resolved through that drive's name index over the area's object
 * prefix. A "successful" local rename into a pooled area is an invisible
 * file. This is also how a HOLD or PRIVATE upload is released into an area
 * (srcDir -1 is the HOLD listing), which is the normal route for anything
 * that failed testFile, so it is not an exotic path.
 *
 * A pooled move that cannot reach the pool THROWS, where the local branch
 * still swallows and moves on. Silence is affordable for a rename that lost
 * a race with another node; it is not affordable when the alternative is a
 * sysop believing a released file is downloadable.
 */
export async function moveBytes(
  ctx: FileListContext,
  fromConf: number,
  filename: string,
  srcDir?: number,
  destDir?: number,
  destConf?: number,
) {
  const confNum = fromConf;
  // express.e:27256 the bytes go to the DESTINATION conference's ULPATH.1.
  // Reading the source conference here left a cross-conference move's file
  // in the source, where a download from the destination never looks.
  const toConf = destConf || confNum;
  const candidates = await buildFileCandidates(ctx, confNum, filename, srcDir);

  const storage = getStorageContext();
  const destArea =
    storage && destDir !== undefined
      ? usableAreasFor(toConf, storage).find(area => area.dirNumber === destDir)
      : undefined;

  if (destArea && storage) {
    const source = candidates.find(candidate => fs.existsSync(candidate));
    if (!source) {
      // Either the file is not on local disk at all, or it is already an
      // object in some area - moving objects between prefixes is a
      // copy-object this handler does not do yet. Either way, say so.
      throw new Error(
        `${filename} was not found on local disk, so it could not be filed into DRIVE.${destArea.storageVolume}`
      );
    }
    let location;
    try {
      location = await putUploadIntoPool(source, filename, destArea, storage);
    } catch (error) {
      throw new Error(storageFailureText(error));
    }
    // Tell the catalog where the bytes landed. This is the HOLD/PRIVATE
    // release path (srcDir -1 is the HOLD listing) - the row for this file
    // was already inserted with `areaid = destArea.id` at upload time
    // (status 'hold'), so this UPDATE finds it by the exact
    // (filename, areaId) pair recordLocation matches on. Without this,
    // routes-setup.ts's by-id download route reads a NULL storage_volume
    // for a file that IS in the bucket and 404s it, usedBytesByVolume
    // under-counts this drive, and entriesOnVolume omits it from the
    // per-volume contents report.
    //
    // Best-effort, deliberately: the bytes are already safely in the pool
    // (putUploadIntoPool succeeded above), and an ordinary re-move between
    // two already-active areas can legitimately have no matching
    // (filename, destArea.id) row yet - the catalog sync for that path is
    // its own pre-existing gap (see the commented-out moveDbEntry below),
    // not one this fix should turn into a failed move that leaves the
    // object orphaned in the bucket with the sysop told it failed.
    try {
      ctx.db?.recordLocation?.(filename, destArea.id, location.driveNumber, location.key);
    } catch (err) {
      console.error(
        `[FileMaintenance] moved ${filename} into DRIVE.${location.driveNumber} but could not record its ` +
          `catalog location: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    // Only once the object is really there.
    await fsp.unlink(source);
    return;
  }

  const destPath = path.join(getUploadBase(ctx, toConf), filename);

  for (const srcPath of candidates) {
    if (!fs.existsSync(srcPath)) continue;
    // express.e:27298 a file already in the destination's upload path has arrived.
    if (path.resolve(srcPath) === path.resolve(destPath)) return;
    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    try {
      await fsp.rename(srcPath, destPath);
    } catch {
      // express.e:27305-27310 Rename fails across volumes: copy, then delete.
      await fsp.copyFile(srcPath, destPath);
      await fsp.unlink(srcPath);
    }
    return;
  }
  // express.e:27358 "Move operation failed, restoring directories" - the
  // listings are not touched when the bytes did not move.
  throw new Error(`${filename} was not found in the conference's file directories`);
}

export async function buildFileCandidates(ctx: FileListContext, confNum: number, filename: string, dirNum?: number): Promise<string[]> {
  const dataDir = ctx.dataDir;
  const confPath = getConferenceDir(confNum, dataDir);
  const list: string[] = [];

  // HOLD / LCFILES
  list.push(path.join(confPath, 'HOLD', filename));
  list.push(path.join(confPath, 'LCFILES', filename));

  // DIR-specific folder (best-effort)
  if (dirNum && dirNum > 0) {
    list.push(path.join(confPath, `DIR${dirNum}`, filename));
  }

  // express.e:27296-27299 the conference's DLPATH.n, then its ULPATH.n
  for (const dir of [...conferenceDownloadDirs(dataDir, confNum), ...conferenceUploadDirs(dataDir, confNum)]) {
    list.push(path.join(dir, filename));
  }
  // A conference whose icon names no paths keeps them where D looks for
  // them (download.handler findFilesInConference): Upload and Files.
  list.push(path.join(confPath, 'Upload', filename));
  list.push(path.join(confPath, 'Files', filename));

  return list;
}

/**
 * Where a conference files an upload: its ULPATH.1 (express.e:27256), or
 * the conference's own Upload directory when the icon names none - what
 * the rest of this codebase reaches for (routes-setup.ts,
 * batch-download.handler.ts, file-areas-loader.ts).
 */
export function getUploadBase(ctx: FileListContext, confNum: number): string {
  const dataDir = ctx.dataDir;
  const configured = conferenceUploadDirs(dataDir, confNum);
  if (configured.length > 0) return configured[0]!;
  return path.join(getConferenceDir(confNum, dataDir), 'Upload');
}
