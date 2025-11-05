/**
 * ZIP Archive Extractor
 * Uses adm-zip library
 */

import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

export class ZipExtractor extends BaseArchiveExtractor {
  constructor() {
    super('ZIP');
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const zip = new AdmZip(filepath);
    const entries = zip.getEntries();

    return entries.map((entry: any) => ({
      name: entry.entryName,
      size: entry.header.size,
      compressedSize: entry.header.compressedSize,
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
      const zip = new AdmZip(filepath);
      const entry = zip.getEntry(filename);

      if (!entry) {
        this.log(`File not found: ${filename}`);
        return null;
      }

      return entry.getData();
    } catch (error: any) {
      this.logError(`Error extracting file: ${error.message}`);
      return null;
    }
  }
}

// Legacy exports for backward compatibility
export async function extractFileDizFromZip(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new ZipExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}

export async function listZipFiles(filepath: string): Promise<string[]> {
  const extractor = new ZipExtractor();
  return extractor.listFiles(filepath);
}

export async function extractFileFromZip(
  filepath: string,
  filename: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new ZipExtractor();
  const data = await extractor.extractFile(filepath, filename);

  if (!data) {
    return false;
  }

  const fs = require('fs/promises');
  await fs.writeFile(outputPath, data);
  return true;
}
