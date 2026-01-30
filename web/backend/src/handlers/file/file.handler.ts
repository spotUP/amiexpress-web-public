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
import { storeUploadContext } from '../../server/upload-session-store';

// Dependencies (injected)
let fileAreas: any[] = [];
let fileEntries: any[] = [];
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

export function setFileEntries(entries: any[]) {
  fileEntries = entries;
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

// ===== File Area Display =====

// displayFileAreaContents() - Display files in area (express.e:27670-27694)
export function displayFileAreaContents(socket: any, session: BBSSession, area: any, collector?: string[]) {
  const emit = (msg: string) => {
    if (collector) {
      collector.push(msg);
    } else {
      emitText(socket, msg);
    }
  };

  // Show "Scanning directory X" message (express.e:27674 or 27683)
  emit(`Scanning directory ${area.id}, Area: ${area.name}\r\n`);

  // Get files in this area (like reading DIR file in AmiExpress)
  const areaFiles = fileEntries.filter(file => file.areaId === area.id);

  if (areaFiles.length === 0) {
    emit('\r\n');
    return;
  }

  // Format like AmiExpress DIR file display - express.e uses displayIt() to read pre-formatted DIR files
  // DIR file format is typically: filename, size, date, uploader, then description on next lines
  areaFiles.forEach(file => {
    const sizeKB = Math.ceil(file.size / 1024);

    // Format date as mm/dd/yy like original AmiExpress
    const date = new Date(file.uploadDate);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const dateStr = `${month}/${day}/${year}`;

    const description = file.fileIdDiz || file.description;

    // AmiExpress DIR format (one line per file with description):
    // filename.ext   123K 12/25/95 uploader - Description text here
    const sizePadded = `${sizeKB}K`.padStart(6);
    emit(`${file.filename.padEnd(13)} ${sizePadded} ${dateStr} ${file.uploader}`);

    if (description) {
      emit(` - ${description}`);
    }
    emit('\r\n');
  });

  emit('\r\n');
}

// displayFileList() - Main file listing function (1:1 with AmiExpress)
export function displayFileList(socket: any, session: BBSSession, params: string, reverse: boolean = false) {
console.log('displayFileList called with params:', params, 'reverse:', reverse);

  // Parse parameters (like parseParams in AmiExpress)
  const parsedParams = parseParams(params);
console.log('Parsed params:', parsedParams);

  // Check for non-stop flag (NS parameter)
  const nonStopDisplay = parsedParams.includes('NS');

  // express.e:27636 - just outputs \b\n, NO header
  const output: string[] = [];
  output.push('\r\n');

  // Get file areas for current conference (like AmiExpress DIR structure)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);

  if (currentFileAreas.length === 0) {
    output.push('No file areas available in this conference.\r\n');
    output.push('\r\n\x1b[32mPress any key to continue...\x1b[0m');
    emitText(socket, output.join(''));
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Directory selection (getDirSpan equivalent)
  if (parsedParams.length > 0 && !parsedParams.includes('NS')) {
    // Direct directory selection from params
    const dirSpan = getDirSpan(parsedParams[0], currentFileAreas.length);
    if (dirSpan.startDir === -1) {
      emitText(socket, '\r\n\x1b[31mInvalid directory selection.\x1b[0m\r\n');
      emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Display selected directories
    displaySelectedFileAreas(socket, session, currentFileAreas, dirSpan, reverse, nonStopDisplay, output);
  } else {
    // Interactive directory selection (like getDirSpan prompt)
    displayDirectorySelectionPrompt(socket, session, currentFileAreas, reverse, nonStopDisplay);
    return;
  }

  // Emit output with optional pagination (skip paging if NS flag present)
  const buffer = output.join('');
  if (nonStopDisplay) {
    emitText(socket, buffer);
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    return;
  }

  const lines = buffer.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 0) {
    startPagination(socket, session, lines, 'ansi-output', undefined, () => {
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    });
  }
}

// getDirSpan() - Directory selection logic (1:1 with AmiExpress)
export function getDirSpan(param: string, maxDirs: number): { startDir: number, dirScan: number } {
  const upperParam = param.toUpperCase();

  // Handle special cases
  if (upperParam === 'U') {
    return { startDir: maxDirs, dirScan: maxDirs }; // Upload directory
  }
  if (upperParam === 'A') {
    return { startDir: 1, dirScan: maxDirs }; // All directories
  }
  if (upperParam === 'H') {
    return { startDir: -1, dirScan: -1 }; // Hold directory (if allowed)
  }

  // Handle numeric directory selection
  const dirNum = parseInt(upperParam);
  if (!isNaN(dirNum) && dirNum >= 1 && dirNum <= maxDirs) {
    return { startDir: dirNum, dirScan: dirNum };
  }

  return { startDir: -1, dirScan: -1 }; // Invalid
}

// Display directory selection prompt (like getDirSpan interactive prompt)
export function displayDirectorySelectionPrompt(socket: any, session: BBSSession, fileAreas: any[], reverse: boolean, nonStop: boolean) {
  emitText(socket, '\x1b[36mDirectories: \x1b[32m(1-\x1b[33m' + fileAreas.length + '\x1b[32m) \x1b[36m, \x1b[32m(\x1b[33mA\x1b[32m)\x1b[36mll, \x1b[32m(\x1b[33mU\x1b[32m)\x1b[36mpload, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none? \x1b[0m');
  session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  session.tempData = { fileAreas, reverse, nonStop };
}

// Display selected file areas
export function displaySelectedFileAreas(
  socket: any,
  session: BBSSession,
  fileAreas: any[],
  dirSpan: { startDir: number, dirScan: number },
  reverse: boolean,
  nonStop: boolean,
  collector?: string[]
) {
  let currentDir = reverse ? dirSpan.dirScan : dirSpan.startDir;
  const endDir = reverse ? dirSpan.startDir : dirSpan.dirScan;
  const step = reverse ? -1 : 1;

  while ((reverse && currentDir >= endDir) || (!reverse && currentDir <= endDir)) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index
    if (areaIndex >= 0 && areaIndex < fileAreas.length) {
      const area = fileAreas[areaIndex];
      displayFileAreaContents(socket, session, area, collector);

      // If not non-stop, wait for user input between areas
      if (!collector && !nonStop && currentDir !== endDir) {
        session.subState = LoggedOnSubState.FILE_LIST_CONTINUE;
        session.tempData = { fileAreas, dirSpan, reverse, nonStop, currentDir: currentDir + step };
        return;
      }
    }
    currentDir += step;
  }

  // Finished displaying all areas (collector path defers final prompt to caller)
  if (!collector) {
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
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
      const dateStr = new Date(file.uploaddate).toLocaleDateString();
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
    emitText(socket, `Searching for files newer than: ${searchDate.toLocaleDateString()}\r\n\r\n`);

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

    // Pause prompt controlled by newFilesPauseFlag (set by confScan) - express.e:27934-27938
    if (!session.newFilesPauseFlag) {
      emitPrompt(socket, AnsiUtil.pressKeyPrompt());
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
          const uploadDate = new Date(file.uploaddate).toLocaleDateString();

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

export function displayNewFilesInDirectories(socket: any, session: BBSSession, searchDate: Date, dirSpan: { startDir: number, dirScan: number }, nonStop: boolean) {
  let currentDir = dirSpan.startDir;
  const endDir = dirSpan.dirScan;
  const step = 1; // Always forward for new files

  let foundNewFiles = false;

  while (currentDir <= endDir) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index
    if (areaIndex >= 0 && areaIndex < fileAreas.length) {
      const area = fileAreas[areaIndex];
      const newFilesInArea = fileEntries.filter(file =>
        file.areaId === area.id &&
        file.uploadDate > searchDate
      );

      if (newFilesInArea.length > 0) {
        foundNewFiles = true;
        emitText(socket, `\r\n\x1b[33m${area.name} (DIR${currentDir})\x1b[0m\r\n`);
        emitText(socket, `${area.description}\r\n\r\n`);

        // Display new files (like displayIt2 in AmiExpress)
        newFilesInArea.forEach(file => {
          const sizeKB = Math.ceil(file.size / 1024);
          const dateStr = file.uploadDate.toLocaleDateString();
          const description = file.fileIdDiz || file.description;

          emitText(socket, `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
          emitText(socket, `  ${description}\r\n\r\n`);
        });

        // Pause between areas if not non-stop
        if (!nonStop && currentDir < endDir) {
          emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.subState = LoggedOnSubState.FILE_LIST_CONTINUE;
          session.tempData = { fileAreas, dirSpan, nonStop, currentDir: currentDir + step, searchDate, isNewFiles: true };
          return;
        }
      }
    }
    currentDir += step;
  }

  if (!foundNewFiles) {
    emitText(socket, 'No new files found since the specified date.\r\n');
  }

  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// ===== Upload/Download Interfaces =====

export function displayUploadInterface(socket: any, session: BBSSession, params: string) {
console.log('displayUploadInterface called with params:', params);
console.log('🔍 [Upload Debug] Total fileAreas:', fileAreas.length);
console.log('🔍 [Upload Debug] session.currentConf:', session.currentConf);
console.log('🔍 [Upload Debug] fileAreas data:', fileAreas.map(a => ({ id: a.id, name: a.name, confId: a.conferenceId })));

  // Check if there are file directories to upload to (NDIRS check)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
console.log('🔍 [Upload Debug] Filtered currentFileAreas:', currentFileAreas.length);

  if (currentFileAreas.length === 0) {
    // express.e:25646 internalCommandU - no header
    emitText(socket, '\r\n');
    emitText(socket, 'No file areas available in this conference.\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // express.e:25646-25656 internalCommandU -> uploadaFile - no header
  emitText(socket, '\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  emitText(socket, '\x1b[32mYour Upload Statistics:\x1b[0m\r\n');
  emitText(socket, `Files Uploaded: ${user.uploads || 0}\r\n`);
  emitText(socket, `Bytes Uploaded: ${user.bytesUpload || 0}\r\n\r\n`);

  // Display available space (simplified - in production, calculate from file system)
  emitText(socket, '\x1b[32mAvailable Upload Space:\x1b[0m\r\n');
  emitText(socket, '1,000,000 bytes available\r\n\r\n');

  // express.e:19016 - "Filename lengths above 12 are not allowed."
  emitText(socket, 'Filename lengths above 12 are not allowed.\r\n');
  emitText(socket, '\x1b[33mYou can select multiple files for batch upload.\x1b[0m\r\n\r\n');

  // Display file areas for upload
  emitText(socket, '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  currentFileAreas.forEach((area, index) => {
    emitText(socket, `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  // Prompt for file area selection
  emitText(socket, '\r\n\x1b[32mSelect file area (1-\x1b[33m' + currentFileAreas.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILES_SELECT_AREA;
  session.tempData = { uploadMode: true, fileAreas: currentFileAreas, batchUpload: true };
}

export function displayDownloadInterface(socket: any, session: BBSSession, params: string) {
  console.log('[D/DS] displayDownloadInterface called with params:', params);

  // Check if there are file directories to download from - express.e:19961-19964
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  if (currentFileAreas.length === 0) {
    // express.e:19962-19963 - myError(5) = "Sorry, this function is not available."
    emitText(socket, '\r\nSorry, no file directories available in this conference.\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const user = session.user!;

  // express.e:19981 - displayULStats(loggedOnUser, loggedOnUserMisc)
  // Shows download/upload stats in express.e format
  const dlBytes = user.bytesDownload || 0;
  const ulBytes = user.bytesUpload || 0;
  const dlKB = Math.floor(dlBytes / 1024);
  const ulKB = Math.floor(ulBytes / 1024);

  emitText(socket, `Number of Downloads      : ${user.downloads || 0} (${dlKB}k total)\r\n`);
  emitText(socket, `Number of Uploads        : ${user.uploads || 0} (${ulKB}k total)\r\n`);

  // express.e:19701-12713 - bytesADL (daily byte allowance)
  // For web, we show "Infinite" since there's no modem speed limit
  emitText(socket, 'Todays Bytes Available   : Infinite\r\n');

  // express.e:19983-19991 - Check ratio and show files available
  const ratio = user.secLibrary || 0; // User's file ratio setting
  if (ratio > 0) {
    const uploads = user.uploads || 0;
    const downloads = user.downloads || 0;
    const filesAvail = (ratio * (uploads + 1)) - downloads;
    emitText(socket, `Files Avail before UL    : ${filesAvail}\r\n`);
    if (filesAvail < 1) {
      // express.e:19988-19990 - exceedRatio()
      emitText(socket, '\r\nYou have exceeded your ratio, you must upload first.\r\n\r\n');
      emitText(socket, '\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }
  }

  emitText(socket, '\r\n');

  // express.e:20031-20033 - Download prompt with wildcard info
  emitText(socket, 'Space between filenames.  ');
  const { checkSecurity } = require('../../utils/acs.util');
  const { ACSPermission } = require('../../constants/acs-permissions');
  if (checkSecurity(user, ACSPermission.FILE_EXPANSION)) {
    emitText(socket, 'Wildcards permitted.');
  } else {
    emitText(socket, 'No wildcards permitted.');
  }
  emitText(socket, '\r\n\r\n');

  // Show download prompt - express.e:19784-19788 downloadPrompt()
  // Format: "X mins, Y bytes, Filespec(Z): "
  const minsLeft = session.timeRemaining || 60;
  emitText(socket, `${minsLeft} mins, Infinite bytes, Filespec(1): `);

  // Set state to accept filename input - use FILES_DOWNLOAD_SELECT for filename entry
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

  // Display files in the area for selection
  const areaFiles = fileEntries.filter(file => file.areaId === fileArea.id);
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
    const dateStr = file.uploadDate.toLocaleDateString();
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

export function handleFileDownload(socket: any, session: BBSSession, fileIndex: number) {
  const tempData = session.tempData as { fileArea: any, areaFiles: any[] };
  const selectedFile = tempData.areaFiles[fileIndex - 1];

  if (!selectedFile) {
    emitText(socket, '\r\n\x1b[31mInvalid file selection.\x1b[0m\r\n');
    emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Emit show-file-download event for frontend to handle
  socket.emit('show-file-download', {
    filename: selectedFile.filename,
    size: selectedFile.size,
    downloadUrl: `/api/download/${selectedFile.id}`,
    fileId: selectedFile.id
  });

  // Return to menu after triggering download
  emitText(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}
