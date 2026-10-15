/**
 * ZOO Archive Extractor (Stub)
 *
 * ZOO format (.zoo) was created in 1986 by Rahul Dhesi.
 * This is a legacy Unix/Amiga format rarely used in modern systems.
 *
 * LIMITATION: Full ZOO extraction is not currently supported due to:
 * - No available npm packages for ZOO format
 * - No command-line tools installed (zoo/unzoo)
 * - Format requires implementing 1986-era compression algorithms
 *
 * If ZOO support is needed:
 * 1. Install command-line tool: brew install zoo
 * 2. Implement shell-based extractor using child_process.exec()
 * 3. Or implement ZOO format parser from specification
 */

import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

export class ZooExtractor extends BaseArchiveExtractor {
  constructor() {
    super('ZOO');
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    this.logError('ZOO format extraction is not currently supported');
    this.logError('No npm packages or command-line tools available for ZOO archives');
    this.logError('Consider converting .zoo files to .lzh or .zip format');
    return [];
  }

  async listFiles(filepath: string): Promise<string[]> {
    this.log('ZOO format not supported - install "zoo" command-line tool or convert to .lzh/.zip');
    return [];
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    this.logError('ZOO extraction not supported');
    return null;
  }
}

// Legacy exports for backward compatibility
export async function extractFileDizFromZoo(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new ZooExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}

export async function listZooFiles(filepath: string): Promise<string[]> {
  const extractor = new ZooExtractor();
  return extractor.listFiles(filepath);
}

export async function extractFileFromZoo(
  filepath: string,
  filename: string,
  outputPath: string
): Promise<boolean> {
console.error('[ZOO] Format not supported - convert to .lzh or .zip');
  return false;
}
