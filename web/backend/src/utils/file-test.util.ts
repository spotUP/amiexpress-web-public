/**
 * File Testing Utilities
 * 1:1 port from AmiExpress express.e:18639-18750
 *
 * Tests uploaded files for integrity, format, and virus checking
 * Uses disk-based Fcheck/*.info file checkers (express.e:18556-18614)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { runExamineCommandsForTesting } from './examine-runner.util';
import { config } from '../config';
import { resolveDirectory, readTooltypeMap, isRealInfoFile } from './info-file.util';
import * as amigafs from './amigafs';
import { resolveAssignPath } from './path-util';
import { runAmigaProgram } from './amiga-program-runner.util';
import { parseAmigaCommandLine } from '../amiga-emulation/api/dos/dos-command-line';
import { amigaPathOf } from '../services/upload-examine.service';
import { flushOutput } from './output.util';

const execAsync = promisify(exec);

// Cached file checkers loaded from disk
let cachedFileCheckers: Map<string, FileCheckerInfo> | null = null;
let checkersCacheTime = 0;
const CACHE_DURATION_MS = 60000; // 1 minute cache

export interface FileCheckerInfo {
  name: string;
  checker: string;
  options: string;
  stackSize: number;
  priority: number;
  scriptPath: string | null;
  /** ERROR.1..n strings, contiguous from 1 (express.e:18604-18620). */
  errors: string[];
}

/**
 * One FCheck/<EXT>.info as checkFileExternal reads it (express.e:18556-18576).
 *
 * Every key is read through FindToolType, which matches it literally: the
 * sysop's `&CHECKER`, `SOPTIONS` or `%ERROR.1` are entries switched off, not
 * other spellings of CHECKER, OPTIONS and ERROR.1. No CHECKER = no checker
 * (express.e:18556-18560). STACK and PRIORITY go through E's Val(), which
 * reads a non-number as 0; a missing STACK is 4096 (:18567-18569).
 */
export function fileCheckerFromTooltypes(name: string, toolTypes: Map<string, string>): FileCheckerInfo | null {
  const checker = toolTypes.get('CHECKER');
  if (!checker) return null;
  const val = (s: string | undefined) => parseInt(s ?? '', 10) || 0;
  return {
    name,
    checker,
    options: toolTypes.get('OPTIONS') || '',
    stackSize: toolTypes.has('STACK') ? val(toolTypes.get('STACK')) : 4096,
    priority: val(toolTypes.get('PRIORITY')),
    scriptPath: toolTypes.get('SCRIPT') || null,
    errors: readErrorStrings(toolTypes),
  };
}

/**
 * The ERROR.n tooltypes of a checker, in order, stopping at the first gap.
 * express.e:18604-18620 reads ERROR.1, ERROR.2, ... with a WHILE on
 * readToolType, so ERROR.4 after a missing ERROR.3 is never looked at.
 */
export function readErrorStrings(toolTypes: Map<string, string>): string[] {
  const errors: string[] = [];
  for (let i = 1; ; i++) {
    const value = toolTypes.get(`ERROR.${i}`);
    if (value === undefined) break;
    errors.push(value);
  }
  return errors;
}

/**
 * Drop the checker cache.
 *
 * The loader caches for a minute, which is right on a board and wrong in a
 * test: a checker installed after the first read would not be seen, and the
 * test would pass or fail on the previous case's directory. Mirrors
 * clearMailCache.
 */
/**
 * The checkers as the runner sees them, for tests.
 *
 * Whether a tooltype survived the read is not visible through testFile - a
 * checker with its options eaten still runs and still succeeds.
 */
export function loadFileCheckersForTesting(): Map<string, FileCheckerInfo> {
  return loadFileCheckersFromDisk();
}

export function clearFileCheckerCache(): void {
  cachedFileCheckers = null;
  checkersCacheTime = 0;
}

/**
 * Load file checkers from Fcheck/*.info directory (disk-based, express.e:18556-18614)
 * This is the proper AmiExpress implementation - checkers are defined in .info files
 */
