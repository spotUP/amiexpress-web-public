/**
 * LHA Archive Creator Utility
 *
 * Creates LHA archives using the lha command-line tool.
 * LHA format is the standard Amiga BBS archive format.
 *
 * Usage:
 * ```typescript
 * import { createLhaArchive } from './utils/lha-archiver.util';
 *
 * await createLhaArchive('/path/to/output.lha', '/path/to/source/dir');
 * ```
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { SysopDebugUtil, DebugSeverity } from './sysop-debug.util';

/**
 * Path to lha binary (compiled from source)
 */
const LHA_BINARY = path.join(process.cwd(), 'tools', 'bin', 'lha');

/**
 * Check if lha binary is available
 */
export async function isLhaAvailable(): Promise<boolean> {
  try {
    await fs.access(LHA_BINARY, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create LHA archive from a directory
 *
 * @param archivePath Output archive path (e.g., '/path/to/output.lha')
 * @param sourceDir Source directory to compress
 * @param options Archive options
 * @returns Promise that resolves when archive is created
 */
export async function createLhaArchive(
  archivePath: string,
  sourceDir: string,
  options: {
    compressionMethod?: 'lh5' | 'lh6' | 'lh7'; // lh5 is standard, lh7 is best
    recursive?: boolean;
    verbose?: boolean;
  } = {}
): Promise<void> {
  const { compressionMethod = 'lh5', recursive = true, verbose = false } = options;

  // Check if lha is available
  const available = await isLhaAvailable();
  if (!available) {
    throw new Error(`LHA binary not found at ${LHA_BINARY}. Run 'npm run install-lha' to install it.`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(archivePath);
  await fs.mkdir(outputDir, { recursive: true });

  // Build lha command
  // lha a <archive> <files...>
  // Note: Must run from source directory for proper paths
  const args: string[] = [];

  // Command: 'a' for add
  args.push('a');

  // Options
  if (verbose) args.push('-v'); // verbose
  args.push(`-o${compressionMethod.slice(-1)}`); // -o5, -o6, or -o7 for compression level

  // Archive path (must be absolute since we're changing directory)
  const absoluteArchivePath = path.isAbsolute(archivePath) ? archivePath : path.resolve(archivePath);
  args.push(absoluteArchivePath);

  // Add all files in directory (use * as shell will expand it)
  args.push('*');

  if (verbose) {
    console.log(`[LHA] Creating archive: ${path.basename(archivePath)}`);
    console.log(`[LHA] Working directory: ${sourceDir}`);
    console.log(`[LHA] Command: ${LHA_BINARY} ${args.join(' ')}`);
  }

  return new Promise((resolve, reject) => {
    const lha = spawn(LHA_BINARY, args, {
      cwd: sourceDir, // Run from source directory so * expands correctly
      shell: true, // Use shell to expand wildcards
      stdio: verbose ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    lha.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (verbose) {
        process.stdout.write(data);
      }
    });

    lha.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (verbose) {
        process.stderr.write(data);
      }
    });

    lha.on('error', (error: Error) => {
      reject(new Error(`LHA process error: ${error.message}`));
    });

    lha.on('close', async (code: number) => {
      if (code === 0) {
        // Verify archive was created
        try {
          const stats = await fs.stat(archivePath);
          if (verbose) {
            console.log(`[LHA] Archive created successfully: ${stats.size} bytes`);
          }
          resolve();
        } catch (error: any) {
          const errorMsg = `Archive created but not found: ${error.message}`;
          SysopDebugUtil.debug(
            null,
            null,
            'LHA Archiver',
            `Failed to verify LHA archive "${path.basename(archivePath)}" after creation`,
            {
              error: error.message,
              archivePath: path.basename(archivePath)
            },
            DebugSeverity.CRITICAL
          );
          reject(new Error(errorMsg));
        }
      } else {
        reject(new Error(`LHA failed with exit code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
      }
    });
  });
}

/**
 * Create LHA archive from multiple files
 *
 * @param archivePath Output archive path
 * @param files Array of file paths to add
 * @param options Archive options
 */
export async function createLhaArchiveFromFiles(
  archivePath: string,
  files: string[],
  options: {
    compressionMethod?: 'lh5' | 'lh6' | 'lh7';
    verbose?: boolean;
  } = {}
): Promise<void> {
  const { compressionMethod = 'lh5', verbose = false } = options;

  // Check if lha is available
  const available = await isLhaAvailable();
  if (!available) {
    throw new Error(`LHA binary not found at ${LHA_BINARY}`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(archivePath);
  await fs.mkdir(outputDir, { recursive: true });

  // Build lha command
  const args: string[] = [];
  args.push('a'); // add command
  args.push(`-lh${compressionMethod.slice(-1)}`);
  args.push(archivePath);
  args.push(...files);

  if (verbose) {
    console.log(`[LHA] Creating archive with ${files.length} files`);
  }

  return new Promise((resolve, reject) => {
    const lha = spawn(LHA_BINARY, args, {
      stdio: verbose ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    lha.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    lha.on('error', (error: Error) => {
      reject(new Error(`LHA process error: ${error.message}`));
    });

    lha.on('close', (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`LHA failed with exit code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Add files to existing LHA archive
 *
 * @param archivePath Existing archive path
 * @param files Files to add
 * @param options Options
 */
export async function addToLhaArchive(
  archivePath: string,
  files: string[],
  options: {
    compressionMethod?: 'lh5' | 'lh6' | 'lh7';
    verbose?: boolean;
  } = {}
): Promise<void> {
  // Same as createLhaArchiveFromFiles - lha automatically appends if archive exists
  return createLhaArchiveFromFiles(archivePath, files, options);
}

/**
 * Get LHA binary version
 */
export async function getLhaVersion(): Promise<string> {
  const available = await isLhaAvailable();
  if (!available) {
    throw new Error('LHA binary not available');
  }

  return new Promise((resolve, reject) => {
    const lha = spawn(LHA_BINARY, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    lha.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    lha.on('error', (error: Error) => {
      reject(error);
    });

    lha.on('close', () => {
      // Extract version from first line
      const match = output.match(/LHa.*version\s+([^\s\n]+)/i);
      resolve(match ? match[1] : output.trim().split('\n')[0]);
    });
  });
}
