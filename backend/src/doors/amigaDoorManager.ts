/**
 * Amiga Door Manager - 1:1 Compatible with AmiExpress BBS
 *
 * This module implements door management exactly as the Amiga version does:
 * - Scans Commands/BBSCmd/*.info for door definitions
 * - Resolves AmigaDOS assigns (Doors:, BBS:, etc.)
 * - Installs doors to proper BBS directory structure
 * - Parses .info files for door metadata
 *
 * Reference: Example_BBS/ directory structure
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * AmigaDOS Assign Definitions
 * Maps logical assigns to physical paths
 */
export interface AmigaDOSAssigns {
  'BBS:': string;       // BBS data root
  'Doors:': string;     // Door programs
  'Screens:': string;   // Display screens
  'Storage:': string;   // Icon storage
  'NODE0:': string;     // Node 0 data
  'NODE1:': string;     // Node 1 data
  'NODE2:': string;     // Node 2 data
  'NODE3:': string;     // Node 3 data
  'Protocols:': string; // Transfer protocols
  'Utils:': string;     // Utility programs
  'Libs:': string;      // Amiga libraries (.library files)
}

/**
 * Door Command Info File Structure
 * Parsed from *.info files in Commands/BBSCmd/
 */
export interface DoorInfo {
  command: string;           // Command name (from filename)
  location: string;          // LOCATION= field (with assigns)
  resolvedPath: string;      // Resolved physical path
  access: number;            // ACCESS= required level
  type: string;              // TYPE= (XIM, AIM, REXX, etc.)
  stack?: number;            // STACK= size
  priority?: string;         // PRIORITY= setting
  multinode?: boolean;       // MULTINODE= YES/NO
  name?: string;             // NAME= field (optional)
  description?: string;      // Description from archive
  installed: boolean;        // Whether door executable exists
  doorName?: string;         // Extracted door name from path
}

/**
 * Door Archive Structure
 */
export interface DoorArchive {
  filename: string;
  path: string;
  size: number;
  format: 'ZIP' | 'LHA' | 'LZX';
  uploadDate: Date;
  files: string[];
  infoFiles: string[];       // *.info files found
  executables: string[];     // Executable files found
  libraries: string[];       // Amiga library files (.library)
  sourceFiles: string[];     // Source code files (.s, .asm, .c, .e, .rexx)
  isTypeScriptDoor?: boolean; // True if this is a TypeScript door package
  isAREXXDoor?: boolean;     // True if this is an AREXX script door
  hasSourceCode?: boolean;   // True if contains source code
  packageJson?: any;         // Parsed package.json for TypeScript doors
  // Standard AmiExpress door structure detection
  isStandardDoorStructure?: boolean; // True if has Commands/BBSCmd/ + Doors/ structure
  bbsCommands?: string[];    // Command names from Commands/BBSCmd/*.info
  doorsDirectory?: string;   // Path to Doors/ directory in archive
  commandsDirectory?: string; // Path to Commands/BBSCmd/ in archive
  metadata?: {
    fileidDiz?: string;
    readme?: string;
    guide?: string;
    doorName?: string;       // Extracted from Doors/ directory name
  };
}

/**
 * AmigaDoor Manager Class
 */
export class AmigaDoorManager {
  private bbsRoot: string;
  private assigns: AmigaDOSAssigns;

  constructor(bbsRoot: string) {
    this.bbsRoot = bbsRoot;
    this.assigns = this.initializeAssigns();
  }

  /**
   * Initialize AmigaDOS Assigns
   * Maps logical assigns to physical paths within BBS root
   */
  private initializeAssigns(): AmigaDOSAssigns {
    return {
      'BBS:': this.bbsRoot,
      'Doors:': path.join(this.bbsRoot, 'Doors'),
      'Screens:': path.join(this.bbsRoot, 'Screens'),
      'Storage:': path.join(this.bbsRoot, 'Storage'),
      'NODE0:': path.join(this.bbsRoot, 'Node0'),
      'NODE1:': path.join(this.bbsRoot, 'Node1'),
      'NODE2:': path.join(this.bbsRoot, 'Node2'),
      'NODE3:': path.join(this.bbsRoot, 'Node3'),
      'Protocols:': path.join(this.bbsRoot, 'Protocols'),
      'Utils:': path.join(this.bbsRoot, 'Utils'),
      'Libs:': path.join(this.bbsRoot, 'Libs'),
    };
  }

