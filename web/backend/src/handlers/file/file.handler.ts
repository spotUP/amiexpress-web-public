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


/**
 * One file-search result as display lines (C64/40-col Task 5a).
 *
 * 80 columns: the historical single-line row, byte-identical.
 * Narrow: the C64 two-line convention from table-format.util - the name
 * and size on one row, the description stacked underneath, so nothing is
 * clipped and no row reaches the prose wrap long enough to be folded.
 */
export function buildFileSearchLines(
  session: { screenWidth?: number; petsciiMode?: boolean },
  file: any
): string[] {
  const sizeKB = Math.ceil(file.size / 1024);
  const description = file.fileid_diz || file.description;

  if (!isNarrow(session)) {
    const dateStr = formatLongDate(new Date(file.uploaddate));
    return [
      `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}`,
      `  ${description}`,
      `  Area: ${file.areaname}`,
    ];
  }

  // A SEARCH HIT IS A SINGLE RECORD, so it gets the record block - the same
  // template `FI <n>` renders, from Prompts/FILEVIEW.40. It replaces
  // `narrowFileLines`, the stacked two-line formatter this port invented
  // before there was a layout: one shape for every 40-column record, and the
  // sysop can re-columnise all of them by editing one file.
  const { renderFileBlock } = require('@amiexpress/bbs-door-sdk/petscii/frame');
  const { getFileViewLayout } = require('../../services/file-layout.service');
  const layout = getFileViewLayout(config.get('dataDir'));

  // THE PENS COME OFF HERE. These rows are emitted with `emitText`, which runs
  // no MCI pass, so a `~c7|` in them would reach the caller as literal text -
  // and `forty-col-sweep` would count it as four printable columns, which is
  // how this was caught. The TEMPLATE still decides the layout; only its
  // colour codes are dropped, which leaves a search hit exactly as colourless
  // as `narrowFileLines` left it.
  const stripMci = (row: string): string => row.replace(/~[^|]*\|/g, '');

  return [
    ...renderFileBlock(
      {
        name: file.filename,
        sizeBytes: file.size,
        date: formatLongDate(new Date(file.uploaddate)),
        desc: description,
        author: file.uploader,
      },
      layout.record,
      sessionColumns(session),
    ).map(stripMci),
    ` Area: ${String(file.areaname).substring(0, 33)}`,
  ];
}

