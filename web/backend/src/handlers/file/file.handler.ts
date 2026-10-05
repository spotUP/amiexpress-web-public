/**
 * File Operations Handler
 * Handles all file-related operations: listing, uploading, downloading, maintenance
 * 1:1 port from AmiExpress express.e file operations
 */

import { LoggedOnSubState } from '../../constants/bbs-states';
import { startPagination } from '../screen.handler';
import { AnsiUtil } from '../../utils/ansi.util';
import { finalizeCommand } from '../../utils/command-response.util';
import { config } from '../../config';
import { emitText, emitPrompt, emitLine, flushOutput, eraseRestOfLine } from '../../utils/output.util';
import * as path from 'path';
import { conferenceDir } from '../../conferences/conference-paths';
import { callersLogManager } from '../../services/CallersLogManager';

import type { BBSSession, UploadSessionContext } from '../../index';
import { formatLongDate } from '../../utils/date-time.util';
import { joinedConf } from '../../utils/joined-conf.util';
import { isNarrow } from '../../utils/table-format.util';
import { sessionColumns } from '../../utils/door-min-columns.util';
import { storeUploadContext } from '../../server/upload-session-store';
import { getStorageContext } from '../../storage/storage-context';
import { poolSpaceFor } from '../../storage/remote-upload';
import { storageFailureText } from '../../storage/remote-download';
import { StorageUnavailableError } from '../../storage/storage-backend';
import { getPlaypenDir } from '../../utils/bbs-paths.util';
import { cleanItUp } from '../../utils/clean-it-up.util';
import { freeDiskSpace, readFreeBytes } from '../../storage/free-space';
import { endUpload } from '../../services/upload-end.service';

// Dependencies (injected)
let fileAreas: any[] = [];
let db: any;
let callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
let getUserStats: (userId: string) => Promise<any>;
let _searchFilesByName: any;
let _searchFilesAdvanced: any;
let _getFileEntry: any;
let _deleteFileEntry: any;
let _moveFileEntry: any;
let _updateFileDescription: any;
let _getFileAreas: any;

// Dependency injection setters
export function setFileAreas(areas: any[]) {
  fileAreas = areas;
}

export function setDatabase(database: any) {
  db = database;
}

export function setCallersLog(fn: typeof callersLog) {
  callersLog = fn;
}

export function setGetUserStats(fn: typeof getUserStats) {
  getUserStats = fn;
}

/**
 * The search + CRUD functions the file-search and legacy maintenance screens
 * in THIS module call.
 *
 * Called `setFileMaintenanceDependencies` until the name collided, exactly,
 * with `file-maintenance.handler.ts`'s own setter (which injects db/config/
 * callersLog for the real `FM` command). Boot imported this one, called it,
 * and read the tick as "FM is wired" - so the FM module never got its
 * `config` and `_config.get('dataDir')` threw on the first line of every
 * `FM` on every board. One name, one thing: this setter injects the file
 * SEARCH dependencies and says so.
 */
export function setFileSearchDependencies(deps: {
  searchFilesByName: any;
  searchFilesAdvanced: any;
  getFileEntry: any;
  deleteFileEntry: any;
  moveFileEntry: any;
  updateFileDescription: any;
  getFileAreas: any;
}) {
  _searchFilesByName = deps.searchFilesByName;
  _searchFilesAdvanced = deps.searchFilesAdvanced;
  _getFileEntry = deps.getFileEntry;
  _deleteFileEntry = deps.deleteFileEntry;
  _moveFileEntry = deps.moveFileEntry;
  _updateFileDescription = deps.updateFileDescription;
  _getFileAreas = deps.getFileAreas;
}


// ===== File Status (FS command) =====

// ===== New Files (N command) =====