  /**
   * Resolve AmigaDOS path to physical path
   * Example: "Doors:AquaScan/AquaScan.000" → "/path/to/BBS/Doors/AquaScan/AquaScan.000"
   * Case-insensitive to handle both "Doors:" and "DOORS:"
   */
  resolveAssign(amigaPath: string): string {
    const amigaPathLower = amigaPath.toLowerCase();

    for (const [assign, physicalPath] of Object.entries(this.assigns)) {
      const assignLower = assign.toLowerCase();
      if (amigaPathLower.startsWith(assignLower)) {
        const relativePath = amigaPath.substring(assign.length);
        return path.join(physicalPath, relativePath);
      }
    }

    // No assign found, treat as relative to BBS root
    return path.join(this.bbsRoot, amigaPath);
  }

  /**
   * Parse .info file to extract door metadata
   * .info files are binary Amiga icon files with embedded text data
   */
  parseInfoFile(infoPath: string): Partial<DoorInfo> | null {
    try {
      const content = fs.readFileSync(infoPath);
      const text = content.toString('latin1'); // Use latin1 to preserve binary data

      const metadata: Partial<DoorInfo> = {
        command: path.basename(infoPath, '.info'),
      };

      // Extract fields using regex (case-insensitive)
      const locationMatch = text.match(/LOCATION=([^\x00\r\n]+)/i);
      if (locationMatch) {
        metadata.location = locationMatch[1].trim();
        metadata.resolvedPath = this.resolveAssign(metadata.location);
      }

      const accessMatch = text.match(/ACCESS=(\d+)/i);
      if (accessMatch) {
        metadata.access = parseInt(accessMatch[1], 10);
      }

      const typeMatch = text.match(/TYPE=([A-Z]+)/i);
      if (typeMatch) {
        metadata.type = typeMatch[1].trim();
      }

      const stackMatch = text.match(/STACK=(\d+)/i);
      if (stackMatch) {
        metadata.stack = parseInt(stackMatch[1], 10);
      }

      const priorityMatch = text.match(/PRIORITY=([A-Z]+)/i);
      if (priorityMatch) {
        metadata.priority = priorityMatch[1].trim();
      }

      const multinodeMatch = text.match(/MULTINODE=(YES|NO)/i);
      if (multinodeMatch) {
        metadata.multinode = multinodeMatch[1].toUpperCase() === 'YES';
      }

      const nameMatch = text.match(/NAME=([^\x00\r\n]+)/i);
      if (nameMatch) {
        metadata.name = nameMatch[1].trim();
      }

      // Extract door name from location path
      if (metadata.location) {
        const pathParts = metadata.location.split(/[:/\\]/);
        // Find the part after "Doors:" assign
        const doorsIndex = pathParts.findIndex(p => p.toLowerCase() === 'doors');
        if (doorsIndex >= 0 && pathParts.length > doorsIndex + 1) {
          metadata.doorName = pathParts[doorsIndex + 1];
        }
      }

      return metadata;
    } catch (error) {
      console.error(`Error parsing .info file ${infoPath}:`, error);
      return null;
    }
  }

  /**
   * Scan Commands/BBSCmd/ for installed Amiga doors
   * This is the CORRECT way - scan .info files, NOT executables
   */
  async scanInstalledDoors(): Promise<DoorInfo[]> {
    const doors: DoorInfo[] = [];
    const commandsPath = path.join(this.bbsRoot, 'Commands', 'BBSCmd');

    // Ensure directory exists
    if (!fs.existsSync(commandsPath)) {
      console.log(`Commands directory does not exist: ${commandsPath}`);
      return doors;
    }

    // Read all .info files
    const files = fs.readdirSync(commandsPath);
    const infoFiles = files.filter(f => f.toLowerCase().endsWith('.info'));

    console.log(`Found ${infoFiles.length} .info files in ${commandsPath}`);

    for (const infoFile of infoFiles) {
      const infoPath = path.join(commandsPath, infoFile);
      const metadata = this.parseInfoFile(infoPath);

      if (metadata && metadata.location && metadata.resolvedPath) {
        // Check if door executable exists
        const executableExists = fs.existsSync(metadata.resolvedPath);

        doors.push({
          command: metadata.command || path.basename(infoFile, '.info'),
          location: metadata.location,
          resolvedPath: metadata.resolvedPath,
          access: metadata.access || 0,
          type: metadata.type || 'UNKNOWN',
          stack: metadata.stack,
          priority: metadata.priority,
          multinode: metadata.multinode,
          name: metadata.name,
          doorName: metadata.doorName,
          installed: executableExists,
        });

        console.log(`Loaded door: ${metadata.command} → ${metadata.location} (${executableExists ? 'INSTALLED' : 'MISSING'})`);
      }
    }

    return doors;
  }

