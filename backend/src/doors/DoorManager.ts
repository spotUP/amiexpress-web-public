/**
 * Door Manager - TypeScript Door for AmiExpress-Web
 *
 * Manages installed doors with features:
 * - List all installed doors
 * - Upload new doors
 * - Navigate with arrow keys
 * - View door information (FILE_ID.DIZ, README, etc.)
 * - Install/Uninstall doors
 * - View documentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Socket } from 'socket.io';
import AdmZip from 'adm-zip';
import { getAmigaDoorManager, DoorArchive } from './amigaDoorManager';

interface DoorInfo {
  id: string;
  name: string;
  filename: string;
  type: 'typescript' | 'amiga' | 'archive';
  size: number;
  uploadDate: Date;
  installed: boolean;
  archivePath?: string;
  executable?: string;
  fileidDiz?: string;
  readme?: string;
  nfo?: string;
  author?: string;
  version?: string;
  description?: string;
}

interface ArchiveFileEntry {
  name: string;           // File/directory name
  fullPath: string;       // Full path in archive
  isDirectory: boolean;
  size: number;
  extension: string;
}

interface DoorManagerState {
  mode: 'list' | 'info' | 'upload' | 'docs' | 'browse-archive' | 'view-file';
  selectedIndex: number;
  doors: DoorInfo[];
  currentDoor?: DoorInfo;
  uploadBuffer?: Buffer;
  uploadFilename?: string;
  docsContent?: string;
  scrollOffset: number;
  // Archive browser state
  archiveFiles?: ArchiveFileEntry[];
  currentPath?: string;          // Current directory path in archive
  selectedFileIndex?: number;
  viewingFile?: {
    name: string;
    content: string;
    type: 'text' | 'amigaguide';
  };
}

export class DoorManager {
  private socket: Socket;
  private session: any;
  private state: DoorManagerState;
  private doorsPath: string;
  private archivesPath: string;
  private inputHandler?: (data: string) => void;

  constructor(socket: Socket, session?: any) {
    this.socket = socket;
    this.session = session;
    this.doorsPath = path.join(__dirname, '../../doors');
    this.archivesPath = path.join(__dirname, '../../doors/archives');

    // Ensure directories exist
    if (!fs.existsSync(this.archivesPath)) {
      fs.mkdirSync(this.archivesPath, { recursive: true });
    }

    this.state = {
      mode: 'list',
      selectedIndex: 0,
      doors: [],
      scrollOffset: 0
    };

    // Set session flag to prevent main command handler from interfering
    if (this.session) {
      this.session.inDoorManager = true;
    }
  }

  /**
   * Main entry point - Start the Door Manager
   */
  async start(): Promise<void> {
    try {
      console.log('[Door Manager] start() called, clearing screen...');
      this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

      console.log('[Door Manager] Scanning doors...');
      await this.scanDoors();
      console.log('[Door Manager] Found', this.state.doors.length, 'doors');

      console.log('[Door Manager] Showing list...');
      this.showList();

      console.log('[Door Manager] Setting up input handlers...');
      this.setupInputHandlers();
      console.log('[Door Manager] Input handlers setup complete');

      console.log('[Door Manager] Current state:', {
        mode: this.state.mode,
        inDoorManager: this.session?.inDoorManager,
        hasInputHandler: !!this.inputHandler
      });
    } catch (error) {
      console.error('[Door Manager] Error starting:', error);
      this.socket.emit('ansi-output', '\r\n\x1b[31mError starting Door Manager:\x1b[0m\r\n');
      this.socket.emit('ansi-output', `${(error as Error).message}\r\n\r\n`);
      this.socket.emit('ansi-output', `${(error as Error).stack}\r\n\r\n`);
      this.socket.emit('ansi-output', 'Press any key to return to main menu...\r\n');

      // Wait for keypress then exit
      const exitHandler = () => {
        this.socket.off('command', exitHandler);
        this.cleanup();
        this.socket.emit('door-exit');
      };
      this.socket.once('command', exitHandler);
    }
  }

  /**
   * Scan for installed doors
   */
  private async scanDoors(): Promise<void> {
    const doors: DoorInfo[] = [];

    // Scan doors directory for executables
    if (fs.existsSync(this.doorsPath)) {
      const files = fs.readdirSync(this.doorsPath);

      for (const file of files) {
        const fullPath = path.join(this.doorsPath, file);
        const stats = fs.statSync(fullPath);

        if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();

          // TypeScript doors
          if (ext === '.ts' || ext === '.js') {
            doors.push({
              id: crypto.createHash('md5').update(file).digest('hex'),
              name: path.basename(file, ext),
              filename: file,
              type: 'typescript',
              size: stats.size,
              uploadDate: stats.mtime,
              installed: true
            });
          }
          // Amiga executables
          else if (ext === '' || ext === '.exe') {
            doors.push({
              id: crypto.createHash('md5').update(file).digest('hex'),
              name: path.basename(file, ext),
              filename: file,
              type: 'amiga',
              size: stats.size,
              uploadDate: stats.mtime,
              installed: true
            });
          }
        }
      }
    }

    // Scan archives directory
    if (fs.existsSync(this.archivesPath)) {
      const archives = fs.readdirSync(this.archivesPath);

      for (const archive of archives) {
        const fullPath = path.join(this.archivesPath, archive);
        const stats = fs.statSync(fullPath);
        const lowerArchive = archive.toLowerCase();
        const isArchive = lowerArchive.endsWith('.zip') ||
                         lowerArchive.endsWith('.lha') ||
                         lowerArchive.endsWith('.lzh') ||
                         lowerArchive.endsWith('.lzx');

        if (stats.isFile() && isArchive) {
          const doorInfo = await this.extractDoorInfo(fullPath);
          const ext = path.extname(archive);
          doors.push({
            id: crypto.createHash('md5').update(archive).digest('hex'),
            name: path.basename(archive, ext),
            filename: archive,
            type: 'archive',
            size: stats.size,
            uploadDate: stats.mtime,
            installed: false,
            archivePath: fullPath,
            ...doorInfo
          });
        }
      }
    }

    // Sort by name
    this.state.doors = doors.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Extract door information from archive
   * Supports: ZIP, LHA, LZH, LZX
   */
  private async extractDoorInfo(archivePath: string): Promise<Partial<DoorInfo>> {
    const info: Partial<DoorInfo> = {};
    const ext = path.extname(archivePath).toLowerCase();

    try {
      if (ext === '.zip') {
        // Handle ZIP archives with AdmZip
        const zip = new AdmZip(archivePath);
        const zipEntries = zip.getEntries();

        // Look for FILE_ID.DIZ
        const dizEntry = zipEntries.find(e =>
          e.entryName.toLowerCase() === 'file_id.diz' ||
          e.entryName.toLowerCase().endsWith('/file_id.diz')
        );
        if (dizEntry) {
          info.fileidDiz = dizEntry.getData().toString('utf8');
          // Parse DIZ for info
          const parsed = this.parseFileidDiz(info.fileidDiz);
          Object.assign(info, parsed);
        }

        // Look for README
        const readmeEntry = zipEntries.find(e =>
          /readme/i.test(e.entryName) && /\.(txt|md|doc)$/i.test(e.entryName)
        );
        if (readmeEntry) {
          info.readme = readmeEntry.getData().toString('utf8');
        }

        // Look for NFO file
        const nfoEntry = zipEntries.find(e => e.entryName.toLowerCase().endsWith('.nfo'));
        if (nfoEntry) {
          info.nfo = nfoEntry.getData().toString('utf8');
        }

        // Look for executable
        const exeEntry = zipEntries.find(e =>
          !e.isDirectory && (
            e.entryName.endsWith('.exe') ||
            e.entryName.endsWith('.ts') ||
            e.entryName.endsWith('.js') ||
            (!path.extname(e.entryName) && e.entryName.includes('/'))
          )
        );
        if (exeEntry) {
          info.executable = exeEntry.entryName;
        }
      } else if (ext === '.lha' || ext === '.lzh' || ext === '.lzx') {
        // Handle LHA/LZH/LZX archives with lha-extractor
        const { readLhaArchive } = await import('../utils/lha-extractor');
        const entries = await readLhaArchive(archivePath);

        // Look for FILE_ID.DIZ (case-insensitive, including subdirectories)
        const dizEntry = entries.find((e: any) => {
          const lowerName = e.name.toLowerCase();
          return lowerName === 'file_id.diz' ||
                 lowerName.endsWith('/file_id.diz') ||
                 lowerName.endsWith('\\file_id.diz');
        });
        if (dizEntry) {
          const LHA = require('../utils/lha.js');
          const decompressed = LHA.unpack(dizEntry);
          if (decompressed) {
            info.fileidDiz = Buffer.from(decompressed).toString('utf8');
            // Parse DIZ for info
            const parsed = this.parseFileidDiz(info.fileidDiz);
            Object.assign(info, parsed);
          }
        }

        // Look for README
        const readmeEntry = entries.find((e: any) =>
          /readme/i.test(e.name) && /\.(txt|md|doc)$/i.test(e.name)
        );
        if (readmeEntry) {
          const LHA = require('../utils/lha.js');
          const decompressed = LHA.unpack(readmeEntry);
          if (decompressed) {
            info.readme = Buffer.from(decompressed).toString('utf8');
          }
        }

        // Look for NFO file
        const nfoEntry = entries.find((e: any) => e.name.toLowerCase().endsWith('.nfo'));
        if (nfoEntry) {
          const LHA = require('../utils/lha.js');
          const decompressed = LHA.unpack(nfoEntry);
          if (decompressed) {
            info.nfo = Buffer.from(decompressed).toString('utf8');
          }
        }

        // Look for executable
        const exeEntry = entries.find((e: any) =>
          e.name.endsWith('.exe') ||
          e.name.endsWith('.ts') ||
          e.name.endsWith('.js') ||
          (!path.extname(e.name) && e.name.includes('/'))
        );
        if (exeEntry) {
          info.executable = exeEntry.name;
        }
      }

    } catch (error) {
      console.error('Error extracting door info:', error);
    }

    return info;
  }

  /**
   * Parse FILE_ID.DIZ to extract metadata
   */
  private parseFileidDiz(diz: string): Partial<DoorInfo> {
    const info: Partial<DoorInfo> = {};

    // Extract description (usually first line)
    const lines = diz.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) {
      info.description = lines[0];
    }

    // Look for author
    const authorMatch = diz.match(/(?:by|author|coded by|written by)[:\s]+([^\n]+)/i);
    if (authorMatch) {
      info.author = authorMatch[1].trim();
    }

    // Look for version
    const versionMatch = diz.match(/v(?:ersion)?[:\s]*([\d.]+)/i);
    if (versionMatch) {
      info.version = versionMatch[1];
    }

    return info;
  }

  /**
   * Display the door list
   */
  private showList(): void {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

    // Header
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' DOOR MANAGER ', 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');

    if (this.state.doors.length === 0) {
      this.socket.emit('ansi-output', '\x1b[33mNo doors installed.\x1b[0m\r\n\r\n');
    } else {
      this.socket.emit('ansi-output', '\x1b[36mInstalled Doors:\x1b[0m\r\n\r\n');

      // Calculate visible range (show 15 doors at a time)
      const pageSize = 15;
      const start = this.state.scrollOffset;
      const end = Math.min(start + pageSize, this.state.doors.length);

      for (let i = start; i < end; i++) {
        const door = this.state.doors[i];
        const isSelected = i === this.state.selectedIndex;

        // Format line
        const status = door.installed ? '\x1b[32m[*]\x1b[0m' : '\x1b[31m[ ]\x1b[0m';
        const type = door.type === 'typescript' ? 'TS' : door.type === 'amiga' ? 'AMI' : 'ARC';
        const name = door.name.substring(0, 40).padEnd(40);
        const size = this.formatSize(door.size);

        if (isSelected) {
          // Blue background for selected
          this.socket.emit('ansi-output', `\x1b[0;37;44m ${status} [${type}] ${name} ${size} \x1b[0m\r\n`);
        } else {
          this.socket.emit('ansi-output', ` ${status} \x1b[33m[${type}]\x1b[0m ${name} \x1b[36m${size}\x1b[0m\r\n`);
        }
      }

      // Show scroll indicator
      if (this.state.doors.length > pageSize) {
        const current = Math.floor(this.state.selectedIndex / pageSize) + 1;
        const total = Math.ceil(this.state.doors.length / pageSize);
        this.socket.emit('ansi-output', `\r\n\x1b[90mPage ${current}/${total}\x1b[0m\r\n`);
      }
    }

    // Footer with commands
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\x1b[33m↑/↓\x1b[0m Navigate  ');
    this.socket.emit('ansi-output', '\x1b[33mENTER\x1b[0m Info  ');
    this.socket.emit('ansi-output', '\x1b[33mU\x1b[0m Upload  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
  }

  /**
   * Display door information page
   */
  private showInfo(): void {
    if (!this.state.currentDoor) return;

    const door = this.state.currentDoor;

    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

    // Header
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' DOOR INFORMATION ', 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');

    // Basic info
    this.socket.emit('ansi-output', `\x1b[0;36mName:\x1b[0m ${door.name}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mFile:\x1b[0m ${door.filename}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mType:\x1b[0m ${door.type.toUpperCase()}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mSize:\x1b[0m ${this.formatSize(door.size)}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mDate:\x1b[0m ${door.uploadDate.toLocaleDateString()}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mStatus:\x1b[0m ${door.installed ? '\x1b[32mInstalled\x1b[0m' : '\x1b[31mNot Installed\x1b[0m'}\r\n`);

    if (door.author) {
      this.socket.emit('ansi-output', `\x1b[0;36mAuthor:\x1b[0m ${door.author}\r\n`);
    }
    if (door.version) {
      this.socket.emit('ansi-output', `\x1b[0;36mVersion:\x1b[0m ${door.version}\r\n`);
    }
    if (door.executable) {
      this.socket.emit('ansi-output', `\x1b[0;36mExecutable:\x1b[0m ${door.executable}\r\n`);
    }

    // FILE_ID.DIZ
    if (door.fileidDiz) {
      this.socket.emit('ansi-output', '\r\n\x1b[0;33m─── FILE_ID.DIZ ───\x1b[0m\r\n');
      const dizLines = door.fileidDiz.split('\n').slice(0, 10); // Show first 10 lines
      dizLines.forEach(line => {
        this.socket.emit('ansi-output', `\x1b[37m${line}\x1b[0m\r\n`);
      });
      if (door.fileidDiz.split('\n').length > 10) {
        this.socket.emit('ansi-output', '\x1b[90m... (truncated)\x1b[0m\r\n');
      }
    }

    // Description
    if (door.description) {
      this.socket.emit('ansi-output', '\r\n\x1b[0;36mDescription:\x1b[0m\r\n');
      this.socket.emit('ansi-output', `\x1b[37m${door.description}\x1b[0m\r\n`);
    }

    // Footer with commands
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');

    if (door.installed) {
      this.socket.emit('ansi-output', '\x1b[33mU\x1b[0m Uninstall  ');
    } else {
      this.socket.emit('ansi-output', '\x1b[33mI\x1b[0m Install  ');
    }

    if (door.readme || door.nfo) {
      this.socket.emit('ansi-output', '\x1b[33mD\x1b[0m Documentation  ');
    }

    this.socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
  }

  /**
   * Display documentation viewer
   */
  private showDocs(): void {
    if (!this.state.currentDoor) return;

    // Launch interactive archive browser
    this.browseArchive();
  }

  /**
   * Interactive archive browser - navigate files and directories
   */
  private async browseArchive(): Promise<void> {
    if (!this.state.currentDoor || !this.state.currentDoor.archivePath) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mNo archive available to browse\x1b[0m\r\n');
      return;
    }

    try {
      // Extract file list from archive
      const files = await this.extractArchiveFileList(this.state.currentDoor.archivePath);

      if (!files || files.length === 0) {
        this.socket.emit('ansi-output', '\r\n\x1b[31mNo files found in archive\x1b[0m\r\n');
        return;
      }

      // Initialize browser state
      this.state.archiveFiles = files;
      this.state.currentPath = '';  // Root of archive
      this.state.selectedFileIndex = 0;
      this.state.scrollOffset = 0;
      this.state.mode = 'browse-archive';

      this.showArchiveBrowser();
    } catch (error) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mError browsing archive: ' + (error as Error).message + '\x1b[0m\r\n');
    }
  }

  /**
   * Extract file and directory list from archive
   */
  private async extractArchiveFileList(archivePath: string): Promise<ArchiveFileEntry[]> {
    const entries: ArchiveFileEntry[] = [];
    const ext = path.extname(archivePath).toLowerCase();

    if (ext === '.zip') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(archivePath);
      const zipEntries = zip.getEntries();

      for (const entry of zipEntries) {
        const name = entry.entryName;
        // Skip macOS metadata files
        if (name.includes('__MACOSX') || name.endsWith('.DS_Store')) continue;

        entries.push({
          name: path.basename(name),
          fullPath: name,
          isDirectory: entry.isDirectory,
          size: entry.header.size,
          extension: path.extname(name).toLowerCase()
        });
      }
    } else if (ext === '.lha' || ext === '.lzh') {
      // Use AmigaDoorManager to list LHA contents
      const amigaDoorMgr = getAmigaDoorManager();
      const analysis = await amigaDoorMgr.analyzeDoorArchive(archivePath);

      if (analysis && analysis.files) {
        for (const file of analysis.files) {
          // Skip macOS metadata
          if (file.includes('__MACOSX') || file.endsWith('.DS_Store')) continue;

          // Detect if it's a directory (ends with /)
          const isDir = file.endsWith('/');
          const cleanPath = isDir ? file.slice(0, -1) : file;

          entries.push({
            name: path.basename(cleanPath),
            fullPath: file,
            isDirectory: isDir,
            size: 0, // LHA listing doesn't provide sizes easily
            extension: path.extname(cleanPath).toLowerCase()
          });
        }
      }
    } else if (ext === '.lzx') {
      // Similar to LHA
      const amigaDoorMgr = getAmigaDoorManager();
      const analysis = await amigaDoorMgr.analyzeDoorArchive(archivePath);

      if (analysis && analysis.files) {
        for (const file of analysis.files) {
          if (file.includes('__MACOSX') || file.endsWith('.DS_Store')) continue;

          const isDir = file.endsWith('/');
          const cleanPath = isDir ? file.slice(0, -1) : file;

          entries.push({
            name: path.basename(cleanPath),
            fullPath: file,
            isDirectory: isDir,
            size: 0,
            extension: path.extname(cleanPath).toLowerCase()
          });
        }
      }
    }

    return entries;
  }

  /**
   * Display archive browser with current directory
   */
  private showArchiveBrowser(): void {
    if (!this.state.archiveFiles) return;

    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

    // Header
    const currentPath = this.state.currentPath || '/';
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' ARCHIVE BROWSER ', 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', `\x1b[36mPath:\x1b[0m ${currentPath}\r\n`);
    this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');

    // Filter files for current directory
    const currentFiles = this.getFilesInCurrentPath();

    if (currentFiles.length === 0) {
      this.socket.emit('ansi-output', '\r\n\x1b[33mEmpty directory\x1b[0m\r\n');
    } else {
      // Display files with selection
      const pageSize = 15;
      const start = this.state.scrollOffset || 0;
      const end = Math.min(start + pageSize, currentFiles.length);

      for (let i = start; i < end; i++) {
        const file = currentFiles[i];
        const isSelected = i === (this.state.selectedFileIndex || 0);

        // Format entry
        let icon = file.isDirectory ? '\x1b[36m[DIR]\x1b[0m' : '     ';

        // Special icons for known file types
        if (!file.isDirectory) {
          if (file.extension === '.guide') icon = '\x1b[35m[GDE]\x1b[0m';
          else if (file.extension === '.txt' || file.extension === '.doc') icon = '\x1b[37m[TXT]\x1b[0m';
          else if (file.extension === '.info') icon = '\x1b[33m[NFO]\x1b[0m';
          else icon = '     ';
        }

        const name = file.name.substring(0, 50).padEnd(50);
        const size = file.isDirectory ? '     ' : this.formatSize(file.size).padStart(8);

        if (isSelected) {
          this.socket.emit('ansi-output', `\x1b[0;37;44m ${icon} ${name} ${size} \x1b[0m\r\n`);
        } else {
          this.socket.emit('ansi-output', ` ${icon} ${name} ${size}\r\n`);
        }
      }

      // Show scroll indicator
      if (currentFiles.length > pageSize) {
        const current = Math.floor((this.state.selectedFileIndex || 0) / pageSize) + 1;
        const total = Math.ceil(currentFiles.length / pageSize);
        this.socket.emit('ansi-output', `\r\n\x1b[90mPage ${current}/${total}\x1b[0m\r\n`);
      }
    }

    // Footer with commands
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\x1b[33m↑/↓\x1b[0m Navigate  ');
    this.socket.emit('ansi-output', '\x1b[33mENTER\x1b[0m Open  ');
    if (this.state.currentPath && this.state.currentPath !== '') {
      this.socket.emit('ansi-output', '\x1b[33mBACKSPACE\x1b[0m Up  ');
    }
    this.socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back to Info  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
  }

  /**
   * Get files in current directory path
   */
  private getFilesInCurrentPath(): ArchiveFileEntry[] {
    if (!this.state.archiveFiles) return [];

    const currentPath = this.state.currentPath || '';
    const result: ArchiveFileEntry[] = [];
    const seen = new Set<string>();

    for (const file of this.state.archiveFiles) {
      let relativePath = file.fullPath;

      // Remove current path prefix
      if (currentPath && relativePath.startsWith(currentPath + '/')) {
        relativePath = relativePath.substring(currentPath.length + 1);
      } else if (currentPath && currentPath !== '') {
        // Not in current directory
        continue;
      }

      // If in root and file is nested, skip
      if (!currentPath && relativePath.includes('/')) {
        // Extract first directory
        const firstDir = relativePath.split('/')[0];
        if (!seen.has(firstDir)) {
          seen.add(firstDir);
          result.push({
            name: firstDir,
            fullPath: currentPath ? currentPath + '/' + firstDir : firstDir,
            isDirectory: true,
            size: 0,
            extension: ''
          });
        }
        continue;
      }

      // If has more subdirectories, show as directory
      if (relativePath.includes('/')) {
        const nextDir = relativePath.split('/')[0];
        if (!seen.has(nextDir)) {
          seen.add(nextDir);
          result.push({
            name: nextDir,
            fullPath: currentPath ? currentPath + '/' + nextDir : nextDir,
            isDirectory: true,
            size: 0,
            extension: ''
          });
        }
      } else if (!file.isDirectory) {
        // File in current directory
        result.push(file);
      }
    }

    // Sort: directories first, then files
    return result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * View a file from the archive
   */
  private async viewArchiveFile(file: ArchiveFileEntry): Promise<void> {
    if (!this.state.currentDoor || !this.state.currentDoor.archivePath) return;

    try {
      const archivePath = this.state.currentDoor.archivePath;
      const ext = path.extname(archivePath).toLowerCase();
      let content = '';

      // Extract file content
      if (ext === '.zip') {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);
        const entry = zip.getEntry(file.fullPath);

        if (entry) {
          content = entry.getData().toString('utf8');
        }
      } else if (ext === '.lha' || ext === '.lzh' || ext === '.lzx') {
        // For LHA/LZX, we'd need to extract - for now show placeholder
        content = '[LHA/LZX file viewing requires extraction - not yet implemented]\r\n\r\n';
        content += `File: ${file.name}\r\n`;
        content += `Path: ${file.fullPath}\r\n`;
      }

      // Determine file type
      let fileType: 'text' | 'amigaguide' = 'text';
      if (file.extension === '.guide') {
        fileType = 'amigaguide';
      }

      // Store viewing state
      this.state.viewingFile = {
        name: file.name,
        content,
        type: fileType
      };
      this.state.scrollOffset = 0;
      this.state.mode = 'view-file';

      this.showFileViewer();
    } catch (error) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mError reading file: ' + (error as Error).message + '\x1b[0m\r\n');
    }
  }

  /**
   * Display file content viewer
   */
  private showFileViewer(): void {
    if (!this.state.viewingFile) return;

    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

    const file = this.state.viewingFile;

    // Header
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(` ${file.name.toUpperCase()} `, 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');

    // Show content with paging
    if (file.type === 'amigaguide') {
      // Parse and render AmigaGuide
      this.renderAmigaGuide(file.content);
    } else {
      // Display as plain text
      const lines = file.content.split('\n');
      const pageSize = 20;
      const start = this.state.scrollOffset || 0;
      const end = Math.min(start + pageSize, lines.length);

      for (let i = start; i < end; i++) {
        this.socket.emit('ansi-output', `${lines[i]}\r\n`);
      }

      // Footer
      this.socket.emit('ansi-output', '\r\n');
      this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
      this.socket.emit('ansi-output', `\x1b[90mLine ${start + 1}-${end} of ${lines.length}\x1b[0m\r\n`);
    }

    this.socket.emit('ansi-output', '\x1b[33m↑/↓\x1b[0m Scroll  ');
    this.socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back to Browser  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
  }

  /**
   * Render AmigaGuide content (simplified)
   */
  private renderAmigaGuide(content: string): void {
    // Basic AmigaGuide rendering
    // TODO: Integrate with full AmigaGuideViewer when available
    const lines = content.split('\n');
    const pageSize = 20;
    const start = this.state.scrollOffset || 0;
    const end = Math.min(start + pageSize, lines.length);

    for (let i = start; i < end; i++) {
      let line = lines[i];

      // Simple AmigaGuide tag processing
      // @node, @title, @{}, etc.
      line = line.replace(/@\{[^}]*\}/g, ''); // Remove formatting codes
      line = line.replace(/@node .*/i, ''); // Remove node declarations
      line = line.replace(/@title .*/i, ''); // Remove title declarations

      this.socket.emit('ansi-output', `${line}\r\n`);
    }
  }

  /**
   * Handle upload prompt
   */
  private async handleUpload(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' UPLOAD DOOR ', 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', 'Upload a door archive (ZIP, LHA, LZH, or LZX format)\r\n\r\n');
    this.socket.emit('ansi-output', 'The archive should contain:\r\n');
    this.socket.emit('ansi-output', '  - Door executable (.ts, .js, or Amiga binary)\r\n');
    this.socket.emit('ansi-output', '  - FILE_ID.DIZ (optional, but recommended)\r\n');
    this.socket.emit('ansi-output', '  - README.TXT or similar documentation (optional)\r\n\r\n');

    // Trigger file picker on frontend
    this.socket.emit('show-file-upload', {
      accept: '.zip,.lha,.lzh,.lzx',
      maxSize: 10 * 1024 * 1024, // 10MB
      uploadUrl: '/api/upload/door',
      fieldName: 'door'
    });

    this.socket.emit('ansi-output', '\x1b[33mA file picker has opened in your browser.\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\x1b[36mSelect an archive file to upload (ZIP/LHA/LZH/LZX)...\x1b[0m\r\n\r\n');
    this.socket.emit('ansi-output', '\x1b[90mPress Q to cancel\x1b[0m\r\n');
  }

  /**
   * Process uploaded file with smart analysis
   */
  private async processUpload(data: { filename: string; originalname: string; size: number; path?: string }): Promise<void> {
    this.socket.emit('ansi-output', '\r\n\x1b[32m✓ File received: ' + data.originalname + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', `\x1b[36mSize: ${this.formatSize(data.size)}\x1b[0m\r\n`);
    this.socket.emit('ansi-output', '\r\n\x1b[33m🔍 Analyzing archive contents...\x1b[0m\r\n');

    try {
      // Construct archive path (use provided path or construct from archives directory)
      const archivePath = data.path || path.join(this.archivesPath, data.originalname);

      // Verify file exists
      if (!fs.existsSync(archivePath)) {
        throw new Error(`Uploaded file not found: ${archivePath}`);
      }

      console.log('[Door Manager] Analyzing archive:', archivePath);

      // 🎯 SMART ANALYSIS: Use AmigaDoorManager to analyze archive
      const amigaDoorMgr = getAmigaDoorManager();
      const analysis = await amigaDoorMgr.analyzeDoorArchive(archivePath);

      if (!analysis) {
        throw new Error('Failed to analyze archive');
      }

      // Display analysis results
      this.socket.emit('ansi-output', '\r\n\x1b[36m━━━ Archive Analysis ━━━\x1b[0m\r\n');
      this.socket.emit('ansi-output', `Format: ${analysis.format}\r\n`);
      this.socket.emit('ansi-output', `Files: ${analysis.files.length}\r\n`);

      // Show standard door structure if detected
      if (analysis.isStandardDoorStructure) {
        this.socket.emit('ansi-output', '\r\n\x1b[32m✓ Standard AmiExpress Door Structure Detected!\x1b[0m\r\n');

        if (analysis.metadata?.doorName) {
          this.socket.emit('ansi-output', `\x1b[36mDoor Name:\x1b[0m ${analysis.metadata.doorName}\r\n`);
        }

        if (analysis.bbsCommands && analysis.bbsCommands.length > 0) {
          this.socket.emit('ansi-output', `\x1b[36mBBS Commands:\x1b[0m ${analysis.bbsCommands.join(', ')}\r\n`);
        }

        if (analysis.executables.length > 0) {
          this.socket.emit('ansi-output', `\x1b[36mExecutables:\x1b[0m ${analysis.executables.length}\r\n`);
          analysis.executables.slice(0, 3).forEach(exe => {
            this.socket.emit('ansi-output', `  • ${exe}\r\n`);
          });
          if (analysis.executables.length > 3) {
            this.socket.emit('ansi-output', `  ... and ${analysis.executables.length - 3} more\r\n`);
          }
        }

        if (analysis.libraries.length > 0) {
          this.socket.emit('ansi-output', `\x1b[36mLibraries:\x1b[0m ${analysis.libraries.length} (will install to Libs/)\r\n`);
        }
      }

      // Show file_id.diz if available
      if (analysis.metadata?.fileidDiz) {
        this.socket.emit('ansi-output', '\r\n\x1b[33m─── FILE_ID.DIZ ───\x1b[0m\r\n');
        const dizLines = analysis.metadata.fileidDiz.split('\n').slice(0, 8);
        dizLines.forEach(line => {
          this.socket.emit('ansi-output', `\x1b[37m${line}\x1b[0m\r\n`);
        });
      }

      // Determine door type and suggest action
      let doorType = '';
      let suggestion = '';
      let canInstall = false;

      if (analysis.isStandardDoorStructure) {
        doorType = 'Standard AmiExpress Door';
        suggestion = 'Ready to install to BBS structure!\r\n\x1b[36mCommands will be copied to Commands/BBSCmd/\x1b[0m\r\n\x1b[36mExecutables will be copied to Doors/\x1b[0m\r\n🚀 Will run via 68000 CPU emulation!';
        canInstall = true;
      } else if (analysis.isTypeScriptDoor) {
        doorType = 'TypeScript Door';
        suggestion = 'This appears to be a TypeScript/JavaScript door.\r\nReady to install and run.';
        canInstall = true;
      } else if (analysis.isAREXXDoor) {
        doorType = 'AREXX Script Door';
        suggestion = 'This is an AREXX script door.\r\nCan be installed and executed via AREXX interpreter.';
        canInstall = true;
      } else if (analysis.infoFiles.length > 0 && analysis.executables.length > 0) {
        doorType = 'Amiga Binary Door';
        suggestion = 'This is a native Amiga door with binary executables.\r\n🚀 Will run via 68000 CPU emulation!';
        canInstall = true;
      } else if (analysis.hasSourceCode) {
        doorType = 'Source Code Archive';
        const sourceTypes = [];
        if (analysis.sourceFiles.some(f => f.endsWith('.s') || f.endsWith('.asm'))) sourceTypes.push('Assembler');
        if (analysis.sourceFiles.some(f => f.endsWith('.c'))) sourceTypes.push('C');
        if (analysis.sourceFiles.some(f => f.endsWith('.e'))) sourceTypes.push('E');
        if (analysis.sourceFiles.some(f => f.endsWith('.rexx'))) sourceTypes.push('AREXX');

        suggestion = `Contains source code: ${sourceTypes.join(', ')}\r\n\x1b[33m⚠ Requires manual porting to TypeScript.\x1b[0m`;
        canInstall = false;
      } else {
        doorType = 'Unknown';
        suggestion = 'Could not determine door type.\r\nArchive may be incomplete or unsupported format.';
        canInstall = false;
      }

      this.socket.emit('ansi-output', `\r\n\x1b[32mType: ${doorType}\x1b[0m\r\n`);
      this.socket.emit('ansi-output', `\r\n${suggestion}\r\n`);

      // Show additional details for non-standard doors
      if (!analysis.isStandardDoorStructure) {
        if (analysis.infoFiles.length > 0) {
          this.socket.emit('ansi-output', `\r\nCommands: ${analysis.infoFiles.length}\r\n`);
        }
        if (analysis.executables.length > 0) {
          this.socket.emit('ansi-output', `Executables: ${analysis.executables.length}\r\n`);
        }
        if (analysis.libraries.length > 0) {
          this.socket.emit('ansi-output', `\x1b[36mLibraries: ${analysis.libraries.length} (will install to Libs/)\x1b[0m\r\n`);
        }
        if (analysis.sourceFiles.length > 0) {
          this.socket.emit('ansi-output', `Source files: ${analysis.sourceFiles.length}\r\n`);
        }
      }

      this.socket.emit('ansi-output', '\r\n');

      // Create a temporary door object for installation
      const tempDoor: DoorInfo = {
        id: crypto.createHash('md5').update(archivePath).digest('hex'),
        name: analysis.metadata?.doorName || path.basename(data.originalname, path.extname(data.originalname)),
        filename: data.originalname,
        type: 'archive',
        size: data.size,
        uploadDate: new Date(),
        installed: false,
        archivePath: archivePath,
        fileidDiz: analysis.metadata?.fileidDiz,
      };

      // Set current door and store analysis
      this.state.currentDoor = tempDoor;
      (this.state.currentDoor as any).analysis = analysis;

      if (canInstall) {
        // Offer installation
        this.socket.emit('ansi-output', '\x1b[32mPress I to install, or any other key to view details\x1b[0m\r\n');

        const handleChoice = (input: string) => {
          this.socket.off('command', handleChoice);
          if (input.toLowerCase() === 'i') {
            this.installSmartDoor(tempDoor, analysis);
          } else {
            this.state.mode = 'info';
            this.showInfo();
          }
        };
        this.socket.once('command', handleChoice);
      } else {
        // Just show info
        this.socket.emit('ansi-output', 'Press any key to view details...\r\n');
        const showInfoOnce = () => {
          this.socket.off('command', showInfoOnce);
          this.state.mode = 'info';
          this.showInfo();
        };
        this.socket.once('command', showInfoOnce);
      }

    } catch (error) {
      this.socket.emit('ansi-output', '\x1b[31m✗ Error processing upload: ' + (error as Error).message + '\x1b[0m\r\n');
      this.socket.emit('ansi-output', 'Press any key to return to door list...\r\n');

      const returnToList = () => {
        this.socket.off('command', returnToList);
        this.state.mode = 'list';
        this.showList();
      };
      this.socket.once('command', returnToList);
    }
  }

  /**
   * Smart door installation using AmigaDoorManager
   * Handles TypeScript, AREXX, and Amiga binary doors
   */
  private async installSmartDoor(door: DoorInfo, analysis: DoorArchive): Promise<void> {
    if (!door.archivePath) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mError: No archive path\x1b[0m\r\n');
      return;
    }

    this.socket.emit('ansi-output', '\r\n\x1b[33m📦 Installing ' + door.name + '...\x1b[0m\r\n\r\n');

    try {
      const amigaDoorMgr = getAmigaDoorManager();
      const result = await amigaDoorMgr.installDoor(door.archivePath);

      if (result.success) {
        this.socket.emit('ansi-output', '\x1b[32m✓ ' + result.message + '\x1b[0m\r\n');

        if (result.door) {
          this.socket.emit('ansi-output', `\r\nCommand: ${result.door.command}\r\n`);
          this.socket.emit('ansi-output', `Location: ${result.door.location}\r\n`);
          if (result.door.type) {
            this.socket.emit('ansi-output', `Type: ${result.door.type}\r\n`);
          }
        }

        if (analysis.libraries.length > 0) {
          this.socket.emit('ansi-output', `\r\n\x1b[36m✓ Installed ${analysis.libraries.length} library file(s) to Libs/\x1b[0m\r\n`);
        }

        this.socket.emit('ansi-output', '\r\n\x1b[32m✓ Installation complete!\x1b[0m\r\n');
      } else {
        this.socket.emit('ansi-output', '\x1b[31m✗ ' + result.message + '\x1b[0m\r\n');
      }

    } catch (error) {
      this.socket.emit('ansi-output', '\x1b[31m✗ Installation error: ' + (error as Error).message + '\x1b[0m\r\n');
    }

    // Re-scan to update list
    await this.scanDoors();

    this.socket.emit('ansi-output', '\r\nPress any key to return to door list...\r\n');
    const returnToList = () => {
      this.socket.off('command', returnToList);
      this.state.mode = 'list';
      this.showList();
    };
    this.socket.once('command', returnToList);
  }

  /**
   * Install a door (legacy method for simple ZIP extraction)
   */
  private async installDoor(door: DoorInfo): Promise<void> {
    if (!door.archivePath) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mError: No archive path\x1b[0m\r\n');
      return;
    }

    this.socket.emit('ansi-output', '\r\n\x1b[33mInstalling ' + door.name + '...\x1b[0m\r\n');

    try {
      const zip = new AdmZip(door.archivePath);

      if (door.executable) {
        // Extract executable to doors directory
        const entry = zip.getEntry(door.executable);
        if (entry) {
          const targetPath = path.join(this.doorsPath, path.basename(door.executable));
          zip.extractEntryTo(entry, this.doorsPath, false, true);

          // Make executable (Unix)
          try {
            fs.chmodSync(targetPath, 0o755);
          } catch (e) {
            // Windows doesn't need this
          }

          door.installed = true;
          this.socket.emit('ansi-output', '\x1b[32mInstallation successful!\x1b[0m\r\n');

          // Re-scan doors
          await this.scanDoors();

          // Update current door reference
          this.state.currentDoor = this.state.doors.find(d => d.id === door.id);
        } else {
          throw new Error('Executable not found in archive');
        }
      } else {
        throw new Error('No executable specified');
      }

    } catch (error) {
      this.socket.emit('ansi-output', '\x1b[31mInstallation failed: ' + (error as Error).message + '\x1b[0m\r\n');
    }

    this.socket.emit('ansi-output', '\r\nPress any key to continue...\r\n');

    const continueHandler = (data: string) => {
      this.socket.off('command', continueHandler);
      this.showInfo();
    };
    this.socket.on('command', continueHandler);
  }

  /**
   * Uninstall a door
   */
  private async uninstallDoor(door: DoorInfo): Promise<void> {
    this.socket.emit('ansi-output', '\r\n\x1b[33mUninstalling ' + door.name + '...\x1b[0m\r\n');

    try {
      const doorPath = path.join(this.doorsPath, door.filename);

      if (fs.existsSync(doorPath)) {
        fs.unlinkSync(doorPath);
        door.installed = false;
        this.socket.emit('ansi-output', '\x1b[32mUninstallation successful!\x1b[0m\r\n');

        // Re-scan doors
        await this.scanDoors();

        // Update current door reference
        this.state.currentDoor = this.state.doors.find(d => d.id === door.id);
      } else {
        throw new Error('Door file not found');
      }

    } catch (error) {
      this.socket.emit('ansi-output', '\x1b[31mUninstallation failed: ' + (error as Error).message + '\x1b[0m\r\n');
    }

    this.socket.emit('ansi-output', '\r\nPress any key to continue...\r\n');

    const continueHandler = (data: string) => {
      this.socket.off('command', continueHandler);
      this.showInfo();
    };
    this.socket.on('command', continueHandler);
  }

  /**
   * Setup input handlers
   */
  private setupInputHandlers(): void {
    console.log('[Door Manager] setupInputHandlers() called');

    // Check how many listeners are already registered
    const commandListenerCount = this.socket.listenerCount('command');
    console.log('[Door Manager] Existing command listeners:', commandListenerCount);

    // Store the handler so we can remove it later
    this.inputHandler = (data: string) => {
      console.log('[Door Manager] *** INPUT HANDLER FIRED ***');
      console.log('[Door Manager] Received input:', JSON.stringify(data), 'mode:', this.state.mode);
      this.handleInput(data);
    };

    console.log('[Door Manager] Registering command listener...');
    this.socket.on('command', this.inputHandler);

    const newListenerCount = this.socket.listenerCount('command');
    console.log('[Door Manager] command listeners after adding:', newListenerCount);

    // Handle file uploads from frontend
    this.socket.on('file-uploaded', (data: { filename: string; originalname: string; size: number }) => {
      this.processUpload(data);
    });

    console.log('[Door Manager] Input handler setup complete');
  }

  /**
   * Handle keyboard input
   */
  private handleInput(data: string): void {
    console.log('[Door Manager] handleInput called with:', JSON.stringify(data));
    const key = data.toLowerCase();

    // Handle based on current mode
    switch (this.state.mode) {
      case 'list':
        this.handleListInput(key, data);
        break;
      case 'info':
        this.handleInfoInput(key);
        break;
      case 'docs':
        this.handleDocsInput(key, data);
        break;
      case 'browse-archive':
        this.handleBrowseArchiveInput(key, data);
        break;
      case 'view-file':
        this.handleViewFileInput(key, data);
        break;
      case 'upload':
        this.handleUploadInput(key);
        break;
    }
  }

  /**
   * Handle input in list mode
   */
  private handleListInput(key: string, rawData: string): void {
    // Arrow keys
    if (rawData === '\x1b[A' || rawData === '\x1b\x5b\x41') { // Up arrow
      if (this.state.selectedIndex > 0) {
        this.state.selectedIndex--;

        // Adjust scroll offset
        const pageSize = 15;
        if (this.state.selectedIndex < this.state.scrollOffset) {
          this.state.scrollOffset = Math.max(0, this.state.scrollOffset - pageSize);
        }

        this.showList();
      }
      return;
    }

    if (rawData === '\x1b[B' || rawData === '\x1b\x5b\x42') { // Down arrow
      if (this.state.selectedIndex < this.state.doors.length - 1) {
        this.state.selectedIndex++;

        // Adjust scroll offset
        const pageSize = 15;
        if (this.state.selectedIndex >= this.state.scrollOffset + pageSize) {
          this.state.scrollOffset = Math.min(
            this.state.doors.length - pageSize,
            this.state.scrollOffset + pageSize
          );
        }

        this.showList();
      }
      return;
    }

    // Enter - View info
    if (key === '\r' || key === '\n') {
      if (this.state.doors.length > 0) {
        this.state.currentDoor = this.state.doors[this.state.selectedIndex];
        this.state.mode = 'info';
        this.showInfo();
      }
      return;
    }

    // U - Upload
    if (key === 'u') {
      this.state.mode = 'upload';
      this.handleUpload();
      return;
    }

    // Q - Quit
    if (key === 'q') {
      this.cleanup();
      this.socket.emit('door-exit');
      return;
    }
  }

  /**
   * Handle input in info mode
   */
  private handleInfoInput(key: string): void {
    const door = this.state.currentDoor;
    if (!door) return;

    // I - Install
    if (key === 'i' && !door.installed) {
      this.installDoor(door);
      return;
    }

    // U - Uninstall
    if (key === 'u' && door.installed) {
      this.uninstallDoor(door);
      return;
    }

    // D - Documentation
    if (key === 'd' && (door.readme || door.nfo)) {
      this.state.docsContent = door.readme || door.nfo || '';
      this.state.scrollOffset = 0;
      this.state.mode = 'docs';
      this.showDocs();
      return;
    }

    // B - Back to list
    if (key === 'b') {
      this.state.mode = 'list';
      this.showList();
      return;
    }

    // Q - Quit
    if (key === 'q') {
      this.cleanup();
      this.socket.emit('door-exit');
      return;
    }
  }

  /**
   * Handle input in docs mode
   */
  private handleDocsInput(key: string, rawData: string): void {
    if (!this.state.docsContent) return;

    const lines = this.state.docsContent.split('\n');
    const pageSize = 20;

    // Arrow keys for scrolling
    if (rawData === '\x1b[A' || rawData === '\x1b\x5b\x41') { // Up arrow
      this.state.scrollOffset = Math.max(0, this.state.scrollOffset - 1);
      this.showDocs();
      return;
    }

    if (rawData === '\x1b[B' || rawData === '\x1b\x5b\x42') { // Down arrow
      this.state.scrollOffset = Math.min(lines.length - pageSize, this.state.scrollOffset + 1);
      this.showDocs();
      return;
    }

    // B - Back to info
    if (key === 'b') {
      this.state.mode = 'info';
      this.state.scrollOffset = 0;
      this.showInfo();
      return;
    }

    // Q - Quit
    if (key === 'q') {
      this.cleanup();
      this.socket.emit('door-exit');
      return;
    }
  }

  /**
   * Handle input in archive browser mode
   */
  private handleBrowseArchiveInput(key: string, rawData: string): void {
    const currentFiles = this.getFilesInCurrentPath();
    const selectedIndex = this.state.selectedFileIndex || 0;

    // Arrow keys for navigation
    if (rawData === '\x1b[A' || rawData === '\x1b\x5b\x41') { // Up arrow
      if (selectedIndex > 0) {
        this.state.selectedFileIndex = selectedIndex - 1;

        // Adjust scroll offset
        const pageSize = 15;
        if (this.state.selectedFileIndex < this.state.scrollOffset) {
          this.state.scrollOffset = Math.max(0, this.state.scrollOffset - pageSize);
        }

        this.showArchiveBrowser();
      }
      return;
    }

    if (rawData === '\x1b[B' || rawData === '\x1b\x5b\x42') { // Down arrow
      if (selectedIndex < currentFiles.length - 1) {
        this.state.selectedFileIndex = selectedIndex + 1;

        // Adjust scroll offset
        const pageSize = 15;
        if (this.state.selectedFileIndex >= this.state.scrollOffset + pageSize) {
          this.state.scrollOffset = Math.min(
            currentFiles.length - pageSize,
            this.state.scrollOffset + pageSize
          );
        }

        this.showArchiveBrowser();
      }
      return;
    }

    // Enter - Open file or directory
    if (key === '\r' || key === '\n') {
      if (currentFiles.length > 0) {
        const selectedFile = currentFiles[selectedIndex];

        if (selectedFile.isDirectory) {
          // Navigate into directory
          this.state.currentPath = selectedFile.fullPath;
          this.state.selectedFileIndex = 0;
          this.state.scrollOffset = 0;
          this.showArchiveBrowser();
        } else {
          // View file
          this.viewArchiveFile(selectedFile);
        }
      }
      return;
    }

    // Backspace - Go up one directory
    if (rawData === '\x7f' || rawData === '\x08' || key === '\b') {
      if (this.state.currentPath && this.state.currentPath !== '') {
        // Go up one level
        const parts = this.state.currentPath.split('/');
        parts.pop();
        this.state.currentPath = parts.join('/');
        this.state.selectedFileIndex = 0;
        this.state.scrollOffset = 0;
        this.showArchiveBrowser();
      }
      return;
    }

    // B - Back to info
    if (key === 'b') {
      this.state.mode = 'info';
      this.state.scrollOffset = 0;
      this.showInfo();
      return;
    }

    // Q - Quit
    if (key === 'q') {
      this.cleanup();
      this.socket.emit('door-exit');
      return;
    }
  }

  /**
   * Handle input in file viewer mode
   */
  private handleViewFileInput(key: string, rawData: string): void {
    if (!this.state.viewingFile) return;

    const lines = this.state.viewingFile.content.split('\n');
    const pageSize = 20;

    // Arrow keys for scrolling
    if (rawData === '\x1b[A' || rawData === '\x1b\x5b\x41') { // Up arrow
      this.state.scrollOffset = Math.max(0, this.state.scrollOffset - 1);
      this.showFileViewer();
      return;
    }

    if (rawData === '\x1b[B' || rawData === '\x1b\x5b\x42') { // Down arrow
      this.state.scrollOffset = Math.min(lines.length - pageSize, this.state.scrollOffset + 1);
      this.showFileViewer();
      return;
    }

    // B - Back to archive browser
    if (key === 'b') {
      this.state.mode = 'browse-archive';
      this.state.scrollOffset = 0;
      this.showArchiveBrowser();
      return;
    }

    // Q - Quit
    if (key === 'q') {
      this.cleanup();
      this.socket.emit('door-exit');
      return;
    }
  }

  /**
   * Handle input in upload mode
   */
  private handleUploadInput(key: string): void {
    // Q - Cancel upload and return to list
    if (key === 'q') {
      this.state.mode = 'list';
      this.showList();
      return;
    }
  }

  /**
   * Utility: Pad string to width
   */
  private pad(str: string, width: number): string {
    if (str.length >= width) return str.substring(0, width);
    const padding = width - str.length;
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  }

  /**
   * Utility: Format file size
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Cleanup when exiting Door Manager
   */
  private cleanup(): void {
    console.log('[Door Manager] Cleaning up...');

    // Remove input handler
    if (this.inputHandler) {
      console.log('[Door Manager] Removing command listener');
      this.socket.off('command', this.inputHandler);
      this.inputHandler = undefined;
    }

    // Clear the session flag
    if (this.session) {
      delete this.session.inDoorManager;
      // Set state to display menu
      this.session.subState = 'display_menu';
      this.session.menuPause = false;
    }
  }
}

// Export main function for door execution
export async function executeDoor(socket: Socket, session?: any): Promise<void> {
  try {
    const manager = new DoorManager(socket, session);
    await manager.start();
  } catch (error) {
    console.error('[Door Manager] Fatal error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mFatal error in Door Manager\x1b[0m\r\n');
    socket.emit('ansi-output', `${(error as Error).stack}\r\n\r\n`);
    socket.emit('ansi-output', 'Press any key to return to main menu...\r\n');

    // Clean up session state
    if (session) {
      delete session.inDoorManager;
      session.subState = 'display_menu';
      session.menuPause = false;
    }

    // Wait for keypress then exit
    const exitHandler = () => {
      socket.off('command', exitHandler);
      socket.emit('door-exit');
    };
    socket.once('command', exitHandler);
  }
}
