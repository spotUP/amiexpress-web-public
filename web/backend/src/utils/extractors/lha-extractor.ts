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

/**
 * Unpacks every member of an LHA archive into `destDir`, synchronously.
 *
 * Sync because its caller is a 68K trap: dos.library/Execute() has to set
 * D0 before the CPU resumes, and there is nowhere to await. lha.js itself
 * is synchronous - only this module's class wrapper is async, because it
 * reads with fs/promises - so the sync path costs nothing but a
 * readFileSync.
 *
 * Member names carry AmigaDOS separators (`nested\dir\file`); they become
 * real directories. A member is REFUSED if its normalised path would land
 * outside `destDir` (`..`, an absolute path, or a drive/assign prefix): the
 * archives come from a public catalog, and an install must not be able to
 * write over the BBS.
 *
 * Returns what happened rather than throwing, so the caller can report
 * partial success: Amiga-authored archives routinely carry one member that
 * a strict reader rejects while every other member unpacks perfectly.
 */
export function extractLhaArchiveSync(
  archivePath: string,
  destDir: string
): { extracted: string[]; failed: string[] } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePath = require('path') as typeof import('path');

  const extracted: string[] = [];
  const failed: string[] = [];

  const data = new Uint8Array(nodeFs.readFileSync(archivePath));
  const entries: LhaEntryInternal[] = LHA.read(data);

  const destRoot = nodePath.resolve(destDir);

  for (const entry of entries) {
    const rawName = entry.name || '';
    // AmigaDOS/LHA use backslash for directories; a drive or assign prefix
    // ("Work:", "C:") is stripped so the member stays relative.
    const relative = rawName
      .replace(/\\/g, '/')
      .replace(/^[A-Za-z0-9_.-]*:/, '')
      .replace(/^\/+/, '');

    if (!relative || relative.endsWith('/')) {
      continue; // directory entry - created below by its members
    }

    const target = nodePath.resolve(destRoot, relative);
    if (target !== destRoot && !target.startsWith(destRoot + nodePath.sep)) {
      failed.push(rawName);
      continue;
    }

    try {
      const unpacked = LHA.unpack(entry);
      if (!unpacked) {
        failed.push(rawName);
        continue;
      }
      nodeFs.mkdirSync(nodePath.dirname(target), { recursive: true });
      nodeFs.writeFileSync(target, Buffer.from(unpacked));
      extracted.push(relative);
    } catch {
      failed.push(rawName);
    }
  }

  return { extracted, failed };
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