function loadFileCheckersFromDisk(): Map<string, FileCheckerInfo> {
  const now = Date.now();
  if (cachedFileCheckers && (now - checkersCacheTime) < CACHE_DURATION_MS) {
    return cachedFileCheckers;
  }

  const checkers = new Map<string, FileCheckerInfo>();
  const bbsRoot = config.get('dataDir');

  // The directory as it is spelled ON DISK. express.e writes `Fcheck` and this
  // board's volume holds `FCheck`; on the Amiga's case-insensitive filesystem
  // they are one directory and on the Linux container they are two. Joining
  // the express.e spelling raw meant this read ENOENT on the live board and
  // logged "no checkers" - so not one of the sysop's fifteen
  // checkers had ever run. The admin's own service was fixed with this helper
  // and this, the half that RUNS them, was missed.
  const fcheckDir = resolveDirectory(bbsRoot, 'Fcheck');

  if (!fsSync.existsSync(fcheckDir)) {
console.log('[FileTest] Fcheck/ directory not found, no checkers');
    cachedFileCheckers = checkers;
    checkersCacheTime = now;
    return checkers;
  }

  try {
    const files = fsSync.readdirSync(fcheckDir);
    // isRealInfoFile keeps the AppleDouble `._NAME.info` sidecars out, which
    // would otherwise be loaded as a checker named `._ZIP`.
    const infoFiles = files.filter(f => f.endsWith('.info') && isRealInfoFile(f));

    for (const infoFile of infoFiles) {
      const infoPath = path.join(fcheckDir, infoFile);

      // Read through the parser that owns the format. InfoFileParser splits
      // the file on NUL bytes and cannot read a plain-text .info AT ALL -
      // which is what the admin writes when it creates a checker, so a
      // checker made through the admin was unreadable to the code that runs
      // it. Two faults stacked, and the directory one hid this one.
      const raw = readTooltypeMap(infoPath);

      // Extract extension from filename (e.g., ZIP.info -> ZIP)
      const ext = path.basename(infoFile, '.info').toUpperCase();
      const checkerInfo = fileCheckerFromTooltypes(ext, raw);
      if (!checkerInfo) continue;
      const checkerPath = checkerInfo.checker;

      checkers.set(ext, checkerInfo);
console.log(`[FileTest] Loaded checker for .${ext}: ${checkerPath}`);
    }

console.log(`[FileTest] Loaded ${checkers.size} file checkers from Fcheck/`);
  } catch (error: any) {
console.error(`[FileTest] Error loading file checkers: ${error.message}`);
  }

  cachedFileCheckers = checkers;
  checkersCacheTime = now;
  return checkers;
}

// Test result statuses (express.e return codes)
export enum TestResult {
  SUCCESS = 'success',           // File passed all tests (RESULT_SUCCESS)
  FAILURE = 'failure',           // File failed testing (RESULT_FAILURE)
  NOT_TESTED = 'not_tested',     // File was not tested (RESULT_NOT_ALLOWED)
  NOT_ALLOWED = 'not_allowed'    // File type not supported
}

/**
 * Test file integrity and format
 * Express.e:18639 - PROC testFile(str: PTR TO CHAR, path: PTR TO CHAR)
 *
 * @param filepath Full path to uploaded file
 * @param nodeWorkDir Work directory for test output
 * @returns Test result status
 */
/**
 * Optional hooks for a caller that has a screen.
 *
 * onCheckerOutput receives what a disk checker printed, as express.e's
 * displayOutPutofTest (18535-18540) shows OutPut_Of_Test to the uploader
 * right after the checker ran (18581-18590, only when bgChecking=FALSE; the
 * FTP path runs the background variant and shows nothing).
 */
export interface TestFileOptions {
  onCheckerOutput?: (output: string) => void;
  /**
   * The caller's connection, for the FILECHECK system command: a door runs on
   * the caller's screen (express.e:18647 processSysCommand). Without one
   * (FTP's background check) there is no screen to give it and FILECHECK is
   * not run.
   */
  caller?: { socket: any; session: any };
  /** The node the upload is on: its NODE<n>: volume is the checker's. */
  nodeId?: number;
  /** How long a checker may run before it is killed; CHECKER_TIMEOUT_MS when unset. */
  checkerTimeoutMs?: number;
}

/** express.e axenums.e: RESULT_* as a door reports them through DT_GOODFILE. */
const GOODFILE_SUCCESS = 0;
const GOODFILE_FAILURE = -1;
const GOODFILE_NOT_ALLOWED = 1;
const GOODFILE_NOT_TESTED = 2;

/** aeGoodFile (a RESULT_* number) as this port's verdict. */
export function testResultFromGoodFile(aeGoodFile: number): TestResult {
  switch (aeGoodFile | 0) {
    case GOODFILE_SUCCESS: return TestResult.SUCCESS;
    case GOODFILE_FAILURE: return TestResult.FAILURE;
    case GOODFILE_NOT_TESTED: return TestResult.NOT_TESTED;
    default: return TestResult.NOT_ALLOWED;
  }
}

