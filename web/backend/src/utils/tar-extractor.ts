/**
 * TAR/GZ Archive Extractor
 * Wrapper around pako (gzip) + tar-stream for FILE_ID.DIZ extraction
 *
 * Libraries:
 * - pako: Pure JavaScript zlib port
 * - tar-stream: TAR parsing and extraction
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as pako from 'pako';
import * as tar from 'tar-stream';
import { Readable } from 'stream';

/**
 * Extract FILE_ID.DIZ from TAR or TAR.GZ archive
 */
export async function extractFileDizFromTar(
  filepath: string,
  outputPath: string,
  isGzipped: boolean = false
): Promise<boolean> {
  try {
    console.log(`[TAR] Extracting FILE_ID.DIZ from ${path.basename(filepath)}`);

    // Read the file
    let data = await fs.readFile(filepath);

    // Decompress if gzipped
    if (isGzipped) {
      console.log(`[TAR] Decompressing gzip...`);
      data = Buffer.from(pako.inflate(data));
    }

    // Parse TAR
    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      let found = false;

      extract.on('entry', (header: any, stream: any, next: any) => {
        const filename = header.name.toLowerCase();

        if (filename === 'file_id.diz' || filename.endsWith('/file_id.diz')) {
          console.log(`[TAR] Found: ${header.name} (${header.size} bytes)`);
          found = true;

          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            await fs.writeFile(outputPath, buffer);
            console.log(`[TAR] ✓ Extracted FILE_ID.DIZ to ${outputPath}`);
            extract.destroy(); // Stop processing
            resolve(true);
          });
        } else {
          stream.resume(); // Skip this file
        }

        stream.on('end', () => next());
      });

      extract.on('finish', () => {
        if (!found) {
          console.log(`[TAR] FILE_ID.DIZ not found in archive`);
          resolve(false);
        }
      });

      extract.on('error', (err: Error) => {
        console.error(`[TAR] Error: ${err.message}`);
        reject(err);
      });

      // Feed data to extractor
      const readable = Readable.from(data);
      readable.pipe(extract);
    });
  } catch (error: any) {
    console.error(`[TAR] Error: ${error.message}`);
    return false;
  }
}

/**
 * List all files in TAR or TAR.GZ archive
 */
export async function listTarFiles(
  filepath: string,
  isGzipped: boolean = false
): Promise<string[]> {
  try {
    let data = await fs.readFile(filepath);

    if (isGzipped) {
      data = Buffer.from(pako.inflate(data));
    }

    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      const files: string[] = [];

      extract.on('entry', (header: any, stream: any, next: any) => {
        files.push(header.name);
        stream.resume();
        stream.on('end', () => next());
      });

      extract.on('finish', () => resolve(files));
      extract.on('error', (err: Error) => reject(err));

      const readable = Readable.from(data);
      readable.pipe(extract);
    });
  } catch (error: any) {
    console.error(`[TAR] Error listing files: ${error.message}`);
    return [];
  }
}

/**
 * Auto-detect if file is gzipped and extract FILE_ID.DIZ
 */
export async function extractFileDizFromTarAuto(
  filepath: string,
  outputPath: string
): Promise<boolean> {
  // Check file extension
  const ext = path.extname(filepath).toLowerCase();
  const isGzipped = ext === '.gz' || ext === '.tgz';

  return extractFileDizFromTar(filepath, outputPath, isGzipped);
}
