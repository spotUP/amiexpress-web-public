/**
 * File Upload Utilities
 * 1:1 port from AmiExpress express.e file upload functions
 */

import { formatLongDate } from './date-time.util';

/**
 * express.e:18408-18445 `checkForFile` - may this name come up at all?
 *
 * TRUE means REFUSE (express's `RESULT_FAILURE`); FALSE means the name is
 * free (`RESULT_SUCCESS`). express asks five questions and NOT ONE OF THEM
 * TOUCHES A DATABASE:
 *
 *   1. illegal characters                          express.e:18412-18413
 *   2. the FILESNOTALLOWED list, line by line      express.e:18416-18419 (checkOurList, :18382)
 *   3. `<confDir>/LcFiles/<name>`                  express.e:18421-18426
 *   4. every `DLPATH.n` of THIS conference         express.e:18428-18439
 *   5. every `ULPATH.n` of THIS conference         express.e:18440-18447
 *
 * This port used to ask SQL instead: `file_entries` joined to `file_areas`,
 * and `SELECT value FROM system_config WHERE key LIKE 'DLPATH.%'`. The second
 * one cannot work - `system_config` is a WIDE single-row table, not a
 * key/value one - so every call threw `SQLITE_ERROR: no such column: value`,
 * `uploadIsDuplicate` caught it, and the ZFILE was accepted. The caller
 * uploaded the file in full and the board then filed it as a duplicate into
 * HOLD, which is exactly the behaviour express answers at the ZFILE to avoid.
 * DLPATH.n and ULPATH.n are CONFERENCE tooltypes (`Conf<n>.info`), never
 * board-wide settings, which is why no such row could ever have existed.
 *
 * `bbsRoot` now defaults to the board rather than being optional. It was
 * optional, and `command.handler.ts` called without it: every filesystem
 * check sat behind `if (bbsDataPath)`, so that path asked the broken query
 * and nothing else.
 */
export async function checkForFile(
  filename: string,
  currentConf: number,
  bbsDataPath?: string,
  nodeId: number = 0,
  lcFileXfr: boolean = false,
): Promise<boolean> {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const { config } = require('../config');
  const { conferenceDownloadDirs, conferenceUploadDirs } =
    require('../conferences/conference-paths') as typeof import('../conferences/conference-paths');

  const bbsRoot = bbsDataPath || config.get('dataDir');

  // 1. Illegal characters - express.e:18412-18413, in express's own order.
  const illegalChars = ['%', '#', '?', ' ', '/', '(', ')', ':', '*'];
  for (const char of illegalChars) {
    if (filename.includes(char)) return true;
  }

  // 2. The sysop's own list of names never to accept - express.e:18416-18419.
  // FILESNOTALLOWED is a NODE tooltype naming a FILE (ACP.e:2665, and
  // axSetupTool/frmNodeEdit.e:873 is what writes it); the file holds one name
  // per line and the match is whole-line and case-insensitive, which is what
  // `StriCmp` does at express.e:18400 after /X 4 dropped pattern matching.
  if (nameIsOnTheNotAllowedList(filename, nodeId, bbsRoot)) return true;

  // 3. LcFiles - express.e:18421-18426, skipped while lost-carrier files are
  // being brought back (`lcFileXfr`, scanHoldDesc 17488): there the file's
  // own LCFILES copy is the file, not a duplicate of it.
  const { conferenceDir } =
    require('../conferences/conference-paths') as typeof import('../conferences/conference-paths');
  const lcFilesPath = path.join(conferenceDir(bbsRoot, currentConf), 'LcFiles', filename);
  if (!lcFileXfr && existsCaseInsensitively(lcFilesPath)) return true;

  // 4 and 5. Every download and upload directory THIS conference declares -
  // express.e:18428-18447. The conference's own icon is the authority; a path
  // built as `Conf<n>` reads the directory of a conference that may have been
  // deleted (see conferences/conference-paths.ts).
  for (const dir of [...conferenceDownloadDirs(bbsRoot, currentConf), ...conferenceUploadDirs(bbsRoot, currentConf)]) {
    if (existsCaseInsensitively(path.join(dir, filename))) return true;
  }

  return false;
}

/**
 * AmigaDOS is case-insensitive, and `fileExists` at express.e:18425 is asking
 * an AmigaDOS `Lock`. A duplicate that differs only in case is the same file
 * to the board it came from, so a case-sensitive host filesystem must not let
 * `dupe.lha` past a check that `DUPE.LHA` would have caught.
 */
function existsCaseInsensitively(candidate: string): boolean {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  try {
    if (fs.existsSync(candidate)) return true;
  } catch {
    /* an unreadable path is not a match */
  }

  const wanted = path.basename(candidate).toLowerCase();
  try {
    return fs.readdirSync(path.dirname(candidate)).some((entry) => entry.toLowerCase() === wanted);
  } catch {
    // A directory that is not there holds no duplicate.
    return false;
  }
}

