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

interface DoorManagerState {
  mode: 'list' | 'info' | 'upload' | 'docs';
  selectedIndex: number;
  doors: DoorInfo[];
  currentDoor?: DoorInfo;
  uploadBuffer?: Buffer;
  uploadFilename?: string;
  docsContent?: string;
  scrollOffset: number;
}

export class DoorManager {
  private socket: Socket;
  private session: any;
  private state: DoorManagerState;
  private doorsPath: string;
  private archivesPath: string;

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
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
    await this.scanDoors();
    this.showList();
    this.setupInputHandlers();
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
                         lowerArchive.endsWith('.lzh');

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
   * Supports: ZIP, LHA, LZH
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
      } else if (ext === '.lha' || ext === '.lzh') {
        // Handle LHA/LZH archives with lha-extractor
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
    if (!this.state.currentDoor || !this.state.docsContent) return;

    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

    // Header
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' DOCUMENTATION ', 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');

    // Show content with paging
    const lines = this.state.docsContent.split('\n');
    const pageSize = 20;
    const start = this.state.scrollOffset;
    const end = Math.min(start + pageSize, lines.length);

    for (let i = start; i < end; i++) {
      this.socket.emit('ansi-output', `${lines[i]}\r\n`);
    }

    // Footer
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', '\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', `\x1b[90mLine ${start + 1}-${end} of ${lines.length}\x1b[0m\r\n`);
    this.socket.emit('ansi-output', '\x1b[33m↑/↓\x1b[0m Scroll  ');
    this.socket.emit('ansi-output', '\x1b[33mB\x1b[0m Back  ');
    this.socket.emit('ansi-output', '\x1b[33mQ\x1b[0m Quit\r\n');
  }

  /**
   * Handle upload prompt
   */
  private async handleUpload(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
    this.socket.emit('ansi-output', '\x1b[0;37;44m' + this.pad(' UPLOAD DOOR ', 80) + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\r\n');
    this.socket.emit('ansi-output', 'Upload a door archive (ZIP format)\r\n\r\n');
    this.socket.emit('ansi-output', 'The archive should contain:\r\n');
    this.socket.emit('ansi-output', '  - Door executable (.ts, .js, or Amiga binary)\r\n');
    this.socket.emit('ansi-output', '  - FILE_ID.DIZ (optional, but recommended)\r\n');
    this.socket.emit('ansi-output', '  - README.TXT or similar documentation (optional)\r\n\r\n');

    // Trigger file picker on frontend
    this.socket.emit('show-file-upload', {
      accept: '.zip',
      maxSize: 10 * 1024 * 1024, // 10MB
      uploadUrl: '/api/upload/door',
      fieldName: 'door'
    });

    this.socket.emit('ansi-output', '\x1b[33mA file picker has opened in your browser.\x1b[0m\r\n');
    this.socket.emit('ansi-output', '\x1b[36mSelect a ZIP file to upload...\x1b[0m\r\n\r\n');
    this.socket.emit('ansi-output', '\x1b[90mPress Q to cancel\x1b[0m\r\n');
  }

  /**
   * Process uploaded file
   */
  private async processUpload(data: { filename: string; originalname: string; size: number }): Promise<void> {
    this.socket.emit('ansi-output', '\r\n\x1b[32m✓ File received: ' + data.originalname + '\x1b[0m\r\n');
    this.socket.emit('ansi-output', `\x1b[36mSize: ${this.formatSize(data.size)}\x1b[0m\r\n`);
    this.socket.emit('ansi-output', 'Processing...\r\n');

    try {
      // Re-scan doors to include new upload
      await this.scanDoors();

      // Find the newly uploaded door (using originalname for matching)
      const newDoor = this.state.doors.find(d =>
        d.filename === data.filename || d.filename === data.originalname
      );

      if (newDoor) {
        this.socket.emit('ansi-output', '\x1b[32m✓ Upload successful!\x1b[0m\r\n\r\n');
        this.socket.emit('ansi-output', 'Press any key to view door information...\r\n');

        // Set as current door and switch to info mode
        this.state.currentDoor = newDoor;

        // Wait for keypress then show info
        const showInfoOnce = (data: string) => {
          this.socket.off('terminal-input', showInfoOnce);
          this.state.mode = 'info';
          this.showInfo();
        };
        this.socket.on('terminal-input', showInfoOnce);
      } else {
        throw new Error('Could not find uploaded door in archive');
      }

    } catch (error) {
      this.socket.emit('ansi-output', '\x1b[31m✗ Error processing upload: ' + (error as Error).message + '\x1b[0m\r\n');
      this.socket.emit('ansi-output', 'Press any key to return to door list...\r\n');

      const returnToList = (data: string) => {
        this.socket.off('terminal-input', returnToList);
        this.state.mode = 'list';
        this.showList();
      };
      this.socket.on('terminal-input', returnToList);
    }
  }

  /**
   * Install a door
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
      this.socket.off('terminal-input', continueHandler);
      this.showInfo();
    };
    this.socket.on('terminal-input', continueHandler);
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
      this.socket.off('terminal-input', continueHandler);
      this.showInfo();
    };
    this.socket.on('terminal-input', continueHandler);
  }

  /**
   * Setup input handlers
   */
  private setupInputHandlers(): void {
    this.socket.on('terminal-input', (data: string) => {
      this.handleInput(data);
    });

    // Handle file uploads from frontend
    this.socket.on('file-uploaded', (data: { filename: string; originalname: string; size: number }) => {
      this.processUpload(data);
    });
  }

  /**
   * Handle keyboard input
   */
  private handleInput(data: string): void {
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
  const manager = new DoorManager(socket, session);
  await manager.start();
}
