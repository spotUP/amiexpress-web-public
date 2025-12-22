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
import * as amigafs from '../utils/amigafs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { Socket } from 'socket.io';
import AdmZip from 'adm-zip';
import { getAmigaDoorManager, DoorArchive } from './amigaDoorManager';
import { getDoors, Door } from '../handlers/door.handler';
import { config } from '../config';
import {
  ArchiveFileEntry,
  ViewingFile,
  ArchiveBrowserState,
  extractArchiveFileList,
  getFilesInCurrentPath,
  extractFileContent,
  renderArchiveBrowser,
  renderFileViewer
} from './DoorManagerArchive';
import {
  InfoFile,
  Tooltype
} from '../utils/info-file.util';
import {
  InfoEditorState,
  findInfoFile,
  openInfoFile,
  renderInfoEditor,
  handleInfoEditorInput
} from './DoorManagerInfoEditor';

interface DoorInfo {
  id: string;
  name: string;
  filename: string;
  type: 'typescript' | 'python' | 'arexx' | 'amiga' | 'archive';
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

interface DoorManagerState {
  mode: 'list' | 'info' | 'upload' | 'docs' | 'browse-archive' | 'view-file' | 'edit-info';
  selectedIndex: number;
  doors: DoorInfo[];
  currentDoor?: DoorInfo;
  lastReloadStatus?: Record<string, string>;
  lastReloadLog?: Record<string, string>;
  filter?: string;
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
  // Info editor state (uses InfoEditorState from DoorManagerInfoEditor)
  infoEditorState?: InfoEditorState;
}

export class DoorManager {
  private socket: Socket;
  private session: any;
  private state: DoorManagerState;
  private doorsPath: string;
  private archivesPath: string;
  private inputHandler?: (data: string) => void;
  private projectRoot: string;