/**
 * express's `checkOurList` - express.e:18382-18406.
 *
 * A list file that cannot be opened means "no list", and express returns
 * RESULT_SUCCESS for it (:18387-18389): a missing DUPE_LIST must never refuse
 * every upload on the board.
 */
export function nameIsOnTheNotAllowedList(filename: string, nodeId: number, bbsRoot: string): boolean {
  const fs = require('fs') as typeof import('fs');
  const { nodeTooltype } = require('./node-tooltypes.util') as typeof import('./node-tooltypes.util');
  const { BBSPaths } = require('./bbs-paths.util') as typeof import('./bbs-paths.util');

  const listSetting = (nodeTooltype(nodeId, 'FILESNOTALLOWED') ?? '').trim();
  if (listSetting.length === 0) return false;

  let listPath = listSetting;
  try {
    if (listSetting.includes(':')) listPath = new BBSPaths(bbsRoot).resolveAmigaPath(listSetting);
  } catch {
    return false;
  }

  let contents: string;
  try {
    contents = fs.readFileSync(listPath, 'latin1');
  } catch {
    return false; // express.e:18387 - no list, nothing refused
  }

  const wanted = filename.toLowerCase();
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .some((line) => line.length > 0 && line === wanted);
}

// Validate filename for upload (express.e:19218-19231)
export function validateFilename(filename: string): { valid: boolean; error?: string } {
  // Check for RZ filename (express.e:19212-19215)
  if (filename.toUpperCase() === 'RZ' || (filename.toUpperCase().startsWith('RZ') && filename.length < 4)) {
    return { valid: false, error: 'RZ is an invalid name for a file' };
  }

  // Check for illegal characters (express.e:19218-19226)
  const illegalChars = [':', '/', '*', ' ', '#', '+', '?'];
  for (let i = 0; i < filename.length; i++) {
    if (illegalChars.includes(filename[i])) {
      return { valid: false, error: 'You may not include any special symbols' };
    }
  }

  // Check filename length (express.e:17680-17681)
  if (filename.length > 12) {
    return { valid: false, error: 'Files longer than 12 characters are not allowed.' };
  }

  if (filename.length === 0) {
    return { valid: false, error: 'Filename cannot be empty' };
  }

  return { valid: true };
}

// File status markers (express.e:19410-19419)
export enum FileStatus {
  PASSED = 'P',        // Tested OK
  FAILED = 'F',        // Failed test (bad format/virus)
  NOT_TESTED = 'N',    // Not tested yet
  DUPLICATE = 'D',     // Duplicate file
  PRIVATE = '/',       // Private upload (sysop only)
  HOLD = 'H',          // In HOLD directory
  LCFILES = 'L'        // Lost carrier file
}

// Get file status marker
export function getFileStatusMarker(
  isDuplicate: boolean,
  testStatus: 'success' | 'failure' | 'not_tested',
  isPrivate: boolean
): string {
  if (isDuplicate) return FileStatus.DUPLICATE;
  if (isPrivate) return FileStatus.PRIVATE;
  if (testStatus === 'failure') return FileStatus.FAILED;
  if (testStatus === 'success') return FileStatus.PASSED;
  return FileStatus.NOT_TESTED;
}

/**
 * Format file size for DIR entries - express.e:18918-18942
 *
 * AmiExpress has two modes controlled by TOGGLES_CREDITBYKB:
 * 1. TOGGLES_CREDITBYKB=TRUE: Uses "K" suffix (e.g., "   123K") - 7 chars total
 * 2. TOGGLES_CREDITBYKB=FALSE (DEFAULT): Raw bytes (e.g., "  89749") - 7 chars
 *
 * Most 68K doors (AquaScan/FR, etc.) expect raw bytes to parse size for filtering.
 * Using "K" suffix causes Val("11K") = 0, which filters out the file.
 *
 * @param bytes File size in bytes
 * @param useKB Whether to use KB suffix (TOGGLES_CREDITBYKB=TRUE)
 * @returns Formatted size string (7 chars, right-aligned)
 */
export function formatFileSize(bytes: number, useKB: boolean = false, convertToMB: boolean = false): string {
  if (useKB) {
    // Mode 1: TOGGLES_CREDITBYKB=TRUE - express.e:18920-18930
    // StringF(fsstr,'\r\d[6]K',tmpSize) - right-align in 6 chars + K = 7 total
    const tmpSize = Math.floor(bytes / 1024) & 0x003fffff;  // Shr(fsize,10) AND $003fffff
    if (tmpSize <= 999999) {
      return `${tmpSize}K`.padStart(7);  // e.g., "   123K"
    }
    return convertToMB ? megabytes(bytes) : `${tmpSize}K`;  // '\dK' or the MB form
  }
  // Mode 2: TOGGLES_CREDITBYKB=FALSE (DEFAULT) - express.e:18931-18940
  // StringF(fsstr,'\r\d[7]',fsize) - right-align raw bytes in 7 chars
  // This is what AquaScan and other 68K doors expect for size filtering
  if (bytes <= 9999999) {
    return String(bytes).padStart(7);  // e.g., "  89749"
  }
  return convertToMB ? megabytes(bytes) : String(bytes);  // '\d' or the MB form
}

