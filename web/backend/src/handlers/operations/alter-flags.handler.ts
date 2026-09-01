/**
 * Alter Flags Handler
 * Port from express.e:24601-24605 (internalCommandA)
 * Port from express.e:12648-12664 (alterFlags)
 * Port from express.e:12594-12645 (flagFiles)
 *
 * Interactive file flagging for batch downloads
 */

import { Socket } from 'socket.io';
import { config } from '../../config';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { FileFlagManager, getFlagFilesPrompt, getClearFlagsPrompt, getShowFlagsMessage } from '../../utils/file-flag.util';

/**
 * Alter Flags Handler
 * Manages file flagging for batch downloads
 */
export class AlterFlagsHandler {
  /**
   * flagFiles() printed a prompt and is waiting for the user to answer it.
   *
   * express.e has no such state: lineInput() BLOCKS (express.e:12599), so
   * flagFiles only ever returns once the user has already replied, and 0
   * unambiguously means "pressed Enter, done". Splitting that blocking read
   * into a state machine gave 0 a second meaning, and both callers read it
   * as the first one - so the moment the prompt appeared, alterFlags
   * believed the user had finished: it emitted its closing newline
   * (express.e:12664), which put the cursor on the line BELOW the prompt,
   * and set subState back to DISPLAY_MENU, so what the user then typed was
   * never read as flag input at all.
   *
   * Reported as "prompt is positioned wrong".
   */
  private static readonly WAITING_FOR_INPUT = 3;

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
      // Parameters provided - process directly - express.e:12652-12656
      let result = await this.flagFiles(socket, session, params);
      if (result < 0) return; // Error or carrier lost
      if (result === this.WAITING_FOR_INPUT) return; // resumed by handleFlagInput

