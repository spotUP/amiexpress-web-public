/**
 * LHA Archive Extractor
 * Wrapper around lha.js (by Stuart Caie) for Node.js use
 *
 * Original library: https://github.com/kyz/lha.js
 * License: Public Domain
 *
 * Supports: -lh0-, -lh4-, -lh5-, -lh6-, -lh7-, -lhd-
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Import the lha.js library
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LHA = require('./lha.js');

export interface LhaEntry {
  name: string;
  packMethod: string;
  packedLength: number;
  length: number;
  lastModified: Date;
  comment?: string;
  data: Uint8Array;
}

/**
 * Read LHA archive from file
 */
export async function readLhaArchive(filepath: string): Promise<LhaEntry[]> {
  const buffer = await fs.readFile(filepath);
  const data = new Uint8Array(buffer);
  return LHA.read(data);
}

/**
 * Extract a specific file from LHA archive
 * Returns decompressed data as Buffer
 */
export async function extractFileFromLha(
  filepath: string,
  filename: string
): Promise<Buffer | null> {
  try {
    const entries = await readLhaArchive(filepath);

    // Find file (case-insensitive)
    const lowerFilename = filename.toLowerCase();
    const entry = entries.find(
      (e: LhaEntry) => e.name.toLowerCase() === lowerFilename
    );

    if (!entry) {
      console.log(`[LHA] File not found in archive: ${filename}`);
      return null;
    }

    console.log(`[LHA] Found: ${entry.name} (${entry.packMethod}, ${entry.length} bytes)`);

    // Decompress the file
    const decompressed = LHA.unpack(entry);

    if (!decompressed) {
      console.log(`[LHA] Decompression failed for ${entry.name}`);
      return null;
    }

    // Convert Uint8Array to Buffer
    return Buffer.from(decompressed);
  } catch (error: any) {
    console.error(`[LHA] Error extracting file: ${error.message}`);
    return null;
  }
}

/**
 * List all files in LHA archive
 */
export async function listLhaFiles(filepath: string): Promise<string[]> {
  try {
    const entries = await readLhaArchive(filepath);
    return entries.map((e: LhaEntry) => e.name);
  } catch (error: any) {
    console.error(`[LHA] Error listing files: ${error.message}`);
    return [];
  }
}

/**
 * Find FILE_ID.DIZ in LHA archive and extract it
 */
export async function extractFileDizFromLha(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  try {
    console.log(`[LHA] Extracting FILE_ID.DIZ from ${path.basename(filepath)}`);

    // Find FILE_ID.DIZ (case-insensitive)
    const entries = await readLhaArchive(filepath);
    const dizEntry = entries.find(
      (e: LhaEntry) => e.name.toLowerCase() === 'file_id.diz'
    );

    if (!dizEntry) {
      console.log(`[LHA] FILE_ID.DIZ not found in archive`);
      return false;
    }

    console.log(`[LHA] Found: ${dizEntry.name} (${dizEntry.packMethod}, ${dizEntry.length} bytes)`);

    // Decompress
    const decompressed = LHA.unpack(dizEntry);
    if (!decompressed) {
      console.log(`[LHA] Failed to decompress FILE_ID.DIZ`);
      return false;
    }

    // Write to file
    await fs.writeFile(outputPath, Buffer.from(decompressed));
    console.log(`[LHA] ✓ Extracted FILE_ID.DIZ to ${outputPath}`);

    return true;
  } catch (error: any) {
    console.error(`[LHA] Error: ${error.message}`);
    return false;
  }
}
