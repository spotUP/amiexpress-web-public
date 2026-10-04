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
import { nodeFlag } from '../utils/node-tooltypes.util';
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { db } from '../database';
import { getConferenceDir, moveUploadedFile } from '../utils/file-hold.util';
import { conferenceDownloadDirs, conferenceDir } from '../conferences/conference-paths';
import { loadConfConfig } from './conf-config.service';
import { getSystemTime } from '../utils/date-time.util';
import { writeUploadToDirFile } from '../utils/dir-file.util';
import { pooledUploadArea, putUploadIntoPool } from '../storage/remote-upload';
import type { RemoteLocation } from '../storage/remote-areas';
import { getStorageContext } from '../storage/storage-context';
import { storageFailureText } from '../storage/remote-download';

/**
 * WHERE THE BYTES GO: the conference's own DLPATH, not the SQL row.
 *
 * express.e:15264 moves an upload into the area's DLPATH, and on this board
 * that path lives in `Conf<n>.info` - `Conf2.info` says
 * `DLPATH.1=BBS:Conf3/Files` and means it. The `file_areas` table is a
 * mirror that was never filled in: four seeded demo rows covering two of
 * fourteen conferences, with paths (`/files/general`) that exist nowhere. An
 * upload filed against those was saved by `moveToFiles` falling back to
 * `<conf>/Files`, and a caller in conference 3 had no row at all.
 *
 * So the area's `dlPath` is used when it is really set, and otherwise the
 * conference's first DLPATH decides - the same directory
 * `conferenceDownloadDirs` gives the download side, so the two halves agree
 * by rule instead of by both falling back to the same place.
 */
export function destinationFor(
  fileArea: { dlPath?: string } | null | undefined,
  conferenceId: number,
  bbsRoot: string
): string | undefined {
  const configured = fileArea?.dlPath?.trim();
  if (configured && configured !== process.cwd()) return configured;
  return conferenceDownloadDirs(bbsRoot, conferenceId)[0];
}

/**
 * The catalogue area for a conference, CREATED FROM THE BOARD if the mirror
 * has none.
 *
 * `file_entries.areaid` is `NOT NULL REFERENCES file_areas(id)`, so a file
 * cannot be catalogued without an area - and `file_areas` on this board is
 * seed data: four demo rows ("General Files", `/files/general`) covering two
 * conferences out of fourteen. A caller uploading into any other conference
 * could not be catalogued at all.
 *
 * The board itself knows what the area is: the conference's name in
 * `ConfConfig.info` and its first `DLPATH` in `Conf<n>.info`. So the row is
 * derived from those the first time a conference needs one, and every upload
 * and listing after it has a real area to belong to. The disk stays the
 * truth; the table catches up with it.
 */
export async function areaForConference(
  conferenceId: number,
  bbsRoot: string
): Promise<{ id: number; dlPath?: string } & Record<string, unknown>> {
  const existing = await db.getFileAreas(conferenceId);
  if (existing.length > 0) return existing[0] as never;

  const dlPath = conferenceDownloadDirs(bbsRoot, conferenceId)[0]
    ?? path.join(conferenceDir(bbsRoot, conferenceId), 'Files');
  const named = loadConfConfig(bbsRoot)?.entries?.[conferenceId - 1]?.name?.trim();
  const name = named || `Conference ${conferenceId}`;
  const id = await db.createFileArea({
    name,
    description: `Files in ${name}`,
    path: dlPath,
    conferenceId,
    maxFiles: 0,
    uploadAccess: 0,
    downloadAccess: 0,
  } as never);
console.log(`[Filing] Conference ${conferenceId} had no file area; created "${name}" (id ${id}) at ${dlPath} from the board's own icons`);
  return { id, dlPath, name, conferenceId } as never;
}

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
  /**
   * The catalogue area this upload belongs to, when the board has one. It may
   * be ABSENT: `file_areas` is a mirror, and on this board it holds seeded
   * demo rows for two conferences out of fourteen ("General Files",
   * `/files/general`), so a caller uploading anywhere else has no row at all.
   * Where the bytes go is decided by the conference's own icon either way -
   * see `destinationFor`.
   */
  fileArea?: ({ id?: number; dlPath?: string } & Record<string, unknown>) | null;
  conferenceId: number;
  nodeId: number;
  /** slotNumber: the uploader's user.data slot, for their own upload tracking. */
  uploader: { username: string; location?: string; slotNumber?: number };
  /** `hold` when an integrity test already failed; `private` for a private upload. */
  initialStatus: 'active' | 'private' | 'hold';
  /** P passed, F failed, N not tested. `D` is decided here, by the dupe check. */
  marker: 'P' | 'F' | 'N';
  /**
   * The bytes came over FTP: the CallersLog gets ftpUploadFileEnd's two lines
   * (express.e:15084-15093) instead of logUDFile's (express.e:9480-9489).
   * `seconds` and `cps` are the transfer's own.
   */
  ftp?: { seconds: number; cps: number };
}

