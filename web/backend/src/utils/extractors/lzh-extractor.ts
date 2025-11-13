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
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const fs = require('fs/promises');
    const path = require('path');
    const os = require('os');
    const execAsync = promisify(exec);

    // Use system lha command for extraction if available
    try {
      // Check if lha command exists
      try {
        await execAsync('which lha');
      } catch {
        this.log('lha command not found in system PATH - cannot extract files');
        this.log('Install lha: brew install lha (macOS) or apt-get install lha (Linux)');
        return null;
      }

      // Create temporary directory for extraction
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lzh-extract-'));

      try {
        // Extract specific file using lha command
        // lha x -w=<tempdir> <archive> <filename>
        await execAsync(`lha x "-w=${tempDir}" "${filepath}" "${filename}"`, {
          timeout: 30000
        });

        // Read extracted file
        const extractedPath = path.join(tempDir, filename);
        const content = await fs.readFile(extractedPath);

        this.log(`✓ Extracted ${filename} from LZH archive`);
        return content;
      } finally {
        // Clean up temp directory
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          this.log(`Warning: Failed to clean up temp directory: ${tempDir}`);
        }
      }
    } catch (error: any) {
      this.log(`Error extracting file from LZH: ${error.message}`);
      return null;
    }
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
