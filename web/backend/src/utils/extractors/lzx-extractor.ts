/**
 * LZX Archive Extractor
 * Wraps the full LZX decompression implementation
 */

import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';
import * as lzx from '../lzx-extractor';

export class LzxExtractor extends BaseArchiveExtractor {
  constructor() {
    super('LZX');
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const files = await lzx.listLzxFiles(filepath);
    return files.map(name => ({
      name,
      size: 0, // Size not available without extracting
    }));
  }

  async listFiles(filepath: string): Promise<string[]> {
    return lzx.listLzxFiles(filepath);
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    // LZX extractor needs output path, can't return buffer directly
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // Use temp file
    const tempPath = path.join(os.tmpdir(), `lzx_${Date.now()}_${filename}`);
    const success = await lzx.extractFileFromLzx(filepath, filename, tempPath);

    if (!success) {
      return null;
    }

    try {
      const buffer = await fs.promises.readFile(tempPath);
      await fs.promises.unlink(tempPath); // Cleanup
      return buffer;
    } catch (error: any) {
      this.logError(`Error reading extracted file: ${error.message}`);
      return null;
    }
  }
}

// Re-export all legacy functions from the main lzx-extractor
export * from '../lzx-extractor';