  /**
   * Scan backend/doors/ for TypeScript door packages
   */
  async scanTypeScriptDoors(): Promise<any[]> {
    const doors: any[] = [];
    const doorsPath = path.join(__dirname, '../../doors');

    if (!fs.existsSync(doorsPath)) {
      return doors;
    }

    const entries = fs.readdirSync(doorsPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const doorPath = path.join(doorsPath, entry.name);
      const packageJsonPath = path.join(doorPath, 'package.json');

      // Check for package.json
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

          // Look for main entry point
          const mainFile = packageJson.main || 'index.ts';
          const mainPath = path.join(doorPath, mainFile);
          const exists = fs.existsSync(mainPath);

          doors.push({
            name: packageJson.name || entry.name,
            displayName: packageJson.displayName || packageJson.name || entry.name,
            description: packageJson.description || '',
            version: packageJson.version || '1.0.0',
            author: packageJson.author || '',
            main: mainFile,
            path: doorPath,
            installed: exists,
            isTypeScriptDoor: true,
            accessLevel: packageJson.accessLevel || 0,
          });

          console.log(`Loaded TypeScript door: ${packageJson.name || entry.name} (${exists ? 'INSTALLED' : 'MISSING'})`);
        } catch (error) {
          console.error(`Error reading package.json for ${entry.name}:`, error);
        }
      } else {
        // Check for loose .ts/.js files
        const tsFiles = fs.readdirSync(doorPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
        if (tsFiles.length > 0) {
          doors.push({
            name: entry.name,
            displayName: entry.name,
            description: 'TypeScript door (no package.json)',
            version: '1.0.0',
            main: tsFiles[0],
            path: doorPath,
            installed: true,
            isTypeScriptDoor: true,
            accessLevel: 0,
          });

          console.log(`Loaded TypeScript door (no package.json): ${entry.name}`);
        }
      }
    }

    // Add Phreak Wars door
    doors.push({
      name: 'phreakwars',
      displayName: 'Phreak Wars: The Underground BBS Empire',
      description: 'A text-based adventure game about 1980s phone phreaking and BBS hacking',
      version: '1.0.0',
      author: 'AmiExpress-Web AI',
      main: 'phreakWars.ts',
      path: path.join(doorsPath, 'phreakWars.ts'),
      installed: true,
      isTypeScriptDoor: true,
      accessLevel: 0,
    });