export async function testFile(
  filepath: string,
  nodeWorkDir: string,
  options: TestFileOptions = {}
): Promise<TestResult> {
  const filename = path.basename(filepath);
  const ext = path.extname(filename).toLowerCase().replace('.', '');

console.log(`[testFile] Testing ${filename} (extension: ${ext})`);

  // Express.e:18645-18648 - FILECHECK system command first
  try {
    const filecheckResult = await tryFilecheckCommand(filename, options);
    if (filecheckResult !== null) {
      return filecheckResult;
    }
  } catch (error: any) {
console.log(`[testFile] FILECHECK command error: ${error.message}`);
  }

  // Express.e:18650-18672 - Extract extension and run checker for that type
  if (ext.length === 3) { // express.e:18663 StrLen(temp2)=3
    return await checkFileByExtension(ext, filepath, nodeWorkDir, options);
  }

  // No extension or unsupported
console.log(`[testFile] No valid extension, file not tested`);
  return TestResult.NOT_TESTED;
}

/**
 * express.e:18645-18648:
 *
 *   StringF(temp2,'FILECHECK \s',str)
 *   IF (processSysCommand(temp2)=RESULT_SUCCESS) AND (aeGoodFile<>RESULT_NOT_TESTED)
 *     RETURN aeGoodFile
 *
 * FILECHECK is a SYSTEM COMMAND (Commands/SysCmd/FILECHECK.info), a door that
 * runs on the caller's screen and reports its verdict through DT_GOODFILE
 * (DoorMessageHandler sets session.aeGoodFile). `str` is the file's name as
 * the upload loop has it. Returns null when the command did not run or the
 * door left the file NOT_TESTED: the extension checkers go on.
 */
async function tryFilecheckCommand(filename: string, options: TestFileOptions): Promise<TestResult | null> {
  const { caller } = options;
  if (!caller) return null;
  const { runSysCommandInFlow } = require('../handlers/command-execution.handler');
  const { RESULT_SUCCESS } = require('../constants/command-results');

  const { session, socket } = caller;
  session.aeGoodFile = GOODFILE_NOT_ALLOWED; // express.e:18642
  const savedSubState = session.subState;
  // The door takes over the caller's screen; whatever this flow has buffered goes first.
  flushOutput(socket);
  const ran = (await runSysCommandInFlow(socket, session, 'FILECHECK', filename)) === RESULT_SUCCESS;
  // A door exit sends the session back to the menu; the upload is not done.
  session.subState = savedSubState;
  if (!ran) return null;
  const goodFile = Number(session.aeGoodFile);
  if (goodFile === GOODFILE_NOT_TESTED) return null;
console.log(`[testFile] FILECHECK door returned ${goodFile}`);
  return testResultFromGoodFile(goodFile);
}

/**
 * Check file based on extension type
 * Express.e:18659-18672 - Calls checkFileExternal(temp2, temp4)
 *
 * Only the configured Fcheck/*.info checker judges a file; express.e has no built-in checking.
 *
 * @param extension File extension (e.g., "zip", "lha")
 * @param filepath Full file path
 * @param nodeWorkDir Work directory for output
 */
async function checkFileByExtension(
  extension: string,
  filepath: string,
  nodeWorkDir: string,
  options: TestFileOptions = {}
): Promise<TestResult> {
  const extUpper = extension.toUpperCase();

  // DISK-BASED: First try Fcheck/*.info checkers (express.e:18556-18614)
  const diskCheckers = loadFileCheckersFromDisk();
  const diskChecker = diskCheckers.get(extUpper);

  // express.e:18553-18560: no FCheck/<EXT>.info (no CHECKER tooltype) means
  // checkFileExternal returns RESULT_SUCCESS, the file is not judged.
  if (!diskChecker) {
console.log(`[FileTest] No checker configured for .${extUpper}, file passes`);
    return TestResult.SUCCESS;
  }

console.log(`[FileTest] Using disk-based checker for .${extUpper}: ${diskChecker.checker}`);
  return runDiskBasedChecker(diskChecker, filepath, nodeWorkDir, options);
}

/** A CHECKER on an Amiga volume (`DOORS:multi-check/mULTI-cHECK`) is a 68K program; `/usr/local/bin/amiscan` is native. */
export function isAmigaPath(program: string): boolean {
  return program.includes(':') && !program.startsWith('/');
}

/** The node an upload sits on: `.../Node3/Playpen/x` is 3. */
function nodeOfPath(filepath: string): number | null {
  const match = filepath.match(/[\\/]Node(\d+)[\\/]/i);
  return match ? Number(match[1]) : null;
}

/** A 68K checker unpacking a big archive is slow under the emulator; native checkers share it. */
const CHECKER_TIMEOUT_MS = 120_000;

