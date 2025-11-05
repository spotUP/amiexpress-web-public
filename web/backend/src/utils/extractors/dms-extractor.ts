/**
 * DMS (Disk Masher System) Extractor
 * DMS is for Amiga disk images - requires filesystem parsing for FILE_ID.DIZ extraction
 */

import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

export class DmsExtractor extends BaseArchiveExtractor {
  constructor() {
    super('DMS');
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    // DMS is a disk image format, not a file archive
    // Would require parsing Amiga OFS/FFS filesystem
    this.log('DMS filesystem parsing not implemented');
    return [];
  }

  async listFiles(filepath: string): Promise<string[]> {
    return [];
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    this.log('DMS file extraction requires Amiga OFS/FFS filesystem parser');
    return null;
  }
}

// Legacy exports for backward compatibility
export async function extractFileDizFromDms(
  dmsPath: string,
  outputPath: string
): Promise<boolean> {
  console.log(`[DMS] FILE_ID.DIZ extraction from DMS not yet implemented`);
  console.log(`[DMS] Reason: Requires Amiga OFS/FFS filesystem parser`);
  console.log(`[DMS] Note: DMS files are very rare for BBS uploads`);
  return false;
}

export async function decompressDmsToAdf(
  dmsPath: string,
  adfPath: string
): Promise<boolean> {
  const fs = require('fs/promises');
  const path = require('path');
  const SAEO_DMS = require('../dms.js');

  try {
    console.log(`[DMS] Decompressing ${path.basename(dmsPath)} to ADF...`);

    const dmsData = await fs.readFile(dmsPath);
    const dmsArray = new Uint8Array(dmsData);
    const dms = new SAEO_DMS();
    const result = dms.unpack(dmsArray);

    if (!result || !result.data) {
      console.log(`[DMS] Decompression failed`);
      return false;
    }

    await fs.writeFile(adfPath, Buffer.from(result.data));
    console.log(`[DMS] ✓ Decompressed to ${adfPath} (${result.data.length} bytes)`);
    return true;
  } catch (error: any) {
    console.error(`[DMS] Error: ${error.message}`);
    return false;
  }
}

export async function isDmsFile(filepath: string): Promise<boolean> {
  const fs = require('fs/promises');
  try {
    const buffer = await fs.readFile(filepath);
    if (buffer.length < 4) return false;
    const magic = buffer.toString('ascii', 0, 4);
    return magic === 'DMS!';
  } catch {
    return false;
  }
}
