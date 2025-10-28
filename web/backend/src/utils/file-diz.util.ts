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
import { extractFileDizFromLha } from './lha-extractor';
import { extractFileDizFromZip } from './zip-extractor';
import { extractFileDizFromTarAuto } from './tar-extractor';
import { extractFileDizFromDms } from './dms-extractor';
import { extractFileDizFromLzx } from './lzx-extractor';

const execAsync = promisify(exec); // Only used for user-configured EXAMINE commands

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
 * Find FILE_ID.DIZ in archive (case-insensitive)
 * Returns the actual filename as it appears in the archive
 * USES JAVASCRIPT EXTRACTORS - NO BINARIES!
 */
async function findDizInArchive(uploadedFilePath: string, ext: string): Promise<string | null> {
  try {
    let files: string[] = [];

    console.log(`[FILE_ID.DIZ] Listing archive contents with JavaScript extractor`);

    if (ext === '.zip') {
      // Use adm-zip (JavaScript)
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(uploadedFilePath);
      files = zip.getEntries().map((e: any) => e.entryName);
    } else if (ext === '.lha' || ext === '.lzh') {
      // Use lha.js (JavaScript)
      const { listLhaFiles } = require('./lha-extractor');
      files = await listLhaFiles(uploadedFilePath);
    } else if (ext === '.lzx') {
      // Use lzx-extractor.ts (TypeScript)
      const { listLzxFiles } = require('./lzx-extractor');
      files = await listLzxFiles(uploadedFilePath);
    } else {
      return null;
    }

    console.log(`[FILE_ID.DIZ] Archive contains ${files.length} files`);

    // Search for FILE_ID.DIZ case-insensitively
    // Match any variation: FILE_ID.DIZ, file_id.diz, File_Id.Diz, etc.
    for (const file of files) {
      const filename = path.basename(file).toLowerCase();
      if (filename === 'file_id.diz') {
        console.log(`[FILE_ID.DIZ] Found in archive: ${file}`);
        return file; // Return full path as it appears in archive
      }
    }

    console.log(`[FILE_ID.DIZ] No FILE_ID.DIZ found in archive (searched ${files.length} files)`);
    return null;
  } catch (error: any) {
    console.log(`[FILE_ID.DIZ] Failed to list archive: ${error.message}`);
    return null;
  }
}

/**
 * Built-in FILE_ID.DIZ extractor using JavaScript archive libraries
 * This is a fallback if no EXAMINE commands are configured
 *
 * @param uploadedFilePath Full path to uploaded archive (ZIP, LHA, LZX, etc.)
 * @param nodeWorkDir Directory where FILE_ID.DIZ should be extracted
 */
