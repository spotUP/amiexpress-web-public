/**
 * HOLD Directory Utilities
 * 1:1 port from AmiExpress express.e:19380-19410
 *
 * Handles moving files to HOLD directory for sysop review
 */

import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Get HOLD directory path for a conference
 * Express.e:19405 - StringF(tempstr2,'\sHOLD/\s',currentConfDir,str)
 *
 * @param conferencePath Path to conference directory (e.g., Conf1)
 * @returns Full path to HOLD directory
 */
export function getHoldDir(conferencePath: string): string {
  return path.join(conferencePath, 'HOLD');
}

/**
 * Get LCFILES directory path for a conference
 * Express.e:19404 - StringF(tempstr2,'\sLCFILES/\s',currentConfDir,str)
 *
 * @param conferencePath Path to conference directory
 * @returns Full path to LCFILES directory
 */
export function getLCFilesDir(conferencePath: string): string {
  return path.join(conferencePath, 'LCFILES');
}

/**
 * Move file to HOLD directory
 * Express.e:19403-19415 - File movement logic
 *
 * @param sourcePath Current file location (e.g., Node0/Playpen/file.zip)
 * @param filename Filename to move
 * @param conferencePath Path to conference directory
 * @returns New file path in HOLD directory
 */
export async function moveToHold(
  sourcePath: string,
  filename: string,
  conferencePath: string
): Promise<string> {
  const holdDir = getHoldDir(conferencePath);
  const targetPath = path.join(holdDir, filename);

  // Ensure HOLD directory exists
  await fs.mkdir(holdDir, { recursive: true });

  try {
    // Move file from playpen to HOLD
    await fs.rename(sourcePath, targetPath);
    console.log(`[HOLD] Moved ${filename} to HOLD directory`);

    // Update HOLD/HELD tracking file (express.e:19488)
    await updateHeldTracking(conferencePath, filename, 'add');

    return targetPath;
  } catch (error: any) {
    console.error(`[HOLD] Error moving file to HOLD: ${error.message}`);
    throw error;
  }
}

/**
 * Move file to LCFILES directory (lost carrier)
 * Express.e:19404 - StringF(tempstr2,'\sLCFILES/\s',currentConfDir,str)
 *
 * @param sourcePath Current file location
 * @param filename Filename to move
 * @param conferencePath Path to conference directory
 * @returns New file path in LCFILES directory
 */
export async function moveToLCFiles(
  sourcePath: string,
  filename: string,
  conferencePath: string
): Promise<string> {
  const lcfilesDir = getLCFilesDir(conferencePath);
  const targetPath = path.join(lcfilesDir, filename);

  // Ensure LCFILES directory exists
  await fs.mkdir(lcfilesDir, { recursive: true });

  try {
    // Move file from playpen to LCFILES
    await fs.rename(sourcePath, targetPath);
    console.log(`[LCFILES] Moved ${filename} to LCFILES directory`);

    return targetPath;
  } catch (error: any) {
    console.error(`[LCFILES] Error moving file: ${error.message}`);
    throw error;
  }
}

/**
 * Update HOLD/HELD tracking file
 * Express.e:19488 - StrAdd(ray,'HOLD/HELD')
 *
 * This file tracks the number of files in HOLD directory
 *
 * @param conferencePath Path to conference directory
 * @param filename Filename being added/removed
 * @param action 'add' or 'remove'
 */
async function updateHeldTracking(
  conferencePath: string,
  filename: string,
  action: 'add' | 'remove'
): Promise<void> {
  const heldFile = path.join(conferencePath, 'HOLD', 'HELD');

  try {
    let count = 0;

    // Read current count
    try {
      const content = await fs.readFile(heldFile, 'utf-8');
      count = parseInt(content.trim()) || 0;
    } catch {
      // File doesn't exist, start at 0
      count = 0;
    }

    // Update count
    if (action === 'add') {
      count++;
    } else if (action === 'remove' && count > 0) {
      count--;
    }

    // Write updated count
    await fs.writeFile(heldFile, count.toString());
    console.log(`[HOLD] Updated HELD tracking: ${count} files`);
  } catch (error: any) {
    console.error(`[HOLD] Error updating HELD tracking: ${error.message}`);
  }
}

/**
 * Get conference directory path from conference ID
 *
 * @param conferenceId Conference ID (1, 2, 3, etc.)
 * @param bbsDataPath Base data path
 * @returns Path to conference directory (e.g., Conf1)
 */
function getConferenceName(conferenceId: number): string {
  return `Conf${conferenceId}`;
}

