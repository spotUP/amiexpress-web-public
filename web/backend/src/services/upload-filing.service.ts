/**
 * FILING AN UPLOAD: what happens to bytes once they are on disk.
 *
 * Everything between "the transfer finished" and "the board knows about the
 * file" - the duplicate check, the move into an area or the pool, the HOLD
 * quarantine when something is wrong, the catalogue row, the DIR entry,
 * FILES.BBS and Conftop's ctop.data.
 *
 * WHY IT IS A SERVICE. All of it lived inside `processBatchFile`
 * (`server/file-socket-handlers.ts`), interleaved with `socket.emit` calls,
 * an upload context and a session substate. FTP has none of those and needs
 * every one of the rules, and the two ways of filing a file must not drift:
 * a caller who uploads over FTP has to get the same duplicate handling, the
 * same quarantine, the same DIR entry as one who uploads at the menu. So the
 * rules live here once, and the callers differ only in how they tell the
 * caller what happened.
 *
 * THE ORDER IS express.e's AND IS NOT ARBITRARY:
 *
 *  1. the duplicate check runs BEFORE the move. On a pooled area a check
 *     afterwards would already have paid a PUT, replaced the object every
 *     node can see, and unlinked the playpen copy - leaving nothing local for
 *     the sysop to review when the file is then marked `D` and sent to HOLD
 *     (express.e:19356, 19371-19377).
 *  2. the playpen copy is unlinked AFTER a successful put, never before: a
 *     failed put must leave the caller's file where it can still be offered
 *     back.
 *  3. a pooled put that fails is QUARANTINED rather than filed - the bytes
 *     are not in the area, so listing them active advertises a download
 *     nobody can fetch.
 *  4. when the put fails AND the quarantine move fails, nothing is
 *     catalogued: the file is in the playpen, and a row or a DIR entry
 *     claiming HOLD points a sysop at a file that is not there.
 */
import * as fs from 'fs';

import { config } from '../config';
import { db } from '../database';
import { getConferenceDir, moveUploadedFile } from '../utils/file-hold.util';
import { getSystemTime } from '../utils/date-time.util';
import { writeUploadToDirFile } from '../utils/dir-file.util';
import { pooledUploadArea, putUploadIntoPool } from '../storage/remote-upload';
import type { RemoteLocation } from '../storage/remote-areas';
import { getStorageContext } from '../storage/storage-context';
import { storageFailureText } from '../storage/remote-download';

/** What a caller is told, and by which of the two front ends. */
export type FilingNotice =
  | { kind: 'duplicate'; text: string }
  | { kind: 'quarantined'; text: string }
  | { kind: 'storage-failure'; text: string }
  | { kind: 'orphaned'; text: string };

export interface FilingRequest {
  /**
   * Where the bytes are NOW - the node's playpen.
   *
   * ABSENT means there is nothing to move: the socket upload files a record
   * even when it has no path (a resumed batch entry whose bytes were dealt
   * with earlier), and this service must behave the same way rather than
   * quietly changing that front end's behaviour on extraction.
   */
  playpenPath?: string;
  filename: string;
  size: number;
  description: string;
  /** The area this upload belongs to, with its `dlPath` and `id`. */
  fileArea: { id: number; dlPath?: string } & Record<string, unknown>;
  conferenceId: number;
  nodeId: number;
  uploader: { username: string; location?: string };
  /** `hold` when an integrity test already failed; `private` for a private upload. */
  initialStatus: 'active' | 'private' | 'hold';
  /** P passed, F failed, N not tested. `D` is decided here, by the dupe check. */
  marker: 'P' | 'F' | 'N';
  /** SENTBY_FILES for this node, which decides whether the DIR entry names the uploader. */
  addSentBy: boolean;
}

export interface FilingOutcome {
  status: 'active' | 'private' | 'hold';
  marker: 'P' | 'F' | 'N' | 'D';
  duplicate: boolean;
  /** The put AND the quarantine both failed - the file is in the playpen, uncatalogued. */
  orphaned: boolean;
  pool: RemoteLocation | null;
  /** What the caller should be told, in order. The front end decides how. */
  notices: FilingNotice[];
}

/**
 * File an upload whose bytes are already in the playpen.
 *
 * Never throws for an expected failure - a duplicate, a dead volume, a
 * quarantine that could not be made are all outcomes a caller is told about,
 * not exceptions, because every one of them still has to leave the board
 * consistent.
 */