export async function extractFileDizBuiltin(
  uploadedFilePath: string,
  nodeWorkDir: string
): Promise<boolean> {
  // Ensure work directory exists
  await fs.mkdir(nodeWorkDir, { recursive: true });

  const dizPath = path.join(nodeWorkDir, 'FILE_ID.DIZ');

  // Handle special cases first
  const ext = path.extname(uploadedFilePath).toLowerCase();
  const basename = path.basename(uploadedFilePath, ext);

  // Special case: .txt files - extract FILE_ID.DIZ from between tags
  // Format: @BEGIN_FILE_ID.DIZ ... @END_FILE_ID.DIZ
  if (ext === '.txt') {
    try {
      const content = await fs.readFile(uploadedFilePath, 'utf-8');

      // Look for @BEGIN_FILE_ID.DIZ and @END_FILE_ID.DIZ tags
      const beginTag = '@BEGIN_FILE_ID.DIZ';
      const endTag = '@END_FILE_ID.DIZ';

      const beginIndex = content.indexOf(beginTag);
      const endIndex = content.indexOf(endTag);

      if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
        // Extract content between tags
        const dizContent = content.substring(beginIndex + beginTag.length, endIndex).trim();

        // Limit to 10 lines and 44 chars per line
        const lines = dizContent
          .split(/\r?\n/)
          .map(line => line.substring(0, 44))
          .filter(line => line.trim().length > 0)
          .slice(0, 10);

        if (lines.length > 0) {
          await fs.writeFile(dizPath, lines.join('\n'), 'utf-8');
          console.log(`[FILE_ID.DIZ] Extracted FILE_ID.DIZ from .txt file (${lines.length} lines)`);
          return true;
        }
      }

      console.log(`[FILE_ID.DIZ] No @BEGIN_FILE_ID.DIZ/@END_FILE_ID.DIZ tags found in .txt file`);
      return false;
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] Failed to read .txt file: ${error.message}`);
      return false;
    }
  }

  // Check for companion .diz file (e.g., file.txt.diz or file.diz)
  const companionDizPath = uploadedFilePath + '.diz';
  const baseDizPath = path.join(path.dirname(uploadedFilePath), basename + '.diz');

  for (const checkPath of [companionDizPath, baseDizPath]) {
    if (await fileExists(checkPath)) {
      try {
        await fs.copyFile(checkPath, dizPath);
        console.log(`[FILE_ID.DIZ] Found companion .diz file: ${checkPath}`);
        return true;
      } catch (error: any) {
        console.log(`[FILE_ID.DIZ] Failed to copy companion .diz: ${error.message}`);
      }
    }
  }

  // First, try to find FILE_ID.DIZ in archive (case-insensitive search)
  console.log(`[FILE_ID.DIZ] Attempting extraction from ${ext} file`);
  console.log(`[FILE_ID.DIZ] Upload path: ${uploadedFilePath}`);
  console.log(`[FILE_ID.DIZ] Work dir: ${nodeWorkDir}`);

  const actualDizFilename = await findDizInArchive(uploadedFilePath, ext);
  if (!actualDizFilename) {
    console.log(`[FILE_ID.DIZ] No FILE_ID.DIZ found in archive - skipping extraction`);
    return false;
  }

  // Use JavaScript/TypeScript extractors for all supported formats
  if (ext === '.zip') {
    // Extract FILE_ID.DIZ from zip archive using pure TypeScript library
    console.log(`[FILE_ID.DIZ] Using TypeScript ZIP extractor`);
    try {
      const success = await extractFileDizFromZip(uploadedFilePath, dizPath);
      return success;
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] TypeScript ZIP extractor failed: ${error.message}`);
      return false;
    }
  } else if (ext === '.lha' || ext === '.lzh') {
    // Extract FILE_ID.DIZ from lha/lzh archive using pure TypeScript library
    console.log(`[FILE_ID.DIZ] Using TypeScript LHA extractor`);
    try {
      const success = await extractFileDizFromLha(uploadedFilePath, dizPath);
      return success;
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] TypeScript LHA extractor failed: ${error.message}`);
      return false;
    }
  } else if (ext === '.lzx') {
    // Extract FILE_ID.DIZ from lzx archive using pure TypeScript library
    console.log(`[FILE_ID.DIZ] Using TypeScript LZX extractor`);
    try {
      const success = await extractFileDizFromLzx(uploadedFilePath, dizPath);
      return success;
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] TypeScript LZX extractor failed: ${error.message}`);
      return false;
    }
  } else if (ext === '.dms') {
    // Extract FILE_ID.DIZ from DMS disk image using TypeScript library
    console.log(`[FILE_ID.DIZ] Using TypeScript DMS extractor`);
    try {
      const success = await extractFileDizFromDms(uploadedFilePath, dizPath);
      return success;
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] TypeScript DMS extractor failed: ${error.message}`);
      return false;
    }
  } else if (ext === '.tar' || ext === '.tgz' || ext === '.gz') {
    // Extract FILE_ID.DIZ from tar/gzip archive using pure TypeScript library
    console.log(`[FILE_ID.DIZ] Using TypeScript TAR/GZ extractor`);
    try {
      const success = await extractFileDizFromTarAuto(uploadedFilePath, dizPath);
      return success;
    } catch (error: any) {
      console.log(`[FILE_ID.DIZ] TypeScript TAR/GZ extractor failed: ${error.message}`);
      return false;
    }
  } else {
    console.log(`[FILE_ID.DIZ] File type ${ext} not supported for DIZ extraction`);
    return false;
  }
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
