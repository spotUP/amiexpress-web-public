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
import { InfoFileParser } from '../services/info-file-parser';

const execAsync = promisify(exec);

// Cached file checkers loaded from disk
let cachedFileCheckers: Map<string, FileCheckerInfo> | null = null;
let checkersCacheTime = 0;
const CACHE_DURATION_MS = 60000; // 1 minute cache

interface FileCheckerInfo {
  name: string;
  checker: string;
  options: string;
  stackSize: number;
  priority: number;
  scriptPath: string | null;
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
  const fcheckDir = path.join(bbsRoot, 'Fcheck');

  if (!fsSync.existsSync(fcheckDir)) {
    console.log('[FileTest] Fcheck/ directory not found, using built-in checkers only');
    cachedFileCheckers = checkers;
    checkersCacheTime = now;
    return checkers;
  }

  try {
    const files = fsSync.readdirSync(fcheckDir);
    const infoFiles = files.filter(f => f.endsWith('.info'));

    for (const infoFile of infoFiles) {
      const infoPath = path.join(fcheckDir, infoFile);
      const buffer = fsSync.readFileSync(infoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buffer);

      // Convert tooltypes to uppercase map
      const toolTypes = new Map<string, string>();
      for (const [key, value] of parsed.toolTypes.entries()) {
        const cleanKey = key.startsWith('&') ? key.substring(1).toUpperCase() : key.toUpperCase();
        toolTypes.set(cleanKey, value);
      }

      const checkerPath = toolTypes.get('CHECKER');
      if (!checkerPath) continue;

      // Extract extension from filename (e.g., ZIP.info -> ZIP)
      const ext = path.basename(infoFile, '.info').toUpperCase();

      const checkerInfo: FileCheckerInfo = {
        name: ext,
        checker: checkerPath,
        options: toolTypes.get('OPTIONS') || toolTypes.get('SOPTIONS') || '',
        stackSize: parseInt(toolTypes.get('STACK') || '8192', 10),
        priority: parseInt(toolTypes.get('PRIORITY') || '0', 10),
        scriptPath: toolTypes.get('SCRIPT') || null
      };

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
export async function testFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const filename = path.basename(filepath);
  const ext = path.extname(filename).toLowerCase().replace('.', '');

  console.log(`[testFile] Testing ${filename} (extension: ${ext})`);

  // Express.e:18645-18648 - Try FILECHECK system command first
  // Check if FILECHECK system command exists in config
  try {
    const filecheckResult = await tryFilecheckCommand(filepath, nodeWorkDir);
    if (filecheckResult !== null) {
      return filecheckResult;
    }
  } catch (error: any) {
    console.log(`[testFile] FILECHECK command error: ${error.message}`);
  }

  // Express.e:18650-18672 - Extract extension and run checker for that type
  if (ext.length === 3 || ext.length === 2) {
    return await checkFileByExtension(ext, filepath, nodeWorkDir);
  }

  // No extension or unsupported
  console.log(`[testFile] No valid extension, file not tested`);
  return TestResult.NOT_TESTED;
}

/**
 * Try to execute FILECHECK system command if configured
 * Express.e:18645-18648 - checkSystemCommand('FILECHECK')
 *
 * @param filepath Full path to file
 * @param nodeWorkDir Work directory for output
 * @returns Test result or null if command not configured
 */
async function tryFilecheckCommand(filepath: string, nodeWorkDir: string): Promise<TestResult | null> {
  const { db } = require('../database');
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  // Check if FILECHECK system command is configured
  const syscmdResult = await db.query(
    `SELECT commandstring FROM system_commands WHERE UPPER(commandname) = 'FILECHECK' LIMIT 1`
  );

  if (syscmdResult.rows.length === 0) {
    console.log(`[testFile] FILECHECK system command not configured`);
    return null;
  }

  const commandString = syscmdResult.rows[0].commandstring;
  console.log(`[testFile] Running FILECHECK command: ${commandString}`);

  try {
    // Replace placeholders: %f = filename, %p = filepath
    const command = commandString
      .replace(/%f/g, path.basename(filepath))
      .replace(/%p/g, filepath)
      .replace(/%w/g, nodeWorkDir);

    // Execute the command
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 60 second timeout
      cwd: nodeWorkDir,
    });

    // Write output to test output file
    await fs.writeFile(outputFile, `${stdout}\n${stderr}`);

    // Check for error indicators in output
    const output = `${stdout} ${stderr}`.toLowerCase();
    if (output.includes('error') || output.includes('failed') || output.includes('corrupt')) {
      console.log(`[testFile] FILECHECK command reported failure`);
      return TestResult.FAILURE;
    }

    console.log(`[testFile] FILECHECK command succeeded`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] FILECHECK command execution error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
  }
}

/**
 * Check file based on extension type
 * Express.e:18659-18672 - Calls checkFileExternal(temp2, temp4)
 *
 * First tries disk-based Fcheck/*.info checkers, then falls back to built-in checkers
 *
 * @param extension File extension (e.g., "zip", "lha")
 * @param filepath Full file path
 * @param nodeWorkDir Work directory for output
 */
