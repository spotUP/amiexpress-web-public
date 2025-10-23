/**
 * File Status Handler
 * Port from express.e:24141-24250 (fileStatus function)
 *
 * Displays upload/download statistics per conference
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';

/**
 * FS Command - File Status
 * Port from express.e:24872-24875 (internalCommandFS)
 * Port from express.e:24141-24250 (fileStatus)
 */
export class FileStatusHandler {
  /**
   * Handle FS command - Display file statistics
   * express.e:24872-24875
   */
  static async handleFileStatusCommand(
    socket: Socket,
    session: BBSSession
  ): Promise<void> {
    // Check security - express.e:24873
    if (!checkSecurity(session.user, ACSPermission.CONFERENCE_ACCOUNTING)) {
      socket.emit('ansi-output', '\x1b[31mPermission denied.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Call fileStatus(0) - express.e:24874
    await this.displayFileStatus(socket, session, false);

    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Display file status - Port from express.e:24141-24250
   *
   * @param socket - Socket connection
   * @param session - User session
   * @param currentOnly - If true, show only current conference (opt=1 in express.e)
   */
  private static async displayFileStatus(
    socket: Socket,
    session: BBSSession,
    currentOnly: boolean
  ): Promise<void> {
    const user = session.user;
    if (!user) return;

    // Get system configuration
    const config = (global as any).config;
    const totalConferences = 3; // TODO: Get from config
    const currentConf = session.currentConf || 1;

    // Check if user has conference accounting access
    const hasConfAccounting = checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING);

    // Display header - express.e:24151-24157
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '\x1b[32m              Uploads                 Downloads\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n');

    // TODO: Check sopt.toggles[TOGGLES_CREDITBYKB] for KB vs Bytes display
    const creditByKB = false; // Default to bytes for now

    if (creditByKB) {
      socket.emit('ansi-output', '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio\x1b[0m\r\n');
    } else {
      socket.emit('ansi-output', '\x1b[32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\x1b[0m\r\n');
    }
    socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\x1b[0m\r\n');

    // Determine which conferences to show - express.e:24161
    const startConf = currentOnly ? currentConf : 1;
    const endConf = currentOnly ? currentConf : totalConferences;

    // Loop through conferences - express.e:24163-24190
    for (let confNum = startConf; confNum <= endConf; confNum++) {
      // Skip if not current conference and no accounting access
      if (!currentOnly && confNum !== currentConf && !hasConfAccounting) {
        continue;
      }

      // TODO: Check conference access with checkConfAccess()

      // Format uploads
      const uploadsCount = user.uploads || 0;
      const uploadBytes = user.bytesUpload || 0;
      const uploadBytesStr = creditByKB
        ? this.formatKBytes(uploadBytes)
        : this.formatBytes(uploadBytes);

      // Format downloads
      const downloadsCount = user.downloads || 0;
      const downloadBytes = user.bytesDownload || 0;
      const downloadBytesStr = creditByKB
        ? this.formatKBytes(downloadBytes)
        : this.formatBytes(downloadBytes);

      // Calculate available bytes - express.e:24174-24178
      const todaysBytesLimit = user.todaysBytesLimit || 0;
      const dailyBytesDld = user.dailyBytesDld || 0;
      let bytesAvailStr: string;

      if (todaysBytesLimit === 0) {
        bytesAvailStr = 'Infinite';
      } else {
        const bytesAvail = todaysBytesLimit - dailyBytesDld;
        bytesAvailStr = creditByKB
          ? this.formatKBytes(bytesAvail)
          : this.formatBytes(bytesAvail);
      }

      // Get ratio - express.e:24181-24187
      const ratio = user.ratio || 0;
      const secLibrary = user.secLibrary || 0;

      // Determine color - highlight current conference - express.e:24165
      const color = (confNum === currentConf) ? '33' : '0'; // 33=yellow, 0=white
      const indicator = (confNum === currentConf) ? '>' : ' ';

      // Format conference display - express.e:24181-24187
      const confDisplay = String(confNum).padStart(4, ' ');
      const uploadsDisplay = String(uploadsCount & 0xFFFF).padEnd(7, ' ');
      const uploadBytesDisplay = uploadBytesStr.padStart(14, ' ');
      const downloadsDisplay = String(downloadsCount & 0xFFFF).padEnd(7, ' ');
      const downloadBytesDisplay = downloadBytesStr.padStart(14, ' ');
      const bytesAvailDisplay = bytesAvailStr.padStart(9, ' ');

      // Display line
      if (secLibrary > 0) {
        // Library enabled - show ratio - express.e:24181-24183
        const ratioDisplay = `${ratio}:1`;
        socket.emit('ansi-output',
          `\x1b[${color}m    ${confDisplay}${indicator} \x1b[3${color.charAt(0)}m` +
          `${uploadsDisplay}  ${uploadBytesDisplay} ${downloadsDisplay}  ${downloadBytesDisplay}   ` +
          `${bytesAvailDisplay}   ${ratioDisplay}\x1b[0m\r\n`
        );
      } else {
        // Library disabled - express.e:24185-24187
        socket.emit('ansi-output',
          `\x1b[${color}m    ${confDisplay}${indicator} \x1b[3${color.charAt(0)}m` +
          `${uploadsDisplay}  ${uploadBytesDisplay} ${downloadsDisplay}  ${downloadBytesDisplay}   ` +
          `${bytesAvailDisplay}  \x1b[31mDSBLD\x1b[0m\r\n`
        );
      }
    }

    socket.emit('ansi-output', '\x1b[0m\r\n');
  }

  /**
   * Format bytes for display
   */
  private static formatBytes(bytes: number): string {
    if (bytes < 0) return '0';
    return String(bytes);
  }

  /**
   * Format kilobytes for display (bytes / 1024)
   */
  private static formatKBytes(bytes: number): string {
    if (bytes < 0) return '0';
    const kb = Math.floor(bytes / 1024);
    return String(kb);
  }

  /**
   * Format BCD value for display (future enhancement)
   * Express.e uses formatBCD() for precise byte tracking
   */
  private static formatBCD(bcdValue: bigint): string {
    // For now, just convert to string
    // TODO: Implement proper BCD formatting if needed
    return String(bcdValue);
  }
}
