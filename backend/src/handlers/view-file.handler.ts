/**
 * View File Handler
 * Port from express.e:25675 (internalCommandV)
 * Port from express.e:20388 (viewAFile)
 *
 * Handles file viewing (text files only)
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * View File Handler
 * Displays text file contents
 */
export class ViewFileHandler {
  /**
   * Handle V command - View a File
   * Port from express.e:25675-25687 (internalCommandV)
   */
  static async handleViewFileCommand(
    socket: Socket,
    session: BBSSession,
    params: string = ''
  ): Promise<void> {
    // Check security - express.e:25676
    if (!checkSecurity(session.user, ACSPermission.VIEW_A_FILE)) {
      socket.emit('ansi-output', '\x1b[31mPermission denied.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // setEnvStat(ENV_VIEWING) - express.e:25678
    console.log('[ENV] Viewing');

    // RIP mode handling (express.e:25679-25681) - not applicable for web
    // aePuts('[1!') / aePuts('[2!')

    // Call viewAFile - express.e:25682
    await this.viewAFile(socket, session, params);
  }

  /**
   * View a file - main viewing logic
   * Port from express.e:20388-20550 (viewAFile)
   */
  private static async viewAFile(
    socket: Socket,
    session: BBSSession,
    params: string
  ): Promise<void> {
    const config = (global as any).config;

    // express.e:20394-20395
    socket.emit('ansi-output', '\r\n');

    // Check if conference has files - express.e:20396-20399
    // maxDirs check - for now assume conferences have files
    // TODO: Implement maxDirs checking

    // Parse parameters - express.e:20401
    const paramParts = params.trim().toUpperCase().split(/\s+/);
    const hasNonStop = paramParts.includes('NS');

    // Get filename from params or prompt - express.e:20403-20419
    let filename = '';

    if (paramParts.length > 0 && paramParts[0] !== 'NS') {
      filename = paramParts[0];
    } else {
      // No filename provided - prompt user
      socket.emit('ansi-output', '\x1b[36mEnter filename of file to view? \x1b[0m');
      session.subState = LoggedOnSubState.VIEW_FILE_INPUT;
      session.tempData = {
        waitingForViewFilename: true,
        nonStopDisplay: hasNonStop
      };
      return;
    }

    // Validate and display file
    await this.displayFile(socket, session, filename, hasNonStop);
  }

  /**
   * Handle filename input continuation
   */
  static async handleFilenameInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (session.tempData?.waitingForViewFilename) {
      session.tempData.waitingForViewFilename = false;
      const nonStop = session.tempData.nonStopDisplay || false;

      if (!input.trim()) {
        // Empty input - cancel - express.e:20417-20419
        socket.emit('ansi-output', '\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Process the filename
      await this.displayFile(socket, session, input.trim(), nonStop);
    }
  }

  /**
   * Display file contents
   * Port from express.e:20421-20550
   */
  private static async displayFile(
    socket: Socket,
    session: BBSSession,
    filename: string,
    nonStop: boolean
  ): Promise<void> {
    const config = (global as any).config;

    // Validate filename - no special symbols - express.e:20460-20467
    if (!this.isValidFilename(filename)) {
      socket.emit('ansi-output', '\r\n\x1b[31mYou may not include any special symbols\x1b[0m\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Search for file in conference directories - express.e:20469-20475
    const fileInfo = await this.findFileInConference(
      config.get('dataDir'),
      session.currentConf || 1,
      filename
    );

    if (!fileInfo) {
      socket.emit('ansi-output', `\r\n\x1b[31mFile ${filename} not found.\x1b[0m\r\n\r\n`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Check if file is restricted - express.e:20477-20484
    if (this.isRestrictedFile(fileInfo.fullPath)) {
      socket.emit('ansi-output', '\r\n\x1b[31mAttempt to read RESTRICTED file denied\x1b[0m\r\n');
      socket.emit('ansi-output', 'Updating Callerslog\r\n');
      console.log(`[SECURITY] User ${session.user?.username} attempted to read restricted file: ${filename}`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Check if file is text (not binary) - express.e:20486-20491
    const isBinary = await this.isBinaryFile(fileInfo.fullPath);
    if (isBinary) {
      socket.emit('ansi-output', '\r\n\x1b[31mThis file is not a text file.\x1b[0m\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Display file contents - express.e:20492-20541
    socket.emit('ansi-output', `\r\n\x1b[32mViewing: ${filename}\x1b[0m\r\n\r\n`);

    try {
      const fileStream = fs.createReadStream(fileInfo.fullPath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let lineCount = 0;
      const linesPerPage = 20;

      for await (const line of rl) {
        // Display line with wrapping at 79 characters - express.e:20492-20516
        await this.displayLineWithWrapping(socket, line);

        lineCount++;

        // Check for pause - express.e:20517-20527
        if (!nonStop && lineCount % linesPerPage === 0) {
          // TODO: Implement pause functionality
          // For now, just continue
        }
      }

      socket.emit('ansi-output', '\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;

    } catch (error) {
      console.error('[VIEW FILE] Error reading file:', error);
      socket.emit('ansi-output', '\r\n\x1b[31mError reading file.\x1b[0m\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
  }

  /**
   * Display line with wrapping at 79 characters
   * Port from express.e:20492-20516
   */
  private static async displayLineWithWrapping(
    socket: Socket,
    line: string
  ): Promise<void> {
    // If line has CR or is short, display as-is - express.e:20494-20495
    if (line.includes('\r') || line.length < 80) {
      socket.emit('ansi-output', line + '\r\n');
      return;
    }

    // Wrap long lines at 79 characters - express.e:20497-20514
    let remaining = line;
    while (remaining.length > 0) {
      if (remaining.length > 79) {
        const chunk = remaining.substring(0, 79);
        socket.emit('ansi-output', chunk);
        remaining = remaining.substring(79);

        if (remaining.length > 0) {
          socket.emit('ansi-output', '\r\n');
        }
      } else {
        socket.emit('ansi-output', remaining);
        remaining = '';
      }
    }
    socket.emit('ansi-output', '\r\n');
  }

  /**
   * Find file in conference directories
   * Searches DLPATH.1, DLPATH.2, etc. - express.e:20469-20475
   */
  private static async findFileInConference(
    dataDir: string,
    confNum: number,
    filename: string
  ): Promise<any | null> {
    const confPath = path.join(dataDir, 'BBS', `Conf${String(confNum).padStart(2, '0')}`);

    // Search through all DIR# directories
    for (let dirNum = 1; dirNum <= 20; dirNum++) {
      const dirPath = path.join(confPath, `Dir${dirNum}`);

      if (!fs.existsSync(dirPath)) continue;

      const filePath = path.join(dirPath, filename);

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);

        return {
          name: filename,
          size: stats.size,
          confNum: confNum,
          dirNum: dirNum,
          fullPath: filePath
        };
      }
    }

    return null;
  }

  /**
   * Validate filename - no special symbols
   * express.e:20460-20467
   */
  private static isValidFilename(filename: string): boolean {
    // Check for special symbols: : / * @
    if (filename.includes(':') ||
        filename.includes('/') ||
        filename.includes('*') ||
        filename.includes('@') ||
        filename.includes('\\')) {
      return false;
    }

    return true;
  }

  /**
   * Check if file is restricted
   * express.e:20477-20484
   */
  private static isRestrictedFile(filePath: string): boolean {
    // Check for restricted paths/files
    const restrictedPaths = [
      '/etc/',
      '/usr/',
      '/bin/',
      '/sbin/',
      'passwd',
      'shadow',
      '.conf',
      '.env'
    ];

    const lowerPath = filePath.toLowerCase();
    return restrictedPaths.some(restricted => lowerPath.includes(restricted));
  }

  /**
   * Check if file is binary (not text)
   * express.e:20486-20491
   */
  private static async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = Buffer.alloc(3);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 3, 0);
      fs.closeSync(fd);

      // Check if first 3 bytes are > 128 (binary indicator)
      // express.e:20486-20489
      if (buffer[0] > 128 || buffer[1] > 128 || buffer[2] > 128) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[VIEW FILE] Error checking binary:', error);
      return true; // Assume binary if error
    }
  }
}