/** What one checker command printed, and whether the timeout killed it first. */
interface CheckerRun {
  output: string;
  timedOut: boolean;
}

/**
 * What a checker's command printed, from `program args...` on either side of
 * the Amiga/native line. null: the program is not there (SystemTagList would
 * fail: empty output).
 *
 * express.e:18581 SystemTagList ignores the exit code: whatever the checker
 * printed is the verdict, so a checker that exits 1 with a clean line (amiscan:
 * 1=infected, 3=could not check) is read the same way as one that exits 0.
 */
async function runCheckerCommand(
  commandLine: string,
  nativeCommand: string,
  nodeId: number,
  cwd?: string,
  stackSize?: number,
  timeoutMs: number = CHECKER_TIMEOUT_MS,
): Promise<CheckerRun | null> {
  const parsed = parseAmigaCommandLine(commandLine);
  if (isAmigaPath(parsed.program)) {
    // The 68K program, run as the node's own through the board's one headless
    // launcher: no fake sysop drop files, stdout is the program's Output().
    const program = amigafs.resolvePath(resolveAssignPath(parsed.program));
    if (!program) return null;
    const { output, killed } = await runAmigaProgram(program, {
      nodeId,
      args: parsed.rawArgs,
      doorType: 'SIM',
      timeoutMs,
      // express.e:18580 NP_STACKSIZE. NP_PRIORITY (:18581) is not passed: the
      // emulator runs one task, so a priority has nothing to order.
      stackSize,
    });
    return { output, timedOut: killed };
  }

  if (!fsSync.existsSync(parsed.program)) return null;
  let stdout = '';
  let stderr = '';
  try {
    const done = await execAsync(nativeCommand, { timeout: timeoutMs, cwd });
    stdout = done.stdout;
    stderr = done.stderr;
  } catch (error: any) {
    if (error.killed) {
      // The timeout's SIGTERM: what it printed so far is not a verdict.
      const partial = `${typeof error.stdout === 'string' ? error.stdout : ''}${typeof error.stderr === 'string' ? error.stderr : ''}`;
      return { output: partial, timedOut: true };
    }
    // 126/127 are the shell saying it could not start the checker, not
    // the checker speaking.
    const exitedWithCode =
      typeof error.code === 'number' && !error.killed && error.code !== 126 && error.code !== 127;
    if (!exitedWithCode) throw error;
    stdout = typeof error.stdout === 'string' ? error.stdout : '';
    stderr = typeof error.stderr === 'string' ? error.stderr : '';
  }
  return { output: `${stdout}${stdout && stderr ? '\n' : ''}${stderr}`, timedOut: false };
}

/**
 * Run a disk-based file checker from Fcheck/*.info
 * Express.e:18556-18614 - checkFileExternal
 *
 * @param checker FileCheckerInfo from Fcheck/*.info
 * @param filepath Full path to file being tested
 * @param nodeWorkDir Work directory for output
 * @returns TestResult (a checker that cannot run passes, as SystemTagList failing does)
 */
