/**
 * File Listing Handler
 * Port from express.e:27626+ displayFileList() and related functions
 *
 * Handles file listing commands (F, FR, etc.)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import { Socket } from 'socket.io';
// Session type - using any for now since BBSSession is defined in index.ts
type Session = any;
import { LoggedOnSubState } from '../../constants/bbs-states';
import { displayScreen } from '../screen.handler';
import { readDirFile, getDirFilePath, getHoldDirFilePath, DirFileEntry } from '../../utils/dir-file-reader.util';
import { parseDirSpan, getDirSpanPrompt, getDirDisplayName, DirSpan } from '../../utils/dir-span.util';
import { FileFlagManager } from '../../utils/file-flag.util';
import { ParamsUtil } from '../../utils/params.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { config } from '../../config';
import { getConferenceDir } from '../../utils/file-hold.util';
import { flagPause, checkForPause, initPauseState, setNonStopMode } from '../../utils/flag-pause.util';
import { getMaxDirs, getDirFiles, DirFileInfo } from '../../utils/max-dirs.util';
import { dirEntryRows, isNarrow } from '../../utils/table-format.util';
import { sessionColumns } from '../../utils/door-min-columns.util';
import { getFileViewLayout } from '../../services/file-layout.service';
import { renderFileBlock, renderFileRow, type FileRecordFields } from '@amiexpress/bbs-door-sdk/petscii/frame';

/**
 * Display file list for a conference
 * Port from express.e:27626+ displayFileList()
 */
