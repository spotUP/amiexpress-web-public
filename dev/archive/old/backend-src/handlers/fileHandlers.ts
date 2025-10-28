/**
 * File Handlers Module
 * Handles all file-related operations including file listing, downloading, uploading, and maintenance
 *
 * This module is a 1:1 port of the file handling functions from the original AmiExpress BBS
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState } from '../bbs/session';
import { fileAreas, fileEntries, conferences } from '../server/dataStore';
import { parseParams } from '../bbs/utils';

/**
 * Display contents of a specific file area
 * Equivalent to displayIt() in AmiExpress
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param area - File area object to display
 */
export function displayFileAreaContents(socket: Socket, session: BBSSession, area: any) {
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

/**
 * Main file listing function
 * Displays file areas and handles directory selection
 * 1:1 with AmiExpress file listing logic
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param params - Command parameters (e.g., "A" for all, "1" for specific area, "NS" for non-stop)
 * @param reverse - If true, display areas in reverse order
 */
export function displayFileList(socket: Socket, session: BBSSession, params: string, reverse: boolean = false) {
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

/**
 * Parse directory selection parameter
 * Handles special cases like 'A' (all), 'U' (upload), 'H' (hold), or numeric directory selection
 * 1:1 with AmiExpress getDirSpan logic
 *
 * @param param - Directory selection parameter
 * @param maxDirs - Maximum number of directories available
 * @returns Object with startDir and dirScan values (-1 if invalid)
 */
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

/**
 * Display interactive directory selection prompt
 * Prompts user to select which directories to view
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param fileAreas - Array of available file areas
 * @param reverse - If true, display will be in reverse order
 * @param nonStop - If true, display without pausing between areas
 */
export function displayDirectorySelectionPrompt(socket: Socket, session: BBSSession, fileAreas: any[], reverse: boolean, nonStop: boolean) {
  socket.emit('ansi-output', '\x1b[36mDirectories: \x1b[32m(1-\x1b[33m' + fileAreas.length + '\x1b[32m) \x1b[36m, \x1b[32m(\x1b[33mA\x1b[32m)\x1b[36mll, \x1b[32m(\x1b[33mU\x1b[32m)\x1b[36mpload, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none? \x1b[0m');
  session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  session.tempData = { fileAreas, reverse, nonStop };
}

/**
 * Display selected file areas based on user selection
 * Iterates through selected directories and displays their contents
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param fileAreas - Array of available file areas
 * @param dirSpan - Object specifying which directories to display (start and end)
 * @param reverse - If true, display areas in reverse order
 * @param nonStop - If true, display without pausing between areas
 */
export function displaySelectedFileAreas(socket: Socket, session: BBSSession, fileAreas: any[], dirSpan: { startDir: number, dirScan: number }, reverse: boolean, nonStop: boolean) {
  let currentDir = reverse ? dirSpan.dirScan : dirSpan.startDir;
  const endDir = reverse ? dirSpan.startDir : dirSpan.dirScan;
  const step = reverse ? -1 : 1;

  // Add safety check to prevent infinite loops
  let iterations = 0;
  const maxIterations = fileAreas.length * 2; // Reasonable upper bound

  while (((reverse && currentDir >= endDir) || (!reverse && currentDir <= endDir)) && iterations < maxIterations) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index

    // Additional bounds checking
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
    iterations++;
  }

  // Log if we hit the safety limit (indicates potential logic error)
  if (iterations >= maxIterations) {
    console.warn('displaySelectedFileAreas: Hit safety limit, possible infinite loop prevented');
  }

  // Finished displaying all areas
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Display file maintenance interface
 * Handles file search, delete, and move operations (FM command)
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param params - Command parameters (D for delete, M for move, S for search)
 */
export function displayFileMaintenance(socket: Socket, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Maintenance =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'File maintenance and search functionality.\r\n\r\n');

  // Parse parameters (like AmiExpress FM command)
  const parsedParams = parseParams(params);
  const operation = parsedParams.length > 0 ? parsedParams[0].toUpperCase() : '';

  if (operation === 'D') {
    // Delete files
    socket.emit('ansi-output', 'Delete files functionality.\r\n');
    socket.emit('ansi-output', 'Enter filename to delete (wildcards supported):\r\n');
    socket.emit('ansi-output', '\r\nNot fully implemented yet.\r\n');
  } else if (operation === 'M') {
    // Move files
    socket.emit('ansi-output', 'Move files functionality.\r\n');
    socket.emit('ansi-output', 'Enter filename to move and destination area:\r\n');
    socket.emit('ansi-output', '\r\nNot fully implemented yet.\r\n');
  } else if (operation === 'S') {
    // Search files
    socket.emit('ansi-output', 'Search files functionality.\r\n');
    socket.emit('ansi-output', 'Enter search pattern:\r\n');
    socket.emit('ansi-output', '\r\nNot fully implemented yet.\r\n');
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

/**
 * Display file statistics for current or all conferences (FS command)
 * Shows upload/download counts and user statistics
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param params - Command parameters (ALL to show all conferences)
 */
export function displayFileStatus(socket: Socket, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Status =-\x1b[0m\r\n');

  // Parse parameters to determine scope (like fileStatus(opt) in AmiExpress)
  const parsedParams = parseParams(params);
  const showAllConferences = parsedParams.length === 0 || parsedParams.includes('ALL');

  socket.emit('ansi-output', '\x1b[32m              Uploads                 Downloads\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail  Ratio\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\x1b[0m\r\n');

  const conferencesToShow = showAllConferences ? conferences : [conferences.find(c => c.id === session.currentConf)!];

  conferencesToShow.forEach(conf => {
    const confFiles = fileEntries.filter(f => {
      const area = fileAreas.find(a => a.id === f.areaId);
      return area && area.conferenceId === conf.id;
    });

    const uploads = confFiles.length;
    const uploadBytes = confFiles.reduce((sum, f) => sum + f.size, 0);
    const downloads = confFiles.reduce((sum, f) => sum + f.downloads, 0);
    const downloadBytes = uploadBytes; // Simplified
    const bytesAvail = 1000000; // Mock available bytes
    const ratio = '1:1'; // Mock ratio

    const displayNum = showAllConferences ? conf.id : 1; // Relative numbering
    const highlight = conf.id === session.currentConf ? '\x1b[33m' : '\x1b[36m';

    socket.emit('ansi-output', `${highlight}    ${displayNum.toString().padStart(4)}  ${uploads.toString().padStart(7)}  ${Math.ceil(uploadBytes/1024).toString().padStart(14)} ${downloads.toString().padStart(7)}  ${Math.ceil(downloadBytes/1024).toString().padStart(14)}   ${bytesAvail.toString().padStart(9)}  ${ratio}\x1b[0m\r\n`);
  });

  // Display user-specific file statistics (like AmiExpress user file stats)
  const user = session.user!;
  socket.emit('ansi-output', '\r\n\x1b[32mYour File Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${user.uploads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload || 0}\r\n`);
  socket.emit('ansi-output', `Files Downloaded: ${user.downloads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload || 0}\r\n`);

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Display new files since user's last login (N command)
 * 1:1 implementation of myNewFiles from AmiExpress
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param params - Command parameters (date or directory selection)
 */
export function displayNewFiles(socket: Socket, session: BBSSession, params: string) {
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

/**
 * Scan directories for new files
 * Displays files uploaded after the specified date
 * 1:1 with AmiExpress myNewFiles scanning logic
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param searchDate - Date to search from (files newer than this)
 * @param dirSpan - Directory range to scan
 * @param nonStop - If true, display without pausing between areas
 */
export function displayNewFilesInDirectories(socket: Socket, session: BBSSession, searchDate: Date, dirSpan: { startDir: number, dirScan: number }, nonStop: boolean) {
  let currentDir = dirSpan.startDir;
  const endDir = dirSpan.dirScan;
  const step = 1; // Always forward for new files

  let foundNewFiles = false;

  // Add safety check to prevent infinite loops
  let iterations = 0;
  const maxIterations = fileAreas.length * 2; // Reasonable upper bound

  while (currentDir <= endDir && iterations < maxIterations) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index

    // Additional bounds checking
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
    iterations++;
  }

  // Log if we hit the safety limit (indicates potential logic error)
  if (iterations >= maxIterations) {
    console.warn('displayNewFilesInDirectories: Hit safety limit, possible infinite loop prevented');
  }

  if (!foundNewFiles) {
    socket.emit('ansi-output', 'No new files found since the specified date.\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Check if a DIR line represents a new file
 * Parses DIR line format and compares date
 * Approximated from AmiExpress logic
 *
 * @param dirLine - DIR file line to parse
 * @param searchDate - Date to compare against
 * @returns true if file is newer than searchDate
 */
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

/**
 * Display upload interface
 * Shows upload statistics and prompts for file area selection
 * Equivalent to uploadaFile in AmiExpress
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param params - Command parameters
 */
export function displayUploadInterface(socket: Socket, session: BBSSession, params: string) {
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

/**
 * Display download interface
 * Shows download statistics and prompts for file area selection
 * Equivalent to downloadFile in AmiExpress
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param params - Command parameters
 */
export function displayDownloadInterface(socket: Socket, session: BBSSession, params: string) {
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

/**
 * Start file upload process
 * Handles WebSocket-based file upload with chunking support
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param fileArea - File area to upload to
 */
export function startFileUpload(socket: Socket, session: BBSSession, fileArea: any) {
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

  // Display file areas for upload
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

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

  // Display current protocol (simplified)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Prompt for file selection (WebSocket-based upload)
  socket.emit('ansi-output', '\x1b[32mSelect files to upload (WebSocket-based):\x1b[0m\r\n');
  socket.emit('ansi-output', 'Upload functionality will be implemented with WebSocket chunking.\r\n');
  socket.emit('ansi-output', 'This will support resumable uploads and progress tracking.\r\n\r\n');

  // For now, show placeholder message
  socket.emit('ansi-output', '\x1b[33mUpload system under development...\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

/**
 * Start file download process
 * Handles WebSocket-based file download with chunking support
 *
 * @param socket - Socket.io socket instance
 * @param session - Current BBS session
 * @param fileArea - File area to download from
 */
export function startFileDownload(socket: Socket, session: BBSSession, fileArea: any) {
  console.log('startFileDownload called for area:', fileArea.name);

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n`);
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
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

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
