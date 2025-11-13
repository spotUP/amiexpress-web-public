/**
 * Release Archive Packer
 *
 * Automatically creates BBS-ready release archives with:
 * - ZIP compression
 * - FILE_ID.DIZ (BBS standard description file)
 * - .NFO file (ASCII art info file)
 * - README.TXT
 * - All game assets
 *
 * @example
 * ```bash
 * # Pack a door for release
 * npm run pack my-game
 *
 * # Creates: releases/my-game-v1.0.0.zip
 * # - my-game.js
 * # - FILE_ID.DIZ
 * # - my-game.NFO
 * # - README.TXT
 * # - assets/*
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

interface PackConfig {
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  sourceDir: string;
  outputDir: string;
  format?: 'zip' | 'lha'; // Archive format
}

export class ReleasePacker {
  private config: PackConfig;

  constructor(config: PackConfig) {
    this.config = config;
  }

  /**
   * Create release archive
   */
  public async pack(): Promise<string> {
    const format = this.config.format || 'lha'; // Default to LHA for BBS compatibility
    const outputFile = path.join(
      this.config.outputDir,
      `${this.config.name}-v${this.config.version}.${format}`
    );

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    if (format === 'zip') {
      return this.packZip(outputFile);
    } else if (format === 'lha') {
      return this.packLha(outputFile);
    } else {
      throw new Error(`Unsupported archive format: ${format}`);
    }
  }

  /**
   * Create ZIP archive
   */
  private async packZip(outputFile: string): Promise<string> {
    const zip = new AdmZip();

    // Create temp directory for assembly
    const tempDir = path.join(this.config.outputDir, '.temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Generate all files in temp directory
      await this.generateFiles(tempDir);

      // Add all files from temp directory to ZIP
      zip.addLocalFolder(tempDir);

      // Write ZIP file
      zip.writeZip(outputFile);

      const stats = fs.statSync(outputFile);
      console.log(`[OK] Release created: ${outputFile}`);
      console.log(`[OK] Size: ${stats.size} bytes`);

      return outputFile;
    } finally {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Create LHA archive
   */
  private async packLha(outputFile: string): Promise<string> {
    const lhaBinary = path.join(process.cwd(), '..', 'web', 'backend', 'tools', 'bin', 'lha');

    // Check if lha is available (try multiple paths)
    const lhaPaths = [
      lhaBinary,
      path.join(process.cwd(), 'tools', 'bin', 'lha'),
      path.join(process.cwd(), '../../tools/bin/lha'),
    ];

    let lhaPath: string | null = null;
    for (const p of lhaPaths) {
      if (fs.existsSync(p)) {
        lhaPath = p;
        break;
      }
    }

    if (!lhaPath) {
      throw new Error(
        'LHA binary not found. Please compile it:\n' +
        '  cd web/backend && mkdir -p tools/bin && cd tools/bin && \n' +
        '  wget https://github.com/jca02266/lha/archive/refs/tags/release-20211125.tar.gz && \n' +
        '  tar -xzf release-20211125.tar.gz && cd lha-release-20211125 && \n' +
        '  autoreconf -i && ./configure --prefix=$PWD/../../ && make && make install'
      );
    }

    // Create temp directory for assembly
    const tempDir = path.join(this.config.outputDir, '.temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Generate all files in temp directory
      await this.generateFiles(tempDir);

      // Create LHA archive using lha command
      await new Promise<void>((resolve, reject) => {
        // lha a -o5 output.lha *
        // Run from temp directory so * expands to temp files
        const absoluteOutputFile = path.isAbsolute(outputFile) ? outputFile : path.resolve(outputFile);
        const args = ['a', '-o5', absoluteOutputFile, '*'];

        const lha = spawn(lhaPath!, args, {
          cwd: tempDir, // Run from temp directory
          shell: true, // Use shell to expand wildcards
          stdio: ['ignore', 'pipe', 'pipe'],
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

      const stats = fs.statSync(outputFile);
      console.log(`[OK] Release created: ${outputFile}`);
      console.log(`[OK] Size: ${stats.size} bytes`);

      return outputFile;
    } finally {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Generate all files (FILE_ID.DIZ, NFO, README, source files)
   */
  private async generateFiles(outputDir: string): Promise<void> {
    // Add source files
    this.copySourceFiles(outputDir);

    // Generate FILE_ID.DIZ
    this.writeFileIdDiz(outputDir);

    // Generate NFO file
    this.writeNfoFile(outputDir);

    // Generate README
    this.writeReadme(outputDir);
  }

  /**
   * Copy source files to output directory
   */
  private copySourceFiles(outputDir: string): void {
    const sourceDir = this.config.sourceDir;

    // Copy main file
    if (fs.existsSync(path.join(sourceDir, 'index.js'))) {
      fs.copyFileSync(
        path.join(sourceDir, 'index.js'),
        path.join(outputDir, `${this.config.name}.js`)
      );
    }

    // Copy assets directory
    const assetsDir = path.join(sourceDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      const targetAssetsDir = path.join(outputDir, 'assets');
      if (!fs.existsSync(targetAssetsDir)) {
        fs.mkdirSync(targetAssetsDir, { recursive: true });
      }
      this.copyDirectoryRecursive(assetsDir, targetAssetsDir);
    }

    // Copy config file if exists
    if (fs.existsSync(path.join(sourceDir, 'config.json'))) {
      fs.copyFileSync(
        path.join(sourceDir, 'config.json'),
        path.join(outputDir, 'config.json')
      );
    }
  }

  /**
   * Copy directory recursively
   */
  private copyDirectoryRecursive(src: string, dest: string): void {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Generate and write FILE_ID.DIZ
   *
   * FILE_ID.DIZ is a BBS standard file description
   * Max 10 lines, 45 characters wide
   */
  private writeFileIdDiz(outputDir: string): void {
    const lines: string[] = [];

    // Title line (centered)
    const title = `${this.config.name} v${this.config.version}`;
    lines.push(this.centerText(title, 45));

    // Separator
    lines.push(this.centerText('─'.repeat(title.length), 45));

    // Description (word-wrapped to 45 chars)
    const descLines = this.wordWrap(this.config.description, 45);
    lines.push(...descLines);

    lines.push(''); // Empty line

    // Author
    lines.push(`By: ${this.config.author}`);

    // Category
    lines.push(`Category: ${this.config.category}`);

    // Release date
    const date = new Date().toISOString().split('T')[0];
    lines.push(`Released: ${date}`);

    const content = lines.join('\r\n');
    fs.writeFileSync(path.join(outputDir, 'FILE_ID.DIZ'), content);
  }

  /**
   * Generate and write NFO file (ASCII art)
   */
  private writeNfoFile(outputDir: string): void {
    const nfo = `
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║   ██████╗  ██████╗  ██████╗     ██████╗  ██████╗  ██████╗  ██████╗       ║
║   ██╔══██╗ ██╔══██╗ ██╔════╝     ██╔══██╗ ██╔═══██╗██╔═══██╗██╔══██╗      ║
║   ██████╔╝ ██████╔╝ ██████╗      ██║  ██║██║   ██║██║   ██║██████╔╝      ║
║   ██╔══██╗ ██╔══██╗ ╚════██╗     ██║  ██║██║   ██║██║   ██║██╔══██╗      ║
║   ██████╔╝ ██████╔╝ ██████║      ██████╔╝╚██████╔╝╚██████╔╝██║  ██║      ║
║   ╚═════╝  ╚═════╝  ╚═════╝      ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝      ║
║                                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Door Name: ${this.padRight(this.config.name, 61)}║
║  Version:   ${this.padRight(this.config.version, 61)}║
║  Author:    ${this.padRight(this.config.author, 61)}║
║  Category:  ${this.padRight(this.config.category, 61)}║
║                                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║                          DESCRIPTION                                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
${this.formatDescriptionForNfo(this.config.description)}
║                                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║                         INSTALLATION                                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  1. Extract all files to your BBS doors directory                         ║
║  2. Run: node ${this.padRight(this.config.name + '.js', 54)}║
║  3. Connect via telnet/SSH and enjoy!                                     ║
║                                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Made with AmiExpress BBS Door SDK                                        ║
║  https://github.com/amiexpress/sdk                                        ║
║                                                                            ║
║  ${this.padRight('Released: ' + new Date().toISOString().split('T')[0], 74)}║
╚════════════════════════════════════════════════════════════════════════════╝
`.trim();

    fs.writeFileSync(path.join(outputDir, `${this.config.name}.NFO`), nfo);
  }

  /**
   * Generate and write README.TXT
   */
  private writeReadme(outputDir: string): void {
    const readme = `
${this.config.name} v${this.config.version}
${'='.repeat(this.config.name.length + this.config.version.length + 3)}

${this.config.description}

INSTALLATION
------------

1. Extract all files to your BBS doors directory
2. Install Node.js 18+ if not already installed
3. Run: npm install (in the door directory)
4. Start the door: node ${this.config.name}.js
5. Connect via telnet/SSH to your BBS
6. Access the door from the main menu

REQUIREMENTS
------------

- Node.js 18 or higher
- Modern terminal with ANSI support
- Minimum 80x24 terminal size

CONTROLS
--------

(See in-game instructions)

SUPPORT
-------

For support and updates, visit:
https://github.com/amiexpress/sdk

CREDITS
-------

Author: ${this.config.author}
Made with: AmiExpress BBS Door SDK
Released: ${new Date().toISOString().split('T')[0]}

LICENSE
-------

This door is released under the MIT License.
See LICENSE file for details.

`.trim();

    fs.writeFileSync(path.join(outputDir, 'README.TXT'), readme);
  }

  /**
   * Center text within width
   */
  private centerText(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Pad text to right
   */
  private padRight(text: string, width: number): string {
    return text + ' '.repeat(Math.max(0, width - text.length));
  }

  /**
   * Word wrap text
   */
  private wordWrap(text: string, width: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);

    return lines;
  }

  /**
   * Format description for NFO
   */
  private formatDescriptionForNfo(desc: string): string {
    const lines = this.wordWrap(desc, 72);
    return lines.map((line) => `║  ${this.padRight(line, 74)}║`).join('\r\n');
  }
}

/**
 * CLI entry point
 */
export async function main(doorName: string): Promise<void> {
  // Load door package.json
  const doorPath = path.join(process.cwd(), 'examples', doorName);
  const packagePath = path.join(doorPath, 'package.json');

  if (!fs.existsSync(packagePath)) {
    console.error(`❌ Error: Could not find ${doorName} in examples/`);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const packer = new ReleasePacker({
    name: pkg.name || doorName,
    version: pkg.version || '1.0.0',
    author: pkg.author || 'Unknown',
    description: pkg.description || 'A BBS door game',
    category: pkg.category || 'Game',
    sourceDir: doorPath,
    outputDir: path.join(process.cwd(), 'releases'),
  });

  console.log(`📦 Packing ${doorName}...`);
  const outputFile = await packer.pack();
  console.log(`\n✨ Success! Release ready: ${outputFile}`);
}

// Run if called directly
if (require.main === module) {
  const doorName = process.argv[2];
  if (!doorName) {
    console.error('Usage: npm run pack <door-name>');
    process.exit(1);
  }
  main(doorName).catch(console.error);
}

export default ReleasePacker;
