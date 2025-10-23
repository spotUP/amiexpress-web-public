/**
 * FILE_ID.DIZ Extraction Utility
 * 1:1 port from AmiExpress express.e:19258-19370
 *
 * Extracts and reads FILE_ID.DIZ from uploaded archive files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Express.e uses nodeWorkDir for temp file extraction
// We'll use Node#/WorkDir for extracted DIZ files
export function getNodeWorkDir(nodeNumber: number, bbsDataPath: string): string {
  return path.join(bbsDataPath, `Node${nodeNumber}`, 'WorkDir');
}

// Express.e uses ramPen or Node#/Playpen for uploaded files
export function getPlaypenDir(nodeNumber: number, bbsDataPath: string, ramPen?: string): string {
  if (ramPen && ramPen.length > 0) {
    return ramPen;
  }
  return path.join(bbsDataPath, `Node${nodeNumber}`, 'Playpen');
}

/**
 * Run EXAMINE system command to extract FILE_ID.DIZ
 * Express.e:19260-19277
 *
 * @param uploadedFilePath Full path to uploaded archive
 * @param nodeWorkDir Directory where FILE_ID.DIZ should be extracted
 * @param examineCommands Array of EXAMINE commands (EXAMINE, EXAMINE1, EXAMINE2, etc.)
 * @returns true if extraction successful, false otherwise
 */
