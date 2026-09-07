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
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import * as path from 'path';
import { conferenceDir } from '../../conferences/conference-paths';
import { fileAreaManager } from '../../services/FileAreaManager';
import { callersLogManager } from '../../services/CallersLogManager';

import type { BBSSession, UploadSessionContext } from '../../index';
import { formatLongDate } from '../../utils/date-time.util';
import { isNarrow, narrowFileLines } from '../../utils/table-format.util';
import { storeUploadContext } from '../../server/upload-session-store';
import { getStorageContext } from '../../storage/storage-context';
import { poolSpaceFor } from '../../storage/remote-upload';
import { storageFailureText } from '../../storage/remote-download';
import { StorageUnavailableError } from '../../storage/storage-backend';
import { getPlaypenDir } from '../../utils/bbs-paths.util';

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


// ===== File Maintenance (FM command) =====

// displayFileMaintenance() - File maintenance/search (FM command)
export async function displayFileMaintenance(socket: any, session: BBSSession, params: string) {
  // express.e:24889-24907 internalCommandFM - no header, just processes params
  emitText(socket, '\r\n');

  // Parse parameters (like AmiExpress FM command)
  const parsedParams = parseParams(params);
  const operation = parsedParams.length > 0 ? parsedParams[0].toUpperCase() : '';

  if (operation === 'D') {
    // Delete files
    await handleFileDelete(socket, session, parsedParams.slice(1));
    return;
  } else if (operation === 'M') {
    // Move files
    await handleFileMove(socket, session, parsedParams.slice(1));
    return;
  } else if (operation === 'S') {
    // Search files
    await handleFileSearch(socket, session, parsedParams.slice(1));
    return;
  } else {
    // Show menu
    emitText(socket, 'Available operations:\r\n');
    emitText(socket, 'FM D <filename> - Delete files\r\n');
    emitText(socket, 'FM M <filename> <area> - Move files\r\n');
    emitText(socket, 'FM S <pattern> - Search files\r\n');
    emitText(socket, '\r\nUse FM <operation> <parameters>\r\n');
  }

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

// handleFileDelete() - Delete files (FM D command)
export async function handleFileDelete(socket: any, session: BBSSession, params: string[]) {
  if (params.length === 0) {
    emitText(socket, 'Delete files functionality.\r\n');
    emitText(socket, 'Usage: FM D <filename> [area]\r\n');
    emitText(socket, 'Wildcards (* and ?) are supported.\r\n');
    emitText(socket, 'Area parameter is optional (defaults to current conference).\r\n\r\n');
    emitText(socket, '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const filename = params[0];

  // Search files using database (with wildcard support)
  const matchingFiles = await _searchFilesByName(filename, session.currentConf || 1);

  if (matchingFiles.length === 0) {
    emitText(socket, `\r\nNo files matching "${filename}" found.\r\n`);
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check permissions (sysop or file owner)
  const userLevel = session.user?.secLevel || 0;
  const allowedFiles = matchingFiles.filter((file: any) =>
    userLevel >= 200 || file.uploader.toLowerCase() === session.user?.username.toLowerCase()
  );

  if (allowedFiles.length === 0) {
    emitText(socket, '\r\n\x1b[31mYou do not have permission to delete these files.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display files to be deleted
  emitText(socket, `\r\nFiles matching "${filename}":\r\n\r\n`);
  allowedFiles.forEach((file: any, index: number) => {
    emitText(socket, `${index + 1}. ${file.filename} (${file.areaname})\r\n`);
  });

  emitText(socket, '\r\n\x1b[31mWARNING: This action cannot be undone!\x1b[0m\r\n');
  emitText(socket, '\x1b[32mEnter file numbers to delete (comma-separated) or "ALL" for all: \x1b[0m');

  // Store context for confirmation
  session.tempData = {
    operation: 'delete_files',
    allowedFiles,
    filename
  };
  session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for input
}

export async function handleFileDeleteConfirmation(socket: any, session: BBSSession, input: string) {
  const tempData = session.tempData as { operation: string, allowedFiles: any[], filename: string };

  if (!tempData || tempData.operation !== 'delete_files') {
    emitText(socket, '\r\n\x1b[31mInvalid operation state.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Parse selection
  const selection = input.trim().toUpperCase();
  let filesToDelete: any[] = [];

  if (selection === 'ALL') {
    filesToDelete = tempData.allowedFiles;
  } else {
    const indices = selection.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    filesToDelete = indices.map(i => tempData.allowedFiles[i - 1]).filter(f => f);
  }

  if (filesToDelete.length === 0) {
    emitText(socket, '\r\n\x1b[33mNo files selected for deletion.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Delete files from database
  const deletePromises = filesToDelete.map((file: any) =>
    _deleteFileEntry(file.id).catch((err: any) => console.error('Error deleting file:', err))
  );

  await Promise.all(deletePromises);

  // DISK-BASED: Delete files from DIR files
  for (const file of filesToDelete) {
    try {
      const bbsRoot = config.get('dataDir');
      const confDir = conferenceDir(bbsRoot, session.currentConf || 1);
      const areaId = file.areaId || file.area_id || 1;
      const dirFilePath = path.join(confDir, `DIR${areaId}`);

      // Load file area to pass to deleteFileEntry
      const fileArea = {
        id: areaId,
        conferenceId: session.currentConf || 1,
        dirFilePath: dirFilePath
      };

      fileAreaManager.deleteFileEntry(file.filename, fileArea as any);
console.log(`[FileDelete] Removed ${file.filename} from DIR${areaId}`);
    } catch (error) {
console.error(`[FileDelete] Error removing ${file.filename} from DIR file:`, error);
    }
  }

  emitText(socket, `\r\n\x1b[32mDeleted ${filesToDelete.length} file(s) successfully.\x1b[0m\r\n`);

  // Log deletion — SQL (web activity widget) + disk (express.e parity).
  // callersLog and callersLogManager are independent loggers; the audit
  // (thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md)
  // flagged this as SQL-only — the BBS:Node{X}/CallersLog file never
  // saw deletions, breaking express.e parity for sysop tail-watch.
  filesToDelete.forEach((file: any) => {
    const detail = `${file.filename} (${file.areaname || ''})`;
    callersLog(session.user!.id, session.user!.username, 'Deleted file', detail);
    callersLogManager.logActivity(session.nodeId || 1, `\tDeleted file: ${detail}`);
  });

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
}

// handleFileMove() - Move files between areas (FM M command)
export async function handleFileMove(socket: any, session: BBSSession, params: string[]) {
  if (params.length < 2) {
    emitText(socket, 'Move files functionality.\r\n');
    emitText(socket, 'Usage: FM M <filename> <destination_area>\r\n');
    emitText(socket, 'Wildcards (* and ?) are supported for filename.\r\n\r\n');
    emitText(socket, '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const filename = params[0].toUpperCase();
  const destAreaId = parseInt(params[1]);

  if (isNaN(destAreaId)) {
    emitText(socket, '\r\n\x1b[31mInvalid destination area number.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Get all file areas in current conference from database
  const allAreas = await _getFileAreas(session.currentConf || 1);

  // Check destination area exists
  const destArea = allAreas.find((a: any) => a.id === destAreaId);
  if (!destArea) {
    emitText(socket, '\r\n\x1b[31mDestination file area not found.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Search files using database (with wildcard support)
  const matchingFiles = await _searchFilesByName(filename, session.currentConf || 1);

  if (matchingFiles.length === 0) {
    emitText(socket, `\r\nNo files matching "${filename}" found in current conference.\r\n`);
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check permissions (sysop or file owner)
  const userLevel = session.user?.secLevel || 0;
  const allowedFiles = matchingFiles.filter((file: any) =>
    userLevel >= 200 || file.uploader.toLowerCase() === session.user?.username.toLowerCase()
  );

  if (allowedFiles.length === 0) {
    emitText(socket, '\r\n\x1b[31mYou do not have permission to move these files.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display files to be moved
  emitText(socket, `\r\nFiles matching "${filename}" to move to ${destArea.name}:\r\n\r\n`);
  allowedFiles.forEach((file: any, index: number) => {
    emitText(socket, `${index + 1}. ${file.filename} (${file.areaname} -> ${destArea.name})\r\n`);
  });

  emitText(socket, '\r\n\x1b[32mEnter file numbers to move (comma-separated) or "ALL" for all: \x1b[0m');

  // Store context for confirmation
  session.tempData = {
    operation: 'move_files',
    allowedFiles,
    destArea,
    filename
  };
  session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for input
}

export async function handleFileMoveConfirmation(socket: any, session: BBSSession, input: string) {
  const tempData = session.tempData as { operation: string, allowedFiles: any[], destArea: any, filename: string };

  if (!tempData || tempData.operation !== 'move_files') {
    emitText(socket, '\r\n\x1b[31mInvalid operation state.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Parse selection
  const selection = input.trim().toUpperCase();
  let filesToMove: any[] = [];

  if (selection === 'ALL') {
    filesToMove = tempData.allowedFiles;
  } else {
    const indices = selection.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    filesToMove = indices.map(i => tempData.allowedFiles[i - 1]).filter(f => f);
  }

  if (filesToMove.length === 0) {
    emitText(socket, '\r\n\x1b[33mNo files selected for move.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Move files in database
  const movePromises = filesToMove.map((file: any) =>
    _moveFileEntry(file.id, tempData.destArea.id).catch((err: any) => console.error('Error moving file:', err))
  );

  await Promise.all(movePromises);

  emitText(socket, `\r\n\x1b[32mMoved ${filesToMove.length} file(s) to ${tempData.destArea.name} successfully.\x1b[0m\r\n`);

  // Log move — SQL (web activity widget) + disk (express.e parity).
  // Same SQL-only gap as the delete branch above (audit
  // 2026-05-18_sqlite-disk-parity-audit.md).
  filesToMove.forEach((file: any) => {
    const detail = `${file.filename} -> ${tempData.destArea.name}`;
    callersLog(session.user!.id, session.user!.username, 'Moved file', detail);
    callersLogManager.logActivity(session.nodeId || 1, `\tMoved file: ${detail}`);
  });

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
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

  return [
    ...narrowFileLines({ filename: file.filename, sizeKB, description }),
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
  const protocolTitle = (session.user as any)?.protocol || '/X Zmodem';
  const customUlPath = uploadArea.ulPath && uploadArea.ulPath !== process.cwd();
  if (customUlPath) {
    emitText(socket, `\r\n${protocolTitle} UPLOADING to ${uploadArea.ulPath}..\r\n`);
  } else {
    emitText(socket, `\r\n${protocolTitle} UPLOADING....\r\n`);
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
  // poolSpaceFor returns null for every local area and every board without a
  // bucket, which keeps that case byte-for-byte as it was.
  const playpenFreeBytes = readFreeBytes(getPlaypenDir(session.nodeId || 0, config.get('dataDir')));
  const pool = poolSpaceFor(uploadArea, getStorageContext());
  const spaceStr = formatSpaceBytes(pool ? pool.total : playpenFreeBytes);
  const atOnceStr = formatSpaceBytes(playpenFreeBytes);
  emitText(socket, `${spaceStr} available for uploading.  ${atOnceStr} at one time.\r\n`);

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
  emitText(socket, 'Filename lengths above 12 are not allowed.\r\n\r\n');

  // express.e:17656 cleanItUp() — nothing needed for web
  // express.e:17657
  emitText(socket, 'Batch UpLoading.....\r\n');
  // express.e:17658
  emitText(socket, '\r\nUnlimited files.  Blank Line to start transfer.\r\n');
  // express.e:17664: StringF(str,'\b\nFileName \d: ',count)
  emitText(socket, '\r\nFileName 1: ');

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
 * Read actual free bytes at path using fs.statfsSync (Node >= 18.8) or df(1) fallback.
 * Returns 0 if both probes fail. This is the LOCAL disk's answer - the playpen
 * half of the upload display, and the floor rz would truncate against. The
 * pool's half comes from `poolSpaceFor`.
 *
 * Amiga-style assigns (BBS:, NODE0:, DOORS:, etc.) are resolved to real
 * filesystem paths before probing — statfsSync fails on virtual paths.
 */
function readFreeBytes(dirPath: string): number {
  // Resolve Amiga assigns (BBS:, NODE0:, DOORS:, …) to real FS paths.
  let resolvedPath = dirPath;
  if (/^[A-Z]+:/i.test(dirPath)) {
    try {
      const { BBSPaths } = require('../../utils/bbs-paths.util');
      const bbsRoot = config.get('dataDir');
      const paths = new BBSPaths(bbsRoot);
      resolvedPath = paths.resolveAmigaPath(dirPath);
    } catch { /* fall through to original path */ }
  }

  // statfs answers for a filesystem, not for a directory entry, so a path that
  // does not exist yet is not "0 bytes free" - it is the wrong question. The
  // node playpen is created when a transfer starts, so on a quiet node it is
  // routinely absent, and 0 here refuses every upload. Ask the nearest
  // ancestor that does exist: same filesystem, real answer.
  try {
    const fsMod = require('fs');
    let probe = resolvedPath;
    for (let i = 0; i < 64 && !fsMod.existsSync(probe); i++) {
      const parent = require('path').dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    resolvedPath = probe;
  } catch { /* probe the original path */ }

  let freeBytes = 0;
  try {
    const fs = require('fs');
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(resolvedPath);
      freeBytes = st.bfree * st.bsize;
    } else {
      // df -k: 1K blocks; column 4 is "Available"
      const { execSync } = require('child_process');
      const out: string = execSync(`df -k "${resolvedPath}"`, { encoding: 'utf-8' });
      const line = out.trim().split('\n').pop() || '';
      const avail = parseInt(line.trim().split(/\s+/)[3], 10);
      if (!isNaN(avail)) freeBytes = avail * 1024;
    }
  } catch { /* leave freeBytes = 0 */ }
  return freeBytes;
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