// handleFileSearch() - Search files by pattern (FM S command)
export async function handleFileSearch(socket: any, session: BBSSession, params: string[]) {
  if (params.length === 0) {
    emitText(socket, 'Search files functionality.\r\n');
    emitText(socket, 'Usage: FM S <search_pattern> [area]\r\n');
    emitText(socket, 'Search pattern can be filename, description, or uploader.\r\n');
    emitText(socket, 'Area parameter is optional (defaults to current conference).\r\n\r\n');
    emitText(socket, '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const searchPattern = params[0];
  const areaParam = params.length > 1 ? params[1] : null;

  // Validate area parameter if provided
  let areaId: number | undefined = undefined;
  if (areaParam) {
    const parsedAreaId = parseInt(areaParam);
    if (isNaN(parsedAreaId)) {
      emitText(socket, '\r\n\x1b[31mInvalid area number.\x1b[0m\r\n');
      emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Verify area exists
    const allAreas = await _getFileAreas(session.currentConf || 1);
    const areaExists = allAreas.find((a: any) => a.id === parsedAreaId);
    if (!areaExists) {
      emitText(socket, '\r\n\x1b[31mFile area not found.\x1b[0m\r\n');
      emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    areaId = parsedAreaId;
  }

  // Search files using database (searches filename, description, and uploader)
  const matchingFiles = await _searchFilesAdvanced(searchPattern, session.currentConf || 1, areaId);

  // Display results
  emitText(socket, `\r\nSearch results for "${searchPattern}":\r\n\r\n`);

  if (matchingFiles.length === 0) {
    emitText(socket, 'No files found matching the search pattern.\r\n');
  } else {
    emitText(socket, `Found ${matchingFiles.length} file(s):\r\n\r\n`);

    matchingFiles.forEach((file: any) => {
      for (const line of buildFileSearchLines(session, file)) {
        emitText(socket, `${line}\r\n`);
      }
      emitText(socket, '\r\n');
    });
  }

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// ===== File Status (FS command) =====

export async function displayFileStatus(socket: any, session: BBSSession, params: string) {
  // express.e:24141-24161 fileStatus() - no header, just column headers
  emitText(socket, '\r\n');

  // Parse parameters to determine scope (like fileStatus(opt) in AmiExpress)
  const parsedParams = parseParams(params);
  const showAllConferences = parsedParams.length === 0 || parsedParams.includes('ALL');

  // Get user stats from database for bytes available and ratio calculation
  const userStats = await getUserStats(session.user!.id);
  const userRatio = session.user!.ratio || 1;

  // Calculate bytes available: (bytes_uploaded * ratio) - bytes_downloaded
  const bytesAvail = Math.max(0, (userStats.bytes_uploaded * userRatio) - userStats.bytes_downloaded);
  const ratioDisplay = userRatio > 0 ? `${userRatio}:1` : 'DSBLD';

  emitText(socket, '\x1b[32m              Uploads                 Downloads\x1b[0m\r\n\r\n');
  // express.e:24156-24160 — header switches on TOGGLES_CREDITBYKB.
  // Active FS command routes through file-status.handler.ts; this duplicate
  // is currently dead but kept consistent in case it gets re-wired.
  const { getACSConfig: _getACSConfig, ToggleFlags: _ToggleFlags } = require('../../utils/acs.util');
  const _creditByKB = !!(_getACSConfig().toggles as any)?.[_ToggleFlags.CREDITBYKB];
  if (_creditByKB) {
    emitText(socket, '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio\x1b[0m\r\n\r\n');
  } else {
    emitText(socket, '\x1b[32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\x1b[0m\r\n\r\n');
  }
  emitText(socket, '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\x1b[0m\r\n');

  // Note: This would normally reference a conferences array from parent scope
  // For now we'll need to inject it
  emitText(socket, '\r\n\x1b[32mYour File Statistics:\x1b[0m\r\n');
  emitText(socket, `Files Uploaded: ${userStats.files_uploaded || 0}\r\n`);
  emitText(socket, `Bytes Uploaded: ${userStats.bytes_uploaded || 0}\r\n`);
  emitText(socket, `Files Downloaded: ${userStats.files_downloaded || 0}\r\n`);
  emitText(socket, `Bytes Downloaded: ${userStats.bytes_downloaded || 0}\r\n`);
  emitText(socket, `Bytes Available: ${bytesAvail}\r\n`);

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

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

    // Always show header during confScan (express.e doesn't suppress this)
    emitText(socket, '\r\n');
    emitText(socket, `Searching for files newer than: ${formatLongDate(searchDate)}\r\n\r\n`);

    // THE DIR FILES ARE THE ANSWER, not the SQL mirror. This used to query
    // `file_entries`, which only a web upload ever writes - so a conference
    // whose DIR files are full reported no new files (measured live
    // 2026-09-07: conference 1, two areas, 0 rows, DIR files with records).
    // FileListingHandler owns the DIR walk, the row painter and the pause,
    // which is why the scan lives beside `F` rather than in a second copy
    // here. express.e:27906-28023.
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
  // Check NDIRS (file areas exist in this conference)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);

  if (currentFileAreas.length === 0) {
    emitText(socket, '\r\nNo file directories available.\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
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

  const protocolTitle = (session.user as any)?.protocol || '/X Zmodem';
  const customUlPath = uploadArea.ulPath && uploadArea.ulPath !== process.cwd();
  if (customUlPath) {
    emitText(socket, `\r\n${protocolTitle} UPLOADING to ${uploadArea.ulPath}..${eraseRestOfLine(socket)}\r\n`);
  } else {
    emitText(socket, `\r\n${protocolTitle} UPLOADING....${eraseRestOfLine(socket)}\r\n`);
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
  emitText(socket, `${spaceStr} available for uploading.  ${atOnceStr} at one time.${eraseRestOfLine(socket)}\r\n`);

  // express.e:18989-19001 — refuse to start if there isn't room for the
  // express.e minimum-playpen budget (2 MB). Without this check the upload
  // "succeeds" up to the first ENOSPC write and rz silently aborts with a
  // partial file in playpen — same UX as the disk-full incident 2026-05-20.
  // express.e has a RAMWORK tooltype to override the floor with a ramdisk
  // path; web has no such concept (single filesystem), so we keep the
  // floor unconditional.
  const refuse = (message: string): void => {
    emitText(socket, `\r\n\x1b[31m${message}\x1b[0m\r\n`);
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
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
    // express.e:18996 — 'Not enough free space for uploading!\b\n'
    refuse('Not enough free space for uploading!');
    return;
  }

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

export function displayDownloadInterface(socket: any, session: BBSSession, params: string) {
  // express.e:19960 aePuts('\b\n') — first output in downloadAFile
  emitText(socket, '\r\n');

  // express.e:19961-19964 IF(maxDirs=0) myError(ERR_NOFILES)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  if (currentFileAreas.length === 0) {
    // express.e:8528-8530 myError(ERR_NOFILES=5): 'No files available in this conference.\b\n\b\n'
    emitText(socket, 'No files available in this conference.\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const user = session.user!;

  // express.e:19981 displayULStats(loggedOnUser,loggedOnUserMisc) — 12680-12715
  const dlKB = Math.floor((user.bytesDownload || 0) / 1024);
  const ulKB = Math.floor((user.bytesUpload   || 0) / 1024);
  // express.e:12691 u.downloads AND $FFFF
  const dlCount = (user.downloads || 0) & 0xFFFF;
  const ulCount = (user.uploads   || 0) & 0xFFFF;
  emitText(socket, `Number of Downloads      : ${dlCount} (${dlKB}k total)\r\n`);
  emitText(socket, `Number of Uploads        : ${ulCount} (${ulKB}k total)\r\n`);
  // express.e:12701-12713 — bytesADL=$7fffffff means Infinite, else show value
  {
    const { getACSConfig, ToggleFlags } = require('../../utils/acs.util');
    const creditByKB = !!(getACSConfig().toggles as any)?.[ToggleFlags.CREDITBYKB];
    const bytesADL = user.bytesAvailableForDownload ?? 0x7fffffff;
    if (creditByKB) {
      // express.e:12703 'Todays KBytes Available  : Infinite\b\n' or '\d\b\n'
      emitText(socket, bytesADL === 0x7fffffff
        ? 'Todays KBytes Available  : Infinite\r\n'
        : `Todays KBytes Available  : ${bytesADL}\r\n`);
    } else {
      // express.e:12709 'Todays Bytes Available   : Infinite\b\n' or '\d\b\n'
      emitText(socket, bytesADL === 0x7fffffff
        ? 'Todays Bytes Available   : Infinite\r\n'
        : `Todays Bytes Available   : ${bytesADL}\r\n`);
    }
  }

  // express.e:19983-20028 ratio check
  if (!user.secLibrary) {
    // express.e:20027 'Download to Upload Ratio : Disabled.\b\n'
    emitText(socket, 'Download to Upload Ratio : Disabled.\r\n');
  } else {
    const secBoard = (user as any).secBoard || 0;
    // express.e:19984 IF(secBoard>0) → 'Files Avail before UL : \d\b\n'
    if (secBoard > 0) {
      const cnt = user.secLibrary * ((user.uploads || 0) + 1) - (user.downloads || 0);
      emitText(socket, `Files Avail before UL : ${cnt}\r\n`);
      if (cnt < 1) {
        // express.e:12677 exceedRatio()
        emitText(socket, 'You have exceeded your ratio, you must upload first.\r\n\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }
    }
    // express.e:19993 IF(secBoard<2) → bytes ratio
    if (secBoard < 2) {
      const { getACSConfig, ToggleFlags } = require('../../utils/acs.util');
      const creditByKB = !!(getACSConfig().toggles as any)?.[ToggleFlags.CREDITBYKB];
      const ulBytes = user.bytesUpload   || 0;
      const dlBytes = user.bytesDownload || 0;
      const avail   = Math.max(0, user.secLibrary * ulBytes - dlBytes);
      if (creditByKB) {
        // express.e:20015 'KBytes Avail before UL : \s\b\n'
        emitText(socket, `KBytes Avail before UL : ${Math.floor(avail / 1024)}\r\n`);
      } else {
        // express.e:20017 'Bytes Avail before UL : \s\b\n'
        emitText(socket, `Bytes Avail before UL : ${avail}\r\n`);
      }
      if (user.secLibrary * ulBytes - dlBytes < 1) {
        // express.e:12677 exceedRatio()
        emitText(socket, 'You have exceeded your ratio, you must upload first.\r\n\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }
    }
  }

  // express.e:20030-20035 'Space between filenames.  ' + [No ]'Wildcards permitted.\b\n'
  // No blank line before this — express.e has no \b\n between ratio and wildcards
  emitText(socket, 'Space between filenames.  ');
  const { checkSecurity } = require('../../utils/acs.util');
  const { ACSPermission } = require('../../constants/acs-permissions');
  if (checkSecurity(user, ACSPermission.FILE_EXPANSION)) {
    emitText(socket, 'Wildcards permitted.\r\n');
  } else {
    // express.e: aePuts('No ') + aePuts('Wildcards permitted.\b\n')
    emitText(socket, 'No Wildcards permitted.\r\n');
  }

  // express.e:20118 '\b\n\d mins, (Ratio Disabled), Filespec(\d): ' (secLibrary=0)
  // or downloadPrompt() '\b\n\d mins, \d bytes, Filespec(\d): ' (secLibrary>0)
  const minsLeft = (session as any).timeRemaining || 60;
  if (!user.secLibrary) {
    emitText(socket, `\r\n${minsLeft} mins, (Ratio Disabled), Filespec(1): `);
  } else {
    emitText(socket, `\r\n${minsLeft} mins, Infinite bytes, Filespec(1): `);
  }

  session.subState = LoggedOnSubState.FILES_DOWNLOAD_SELECT;
  session.tempData = { downloadMode: true, fileAreas: currentFileAreas, fileSpec: 1 };
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

export function startFileDownload(socket: any, session: BBSSession, fileArea: any) {
console.log('startFileDownload called for area:', fileArea.name);

  // express.e:24853-24857 internalCommandD -> beginDLF -> downloadAFile
  // The download process uses displayULStats() for the header info
  emitText(socket, `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n`);

  // express.e:12680-12710 displayULStats format - no decorative header
  const user = session.user!;
  const dlKB = Math.floor((user.bytesDownload || 0) / 1024);
  const ulKB = Math.floor((user.bytesUpload || 0) / 1024);
  emitText(socket, `Number of Downloads      : ${user.downloads || 0} (${dlKB}k total)\r\n`);
  emitText(socket, `Number of Uploads        : ${user.uploads || 0} (${ulKB}k total)\r\n`);
  emitText(socket, 'Todays Bytes Available   : Infinite\r\n');

  // Check if user has download access to this area
  if (fileArea.downloadAccess > (session.user?.secLevel || 0)) {
    emitText(socket, '\r\n\x1b[31mYou do not have download access to this file area.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Display download message (like DOWNLOADMSG.TXT)
  emitText(socket, '\r\n\x1b[32mDownload Message:\x1b[0m\r\n');
  emitText(socket, 'Please select files to download. Files will be transferred using WebSocket protocol.\r\n\r\n');

  // Display files in the area for selection.
  // DEPRECATED: see note on areaFiles in displayFileAreaContents above.
  const areaFiles: any[] = [];
  void fileArea;
  if (areaFiles.length === 0) {
    emitText(socket, 'No files available in this area.\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  emitText(socket, '\x1b[32mAvailable Files:\x1b[0m\r\n\r\n');
  areaFiles.forEach((file, index) => {
    const sizeKB = Math.ceil(file.size / 1024);
    const dateStr = formatLongDate(file.uploadDate);
    const description = file.fileIdDiz || file.description;
    emitText(socket, `${index + 1}. ${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
    emitText(socket, `   ${description}\r\n\r\n`);
  });

  // Prompt for file selection - express.e:20031 "Space between filenames"
  // Support multiple selections: space-separated numbers, ranges (1-3), or filenames
  emitText(socket, '\x1b[33mEnter file #s (e.g. 1 3 5), range (1-5), or filename(s):\x1b[0m\r\n');
  emitText(socket, '\x1b[32mSelect files to download: \x1b[0m');
  session.subState = LoggedOnSubState.FILES_DOWNLOAD_SELECT;
  session.tempData = { downloadMode: true, fileArea, areaFiles, batchDownload: true };
}

