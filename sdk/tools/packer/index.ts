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
import { spawn, execSync } from 'child_process';

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
    const format = this.config.format || 'zip'; // Default to ZIP for TypeScript doors
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
    const packagePath = path.join(sourceDir, 'package.json');
    const packageJson = fs.existsSync(packagePath)
      ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
      : null;

    const infoPath = this.resolveInfoPath(sourceDir, packageJson);
    const infoData = infoPath ? this.parseInfoTooltypes(infoPath) : {};
    const location = infoData.LOCATION || infoData.PATH;

    const doorDir = this.extractDoorDir(location) || path.basename(sourceDir);
    if (!doorDir) {
      throw new Error('Unable to determine door directory');
    }

    const commandFromInfo = infoPath ? path.basename(infoPath, '.info') : '';
    const commandFromPkg = packageJson?.bbsCommand || packageJson?.doorMetadata?.command || doorDir;
    const commandName = (commandFromInfo || commandFromPkg || '')
      .toString()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (!commandName) {
      throw new Error('Unable to determine BBS command name for .info');
    }

    const doorsRoot = path.join(outputDir, 'Doors', doorDir);
    const commandsRoot = path.join(outputDir, 'Commands', 'BBSCmd');
    fs.mkdirSync(doorsRoot, { recursive: true });
    fs.mkdirSync(commandsRoot, { recursive: true });

    // Copy .info file to Commands/BBSCmd
    if (infoPath) {
      fs.copyFileSync(infoPath, path.join(commandsRoot, `${commandName}.info`));
    } else {
      const infoContent = this.buildInfoContent({
        command: commandName,
        doorDir,
        packageJson,
      });
      fs.writeFileSync(path.join(commandsRoot, `${commandName}.info`), infoContent);
    }

    // Resolve door source directory (supports running from Doors/<door> or repo root)
    const candidateDoorDirs = [
      path.join(sourceDir, 'Doors', doorDir),
      path.join(sourceDir, '..', 'Doors', doorDir),
      sourceDir,
    ];
    const doorSourceDir = candidateDoorDirs.find((candidate) => {
      return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    });

    if (!doorSourceDir) {
      throw new Error(`Door directory not found for ${doorDir}`);
    }

    const allowList = ['dist', 'assets', 'data', 'config.json'];

    for (const entry of allowList) {
      const srcPath = path.join(doorSourceDir, entry);
      if (!fs.existsSync(srcPath)) continue;
      const destPath = path.join(doorsRoot, entry);
      if (fs.statSync(srcPath).isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }

    if (packageJson) {
      const normalizedPackageJson = this.normalizePackageJsonForRelease(packageJson);
      fs.writeFileSync(
        path.join(doorsRoot, 'package.json'),
        JSON.stringify(normalizedPackageJson, null, 2)
      );
    }

    const lockPath = path.join(doorSourceDir, 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      try {
        const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const normalizedLock = this.normalizePackageLockForRelease(lockJson);
        fs.writeFileSync(
          path.join(doorsRoot, 'package-lock.json'),
          JSON.stringify(normalizedLock, null, 2)
        );
      } catch {
        // Skip malformed lock files
      }
    }

    this.copyScriptFiles(doorSourceDir, doorsRoot);
  }

  private resolveInfoPath(sourceDir: string, packageJson?: any): string | null {
    const command = (packageJson?.bbsCommand || packageJson?.doorMetadata?.command || '')
      .toString()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const candidates = [
      path.join(sourceDir, 'Commands', 'BBSCmd'),
      path.join(sourceDir, '..', 'Commands', 'BBSCmd'),
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      if (command) {
        const direct = path.join(candidate, `${command}.info`);
        if (fs.existsSync(direct)) {
          return direct;
        }
      }
      const files = fs.readdirSync(candidate).filter((file) => file.toLowerCase().endsWith('.info'));
      if (files.length > 0) {
        return path.join(candidate, files[0]);
      }
    }
    return null;
  }

  private parseInfoTooltypes(infoPath: string): Record<string, string> {
    const tooltypes: Record<string, string> = {};

    const output = execSync(`strings "${infoPath}"`, { encoding: 'utf8' });
    output.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim().toUpperCase();
      const value = trimmed.slice(idx + 1).trim();
      tooltypes[key] = value;
    });

    return tooltypes;
  }

  private buildInfoContent(params: {
    command: string;
    doorDir: string;
    packageJson?: any;
  }): string {
    const pkg = params.packageJson || {};
    const doorType = pkg.doorType || 'TS';
    const access = pkg.accessLevel ?? pkg.doorMetadata?.minSecLevel ?? 0;
    const name = pkg.doorMetadata?.name || pkg.displayName || pkg.name || params.doorDir;
    const description = pkg.description || pkg.doorMetadata?.description || '';

    const lines = [
      `BBSCMD=${params.command}`,
      `TYPE=${doorType}`,
      `LOCATION=Doors/${params.doorDir}`,
      name ? `NAME=${name}` : '',
      description ? `DESCRIPTION=${description}` : '',
      `ACCESS=${access}`,
      'MULTINODE=YES',
      'PRIORITY=SAME',
      '',
    ];

    return lines.filter(Boolean).join('\n');
  }

  private normalizePackageJsonForRelease(packageJson: any): any {
    const normalized = { ...packageJson };
    const dependencies = { ...(packageJson.dependencies || {}) };
    dependencies['@amiexpress/bbs-door-sdk'] = 'file:../../sdk';
    normalized.dependencies = dependencies;
    return normalized;
  }

  private normalizePackageLockForRelease(lockJson: any): any {
    if (!lockJson || typeof lockJson !== 'object') {
      return lockJson;
    }

    const sdkSpec = 'file:../../sdk';

    if (lockJson.packages && lockJson.packages['']) {
      lockJson.packages[''].dependencies = {
        ...(lockJson.packages[''].dependencies || {}),
        '@amiexpress/bbs-door-sdk': sdkSpec,
      };
    }

    if (lockJson.dependencies && lockJson.dependencies['@amiexpress/bbs-door-sdk']) {
      lockJson.dependencies['@amiexpress/bbs-door-sdk'] = {
        ...lockJson.dependencies['@amiexpress/bbs-door-sdk'],
        version: sdkSpec,
        resolved: sdkSpec,
        link: true,
      };
    }

    if (lockJson.packages && lockJson.packages['node_modules/@amiexpress/bbs-door-sdk']) {
      lockJson.packages['node_modules/@amiexpress/bbs-door-sdk'] = {
        ...lockJson.packages['node_modules/@amiexpress/bbs-door-sdk'],
        version: sdkSpec,
        resolved: sdkSpec,
        link: true,
      };
    }

    return lockJson;
  }

  private extractDoorDir(location?: string): string | null {
    if (!location) return null;
    let value = location.trim();
    if (!value) return null;
    value = value.replace(/^doors:/i, 'Doors/');
    value = value.replace(/^doors[\\/]/i, 'Doors/');
    const parts = value.split(/[\\/]/);
    if (parts.length < 2) return null;
    if (parts[0].toLowerCase() !== 'doors') return null;
    return parts[1];
  }

  private copyScriptFiles(sourceDir: string, outputDir: string): void {
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }

      const srcPath = path.join(sourceDir, entry.name);
      const destPath = path.join(outputDir, entry.name);

      if (entry.isDirectory()) {
        this.copyScriptFiles(srcPath, destPath);
        continue;
      }

      if (!/\.(ts|js|d\.ts|map)$/i.test(entry.name)) {
        continue;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
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
   * Uses template from sdk/templates/FILE_ID.DIZ if available
   */
  private writeFileIdDiz(outputDir: string): void {
    const title = `${this.config.name} v${this.config.version}`;

    // Center title within 40 chars (width of placeholder)
    const centerTitle = (text: string, width: number = 40): string => {
      const totalPadding = width - text.length;
      const leftPad = Math.max(0, Math.ceil(totalPadding / 2));
      const rightPad = Math.max(0, totalPadding - leftPad);
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    };

    // Try to load template from sdk/templates/FILE_ID.DIZ
    const templatePaths = [
      path.join(process.cwd(), 'templates', 'FILE_ID.DIZ'),
      path.join(process.cwd(), '..', 'templates', 'FILE_ID.DIZ'),
      path.join(__dirname, '..', '..', 'templates', 'FILE_ID.DIZ'),
    ];

    let content: string | null = null;

    for (const templatePath of templatePaths) {
      if (fs.existsSync(templatePath)) {
        // Load template and replace placeholder with centered title
        content = fs.readFileSync(templatePath, 'utf8');
        const centeredTitle = centerTitle(title, 40);
        content = content.replace(/\*{40}/, centeredTitle);
        break;
      }
    }

    // Fallback to simple template if no template file found
    if (!content) {
      const lines: string[] = [];

      // Title line (centered)
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

      content = lines.join('\r\n');
    }

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
║  1. Extract the archive to your BBS root                                  ║
║  2. Verify Commands/BBSCmd contains the .info entry                       ║
║  3. Restart the BBS (or reload doors)                                     ║
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

1. Extract the archive to your BBS root directory
2. Confirm the .info file is under Commands/BBSCmd/
3. Restart the BBS (or reload doors)
4. Access the door from the main menu

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
    console.error(`[ERROR] Could not find ${doorName} in examples/`);
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

  console.log(`[PACK] Packing ${doorName}...`);
  const outputFile = await packer.pack();
  console.log(`\n[OK] Success! Release ready: ${outputFile}`);
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