export async function fileUploadedFile(request: FilingRequest): Promise<FilingOutcome> {
  const notices: FilingNotice[] = [];
  const sysopName = String(config.get('sysopName') ?? 'the sysop');
  let status = request.initialStatus;
  let marker: FilingOutcome['marker'] = request.marker;

  // 1. The duplicate check, BEFORE the move. See the header.
  const existing = await db.query(
    'SELECT id, filename FROM file_entries WHERE LOWER(filename) = $1 AND areaid = $2',
    [request.filename.toLowerCase(), request.fileArea.id]
  );
  const duplicate = existing.rows.length > 0;
  if (duplicate) {
    // express.e:19372-19376 - a duplicate is not an abort. It goes to the
    // sysop's directory, marked D, and the caller is told.
    status = 'hold';
    marker = 'D';
    notices.push({
      kind: 'duplicate',
      text: `File already exists, moving to ${sysopName}'s private directory`,
    });
  }

  // 2. The move: into the pool for an active pooled area, else onto disk.
  let pool: RemoteLocation | null = null;
  let orphaned = false;
  const storage = getStorageContext();
  // HOLD and LCFILES are sysop-review directories, not areas a caller
  // downloads from, so a file bound for one never goes to the pool.
  const pooledArea =
    request.playpenPath && status === 'active'
      ? pooledUploadArea(request.fileArea as never, storage)
      : null;

  try {
    if (!request.playpenPath) {
      // Nothing to move. The catalogue row and the DIR entry below still
      // happen, which is what the socket upload did before this service.
    } else
    if (pooledArea && storage) {
      pool = await putUploadIntoPool(
        request.playpenPath!,
        request.filename,
        pooledArea,
        storage
      );
      try {
        await fs.promises.unlink(request.playpenPath!);
      } catch (unlinkError) {
        // The bytes are in the pool, so this leftover is not the only copy.
        // Nothing sweeps the playpen today; it waits for a sysop.
        console.warn(
          `[Filing] Could not remove playpen copy ${request.playpenPath}: ${
            unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`
        );
      }
    } else {
      await moveUploadedFile(
        request.playpenPath!,
        request.filename,
        status,
        request.conferenceId,
        config.get('dataDir'),
        request.fileArea.dlPath
      );
    }
  } catch (error) {
    if (pooledArea) {
      // 3. A pooled put that failed is quarantined, not filed.
      notices.push({
        kind: 'storage-failure',
        text: `Upload could not be filed: ${storageFailureText(error)}`,
      });
      notices.push({
        kind: 'quarantined',
        text: `Moving to ${sysopName}'s private Directory.`,
      });
      status = 'hold';
      try {
        await moveUploadedFile(
          request.playpenPath!,
          request.filename,
          status,
          request.conferenceId,
          config.get('dataDir'),
          request.fileArea.dlPath
        );
      } catch (holdError) {
        // 4. Neither the pool nor HOLD has it. Catalogue nothing.
        orphaned = true;
        notices.push({
          kind: 'orphaned',
          text: `${request.filename} could not be filed anywhere and needs a sysop`,
        });
        console.error(
          `[Filing] ORPHANED: node ${request.nodeId} left ${request.filename} in the playpen at ` +
            `${request.playpenPath} - not in the pool, not in HOLD, not catalogued: ${
              holdError instanceof Error ? holdError.message : String(holdError)}`
        );
      }
    } else {
      throw error;
    }
  }

  // 5. The catalogue row. Not for a duplicate (the row is already there, and
  //    the file went to HOLD rather than into the area), and not for an
  //    orphan (a row claiming HOLD would point at a file that is not there).
  if (!duplicate && !orphaned) {
    await db.createFileEntry({
      filename: request.filename,
      description: request.description,
      size: request.size,
      uploader: request.uploader.username,
      uploadDate: getSystemTime(),
      downloads: 0,
      areaId: request.fileArea.id,
      fileIdDiz: request.description,
      rating: undefined,
      votes: undefined,
      status,
      checked: marker,
      comment: undefined,
      // In the SAME insert rather than a follow-up: the row and its location
      // are one fact, and a second statement matching on the filename would
      // have to get this codebase's non-canonical filename case right.
      storageVolume: pool?.driveNumber,
      objectKey: pool?.key,
    } as never);
  }

  // 6. The DIR entry, FILES.BBS and ctop - the board's own listings. Skipped
  //    for an orphan for the same reason as the row.
  if (!orphaned) {
    const conferencePath = getConferenceDir(request.conferenceId, config.get('dataDir'));
    // DIR1 is the upload area (express.e:19475-19478). Using the COUNT of DIR
    // files was wrong: it grew with every upload, so each file landed in a
    // new DIR instead of the upload area.
    const uploadDirNum = 1;

    try {
      await writeUploadToDirFile(
        request.filename,
        request.size,
        getSystemTime(),
        request.description,
        marker,
        request.uploader.username,
        conferencePath,
        status,
        uploadDirNum,
        request.addSentBy
      );
    } catch (error) {
      console.error(
        `[Filing] Error writing the DIR entry for ${request.filename}: ${
          error instanceof Error ? error.message : String(error)}`
      );
    }

    if (status === 'active') {
      // FILES.BBS is for third-party doors (AquaScan reads it rather than
      // parsing DIR files), and ctop.data is what Conftop-II shows. Neither
      // is worth failing an upload over.
      try {
        const { writeToFilesBBS } = await import('../utils/files-bbs.util');
        await writeToFilesBBS(
          conferencePath,
          request.filename,
          request.size,
          getSystemTime(),
          request.description,
          marker,
          request.uploader.username,
          request.addSentBy,
          'Upload'
        );
      } catch (error) {
        console.error(
          `[Filing] Error writing FILES.BBS: ${
            error instanceof Error ? error.message : String(error)}`
        );
      }

      if (!duplicate) {
        try {
          const { appendCtopRecord } = await import('../utils/ctop-updater.util');
          await appendCtopRecord(
            conferencePath,
            request.uploader.username,
            request.uploader.location ?? '',
            request.size
          );
        } catch (error) {
          console.error(
            `[Filing] Error updating ctop.data: ${
              error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  return { status, marker, duplicate, orphaned, pool, notices };
}
