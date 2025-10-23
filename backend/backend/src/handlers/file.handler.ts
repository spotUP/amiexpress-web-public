/**
 * File Operations Handler
 * Handles all file-related operations: listing, uploading, downloading, maintenance
 * 1:1 port from AmiExpress express.e file operations
 */

import { BBSSession, LoggedOnSubState } from '../index';

// Dependencies (injected)
let fileAreas: any[] = [];
let fileEntries: any[] = [];
let db: any;
let callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
let getUserStats: (userId: string) => Promise<any>;
let _searchFilesByName: any;
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
  getFileEntry: any;
  deleteFileEntry: any;
  moveFileEntry: any;
  updateFileDescription: any;
  getFileAreas: any;
}) {
  _searchFilesByName = deps.searchFilesByName;
  _getFileEntry = deps.getFileEntry;
  _deleteFileEntry = deps.deleteFileEntry;
  _moveFileEntry = deps.moveFileEntry;
  _updateFileDescription = deps.updateFileDescription;
  _getFileAreas = deps.getFileAreas;
}

// ===== File Area Display =====

export function displayFileAreaContents(socket: any, session: BBSSession, area: any) {
  socket.emit('ansi-output', `\x1b[2J\x1b[H`); // Clear screen
  socket.emit('ansi-output', `\x1b[36m-= ${area.name} =-\x1b[0m\r\n`);
  socket.emit('ansi-output', `${area.description}\r\n\r\n`);

  // Get files in this area (like reading DIR file in AmiExpress)
  const areaFiles = fileEntries.filter(file => file.areaId === area.id);

  if (areaFiles.length === 0) {
    socket.emit('ansi-output', 'No files in this area.\r\n');
  } else {
    socket.emit('ansi-output', 'Available files:\r\n\r\n');

    // Format like AmiExpress DIR file display (1:1 with displayIt)
    areaFiles.forEach(file => {
      const sizeKB = Math.ceil(file.size / 1024);
      const dateStr = file.uploadDate.toLocaleDateString();
      const description = file.fileIdDiz || file.description;

      // Format exactly like AmiExpress DIR display:
      // filename        sizeK date       uploader
      //   description line 1
      //   description line 2
      socket.emit('ansi-output', `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
      socket.emit('ansi-output', `  ${description}\r\n\r\n`);
    });
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to return to file areas...\x1b[0m');
  session.subState = LoggedOnSubState.FILE_LIST;
}

// displayFileList() - Main file listing function (1:1 with AmiExpress)
export function displayFileList(socket: any, session: BBSSession, params: string, reverse: boolean = false) {
  console.log('displayFileList called with params:', params, 'reverse:', reverse);

  // Parse parameters (like parseParams in AmiExpress)
  const parsedParams = parseParams(params);
  console.log('Parsed params:', parsedParams);

  // Check for non-stop flag (NS parameter)
  const nonStopDisplay = parsedParams.includes('NS');

  socket.emit('ansi-output', '\r\n');
  if (reverse) {
    socket.emit('ansi-output', '\x1b[36m-= File Areas (Reverse) =-\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[36m-= File Areas =-\x1b[0m\r\n');
  }

  // Get file areas for current conference (like AmiExpress DIR structure)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);

  if (currentFileAreas.length === 0) {
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Directory selection (getDirSpan equivalent)
  if (parsedParams.length > 0 && !parsedParams.includes('NS')) {
    // Direct directory selection from params
    const dirSpan = getDirSpan(parsedParams[0], currentFileAreas.length);
    if (dirSpan.startDir === -1) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid directory selection.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Display selected directories
    displaySelectedFileAreas(socket, session, currentFileAreas, dirSpan, reverse, nonStopDisplay);
  } else {
    // Interactive directory selection (like getDirSpan prompt)
    displayDirectorySelectionPrompt(socket, session, currentFileAreas, reverse, nonStopDisplay);
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
  socket.emit('ansi-output', '\x1b[36mDirectories: \x1b[32m(1-\x1b[33m' + fileAreas.length + '\x1b[32m) \x1b[36m, \x1b[32m(\x1b[33mA\x1b[32m)\x1b[36mll, \x1b[32m(\x1b[33mU\x1b[32m)\x1b[36mpload, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none? \x1b[0m');
  session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  session.tempData = { fileAreas, reverse, nonStop };
}

// Display selected file areas
export function displaySelectedFileAreas(socket: any, session: BBSSession, fileAreas: any[], dirSpan: { startDir: number, dirScan: number }, reverse: boolean, nonStop: boolean) {
  let currentDir = reverse ? dirSpan.dirScan : dirSpan.startDir;
  const endDir = reverse ? dirSpan.startDir : dirSpan.dirScan;
  const step = reverse ? -1 : 1;

  while ((reverse && currentDir >= endDir) || (!reverse && currentDir <= endDir)) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index
    if (areaIndex >= 0 && areaIndex < fileAreas.length) {
      const area = fileAreas[areaIndex];
      displayFileAreaContents(socket, session, area);

      // If not non-stop, wait for user input between areas
      if (!nonStop && currentDir !== endDir) {
        session.subState = LoggedOnSubState.FILE_LIST_CONTINUE;
        session.tempData = { fileAreas, dirSpan, reverse, nonStop, currentDir: currentDir + step };
        return;
      }
    }
    currentDir += step;
  }

  // Finished displaying all areas
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// ===== File Maintenance (FM command) =====

// displayFileMaintenance() - File maintenance/search (FM command)
export async function displayFileMaintenance(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Maintenance =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'File maintenance and search functionality.\r\n\r\n');

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
    socket.emit('ansi-output', 'Available operations:\r\n');
    socket.emit('ansi-output', 'FM D <filename> - Delete files\r\n');
    socket.emit('ansi-output', 'FM M <filename> <area> - Move files\r\n');
    socket.emit('ansi-output', 'FM S <pattern> - Search files\r\n');
    socket.emit('ansi-output', '\r\nUse FM <operation> <parameters>\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// handleFileDelete() - Delete files (FM D command)
export async function handleFileDelete(socket: any, session: BBSSession, params: string[]) {
  if (params.length === 0) {
    socket.emit('ansi-output', 'Delete files functionality.\r\n');
    socket.emit('ansi-output', 'Usage: FM D <filename> [area]\r\n');
    socket.emit('ansi-output', 'Wildcards (* and ?) are supported.\r\n');
    socket.emit('ansi-output', 'Area parameter is optional (defaults to current conference).\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const filename = params[0];

  // Search files using database (with wildcard support)
  const matchingFiles = await _searchFilesByName(filename, session.currentConf || 1);

  if (matchingFiles.length === 0) {
    socket.emit('ansi-output', `\r\nNo files matching "${filename}" found.\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
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
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have permission to delete these files.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display files to be deleted
  socket.emit('ansi-output', `\r\nFiles matching "${filename}":\r\n\r\n`);
  allowedFiles.forEach((file: any, index: number) => {
    socket.emit('ansi-output', `${index + 1}. ${file.filename} (${file.areaname})\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[31mWARNING: This action cannot be undone!\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[32mEnter file numbers to delete (comma-separated) or "ALL" for all: \x1b[0m');

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
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid operation state.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
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
    socket.emit('ansi-output', '\r\n\x1b[33mNo files selected for deletion.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
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

  socket.emit('ansi-output', `\r\n\x1b[32mDeleted ${filesToDelete.length} file(s) successfully.\x1b[0m\r\n`);

  // Log deletion
  filesToDelete.forEach((file: any) => {
    callersLog(session.user!.id, session.user!.username, 'Deleted file', file.filename);
  });

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleFileMove() - Move files between areas (FM M command)
export function handleFileMove(socket: any, session: BBSSession, params: string[]) {
  if (params.length < 2) {
    socket.emit('ansi-output', 'Move files functionality.\r\n');
    socket.emit('ansi-output', 'Usage: FM M <filename> <destination_area>\r\n');
    socket.emit('ansi-output', 'Wildcards (* and ?) are supported for filename.\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const filename = params[0].toUpperCase();
  const destAreaId = parseInt(params[1]);

  if (isNaN(destAreaId)) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid destination area number.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check destination area exists
  const destArea = fileAreas.find(a => a.id === destAreaId);
  if (!destArea) {
    socket.emit('ansi-output', '\r\n\x1b[31mDestination file area not found.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Find matching files in current conference
  const sourceAreas = fileAreas.filter(a => a.conferenceId === session.currentConf);
  const matchingFiles: any[] = [];

  sourceAreas.forEach(area => {
    const areaFiles = fileEntries.filter(f => f.areaId === area.id);
    areaFiles.forEach(file => {
      if (matchesWildcard(file.filename, filename)) {
        matchingFiles.push({ file, area });
      }
    });
  });

  if (matchingFiles.length === 0) {
    socket.emit('ansi-output', `\r\nNo files matching "${filename}" found in current conference.\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check permissions (sysop or file owner)
  const userLevel = session.user?.secLevel || 0;
  const allowedFiles = matchingFiles.filter(({ file }) =>
    userLevel >= 200 || file.uploader.toLowerCase() === session.user?.username.toLowerCase()
  );

  if (allowedFiles.length === 0) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have permission to move these files.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display files to be moved
  socket.emit('ansi-output', `\r\nFiles matching "${filename}" to move to ${destArea.name}:\r\n\r\n`);
  allowedFiles.forEach(({ file, area }, index) => {
    socket.emit('ansi-output', `${index + 1}. ${file.filename} (${area.name} -> ${destArea.name})\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[32mEnter file numbers to move (comma-separated) or "ALL" for all: \x1b[0m');

  // Store context for confirmation
  session.tempData = {
    operation: 'move_files',
    allowedFiles,
    destArea,
    filename
  };
  session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for input
}

export function handleFileMoveConfirmation(socket: any, session: BBSSession, input: string) {
  const tempData = session.tempData as { operation: string, allowedFiles: any[], destArea: any, filename: string };

  if (!tempData || tempData.operation !== 'move_files') {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid operation state.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
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
    socket.emit('ansi-output', '\r\n\x1b[33mNo files selected for move.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Move files in database
  const movePromises = filesToMove.map(({ file }) =>
    db.updateFileEntry(file.id, { areaId: tempData.destArea.id }).catch((err: any) => console.error('Error moving file:', err))
  );

  Promise.all(movePromises).then(() => {
    socket.emit('ansi-output', `\r\n\x1b[32mMoved ${filesToMove.length} file(s) to ${tempData.destArea.name} successfully.\x1b[0m\r\n`);

    // Log move
    filesToMove.forEach(({ file }) => {
      callersLog(session.user!.id, session.user!.username, 'Moved file', `${file.filename} to ${tempData.destArea.name}`);
    });

    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleFileSearch() - Search files by pattern (FM S command)
export function handleFileSearch(socket: any, session: BBSSession, params: string[]) {
  if (params.length === 0) {
    socket.emit('ansi-output', 'Search files functionality.\r\n');
    socket.emit('ansi-output', 'Usage: FM S <search_pattern> [area]\r\n');
    socket.emit('ansi-output', 'Search pattern can be filename, description, or uploader.\r\n');
    socket.emit('ansi-output', 'Area parameter is optional (defaults to current conference).\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const searchPattern = params[0].toLowerCase();
  const areaParam = params.length > 1 ? params[1] : null;

  // Determine which file areas to search
  let targetAreas: any[] = [];
  if (areaParam) {
    // Specific area requested
    const areaId = parseInt(areaParam);
    if (isNaN(areaId)) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid area number.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    const area = fileAreas.find(a => a.id === areaId);
    if (!area) {
      socket.emit('ansi-output', '\r\n\x1b[31mFile area not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    targetAreas = [area];
  } else {
    // All areas in current conference
    targetAreas = fileAreas.filter(a => a.conferenceId === session.currentConf);
  }

  // Search files
  const matchingFiles: any[] = [];
  targetAreas.forEach(area => {
    const areaFiles = fileEntries.filter(f => f.areaId === area.id);
    areaFiles.forEach(file => {
      const filename = file.filename.toLowerCase();
      const description = (file.fileIdDiz || file.description || '').toLowerCase();
      const uploader = file.uploader.toLowerCase();

      if (filename.includes(searchPattern) ||
          description.includes(searchPattern) ||
          uploader.includes(searchPattern)) {
        matchingFiles.push({ file, area });
      }
    });
  });

  // Display results
  socket.emit('ansi-output', `\r\nSearch results for "${searchPattern}":\r\n\r\n`);

  if (matchingFiles.length === 0) {
    socket.emit('ansi-output', 'No files found matching the search pattern.\r\n');
  } else {
    socket.emit('ansi-output', `Found ${matchingFiles.length} file(s):\r\n\r\n`);

    matchingFiles.forEach(({ file, area }) => {
      const sizeKB = Math.ceil(file.size / 1024);
      const dateStr = file.uploadDate.toLocaleDateString();
      const description = file.fileIdDiz || file.description;

      socket.emit('ansi-output', `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
      socket.emit('ansi-output', `  ${description}\r\n`);
      socket.emit('ansi-output', `  Area: ${area.name}\r\n\r\n`);
    });
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// ===== File Status (FS command) =====

export async function displayFileStatus(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Status =-\x1b[0m\r\n');

  // Parse parameters to determine scope (like fileStatus(opt) in AmiExpress)
  const parsedParams = parseParams(params);
  const showAllConferences = parsedParams.length === 0 || parsedParams.includes('ALL');

  // Get user stats from database for bytes available and ratio calculation
  const userStats = await getUserStats(session.user!.id);
  const userRatio = session.user!.ratio || 1;

  // Calculate bytes available: (bytes_uploaded * ratio) - bytes_downloaded
  const bytesAvail = Math.max(0, (userStats.bytes_uploaded * userRatio) - userStats.bytes_downloaded);
  const ratioDisplay = userRatio > 0 ? `${userRatio}:1` : 'DSBLD';

  socket.emit('ansi-output', '\x1b[32m              Uploads                 Downloads\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail  Ratio\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\x1b[0m\r\n');

  // Note: This would normally reference a conferences array from parent scope
  // For now we'll need to inject it
  socket.emit('ansi-output', '\r\n\x1b[32mYour File Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${userStats.files_uploaded || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${userStats.bytes_uploaded || 0}\r\n`);
  socket.emit('ansi-output', `Files Downloaded: ${userStats.files_downloaded || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${userStats.bytes_downloaded || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Available: ${bytesAvail}\r\n`);

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// ===== New Files (N command) =====

export function displayNewFiles(socket: any, session: BBSSession, params: string) {
  console.log('displayNewFiles called with params:', params);

  // Parse parameters (like parseParams in AmiExpress)
  const parsedParams = parseParams(params);
  console.log('Parsed params:', parsedParams);

  // Check for non-stop flag (NS parameter)
  const nonStopDisplay = parsedParams.includes('NS');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[36m-= New Files Since Last Login =-\x1b[0m\r\n');

  // Get date to search from
  let searchDate: Date;
  if (parsedParams.length > 0 && parsedParams[0] !== 'NS') {
    // Direct date provided
    const dateStr = parsedParams[0];
    if (dateStr.length === 8) {
      // Parse MM-DD-YY format
      const month = parseInt(dateStr.substring(0, 2)) - 1; // JS months are 0-based
      const day = parseInt(dateStr.substring(3, 5));
      const year = 2000 + parseInt(dateStr.substring(6, 8)); // Y2K compliant
      searchDate = new Date(year, month, day);
    } else {
      searchDate = session.user?.lastLogin || new Date(Date.now() - 86400000); // Default to 1 day ago
    }
  } else {
    // Use user's last login date (like loggedOnUser.newSinceDate in AmiExpress)
    searchDate = session.user?.lastLogin || new Date(Date.now() - 86400000);
  }

  socket.emit('ansi-output', `Searching for files newer than: ${searchDate.toLocaleDateString()}\r\n\r\n`);

  // Directory selection (getDirSpan equivalent)
  if (parsedParams.length > 1 || (parsedParams.length === 1 && !parsedParams.includes('NS'))) {
    // Direct directory selection from params
    const dirSpan = getDirSpan(parsedParams[parsedParams.includes('NS') ? 1 : 0], fileAreas.length);
    if (dirSpan.startDir === -1) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid directory selection.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Display new files in selected directories
    displayNewFilesInDirectories(socket, session, searchDate, dirSpan, nonStopDisplay);
  } else {
    // Interactive directory selection (like getDirSpan prompt)
    displayDirectorySelectionPrompt(socket, session, fileAreas, false, nonStopDisplay);
    // Store search date for later use
    session.tempData = { ...session.tempData, searchDate, nonStopDisplay, isNewFiles: true };
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
        socket.emit('ansi-output', `\r\n\x1b[33m${area.name} (DIR${currentDir})\x1b[0m\r\n`);
        socket.emit('ansi-output', `${area.description}\r\n\r\n`);

        // Display new files (like displayIt2 in AmiExpress)
        newFilesInArea.forEach(file => {
          const sizeKB = Math.ceil(file.size / 1024);
          const dateStr = file.uploadDate.toLocaleDateString();
          const description = file.fileIdDiz || file.description;

          socket.emit('ansi-output', `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
          socket.emit('ansi-output', `  ${description}\r\n\r\n`);
        });

        // Pause between areas if not non-stop
        if (!nonStop && currentDir < endDir) {
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.subState = LoggedOnSubState.FILE_LIST_CONTINUE;
          session.tempData = { fileAreas, dirSpan, nonStop, currentDir: currentDir + step, searchDate, isNewFiles: true };
          return;
        }
      }
    }
    currentDir += step;
  }

  if (!foundNewFiles) {
    socket.emit('ansi-output', 'No new files found since the specified date.\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// ===== Upload/Download Interfaces =====

export function displayUploadInterface(socket: any, session: BBSSession, params: string) {
  console.log('displayUploadInterface called with params:', params);

  // Check if there are file directories to upload to (NDIRS check)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  if (currentFileAreas.length === 0) {
    socket.emit('ansi-output', '\x1b[36m-= Upload Files =-\x1b[0m\r\n');
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display upload message (like UPLOADMSG.TXT)
  socket.emit('ansi-output', '\x1b[36m-= Upload Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Upload your files to share with the community.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Upload Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${user.uploads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload || 0}\r\n\r\n`);

  // Display available space (simplified - in production, calculate from file system)
  socket.emit('ansi-output', '\x1b[32mAvailable Upload Space:\x1b[0m\r\n');
  socket.emit('ansi-output', '1,000,000 bytes available\r\n\r\n');

  // Display file areas for upload
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  // Prompt for file area selection
  socket.emit('ansi-output', '\r\n\x1b[32mSelect file area (1-\x1b[33m' + currentFileAreas.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { uploadMode: true, fileAreas: currentFileAreas };
}

export function displayDownloadInterface(socket: any, session: BBSSession, params: string) {
  console.log('displayDownloadInterface called with params:', params);

  // Check if there are file directories to download from (NDIRS check)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  if (currentFileAreas.length === 0) {
    socket.emit('ansi-output', '\x1b[36m-= Download Files =-\x1b[0m\r\n');
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display download message (like DOWNLOADMSG.TXT)
  socket.emit('ansi-output', '\x1b[36m-= Download Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Download files from our collection.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Download Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Downloaded: ${user.downloads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload || 0}\r\n\r\n`);

  // Display current protocol (simplified)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Display file areas for download
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  // Prompt for file area selection
  socket.emit('ansi-output', '\r\n\x1b[32mSelect file area (1-\x1b[33m' + currentFileAreas.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { downloadMode: true, fileAreas: currentFileAreas };
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

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[36m-= Upload Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Upload your files to share with the community.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Upload Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${user.uploads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload || 0}\r\n\r\n`);

  // Display available space (simplified - in production, calculate from file system)
  socket.emit('ansi-output', '\x1b[32mAvailable Upload Space:\x1b[0m\r\n');
  socket.emit('ansi-output', '1,000,000 bytes available\r\n\r\n');

  // Check if user has upload access to this area
  if (fileArea.uploadAccess > (session.user?.secLevel || 0)) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have upload access to this file area.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Display upload message (like UPLOADMSG.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mUpload Message:\x1b[0m\r\n');
  socket.emit('ansi-output', 'Please select files to upload. Files will be validated and checked for duplicates.\r\n');
  socket.emit('ansi-output', 'Filename lengths above 12 characters are not allowed.\r\n\r\n');

  // Display current protocol (WebSocket-based)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Initialize WebSocket file upload
  socket.emit('ansi-output', '\x1b[32mWebSocket File Upload Ready\x1b[0m\r\n');
  socket.emit('ansi-output', 'Send file data using WebSocket protocol...\r\n\r\n');

  // Set up WebSocket file upload handlers
  session.tempData = {
    uploadMode: true,
    fileArea: fileArea,
    uploadState: 'ready',
    currentFile: null,
    receivedChunks: [],
    totalSize: 0
  };

  // Listen for file upload data
  const uploadHandler = (data: any) => {
    if (data.type === 'file-start') {
      // Start of file upload
      session.tempData.currentFile = {
        filename: data.filename,
        size: data.size,
        description: data.description || ''
      };
      session.tempData.receivedChunks = [];
      session.tempData.totalSize = data.size;
      session.tempData.uploadState = 'receiving';

      socket.emit('ansi-output', `\x1b[32mReceiving file: ${data.filename} (${data.size} bytes)\x1b[0m\r\n`);
      socket.emit('ansi-output', 'Progress: [                    ] 0%\r\n');
    } else if (data.type === 'file-chunk') {
      // File chunk received
      session.tempData.receivedChunks.push(data.chunk);

      const receivedBytes = session.tempData.receivedChunks.reduce((sum: number, chunk: string) => sum + chunk.length, 0);
      const progress = Math.floor((receivedBytes / session.tempData.totalSize) * 100);
      const progressBar = '[' + '='.repeat(Math.floor(progress / 5)) + ' '.repeat(20 - Math.floor(progress / 5)) + ']';

      // Update progress display (overwrite previous line)
      socket.emit('ansi-output', '\x1b[1A\x1b[K'); // Move up and clear line
      socket.emit('ansi-output', `Progress: ${progressBar} ${progress}%\r\n`);
    } else if (data.type === 'file-end') {
      // File upload complete
      const fileData = session.tempData.receivedChunks.join('');
      const file = session.tempData.currentFile;

      // Validate file (basic checks)
      if (file.filename.length > 12) {
        socket.emit('ansi-output', '\x1b[31mError: Filename too long (max 12 characters)\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }

      // Save file to database
      const fileEntry = {
        filename: file.filename,
        description: file.description,
        size: fileData.length,
        uploader: session.user!.username,
        uploadDate: new Date(),
        downloads: 0,
        areaId: fileArea.id,
        status: 'active' as const,
        checked: 'N' as const
      };

      // In production, save to file system too
      // For now, just store in database
      db.createFileEntry(fileEntry).then(async () => {
        // Update user stats in users table (for backward compatibility)
        await db.updateUser(session.user!.id, {
          uploads: (session.user!.uploads || 0) + 1,
          bytesUpload: (session.user!.bytesUpload || 0) + fileData.length
        });

        // Update user_stats table (for ratio calculations)
        await db.query(
          'UPDATE user_stats SET bytes_uploaded = bytes_uploaded + $1, files_uploaded = files_uploaded + 1 WHERE user_id = $2',
          [fileData.length, session.user!.id]
        );

        // Log file upload (express.e:9493 callersLog)
        await callersLog(session.user!.id, session.user!.username, 'Uploaded file', file.filename);

        socket.emit('ansi-output', '\x1b[32mFile uploaded successfully!\x1b[0m\r\n');
        socket.emit('ansi-output', `Added to ${fileArea.name}\r\n`);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
      }).catch((error: any) => {
        console.error('File upload error:', error);
        socket.emit('ansi-output', '\x1b[31mError saving file to database\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
      });
    }
  };

  // Store upload handler for cleanup
  (socket as any).uploadHandler = uploadHandler;
  socket.on('file-upload', uploadHandler);

  socket.emit('ansi-output', '\x1b[32mReady to receive file data...\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to cancel upload...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

export function startFileDownload(socket: any, session: BBSSession, fileArea: any) {
  console.log('startFileDownload called for area:', fileArea.name);

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[36m-= Download Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Download files from our collection.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Download Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Downloaded: ${user.downloads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload || 0}\r\n\r\n`);

  // Display current protocol (WebSocket-based)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Check if user has download access to this area
  if (fileArea.downloadAccess > (session.user?.secLevel || 0)) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have download access to this file area.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Display download message (like DOWNLOADMSG.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mDownload Message:\x1b[0m\r\n');
  socket.emit('ansi-output', 'Please select files to download. Files will be transferred using WebSocket protocol.\r\n\r\n');

  // Display files in the area for selection
  const areaFiles = fileEntries.filter(file => file.areaId === fileArea.id);
  if (areaFiles.length === 0) {
    socket.emit('ansi-output', 'No files available in this area.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', '\x1b[32mAvailable Files:\x1b[0m\r\n\r\n');
  areaFiles.forEach((file, index) => {
    const sizeKB = Math.ceil(file.size / 1024);
    const dateStr = file.uploadDate.toLocaleDateString();
    const description = file.fileIdDiz || file.description;
    socket.emit('ansi-output', `${index + 1}. ${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
    socket.emit('ansi-output', `   ${description}\r\n\r\n`);
  });

  // Prompt for file selection
  socket.emit('ansi-output', '\x1b[32mSelect file to download (1-\x1b[33m' + areaFiles.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { downloadMode: true, fileArea, areaFiles };
}

export function handleFileDownload(socket: any, session: BBSSession, fileIndex: number) {
  const tempData = session.tempData as { fileArea: any, areaFiles: any[] };
  const selectedFile = tempData.areaFiles[fileIndex - 1];

  if (!selectedFile) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid file selection.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file: ${selectedFile.filename}\x1b[0m\r\n`);
  socket.emit('ansi-output', 'Starting WebSocket file transfer...\r\n\r\n');

  // In a real implementation, file data would be read from disk
  // For demo, we'll simulate file transfer with placeholder data
  const fileSize = selectedFile.size;
  const chunkSize = 1024; // 1KB chunks
  const totalChunks = Math.ceil(fileSize / chunkSize);

  socket.emit('ansi-output', `File size: ${fileSize} bytes\r\n`);
  socket.emit('ansi-output', `Transferring in ${totalChunks} chunks...\r\n\r\n`);

  // Send file start
  socket.emit('file-download-start', {
    filename: selectedFile.filename,
    size: fileSize,
    description: selectedFile.description
  });

  // Simulate chunked transfer
  let sentChunks = 0;
  const transferInterval = setInterval(() => {
    if (sentChunks >= totalChunks) {
      clearInterval(transferInterval);
      // Send file end
      socket.emit('file-download-end');
      socket.emit('ansi-output', '\r\n\x1b[32mFile transfer complete!\x1b[0m\r\n');

      // Update download stats
      db.updateFileEntry(selectedFile.id, { downloads: selectedFile.downloads + 1 });
      db.updateUser(session.user!.id, {
        downloads: (session.user!.downloads || 0) + 1,
        bytesDownload: (session.user!.bytesDownload || 0) + fileSize
      });

      // Update user_stats table (for ratio calculations)
      db.query(
        'UPDATE user_stats SET bytes_downloaded = bytes_downloaded + $1, files_downloaded = files_downloaded + 1 WHERE user_id = $2',
        [fileSize, session.user!.id]
      ).catch((error: any) => console.error('Error updating user stats:', error));

      // Log file download (express.e:9493 callersLog)
      callersLog(session.user!.id, session.user!.username, 'Downloaded file', selectedFile.filename);

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Send chunk (placeholder data)
    const chunkData = 'x'.repeat(Math.min(chunkSize, fileSize - (sentChunks * chunkSize)));
    socket.emit('file-download-chunk', {
      chunk: chunkData,
      chunkIndex: sentChunks,
      totalChunks: totalChunks
    });

    sentChunks++;

    // Update progress
    const progress = Math.floor((sentChunks / totalChunks) * 100);
    const progressBar = '[' + '='.repeat(Math.floor(progress / 5)) + ' '.repeat(20 - Math.floor(progress / 5)) + ']';

    // Update progress display
    if (sentChunks === 1) {
      socket.emit('ansi-output', `Progress: ${progressBar} ${progress}%\r\n`);
    } else {
      socket.emit('ansi-output', '\x1b[1A\x1b[K'); // Move up and clear line
      socket.emit('ansi-output', `Progress: ${progressBar} ${progress}%\r\n`);
    }
  }, 100); // Send chunk every 100ms for demo

  // Store interval for cleanup
  (session as any).downloadInterval = transferInterval;
}