/**
 * express.e:19506 - the DIR entry ends 'Sent by: <name>' only when the node's
 * icon carries SENTBY_FILES. It was a database column defaulting to TRUE, so
 * a board whose icons never set it signed every upload - under the tagline a
 * FILE_ID door had already added (sysop, 2026-09-30).
 */
function sentByFor(nodeId: number): boolean {
  return nodeFlag(nodeId, 'SENTBY_FILES');
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
 * The CallersLog line for a file the board could not move, as express.e
 * writes it:
 *
 *  - into the upload area, moveFile's express.e:16253-16254:
 *      '\tFAILURE!, unable to move file \s from PlayPen'
 *  - into HOLD, express.e:19428-19435 - which overwrites the destination with
 *    its own warning before logging it, so the line really is
 *      '\tUpload unable to be moved to WARNING!\b\nUnable to move file!\b\n'
 *    (`\b` is CR in E). Kept byte for byte: it is what the tools reading a
 *    CallersLog have always seen.
 */
function logUnmoved(request: FilingRequest, status: FilingOutcome['status']): void {
  const { writeToCallersLog } = require('../utils/download-logging.util');
  const line = status === 'active'
    ? `\tFAILURE!, unable to move file ${request.filename} from PlayPen`
    : '\tUpload unable to be moved to WARNING!\r\nUnable to move file!\r\n';
  void writeToCallersLog(line, request.nodeId);
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

  // 0. THE CALLERSLOG'S LINE FOR THE FILE THAT CAME IN. GLCUpdater (GLCUpdater.e
  //    691-697) credits an upload summary only when the line before it says
  //    `Uploading ` or `Upload moved`, and SAmiLog's upload flag is
  //    `Uploading`; without these lines no upload on this board was ever
  //    credited. Written here because this is where every transport's file
  //    arrives (web, telnet, FTP), once per file.
  if (request.ftp) {
    // express.e:15084-15088 ftpUploadFileEnd - CallersLog only, no UDLog.
    const { formatFtpUploadLines, writeToCallersLog } = require('../utils/download-logging.util');
    for (const line of formatFtpUploadLines(request.filename, request.size, 0, request.ftp.seconds, request.ftp.cps) as string[]) {
      await writeToCallersLog(line, request.nodeId);
    }
  } else {
    // express.e:16521 zmprogress -> logUDFile(FALSE), express.e:9480-9489.
    const { logUpload } = require('../utils/download-logging.util');
    await logUpload(request.filename, request.size, request.nodeId);
  }
  const sysopName = String(config.get('sysopName') ?? 'the sysop');
  let status = request.initialStatus;
  let marker: FilingOutcome['marker'] = request.marker;

  // 1. The duplicate check, BEFORE the move. See the header.
  //
  // The area this file belongs to: the caller's, or the one the board
  // implies (see areaForConference). Either way it exists by the time the
  // duplicate check runs, which is what `file_entries.areaid` requires.
  const area = request.fileArea?.id
    ? request.fileArea
    : await areaForConference(request.conferenceId, config.get('dataDir'));
  const areaId = area.id as number;
  // express.e:19356 checkForFile - the conference's own directories on
  // disk (18408-18447), never the catalogue: a row outlives a file the sysop
  // deleted, and its re-upload must not be held as a duplicate. A file in the
  // storage pool has no place on the board's disk, so for it the catalogue row
  // is the file.
  const { checkForFile } = require('../utils/file-upload.util');
  const onBoard: boolean = await checkForFile(request.filename, request.conferenceId, config.get('dataDir'), request.nodeId);
  const inPool = onBoard ? false : (await db.query(
    'SELECT id FROM file_entries WHERE LOWER(filename) = $1 AND areaid = $2 AND storage_volume IS NOT NULL',
    [request.filename.toLowerCase(), areaId]
  )).rows.length > 0;
  const duplicate = onBoard || inPool;
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
  // Where the bytes landed on local disk, for the fallback below.
  let placedAt: string | null = null;
  const storage = getStorageContext();
  // HOLD and LCFILES are sysop-review directories, not areas a caller
  // downloads from, so a file bound for one never goes to the pool.
  const pooledArea =
    request.playpenPath && status === 'active'
      ? pooledUploadArea(area as never, storage)
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
      try {
        placedAt = await moveUploadedFile(
          request.playpenPath!,
          request.filename,
          status,
          request.conferenceId,
          config.get('dataDir'),
          destinationFor(area, request.conferenceId, config.get('dataDir'))
        );
      } catch (moveError) {
        logUnmoved(request, status);
        throw moveError;
      }
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
        placedAt = await moveUploadedFile(
          request.playpenPath!,
          request.filename,
          status,
          request.conferenceId,
          config.get('dataDir'),
          destinationFor(area, request.conferenceId, config.get('dataDir'))
        );
      } catch (holdError) {
        // 4. Neither the pool nor HOLD has it. Catalogue nothing.
        orphaned = true;
        logUnmoved(request, status);
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

  // 5. The DIR entry, FILES.BBS and ctop - the board's own listings. Skipped
  //    for an orphan for the same reason as the row.
  if (!orphaned) {
    const conferencePath = getConferenceDir(request.conferenceId, config.get('dataDir'));
    // DIR1 is the upload area (express.e:19475-19478). Using the COUNT of DIR
    // files was wrong: it grew with every upload, so each file landed in a
    // new DIR instead of the upload area.
    const uploadDirNum = 1;

    // The DIR entry is the board's record of the file (the board reads its
    // listings, not the catalogue), so it is written straight after the bytes
    // land and nothing may stand in front of it. A file on disk with no entry
    // is invisible to F, Z and D - Conf3's lxt-ee4d.ZIP sat like that from
    // 2026-08-25 until the sysop found it.
    const listIt = (as: typeof status) => writeUploadToDirFile(
      request.filename,
      request.size,
      getSystemTime(),
      request.description,
      marker,
      request.uploader.username,
      conferencePath,
      as,
      uploadDirNum,
      sentByFor(request.nodeId)
    );
    try {
      await listIt(status);
    } catch (error) {
      console.error(
        `[Filing] Error writing the DIR entry for ${request.filename}: ${
          error instanceof Error ? error.message : String(error)}`
      );
      // Not listed where it belongs: file it in HOLD with a HELD entry, as a
      // failed pooled put is (step 3), so the sysop has it in front of him.
      try {
        if (!placedAt || status === 'hold' || status === 'private') throw error;
        const { moveToHold } = await import('../utils/file-hold.util');
        placedAt = await moveToHold(placedAt, request.filename, conferencePath);
        status = 'hold';
        await listIt(status);
        notices.push({
          kind: 'quarantined',
          text: `Moving to ${sysopName}'s private Directory.`,
        });
      } catch (holdError) {
        orphaned = true;
        notices.push({
          kind: 'orphaned',
          text: `${request.filename} could not be listed and needs a sysop`,
        });
        console.error(
          `[Filing] UNLISTED: node ${request.nodeId} filed ${request.filename} at ${placedAt ?? '(pool)'} ` +
            `but no DIR listing could be written: ${
              holdError instanceof Error ? holdError.message : String(holdError)}`
        );
      }
    }

    // 6. The catalogue row - the web's mirror, written AFTER the listing so a
    //    database failure can never leave a file unlisted. Not for a
    //    duplicate (the row is already there, and the file went to HOLD rather
    //    than into the area), and not for an orphan (a row would point at a
    //    file that is not listed).
    if (!duplicate && !orphaned) {
      try {
        await db.createFileEntry({
          filename: request.filename,
          description: request.description,
          size: request.size,
          uploader: request.uploader.username,
          uploadDate: getSystemTime(),
          downloads: 0,
          areaId: areaId,
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
      } catch (error) {
        console.error(
          `[Filing] ${request.filename} is listed but its catalogue row failed: ${
            error instanceof Error ? error.message : String(error)}`
        );
      }
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
          sentByFor(request.nodeId),
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

  // The CallersLog's record of where the file went: express.e:19430-19435
  // (HOLD, LCFILES) and moveFile's express.e:16221/16238 (the upload area),
  // `\tUpload moved to <path>`, the path as the Amiga names it. GLCUpdater
  // lists the file under the call's uploads from this line (GLCUpdater.e
  // 706-714) unless it went to LCFILES/, PARTUPLOAD/ or HOLD/. Written once,
  // for where the file finally landed: a listing that failed sends it on to
  // HOLD (step 5), and that is where it is.
  if (!orphaned && request.playpenPath) {
    const dataDir = config.get('dataDir');
    const landed = placedAt
      ?? path.join(destinationFor(area, request.conferenceId, dataDir) ?? '', request.filename);
    const { amigaPathOf } = require('./upload-examine.service');
    const { writeToCallersLog } = require('../utils/download-logging.util');
    await writeToCallersLog(`\tUpload moved to ${amigaPathOf(dataDir, landed) ?? landed}`, request.nodeId);
  }

  /*
   * express.e sysopULStats(hold) (18746-18790), called after the move for
   * every filed upload (19440, 19675). It was called by the web/telnet front
   * end only, so an FTP upload never counted: NumULs - what an auto-rejoin's
   * "N new file(s) uploaded" reads - and the sysop's counters missed it.
   */
  if (!orphaned) {
    const { updateSysopUploadStats } = await import('../utils/upload-notify.util');
    await updateSysopUploadStats(
      getConferenceDir(request.conferenceId, config.get('dataDir')),
      request.conferenceId,
      config.get('dataDir'),
      status !== 'active',
      request.uploader.slotNumber,
    );
  }

  return { status, marker, duplicate, orphaned, pool, notices };
}