    return doors;
  }

  /**
   * List LHA archive contents
   */
  private listLhaContents(archivePath: string): string[] {
    try {
      // Use JavaScript LHA extractor
      const LHA = require('../utils/lha.js');

      // Read file synchronously
      const buffer = fs.readFileSync(archivePath);
      const data = new Uint8Array(buffer);

      // Parse LHA archive
      const entries = LHA.read(data);

      // Extract filenames
      const files = entries.map((e: any) => e.name);

      console.log(`[LHA] JavaScript extractor found ${files.length} files`);
      return files;
    } catch (error) {
      console.error('[LHA] Error:', error);
      return [];
    }
  }

  /**
   * List LZX archive contents (async - uses JavaScript extractor)
   */
  private async listLzxContents(archivePath: string): Promise<string[]> {
    try {
      // Use JavaScript LZX extractor
      const { listLzxFiles } = require('../utils/lzx-extractor');
      const files = await listLzxFiles(archivePath);

      console.log(`[LZX] JavaScript extractor found ${files.length} files`);
      return files;
    } catch (error) {
      console.error('[LZX] Error:', error);
      return [];
    }
  }

  /**
   * Analyze door archive structure
   */
  async analyzeDoorArchive(archivePath: string): Promise<DoorArchive | null> {
    try {
      const stats = fs.statSync(archivePath);
      const ext = path.extname(archivePath).toLowerCase();
      const isZip = ext === '.zip';
      const isLha = ext === '.lha' || ext === '.lzh';
      const isLzx = ext === '.lzx';

      if (!isZip && !isLha && !isLzx) {
        return null;
      }

      let files: string[] = [];
      let packageJson: any = null;

      if (isZip) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);
        files = zip.getEntries().map((e: any) => e.entryName);

        // Check for package.json (TypeScript door indicator)
        const packageEntry = zip.getEntry('package.json');
        if (packageEntry) {
          try {
            const content = packageEntry.getData().toString('utf8');
            packageJson = JSON.parse(content);
          } catch (e) {
            console.error('Error parsing package.json:', e);
          }
        }
      } else if (isLha) {
        files = await this.listLhaContents(archivePath);
        console.log(`[AnalyzeDoorArchive] LHA files found (${files.length}):`, files);
      } else if (isLzx) {
        files = await this.listLzxContents(archivePath);
        console.log(`[AnalyzeDoorArchive] LZX files found (${files.length}):`, files);
      }

      // Detect standard AmiExpress door structure
      // Handle both forward slash (/) and backslash (\) path separators
      const hasCommandsDir = files.some(f => f.match(/^[^/\\]*Commands[/\\]BBSCmd[/\\]/i));
      const hasDoorsDir = files.some(f => f.match(/^[^/\\]*Doors[/\\]/i));
      const isStandardDoorStructure = hasCommandsDir && hasDoorsDir;

      console.log(`[AnalyzeDoorArchive] hasCommandsDir: ${hasCommandsDir}, hasDoorsDir: ${hasDoorsDir}, isStandard: ${isStandardDoorStructure}`);

      // Extract BBS commands from Commands/BBSCmd/*.info
      const bbsCommands: string[] = [];
      const commandsDirectory = files.find(f => f.match(/^[^/\\]*Commands[/\\]BBSCmd[/\\]/i))
        ?.replace(/[/\\][^/\\]*$/, ''); // Get directory path without filename (handle both / and \)

      if (commandsDirectory) {
        // Match with both separators
        const commandInfoFiles = files.filter(f => {
          const normalized = f.replace(/\\/g, '/');
          const normalizedPrefix = commandsDirectory.replace(/\\/g, '/');
          return normalized.startsWith(normalizedPrefix + '/') && f.toLowerCase().endsWith('.info');
        });

        for (const infoFile of commandInfoFiles) {
          // Extract command name (filename without .info extension)
          // Normalize backslashes to forward slashes for path.basename to work correctly
          const normalized = infoFile.replace(/\\/g, '/');
          const basename = path.basename(normalized, '.info');
          bbsCommands.push(basename);
        }
      }

      // Find Doors/ directory and extract door name
      let doorsDirectory: string | undefined;
      let doorName: string | undefined;

      const doorsPath = files.find(f => f.match(/^[^/\\]*Doors[/\\]/i));
      if (doorsPath) {
        // Extract: "otl-ab10\Doors\AquaBulls\..." or "otl-ab10/Doors/AquaBulls/..." -> "Doors/AquaBulls"
        const match = doorsPath.match(/^([^/\\]*Doors[/\\][^/\\]+)/i);
        if (match) {
          doorsDirectory = match[1];
          // Extract door name from "Doors\AquaBulls" or "Doors/AquaBulls" -> "AquaBulls"
          doorName = doorsDirectory.split(/[/\\]/)[1];
        }
      }

      // Find .info files and executables
      const infoFiles = files.filter(f => f.toLowerCase().endsWith('.info'));

      // Enhanced executable detection
      const executables = files.filter(f => {
        const name = f.toLowerCase();
        const baseName = path.basename(f);

        // Known Amiga executable extensions
        if (name.endsWith('.000') || name.endsWith('.020') ||
            name.endsWith('.x') || name.endsWith('.xim') ||
            name.endsWith('.ts') || name.endsWith('.js')) {
          return true;
        }

        // Files in Doors/ directory without extension (typical Amiga binaries)
        if (f.match(/Doors[/\\]/i) && !path.extname(baseName)) {
          // Exclude common non-executable files
          if (baseName.toLowerCase() === 'readme' ||
              baseName.toLowerCase() === 'install' ||
              baseName.toLowerCase() === 'fileid' ||
              baseName.toLowerCase() === 'file_id') {
            return false;
          }
          // If the same name exists with .info extension, it's likely an executable
          const correspondingInfo = f + '.info';
          if (files.includes(correspondingInfo)) {
            return true;
          }
          // If in Doors/ subdirectory matching doorName, likely executable
          // Normalize path separators for comparison
          const normalizedPath = f.replace(/\\/g, '/');
          if (doorName && normalizedPath.includes(`Doors/${doorName}/`) && baseName === doorName) {
            return true;
          }
        }

        return false;
      });

      // Find Amiga library files (.library)
      const libraries = files.filter(f => f.toLowerCase().endsWith('.library'));

      // Find source code files
      const sourceFiles = files.filter(f => {
        const name = f.toLowerCase();
        return name.endsWith('.s') ||      // Amiga assembler
               name.endsWith('.asm') ||    // Assembler
               name.endsWith('.c') ||      // C source
               name.endsWith('.h') ||      // C header
               name.endsWith('.e') ||      // E source
               name.endsWith('.rexx') ||   // AREXX script
               name.endsWith('.rx');       // AREXX script (alternate extension)
      });

      // Detect door type
      const hasPackageJson = packageJson !== null;
      const hasRootTypeScript = files.some(f => {
        const name = f.toLowerCase();
        const isTypeScript = name.endsWith('.ts') || name.endsWith('.js');
        const isInRoot = !f.includes('/') && !f.includes('\\');
        return isTypeScript && (isInRoot || !f.toLowerCase().startsWith('bbs/'));
      });
      const hasBBSStructure = files.some(f => f.toLowerCase().startsWith('bbs/'));

      const isTypeScriptDoor = (hasPackageJson || hasRootTypeScript) && !hasBBSStructure;
      const isAREXXDoor = files.some(f => f.toLowerCase().endsWith('.rexx') || f.toLowerCase().endsWith('.rx'));
      const hasSourceCode = sourceFiles.length > 0;

      // Parse metadata files (file_id.diz, readme, .guide)
      let fileidDiz: string | undefined;
      let readme: string | undefined;
      let guide: string | undefined;

      // Find and extract file_id.diz
      const fileidDizPath = files.find(f =>
        f.toLowerCase().endsWith('file_id.diz') ||
        f.toLowerCase().endsWith('fileid.diz')
      );

      if (fileidDizPath) {
        try {
          if (isZip) {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(archivePath);
            const entry = zip.getEntry(fileidDizPath);
            if (entry) {
              fileidDiz = entry.getData().toString('utf8');
            }
          } else if (isLha) {
            // For LHA, we'd need to extract - skip for now, will handle in installDoor
            console.log('[AmigaDoorManager] file_id.diz found in LHA:', fileidDizPath);
          }
        } catch (e) {
          console.error('Error parsing file_id.diz:', e);
        }
      }

      return {
        filename: path.basename(archivePath),
        path: archivePath,
        size: stats.size,
        format: isZip ? 'ZIP' : isLha ? 'LHA' : 'LZX',
        uploadDate: stats.mtime,
        files,
        infoFiles,
        executables,
        libraries,
        sourceFiles,
        isTypeScriptDoor,
        isAREXXDoor,
        hasSourceCode,
        packageJson,
        // Standard AmiExpress door structure
        isStandardDoorStructure,
        bbsCommands,
        doorsDirectory,
        commandsDirectory,
        metadata: {
          fileidDiz,
          readme,
          guide,
          doorName,
        },
      };
    } catch (error) {
      console.error('Error analyzing archive:', error);
      return null;
    }
  }

  /**
   * Install TypeScript door package
   * Extracts to backend/doors/[door-name]/
   */
  async installTypeScriptDoor(archivePath: string, analysis: DoorArchive): Promise<{ success: boolean; message: string; doorPath?: string }> {
    try {
      // Determine door name from package.json or filename
      const doorName = analysis.packageJson?.name || path.basename(archivePath, path.extname(archivePath));
      const doorInstallPath = path.join(__dirname, '../../doors', doorName);

      console.log(`Installing TypeScript door: ${doorName}`);

      // Remove existing installation if present
      if (fs.existsSync(doorInstallPath)) {
        fs.rmSync(doorInstallPath, { recursive: true, force: true });
      }

      // Create door directory
      fs.mkdirSync(doorInstallPath, { recursive: true });

      // Extract archive
      if (analysis.format === 'ZIP') {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);

        // Extract to temporary location first
        const tempExtract = path.join(__dirname, '../../temp/ts-door-extract', crypto.randomBytes(8).toString('hex'));
        fs.mkdirSync(tempExtract, { recursive: true });
        zip.extractAllTo(tempExtract, true);

        // Check if files are nested in a subdirectory
        const tempFiles = fs.readdirSync(tempExtract);
        const tempDirs = tempFiles.filter(f => fs.statSync(path.join(tempExtract, f)).isDirectory());

        // If there's only one directory, use its contents
        let sourceDir = tempExtract;
        if (tempDirs.length === 1 && tempFiles.length === 1) {
          sourceDir = path.join(tempExtract, tempDirs[0]);
        }

        // Move files to final location
        const sourceFiles = fs.readdirSync(sourceDir);
        for (const file of sourceFiles) {
          const srcPath = path.join(sourceDir, file);
          const destPath = path.join(doorInstallPath, file);
          if (fs.statSync(srcPath).isDirectory()) {
            // Copy directory recursively
            this.copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }

        // Cleanup temp directory
        this.cleanup(tempExtract);
      } else {
        return { success: false, message: 'TypeScript doors must be in ZIP format' };
      }

      // Verify package.json exists
      const packageJsonPath = path.join(doorInstallPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        // Create a minimal package.json if it doesn't exist
        const minimalPackage = {
          name: doorName,
          version: '1.0.0',
          description: analysis.packageJson?.description || `${doorName} door`,
          main: 'index.ts',
          type: 'door'
        };
        fs.writeFileSync(packageJsonPath, JSON.stringify(minimalPackage, null, 2));
      }

      console.log(`TypeScript door installed: ${doorName} → doors/${doorName}/`);

      return {
        success: true,
        message: `TypeScript door '${doorName}' installed successfully`,
        doorPath: doorInstallPath
      };
    } catch (error) {
      console.error('TypeScript door installation error:', error);
      return {
        success: false,
        message: `Installation failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Install door from archive
   * Extracts to proper BBS structure: Commands/BBSCmd/ and Doors/[DoorName]/
   * Or installs TypeScript door to backend/doors/[door-name]/
   */
  async installDoor(archivePath: string): Promise<{ success: boolean; message: string; door?: DoorInfo; doorPath?: string }> {
    try {
      const analysis = await this.analyzeDoorArchive(archivePath);
      if (!analysis) {
        return { success: false, message: 'Failed to analyze archive' };
      }

      // Handle TypeScript doors differently
      if (analysis.isTypeScriptDoor) {
        return await this.installTypeScriptDoor(archivePath, analysis);
      }

      // Extract to temporary directory first
      const tempDir = path.join(__dirname, '../../temp/door-install', crypto.randomBytes(8).toString('hex'));
      fs.mkdirSync(tempDir, { recursive: true });

      console.log(`Extracting archive to temp: ${tempDir}`);

      if (analysis.format === 'ZIP') {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(tempDir, true);
      } else if (analysis.format === 'LHA') {
        // Use JavaScript LHA extractor
        console.log('[LHA] Extracting using JavaScript LHA library...');
        const LHA = require('../utils/lha.js');

        // Read archive
        const buffer = fs.readFileSync(archivePath);
        const data = new Uint8Array(buffer);

        // Parse and extract all files
        const entries = LHA.read(data);
        console.log(`[LHA] Found ${entries.length} files to extract`);

        for (const entry of entries) {
          const filename = entry.name;
          const decompressed = LHA.unpack(entry);

          if (!decompressed) {
            console.warn(`[LHA] Failed to decompress: ${filename}`);
            continue;
          }

          // Normalize path separators (convert backslash to forward slash for Linux compatibility)
          const normalizedFilename = filename.replace(/\\/g, '/');
          console.log(`[LHA] Normalizing path: "${filename}" => "${normalizedFilename}"`);

          // Create directory structure
          const filePath = path.join(tempDir, normalizedFilename);
          const fileDir = path.dirname(filePath);
          console.log(`[LHA] File path: ${filePath}`);
          console.log(`[LHA] File dir: ${fileDir}`);

          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
            console.log(`[LHA] Created directory: ${fileDir}`);
          }

          // Write file
          fs.writeFileSync(filePath, Buffer.from(decompressed));
          console.log(`[LHA] Extracted: ${filename} => ${filePath} (${decompressed.length} bytes)`);
        }

        console.log(`[LHA] Extraction complete`);
      } else if (analysis.format === 'LZX') {
        // Use JavaScript LZX extractor
        console.log('[LZX] Extracting using JavaScript LZX library...');
        const { extractFileFromLzx, listLzxFiles } = require('../utils/lzx-extractor');

        // List all files in archive
        const fileList = await listLzxFiles(archivePath);
        console.log(`[LZX] Found ${fileList.length} files to extract`);

        // Extract each file
        for (const filename of fileList) {
          // Normalize path separators (convert backslash to forward slash for Linux compatibility)
          const normalizedFilename = filename.replace(/\\/g, '/');
          const outputPath = path.join(tempDir, normalizedFilename);
          const outputDir = path.dirname(outputPath);

          // Create directory structure
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          // Extract file
          const success = await extractFileFromLzx(archivePath, filename, outputPath);

          if (!success) {
            console.warn(`[LZX] Failed to extract: ${filename}`);
          } else {
            console.log(`[LZX] Extracted: ${filename}`);
          }
        }

        console.log(`[LZX] Extraction complete`);
      }

      // Analyze extracted structure
      const extractedFiles = this.getFilesRecursive(tempDir);
      console.log(`[installDoor] Found ${extractedFiles.length} extracted files:`);
      extractedFiles.forEach(f => console.log(`[installDoor]   - ${f}`));

      const infoFiles = extractedFiles.filter(f => f.toLowerCase().endsWith('.info'));
      console.log(`[installDoor] Found ${infoFiles.length} .info files:`);
      infoFiles.forEach(f => console.log(`[installDoor]   - ${f}`));

      if (infoFiles.length === 0) {
        this.cleanup(tempDir);
        return { success: false, message: 'No .info files found in archive' };
      }

      console.log(`Found ${infoFiles.length} .info files in extracted archive`);

      // Process each .info file
      let installedCount = 0;
      let firstDoor: DoorInfo | undefined;

      for (const infoFile of infoFiles) {
        const relativePath = path.relative(tempDir, infoFile);

        // Detect archive structure patterns:
        // 1. BBS/Commands/BBSCmd/ (full BBS structure)
        // 2. Commands/BBSCmd/ (standard door structure)
        // 3. Archive-name/Commands/BBSCmd/ (archive root + standard structure)
        const hasBBSStructure = relativePath.match(/^BBS[/\\]Commands[/\\]BBSCmd[/\\]/i);
        const hasStandardStructure = relativePath.match(/Commands[/\\]BBSCmd[/\\]/i);
        const hasCommandsDir = hasStandardStructure || hasBBSStructure;

        // Only process .info files that are in Commands/BBSCmd/ directory
        if (!hasCommandsDir) {
          console.log(`Skipping .info file not in Commands/BBSCmd/: ${relativePath}`);
          continue;
        }

        // Destination for .info file
        const infoDestDir = path.join(this.bbsRoot, 'Commands', 'BBSCmd');
        const infoFileName = path.basename(infoFile);
        const infoDestPath = path.join(infoDestDir, infoFileName);

        // Extract command name from .info filename
        const commandName = path.basename(infoFileName, '.info');

        // Copy .info file
        fs.mkdirSync(infoDestDir, { recursive: true });
        fs.copyFileSync(infoFile, infoDestPath);
        console.log(`Installed command: ${commandName} (${infoFileName} → Commands/BBSCmd/)`);

        // Find corresponding door in Doors/ directory
        // Look for Doors/[DoorName]/ where DoorName matches or contains the command
        const doorsPattern = hasBBSStructure ? 'BBS/Doors' : 'Doors';
        const doorsDirMatch = extractedFiles.find(f => {
          const rel = path.relative(tempDir, f);
          return rel.match(new RegExp(`${doorsPattern}[/\\\\]([^/\\\\]+)[/\\\\]`, 'i'));
        });

        let doorName: string | undefined;
        let doorSourceDir: string | undefined;

        if (doorsDirMatch) {
          // Extract door name from path: "Doors/AquaBulls/..." → "AquaBulls"
          const rel = path.relative(tempDir, doorsDirMatch);
          const match = rel.match(new RegExp(`${doorsPattern}[/\\\\]([^/\\\\]+)[/\\\\]`, 'i'));
          if (match) {
            doorName = match[1];
            const doorPathPrefix = hasBBSStructure ? path.join(tempDir, 'BBS', 'Doors') : path.join(tempDir, 'Doors');

            // Handle archive root prefix (e.g., "otl-ab10/Doors/")
            const archiveRootDoors = extractedFiles.find(f => f.match(/Doors[/\\]/));
            if (archiveRootDoors) {
              const parts = path.relative(tempDir, archiveRootDoors).split(path.sep);
              if (parts.length > 2 && parts[0] !== 'BBS' && parts[0] !== 'Doors') {
                // Has archive root prefix
                doorSourceDir = path.join(tempDir, parts[0], 'Doors', doorName);
              } else {
                doorSourceDir = path.join(doorPathPrefix, doorName);
              }
            } else {
              doorSourceDir = path.join(doorPathPrefix, doorName);
            }
          }
        }

        if (!doorName || !doorSourceDir || !fs.existsSync(doorSourceDir)) {
          console.log(`Warning: Could not find door directory for command ${commandName}`);
          continue;
        }

        // Copy door files
        const doorDestDir = path.join(this.assigns['Doors:'], doorName);
        fs.mkdirSync(doorDestDir, { recursive: true });
        console.log(`Installing door: ${doorName} → Doors/${doorName}/`);

        // Copy all door files
        if (fs.existsSync(doorSourceDir)) {
          const doorFiles = fs.readdirSync(doorSourceDir);
          for (const file of doorFiles) {
            const srcPath = path.join(doorSourceDir, file);
            if (fs.statSync(srcPath).isFile()) {
              const destPath = path.join(doorDestDir, file);
              fs.copyFileSync(srcPath, destPath);
              console.log(`  Copied: ${file}`);
            }
          }
        }

        // Install Amiga library files (.library) to Libs/
        const libraryFiles = extractedFiles.filter(f => f.toLowerCase().endsWith('.library'));
        if (libraryFiles.length > 0) {
          const libsDir = this.assigns['Libs:'];
          fs.mkdirSync(libsDir, { recursive: true });

          console.log(`Installing ${libraryFiles.length} Amiga library file(s):`);
          for (const libraryFile of libraryFiles) {
            const libraryName = path.basename(libraryFile);
            const destPath = path.join(libsDir, libraryName);
            fs.copyFileSync(libraryFile, destPath);
            console.log(`  → Libs/${libraryName}`);
          }
        }

        // Re-parse installed door
        const installedDoor = this.parseInfoFile(infoDestPath);
        if (installedDoor) {
          const executableExists = fs.existsSync(installedDoor.resolvedPath || '');
          const door: DoorInfo = {
            command: installedDoor.command || path.basename(infoFile, '.info'),
            location: installedDoor.location || '',
            resolvedPath: installedDoor.resolvedPath || '',
            access: installedDoor.access || 0,
            type: installedDoor.type || 'UNKNOWN',
            stack: installedDoor.stack,
            priority: installedDoor.priority,
            multinode: installedDoor.multinode,
            name: installedDoor.name,
            doorName: installedDoor.doorName,
            installed: executableExists,
          };

          if (!firstDoor) {
            firstDoor = door;
          }
        }

        installedCount++;
      }

      // Cleanup temp directory
      this.cleanup(tempDir);

      return {
        success: true,
        message: `Installed ${installedCount} door command(s)`,
        door: firstDoor,
      };

    } catch (error) {
      console.error('Door installation error:', error);
      return {
        success: false,
        message: `Installation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get all files recursively from directory
   */
  private getFilesRecursive(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Copy directory recursively
   */
  private copyRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Cleanup temporary directory
   */
  private cleanup(dir: string): void {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Delete Amiga door (removes .info file and door directory)
   * @param command - The command name (e.g., "AQUASCAN")
   * @returns Result object with success status and message
   */
  async deleteAmigaDoor(command: string): Promise<{ success: boolean; message: string }> {
    try {
      const commandsPath = path.join(this.bbsRoot, 'Commands', 'BBSCmd');
      const infoPath = path.join(commandsPath, `${command}.info`);

      // Check if .info file exists
      if (!fs.existsSync(infoPath)) {
        return {
          success: false,
          message: `Door command '${command}' not found`
        };
      }

      // Parse .info to find door location
      const metadata = this.parseInfoFile(infoPath);
      if (!metadata || !metadata.doorName) {
        return {
          success: false,
          message: `Could not parse door information for '${command}'`
        };
      }

      const doorName = metadata.doorName;
      const doorPath = path.join(this.assigns['Doors:'], doorName);

      // Delete .info file
      fs.unlinkSync(infoPath);
      console.log(`Deleted command file: ${infoPath}`);

      // Delete door directory if it exists
      if (fs.existsSync(doorPath)) {
        fs.rmSync(doorPath, { recursive: true, force: true });
        console.log(`Deleted door files: ${doorPath}`);
      }

      return {
        success: true,
        message: `Door '${command}' deleted successfully`
      };
    } catch (error) {
      console.error('Door deletion error:', error);
      return {
        success: false,
        message: `Deletion failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Delete TypeScript door (removes entire door directory)
   * @param doorName - The door name (directory name in backend/doors/)
   * @returns Result object with success status and message
   */
  async deleteTypeScriptDoor(doorName: string): Promise<{ success: boolean; message: string }> {
    try {
      const doorPath = path.join(__dirname, '../../doors', doorName);

      // Check if door exists
      if (!fs.existsSync(doorPath)) {
        return {
          success: false,
          message: `TypeScript door '${doorName}' not found`
        };
      }

      // Verify it's a directory
      const stats = fs.statSync(doorPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          message: `'${doorName}' is not a valid door directory`
        };
      }

      // Delete door directory
      fs.rmSync(doorPath, { recursive: true, force: true });
      console.log(`Deleted TypeScript door: ${doorPath}`);

      return {
        success: true,
        message: `TypeScript door '${doorName}' deleted successfully`
      };
    } catch (error) {
      console.error('TypeScript door deletion error:', error);
      return {
        success: false,
        message: `Deletion failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Delete door (auto-detects Amiga or TypeScript door)
   * @param identifier - Command name for Amiga door, or door name for TypeScript door
   * @param isTypeScriptDoor - Optional flag to force TypeScript door deletion
   * @returns Result object with success status and message
   */
  async deleteDoor(identifier: string, isTypeScriptDoor?: boolean): Promise<{ success: boolean; message: string }> {
    // If explicitly marked as TypeScript door, delete as such
    if (isTypeScriptDoor === true) {
      return this.deleteTypeScriptDoor(identifier);
    }

    // Try Amiga door first
    const commandsPath = path.join(this.bbsRoot, 'Commands', 'BBSCmd');
    const infoPath = path.join(commandsPath, `${identifier}.info`);

    if (fs.existsSync(infoPath)) {
      return this.deleteAmigaDoor(identifier);
    }

    // Try TypeScript door
    const tsPath = path.join(__dirname, '../../doors', identifier);
    if (fs.existsSync(tsPath)) {
      return this.deleteTypeScriptDoor(identifier);
    }

    return {
      success: false,
      message: `Door '${identifier}' not found (checked both Amiga and TypeScript doors)`
    };
  }
}

/**
 * Create singleton instance
 */
let managerInstance: AmigaDoorManager | null = null;

export function getAmigaDoorManager(bbsRoot?: string): AmigaDoorManager {
  if (!managerInstance) {
    // BBS directory structure matches original Amiga AmiExpress
    // Note: When running from backend/backend/src, we need to go up one level to reach backend/BBS
    const root = bbsRoot || path.join(process.cwd(), '..', 'BBS');
    managerInstance = new AmigaDoorManager(root);
  }
  return managerInstance;
}
