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
import * as archiver from 'archiver';

interface PackConfig {
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  sourceDir: string;
  outputDir: string;
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
    const outputFile = path.join(
      this.config.outputDir,
      `${this.config.name}-v${this.config.version}.zip`
    );

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Create ZIP archive
    const output = fs.createWriteStream(outputFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`✅ Release created: ${outputFile}`);
        console.log(`📦 Size: ${archive.pointer()} bytes`);
        resolve(outputFile);
      });

      archive.on('error', (err: Error) => reject(err));
      archive.pipe(output);

      // Add source files
      this.addSourceFiles(archive);

      // Add FILE_ID.DIZ
      this.addFileIdDiz(archive);

      // Add NFO file
      this.addNfoFile(archive);

      // Add README
      this.addReadme(archive);

      // Finalize archive
      archive.finalize();
    });
  }

  /**
   * Add source files to archive
   */
  private addSourceFiles(archive: archiver.Archiver): void {
    const sourceDir = this.config.sourceDir;

    // Add main file
    if (fs.existsSync(path.join(sourceDir, 'index.js'))) {
      archive.file(path.join(sourceDir, 'index.js'), {
        name: `${this.config.name}.js`,
      });
    }

    // Add assets directory
    const assetsDir = path.join(sourceDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      archive.directory(assetsDir, 'assets');
    }

    // Add config file if exists
    if (fs.existsSync(path.join(sourceDir, 'config.json'))) {
      archive.file(path.join(sourceDir, 'config.json'), { name: 'config.json' });
    }
  }

  /**
   * Generate and add FILE_ID.DIZ
   *
   * FILE_ID.DIZ is a BBS standard file description
   * Max 10 lines, 45 characters wide
   */
  private addFileIdDiz(archive: archiver.Archiver): void {
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
    archive.append(content, { name: 'FILE_ID.DIZ' });
  }

  /**
   * Generate and add NFO file (ASCII art)
   */
  private addNfoFile(archive: archiver.Archiver): void {
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

    archive.append(nfo, { name: `${this.config.name}.NFO` });
  }

  /**
   * Generate and add README.TXT
   */
  private addReadme(archive: archiver.Archiver): void {
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

    archive.append(readme, { name: 'README.TXT' });
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
