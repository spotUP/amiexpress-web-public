/**
 * DMS (Disk Masher System) Decompressor
 * Wrapper around SAE DMS decompressor for Amiga disk images
 *
 * Original: Scripted Amiga Emulator (SAE)
 * Port of: xDMS v1.3 (Public Domain)
 *
 * DMS files are compressed Amiga disk images. This decompressor
 * converts .dms to .adf (Amiga Disk Format).
 *
 * NOTE: Extracting FILE_ID.DIZ from DMS requires:
 * 1. Decompress DMS → ADF
 * 2. Parse Amiga OFS/FFS filesystem from ADF
 * 3. Extract FILE_ID.DIZ
 *
 * Currently implements step 1 only. Steps 2-3 are complex and
 * rarely needed (DMS files are uncommon for file uploads).
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Import the DMS decompressor
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SAEO_DMS = require('./dms.js');

/**
 * Decompress DMS file to ADF (Amiga Disk Format)
 *
 * @param dmsPath Path to .dms file
 * @param adfPath Path to output .adf file
 * @returns true if successful
 */
export async function decompressDmsToAdf(
  dmsPath: string,
  adfPath: string
): Promise<boolean> {
  try {
    console.log(`[DMS] Decompressing ${path.basename(dmsPath)} to ADF...`);

    // Read DMS file
    const dmsData = await fs.readFile(dmsPath);
    const dmsArray = new Uint8Array(dmsData);

    // Create DMS decompressor instance
    const dms = new SAEO_DMS();

    // Decompress DMS to ADF
    const result = dms.unpack(dmsArray);

    if (!result || !result.data) {
      console.log(`[DMS] Decompression failed`);
      return false;
    }

    // Write ADF file
    await fs.writeFile(adfPath, Buffer.from(result.data));
    console.log(`[DMS] ✓ Decompressed to ${adfPath} (${result.data.length} bytes)`);

    return true;
  } catch (error: any) {
    console.error(`[DMS] Error: ${error.message}`);
    return false;
  }
}

/**
 * Extract FILE_ID.DIZ from DMS file
 *
 * This is a placeholder. Full implementation requires:
 * 1. Decompress DMS → ADF ✅
 * 2. Parse Amiga OFS/FFS filesystem ❌ (not implemented)
 * 3. Extract FILE_ID.DIZ ❌ (not implemented)
 *
 * For now, returns false (not supported).
 * DMS files are very rare for BBS uploads anyway.
 */
export async function extractFileDizFromDms(
  dmsPath: string,
  outputPath: string
): Promise<boolean> {
  console.log(`[DMS] FILE_ID.DIZ extraction from DMS not yet implemented`);
  console.log(`[DMS] Reason: Requires Amiga OFS/FFS filesystem parser`);
  console.log(`[DMS] Note: DMS files are very rare for BBS uploads`);

  // TODO: Implement Amiga filesystem parser
  // For reference, see: https://wiki.amigaos.net/wiki/OFS_Filesystem

  return false;
}

/**
 * Check if file is a valid DMS archive
 */
export async function isDmsFile(filepath: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filepath);

    // DMS files start with 'DMS!' magic bytes
    if (buffer.length < 4) return false;

    const magic = buffer.toString('ascii', 0, 4);
    return magic === 'DMS!';
  } catch {
    return false;
  }
}