export async function runExamineCommands(
  uploadedFilePath: string,
  nodeWorkDir: string,
  examineCommands: string[]
): Promise<boolean> {
  // Ensure work directory exists
  await fs.mkdir(nodeWorkDir, { recursive: true });

  // Express.e runs EXAMINE, then EXAMINE1, EXAMINE2, etc.
  // Loop through commands until one succeeds or all fail
  for (const examineCmd of examineCommands) {
    if (!examineCmd || examineCmd.trim().length === 0) {
      continue;
    }

    try {
      // Replace placeholders in command
      // %f = filename, %p = path, %w = work directory
      const command = examineCmd
        .replace('%f', uploadedFilePath)
        .replace('%p', path.dirname(uploadedFilePath))
        .replace('%w', nodeWorkDir);

      console.log(`[FILE_ID.DIZ] Running EXAMINE command: ${command}`);
      await execAsync(command, { timeout: 30000 }); // 30 second timeout

      // Check if FILE_ID.DIZ was extracted
      const dizPath = path.join(nodeWorkDir, 'FILE_ID.DIZ');
      const dizExists = await fileExists(dizPath);

      if (dizExists) {
        console.log(`[FILE_ID.DIZ] Successfully extracted to ${dizPath}`);
        return true;
      }
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] Command failed: ${examineCmd}, error: ${error.message}`);
      // Continue to next command
    }
  }

  return false;
}

/**
 * Built-in FILE_ID.DIZ extractor using unzip
 * This is a fallback if no EXAMINE commands are configured
 *
 * @param uploadedFilePath Full path to uploaded archive (.zip)
 * @param nodeWorkDir Directory where FILE_ID.DIZ should be extracted
 */
export async function extractFileDizBuiltin(
  uploadedFilePath: string,
  nodeWorkDir: string
): Promise<boolean> {
  // Ensure work directory exists
  await fs.mkdir(nodeWorkDir, { recursive: true });

  const dizPath = path.join(nodeWorkDir, 'FILE_ID.DIZ');

  // Only handle .zip files for now
  const ext = path.extname(uploadedFilePath).toLowerCase();
  if (ext !== '.zip') {
    console.log(`[FILE_ID.DIZ] File type ${ext} not supported for DIZ extraction`);
    return false;
  }

  try {
    // Extract FILE_ID.DIZ from zip archive
    // -j = junk paths (extract to flat directory)
    // -o = overwrite without prompting
    // -C = case-insensitive matching
    const command = `unzip -jo -C "${uploadedFilePath}" FILE_ID.DIZ -d "${nodeWorkDir}"`;
    console.log(`[FILE_ID.DIZ] Running: ${command}`);

    await execAsync(command, { timeout: 10000 });

    const dizExists = await fileExists(dizPath);
    if (dizExists) {
      console.log(`[FILE_ID.DIZ] Successfully extracted FILE_ID.DIZ`);
      return true;
    }
  } catch (error: any) {
    // unzip returns non-zero if FILE_ID.DIZ not found
    console.log(`[FILE_ID.DIZ] Extraction failed: ${error.message}`);
  }

  return false;
}

/**
 * Read FILE_ID.DIZ content
 * Express.e:19285-19362
 *
 * @param filename Base filename (without path)
 * @param nodeWorkDir Directory where FILE_ID.DIZ was extracted
 * @param maxLines Maximum description lines (express.e uses max_desclines)
 * @returns Array of description lines, or null if FILE_ID.DIZ doesn't exist
 */
export async function readFileDiz(
  filename: string,
  nodeWorkDir: string,
  maxLines: number = 10
): Promise<string[] | null> {
  // Express.e:19285 - StringF(fmtstr,'\s\s',nodeWorkDir,str)
  const dizPath = path.join(nodeWorkDir, 'FILE_ID.DIZ');

  // Express.e:19287 - uaf:=Open(fmtstr,MODE_OLDFILE)
  // Express.e:19288 - IF(uaf=0) - If file doesn't exist, return null
  if (!(await fileExists(dizPath))) {
    return null;
  }

  try {
    // Read FILE_ID.DIZ content
    const content = await fs.readFile(dizPath, 'utf-8');

    // Split into lines and clean up
    let lines = content
      .split(/\r?\n/)
      .map(line => line.trimEnd())  // Remove trailing whitespace
      .filter(line => line.length > 0)  // Remove empty lines
      .slice(0, maxLines);  // Limit to max lines

    // Express.e reads first line as main description (fcomment)
    // Then reads additional lines into scomment array
    // We'll return all lines as an array

    if (lines.length === 0) {
      return null;
    }

    // Truncate lines to 44 characters (express.e lineInput limit)
    lines = lines.map(line => line.slice(0, 44));

    console.log(`[FILE_ID.DIZ] Read ${lines.length} lines from FILE_ID.DIZ`);
    return lines;
  } catch (error: any) {
    console.error(`[FILE_ID.DIZ] Error reading FILE_ID.DIZ: ${error.message}`);
    return null;
  }
}

/**
 * Clean up extracted FILE_ID.DIZ and temp files
 *
 * @param nodeWorkDir Directory to clean
 */
export async function cleanupDizFiles(nodeWorkDir: string): Promise<void> {
  try {
    const dizPath = path.join(nodeWorkDir, 'FILE_ID.DIZ');
    if (await fileExists(dizPath)) {
      await fs.unlink(dizPath);
      console.log(`[FILE_ID.DIZ] Cleaned up FILE_ID.DIZ`);
    }
  } catch (error: any) {
    console.error(`[FILE_ID.DIZ] Cleanup error: ${error.message}`);
  }
}

/**
 * Helper: Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Full FILE_ID.DIZ extraction and reading process
 * Combines EXAMINE commands + builtin fallback + reading
 *
 * @param uploadedFilePath Full path to uploaded archive
 * @param nodeWorkDir Directory for temp extraction
 * @param examineCommands Optional EXAMINE commands from config
 * @param maxLines Maximum description lines
 * @returns Description lines from FILE_ID.DIZ, or null if not found
 */
export async function extractAndReadDiz(
  uploadedFilePath: string,
  nodeWorkDir: string,
  examineCommands: string[] = [],
  maxLines: number = 10
): Promise<string[] | null> {
  const filename = path.basename(uploadedFilePath);

  // Try configured EXAMINE commands first (express.e:19260-19277)
  if (examineCommands.length > 0) {
    const extracted = await runExamineCommands(uploadedFilePath, nodeWorkDir, examineCommands);
    if (extracted) {
      const dizContent = await readFileDiz(filename, nodeWorkDir, maxLines);
      if (dizContent) {
        return dizContent;
      }
    }
  }

  // Fallback to built-in extraction for .zip files
  const extracted = await extractFileDizBuiltin(uploadedFilePath, nodeWorkDir);
  if (extracted) {
    const dizContent = await readFileDiz(filename, nodeWorkDir, maxLines);
    if (dizContent) {
      return dizContent;
    }
  }

  return null;
}
