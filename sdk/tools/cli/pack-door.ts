/**
 * Pack Door Command
 *
 * Create BBS-ready release archives.
 */

import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { ReleasePacker } from '../packer';

interface PackOptions {
  output: string;
  version?: string;
}

/**
 * Pack door into BBS-ready release archive
 */
export async function packDoor(
  doorName?: string,
  options?: Partial<PackOptions>
): Promise<void> {
  const opts: PackOptions = {
    output: options?.output || './releases',
    version: options?.version
  };

  // Determine door path
  const doorPath = doorName || '.';
  const absolutePath = path.resolve(doorPath);

  // Check if path exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Door path not found: ${doorPath}`);
  }

  // Load package.json
  const packagePath = path.join(absolutePath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`No package.json found in ${doorPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const spinner = ora('Creating release archive...').start();

  try {
    // Create packer
    const packer = new ReleasePacker({
      name: pkg.name || path.basename(absolutePath),
      version: opts.version || pkg.version || '1.0.0',
      author: pkg.author || 'Unknown',
      description: pkg.description || 'A BBS door',
      category: pkg.category || 'Game',
      sourceDir: absolutePath,
      outputDir: opts.output
    });

    // Pack
    const outputFile = await packer.pack();

    spinner.succeed(chalk.green('Release created successfully!'));

    console.log('');
    console.log(chalk.bold('[PACK] Release Archive:'));
    console.log(chalk.gray('  File: ') + chalk.cyan(outputFile));
    console.log(chalk.gray('  Size: ') + chalk.white(getFileSize(outputFile)));
    console.log('');
    console.log(chalk.bold('[PACK] Contents:'));
    console.log(chalk.gray('  * Main executable'));
    console.log(chalk.gray('  * FILE_ID.DIZ (BBS description)'));
    console.log(chalk.gray('  * .NFO file (ASCII art info)'));
    console.log(chalk.gray('  * README.TXT'));
    console.log(chalk.gray('  * Assets and configuration'));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to create release'));
    throw error;
  }
}

/**
 * Get human-readable file size
 */
function getFileSize(filePath: string): string {
  const stats = fs.statSync(filePath);
  const bytes = stats.size;

  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