async function runDiskBasedChecker(
  checker: FileCheckerInfo,
  filepath: string,
  nodeWorkDir: string,
  options: TestFileOptions = {}
): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');
  const filename = path.basename(filepath);
  const nodeId = options.nodeId ?? nodeOfPath(filepath) ?? 1;

  try {
    // express.e's nodeWorkDir exists from the node's start; this board makes a
    // node's directories when something first needs them.
    await fs.mkdir(nodeWorkDir, { recursive: true });
    // express.e:18566-18589: `CHECKER OPTIONS <file>`. An Amiga checker gets
    // the file as the Amiga path a door would open; a native one the host path.
    const withOptions = checker.options ? `${checker.checker} ${checker.options}` : checker.checker;
    const amigaFile = amigaPathOf(config.get('dataDir'), filepath);
    const timeoutMs = options.checkerTimeoutMs ?? CHECKER_TIMEOUT_MS;
    let run: CheckerRun | null;
    if (isAmigaPath(parseAmigaCommandLine(withOptions).program)) {
      run = await runCheckerCommand(`${withOptions} "${amigaFile ?? filepath}"`, '', nodeId, undefined, checker.stackSize, timeoutMs);
    } else {
      // Common patterns: %s = file path, %f = filename
      let command = withOptions
        .replace(/%s/g, `"${filepath}"`)
        .replace(/%f/g, `"${filename}"`)
        .replace(/%p/g, `"${filepath}"`)
        .replace(/%w/g, `"${nodeWorkDir}"`);
      // If no placeholder, append filepath at end
      if (!command.includes(filepath) && !command.includes(filename)) {
        command = `${command} "${filepath}"`;
      }
console.log(`[FileTest] Running disk checker: ${command}`);
      run = await runCheckerCommand(command, command, nodeId, nodeWorkDir, undefined, timeoutMs);
    }
    if (run === null) {
      // SystemTagList failing on an Amiga leaves OutPut_Of_Test empty: no
      // ERROR.n line matches, so the file passes (express.e:18581-18620).
console.log(`[FileTest] Disk checker "${checker.checker}" cannot run, empty output`);
    }
    const outputText = run?.output ?? '';

    // OutPut_Of_Test (express.e:18577), then shown to the caller (:18590).
    await fs.writeFile(outputFile, outputText);
    options.onCheckerOutput?.(outputText);

    // express.e has no timeout: SystemTagList (18581) blocks until the checker
    // ends, so a check that never finishes never lets a file through. A checker
    // this board had to kill did not finish: the file is held for the sysop
    // (sysop decision 2026-10-12), never passed on a partial output.
    if (run?.timedOut) {
console.warn(`[FileTest] Disk checker "${checker.checker}" timed out after ${timeoutMs / 1000}s on ${filename}: held for review`);
      return TestResult.FAILURE;
    }

    // express.e:18593-18603: SCRIPT <file> <FilePart(file)> <node>, output to NIL:.
    if (checker.scriptPath) await runCheckerScript(checker.scriptPath, filepath, amigaFile, nodeId, checker.stackSize);

    // express.e:18604-18620: a line containing any ERROR.n string fails the
    // file; InStr is case-sensitive.
    const failed = outputText
      .split(/\r?\n/)
      .some((line) => checker.errors.some((needle) => line.includes(needle)));
    if (failed) {
console.log(`[FileTest] Disk checker reported failure for ${filename}`);
      return TestResult.FAILURE;
    }

console.log(`[FileTest] Disk checker succeeded for ${filename}`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    // Not run at all: the executable is missing or refused. (A checker the
    // timeout killed is not here: it returns timedOut and the file is held.)
console.error(`[FileTest] Disk checker error: ${error.message}`);

    const errMsg = error.message?.toLowerCase() || '';
    if (errMsg.includes('enoent') || errMsg.includes('not found') ||
        errMsg.includes('no such file') || errMsg.includes('permission denied') ||
        errMsg.includes('command not found')) {
      // The checker could not be started: empty output, no ERROR.n, success.
      return TestResult.SUCCESS;
    }

    return TestResult.NOT_TESTED;
  }
}

/**
 * express.e:18593-18603: `SCRIPT file FilePart(file) node`, input NIL, output
 * to NIL:. The script's own output is discarded; a script that cannot be run
 * does not change the verdict.
 */
export async function runCheckerScript(
  script: string,
  filepath: string,
  amigaFile: string | null,
  nodeId: number,
  stackSize?: number,
): Promise<void> {
  const name = path.basename(filepath);
  try {
    if (isAmigaPath(parseAmigaCommandLine(script).program)) {
      await runCheckerCommand(`${script} "${amigaFile ?? filepath}" "${name}" ${nodeId}`, '', nodeId, undefined, stackSize);
    } else {
      await runCheckerCommand(
        `${script} "${filepath}" "${name}" ${nodeId}`,
        `${script} "${filepath}" "${name}" ${nodeId}`,
        nodeId,
        path.dirname(filepath),
      );
    }
  } catch (error: any) {
console.log(`[FileTest] Checker script failed: ${error.message}`);
  }
}

/**
 * Run EXAMINE commands on uploaded file
 * Express.e:19260-19277 - Runs EXAMINE, EXAMINE1, EXAMINE2, etc.
 *
 * This is used both for FILE_ID.DIZ extraction AND file testing
 *
 * @param filepath Full path to uploaded file
 * @param examineCommands Array of EXAMINE commands
 * @returns Test result based on command execution
 */
export async function runExamineCommands(
  filepath: string,
  examineCommands: string[]
): Promise<TestResult> {
  if (examineCommands.length === 0) {
    return TestResult.NOT_TESTED;
  }

  const success = await runExamineCommandsForTesting(filepath, examineCommands);
  return success ? TestResult.SUCCESS : TestResult.FAILURE;
}

/**
 * Display test output to user
 * Express.e:18537 - PROC displayOutPutofTest()
 *
 * @param nodeWorkDir Work directory containing OutPut_Of_Test
 * @returns Test output as string
 */
export async function getTestOutput(nodeWorkDir: string): Promise<string> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    const output = await fs.readFile(outputFile, 'utf-8');
    return output;
  } catch (error) {
    return 'No test output available';
  }
}