  constructor(socket: Socket, session?: any) {
    this.socket = socket;
    this.session = session;
    this.doorsPath = path.join(config.get('dataDir'), 'Doors');
    this.projectRoot = path.resolve(__dirname, '..', '..', '..');
    this.archivesPath = path.join(config.get('dataDir'), 'Doors', 'archives');

    // Ensure directories exist
    if (!amigafs.existsSync(this.archivesPath)) {
      amigafs.mkdirSync(this.archivesPath, { recursive: true });
    }

    this.state = {
      mode: 'list',
      selectedIndex: 0,
      doors: [],
      lastReloadStatus: {},
      lastReloadLog: {},
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

      console.log('[Door Manager] Current state:', JSON.stringify({
        mode: this.state.mode,
        inDoorManager: this.session?.inDoorManager,
        hasInputHandler: !!this.inputHandler
      }));
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
   * Scan for installed doors - uses cached doors from door.handler for speed
   */
  private async scanDoors(): Promise<void> {
    const doors: DoorInfo[] = [];

    // Use cached doors from door.handler.ts (same as DOORS command - fast!)
    const cachedDoors = getDoors();
    console.log(`[Door Manager] Using ${cachedDoors.length} cached doors from door.handler`);

    for (const door of cachedDoors) {
      if (!door.enabled) continue;

      // Calculate door size if path exists
      let doorSize = 0;
      if (door.path && amigafs.existsSync(door.path)) {
        try {
          const stats = amigafs.statSync(door.path);
          if (stats.isDirectory()) {
            doorSize = this.calculateDirectorySize(door.path);
          } else {
            doorSize = stats.size;
          }
        } catch (error) {
          // Ignore size errors
        }
      }

      doors.push({
        id: crypto.createHash('md5').update(door.command).digest('hex'),
        name: door.name || door.command,
        filename: `${door.command}.info`,
        type: door.type === 'typescript' ? 'typescript' :
              door.type === 'python' ? 'python' as any :
              door.type === 'AREXX' ? 'arexx' as any : 'amiga',
        command: door.command,
        location: door.path || '',
        doorType: door.type,
        size: doorSize,
        uploadDate: new Date(0),
        installed: true,
        access: door.accessLevel
      } as any);
    }

    // Also scan for installed Amiga doors (from Commands/BBSCmd/*.info files)
    // Use cached scan from amigaDoorManager
    try {
      const amigaDoorMgr = getAmigaDoorManager();
      const amigaDoors = await amigaDoorMgr.scanInstalledDoors();

      console.log(`[Door Manager] Found ${amigaDoors.length} installed Amiga door(s)`);

      for (const amigaDoor of amigaDoors) {
        // Skip if already added from cached doors
        if (doors.some(d => (d as any).command === amigaDoor.command)) {
          continue;
        }

        // Calculate door size (executable + docs if exists)
        let doorSize = 0;
        if (amigaDoor.resolvedPath && amigafs.existsSync(amigaDoor.resolvedPath)) {
          try {
            const stats = amigafs.statSync(amigaDoor.resolvedPath);
            if (stats.isDirectory()) {
              doorSize = this.calculateDirectorySize(amigaDoor.resolvedPath);
            } else {
              doorSize = stats.size;
            }
          } catch (error) {
            console.error(`[Door Manager] Error getting size for ${amigaDoor.resolvedPath}:`, error);
          }
        }

        doors.push({
          id: crypto.createHash('md5').update(amigaDoor.command).digest('hex'),
          name: amigaDoor.name || amigaDoor.command,
          filename: `${amigaDoor.command}.info`,
          type: 'amiga' as any,
          command: amigaDoor.command,
          location: amigaDoor.location,
          doorType: amigaDoor.type,
          size: doorSize,
          uploadDate: new Date(0),
          installed: amigaDoor.installed,
          access: amigaDoor.access
        } as any);
      }
    } catch (error) {
      console.error('[Door Manager] Error scanning Amiga doors:', error);
    }

    // Scan archives directory for uninstalled archives (with timeout protection)
    if (amigafs.existsSync(this.archivesPath)) {
      const archives = amigafs.readdirSync(this.archivesPath);
      console.log(`[Door Manager] Scanning ${archives.length} files in archives directory`);

      for (const archive of archives) {
        const fullPath = path.join(this.archivesPath, archive);
        try {
          const stats = amigafs.statSync(fullPath);
          const lowerArchive = archive.toLowerCase();
          const isArchive = lowerArchive.endsWith('.zip') ||
                           lowerArchive.endsWith('.lha') ||
                           lowerArchive.endsWith('.lzh') ||
                           lowerArchive.endsWith('.lzx');

          if (stats.isFile() && isArchive) {
            // Use timeout to prevent hanging on corrupted archives
            let doorInfo: Partial<DoorInfo> = {};
            try {
              const timeoutPromise = new Promise<Partial<DoorInfo>>((_, reject) =>
                setTimeout(() => reject(new Error('Archive extraction timeout')), 3000)
              );
              doorInfo = await Promise.race([
                this.extractDoorInfo(fullPath),
                timeoutPromise
              ]);
            } catch (extractError) {
              console.warn(`[Door Manager] Skipping archive ${archive}: ${(extractError as Error).message}`);
            }

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
        } catch (statError) {
          console.warn(`[Door Manager] Skipping file ${archive}: ${(statError as Error).message}`);
        }
      }
    }
    console.log('[Door Manager] Archive scan complete');

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

    // Header - fixed at top (position 1,1)
    this.socket.emit('ansi-output', '\x1b[1;1H\x1b[0;37;44m' + this.pad(' DOOR MANAGER ', 80) + '\x1b[0m');

    // Move to line 3 for content (leave line 2 blank)
    this.socket.emit('ansi-output', '\x1b[3;1H');

    const doors = this.applyFilter(this.state.filter || '');

    if (doors.length === 0) {
      this.socket.emit('ansi-output', '\x1b[33mNo doors installed.\x1b[0m\r\n\r\n');
    } else {
      this.socket.emit('ansi-output', '\x1b[36mInstalled Doors:\x1b[0m\r\n\r\n');

      // Calculate visible range (show 14 doors at a time to fit 24-row terminal)
      // Layout: row 1 header, row 2 blank, row 3 section header, rows 4-5 blank lines,
      // rows 6-19 = 14 doors, rows 20-21 pagination, rows 22-24 footer
      const pageSize = 14;
      const start = this.state.scrollOffset;
      const end = Math.min(start + pageSize, doors.length);

      for (let i = start; i < end; i++) {
        const door = doors[i];
        const isSelected = i === this.state.selectedIndex;

        // Format line - use doorType if available, fallback to type
        const status = door.installed ? '\x1b[32m[*]\x1b[0m' : '\x1b[31m[ ]\x1b[0m';
        const doorType = (door as any).doorType || door.type;
        const type = doorType === 'TS' ? 'TS' :
                    doorType === 'PYTHON' ? 'PY' :
                    doorType === 'AREXX' ? 'RX' :
                    doorType === 'AMI' || doorType === 'amiga' ? 'AMI' :
                    door.type === 'typescript' ? 'TS' :
                    door.type === 'python' ? 'PY' :
                    door.type === 'arexx' ? 'RX' :
                    door.type === 'archive' ? 'ARC' : 'AMI';
        const hot = this.supportsHotReload(door) ? '\x1b[35mH\x1b[0m' : ' ';
        const name = door.name.substring(0, 24).padEnd(24);
        const size = this.formatSize(door.size);

        // Show BBS command if available (for installed doors)
        const command = (door as any).command || '';
        const commandDisplay = command ? `\x1b[33m${command.padEnd(10)}\x1b[0m` : ''.padEnd(10);

        if (isSelected) {
          // Blue background for selected
          this.socket.emit('ansi-output', `\x1b[0;37;44m ${status} [${type}${hot}] ${commandDisplay} ${name} ${size} \x1b[0m\r\n`);
        } else {
          this.socket.emit('ansi-output', ` ${status} \x1b[33m[${type}${hot}]\x1b[0m ${commandDisplay} ${name} \x1b[36m${size}\x1b[0m\r\n`);
        }
      }

      // Show scroll indicator
      if (doors.length > pageSize) {
        const current = Math.floor(this.state.selectedIndex / pageSize) + 1;
        const total = Math.ceil(doors.length / pageSize);
        this.socket.emit('ansi-output', `\r\n\x1b[90mPage ${current}/${total}\x1b[0m\r\n`);
      }
    }

    // Footer with commands
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\x1b[33m↑/↓\x1b[0m Navigate  ');
    this.socket.emit('ansi-output', '\x1b[33mENTER\x1b[0m Info  ');
    this.socket.emit('ansi-output', '\x1b[33mU\x1b[0m Upload  ');
    this.socket.emit('ansi-output', '\x1b[33mF\x1b[0m Filter  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit  ');
    this.socket.emit('ansi-output', '\x1b[33mL\x1b[0m Logs\r\n');
    this.socket.emit('ansi-output', '\x1b[90m[H=hot reload; Filter: name/cmd/type; L=reload log]\x1b[0m\r\n');
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

    // Show BBS command prominently if available
    const command = (door as any).command;
    if (command) {
      this.socket.emit('ansi-output', `\x1b[0;36mBBS Command:\x1b[0m \x1b[33m${command}\x1b[0m (Type this command to run the door)\r\n`);
    }

    this.socket.emit('ansi-output', `\x1b[0;36mFile:\x1b[0m ${door.filename}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mType:\x1b[0m ${door.type.toUpperCase()}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mSize:\x1b[0m ${this.formatSize(door.size)}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mDate:\x1b[0m ${door.uploadDate.toLocaleDateString()}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mStatus:\x1b[0m ${door.installed ? '\x1b[32mInstalled\x1b[0m' : '\x1b[31mNot Installed\x1b[0m'}\r\n`);
    const lastStatus = this.state.lastReloadStatus?.[door.id];
    if (lastStatus) {
      this.socket.emit('ansi-output', `\x1b[0;36mLast Reload:\x1b[0m ${lastStatus}\r\n`);
    }
    const lastLog = this.state.lastReloadLog?.[door.id];
    if (lastLog) {
      this.socket.emit('ansi-output', `\x1b[0;36mReload Log:\x1b[0m (press L to view)\r\n`);
    }

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

    if (this.supportsHotReload(door)) {
      this.socket.emit('ansi-output', '\x1b[33mR\x1b[0m Reload  ');
      if (this.state.lastReloadLog?.[door.id]) {
        this.socket.emit('ansi-output', '\x1b[33mL\x1b[0m Log  ');
      }
    }

    this.socket.emit('ansi-output', '\x1b[33mE\x1b[0m Edit .info  ');
    this.socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
  }

  /**
   * Determine if a door supports hot reload (TypeScript/Python/AREXX)
   */
  private supportsHotReload(door: DoorInfo): boolean {
    const type = ((door as any).type || door.type || '').toString().toLowerCase();
    return ['ts', 'typescript', 'js', 'javascript', 'arexx', 'rexx', 'python', 'py'].includes(type);
  }

  /**
   * Show a lightweight log summary for the selected door
   */
  private showLogPanel(): void {
    const doors = this.applyFilter(this.state.filter || '');
    if (doors.length === 0) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mNo doors to show logs for (filter?)\x1b[0m\r\n');
      return;
    }
    const door = doors[Math.max(0, Math.min(this.state.selectedIndex, doors.length - 1))];
    const log = this.state.lastReloadLog?.[door.id];
    const status = this.state.lastReloadStatus?.[door.id];

    this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' DOOR LOG ', 80) + '\x1b[0m\r\n\r\n');
    this.socket.emit('ansi-output', `\x1b[0;36mDoor:\x1b[0m ${door.name}\r\n`);
    this.socket.emit('ansi-output', `\x1b[0;36mStatus:\x1b[0m ${status || 'n/a'}\r\n`);
    this.socket.emit('ansi-output', '\r\n\x1b[0;33mLast Reload Log:\x1b[0m\r\n');
    if (!log) {
      this.socket.emit('ansi-output', '\x1b[90m(no log captured yet)\x1b[0m\r\n');
    } else {
      const lines = log.split(/\r?\n/);
      const tail = lines.slice(-20); // show last 20 lines
      tail.forEach(line => this.socket.emit('ansi-output', `${line}\r\n`));
      if (lines.length > tail.length) {
        this.socket.emit('ansi-output', '\x1b[90m... (truncated)\x1b[0m\r\n');
      }
    }
    this.socket.emit('ansi-output', '\r\n\x1b[33mB\x1b[0m Back    \x1b[33mQ\x1b[0m Quit\r\n');
    this.state.mode = 'docs';
    this.state.docsContent = log || '';
    this.state.scrollOffset = 0;
  }

  /**
   * Apply filter term (case-insensitive substring on name/command/type)
   */
  private applyFilter(term: string): DoorInfo[] {
    const t = term.trim().toLowerCase();
    const all = this.state.doors;
    if (!t) return all;
    return all.filter(d => {
      const name = (d.name || '').toLowerCase();
      const cmd = ((d as any).command || '').toLowerCase();
      const type = ((d as any).type || '').toLowerCase();
      return name.includes(t) || cmd.includes(t) || type.includes(t);
    });
  }

  /**
   * Resolve the working directory for a given door
   */
  private resolveDoorPath(door: DoorInfo): string | null {
    const candidates: string[] = [];

    if ((door as any).resolvedPath) {
      candidates.push((door as any).resolvedPath);
    }
    if ((door as any).location) {
      candidates.push(path.join(this.projectRoot, (door as any).location));
    }
    if ((door as any).doorName) {
      candidates.push(path.join(this.doorsPath, (door as any).doorName));
    }
    if (door.filename) {
      candidates.push(path.join(this.doorsPath, path.basename(door.filename, path.extname(door.filename))));
    }

    for (const candidate of candidates) {
      if (candidate && amigafs.existsSync(candidate)) {
        const stat = amigafs.statSync(candidate);
        if (stat.isDirectory()) {
          return candidate;
        }
        return path.dirname(candidate);
      }
    }

    return null;
  }

  /**
   * Hot reload a door by rebuilding (if applicable) and re-registering the .info
   */
  private async hotReloadDoor(door: DoorInfo): Promise<void> {
    if (!this.supportsHotReload(door)) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mHot reload is only available for TypeScript/Python/AREXX doors\x1b[0m\r\n');
      return;
    }

    const doorPath = this.resolveDoorPath(door);
    if (!doorPath) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mCould not resolve door path for reload\x1b[0m\r\n');
      return;
    }

    const doorName =
      (door as any).doorName ||
      (door as any).command ||
      path.basename(doorPath);

    this.socket.emit('ansi-output', `\r\n\x1b[33mReloading ${doorName}...\x1b[0m\r\n`);

    // Run build if package.json has a build script
    let buildLog = '';
    const appendBuildLog = (chunk: Buffer | string) => {
      buildLog += chunk.toString();
      if (buildLog.length > 5000) {
        buildLog = buildLog.slice(buildLog.length - 5000);
      }
    };

    try {
      const pkgPath = path.join(doorPath, 'package.json');
      if (amigafs.existsSync(pkgPath)) {
        const pkg = JSON.parse(amigafs.readFileSync(pkgPath, 'utf8') as string);
        if (pkg.scripts && pkg.scripts.build) {
          await new Promise<void>((resolve) => {
            this.socket.emit('ansi-output', '\x1b[36m* Running npm run build...\x1b[0m\r\n');
            const proc = spawn('npm', ['run', 'build'], {
              cwd: doorPath,
              stdio: ['ignore', 'pipe', 'pipe']
            });
            proc.stdout?.on('data', data => appendBuildLog(data));
            proc.stderr?.on('data', data => appendBuildLog(data));
            proc.on('exit', () => resolve());
          });
        }
      }
    } catch (err) {
      this.socket.emit('ansi-output', `\x1b[31mBuild step failed: ${(err as Error).message}\x1b[0m\r\n`);
      this.state.lastReloadStatus = {
        ...(this.state.lastReloadStatus || {}),
        [door.id]: `Build failed: ${(err as Error).message}`
      };
      this.state.lastReloadLog = {
        ...(this.state.lastReloadLog || {}),
        [door.id]: buildLog
      };
    }

    // Reinstall to refresh Commands/BBSCmd and local configs
    try {
      await new Promise<void>((resolve) => {
        this.socket.emit('ansi-output', '\x1b[36m* Refreshing door registration...\x1b[0m\r\n');
        const tsNodeProject = path.join(this.projectRoot, 'dev/scripts/tsconfig.json');
        const installDoorScript = path.join(this.projectRoot, 'dev/scripts/install-sdk-doors.ts');
        const proc = spawn('npx', ['ts-node', '-P', tsNodeProject, installDoorScript, '--door', doorName, '--quiet'], {
          cwd: this.projectRoot,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        proc.stdout?.on('data', data => appendBuildLog(data));
        proc.stderr?.on('data', data => appendBuildLog(data));
        proc.on('exit', () => resolve());
      });

      // Refresh door list to pick up size/installed flag
      await this.scanDoors();
      this.state.currentDoor = this.state.doors.find(d => d.name === door.name || (d as any).doorName === (door as any).doorName) || door;

      this.socket.emit('ansi-output', '\x1b[32m* Reload complete\x1b[0m\r\n');
      this.state.lastReloadStatus = {
        ...(this.state.lastReloadStatus || {}),
        [door.id]: 'Success'
      };
      this.state.lastReloadLog = {
        ...(this.state.lastReloadLog || {}),
        [door.id]: buildLog
      };
      this.showInfo();
    } catch (err) {
      this.socket.emit('ansi-output', `\x1b[31mReload failed: ${(err as Error).message}\x1b[0m\r\n`);
      this.state.lastReloadStatus = {
        ...(this.state.lastReloadStatus || {}),
        [door.id]: `Failed: ${(err as Error).message}`
      };
      this.state.lastReloadLog = {
        ...(this.state.lastReloadLog || {}),
        [door.id]: buildLog
      };
    }
  }

  /**
   * Display documentation viewer
   */
  private showDocs(): void {
    if (this.state.docsContent) {
      this.renderDocsContent();
      return;
    }
    if (!this.state.currentDoor) return;
    this.browseArchive();
  }

  /**
   * Render docsContent with simple paging
   */
  private renderDocsContent(): void {
    const content = this.state.docsContent || '';
    const lines = content.split('\n');
    const pageSize = 20;
    const start = this.state.scrollOffset;
    const end = Math.min(start + pageSize, lines.length);

    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' DOOR LOG ', 80) + '\x1b[0m\r\n\r\n');

    for (let i = start; i < end; i++) {
      this.socket.emit('ansi-output', `${lines[i]}\r\n`);
    }

    if (lines.length > pageSize) {
      const current = Math.floor(this.state.scrollOffset / pageSize) + 1;
      const total = Math.ceil(lines.length / pageSize);
      this.socket.emit('ansi-output', `\r\n\x1b[90mPage ${current}/${total}\x1b[0m\r\n`);
    }

    this.socket.emit('ansi-output', '\r\n\x1b[33m↑/↓\x1b[0m Scroll  \x1b[33mB\x1b[0m Back  \x1b[33mQ\x1b[0m Quit\r\n');
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
      // Extract file list from archive (using module function)
      const files = await extractArchiveFileList(this.state.currentDoor.archivePath);

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

  // extractArchiveFileList moved to DoorManagerArchive.ts module

  /**
   * Display archive browser with current directory (delegates to module)
   */
  private showArchiveBrowser(): void {
    renderArchiveBrowser(
      this.socket,
      {
        archiveFiles: this.state.archiveFiles,
        currentPath: this.state.currentPath,
        selectedFileIndex: this.state.selectedFileIndex,
        scrollOffset: this.state.scrollOffset
      },
      this.state.archiveFiles,
      this.formatSize.bind(this),
      this.pad.bind(this)
    );
  }

  /**
   * Get files in current directory path (delegates to module)
   */
  private getFilesInCurrentPath(): ArchiveFileEntry[] {
    return getFilesInCurrentPath(this.state.archiveFiles, this.state.currentPath || '');
  }

  /**
   * View a file from the archive (uses module for content extraction)
   */
  private async viewArchiveFile(file: ArchiveFileEntry): Promise<void> {
    if (!this.state.currentDoor || !this.state.currentDoor.archivePath) return;

    try {
      const content = await extractFileContent(this.state.currentDoor.archivePath, file);
      const fileType: 'text' | 'amigaguide' = file.extension === '.guide' ? 'amigaguide' : 'text';

      this.state.viewingFile = { name: file.name, content, type: fileType };
      this.state.scrollOffset = 0;
      this.state.mode = 'view-file';
      this.showFileViewer();
    } catch (error) {
      this.socket.emit('ansi-output', '\r\n\x1b[31mError reading file: ' + (error as Error).message + '\x1b[0m\r\n');
    }
  }

  /**
   * Display file content viewer (delegates to module)
   */
  private showFileViewer(): void {
    if (!this.state.viewingFile) return;
    renderFileViewer(this.socket, this.state.viewingFile, this.state.scrollOffset, this.pad.bind(this));
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
    this.socket.emit('ansi-output', '  - Commands/BBSCmd/<DOOR>.info (required)\r\n');
    this.socket.emit('ansi-output', '  - Doors/<door>/... (required)\r\n');
    this.socket.emit('ansi-output', '  - TypeScript doors must include package.json\r\n');
    this.socket.emit('ansi-output', '  - Hybrid doors must include dist/client.bundle.js\r\n');
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
    this.socket.emit('ansi-output', '\r\n\x1b[32m* File received: ' + data.originalname + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', `\x1b[36mSize: ${this.formatSize(data.size)}\x1b[0m\r\n`);
    this.socket.emit('ansi-output', '\r\n\x1b[33mAnalyzing archive contents...\x1b[0m\r\n');

    try {
      // Construct archive path (use provided path or construct from archives directory)
      const archivePath = data.path || path.join(this.archivesPath, data.originalname);

      // Verify file exists
      if (!amigafs.existsSync(archivePath)) {
        throw new Error(`Uploaded file not found: ${archivePath}`);
      }

      console.log('[Door Manager] Analyzing archive:', archivePath);

      // 🎯 SMART ANALYSIS: Use AmigaDoorManager to analyze archive
      const amigaDoorMgr = getAmigaDoorManager();
      let analysis;

      try {
        analysis = await amigaDoorMgr.analyzeDoorArchive(archivePath);
      } catch (analyzeError: any) {
        console.error('[Door Manager] analyzeDoorArchive CRASHED:', analyzeError);
        console.error('[Door Manager] Error stack:', analyzeError.stack);
        throw new Error(`Archive analysis crashed: ${analyzeError.message}`);
      }

      if (!analysis) {
        throw new Error('Failed to analyze archive');
      }

      console.log('[Door Manager] Analysis completed successfully');

      // Display analysis results
      this.socket.emit('ansi-output', '\r\n\x1b[36m━━━ Archive Analysis ━━━\x1b[0m\r\n');
      this.socket.emit('ansi-output', `Format: ${analysis.format}\r\n`);
      this.socket.emit('ansi-output', `Files: ${analysis.files.length}\r\n`);

      // Show standard door structure if detected
      if (analysis.isStandardDoorStructure) {
        this.socket.emit('ansi-output', '\r\n\x1b[32m* Standard AmiExpress Door Structure Detected!\x1b[0m\r\n');

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

      if (analysis.isTypeScriptDoor) {
        doorType = 'TypeScript Door';
        if (analysis.typeScriptIssues && analysis.typeScriptIssues.length > 0) {
          suggestion = 'TypeScript door archive is missing required files:\r\n' +
            analysis.typeScriptIssues.map(issue => `\x1b[31m- ${issue}\x1b[0m`).join('\r\n');
          canInstall = false;
        } else {
          suggestion = 'This appears to be a TypeScript door.\r\nReady to install to Commands/BBSCmd/ + Doors/.\r\n\x1b[36mDependencies will be installed via npm\x1b[0m';
          canInstall = true;
        }
      } else if (analysis.isStandardDoorStructure) {
        doorType = 'Standard AmiExpress Door';
        suggestion = 'Ready to install to BBS structure!\r\n\x1b[36mCommands will be copied to Commands/BBSCmd/\x1b[0m\r\n\x1b[36mExecutables will be copied to Doors/\x1b[0m\r\n* Will run via 68000 CPU emulation!';
        canInstall = true;
      } else if (analysis.isAREXXDoor) {
        doorType = 'AREXX Script Door';
        suggestion = 'This is an AREXX script door.\r\nCan be installed and executed via AREXX interpreter.';
        canInstall = true;
      } else if (analysis.infoFiles.length > 0 && analysis.executables.length > 0) {
        doorType = 'Amiga Binary Door';
        suggestion = 'This is a native Amiga door with binary executables.\r\n* Will run via 68000 CPU emulation!';
        canInstall = true;
      } else if (analysis.hasSourceCode) {
        doorType = 'Source Code Archive';
        const sourceTypes = [];
        if (analysis.sourceFiles.some(f => f.endsWith('.s') || f.endsWith('.asm'))) sourceTypes.push('Assembler');
        if (analysis.sourceFiles.some(f => f.endsWith('.c'))) sourceTypes.push('C');
        if (analysis.sourceFiles.some(f => f.endsWith('.e'))) sourceTypes.push('E');
        if (analysis.sourceFiles.some(f => f.endsWith('.rexx'))) sourceTypes.push('AREXX');

        suggestion = `Contains source code: ${sourceTypes.join(', ')}\r\n\x1b[33m! Requires manual porting to TypeScript.\x1b[0m`;
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
      console.error('[Door Manager] processUpload ERROR:', error);
      console.error('[Door Manager] Error stack:', (error as Error).stack);
      console.error('[Door Manager] Error details:', {
        message: (error as Error).message,
        name: (error as Error).name,
        toString: error?.toString()
      });

      this.socket.emit('ansi-output', '\r\n\x1b[31mX Error processing upload: ' + (error as Error).message + '\x1b[0m\r\n');
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

    this.socket.emit('ansi-output', '\r\n\x1b[33mInstalling ' + door.name + '...\x1b[0m\r\n\r\n');

    try {
      const amigaDoorMgr = getAmigaDoorManager();
      const result = await amigaDoorMgr.installDoor(door.archivePath);

      if (result.success) {
        this.socket.emit('ansi-output', '\x1b[32m* ' + result.message + '\x1b[0m\r\n');

        if (result.door) {
          this.socket.emit('ansi-output', '\r\n\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
          this.socket.emit('ansi-output', `\x1b[0;36mBBS Command:\x1b[0m \x1b[33m${result.door.command}\x1b[0m\r\n`);
          this.socket.emit('ansi-output', `\x1b[90m(Type this command to run the door)\x1b[0m\r\n`);
          this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
          this.socket.emit('ansi-output', `\r\n\x1b[0;36mLocation:\x1b[0m ${result.door.location}\r\n`);
          if (result.door.type) {
            this.socket.emit('ansi-output', `\x1b[0;36mType:\x1b[0m ${result.door.type}\r\n`);
          }
        }

        if (analysis.libraries.length > 0) {
          this.socket.emit('ansi-output', `\r\n\x1b[36m* Installed ${analysis.libraries.length} library file(s) to Libs/\x1b[0m\r\n`);
        }

        this.socket.emit('ansi-output', '\r\n\x1b[32m* Installation complete!\x1b[0m\r\n');
      } else {
        this.socket.emit('ansi-output', '\x1b[31mX ' + result.message + '\x1b[0m\r\n');
      }

    } catch (error) {
      this.socket.emit('ansi-output', '\x1b[31mX Installation error: ' + (error as Error).message + '\x1b[0m\r\n');
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
            amigafs.chmodSync(targetPath, 0o755);
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

    // Use 'once' to avoid conflict with main input handler
    this.socket.once('command', () => {
      this.showInfo();
    });
  }

  /**
   * Uninstall a door
   */
  private async uninstallDoor(door: DoorInfo): Promise<void> {
    this.socket.emit('ansi-output', '\r\n\x1b[33mUninstalling ' + door.name + '...\x1b[0m\r\n');

    try {
      const doorPath = path.join(this.doorsPath, door.filename);

      if (amigafs.existsSync(doorPath)) {
        amigafs.unlinkSync(doorPath);
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

    // Use 'once' to avoid conflict with main input handler
    this.socket.once('command', () => {
      this.showInfo();
    });
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
      case 'edit-info':
        this.handleInfoEditorInput(key, data);
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

    // F - Filter
    if (key === 'f') {
      this.promptFilter();
      return;
    }

    // Q - Quit
    if (key === 'q') {
      this.cleanup();
      this.socket.emit('door-exit');
      return;
    }

    // L - Logs
    if (key === 'l') {
      this.showLogPanel();
      return;
    }
  }

  /**
   * Prompt for filter term
   */
  private promptFilter(): void {
    this.socket.emit('ansi-output', '\r\n\x1b[0;33mEnter filter (name/cmd/type), or blank to clear:\x1b[0m ');

    const onInput = (data: string) => {
      this.socket.off('command', onInput);
      const term = data.trim();
      this.state.filter = term.length > 0 ? term : undefined;
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.showList();
    };

    this.socket.once('command', onInput);
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

    // R - Hot reload (TS/Python/AREXX)
    if (key === 'r' && this.supportsHotReload(door)) {
      this.hotReloadDoor(door);
      return;
    }

    // L - View last reload log
    if (key === 'l' && this.supportsHotReload(door) && this.state.lastReloadLog?.[door.id]) {
      this.state.docsContent = this.state.lastReloadLog?.[door.id] || '';
      this.state.scrollOffset = 0;
      this.state.mode = 'docs';
      this.showDocs();
      return;
    }

    // E - Edit .info file
    if (key === 'e') {
      this.openInfoEditor();
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

    // Q - quit out of log panel back to list
    if (key === 'q' && this.state.mode === 'docs') {
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
   * Utility: Calculate total size of directory recursively
   * Skips node_modules and .git to prevent hanging on large directories
   */
  private calculateDirectorySize(dirPath: string, depth: number = 0): number {
    // Limit recursion depth to prevent hanging
    if (depth > 5) return 0;

    let totalSize = 0;
    try {
      const entries = amigafs.readdirSync(dirPath);
      for (const name of entries) {
        // Skip problematic directories
        if (name === 'node_modules' || name === '.git' || name === 'dist') {
          continue;
        }
        const fullPath = path.join(dirPath, name);
        try {
          const stats = amigafs.statSync(fullPath);
          if (stats.isDirectory()) {
            totalSize += this.calculateDirectorySize(fullPath, depth + 1);
          } else {
            totalSize += stats.size;
          }
        } catch (error) {
          // Skip files we can't read
          continue;
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
    }
    return totalSize;
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
   * Open the .info file editor for the current door
   */
  private openInfoEditor(): void {
    const door = this.state.currentDoor;
    if (!door) return;

    const infoPath = findInfoFile(door.id, this.doorsPath, this.projectRoot);

    if (!infoPath) {
      this.socket.emit('ansi-output', '\r\n\x1b[33mNo .info file found for this door.\x1b[0m\r\n');
      this.socket.emit('ansi-output', 'Press any key to continue...\r\n');
      return;
    }

    try {
      this.state.infoEditorState = openInfoFile(infoPath);
      this.state.mode = 'edit-info';
      renderInfoEditor(this.socket, this.state.infoEditorState);
    } catch (error) {
      this.socket.emit('ansi-output', `\r\n\x1b[31mError parsing .info file: ${(error as Error).message}\x1b[0m\r\n`);
      this.socket.emit('ansi-output', 'Press any key to continue...\r\n');
    }
  }

  /**
   * Handle input in .info editor mode (delegates to module)
   */
  private handleInfoEditorInput(key: string, rawData: string): void {
    if (!this.state.infoEditorState) {
      this.state.mode = 'info';
      this.showInfo();
      return;
    }

    const callbacks = {
      onBack: () => {
        this.state.mode = 'info';
        this.state.infoEditorState = undefined;
        this.showInfo();
      },
      onQuit: () => {
        this.state.infoEditorState = undefined;
        this.cleanup();
        this.socket.emit('door-exit');
      }
    };

    this.state.infoEditorState = handleInfoEditorInput(
      key,
      rawData,
      this.state.infoEditorState,
      this.socket,
      callbacks
    );
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
