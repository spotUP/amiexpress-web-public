/**
 * File Testing Utilities
 * 1:1 port from AmiExpress express.e:18639-18750
 *
 * Tests uploaded files for integrity, format, and virus checking
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

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
  // TODO: Implement FILECHECK system command support
  // For now, skip to extension-based checking

  // Express.e:18650-18672 - Extract extension and run checker for that type
  if (ext.length === 3 || ext.length === 2) {
    return await checkFileByExtension(ext, filepath, nodeWorkDir);
  }

  // No extension or unsupported
  console.log(`[testFile] No valid extension, file not tested`);
  return TestResult.NOT_TESTED;
}

/**
 * Check file based on extension type
 * Express.e:18659-18672 - Calls checkFileExternal(temp2, temp4)
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

  // Built-in checkers for common archive formats
  switch (extUpper) {
    case 'ZIP':
      return await testZipFile(filepath, nodeWorkDir);
    case 'LHA':
    case 'LZH':
      return await testLhaFile(filepath, nodeWorkDir);
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
 * Test ZIP file integrity
 * Uses unzip -t (test archive)
 */
async function testZipFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    // unzip -t tests the archive without extracting
    const { stdout, stderr } = await execAsync(`unzip -t "${filepath}"`, {
      timeout: 30000
    });

    // Write output to OutPut_Of_Test (express.e pattern)
    await fs.writeFile(outputFile, `${stdout}\n${stderr}`);

    // Check for errors in output
    const output = `${stdout} ${stderr}`.toLowerCase();
    if (output.includes('error') || output.includes('bad') || output.includes('corrupt')) {
      console.log(`[testFile] ZIP file failed integrity test`);
      return TestResult.FAILURE;
    }

    console.log(`[testFile] ZIP file passed integrity test`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    console.error(`[testFile] ZIP test error: ${error.message}`);
    await fs.writeFile(outputFile, `ERROR: ${error.message}`);
    return TestResult.FAILURE;
  }
}

/**
 * Test LHA/LZH file integrity
 * Uses lha t (test archive) if available
 */
async function testLhaFile(filepath: string, nodeWorkDir: string): Promise<TestResult> {
  const outputFile = path.join(nodeWorkDir, 'OutPut_Of_Test');

  try {
    // Try lha -t to test the archive
    const { stdout, stderr } = await execAsync(`lha t "${filepath}"`, {
      timeout: 30000
    });

    await fs.writeFile(outputFile, `${stdout}\n${stderr}`);

    const output = `${stdout} ${stderr}`.toLowerCase();
    if (output.includes('error') || output.includes('bad') || output.includes('corrupt')) {
      console.log(`[testFile] LHA file failed integrity test`);
      return TestResult.FAILURE;
    }

    console.log(`[testFile] LHA file passed integrity test`);
    return TestResult.SUCCESS;
  } catch (error: any) {
    // lha might not be installed - mark as not tested instead of failed
    console.log(`[testFile] LHA test unavailable: ${error.message}`);
    await fs.writeFile(outputFile, `LHA checker not available: ${error.message}`);
    return TestResult.NOT_TESTED;
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

  let lastResult = TestResult.NOT_TESTED;

  // Express.e runs EXAMINE, then EXAMINE1, EXAMINE2, etc.
  for (const examineCmd of examineCommands) {
    if (!examineCmd || examineCmd.trim().length === 0) {
      continue;
    }

    try {
      // Replace placeholders
      const command = examineCmd
        .replace('%f', filepath)
        .replace('%p', path.dirname(filepath))
        .replace('%n', path.basename(filepath));

      console.log(`[EXAMINE] Running: ${command}`);
      await execAsync(command, { timeout: 60000 }); // 60 second timeout for virus scans

      lastResult = TestResult.SUCCESS;
    } catch (error: any) {
      console.error(`[EXAMINE] Command failed: ${examineCmd}, error: ${error.message}`);
      lastResult = TestResult.FAILURE;
      // Express.e stops on first failure
      break;
    }
  }

  return lastResult;
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