/**
 * express.e:18928/18938 with CONVERT_TO_MB:
 *   StringF(fsstr,'\r\d[4].\dM',Shr(fsize,20) AND $fff,
 *           Div(fsize-Shl(Shr(fsize,20) AND $fff,20),104858))
 * Seven characters, like every other size, so the date stays at column 23.
 */
function megabytes(bytes: number): string {
  const mb = Math.floor(bytes / 1048576) & 0xfff;
  const tenths = Math.floor((bytes - mb * 1048576) / 104858);
  return `${String(mb).padStart(4)}.${tenths}M`;
}

/**
 * The size column of this board's DIR lines: CREDITBYKB from the board's
 * toggles, CONVERT_TO_MB by its presence on bbsConfig.info - both read where
 * express.e reads them (sopt.toggles, checkToolTypeExists TOOLTYPE_BBSCONFIG).
 */
export function dirListSize(bytes: number): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getACSConfig, ToggleFlags } = require('./acs.util');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readTooltypeMap } = require('./info-file.util');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../config');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePath = require('path');
  let convertToMB = false;
  try {
    convertToMB = readTooltypeMap(nodePath.join(config.get('dataDir'), 'bbsConfig.info')).has('CONVERT_TO_MB');
  } catch { /* no board icon: the plain form */ }
  const creditByKB = getACSConfig()?.toggles?.[ToggleFlags.CREDITBYKB] === true;
  return formatFileSize(bytes, creditByKB, convertToMB);
}

/**
 * Format upload date for DIR entries - express.e:19165 uses formatLongDate()
 *
 * AmiExpress uses MM-DD-YY numeric format for DIR files (e.g., "12-10-25")
 * This is critical for 68K doors like AquaScan/FR that parse dates for filtering.
 *
 * Evidence from real Amiga DIR files: "12-26-17", "01-25-18", "01-27-18"
 *
 * @param date Date to format
 * @returns Formatted date string in MM-DD-YY format
 */
export function formatUploadDate(date: Date): string {
  // express.e:19165 - `formatLongDate(getSystemTime(), fmtstr)` IS the `odate`
  // that goes into the DIR row at :19454 and onto the upload prompt at
  // :19300. So this is not a second date format, it is that one - and the
  // doc block above, with its real-file evidence, was right all along while
  // the body had drifted to a `15-Jan-26` shape this port invented.
  //
  // It matters on the wire, not just on screen: express.e:27962 identifies
  // the date column by shape (digit first, `-` at [2] and [5]) and SHIFTS THE
  // COLUMNS when that fails, so a real AmiExpress reading a row we wrote
  // took the date for the size and mangled the record.
  return formatLongDate(date);
}

// Check if description starts with / (private upload marker) - express.e:19344
/**
 * The head of the upload description prompt, both before a transfer (the
 * XMODEM batch names its files first) and after one (express.e:17720-17728).
 * The ruler's `[` is column 32: every description line is typed under it.
 */
export function descriptionPromptHead(maxLines: number): string {
  return `\r\nPlease enter a description, you only have ${maxLines} lines.`
    + "\r\nPress return alone to end.  Begin  with (/) to make upload 'Private' to Sysop.\r\n"
    + '                                [--------------------------------------------]\r\n';
}

/**
 * The first description line before a transfer: express.e:17729
 * `StringF(str2,'\l\s[13]                   :',str)` - the name left-justified
 * in thirteen columns, nineteen spaces, and the colon at column 32 under the
 * ruler's `[`, so the caller types inside the ruler.
 */
export function pretransferDescriptionLead(filename: string): string {
  return `${filename.substring(0, 13).padEnd(13)}${' '.repeat(19)}:`;
}

export function isPrivateUpload(description: string): boolean {
  return description.startsWith('/');
}

// Capitalize filename if configured (express.e:19257)
export function capitalizeFilename(filename: string, capitalize: boolean): string {
  return capitalize ? filename.toUpperCase() : filename;
}

// Build DIR file entry line (express.e:19425-19431)
export function buildDirFileEntry(
  filename: string,
  sizeStr: string,
  dateStr: string,
  description: string,
  statusMarker: string
): string {
  // Format: filename     sizeK datestr description
  // Position 13 has the status marker (P/F/N/D)
  const filenamePadded = filename.padEnd(13);
  let line = filenamePadded;

  // Insert status marker at position 13 (express.e:19413-19416)
  if (filename.length < 13) {
    line = filename.padEnd(12) + statusMarker;
  }

  line += ` ${sizeStr}  ${dateStr}  ${description}`;
  return line;
}

// Add "Sent by:" line to description (express.e:19470-19473)
export function addSentByLine(description: string[], username: string, addSentBy: boolean): string[] {
  if (addSentBy) {
    return [...description, `Sent by: ${username}`];
  }
  return description;
}
