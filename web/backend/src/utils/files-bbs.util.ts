/**
 * FILES.BBS Writing Utilities
 *
 * FILES.BBS is a standard BBS file listing format used by many third-party doors
 * like AquaScan. The format is identical to DIR files but always named FILES.BBS
 * and located in the upload directory.
 *
 * Format (same as DIR files):
 * FILENAME.EXT  P  sizeK  MM-DD-YY  Description line 1
 *                                   Description line 2 (indented 33 spaces)
 *                                   Sent by: Username
 */

import * as path from "path";
import * as fs from "fs/promises";
import { writeDirEntry } from "./dir-file.util";

/**
 * Get FILES.BBS path for a conference's upload directory
 *
 * @param conferencePath Path to conference directory (e.g., /path/to/Conf1)
 * @param uploadSubdir Upload subdirectory name (default: 'Upload')
 * @returns Full path to FILES.BBS
 */
export function getFilesBBSPath(
  conferencePath: string,
  uploadSubdir: string = "Upload"
): string {
  return path.join(conferencePath, uploadSubdir, "FILES.BBS");
}

/**
 * Write entry to FILES.BBS
 * Uses the same format as DIR files for compatibility
 *
 * @param conferencePath Path to conference directory
 * @param filename Uploaded filename
 * @param fileSize File size in bytes
 * @param uploadDate Upload date
 * @param description Full description (can be multi-line)
 * @param statusMarker P=Passed, F=Failed, N=Not tested, D=Duplicate
 * @param username Uploader's username
 * @param addSentBy Whether to add 'Sent by:' line
 * @param uploadSubdir Upload subdirectory name (default: 'Upload')
 */
export async function writeToFilesBBS(
  conferencePath: string,
  filename: string,
  fileSize: number,
  uploadDate: Date,
  description: string,
  statusMarker: "P" | "F" | "N" | "D",
  username: string,
  addSentBy: boolean = true,
  uploadSubdir: string = "Upload"
): Promise<void> {
  const filesBBSPath = getFilesBBSPath(conferencePath, uploadSubdir);

  try {
    // Use the same DIR file writing logic for consistency
    await writeDirEntry(
      filesBBSPath,
      filename,
      fileSize,
      uploadDate,
      description,
      statusMarker,
      username,
      addSentBy,
      false // isLCFile = false for regular uploads
    );

console.log(
      `[FILES.BBS] Wrote entry to ${path.basename(
        path.dirname(filesBBSPath)
      )}/FILES.BBS: ${filename}`
    );
  } catch (error: any) {
console.error(
      `[FILES.BBS] Error writing FILES.BBS entry: ${error.message}`
    );
    // Don't throw - FILES.BBS is supplementary, DIR file is primary
  }
}

/**
 * Check if FILES.BBS exists for a conference
 *
 * @param conferencePath Path to conference directory
 * @param uploadSubdir Upload subdirectory name (default: 'Upload')
 * @returns True if FILES.BBS exists
 */
export async function filesBBSExists(
  conferencePath: string,
  uploadSubdir: string = "Upload"
): Promise<boolean> {
  const filesBBSPath = getFilesBBSPath(conferencePath, uploadSubdir);
  try {
    await fs.access(filesBBSPath);
    return true;
  } catch {
    return false;
  }
}