async function checkFileByExtension(
  extension: string,
  filepath: string,
  nodeWorkDir: string
): Promise<TestResult> {
  const extUpper = extension.toUpperCase();

  // DISK-BASED: First try Fcheck/*.info checkers (express.e:18556-18614)
  const diskCheckers = loadFileCheckersFromDisk();
  const diskChecker = diskCheckers.get(extUpper);

  if (diskChecker) {
    console.log(`[FileTest] Using disk-based checker for .${extUpper}: ${diskChecker.checker}`);
    return await runDiskBasedChecker(diskChecker, filepath, nodeWorkDir);
  }

  // FALLBACK: Built-in JavaScript checkers for common archive formats
  console.log(`[FileTest] No disk checker for .${extUpper}, using built-in checker`);
  switch (extUpper) {
    case 'ZIP':
      return await testZipFile(filepath, nodeWorkDir);
    case 'LHA':
    case 'LZH':
      return await testLhaFile(filepath, nodeWorkDir);
    case 'LZX':
      return await testLzxFile(filepath, nodeWorkDir);
    case 'GZ':
    case 'TGZ':
      return await testGzipFile(filepath, nodeWorkDir);
    case 'TAR':
      return await testTarFile(filepath, nodeWorkDir);
    default:
      console.log(`[testFile] No checker for extension: ${extension}`);
      return TestResult.NOT_TESTED;
  }
}

/**
 * Run a disk-based file checker from Fcheck/*.info
 * Express.e:18556-18614 - checkFileExternal
 *
 * @param checker FileCheckerInfo from Fcheck/*.info
 * @param filepath Full path to file being tested
 * @param nodeWorkDir Work directory for output
 */
async function runDiskBasedChecker(
  checker: FileCheckerInfo,
  filepath: string,
  nodeWorkDir: string
): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    // Build command with file path substitution
    // Common patterns: %s = file path, %f = filename
    let command = checker.checker;
    const filename = path.basename(filepath);

    // If options exist, append them
    if (checker.options) {
      command = `${command} ${checker.options}`;
    }

    // Substitute placeholders
    command = command
      .replace(/%s/g, `"${filepath}"`)
      .replace(/%f/g, `"${filename}"`)
      .replace(/%p/g, `"${filepath}"`)
      .replace(/%w/g, `"${nodeWorkDir}"`);

    // If no placeholder, append filepath at end
    if (!command.includes(filepath) && !command.includes(filename)) {
      command = `${command} "${filepath}"`;
    }

    console.log(`[FileTest] Running disk checker: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 60 second timeout
      cwd: nodeWorkDir,
    });

    // Write output to test output file
    await fs.writeFile(outputFile, `${stdout}\n${stderr}`);

    // Check for error indicators in output
    const output = `${stdout} ${stderr}`.toLowerCase();
    if (output.includes('error') || output.includes('failed') || output.includes('corrupt') ||
        output.includes('bad') || output.includes('invalid')) {
      console.log(`[FileTest] Disk checker reported failure for ${filename}`);
      return TestResult.FAILURE;
    }

    console.log(`[FileTest] Disk checker succeeded for ${filename}`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    // Command execution failed (non-zero exit code or timeout)
    console.error(`[FileTest] Disk checker error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);

    // Non-zero exit code usually means test failure
    if (error.code !== undefined) {
      return TestResult.FAILURE;
    }

    // Other errors (timeout, command not found) - mark as not tested
    return TestResult.NOT_TESTED;
  }
}

/**
 * Test ZIP file integrity
 * Uses adm-zip (JavaScript extractor)
 */
async function testZipFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    // Use JavaScript ZIP library to test archive
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filepath);
    const entries = zip.getEntries();

    const output = `ZIP file integrity test\nFiles: ${entries.length}\nStatus: OK`;
    await fs.writeFile(outputFile, output);

    console.log(`[testFile] ZIP file passed integrity test (${entries.length} files)`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] ZIP test error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
  }
}

/**
 * Test LHA/LZH file integrity
 * Uses lha.js (JavaScript extractor)
 */
async function testLhaFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    // Use JavaScript LHA library to test archive
    const { listLhaFiles } = require('./lha-extractor');
    const files = await listLhaFiles(filepath);

    const output = `LHA file integrity test\nFiles: ${files.length}\nStatus: OK`;
    await fs.writeFile(outputFile, output);

    console.log(`[testFile] LHA file passed integrity test (${files.length} files)`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] LHA test error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
  }
}

/**
 * Test LZX file integrity
 * Uses lzx-extractor.ts (TypeScript extractor)
 */
async function testLzxFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    // Use JavaScript LZX library to test archive
    const { listLzxFiles } = require('./lzx-extractor');
    const files = await listLzxFiles(filepath);

    const output = `LZX file integrity test\nFiles: ${files.length}\nStatus: OK`;
    await fs.writeFile(outputFile, output);

    console.log(`[testFile] LZX file passed integrity test (${files.length} files)`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] LZX test error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
  }
}

/**
 * Test GZIP file integrity
 * Uses gzip -t (test archive)
 */
async function testGzipFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    const { stdout, stderr } = await execAsync(`gzip -t "${filepath}"`, {
      timeout: 30000
    });

    await fs.writeFile(outputFile, `${stdout}\n${stderr}`);

    const output = `${stdout} ${stderr}`.toLowerCase();
    if (output.includes('error') || output.includes('invalid') || output.includes('corrupt')) {
      console.log(`[testFile] GZIP file failed integrity test`);
      return TestResult.FAILURE;
    }

    console.log(`[testFile] GZIP file passed integrity test`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] GZIP test error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
  }
}

/**
 * Test TAR file integrity
 * Uses tar -t (test/list archive)
 */
async function testTarFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    const { stdout, stderr } = await execAsync(`tar -tf "${filepath}" > /dev/null`, {
      timeout: 30000
    });

    await fs.writeFile(outputFile, `${stdout}\n${stderr}`);

    console.log(`[testFile] TAR file passed integrity test`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] TAR test error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
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
