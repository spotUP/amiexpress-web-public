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
import { fileAreaManager } from '../../services/FileAreaManager';

import type { BBSSession, UploadSessionContext } from '../../index';
import { formatLongDate } from '../../utils/date-time.util';
import { storeUploadContext } from '../../server/upload-session-store';

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

export function setFileMaintenanceDependencies(deps: {
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
      const confDir = path.join(bbsRoot, `Conf${session.currentConf || 1}`);
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

  // Log deletion
  filesToDelete.forEach((file: any) => {
    callersLog(session.user!.id, session.user!.username, 'Deleted file', `${file.filename} (${file.areaname || ''})`);
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

  // Log move with destination
  filesToMove.forEach((file: any) => {
    callersLog(session.user!.id, session.user!.username, 'Moved file', `${file.filename} -> ${tempData.destArea.name}`);
  });

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
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
      const sizeKB = Math.ceil(file.size / 1024);
      const dateStr = formatLongDate(new Date(file.uploaddate));
      const description = file.fileid_diz || file.description;

      emitText(socket, `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
      emitText(socket, `  ${description}\r\n`);
      emitText(socket, `  Area: ${file.areaname}\r\n\r\n`);
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
  emitText(socket, '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail  Ratio\x1b[0m\r\n\r\n');
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

    // Get file areas for current conference from database
    const conferenceId = session.currentConf || 1;
console.log('[displayNewFiles] Getting file areas for conference:', conferenceId);
    const areas = await db.getFileAreas(conferenceId);
console.log('[displayNewFiles] Found', areas.length, 'file areas');

  if (areas.length === 0) {
    emitText(socket, '\r\n\x1b[33mNo file areas available in this conference.\x1b[0m\r\n');
    finalizeCommand(socket, session, 'New files unavailable');
    return;
  }

    // Display new files from database - express.e:27906-27950
    await displayNewFilesFromDatabase(socket, session, searchDate, areas, nonStopDisplay);

    // express.e:27934-27938: IF NOT newFilesPauseFlag THEN flagPause(1) — main loop doPause handles
    if (!session.newFilesPauseFlag) {
      session.menuPause = true;
    }
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  } catch (error) {
console.error('[displayNewFiles] ERROR:', error);
    emitText(socket, `\r\n\x1b[31mError displaying new files: ${(error as Error).message}\x1b[0m\r\n`);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

// Display new files from database - express.e:27906-27950 myNewFiles()
async function displayNewFilesFromDatabase(socket: any, session: BBSSession, searchDate: Date, areas: any[], nonStop: boolean) {
  const { checkForPause, flagPause } = require('../../utils/flag-pause.util');
  let foundNewFiles = false;
  let totalNewFiles = 0;

  // Helper to emit output and track lines for pause purposes
  const emitLine = (text: string, lineCount: number = 1) => {
    emitText(socket, text);
    // Track lines for checkForPause()
    if (!session.tempData) session.tempData = {};
    session.tempData.lineCount = (session.tempData.lineCount || 0) + lineCount;
  };

  // Loop through all file areas in conference - express.e:27906 WHILE(fLLoop<=dirScan)
  for (let dirIndex = 0; dirIndex < areas.length; dirIndex++) {
    const area = areas[dirIndex];

    try {
      // express.e:27914,27928 - Output "Scanning directory X" for each directory
      emitLine(`Scanning ${area.name || 'directory ' + (dirIndex + 1)}...\r\n`, 1);

      // express.e:27934-27938 - Pause after each directory
      // During confScan (newFilesPauseFlag=TRUE), use checkForPause()
      // Otherwise use flagPause(1) for manual N command
      let shouldContinue = true;
      if (session.newFilesPauseFlag) {
        shouldContinue = await checkForPause(socket, session);
      } else {
        shouldContinue = await flagPause(socket, session, 1);
      }

      // If user chose to stop, break out of loop
      if (!shouldContinue) {
console.log('[displayNewFilesFromDatabase] User stopped scan');
        break;
      }

      // Query files newer than search date in this area
      const query = `
        SELECT
          id,
          filename,
          description,
          size,
          uploader,
          uploaddate,
          downloads
        FROM file_entries
        WHERE areaid = $1
          AND uploaddate > $2
        ORDER BY uploaddate DESC
      `;

      // Convert Date to Unix timestamp (seconds) for SQLite3 compatibility
      const searchTimestamp = Math.floor(searchDate.getTime() / 1000);
      const result = await db.query(query, [area.id, searchTimestamp]);
      const newFiles = result.rows;

      if (newFiles.length > 0) {
        foundNewFiles = true;
        totalNewFiles += newFiles.length;

        // Display area header (2-3 lines)
        emitLine(`\r\n\x1b[33m${area.name}\x1b[0m\r\n`, 2);
        if (area.description) {
          emitLine(`${area.description}\r\n`, 1);
        }
        emitLine('\r\n', 1);

        // Display each new file with pause check
        for (const file of newFiles) {
          const sizeKB = Math.ceil(file.size / 1024);
          const uploadDate = formatLongDate(new Date(file.uploaddate));

          // Format: filename  sizeKB  date  uploader
          emitLine(
            `\x1b[32m${file.filename.padEnd(20)}\x1b[0m ` +
            `\x1b[36m${String(sizeKB).padStart(6)}KB\x1b[0m ` +
            `\x1b[33m${uploadDate.padEnd(10)}\x1b[0m ` +
            `\x1b[37m${file.uploader}\x1b[0m\r\n`,
            1
          );

          // Show description if available
          if (file.description) {
            const desc = file.description.substring(0, 70);
            emitLine(`  \x1b[37m${desc}\x1b[0m\r\n`, 1);
          }

          // Check for pause after each file listing
          if (session.newFilesPauseFlag) {
            const cont = await checkForPause(socket, session);
            if (!cont) {
console.log('[displayNewFilesFromDatabase] User stopped during file listing');
              return; // Exit early
            }
          }
        }

        emitLine(`\r\n\x1b[36m${newFiles.length} new file(s) in this area\x1b[0m\r\n`, 2);
      }
    } catch (error) {
console.error(`[displayNewFilesFromDatabase] Error for area ${area.name}:`, error);
    }
  }

  // Summary - express.e always shows this
  emitLine('\r\n', 1);
  if (foundNewFiles) {
    emitLine(`\x1b[32mTotal: ${totalNewFiles} new file(s) found\x1b[0m\r\n`, 1);
  } else {
    emitLine('\x1b[33mNo new files found since last login\x1b[0m\r\n', 1);
  }

  if (!nonStop) {
    emitLine('\r\n', 1);
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

  // express.e:19007: StringF(buff,'\s UPLOADING....\b\n', xprTitle.item(loggedOnUser.xferProtocol))
  // session.user.protocol is mapped from xferProtocol int via intToProtocol()
  const protocolTitle = (session.user as any)?.protocol || '/X Zmodem';
  emitText(socket, `\r\n${protocolTitle} UPLOADING....\r\n`);

  // express.e:19012-19014: formatSpaceValue(tFShi,tFSlo) and formatSpaceValue(fSUploadingHi,fSUploadingLo)
  // tFShi/tFSlo = freeDiskSpace() — total free across configured drives
  // fSUploadingHi/fSUploadingLo = rFreeSpace(nodePlaypen) — space at upload path
  // Both resolve to the same disk in our single-filesystem web setup: the ulPath
  const ulPath = uploadArea.ulPath || process.cwd();
  const spaceStr = formatSpaceValue(ulPath);
  emitText(socket, `${spaceStr} available for uploading.  ${spaceStr} at one time.\r\n`);

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
 * Then format with formatSpaceValue() — 1:1 port of MiscFuncs.e:234-249.
 */
function formatSpaceValue(dirPath: string): string {
  let freeBytes = 0;
  try {
    const fs = require('fs');
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(dirPath);
      freeBytes = st.bfree * st.bsize;
    } else {
      // df -k: 1K blocks; column 4 is "Available"
      const { execSync } = require('child_process');
      const out: string = execSync(`df -k "${dirPath}"`, { encoding: 'utf-8' });
      const line = out.trim().split('\n').pop() || '';
      const avail = parseInt(line.trim().split(/\s+/)[3], 10);
      if (!isNaN(avail)) freeBytes = avail * 1024;
    }
  } catch { /* leave freeBytes = 0 */ }

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

export function startFileUpload(socket: any, session: BBSSession, fileArea: any) {
console.log('startFileUpload called for area:', fileArea.name);

  emitText(socket, `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n\r\n`);

  // Check if user has upload access to this area
  if (fileArea.uploadAccess > (session.user?.secLevel || 0)) {
    emitText(socket, '\r\n\x1b[31mYou do not have upload access to this file area.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Display available space (express.e:18991-18993)
  emitText(socket, '1,000,000 bytes available for uploading.  1,000,000 at one time.\r\n');
  emitText(socket, 'Filename lengths above 12 are not allowed.\r\n\r\n');

  // Web-friendly flow: Show file picker immediately
  emitText(socket, '\x1b[36mSelect file to upload...\x1b[0m\r\n\r\n');

  const previousTempData = session.tempData || {};
  const uploadContext: UploadSessionContext = {
    uploadMode: true,
    fileArea,
    uploadSessionId: socket.id,
    uploadBatch: [],
    uploadCount: 1,
    uploadStartTime: Date.now(),
    webUploadMode: true,
    batchUpload: true,  // Always enable batch/multiple upload for web mode
    currentUploadIndex: 0,
    uploadedFiles: 0,  // Track number of files actually uploaded
    uploadedBytes: 0   // Track total bytes uploaded
  };

  session.uploadContext = uploadContext;
  session.tempData = uploadContext;
  storeUploadContext(socket.id, uploadContext);

  // Initialize upload session data
  // session.tempData already set via uploadContext above

  // Trigger file picker immediately (web-friendly approach)
  // Check if batch upload is enabled from tempData
  const isBatchUpload = uploadContext.batchUpload || false;

  socket.emit('show-file-upload', {
    accept: '*/*',
    maxSize: 10 * 1024 * 1024, // 10MB max
    uploadUrl: '/api/upload',
    fieldName: 'file',
    multiple: isBatchUpload  // Enable HTML5 multiple file selection for batch uploads
  });

  session.subState = LoggedOnSubState.FILES_UPLOAD;
}

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