export async function displayNewFiles(socket: any, session: BBSSession, params: string) {
console.log('[displayNewFiles] Called with params:', params);

  try {
    // Parse parameters (like parseParams in AmiExpress)
    const parsedParams = parseParams(params);
console.log('[displayNewFiles] Parsed params:', parsedParams);

    // Check for non-stop flag (NS parameter) - express.e:27869,27900
    const nonStopDisplay = parsedParams.includes('NS');

    // express.e:27862-27866 - 'S' means "use Since date", NOT silent mode
    // Get date to search from
    let searchDate: Date;
    const firstParam = parsedParams.length > 0 ? parsedParams[0].toUpperCase() : '';

    if (firstParam === 'S') {
      // 'S' = use Since date (lastLogin) - express.e:27862-27863
      searchDate = session.user?.newSinceDate || session.user?.lastLogin || new Date(Date.now() - 86400000);
    } else if (firstParam.length === 8 && firstParam !== 'NS') {
      // Direct date provided in MM-DD-YY format
      const month = parseInt(firstParam.substring(0, 2)) - 1; // JS months are 0-based
      const day = parseInt(firstParam.substring(3, 5));
      const year = 2000 + parseInt(firstParam.substring(6, 8)); // Y2K compliant
      searchDate = new Date(year, month, day);
    } else {
      // Default to lastLogin - express.e:27855
      searchDate = session.user?.newSinceDate || session.user?.lastLogin || new Date(Date.now() - 86400000);
    }

console.log('[displayNewFiles] Search date:', searchDate);

    // express.e:27880-27881 - the scan's date goes in the CallersLog:
    //   StringF(c,'\tDirectory Scan for (\s)',str)
    // `str` is the eight characters the caller gave (express.e:27864), or
    // the newSinceDate the prompt offers (27856, 27873-27879). GLCUpdater
    // marks the call `F` from it (GLCUpdater.e:729).
    const scanDate = firstParam.length === 8
      ? parsedParams[0]
      : formatLongDate(searchDate);
    callersLogManager.logActivity(session.nodeId || 1, `\tDirectory Scan for (${scanDate})`);

    // express.e:27880-27906 goes from the CallersLog line straight into the
    // directory loop: no "newer than" heading.

    // THE DIR FILES ARE THE ANSWER, not the SQL mirror. This used to query
    // `file_entries`, which only a web upload ever writes - so a conference
    // whose DIR files are full reported no new files (measured live
    // 2026-09-07: conference 1, two areas, 0 rows, DIR files with records).
    // FileListingHandler owns the DIR walk, the row painter and the pause,
    // which is why the scan lives beside `F` rather than in a second copy
    // here. express.e:27906-28023.
    // express.e:27902 newSinceFlag:=1 - the logoff then moves the account's
    // newSinceDate to now (8197), and the conference records theirs (4911).
    session.newSinceFlag = true;
    const { FileListingHandler } = require('./file-listing.handler');
    await FileListingHandler.handleNewFileScan(socket, session, searchDate, nonStopDisplay);
  } catch (error) {
console.error('[displayNewFiles] ERROR:', error);
    emitText(socket, `\r\n\x1b[31mError displaying new files: ${(error as Error).message}\x1b[0m\r\n`);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}



// ===== Upload/Download Interfaces =====

export function displayUploadInterface(socket: any, session: BBSSession, params: string) {
  // WEB_: express does NOT clear here. uploadaFile (express.e:18944-19012)
  // goes straight to displayScreen(SCREEN_UPLOAD) and the "<protocol>
  // UPLOADING...." banner, over whatever the caller was looking at. The clear
  // is this board's own choice, asked for 2026-09-12 because the upload
  // interface arrived on top of a half-read file listing; it is a deviation,
  // and is marked as one so nobody restores "parity" by deleting it or ports
  // it onward as something express does.
  emitText(socket, AnsiUtil.clearScreen());

  // express.e:25646 internalCommandU -> uploadaFile()
  // express.e:18974 IF(maxDirs=0): the joined conference's NDIRS, which in a
  // scan (a reply's X) is the scanned conference while currentConf is 0.
  const uploadConf = joinedConf(session).conf;
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === uploadConf);

  if (currentFileAreas.length === 0) {
    // express.e:18975-18976 aePuts('\b\n'); myError(5) - ERR_NOFILES (8528-8530).
    emitText(socket, '\r\nNo files available in this conference.\r\n\r\n');
    endUpload(session, 'failure', () => { session.subState = LoggedOnSubState.DISPLAY_MENU; });
    return;
  }

  // Use first available upload area for this conference (express.e uses configured ULPATH)
  const uploadArea = currentFileAreas[0];

  // express.e:19003-19008 has two header variants:
  //   ramPen set → '<protocol> UPLOADING to <ramPen>..\b\n'
  //   else      → '<protocol> UPLOADING....\b\n'
  // Audit E-8 flagged that we always emit the second form. Web has no
  // ramPen tooltype concept, but the file area's ulPath is the closest
  // equivalent — when the area was configured with a non-default
  // destination, surface it in the header so sysops know files won't
  // land in the default playpen/Files directory.
  // express.e:18989 tFShi,tFSlo:=freeDiskSpace() runs BEFORE the header, and
  // its rFreeSpace() prints one line per DRIVE.n that names no volume here
  // (express.e:17460) - so a Drives.info still listing the original Amiga's
  // DH1: says so on the screen it would have on the Amiga, instead of being
  // quietly counted as room.
  const localDrives = freeDiskSpace(config.get('dataDir'));
  for (const target of localDrives?.unresolved ?? []) {
    emitText(socket, `\r\nCan not find free space for ${target}\r\n`);
  }

  // express.e:19012-19014: formatSpaceValue(tFShi,tFSlo) and formatSpaceValue(fSUploadingHi,fSUploadingLo)
  // tFShi/tFSlo = freeDiskSpace() — total free across configured drives
  // fSUploadingHi/fSUploadingLo = rFreeSpace(nodePlaypen) — space at the PLAYPEN
  //
  // On a board with no pool those are the same disk, which is why this was one
  // statfs. A POOLED area splits them exactly as express.e had them:
  //
  //   the first number  the pool total — freeDiskSpace() by its original
  //                     meaning, a real sum across drives again
  //   the second        the node playpen, express.e:18991, which is where rz
  //                     writes and where a full local disk truncates a transfer
  //
  // The playpen is measured at Node<N>/Playpen and NOT at the area's ULPATH:
  // rz never writes into the area directory, and on a pooled area that local
  // directory has no reason to exist at all — probing it would answer 0 and
  // refuse every upload, under a line saying the pool has terabytes.
  // A LOCAL area's first number is freeDiskSpace() over the board's local
  // DRIVE.n volumes - the statfs of each one that resolves on this host. A
  // board whose Drives.info declares no local drive has nothing to sum, and
  // shows the playpen's filesystem, which is where the bytes land.
  const dataDir = config.get('dataDir');
  const playpenFreeBytes = readFreeBytes(getPlaypenDir(session.nodeId || 0, dataDir), dataDir);
  const pool = poolSpaceFor(uploadArea, getStorageContext());
  const spaceStr = formatSpaceBytes(pool ? pool.total : localDrives ? localDrives.bytes : playpenFreeBytes);
  const atOnceStr = formatSpaceBytes(playpenFreeBytes);

  // express.e:18989-19001 — refuse to start if there isn't room for the
  // express.e minimum-playpen budget (2 MB). Without this check the upload
  // "succeeds" up to the first ENOSPC write and rz silently aborts with a
  // partial file in playpen — same UX as the disk-full incident 2026-05-20.
  // express.e has a RAMWORK tooltype to override the floor with a ramdisk
  // path; web has no such concept (single filesystem), so we keep the
  // floor unconditional.
  // myError (express.e:8551-8553): '\b\n', the text, '\b\n\b\n'; then the
  // main loop's own pause.
  const refuse = (message: string): void => {
    emitText(socket, `\r\n${message}\r\n\r\n`);
    session.tempData = undefined;
    endUpload(session, 'success', () => {
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    });
  };

  // A drive the board believes is DOWN, or one that has spent its monthly
  // request budget, has no room by roomOn's reckoning, and "not enough free
  // space" would send the caller off to delete files that were never the
  // problem. Both are outages; say so, in the subsystem's own one sentence,
  // and name the drive for the sysop reading the screenshot.
  if (pool?.degraded || pool?.outOfRequests) {
    const reason = pool.degraded ? 'volume is degraded' : 'volume is out of requests';
    refuse(storageFailureText(new StorageUnavailableError(pool.driveNumber, reason)));
    return;
  }

  // The floor is the SMALLER of the playpen and the area's OWN drive.
  // express.e:18993 gates on rFreeSpace(playpen) and that still binds — rz
  // truncates against a full local disk, pool or no pool. The pool adds a
  // second way to run out, and it has to be refused here rather than at the
  // byte where the volume filled. It is the area's drive and not the pool SUM
  // because the object can only go to the drive this area's STORAGEDRIVE
  // names: a full drive beside a healthy sibling bucket would pass a sum-based
  // gate and fail at the put, after the whole file had been sent. A bucket
  // with no declared QUOTA answers Infinity — real room, unmeasured — so the
  // comparison falls through to the playpen figure.
  const MIN_PLAYPEN_BYTES = 2 * 1024 * 1024;
  const freeBytes = Math.min(playpenFreeBytes, pool ? pool.driveFree : Number.POSITIVE_INFINITY);
  if (freeBytes < MIN_PLAYPEN_BYTES) {
    // express.e:18993-18996 myError(9), ERR_FREESPACE (8537-8538) - before
    // the UPLOADING header (19003), which a refused upload never shows.
    refuse('Not enough free space on Device for uploading.');
    return;
  }

  const protocolTitle = (session.user as any)?.protocol || '/X Zmodem';
  const customUlPath = uploadArea.ulPath && uploadArea.ulPath !== process.cwd();
  if (customUlPath) {
    emitText(socket, `\r\n${protocolTitle} UPLOADING to ${uploadArea.ulPath}..${eraseRestOfLine(socket)}\r\n`);
  } else {
    emitText(socket, `\r\n${protocolTitle} UPLOADING....${eraseRestOfLine(socket)}\r\n`);
  }

  emitText(socket, `${spaceStr} available for uploading.  ${atOnceStr} at one time.${eraseRestOfLine(socket)}\r\n`);
  // express.e:19016
  emitText(socket, `Filename lengths above 12 are not allowed.${eraseRestOfLine(socket)}\r\n${eraseRestOfLine(socket)}\r\n`);

  /*
   * express.e:17656 - cleanItUp(), the node WORK DIRECTORY sweep.
   *
   * This line used to read "nothing needed for web", and that was wrong. The
   * playpen is where a transfer writes before the file is accepted, so every
   * upload that died part way left its bytes there for ever - on the live
   * board, `Node2/Playpen` still held seven files from August.
   *
   * Resume partials are NOT in here (they live in the conference's PARTUPLOAD
   * directory, services/resume-stuff.service.ts), so this does not cost a
   * caller an interrupted transfer.
   */
  const swept = cleanItUp(getPlaypenDir(session.nodeId || 0, config.get('dataDir')));
  if (swept.deleted.length > 0) {
    console.log(`[upload] cleanItUp: cleared ${swept.deleted.length} stale file(s) from the playpen`);
  }
  if (swept.stoppedAt) {
    console.log(`[upload] cleanItUp: stopped at ${JSON.stringify(swept.stoppedAt)} - express.e:17845 refuses to sweep past a name it does not recognise`);
  }
  // express.e:17657
  emitText(socket, `Batch UpLoading.....${eraseRestOfLine(socket)}\r\n`);
  // express.e:17658
  emitText(socket, `\r\nUnlimited files.  Blank Line to start transfer.${eraseRestOfLine(socket)}\r\n`);
  // express.e:17664: StringF(str,'\b\nFileName \d: ',count)
  emitText(socket, `\r\nFileName 1: ${eraseRestOfLine(socket)}`);

  session.subState = LoggedOnSubState.UPLOAD_FILENAME_INPUT;
  session.tempData = {
    uploadMode: true,
    fileArea: uploadArea,
    uploadBatch: [],
    uploadCount: 1,
    uploadStartTime: Date.now(),
  };
}

