/**
 * Unified Archive Extractor
 *
 * Provides a common interface for extracting files from various archive formats.
 * Consolidates duplicate logic across LHA, ZIP, TAR, LZX, DMS, and LZH extractors.
 *
 * Key features:
 * - Common FILE_ID.DIZ extraction logic
 * - Case-insensitive filename matching
 * - Subdirectory searching (e.g., somedir/FILE_ID.DIZ)
 * - Consistent error handling and logging
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SysopDebugUtil, DebugSeverity } from './sysop-debug.util';

/**
 * Archive entry interface
 */
export interface ArchiveEntry {
  name: string;
  size: number;
  compressedSize?: number;
  data?: Buffer | Uint8Array;
}

/**
 * Archive extractor interface
 */
export interface IArchiveExtractor {
  /**
   * List all files in the archive
   */
  listFiles(filepath: string): Promise<string[]>;

  /**
   * Extract a specific file from the archive
   */
  extractFile(filepath: string, filename: string): Promise<Buffer | null>;

  /**
   * Get all entries from the archive
   */
  getEntries(filepath: string): Promise<ArchiveEntry[]>;
}

/**
 * Base class with shared FILE_ID.DIZ extraction logic
 */
export abstract class BaseArchiveExtractor implements IArchiveExtractor {
  protected formatName: string;

  constructor(formatName: string) {
    this.formatName = formatName;
  }

  abstract listFiles(filepath: string): Promise<string[]>;
  abstract extractFile(filepath: string, filename: string): Promise<Buffer | null>;
  abstract getEntries(filepath: string): Promise<ArchiveEntry[]>;

  /**
   * Find FILE_ID.DIZ in archive (case-insensitive, including subdirectories)
   *
   * Matches:
   * - file_id.diz (root)
   * - somedir/file_id.diz (Unix path)
   * - somedir\file_id.diz (DOS/Windows path)
   */
  protected findFileDizEntry(entries: ArchiveEntry[]): ArchiveEntry | null {
    return entries.find((entry) => {
      const lowerName = entry.name.toLowerCase();
      return (
        lowerName === 'file_id.diz' ||
        lowerName.endsWith('/file_id.diz') ||
        lowerName.endsWith('\\file_id.diz')
      );
    }) || null;
  }

  /**
   * Case-insensitive filename search
   */
  protected findEntryByName(entries: ArchiveEntry[], filename: string): ArchiveEntry | null {
    const lowerFilename = filename.toLowerCase();
    return entries.find((entry) => entry.name.toLowerCase() === lowerFilename) || null;
  }

  /**
   * Extract FILE_ID.DIZ from archive
   * Common implementation used by all format extractors
   */
  async extractFileDiz(filepath: string, outputPath: string): Promise<boolean> {
    try {
console.log(`[${this.formatName}] Extracting FILE_ID.DIZ from ${path.basename(filepath)}`);

      const entries = await this.getEntries(filepath);

console.log(`[${this.formatName}] Archive contains ${entries.length} files:`);
      entries.forEach((entry) => {
console.log(`[${this.formatName}]   - ${entry.name}`);
      });

      const dizEntry = this.findFileDizEntry(entries);

      if (!dizEntry) {
console.log(
          `[${this.formatName}] FILE_ID.DIZ not found in archive (searched ${entries.length} files)`
        );
        return false;
      }

console.log(
        `[${this.formatName}] Found: ${dizEntry.name} (${dizEntry.size} bytes)`
      );

      // Extract the file
      const data = await this.extractFile(filepath, dizEntry.name);

      if (!data) {
console.log(`[${this.formatName}] Failed to extract FILE_ID.DIZ`);
        return false;
      }

      // Write to output file
      await fs.writeFile(outputPath, data);
console.log(
        `[${this.formatName}] ✓ Extracted FILE_ID.DIZ to ${outputPath} (${data.length} bytes)`
      );

      return true;
    } catch (error: any) {
console.error(`[${this.formatName}] Error: ${error.message}`);
      SysopDebugUtil.debug(
        null,
        null,
        'Archive Extractor',
        `Failed to extract FILE_ID.DIZ from ${this.formatName} archive "${path.basename(filepath)}"`,
        {
          error: error.message,
          format: this.formatName,
          filepath: path.basename(filepath)
        },
        DebugSeverity.WARNING
      );
      return false;
    }
  }

  /**
   * Log helper
   */
  protected log(message: string): void {
console.log(`[${this.formatName}] ${message}`);
  }

  /**
   * Error log helper
   */
  protected logError(message: string): void {
console.error(`[${this.formatName}] ${message}`);
  }
}

/**
 * Detect archive format by extension
 */
export function detectArchiveFormat(filepath: string): string | null {
  const ext = path.extname(filepath).toLowerCase();
  const basename = path.basename(filepath).toLowerCase();

  // Check for double extensions first
  if (basename.endsWith('.tar.gz') || basename.endsWith('.tar.z')) {
    return 'tar.gz';
  }

  // Single extensions
  const formatMap: Record<string, string> = {
    '.zip': 'zip',
    '.lha': 'lha',
    '.lzh': 'lzh',
    '.lzx': 'lzx',
    '.tar': 'tar',
    '.gz': 'tar.gz',
    '.tgz': 'tar.gz',
    '.dms': 'dms',
    '.arc': 'arc',
    '.zoo': 'zoo',
  };

  return formatMap[ext] || null;
}

/**
 * Factory function to get the appropriate extractor for a file
 */
export async function getExtractorForFile(filepath: string): Promise<IArchiveExtractor | null> {
  const format = detectArchiveFormat(filepath);

  if (!format) {
    return null;
  }

  // Import the appropriate extractor dynamically
  switch (format) {
    case 'zip':
      const { ZipExtractor } = await import('./extractors/zip-extractor');
      return new ZipExtractor();
    case 'lha':
      const { LhaExtractor } = await import('./extractors/lha-extractor');
      return new LhaExtractor();
    case 'lzh':
      const { LzhExtractor } = await import('./extractors/lzh-extractor');
      return new LzhExtractor();
    case 'tar':
    case 'tar.gz':
      const { TarExtractor } = await import('./extractors/tar-extractor');
      return new TarExtractor();
    case 'lzx':
      const { LzxExtractor } = await import('./extractors/lzx-extractor');
      return new LzxExtractor();
    case 'dms':
      const { DmsExtractor } = await import('./extractors/dms-extractor');
      return new DmsExtractor();
    case 'arc':
      const { ArcExtractor } = await import('./extractors/arc-extractor');
      return new ArcExtractor();
    case 'zoo':
      const { ZooExtractor } = await import('./extractors/zoo-extractor');
      return new ZooExtractor();
    default:
      return null;
  }
}

/**
 * Convenience function: Extract FILE_ID.DIZ from any supported archive
 */
export async function extractFileDizFromArchive(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = await getExtractorForFile(filepath);

  if (!extractor) {
console.error(`[Archive] Unsupported archive format: ${filepath}`);
    return false;
  }

  if ('extractFileDiz' in extractor && typeof extractor.extractFileDiz === 'function') {
    return (extractor as any).extractFileDiz(filepath, outputPath);
  }

console.error(`[Archive] Extractor does not support FILE_ID.DIZ extraction`);
  return false;
}
