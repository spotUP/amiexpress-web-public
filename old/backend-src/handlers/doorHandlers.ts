/**
 * Door Handler Functions
 * Extracted from index.ts - handles door menu, door manager, and door execution
 */

import { Socket } from 'socket.io';
import { BBSSession, LoggedOnSubState } from '../bbs/session';
import { Door, DoorSession } from '../types';
import { doors, doorSessions } from '../server/dataStore';
import { displayMainMenu } from '../bbs/menu';
import { getAmigaDoorManager } from '../doors/amigaDoorManager';

/**
 * Display door games menu (DOORS command)
 * Shows available doors for current user based on security level and conference
 */
export function displayDoorMenu(socket: Socket, session: BBSSession, params: string) {
  console.log('=== DOORS COMMAND DEBUG ===');
  console.log('Total doors loaded:', doors.length);
  console.log('Current conference:', session.currentConf);
  console.log('User security level:', session.user?.secLevel);
  console.log('All doors:', doors.map(d => ({ id: d.id, name: d.name, enabled: d.enabled, accessLevel: d.accessLevel, conferenceId: d.conferenceId })));

  socket.emit('ansi-output', '\x1b[36m-= Door Games & Utilities =-\x1b[0m\r\n');

  // Get available doors for current user
  const availableDoors = doors.filter(door => {
    const enabledCheck = door.enabled;
    const conferenceCheck = !door.conferenceId || door.conferenceId === session.currentConf;
    const accessCheck = (session.user?.secLevel || 0) >= door.accessLevel;

    console.log(`Door ${door.id}: enabled=${enabledCheck}, conference=${conferenceCheck}, access=${accessCheck}`);

    return enabledCheck && conferenceCheck && accessCheck;
  });

  console.log('Available doors after filtering:', availableDoors.length);

  if (availableDoors.length === 0) {
    socket.emit('ansi-output', 'No doors are currently available.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  socket.emit('ansi-output', 'Available doors:\r\n\r\n');

  availableDoors.forEach((door, index) => {
    socket.emit('ansi-output', `${index + 1}. ${door.name}\r\n`);
    socket.emit('ansi-output', `   ${door.description}\r\n`);
    socket.emit('ansi-output', `   Access Level: ${door.accessLevel}\r\n\r\n`);
  });

  socket.emit('ansi-output', '\x1b[32mSelect door (1-\x1b[33m' + availableDoors.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT; // Reuse for door selection
  session.tempData = { doorMode: true, availableDoors };
}

/**
 * README viewer for Door Manager
 * Displays documentation with scrolling support
 */
export function displayReadme(socket: Socket, session: BBSSession, door: any): void {
  const lines = door.readme.split('\n');
  const maxLines = 20;
  const offset = session.tempData.readmeOffset || 0;

  // Clear screen
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Header
  socket.emit('ansi-output', `\x1b[0;36m-= ${door.name} - README =-\x1b[0m\r\n`);
  socket.emit('ansi-output', '-'.repeat(80) + '\r\n');

  // Display content
  const visibleLines = lines.slice(offset, offset + maxLines);
  for (const line of visibleLines) {
    socket.emit('ansi-output', line + '\r\n');
  }

  // Scroll indicator
  if (offset + maxLines < lines.length || offset > 0) {
    socket.emit('ansi-output', `\r\n\x1b[90m[Line ${offset + 1}-${offset + visibleLines.length} of ${lines.length}]\x1b[0m\r\n`);
  }

  // Footer
  socket.emit('ansi-output', '\r\n' + '-'.repeat(80) + '\r\n');
  const nav: string[] = [];

  if (offset > 0) {
    nav.push('\x1b[33m[UP]\x1b[0m Scroll Up');
  }
  if (offset + maxLines < lines.length) {
    nav.push('\x1b[33m[DN]\x1b[0m Scroll Down');
  }
  nav.push('\x1b[33m[B]\x1b[0m Back');
  nav.push('\x1b[33m[Q]\x1b[0m Quit');

  socket.emit('ansi-output', nav.join('  ') + '\r\n');
}

/**
 * Handle README viewer input
 * Processes navigation commands for README viewer
 */
export function handleReadmeInput(socket: Socket, session: BBSSession, door: any, data: string): void {
  const key = data.trim();
  const lines = door.readme.split('\n');
  const maxLines = 20;

  // Arrow up / UP
  if (key === '\x1b[A' || key.toUpperCase() === 'UP') {
    if (session.tempData.readmeOffset > 0) {
      session.tempData.readmeOffset = Math.max(0, session.tempData.readmeOffset - 1);
      displayReadme(socket, session, door);
    }
    return;
  }

  // Arrow down / DN
  if (key === '\x1b[B' || key.toUpperCase() === 'DN' || key.toUpperCase() === 'DOWN') {
    if (session.tempData.readmeOffset + maxLines < lines.length) {
      session.tempData.readmeOffset++;
      displayReadme(socket, session, door);
    }
    return;
  }

  // Page up
  if (key === '\x1b[5~' || key.toUpperCase() === 'PGUP') {
    session.tempData.readmeOffset = Math.max(0, session.tempData.readmeOffset - maxLines);
    displayReadme(socket, session, door);
    return;
  }

  // Page down
  if (key === '\x1b[6~' || key.toUpperCase() === 'PGDN') {
    if (session.tempData.readmeOffset + maxLines < lines.length) {
      session.tempData.readmeOffset = Math.min(lines.length - maxLines, session.tempData.readmeOffset + maxLines);
      displayReadme(socket, session, door);
    }
    return;
  }

  // Back
  if (key.toUpperCase() === 'B') {
    delete session.tempData.readmeOffset;
    session.tempData.doorManagerMode = 'info';
    displayDoorManagerInfo(socket, session);
    return;
  }

  // Quit
  if (key.toUpperCase() === 'Q') {
    delete session.tempData.readmeOffset;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    displayMainMenu(socket, session);
    return;
  }
}

/**
 * Door Manager - Sysop function to manage installed doors
 * Scans for installed doors and archives, displays management interface
 */
export async function displayDoorManager(socket: Socket, session: BBSSession) {
  const AdmZip = require('adm-zip');
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const { execSync } = require('child_process');

  const archivesPath = path.join(__dirname, '../../doors/archives');

  // Helper function to list LHA archive contents
  const listLhaContents = (archivePath: string): string[] => {
    try {
      const output = execSync(`lha -l "${archivePath}"`, { encoding: 'utf8' });
      const lines = output.split('\n');
      const files: string[] = [];

      // Parse lha output format: [type] spaces uid/gid spaces size ratio date name
      // Example: [generic]  *****/*****      49 100.0% Sep 27  1994 BBS/Commands/BBS.CMD
      for (const line of lines) {
        // Match lines starting with [type]
        if (line.match(/^\[[\w-]+\]/)) {
          // Extract filename (everything after the date)
          const parts = line.split(/\s+/);
          // Format: [type] uid/gid size ratio month day year filename...
          // Parts: 0:[type] 1:uid/gid 2:size 3:ratio 4:month 5:day 6:year 7+:filename
          if (parts.length >= 8) {
            // Filename is everything from index 7 onwards (joined with spaces)
            const filename = parts.slice(7).join(' ');
            files.push(filename);
          }
        }
      }
      return files;
    } catch (error) {
      console.error('Error listing LHA contents:', error);
      return [];
    }
  };

  // Helper function to extract file from LHA archive
  const extractFromLha = (archivePath: string, filename: string): string | null => {
    try {
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Extract to temp directory
      execSync(`lha e "${archivePath}" "${filename}"`, { cwd: tempDir, encoding: 'utf8' });

      // Read the extracted file
      const extractedPath = path.join(tempDir, path.basename(filename));
      if (fs.existsSync(extractedPath)) {
        const content = fs.readFileSync(extractedPath, 'utf8');
        // Clean up
        fs.unlinkSync(extractedPath);
        return content;
      }
      return null;
    } catch (error) {
      console.error('Error extracting from LHA:', error);
      return null;
    }
  };

  // Helper function to filter out system files
  const isSystemFile = (filename: string): boolean => {
    const systemFiles = [
      '.DS_Store',
      '.localized',
      'Thumbs.db',
      'desktop.ini',
      '.gitkeep',
      '.gitignore',
      '__MACOSX'
    ];
    return systemFiles.includes(filename) || filename.startsWith('._');
  };

  // Ensure archives directory exists
  if (!fs.existsSync(archivesPath)) {
    fs.mkdirSync(archivesPath, { recursive: true });
  }

  // Scan for installed doors using AmigaDoorManager
  const doorList: any[] = [];
  const doorManager = getAmigaDoorManager();

  try {
    // Scan Amiga doors
    const installedDoors = await doorManager.scanInstalledDoors();
    console.log(`Found ${installedDoors.length} installed Amiga doors from .info files`);

    // Convert AmigaDoorInfo to display format
    for (const door of installedDoors) {
      doorList.push({
        id: crypto.createHash('md5').update(door.command).digest('hex'),
        name: door.doorName || door.command,
        command: door.command,
        filename: door.command + '.info',
        type: door.type.toLowerCase(),
        location: door.location,
        resolvedPath: door.resolvedPath,
        access: door.access,
        stack: door.stack,
        priority: door.priority,
        multinode: door.multinode,
        displayName: door.name,
        size: 0, // Will be populated from actual file if exists
        uploadDate: new Date(),
        installed: door.installed,
        isAmigaDoor: true
      });
    }

    // Scan TypeScript doors
    const typeScriptDoors = await doorManager.scanTypeScriptDoors();
    console.log(`Found ${typeScriptDoors.length} installed TypeScript doors`);

    for (const door of typeScriptDoors) {
      doorList.push({
        id: crypto.createHash('md5').update(door.name).digest('hex'),
        name: door.name,
        displayName: door.displayName,
        description: door.description,
        version: door.version,
        author: door.author,
        filename: door.main,
        type: 'typescript',
        path: door.path,
        access: door.accessLevel,
        size: 0,
        uploadDate: new Date(),
        installed: door.installed,
        isTypeScriptDoor: true
      });
    }
  } catch (error) {
    console.error('Error scanning installed doors:', error);
  }

  // Scan archives directory
  if (fs.existsSync(archivesPath)) {
    const archives = fs.readdirSync(archivesPath).filter((f: string) => !isSystemFile(f));

    for (const archive of archives) {
      const fullPath = path.join(archivesPath, archive);
      try {
        const stats = fs.statSync(fullPath);
        const ext = path.extname(archive).toLowerCase();
        const isZip = ext === '.zip';
        const isLha = ext === '.lha' || ext === '.lzh';
        const isLzx = ext === '.lzx';

        if (stats.isFile() && (isZip || isLha || isLzx)) {
          const doorInfo: any = {
            id: crypto.createHash('md5').update(archive).digest('hex'),
            name: path.basename(archive, ext),
            filename: archive,
            type: 'archive',
            size: stats.size,
            uploadDate: stats.mtime,
            installed: false,
            archivePath: fullPath,
            format: isZip ? 'ZIP' : isLha ? 'LHA' : 'LZX'
          };

          // Extract metadata from archive
          try {
            let fileList: string[] = [];

            // Get file list based on archive type
            if (isZip) {
              const zip = new AdmZip(fullPath);
              const zipEntries = zip.getEntries();
              fileList = zipEntries.map((e: any) => e.entryName);
            } else if (isLha) {
              fileList = listLhaContents(fullPath);
            } else if (isLzx) {
              // Use AmigaDoorManager for LZX
              const doorManager = getAmigaDoorManager();
              const analysis = doorManager.analyzeDoorArchive(fullPath);
              if (analysis) {
                fileList = analysis.files;
              }
            }

            // Look for FILE_ID.DIZ
            const dizFile = fileList.find((f: string) =>
              f.toLowerCase() === 'file_id.diz' ||
              f.toLowerCase().endsWith('/file_id.diz')
            );
            if (dizFile) {
              let dizContent: string | null = null;
              if (isZip) {
                const zip = new AdmZip(fullPath);
                const dizEntry = zip.getEntry(dizFile);
                if (dizEntry) {
                  dizContent = dizEntry.getData().toString('utf8');
                }
              } else if (isLha) {
                dizContent = extractFromLha(fullPath, dizFile);
              }

              if (dizContent) {
                doorInfo.fileidDiz = dizContent;

                // Parse DIZ for metadata
                const lines = dizContent.split('\n').map((l: string) => l.trim()).filter((l: string) => l);
                if (lines.length > 0) {
                  doorInfo.description = lines[0];
                }

                // Extract author
                const authorMatch = dizContent.match(/(?:by|author|coded by|written by)[:\s]+([^\n]+)/i);
                if (authorMatch) {
                  doorInfo.author = authorMatch[1].trim();
                }

                // Extract version
                const versionMatch = dizContent.match(/v(?:ersion)?[:\s]*([\d.]+)/i);
                if (versionMatch) {
                  doorInfo.version = versionMatch[1];
                }
              }
            }

            // Look for README
            const readmeFile = fileList.find((f: string) =>
              /readme/i.test(f) && /\.(txt|md|doc)$/i.test(f)
            );
            if (readmeFile) {
              let readmeContent: string | null = null;
              if (isZip) {
                const zip = new AdmZip(fullPath);
                const readmeEntry = zip.getEntry(readmeFile);
                if (readmeEntry) {
                  readmeContent = readmeEntry.getData().toString('utf8');
                }
              } else if (isLha) {
                readmeContent = extractFromLha(fullPath, readmeFile);
              }
              if (readmeContent) {
                doorInfo.readme = readmeContent;
              }
            }

            // Look for AmigaGuide documentation
            const guideFile = fileList.find((f: string) =>
              f.toLowerCase().endsWith('.guide')
            );
            if (guideFile) {
              let guideContent: string | null = null;
              if (isZip) {
                const zip = new AdmZip(fullPath);
                const guideEntry = zip.getEntry(guideFile);
                if (guideEntry) {
                  guideContent = guideEntry.getData().toString('utf8');
                }
              } else if (isLha) {
                guideContent = extractFromLha(fullPath, guideFile);
              }
              if (guideContent) {
                doorInfo.guide = guideContent;
                doorInfo.guideName = path.basename(guideFile);
              }
            }

            // Look for executable (including .XIM for Amiga executables)
            const exeFile = fileList.find((f: string) =>
              f.endsWith('.exe') ||
              f.endsWith('.xim') ||
              f.endsWith('.XIM') ||
              f.endsWith('.ts') ||
              f.endsWith('.js') ||
              (!path.extname(f) && f.includes('/'))
            );
            if (exeFile) {
              doorInfo.executable = exeFile;
            }

            // Look for libraries (.library files)
            const libraryFiles = fileList.filter((f: string) =>
              f.toLowerCase().endsWith('.library')
            );
            if (libraryFiles.length > 0) {
              doorInfo.libraries = libraryFiles;
            }
          } catch (zipError) {
            // Skip if can't read archive
          }

          doorList.push(doorInfo);
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  // Sort by name
  doorList.sort((a, b) => a.name.localeCompare(b.name));

  // Store in session for navigation
  session.tempData = {
    doorManagerMode: 'list',
    doorList,
    selectedIndex: 0,
    scrollOffset: 0
  };

  // Display the list
  displayDoorManagerList(socket, session);
}

/**
 * Display Door Manager list
 * Shows installed doors and archives with navigation
 */
export function displayDoorManagerList(socket: Socket, session: BBSSession) {
  const { doorList, selectedIndex, scrollOffset } = session.tempData;

  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

  // Header (Amiga style)
  socket.emit('ansi-output', '\r\n\x1b[0;36m-= DOOR MANAGER =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');

  if (doorList.length === 0) {
    socket.emit('ansi-output', '\x1b[33mNo doors installed.\x1b[0m\r\n\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[36mInstalled Doors:\x1b[0m\r\n\r\n');

    // Calculate visible range (15 doors per page)
    const pageSize = 15;
    const start = scrollOffset || 0;
    const end = Math.min(start + pageSize, doorList.length);

    for (let i = start; i < end; i++) {
      const door = doorList[i];
      const isSelected = i === selectedIndex;

      // Format line
      const status = door.installed ? '\x1b[32m[*]\x1b[0m' : '\x1b[31m[ ]\x1b[0m';

      // Type indicator
      let type = 'ARC';
      if (door.isAmigaDoor) {
        type = door.type.toUpperCase().substring(0, 4).padEnd(4);
      } else if (door.type === 'typescript') {
        type = 'TS  ';
      } else if (door.type === 'archive') {
        type = door.format || 'ARC ';
      }

      const name = (door.displayName || door.name).substring(0, 35).padEnd(35);

      // Info column - show access level for Amiga doors, size for archives
      let info = '';
      if (door.isAmigaDoor) {
        info = `LVL:${door.access.toString().padStart(3)} ${door.command}`;
      } else {
        const sizeKB = door.size < 1024 ? door.size + 'B' :
                       door.size < 1024 * 1024 ? Math.round(door.size / 1024) + 'KB' :
                       Math.round(door.size / (1024 * 1024) * 10) / 10 + 'MB';
        info = sizeKB.padStart(8);
      }

      if (isSelected) {
        // Blue background for selected
        socket.emit('ansi-output', `\x1b[0;37;44m ${status} [${type}] ${name} ${info} \x1b[0m\r\n`);
      } else {
        socket.emit('ansi-output', ` ${status} \x1b[33m[${type}]\x1b[0m ${name} \x1b[36m${info}\x1b[0m\r\n`);
      }
    }

    // Show page indicator
    if (doorList.length > pageSize) {
      const currentPage = Math.floor(selectedIndex / pageSize) + 1;
      const totalPages = Math.ceil(doorList.length / pageSize);
      socket.emit('ansi-output', `\r\n\x1b[90mPage ${currentPage}/${totalPages}\x1b[0m\r\n`);
    }
  }

  // Footer with commands (Amiga style)
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[0;37m' + '-'.repeat(80) + '\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m[UP/DN]\x1b[0m Navigate  ');
  socket.emit('ansi-output', '\x1b[33m[ENTER]\x1b[0m Info  ');
  socket.emit('ansi-output', '\x1b[33m[U]\x1b[0m Upload  ');
  socket.emit('ansi-output', '\x1b[33m[Q]\x1b[0m Quit\r\n');

  // Set up input handler
  session.subState = LoggedOnSubState.DOOR_MANAGER;
}

/**
 * Display Door Manager info page
 * Shows detailed information about selected door
 */
export function displayDoorManagerInfo(socket: Socket, session: BBSSession) {
  const { doorList, selectedIndex } = session.tempData;
  const door = doorList[selectedIndex];

  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

  // Header (Amiga style)
  socket.emit('ansi-output', '\r\n\x1b[0;36m-= DOOR INFORMATION =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');

  // Basic info
  socket.emit('ansi-output', `\x1b[0;36mName:\x1b[0m ${door.displayName || door.name}\r\n`);
  socket.emit('ansi-output', `\x1b[0;36mFile:\x1b[0m ${door.filename}\r\n`);
  socket.emit('ansi-output', `\x1b[0;36mType:\x1b[0m ${door.type.toUpperCase()}\r\n`);

  // Show Amiga door-specific metadata from .info file
  if (door.isAmigaDoor) {
    socket.emit('ansi-output', `\x1b[0;36mCommand:\x1b[0m ${door.command}\r\n`);
    socket.emit('ansi-output', `\x1b[0;36mLocation:\x1b[0m ${door.location}\r\n`);
    if (door.resolvedPath) {
      socket.emit('ansi-output', `\x1b[0;36mResolved Path:\x1b[0m ${door.resolvedPath}\r\n`);
    }
    socket.emit('ansi-output', `\x1b[0;36mAccess Level:\x1b[0m ${door.access}\r\n`);
    if (door.stack) {
      socket.emit('ansi-output', `\x1b[0;36mStack Size:\x1b[0m ${door.stack} bytes\r\n`);
    }
    if (door.priority) {
      socket.emit('ansi-output', `\x1b[0;36mPriority:\x1b[0m ${door.priority}\r\n`);
    }
    if (door.multinode !== undefined) {
      socket.emit('ansi-output', `\x1b[0;36mMultinode:\x1b[0m ${door.multinode ? 'YES' : 'NO'}\r\n`);
    }
  } else if (door.isTypeScriptDoor) {
    // TypeScript door-specific metadata
    if (door.description) {
      socket.emit('ansi-output', `\x1b[0;36mDescription:\x1b[0m ${door.description}\r\n`);
    }
    if (door.version) {
      socket.emit('ansi-output', `\x1b[0;36mVersion:\x1b[0m ${door.version}\r\n`);
    }
    if (door.author) {
      socket.emit('ansi-output', `\x1b[0;36mAuthor:\x1b[0m ${door.author}\r\n`);
    }
    if (door.path) {
      socket.emit('ansi-output', `\x1b[0;36mPath:\x1b[0m ${door.path}\r\n`);
    }
    socket.emit('ansi-output', `\x1b[0;36mAccess Level:\x1b[0m ${door.access || 0}\r\n`);
  } else {
    // Archive/legacy door info
    const sizeStr = door.size < 1024 ? door.size + ' B' :
                    door.size < 1024 * 1024 ? Math.round(door.size / 1024) + ' KB' :
                    Math.round(door.size / (1024 * 1024) * 10) / 10 + ' MB';
    socket.emit('ansi-output', `\x1b[0;36mSize:\x1b[0m ${sizeStr}\r\n`);
    socket.emit('ansi-output', `\x1b[0;36mDate:\x1b[0m ${door.uploadDate.toLocaleDateString()}\r\n`);
  }

  socket.emit('ansi-output', `\x1b[0;36mStatus:\x1b[0m ${door.installed ? '\x1b[32mInstalled\x1b[0m' : '\x1b[31mNot Installed\x1b[0m'}\r\n`);

  if (door.author) {
    socket.emit('ansi-output', `\x1b[0;36mAuthor:\x1b[0m ${door.author}\r\n`);
  }
  if (door.version) {
    socket.emit('ansi-output', `\x1b[0;36mVersion:\x1b[0m ${door.version}\r\n`);
  }
  if (door.executable) {
    socket.emit('ansi-output', `\x1b[0;36mExecutable:\x1b[0m ${door.executable}\r\n`);
  }
  if (door.libraries && door.libraries.length > 0) {
    socket.emit('ansi-output', `\x1b[0;36mLibraries:\x1b[0m ${door.libraries.length} found\r\n`);
    door.libraries.forEach((lib: string) => {
      socket.emit('ansi-output', `  \x1b[90m- ${lib}\x1b[0m\r\n`);
    });
  }

  // FILE_ID.DIZ
  if (door.fileidDiz) {
    socket.emit('ansi-output', '\r\n\x1b[0;33m--- FILE_ID.DIZ ---\x1b[0m\r\n');
    const dizLines = door.fileidDiz.split('\n').slice(0, 10);
    dizLines.forEach((line: string) => {
      socket.emit('ansi-output', `\x1b[37m${line}\x1b[0m\r\n`);
    });
    if (door.fileidDiz.split('\n').length > 10) {
      socket.emit('ansi-output', '\x1b[90m... (truncated)\x1b[0m\r\n');
    }
  }

  // Description
  if (door.description) {
    socket.emit('ansi-output', '\r\n\x1b[0;36mDescription:\x1b[0m\r\n');
    socket.emit('ansi-output', `\x1b[37m${door.description}\x1b[0m\r\n`);
  }

  // Footer with commands (Amiga style)
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[0;37m' + '-'.repeat(80) + '\x1b[0m\r\n');

  if (door.installed) {
    socket.emit('ansi-output', '\x1b[33m[U]\x1b[0m Uninstall  ');
  } else if (door.type === 'archive') {
    socket.emit('ansi-output', '\x1b[33m[I]\x1b[0m Install  ');
  }

  if (door.readme || door.guide) {
    socket.emit('ansi-output', '\x1b[33m[D]\x1b[0m Documentation');
    if (door.readme && door.guide) {
      socket.emit('ansi-output', ' (README+Guide)');
    } else if (door.guide) {
      socket.emit('ansi-output', ' (AmigaGuide)');
    }
    socket.emit('ansi-output', '  ');
  }

  socket.emit('ansi-output', '\x1b[33m[B]\x1b[0m Back  ');
  socket.emit('ansi-output', '\x1b[33m[Q]\x1b[0m Quit\r\n');

  session.tempData.doorManagerMode = 'info';
}

/**
 * Execute door game/utility
 * Creates door session and routes to appropriate executor
 */
export function executeDoor(socket: Socket, session: BBSSession, door: Door) {
  console.log('Executing door:', door.name);

  // Create door session
  const doorSession: DoorSession = {
    doorId: door.id,
    userId: session.user!.id,
    startTime: new Date(),
    status: 'running'
  };
  doorSessions.push(doorSession);

  socket.emit('ansi-output', `\r\n\x1b[32mStarting ${door.name}...\x1b[0m\r\n`);

  // Execute based on door type
  switch (door.type) {
    case 'web':
      executeWebDoor(socket, session, door, doorSession);
      break;
    case 'native':
      socket.emit('ansi-output', 'Native door execution not implemented yet.\r\n');
      break;
    case 'script':
      socket.emit('ansi-output', 'Script door execution not implemented yet.\r\n');
      break;
    default:
      socket.emit('ansi-output', 'Unknown door type.\r\n');
  }

  // Mark session as completed
  doorSession.endTime = new Date();
  doorSession.status = 'completed';
}

/**
 * Execute web-compatible door (ported AmiExpress doors)
 * Routes to specific door implementation
 */
export function executeWebDoor(socket: Socket, session: BBSSession, door: Door, doorSession: DoorSession) {
  switch (door.id) {
    case 'sal':
      executeSAmiLogDoor(socket, session, door, doorSession);
      break;
    case 'checkup':
      executeCheckUPDoor(socket, session, door, doorSession);
      break;
    default:
      socket.emit('ansi-output', 'Door implementation not found.\r\n');
  }
}

/**
 * Execute SAmiLog callers log viewer door
 * Displays recent caller activity
 */
export function executeSAmiLogDoor(socket: Socket, session: BBSSession, door: Door, doorSession: DoorSession) {
  socket.emit('ansi-output', '\x1b[36m-= Super AmiLog v3.00 =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Advanced Callers Log Viewer\r\n\r\n');

  // Simulate callers log display (would read from BBS:NODE{x}/CALLERSLOG)
  socket.emit('ansi-output', 'Recent callers:\r\n\r\n');

  // Mock some caller entries
  const mockCallers = [
    { user: 'ByteMaster', action: 'Logged off', time: '22:15:30' },
    { user: 'AmigaFan', action: 'Downloaded file', time: '22:10:15' },
    { user: 'RetroUser', action: 'Posted message', time: '22:05:42' },
    { user: 'NewUser', action: 'Logged on', time: '21:58:12' }
  ];

  mockCallers.forEach(caller => {
    socket.emit('ansi-output', `${caller.time} ${caller.user.padEnd(15)} ${caller.action}\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to exit SAmiLog...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute CheckUP file checking utility
 * Scans and processes upload directory
 */
export function executeCheckUPDoor(socket: Socket, session: BBSSession, door: Door, doorSession: DoorSession) {
  socket.emit('ansi-output', '\x1b[36m-= CheckUP v0.4 =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'File checking utility for upload directories\r\n\r\n');

  // Check upload directory for files
  socket.emit('ansi-output', 'Checking upload directory...\r\n');

  // Simulate checking upload directory
  const hasFiles = Math.random() > 0.5; // Random for demo

  if (hasFiles) {
    socket.emit('ansi-output', 'Files found in upload directory!\r\n');
    socket.emit('ansi-output', 'Processing uploads...\r\n');
    socket.emit('ansi-output', '- File1.lha: Archive OK\r\n');
    socket.emit('ansi-output', '- File2.zip: Archive OK\r\n');
    socket.emit('ansi-output', 'Moving files to download area...\r\n');
  } else {
    socket.emit('ansi-output', 'No files found in upload directory.\r\n');
    socket.emit('ansi-output', 'Running cleanup scripts...\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mCheckUP completed. Press any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}