/**
 * 1:1 port of MiscFuncs.e:234-249 formatSpaceValue — formats free bytes
 * as a human-readable "X.X MB" / "X.X GB" / "X.X TB" string.
 *
 * Takes BYTES rather than a path: the number can now come from the pool as
 * well as from statfs, and a formatter that probes its own argument could only
 * ever render one of the two.
 *
 * A bucket with no declared QUOTA has real but unmeasured room, and
 * `VolumeSet.freeBytes()` says so with Infinity. Every arm below shifts and
 * masks, so Infinity would print "Infinity.NaN MB"; a sysop is told
 * "unlimited" instead.
 */
function formatSpaceBytes(freeBytes: number): string {
  if (!Number.isFinite(freeBytes)) return 'unlimited';

  // MiscFuncs.e:234-249 formatSpaceValue(spaceInMB, spacelo, outstr)
  // spaceInMB = freeBytes >> 20   (megabytes)
  // spacelo   = freeBytes & 0xFFFFF  (remainder bytes within current MB)
  const spaceInMB = Math.floor(freeBytes / (1 << 20));
  const spacelo   = freeBytes & 0xFFFFF;

  if (spaceInMB < 10240) {
    // MiscFuncs.e: frac:=Shr(Mul((spacelo AND $FFFFF),10),20)  → "\d.\d MB"
    const frac = (spacelo * 10) >>> 20;
    return `${spaceInMB}.${frac} MB`;
  } else if (spaceInMB < 1048576) {
    // MiscFuncs.e: frac:=Shr(Mul((spaceInMB AND 1023),10),10); whole:=Shr(spaceInMB,10) → "\d.\d GB"
    const whole = spaceInMB >>> 10;
    const frac  = ((spaceInMB & 1023) * 10) >>> 10;
    return `${whole}.${frac} GB`;
  } else {
    // MiscFuncs.e: spaceInMB:=Shr(spaceInMB,10); whole:=Shr(spaceInMB,10) → "\d.\d TB"
    const shifted = spaceInMB >>> 10;
    const whole   = shifted >>> 10;
    const frac    = ((shifted & 1023) * 10) >>> 10;
    return `${whole}.${frac} TB`;
  }
}

