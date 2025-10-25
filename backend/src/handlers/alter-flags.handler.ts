/**
 * Alter Flags Handler
 * Port from express.e:24601-24605 (internalCommandA)
 * Port from express.e:12648-12664 (alterFlags)
 * Port from express.e:12594-12645 (flagFiles)
 *
 * Interactive file flagging for batch downloads
 */

import { Socket } from 'socket.io';
import { config } from '../config';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { FileFlagManager, getFlagFilesPrompt, getClearFlagsPrompt, getShowFlagsMessage } from '../utils/file-flag.util';

/**
 * Alter Flags Handler
 * Manages file flagging for batch downloads
 */
export class AlterFlagsHandler {
  /**
   * Handle A command - Alter Flags
   * Port from express.e:24601-24605 (internalCommandA)
   */
  static async handleAlterFlagsCommand(
    socket: Socket,
    session: BBSSession,
    params: string = ''
  ): Promise<void> {
    // Check security - express.e:24602
    if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
      socket.emit('ansi-output', '\x1b[31mPermission denied.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // setEnvStat(ENV_FILES) - express.e:24603
    console.log('[ENV] Files');

    // Initialize flag manager if not exists
    if (!session.flagManager) {
      session.flagManager = new FileFlagManager(
        config.get('dataDir'),
        session.user?.slotNumber || 0,
        0 // node number
      );
      await session.flagManager.load();
    }

    // Call alterFlags - express.e:24604
    await this.alterFlags(socket, session, params);
  }

  /**
   * Alter flags implementation
   * Port from express.e:12648-12664 (alterFlags)
   */
  private static async alterFlags(
    socket: Socket,
    session: BBSSession,
    params: string
  ): Promise<void> {
    const manager = session.flagManager;
    if (!manager) return;

    // express.e:12651
    socket.emit('ansi-output', '\r\n');

    if (params.length > 0) {
      // Parameters provided - process directly - express.e:12652-12659
      const result = await this.flagFiles(socket, session, params);
      if (result < 0) return; // Error or carrier lost

      // Continue prompting while flagFiles returns non-zero
      while (result > 0) {
        const nextResult = await this.flagFiles(socket, session, '');
        if (nextResult <= 0) break;
      }
    } else {
      // No parameters - enter interactive mode - express.e:12660-12663
      let result = 0;
      do {
        result = await this.flagFiles(socket, session, '');
        if (result < 0) return; // Error or carrier lost
      } while (result !== 0);
    }

    // express.e:12664
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Flag files function
   * Port from express.e:12594-12645 (flagFiles)
   *
   * Returns:
   * - <0: Error or carrier lost
   * - 0: User pressed Enter (done)
   * - 1: Command processed, continue
   * - 2: File(s) added
   */
  private static async flagFiles(
    socket: Socket,
    session: BBSSession,
    inputStr: string | null
  ): Promise<number> {
    const manager = session.flagManager;
    if (!manager) return 0;

    // Show current flags if no input provided - express.e:12596
    if (!inputStr) {
      socket.emit('ansi-output', getShowFlagsMessage(manager));
    }

    let input = inputStr;

    // Prompt for input if not provided - express.e:12598-12601
    if (!input) {
      socket.emit('ansi-output', getFlagFilesPrompt());

      // Set state to wait for input
      session.subState = LoggedOnSubState.FLAG_INPUT;
      session.tempData = { waitingForFlag: true };
      return 0; // Will be called again with user input
    }

    // Process input - express.e:12603-12644

    // Empty input = done - express.e:12603
    if (input.length === 0) {
      return 0;
    }

    const firstChar = input[0].toUpperCase();
    const restOfInput = input.length > 1 ? input.substring(2) : '';

    // C = Clear flags - express.e:12604-12623
    if ((firstChar === 'C') && (input.length === 1 || input[1] === ' ')) {
      let clearInput = restOfInput;

      // If no filename specified after C, prompt for it - express.e:12607-12612
      if (input.length === 1 || input[1] !== ' ') {
        socket.emit('ansi-output', getShowFlagsMessage(manager));
        socket.emit('ansi-output', getClearFlagsPrompt());

        session.subState = LoggedOnSubState.FLAG_CLEAR_INPUT;
        session.tempData = { waitingForClear: true };
        return 0; // Wait for input
      }

      // Process clear command - express.e:12614-12621
      if (clearInput.length === 0) {
        return 0; // Enter pressed, cancel
      }

      socket.emit('ansi-output', '\r\n');

      const upperInput = clearInput.toUpperCase();
      if (upperInput[0] === '*') {
        // Clear all - express.e:12620
        manager.clearAll();
      } else {
        // Clear specific file - express.e:12620
        manager.removeFlag(clearInput, session.currentConf || -1);
      }

      return 1; // Continue prompting
    }

    // F = Flag from specific file onwards - express.e:12624-12638
    if ((firstChar === 'F') && (input.length === 1 || input[1] === ' ')) {
      let fromInput = restOfInput;

      // If no filename specified, prompt - express.e:12625-12629
      if (input.length === 1 || input[1] !== ' ') {
        socket.emit('ansi-output', '\x1b[36mFilename to start flagging from: \x1b[0m');

        session.subState = LoggedOnSubState.FLAG_FROM_INPUT;
        session.tempData = { waitingForFlagFrom: true };
        return 0; // Wait for input
      }

      if (fromInput.length === 0) {
        return 0; // Enter pressed, cancel
      }

      // Flag from this file onwards
      // TODO: Implement flagFrom() functionality
      // For now, just flag the single file
      manager.addFlag(fromInput, session.currentConf || -1);
      return 1;
    }

    // Default: Add file(s) to flag list - express.e:12639-12644
    const result = manager.addFlags(input, session.currentConf || -1);

    if (result > 0) {
      // Files added - express.e:12641
      return 2; // File(s) added, return to prompt
    } else {
      // No files added (already flagged) - express.e:12643
      return 1; // Continue prompting
    }
  }

  /**
   * Handle flag input continuation
   */
  static async handleFlagInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (session.tempData?.waitingForFlag) {
      session.tempData.waitingForFlag = false;
      const result = await this.flagFiles(socket, session, input);

      if (result === 0) {
        // Done
        socket.emit('ansi-output', '\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      } else {
        // Continue
        await this.flagFiles(socket, session, '');
      }
    } else if (session.tempData?.waitingForClear) {
      session.tempData.waitingForClear = false;

      // Process clear
      const manager = session.flagManager;
      if (manager) {
        if (input.trim().toUpperCase() === '*') {
          manager.clearAll();
        } else if (input.trim().length > 0) {
          manager.removeFlag(input.trim(), session.currentConf || -1);
        }
      }

      // Continue prompting
      await this.flagFiles(socket, session, '');
    } else if (session.tempData?.waitingForFlagFrom) {
      session.tempData.waitingForFlagFrom = false;

      // Process flag from
      const manager = session.flagManager;
      if (manager && input.trim().length > 0) {
        manager.addFlag(input.trim(), session.currentConf || -1);
      }

      // Continue prompting
      await this.flagFiles(socket, session, '');
    }
  }
}
