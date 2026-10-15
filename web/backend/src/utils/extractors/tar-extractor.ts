/**
 * TAR/GZ Archive Extractor
 * Uses pako (gzip) + tar-stream
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as pako from 'pako';
import * as tar from 'tar-stream';
import { Readable } from 'stream';
import { BaseArchiveExtractor, ArchiveEntry } from '../archive-extractor';

export class TarExtractor extends BaseArchiveExtractor {
  constructor() {
    super('TAR');
  }

  private async readData(filepath: string): Promise<Buffer> {
    let data = await fs.readFile(filepath);

    // Auto-detect gzip
    const ext = path.extname(filepath).toLowerCase();
    const basename = path.basename(filepath).toLowerCase();
    const isGzipped =
      ext === '.gz' || ext === '.tgz' || basename.endsWith('.tar.gz') || basename.endsWith('.tar.z');

    if (isGzipped) {
      this.log('Decompressing gzip...');
      data = Buffer.from(pako.inflate(data));
    }

    return data;
  }

  async getEntries(filepath: string): Promise<ArchiveEntry[]> {
    const data = await this.readData(filepath);

    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      const entries: ArchiveEntry[] = [];

      extract.on('entry', (header: any, stream: any, next: any) => {
        entries.push({
          name: header.name,
          size: header.size,
        });
        stream.resume(); // Skip data
        stream.on('end', () => next());
      });

      extract.on('finish', () => resolve(entries));
      extract.on('error', (err: Error) => reject(err));

      const readable = Readable.from(data);
      readable.pipe(extract);
    });
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
      const data = await this.readData(filepath);

      return new Promise((resolve, reject) => {
        const extract = tar.extract();
        let found = false;
        const lowerFilename = filename.toLowerCase();

        extract.on('entry', (header: any, stream: any, next: any) => {
          if (header.name.toLowerCase() === lowerFilename) {
            this.log(`Found: ${header.name} (${header.size} bytes)`);
            found = true;

            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
              extract.destroy(); // Stop processing
              resolve(Buffer.concat(chunks));
            });
          } else {
            stream.resume(); // Skip
          }

          stream.on('end', () => next());
        });

        extract.on('finish', () => {
          if (!found) {
            this.log(`File not found: ${filename}`);
            resolve(null);
          }
        });

        extract.on('error', (err: Error) => reject(err));

        const readable = Readable.from(data);
        readable.pipe(extract);
      });
    } catch (error: any) {
      this.logError(`Error extracting file: ${error.message}`);
      return null;
    }
  }
}

// Legacy exports for backward compatibility
export async function extractFileDizFromTar(
  filepath: string,
  outputPath: string,
  isGzipped: boolean = false
): Promise<boolean> {
  const extractor = new TarExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}

export async function listTarFiles(filepath: string, isGzipped: boolean = false): Promise<string[]> {
  const extractor = new TarExtractor();
  return extractor.listFiles(filepath);
}

export async function extractFileDizFromTarAuto(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  const extractor = new TarExtractor();
  return extractor.extractFileDiz(filepath, outputPath);
}
