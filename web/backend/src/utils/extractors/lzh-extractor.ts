/**
 * LZH Archive Extractor
 * Wraps the LZH parser implementation
 */

import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';
import * as lzh from '../lzh-parser';

export class LzhExtractor extends BaseArchiveExtractor {
  constructor() {
    super('LZH');
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const files = await lzh.listLzhFiles(filepath);
    return files.map(name => ({
      name,
      size: 0, // Size not available without full parsing
    }));
  }

  async listFiles(filepath: string): Promise<string[]> {
    return lzh.listLzhFiles(filepath);
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    // LZH parser doesn't have generic extraction, only FILE_ID.DIZ search
    this.log('Generic file extraction not implemented for LZH');
    return null;
  }

  async extractFileDiz(filepath: string, outputPath: string): Promise<boolean> {
    const dizContent = await lzh.findFileIdDizInLzh(filepath);
    if (!dizContent) {
      this.log('FILE_ID.DIZ not found in archive');
      return false;
    }

    const fs = require('fs/promises');
    await fs.writeFile(outputPath, dizContent);
    this.log(`✓ Extracted FILE_ID.DIZ to ${outputPath}`);
    return true;
  }
}

// Re-export all legacy functions from lzh-parser
export * from '../lzh-parser';

// Legacy compatibility
export async function extractFileDizFromLzh(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new LzhExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}