export class FileListingHandler {
  /**
   * Display file listing (F command)
   * Port from express.e:27626+ displayFileList()
   */
  static async handleFileList(
    socket: Socket,
    session: Session,
    params: string,
    reverse: boolean = false
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');

    socket.emit('ansi-output', '\r\n');

    // Check if conference has file areas
    const maxDirs = await getMaxDirs(session.currentConf, bbsDataPath);
console.log(`[FileList] handleFileList: currentConf=${session.currentConf} relConfNum=${session.relConfNum} maxDirs=${maxDirs} reverse=${reverse} params="${params}"`);
    if (maxDirs === 0) {
      socket.emit('ansi-output', '\x1b[31mSorry, No file areas available.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Parse parameters
    const parsedParams = ParamsUtil.parse(params);
    const hasNonStop = ParamsUtil.hasFlag(parsedParams, 'NS');

    // Determine which directories to scan
    let dirSpan: DirSpan;

    if (parsedParams.length > 0) {
      // User specified directory in params
      dirSpan = parseDirSpan(parsedParams[0], maxDirs, this.canAccessHold(session));
    } else {
      // Default to entire conference directories when no params provided
      dirSpan = {
        startDir: 1,
        endDir: maxDirs,
        success: true
      };
    }

    // Check if directory parse was successful
    if (!dirSpan.success) {
      if (dirSpan.error) {
        socket.emit('ansi-output', `\x1b[31m${dirSpan.error}\x1b[0m\r\n`);
      }
      socket.emit('ansi-output', '\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Display file list
    await this.displayFileListForDirSpan(
      socket,
      session,
      dirSpan,
      reverse,
      hasNonStop,
      maxDirs
    );

    // Always return to menu after listing
    (session as any).flagPauseHandler = undefined;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Continue file list after directory input
   */
  static async handleFileListDirInput(
    socket: Socket,
    session: Session,
    input: string
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');
    const maxDirs = await getMaxDirs(session.currentConf, bbsDataPath);

    // Add line break after directory input
    socket.emit('ansi-output', '\r\n');

    // Parse directory span
    const dirSpan = parseDirSpan(input, maxDirs, this.canAccessHold(session));

    if (!dirSpan.success) {
      if (dirSpan.error) {
        socket.emit('ansi-output', `\r\n\x1b[31m${dirSpan.error}\x1b[0m\r\n`);
      }
      socket.emit('ansi-output', '\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const { reverse, hasNonStop } = session.tempData.fileListParams || {};

    await this.displayFileListForDirSpan(
      socket,
      session,
      dirSpan,
      reverse || false,
      hasNonStop || false,
      maxDirs
    );

    // Always return to menu after listing
    (session as any).flagPauseHandler = undefined;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Display file list for a directory span
   * Port from express.e:27626+ displayFileList() main loop
   */
  private static async displayFileListForDirSpan(
    socket: Socket,
    session: Session,
    dirSpan: DirSpan,
    reverse: boolean,
    hasNonStop: boolean,
    maxDirs: number
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');
    const conferencePath = getConferenceDir(session.currentConf, bbsDataPath);

    // Initialize pause state (express.e:27633-27634)
    initPauseState(session);
    if (hasNonStop) {
      setNonStopMode(session, true);
    }
    session.menuPause = false;

    // express.e:27626-27636 displayFileList - just newline, no header
    socket.emit('ansi-output', '\r\n');

    // ONE LAYOUT SNAPSHOT FOR THE WHOLE PASS, taken before the header: the two
    // render paths cannot then be handed different layouts for the same
    // record, and a save mid-listing cannot split the screen.
    const narrow = isNarrow(session);
    const layout = getFileViewLayout(bbsDataPath);
    let ordinal = 0;
    if (narrow) {
      for (const line of layout.header) await this.emitTemplateRow(socket, session, line);
    }

    // Get list of DIR files (express.e: numbered DIR1, DIR2, etc. only)
    const allDirFiles = await getDirFiles(session.currentConf, bbsDataPath);
console.log(`[FileList] getDirFiles returned ${allDirFiles.length} dirs for conf=${session.currentConf} path=${conferencePath}`);
console.log(`[FileList] dirSpan=${JSON.stringify(dirSpan)}`);

    // Filter to the requested range (1-indexed)
    let dirsToShow = allDirFiles.filter(df =>
      df.index >= dirSpan.startDir && df.index <= dirSpan.endDir
    );
console.log(`[FileList] dirsToShow after filter: ${dirsToShow.length} dirs`);

    // Handle HOLD directory if requested
    if (dirSpan.startDir === -1 || dirSpan.endDir === -1) {
      const holdPath = getHoldDirFilePath(conferencePath);
      dirsToShow.unshift({
        index: -1,
        name: 'HOLD',
        path: holdPath,
        filename: 'HELD'
      });
    }

    // Reverse if needed
    if (reverse) {
      dirsToShow = dirsToShow.reverse();
    }

    // Loop through directories
    for (const dirInfo of dirsToShow) {
      const dirFilePath = dirInfo.path;
      // Express.e:27667-27669 - Show directory number, or "HOLD" for hold directory
      const dirDisplayName = dirInfo.index === -1 ? 'HOLD' : String(dirInfo.index);

      // Display scanning message (express.e:27667-27669, 27683-27684)
      if (reverse) {
        socket.emit('ansi-output', `Reverse scanning directory ${dirDisplayName}\r\n`);
      } else {
        socket.emit('ansi-output', `Scanning directory ${dirDisplayName}\r\n`);
      }

      // Check for pause before listing (express.e:28025+)
      const shouldContinue = await flagPause(socket, session, 1);
      if (!shouldContinue) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Read and display DIR file
      let entries: DirFileEntry[];
      try {
        entries = await readDirFile(dirFilePath);
      } catch (error: any) {
        // Log error but continue to next directory instead of failing completely
console.log(`[FileList] Could not read ${dirFilePath}: ${error.message}`);
        socket.emit('ansi-output', `\x1b[33mCould not read directory ${dirDisplayName}\x1b[0m\r\n`);
        continue;
      }

      if (entries.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo files in this directory.\x1b[0m\r\n');
        const shouldContinue2 = await flagPause(socket, session, 1);
        if (!shouldContinue2) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      } else {
        // Display entries (sort by date when reverse, newest first)
        // For FR command (reverse=true), sort by uploadDate descending (newest first)
        // For F command (reverse=false), keep original order (oldest first)
        let displayEntries = entries;
        if (reverse) {
          // Sort by upload date descending (newest first)
          displayEntries = [...entries].sort((a, b) => {
            const dateA = a.uploadDate?.getTime() || 0;
            const dateB = b.uploadDate?.getTime() || 0;
            return dateB - dateA;  // Descending order (newest first)
          });
        }

        for (const entry of displayEntries) {
          // A 40-COLUMN CALLER GETS THE LIST ROW. One row per file, at the
          // columns Prompts/FILEVIEW.40 names, so a screen holds twenty-plus
          // records rather than three. The 80-column path below is untouched.
          if (narrow) {
            ordinal++;
            // THE ORDINAL HAS TO MEAN SOMETHING AFTERWARDS. A caller reads the
            // list, sees `12`, and types `FI 12` - so the pass records what it
            // showed, in the order it showed it. Without this the number in
            // the leftmost column is decoration and the two surfaces never
            // connect.
            this.rememberListed(session, ordinal, dirInfo.index, entry.filename.trim());
            const row = this.narrowRowFor(entry, ordinal, session, layout);
            const { parseMciCodes } = require('../screen.handler');
            const painted = (await parseMciCodes(row, session))?.parsed ?? row;
            const ok = await this.displayFileEntry(socket, session, [painted]);
            if (!ok) {
              session.subState = LoggedOnSubState.DISPLAY_MENU;
              return;
            }
            continue;
          }

          // The entry's own rows, then laid out for THIS caller's screen.
          // At >= 80 columns `dirEntryRows` hands the same array straight
          // back, so the express.e bytes are the same strings; below 80 the
          // DIR file's 33-column indent is removed and each description row
          // is CROPPED if it is art and WRAPPED if it is prose, instead of
          // being folded by the C64 terminal (sysop, 2026-09-06: "fr seems
          // to overflow in 40 cols?"). See utils/table-format.util.ts.
          const displayLines = dirEntryRows(session, this.getDisplayLines(entry));

          // Display file entry and allow the pause handler to decide when to stop
          const shouldContinueEntry = await this.displayFileEntry(socket, session, displayLines);
          if (!shouldContinueEntry) {
            session.subState = LoggedOnSubState.DISPLAY_MENU;
            return;
          }
        }
      }

      // Pause after directory listing (no extra blank line - flagPause adds one)
      const shouldContinue4 = await flagPause(socket, session, 1);
      if (!shouldContinue4) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }
    }

    if (narrow) {
      for (const line of layout.footer) await this.emitTemplateRow(socket, session, line);
    }

    // Return to menu prompt (single redraw handled centrally)
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Display a single file entry
   * Port from express.e:27626+ displayIt2()
   */
  private static getDisplayLines(entry: DirFileEntry): string[] {
    const isContinuationLine = (line: string) =>
      line.length >= 33 && line.substring(0, 33).trim().length === 0;

    return entry.rawLines.filter((line, index) => {
      if (index === 0) {
        return true;
      }
      if (!isContinuationLine(line)) {
        return true;
      }
      const content = line.substring(33);
      return content.trim().length > 0;
    });
  }

  /**
   * The `N` scan - express.e:27906-28023 internalCommandNewFiles().
   *
   * WHY IT LIVES HERE AND NOT IN file.handler.ts: `N` answers the same
   * question `F` does - "what is in this conference's DIR files" - and it used
   * to answer it from somewhere else entirely. It read the SQL `file_entries`
   * mirror, which is written only when a file is uploaded THROUGH THE WEB; no
   * importer ever reads the DIR files into it. Measured on the live board
   * (2026-09-07): conference 1's two areas hold 0 rows between them while the
   * DIR files on disk carry records. So `N` told a caller "no new files" for a
   * conference that is full, and `F` listed them a keystroke later.
   *
   * Uploads write BOTH the row and the DIR entry (see file-socket-handlers,
   * "Write to DIR file"), so reading the disk loses nothing the mirror had.
   *
   * express.e's rule, and it is not "filter the entries by date": a DIR file
   * is chronological, so it finds the FIRST entry at or after the date and
   * then dumps THE REST OF THE FILE (`displayIt2(fp1)`, express.e:28007),
   * descriptions and all. Filtering entry by entry would drop a file whose
   * date column is malformed but which is newer than the one above it.
   */
  static async handleNewFileScan(
    socket: Socket,
    session: Session,
    searchDate: Date,
    hasNonStop: boolean
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');

    initPauseState(session);
    if (hasNonStop) {
      setNonStopMode(session, true);
    }
    session.menuPause = false;

    // One snapshot for this pass, as the listing takes.
    const narrow = isNarrow(session);
    const layout = getFileViewLayout(bbsDataPath);
    let ordinal = 0;

    const dirFiles = await getDirFiles(session.currentConf, bbsDataPath);
    if (dirFiles.length === 0) {
      socket.emit('ansi-output', '\r\nNo Files are available.\r\n\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e compares y/m/d, not timestamps: a file uploaded earlier on the
    // search date is still new.
    const isAtOrAfter = (entry: DirFileEntry): boolean => {
      const d = entry.uploadDate;
      if (!d || Number.isNaN(d.getTime())) return false;
      if (d.getFullYear() !== searchDate.getFullYear()) {
        return d.getFullYear() > searchDate.getFullYear();
      }
      if (d.getMonth() !== searchDate.getMonth()) {
        return d.getMonth() > searchDate.getMonth();
      }
      return d.getDate() >= searchDate.getDate();
    };

    if (narrow) {
      for (const line of layout.header) await this.emitTemplateRow(socket, session, line);
    }

    for (const dirInfo of dirFiles) {
      socket.emit('ansi-output', `Scanning directory ${dirInfo.index}\r\n`);

      // express.e:27934-27938 - checkForPause during confScan, flagPause otherwise.
      const beforeDir = session.newFilesPauseFlag
        ? await checkForPause(socket, session)
        : await flagPause(socket, session, 1);
      if (!beforeDir) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      let entries: DirFileEntry[];
      try {
        entries = await readDirFile(dirInfo.path);
      } catch (error: any) {
console.log(`[NewFiles] Could not read ${dirInfo.path}: ${error.message}`);
        continue;
      }

      const first = entries.findIndex(isAtOrAfter);
      if (first < 0) continue;

      for (const entry of entries.slice(first)) {
        // THE SAME ROW `F` PRINTS. `N` is a listing too, and a caller who can
        // read one at forty columns can read the other; it also gives him an
        // ordinal to hand to `FI`.
        if (narrow) {
          ordinal++;
          this.rememberListed(session, ordinal, dirInfo.index, entry.filename.trim());
          const row = this.narrowRowFor(entry, ordinal, session, layout);
          const { parseMciCodes } = require('../screen.handler');
          const painted = (await parseMciCodes(row, session))?.parsed ?? row;
          const ok = await this.displayFileEntry(socket, session, [painted]);
          if (!ok) {
            session.subState = LoggedOnSubState.DISPLAY_MENU;
            return;
          }
          continue;
        }

        const displayLines = dirEntryRows(session, this.getDisplayLines(entry));
        const shouldContinue = await this.displayFileEntry(socket, session, displayLines);
        if (!shouldContinue) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      }
    }

    // END THE WAY `F` DOES, and for the reason the sysop found: the board
    // holds for a keypress after a listing, and without this prompt it holds
    // in SILENCE. "it gets stuck there as well ... i can exit with enter"
    // (2026-09-07, a PETSCII session that had just scanned an empty
    // conference). Same three lines as handleFileList's ending.
    (session as any).flagPauseHandler = undefined;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * What the last listing pass showed this caller, by ordinal.
   *
   * Per SESSION, because it is per pass and per caller: two callers listing
   * the same conference at the same moment have their own numbering, and a
   * new pass replaces the old one rather than appending to it.
   */
  private static rememberListed(
    session: Session,
    ordinal: number,
    dirNumber: number,
    filename: string,
  ): void {
    const temp = ((session as any).tempData ??= {});
    if (ordinal === 1) temp.fileListIndex = [];
    (temp.fileListIndex ??= [])[ordinal - 1] = { dirNumber, filename };
  }

  /**
   * The nth record of this conference, counted the way a listing counts.
   *
   * The listing walks the DIR files in number order and numbers every entry
   * from one, so the same walk answers the same question without a session to
   * remember it.
   */
  private static async nthRecordOf(
    session: Session,
    ordinal: number,
  ): Promise<{ dirNumber: number; filename: string } | null> {
    const bbsDataPath = config.get('dataDir');
    let seen = 0;
    for (const dir of await getDirFiles(session.currentConf ?? 1, bbsDataPath)) {
      let entries: DirFileEntry[];
      try {
        entries = await readDirFile(dir.path);
      } catch {
        continue;
      }
      for (const entry of entries) {
        seen++;
        if (seen === ordinal) return { dirNumber: dir.index, filename: entry.filename.trim() };
      }
    }
    return null;
  }

  /** The record `FI <n>` is asking for, or null when the number means nothing. */
  static listedRecord(session: Session, ordinal: number): { dirNumber: number; filename: string } | null {
    const listed = (session as any).tempData?.fileListIndex as
      | Array<{ dirNumber: number; filename: string }>
      | undefined;
    if (!listed || ordinal < 1 || ordinal > listed.length) return null;
    return listed[ordinal - 1] ?? null;
  }

  /**
   * `FI <n>` - show one record from the last listing, on its own screen.
   *
   * The list row is identity fields at fixed columns and carries no
   * description; this is where a caller reads what the thing IS. The two
   * surfaces connect through the ordinal, which is why the list prints one.
   */
  static async handleFileInfoCommand(
    socket: Socket,
    session: Session,
    params: string,
  ): Promise<void> {
    const ordinal = parseInt((params ?? '').trim().split(/\s+/)[0] ?? '', 10);
    if (!Number.isFinite(ordinal) || ordinal < 1) {
      socket.emit('ansi-output', '\r\nUsage: FI <number from the file list>\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // NO LISTING THIS SESSION IS NOT AN ERROR. A caller who knows the number -
    // from a listing before a reconnect, or from a door that printed one - gets
    // the same answer, because the ordinal is just the conference's own order.
    // Depending on a session's memory made `FI 3` fail for a caller who had
    // plainly just read a list (sysop, live, 2026-09-07).
    const listed = this.listedRecord(session, ordinal) ?? await this.nthRecordOf(session, ordinal);
    if (!listed) {
      // express.e's own shape for a number that names nothing.
      socket.emit('ansi-output', `\r\nNo file ${ordinal} in the last listing.\r\n`);
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const bbsDataPath = config.get('dataDir');
    const conferencePath = getConferenceDir(session.currentConf ?? 1, bbsDataPath);
    let entry: DirFileEntry | undefined;
    try {
      const entries = await readDirFile(getDirFilePath(conferencePath, listed.dirNumber));
      entry = entries.find((e) => e.filename.trim() === listed.filename);
    } catch {
      entry = undefined;
    }

    if (!entry) {
      socket.emit('ansi-output', `\r\n${listed.filename} is no longer in this directory.\r\n`);
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    await this.showFileRecord(socket, session, entry, ordinal);
    (session as any).flagPauseHandler = undefined;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * A rendered template row, as BYTES.
   *
   * The template carries MCI - `~c7|` is a pen - and the interpreter leaves
   * every code it does not own alone, so the row has to go through the
   * board's own MCI pass before it reaches the wire. Skipping this step sends
   * a caller the literal text `~c7|`, which is exactly what happened here
   * until a test that stripped MCI to read the columns stopped hiding it.
   */
  private static async emitTemplateRow(
    socket: Socket,
    session: Session,
    row: string,
  ): Promise<void> {
    const { parseMciCodes } = require('../screen.handler');
    const rendered = await parseMciCodes(row, session);
    socket.emit('ansi-output', (rendered?.parsed ?? row) + '\r\n');
  }

  /**
   * ONE RECORD, ON ITS OWN SCREEN - `FI <n>` after a listing, a search hit, an
   * upload announcement.
   *
   * This is where the description lives now. A LIST row is identity fields at
   * fixed columns and carries none; here there is one record on the screen, so
   * description-first costs nothing and is what the sysop asked for. The DIZ
   * that the row's continuation lines carry is squeezed and wrapped by the
   * interpreter rather than folded by the terminal - which is the same promise
   * the 40-column crop/wrap fix made, kept on the surface that now owns it.
   */
  static async showFileRecord(
    socket: Socket,
    session: Session,
    entry: DirFileEntry,
    ordinal: number,
  ): Promise<void> {
    const layout = getFileViewLayout(config.get('dataDir'));
    const columns = sessionColumns(session);

    const fields: FileRecordFields = {
      num: ordinal,
      name: entry.filename,
      sizeBytes: entry.fileSize,
      flag: entry.statusMarker,
      isNew: this.isNewToCaller(entry, session),
      date: entry.uploadDateDisplay,
      desc: entry.description,
    };

    socket.emit('ansi-output', '\r\n');
    for (const row of renderFileBlock(fields, layout.record, columns)) {
      await this.emitTemplateRow(socket, session, row);
    }
  }

  /**
   * THE C*BASE-NATIVE LIST ROW, for a caller who has forty columns.
   *
   * One row per file - ordinal, size, marker, new flag, filename, date at
   * fixed columns - so twenty-plus records fit on a screen instead of the
   * three a stacked block leaves room for. The columns come from
   * `Prompts/FILEVIEW.40`, which the sysop can edit; nothing here knows where
   * a date belongs.
   *
   * ONE SNAPSHOT PER PASS. The layout is read once, before the header, and
   * held to the end: a sysop saving the file mid-listing cannot split a screen
   * between two layouts.
   *
   * At 80 columns this is not reached at all and `dirEntryRows` hands back the
   * express.e bytes unchanged - decision 4 freezes every 80-column file
   * format.
   */
  private static narrowRowFor(
    entry: DirFileEntry,
    ordinal: number,
    session: Session,
    layout: { row: readonly string[] },
  ): string {
    const fields: FileRecordFields = {
      num: ordinal,
      name: entry.filename,
      sizeBytes: entry.fileSize,
      flag: entry.statusMarker,
      // PER CALLER, never stored: a file is new to the caller who has not seen
      // it, and storing that would make the listing wrong for the next one.
      isNew: this.isNewToCaller(entry, session),
      date: entry.uploadDateDisplay,
    };
    return renderFileRow(fields, layout.row, sessionColumns(session));
  }

  /** Is this file newer than the caller's own new-since date? */
  private static isNewToCaller(entry: DirFileEntry, session: Session): boolean {
    const since = (session as any).user?.newSinceDate ?? (session as any).user?.lastLogin;
    if (!since || !entry.uploadDate || Number.isNaN(entry.uploadDate.getTime())) return false;
    return entry.uploadDate.getTime() >= new Date(since).getTime();
  }

  private static async displayFileEntry(
    socket: Socket,
    session: Session,
    lines: string[]
  ): Promise<boolean> {
    for (const line of lines) {
      socket.emit('ansi-output', line + '\r\n');
      const shouldContinue = await flagPause(socket, session, 1);
      if (!shouldContinue) {
        return false;
      }
    }
    return true;
  }

  /**
   * Handle failures reading a DIR file (missing or unreadable)
   */
  private static handleDirFileReadError(
    socket: Socket,
    session: Session,
    dirDisplayName: string,
    error: any
  ): void {
console.error(`[FileListing] Failed to read ${dirDisplayName} directory file:`, error);
    const sysopName = config.get('sysopName') || 'Sysop';
    socket.emit(
      `\x1b[31mThere is a problem with File listings, please tell ${sysopName}\x1b[0m\r\n`
    );
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }


  /**
   * Check if user can access HOLD directory
   * Port from express.e:346 (default level 201) and lines 26863, 26896 (dual check with OR logic)
   */
  private static canAccessHold(session: Session): boolean {
    if (!session.user) return false;

    // express.e:340-350 - Read HOLD_ACCESS_LEVEL from bbsConfig.info if present, default to 201
    const { loadBBSConfig } = require('../../services/bbs-config-file.service');
    const bbsRoot = require('../../config').config.get('bbsRoot') || process.cwd();
    const bbsConfig = loadBBSConfig(bbsRoot);
    const holdAccessLevel = bbsConfig.hold_access_level ?? 201; // Default from express.e:346

    // express.e:26863,26896 - Dual check with OR logic:
    // IF (loggedOnUser.secStatus>=holdAccessLevel) OR (checkSecurity(ACS_HOLD_ACCESS))
    const { checkSecurity } = require('../../utils/acs.util');
    const { ACSPermission } = require('../../constants/acs-permissions');

    return (
      session.user.secLevel >= holdAccessLevel ||
      checkSecurity(session.user, ACSPermission.HOLD_ACCESS)
    );
  }
}
