/**
 * LHA Archive Extractor
 * Uses lha.js library by Stuart Caie
 */

import * as fs from 'fs/promises';
import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LHA = require('../lha.js');

export interface LhaEntryInternal {
  name: string;
  packMethod: string;
  packedLength: number;
  length: number;
  lastModified: Date;
  comment?: string;
  data: Uint8Array;
}

export class LhaExtractor extends BaseArchiveExtractor {
  constructor() {
    super('LHA');
  }

  private async readArchive(filepath: string): Promise<LhaEntryInternal[]> {
    const buffer = await fs.readFile(filepath);
    const data = new Uint8Array(buffer);
    return LHA.read(data);
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const entries = await this.readArchive(filepath);

    return entries.map((entry: LhaEntry) => ({
      name: entry.name,
      size: entry.length,
      compressedSize: entry.packedLength,
    }));
  }

  async listFiles(filepath: string): Promise<string[]> {
    try {
      const entries = await this.getEntries(filepath);
      return entries.map((e) => e.name);
    } catch (error: any) {
      this.logError(`Error listing files: ${error.message}`);
      return [];
    }
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    try {
      const entries = await this.readArchive(filepath);

      // Case-insensitive search
      const lowerFilename = filename.toLowerCase();
      const entry = entries.find((e: LhaEntryInternal) => e.name.toLowerCase() === lowerFilename);

      if (!entry) {
        this.log(`File not found in archive: ${filename}`);
        return null;
      }

      this.log(`Found: ${entry.name} (${entry.packMethod}, ${entry.length} bytes)`);

      // Decompress
      const decompressed = LHA.unpack(entry);

      if (!decompressed) {
        this.log(`Decompression failed for ${entry.name}`);
        return null;
      }

      return Buffer.from(decompressed);
    } catch (error: any) {
      this.logError(`Error extracting file: ${error.message}`);
      return null;
    }
  }
}

// Legacy exports for backward compatibility
export interface LhaEntry {
  name: string;
  packMethod: string;
  packedLength: number;
  length: number;
  lastModified: Date;
  comment?: string;
  data: Uint8Array;
}

export async function readLhaArchive(filepath: string): Promise<LhaEntry[]> {
  const fs = require('fs/promises');
  const LHA = require('../lha.js');
  const buffer = await fs.readFile(filepath);
  const data = new Uint8Array(buffer);
  return LHA.read(data);
}

export async function extractFileDizFromLha(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new LhaExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}

export async function listLhaFiles(filepath: string): Promise<string[]> {
  const extractor = new LhaExtractor();
  return extractor.listFiles(filepath);
}

export async function extractFileFromLha(
  filepath: string,
  filename: string
): Promise<Buffer | null> {
  const extractor = new LhaExtractor();
  return extractor.extractFile(filepath, filename);
}
