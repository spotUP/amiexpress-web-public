/**
 * ZIP Archive Extractor
 * Wrapper around adm-zip for FILE_ID.DIZ extraction
 *
 * Library: adm-zip (pure JavaScript, no dependencies)
 * npm: https://www.npmjs.com/package/adm-zip
 */

import * as fs from 'fs/promises';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

/**
 * Extract FILE_ID.DIZ from ZIP archive
 */
export async function extractFileDizFromZip(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  try {
    console.log(`[ZIP] Extracting FILE_ID.DIZ from ${path.basename(filepath)}`);

    const zip = new AdmZip(filepath);
    const entries = zip.getEntries();

    // Find FILE_ID.DIZ (case-insensitive)
    const dizEntry = entries.find((entry: any) =>
      entry.entryName.toLowerCase() === 'file_id.diz'
    );

    if (!dizEntry) {
      console.log(`[ZIP] FILE_ID.DIZ not found in archive`);
      return false;
    }

    console.log(`[ZIP] Found: ${dizEntry.entryName} (${dizEntry.header.size} bytes)`);

    // Extract to buffer
    const buffer = dizEntry.getData();

    // Write to file
    await fs.writeFile(outputPath, buffer);
    console.log(`[ZIP] ✓ Extracted FILE_ID.DIZ to ${outputPath}`);

    return true;
  } catch (error: any) {
    console.error(`[ZIP] Error: ${error.message}`);
    return false;
  }
}

/**
 * List all files in ZIP archive
 */
export async function listZipFiles(filepath: string): Promise<string[]> {
  try {
    const zip = new AdmZip(filepath);
    const entries = zip.getEntries();
    return entries.map((entry: any) => entry.entryName);
  } catch (error: any) {
    console.error(`[ZIP] Error listing files: ${error.message}`);
    return [];
  }
}

/**
 * Extract any file from ZIP archive
 */
export async function extractFileFromZip(
  filepath: string,
  filename: string,
  outputPath: string
): Promise<boolean> {
  try {
    const zip = new AdmZip(filepath);
    const entry = zip.getEntry(filename);

    if (!entry) {
      console.log(`[ZIP] File not found: ${filename}`);
      return false;
    }

    const buffer = entry.getData();
    await fs.writeFile(outputPath, buffer);
    console.log(`[ZIP] Extracted ${filename} to ${outputPath}`);

    return true;
  } catch (error: any) {
    console.error(`[ZIP] Error: ${error.message}`);
    return false;
  }
}