      // express.e:12654-12656 WHILE(stat) stat:=flagFiles(NIL)
      while (result > 0) {
        result = await this.flagFiles(socket, session, null);
        if (result < 0) return;
        if (result === this.WAITING_FOR_INPUT) return;
      }
    } else {
      // No parameters - enter interactive mode - express.e:12658-12661
      let result = 0;
      do {
        result = await this.flagFiles(socket, session, null);
        if (result < 0) return; // Error or carrier lost
        // The prompt is up. Everything below is what express.e does AFTER
        // lineInput() returns, so none of it may run yet.
        if (result === this.WAITING_FOR_INPUT) return;
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
    inputStr: string | null,
    /**
     * express.e calls showFlags() once on entry (express.e:12598) and then
     * jumps back to the PROMPT after a successful add (express.e:12651
     * `JUMP backloop`), so the list is not reprinted every time round.
     */
    showList: boolean = true
  ): Promise<number> {
    const manager = session.flagManager;
    if (!manager) return 0;
    let changed = false;

    // NULL means "nothing has been typed yet, go and ask" - express.e's
    // s=NIL. EMPTY STRING means "the user answered, and pressed Enter on an
    // empty line", which express.e handles at 12603 by falling out of the
    // IF and returning RESULT_SUCCESS.
    //
    // Testing `!inputStr` conflated the two, so Enter at the prompt printed
    // the prompt again instead of leaving: the command could not be exited
    // the way its own help text says it can ("(Enter)=none").
    if (inputStr === null) {
      // Show current flags, then prompt - express.e:12598-12601
      if (showList) {
        socket.emit('ansi-output', getShowFlagsMessage(manager));
      }
      socket.emit('ansi-output', getFlagFilesPrompt());

      // Set state to wait for input
      session.subState = LoggedOnSubState.FLAG_INPUT;
      session.tempData = { waitingForFlag: true };
      return this.WAITING_FOR_INPUT;
    }

    const input = inputStr;

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
        return this.WAITING_FOR_INPUT;
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
        changed = true;
      } else {
        // Clear specific file - express.e:12620
        const removed = manager.removeFlag(clearInput, session.currentConf || -1);
        changed = changed || removed;
      }

      if (changed) {
        await manager.save();
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
        return this.WAITING_FOR_INPUT;
      }

      if (fromInput.length === 0) {
        return 0; // Enter pressed, cancel
      }

      // Flag from this file onwards - express.e:12563-12592
      await this.flagFrom(socket, session, fromInput, manager);
      return 1;
    }

    // Default: Add file(s) to flag list - express.e:12639-12644
    const result = manager.addFlags(input, session.currentConf || -1);

    if (result > 0) {
      // Files added - express.e:12641
      changed = true;
      await manager.save();
      return 2; // File(s) added, return to prompt
    } else {
      // No files added (already flagged) - express.e:12643
      return 1; // Continue prompting
    }
  }

  /**
   * Leave the command - express.e:12664's closing newline, then the menu.
   */
  private static finish(socket: Socket, session: BBSSession): void {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
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

      if (result === this.WAITING_FOR_INPUT) {
        // A (C)lear or (F)rom sub-prompt is up now; stay suspended rather
        // than closing the command out from under it.
        return;
      }

      if (result === 0) {
        // Enter pressed - express.e:12603, then alterFlags:12664
        this.finish(socket, session);
      } else {
        // A file was added: express.e JUMPs to backloop, which prints the
        // prompt WITHOUT calling showFlags again. Anything else is a fresh
        // flagFiles(NIL) from alterFlags' loop, which does list.
        await this.flagFiles(socket, session, null, result !== 2);
      }
    } else if (session.tempData?.waitingForClear) {
      session.tempData.waitingForClear = false;

      // express.e:12618 - an empty answer ends the command.
      if (input.trim().length === 0) {
        return this.finish(socket, session);
      }

      // Process clear
      const manager = session.flagManager;
      if (manager) {
        if (input.trim().toUpperCase() === '*') {
          manager.clearAll();
        } else if (input.trim().length > 0) {
          manager.removeFlag(input.trim(), session.currentConf || -1);
        }
        await manager.save();
      }

      // Continue prompting
      await this.flagFiles(socket, session, null);
    } else if (session.tempData?.waitingForFlagFrom) {
      session.tempData.waitingForFlagFrom = false;

      const manager = session.flagManager;
      const from = input.trim();

      // express.e:12631 - IF(StrLen(tempStr)=0) THEN RETURN RESULT_SUCCESS,
      // which ends the command rather than asking again.
      if (from.length === 0) {
        return this.finish(socket, session);
      }

      // express.e:12634 flagFrom(tempStr): flag this file and every file
      // AFTER it in the directory. Adding the name on its own - which is
      // what this did - is the (Enter) case, not the (F)rom case, so "F"
      // behaved identically to typing the filename.
      if (manager) {
        await this.flagFrom(socket, session, from, manager);
      }

      // express.e:12635 RETURN 1, so alterFlags loops and prompts again.
      await this.flagFiles(socket, session, null);
    }
  }

  /**
   * Flag from filename onwards
   * Port from express.e:12563-12592 flagFrom()
   *
   * Flags all files in the current directory starting from the specified filename
   */
  private static async flagFrom(
    socket: Socket,
    session: BBSSession,
    filename: string,
    manager: any
  ): Promise<void> {
    const config = require('../../config').config;
    const bbsDataPath = config.get('dataDir');
    // `?? 1`, NOT `|| 1`: conference 0 is a real conference, and `|| 1`
    // silently sent it to conference 1 - so flagging "from" a file while in
    // [0:General] scanned a DIFFERENT conference's listing and could flag
    // files the user cannot even see. express.e uses currentConfDir with no
    // fallback (express.e:12568), and the file list this is supposed to
    // agree with passes session.currentConf straight through
    // (file-listing.handler.ts:157).
    const confNum = session.currentConf ?? 1;
    const { readDirFile } = require('../../utils/dir-file-reader.util');
    const { getMaxDirs } = require('../../utils/max-dirs.util');
    const { getConferenceDir } = require('../../utils/file-hold.util');
    const path = require('path');

    // Get max dirs for current conference
    const maxDirs = await getMaxDirs(confNum, bbsDataPath);
    if (maxDirs === 0) {
      socket.emit('ansi-output', '\x1b[31mNo file areas in this conference.\x1b[0m\r\n');
      return;
    }

    // Read DIR file for current directory (upload directory = maxDirs)
    // express.e:12568 - StringF(tempStr,'\sdir\d',currentConfDir,maxDirs)
    const conferencePath = getConferenceDir(confNum, bbsDataPath);
    const dirFilePath = path.join(conferencePath, `DIR${maxDirs}`);

    try {
      const entries = await readDirFile(dirFilePath);

      let foundStart = false;
      let flaggedCount = 0;
      const filenameUpper = filename.toUpperCase();

      // Loop through all entries - express.e:12570-12586
      for (const entry of entries) {
        if (!entry.filename) continue;

        const entryFilename = entry.filename.toUpperCase();

        // express.e:12580-12582 - Start flagging when we find the matching filename
        if (!foundStart && entryFilename === filenameUpper) {
          foundStart = true;
        }

        // express.e:12579 - Flag if we've found the start file
        if (foundStart) {
          manager.addFlag(entry.filename, confNum);
          flaggedCount++;
        }
      }

      // express.e:12587 - Error if filename not found
      if (!foundStart) {
        // express.e:12587: 'Sorry filename not found!\b\n' — plain text, no color
        socket.emit('ansi-output', 'Sorry filename not found!\r\n');
      } else {
        // express.e silently flags files — no success message shown
        if (flaggedCount > 0) {
          await manager.save();
        }
      }

    } catch (error) {
console.error('[FLAG FROM] Error reading DIR file:', error);
      socket.emit('ansi-output', '\x1b[31mError reading file list.\x1b[0m\r\n');
    }
  }
}