export function getRootConferenceDir(conferenceId: number, bbsDataPath: string): string {
  return path.join(bbsDataPath, getConferenceName(conferenceId));
}

export function getConferenceDir(conferenceId: number, bbsDataPath: string): string {
  return getRootConferenceDir(conferenceId, bbsDataPath);
}

export function getConferenceDirCandidates(conferenceId: number, bbsDataPath: string): string[] {
  const rootDir = getRootConferenceDir(conferenceId, bbsDataPath);
  return [rootDir];
}

/**
 * Get file area directory path
 * Express.e:19403 - Gets the file area's actual storage directory
 *
 * @param fileAreaId File area ID
 * @param bbsDataPath Base BBS data path
 * @returns Path to file area directory
 */
export async function getFileAreaDir(fileAreaId: number, bbsDataPath: string): Promise<string> {
  const { db } = require('../database');

  // Get file area path from database
  const fileAreaResult = await db.query(
    `SELECT path FROM file_areas WHERE id = $1 LIMIT 1`,
    [fileAreaId]
  );

  if (fileAreaResult.rows.length === 0) {
    throw new Error(`File area ${fileAreaId} not found`);
  }

  const fileAreaPath = fileAreaResult.rows[0].path;

  // If path is absolute, use it; otherwise make it relative to BBS data path
  if (path.isAbsolute(fileAreaPath)) {
    return fileAreaPath;
  } else {
    return path.join(bbsDataPath, fileAreaPath);
  }
}

/**
 * Move file to file area directory
 * Express.e:19403-19415 - Move file to its final destination
 *
 * @param sourcePath Current file location
 * @param filename Filename
 * @param fileAreaId Target file area ID
 * @param bbsDataPath Base BBS data path
 * @returns New file path
 */
export async function moveToFileArea(
  sourcePath: string,
  filename: string,
  fileAreaId: number,
  bbsDataPath: string
): Promise<string> {
  const fileAreaDir = await getFileAreaDir(fileAreaId, bbsDataPath);
  const targetPath = path.join(fileAreaDir, filename);

  // Ensure file area directory exists
  await fs.mkdir(fileAreaDir, { recursive: true });

  try {
    // Move file from playpen to file area
    await fs.rename(sourcePath, targetPath);
    console.log(`[FileArea] Moved ${filename} to file area ${fileAreaId}`);
    return targetPath;
  } catch (error: any) {
    console.error(`[FileArea] Error moving file to file area: ${error.message}`);
    throw error;
  }
}

/**
 * Move file to conference Files directory (active uploads)
 * Express.e:19403-19415 - Standard file upload destination
 *
 * @param sourcePath Current file location
 * @param filename Filename
 * @param conferencePath Path to conference directory
 * @returns New file path
 */
export async function moveToFiles(
  sourcePath: string,
  filename: string,
  conferencePath: string
): Promise<string> {
  const filesDir = path.join(conferencePath, 'Files');
  const targetPath = path.join(filesDir, filename);

  // Ensure Files directory exists
  await fs.mkdir(filesDir, { recursive: true });

  try {
    // Move file from playpen to Files
    await fs.rename(sourcePath, targetPath);
    console.log(`[Files] Moved ${filename} to ${filesDir}`);
    return targetPath;
  } catch (error: any) {
    console.error(`[Files] Error moving file: ${error.message}`);
    throw error;
  }
}

/**
 * Move file to appropriate directory based on status
 * Express.e:19403-19415 - Complete file movement logic
 *
 * @param sourcePath Current file location
 * @param filename Filename
 * @param status File status (hold, lcfiles, or active)
 * @param conferenceId Conference ID
 * @param bbsDataPath Base BBS data path
 * @returns New file path
 */
export async function moveUploadedFile(
  sourcePath: string,
  filename: string,
  status: 'hold' | 'lcfiles' | 'active' | 'private',
  conferenceId: number,
  bbsDataPath: string
): Promise<string> {
  const conferenceDir = getConferenceDir(conferenceId, bbsDataPath);

  if (status === 'hold' || status === 'private') {
    // Move to HOLD directory for sysop review
    return await moveToHold(sourcePath, filename, conferenceDir);
  } else if (status === 'lcfiles') {
    // Move to LCFILES directory for lost carrier handling
    return await moveToLCFiles(sourcePath, filename, conferenceDir);
  } else {
    // Move to Files directory (normal active upload)
    return await moveToFiles(sourcePath, filename, conferenceDir);
  }
}
