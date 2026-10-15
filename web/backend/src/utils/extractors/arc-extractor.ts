/**
 * ARC Archive Extractor (Stub)
 *
 * ARC format (.arc) was created in 1985 by System Enhancement Associates (SEA).
 * This is a legacy DOS/BBS format rarely used in modern systems.
 *
 * LIMITATION: Full ARC extraction is not currently supported due to:
 * - No available npm packages for ARC format
 * - No command-line tools installed (unarc/arc)
 * - Format requires implementing 1985-era compression algorithms
 *
 * If ARC support is needed:
 * 1. Install command-line tool: brew install arc
 * 2. Implement shell-based extractor using child_process.exec()
 * 3. Or implement ARC format parser from specification
 */

import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

export class ArcExtractor extends BaseArchiveExtractor {
  constructor() {
    super('ARC');
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    this.logError('ARC format extraction is not currently supported');
    this.logError('No npm packages or command-line tools available for ARC archives');
    this.logError('Consider converting .arc files to .lzh or .zip format');
    return [];
  }

  async listFiles(filepath: string): Promise<string[]> {
    this.log('ARC format not supported - install "arc" command-line tool or convert to .lzh/.zip');
    return [];
  }

  async extractFile(filepath: string, filename: string): Promise<Buffer | null> {
    this.logError('ARC extraction not supported');
    return null;
  }
}

// Legacy exports for backward compatibility
export async function extractFileDizFromArc(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new ArcExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}

export async function listArcFiles(filepath: string): Promise<string[]> {
  const extractor = new ArcExtractor();
  return extractor.listFiles(filepath);
}

export async function extractFileFromArc(
  filepath: string,
  filename: string,
  outputPath: string
): Promise<boolean> {
console.error('[ARC] Format not supported - convert to .lzh or .zip');
  return false;
}