// ===== Utility Functions =====

export function matchesWildcard(filename: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')  // * matches any characters
    .replace(/\?/g, '.')   // ? matches single character
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\$/g, '\\$') // Escape dollar signs
    .replace(/\^/g, '\\^'); // Escape carets

  const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case insensitive
  return regex.test(filename);
}

export function parseParams(paramString: string): string[] {
  if (!paramString.trim()) return [];

  return paramString.split(' ')
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0);
}

export function dirLineNewFile(dirLine: string, searchDate: Date): boolean {
  // Parse DIR line format: "filename sizeK date uploader"
  const parts = dirLine.trim().split(/\s+/);
  if (parts.length < 4) return false;

  const dateStr = parts[2]; // Date is typically in MM-DD-YY format
  if (dateStr.length !== 8) return false;

  try {
    const month = parseInt(dateStr.substring(0, 2)) - 1;
    const day = parseInt(dateStr.substring(3, 5));
    const year = 2000 + parseInt(dateStr.substring(6, 8));
    const fileDate = new Date(year, month, day);

    return fileDate > searchDate;
  } catch {
    return false;
  }
}

// ===== File Upload/Download WebSocket Handlers =====

// startFileUpload (Audit E-11) removed 2026-05-20: 4 imports, 0
// invocations. Dead after the Phase 4 ZMODEM unification — the U
// command now routes through startBatchUploadTransfer →
// startZmodemUpload (command.handler.ts), and door archive uploads
// emit show-file-upload via BBSApi/DoorManager directly. The legacy
// HTTP-picker path this function emitted into was killed when
// processFileUpload was narrowed to door uploads only
// (file-socket-handlers.ts:862-899). Re-introducing this function
// would re-introduce the silent-drop bug we just fixed in cf2121c86.

