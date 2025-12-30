/**
 * Amiga Door Manager - 1:1 Compatible with AmiExpress BBS
 *
 * This module implements door management exactly as the Amiga version does:
 * - Scans Commands/BBSCmd/*.info for door definitions
 * - Resolves AmigaDOS assigns (Doors:, BBS:, etc.)
 * - Installs doors to proper BBS directory structure
 * - Parses .info files for door metadata
 *
 * Reference: Example_BBS directory structure
 */

import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import { getAmigaAssignPaths } from '../utils/bbs-paths.util';
import { loadCommands } from '../handlers/command-execution.handler';
import { config } from '../config';
import { parseInfoFile as parseToolTypes } from '../utils/amiga-command-parser.util';

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
  resident?: boolean;        // RESIDENT=YES/NO
  expertMode?: boolean;      // EXPERT_MODE flag
  trapOn?: boolean;          // TRAPON=YES/NO
  silent?: boolean;          // SILENT=YES/NO
  quickMode?: boolean;       // QUICKMODE=YES/NO
  logInputs?: boolean;       // LOG_INPUTS=YES/NO
  scriptCheck?: boolean;     // SCRIPTCHECK=YES/NO
  banner?: string;           // BANNER= filename
  mimicVer?: string;         // MIMICVER= version string
  passParameters?: number;   // PASS_PARAMETERS=#
  internal?: string;         // INTERNAL= command redirection
  toolTypes?: Record<string, string>; // All parsed tooltypes (uppercased keys)
  description?: string;      // Description from archive
  installed: boolean;        // Whether door executable exists
  doorName?: string;         // Extracted door name from path
  size?: number;             // File size in bytes
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
  typeScriptIssues?: string[]; // Validation issues for TS door packages
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
  public bbsRoot: string;
  private assigns: AmigaDOSAssigns;
  private doorCache: DoorInfo[] | null = null;
  private cacheTimestamp: number = 0;

  constructor(bbsRoot: string) {
    this.bbsRoot = bbsRoot;
    this.assigns = this.initializeAssigns();
  }

  /**
   * Populate the door cache at startup
   * This scans all .info files once and stores the results in memory
   */
  async populateCache(): Promise<void> {
    const startTime = Date.now();
    console.log('[DoorCache] Populating door cache...');
    this.doorCache = await this.scanInstalledDoorsInternal();
    this.cacheTimestamp = Date.now();
    console.log(`[DoorCache] Cache populated with ${this.doorCache.length} doors in ${Date.now() - startTime}ms`);
  }

  /**
   * Refresh the door cache (call after installing/uninstalling doors)
   */
  async refreshCache(): Promise<void> {
    console.log('[DoorCache] Refreshing door cache...');
    this.doorCache = null;
    await this.populateCache();
  }

  /**
   * Get cached doors (returns cached data if available, otherwise scans)
   */
  getCachedDoors(): DoorInfo[] | null {
    return this.doorCache;
  }

  /**
   * Check if cache is populated
   */
  isCachePopulated(): boolean {
    return this.doorCache !== null;
  }

  /**
   * Initialize AmigaDOS Assigns
   * Maps logical assigns to physical paths within BBS root
   * Uses case-insensitive matching to find correct directory names
   */
  private initializeAssigns(): AmigaDOSAssigns {
    // Helper to find directory with case-insensitive matching
    const findDir = (name: string): string => {
      const resolved = amigafs.resolvePath(path.join(this.bbsRoot, name));
      return resolved || path.join(this.bbsRoot, name);
    };

    return {
      'BBS:': this.bbsRoot,
      'Doors:': findDir('Doors'),
      'Screens:': findDir('Screens'),
      'Storage:': findDir('Storage'),
      'NODE0:': findDir('Node0'),
      'NODE1:': findDir('Node1'),
      'NODE2:': findDir('Node2'),
      'NODE3:': findDir('Node3'),
      'Protocols:': findDir('Protocols'),
      'Utils:': findDir('Utils'),
      'Libs:': findDir('Libs'),
    };
  }

  /**
   * Resolve AmigaDOS path to physical path
   * Example: "Doors:AquaScan/AquaScan.000" → "/path/to/Doors/AquaScan/AquaScan.000"
   * Case-insensitive to handle both "Doors:" and "DOORS:"
   */
  resolveAssign(amigaPath: string): string {
    const amigaPathLower = amigaPath.toLowerCase();

    for (const [assign, physicalPath] of Object.entries(this.assigns)) {
      const assignLower = assign.toLowerCase();
      if (amigaPathLower.startsWith(assignLower)) {
        const relativePath = amigaPath.substring(assign.length);
        const joined = path.join(physicalPath, relativePath);
        const resolved = amigafs.resolvePath(joined);
        return resolved || joined;
      }
    }

    // No assign found, treat as relative to BBS root
    const fallback = path.join(this.bbsRoot, amigaPath);
    return amigafs.resolvePath(fallback) || fallback;
  }

  /**
   * Parse .info file to extract door metadata
   * .info files are binary Amiga icon files with embedded text data
   */
  parseInfoFile(infoPath: string): Partial<DoorInfo> | null {
    try {
      const tooltypes = parseToolTypes(infoPath);
      if (!tooltypes || tooltypes.size === 0) {
        return null;
      }

      const metadata: Partial<DoorInfo> = {
        command: path.basename(infoPath, '.info'),
        toolTypes: Object.fromEntries(tooltypes.entries()),
      };

      // Core fields
      const location = tooltypes.get('LOCATION') || tooltypes.get('PATH');
      if (location) {
        metadata.location = location.trim();
        metadata.resolvedPath = this.resolveAssign(metadata.location);
      }

      const access = tooltypes.get('ACCESS');
      if (access) {
        metadata.access = parseInt(access, 10);
      }

      const typeValue = tooltypes.get('TYPE');
      metadata.type = typeValue ? typeValue.trim().toUpperCase() : 'SIM';

      const stack = tooltypes.get('STACK');
      if (stack) {
        metadata.stack = parseInt(stack, 10);
      }

      const priority = tooltypes.get('PRIORITY');
      if (priority) {
        metadata.priority = priority.trim();
      }

      const multinode = tooltypes.get('MULTINODE');
      if (multinode) {
        metadata.multinode = multinode.toUpperCase() === 'YES';
      }

      const name = tooltypes.get('NAME');
      if (name) {
        metadata.name = name.trim();
      }

      // MENUNAME is the standard display name for AmiExpress doors
      const menuName = tooltypes.get('MENUNAME');
      if (menuName) {
        metadata.name = menuName.trim(); // Prefer MENUNAME over NAME
      }

      // Optional flags / behavior switches
      metadata.resident = tooltypes.get('RESIDENT')?.toUpperCase() === 'YES';
      metadata.expertMode = tooltypes.has('EXPERT_MODE');
      metadata.trapOn = tooltypes.get('TRAPON')?.toUpperCase() === 'YES';
      metadata.silent = tooltypes.get('SILENT')?.toUpperCase() === 'YES';
      metadata.quickMode = tooltypes.get('QUICKMODE')?.toUpperCase() === 'YES';
      metadata.logInputs = tooltypes.get('LOG_INPUTS')?.toUpperCase() === 'YES';
      metadata.scriptCheck = tooltypes.get('SCRIPTCHECK')?.toUpperCase() === 'YES';
      metadata.banner = tooltypes.get('BANNER')?.trim();
      metadata.mimicVer = tooltypes.get('MIMICVER')?.trim();

      const passParams = tooltypes.get('PASS_PARAMETERS');
      if (passParams) {
        metadata.passParameters = parseInt(passParams, 10);
      }

      const internal = tooltypes.get('INTERNAL');
      if (internal) {
        metadata.internal = internal.trim();
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
   * Returns cached data if available, otherwise scans
   */
  async scanInstalledDoors(): Promise<DoorInfo[]> {
    // Return cached data if available
    if (this.doorCache !== null) {
      console.log(`[scanInstalledDoors] Returning ${this.doorCache.length} cached doors (instant)`);
      return this.doorCache;
    }

    // Cache not populated, do a full scan
    console.log('[scanInstalledDoors] Cache miss - performing full scan...');
    return this.scanInstalledDoorsInternal();
  }

  /**
   * Internal method to scan Commands/BBSCmd/ for installed Amiga doors
   * This is the CORRECT way - scan .info files, NOT executables
   */
  private async scanInstalledDoorsInternal(): Promise<DoorInfo[]> {
    const doors: DoorInfo[] = [];
    const commandsPath = path.join(this.bbsRoot, 'Commands', 'BBSCmd');

    console.log(`[scanInstalledDoors] ========== SCANNING FOR INSTALLED DOORS ==========`);
    console.log(`[scanInstalledDoors] BBS Root: ${this.bbsRoot}`);
    console.log(`[scanInstalledDoors] Commands Path: ${commandsPath}`);

    if (!amigafs.existsSync(commandsPath)) {
      console.log(`[scanInstalledDoors] Commands directory does not exist: ${commandsPath}`);
      return doors;
    }

    const files = amigafs.readdirSync(commandsPath);
    const infoFiles = files.filter(f => {
      if (!f.toLowerCase().endsWith('.info')) return false;
      // Filter out files like "BESTCONF.INFO" - command names shouldn't contain dots
      const commandName = path.basename(f, '.info');
      if (commandName.includes('.')) {
        console.log(`[scanInstalledDoors] Skipping ${f} - command name contains dot`);
        return false;
      }
      return true;
    });

    console.log(`[scanInstalledDoors] Found ${infoFiles.length} valid .info files in ${commandsPath}:`);
    infoFiles.forEach(f => console.log(`[scanInstalledDoors]   - ${f}`));

    for (const infoFile of infoFiles) {
      const infoPath = path.join(commandsPath, infoFile);
      console.log(`
[scanInstalledDoors] --- Processing ${infoFile} ---`);
      console.log(`[scanInstalledDoors] Info file path: ${infoPath}`);

      const metadata = this.parseInfoFile(infoPath);

      if (metadata && metadata.location && metadata.resolvedPath) {
        console.log(`[scanInstalledDoors] Metadata parsed successfully:`);
        console.log(`[scanInstalledDoors]   Command: ${metadata.command}`);
        console.log(`[scanInstalledDoors]   Location (from .info): ${metadata.location}`);
        console.log(`[scanInstalledDoors]   Resolved Path: ${metadata.resolvedPath}`);
        console.log(`[scanInstalledDoors]   Type: ${metadata.type}`);
        console.log(`[scanInstalledDoors]   Access Level: ${metadata.access}`);
        console.log(`[scanInstalledDoors]   Door Name: ${metadata.doorName}`);

        const executableExists = amigafs.existsSync(metadata.resolvedPath);
        console.log(`[scanInstalledDoors] Checking if executable exists at: ${metadata.resolvedPath}`);
        console.log(`[scanInstalledDoors] Executable exists: ${executableExists}`);

        // Get file/directory size if path exists
        let fileSize = 0;
        if (executableExists) {
          try {
            const stats = amigafs.statSync(metadata.resolvedPath);
            if (stats.isDirectory()) {
              // For directories (TypeScript doors), calculate total size
              fileSize = this.calculateDirectorySize(metadata.resolvedPath);
            } else {
              fileSize = stats.size;
            }
          } catch (err) {
            console.log(`[scanInstalledDoors] Could not get file size: ${err}`);
          }
        }

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
          resident: metadata.resident,
          expertMode: metadata.expertMode,
          trapOn: metadata.trapOn,
          silent: metadata.silent,
          quickMode: metadata.quickMode,
          logInputs: metadata.logInputs,
          scriptCheck: metadata.scriptCheck,
          banner: metadata.banner,
          mimicVer: metadata.mimicVer,
          passParameters: metadata.passParameters,
          internal: metadata.internal,
          toolTypes: metadata.toolTypes,
          doorName: metadata.doorName,
          installed: executableExists,
          size: fileSize,
        });

        console.log(`[scanInstalledDoors] Added door to list: ${metadata.command} (${executableExists ? 'INSTALLED' : 'NOT INSTALLED'})`);
      } else {
        console.log(`[scanInstalledDoors] Failed to parse metadata or missing location/resolvedPath:`);
        console.log(`[scanInstalledDoors]   metadata: ${metadata} `);
      }
    }

    console.log(`
[scanInstalledDoors] ========== SCAN COMPLETE ==========`);
    console.log(`[scanInstalledDoors] Total doors found: ${doors.length}`);
    return doors;
  }

  /**
   * Scan backend/doors/ for TypeScript door packages
   */
  async scanTypeScriptDoors(): Promise<any[]> {
    const doors: any[] = [];
    const doorsPath = path.join(this.bbsRoot, 'Doors');

    if (!amigafs.existsSync(doorsPath)) {
      return doors;
    }

    const entries = amigafs.readdirSync(doorsPath);

    for (const entry of entries) {
      const doorPath = path.join(doorsPath, entry);
      let stats: fs.Stats;
      try {
        stats = amigafs.statSync(doorPath);
      } catch {
        continue;
      }
      if (!stats.isDirectory()) continue;

      const packageJsonPath = path.join(doorPath, 'package.json');

      // Check for package.json
      if (amigafs.existsSync(packageJsonPath)) {
        try {
          const fileContent = amigafs.readFileSync(packageJsonPath, 'utf8');
          const packageJson = JSON.parse(typeof fileContent === 'string' ? fileContent : fileContent.toString());

          // Look for main entry point
          const mainFile = packageJson.main || 'index.ts';
          const mainPath = path.join(doorPath, mainFile);
          const exists = amigafs.existsSync(mainPath);

          doors.push({
            name: packageJson.name || entry,
            displayName: packageJson.displayName || packageJson.name || entry,
            description: packageJson.description || '',
            version: packageJson.version || '1.0.0',
            author: packageJson.author || '',
            main: mainFile,
            path: doorPath,
            installed: exists,
            isTypeScriptDoor: true,
            accessLevel: packageJson.accessLevel || 0,
          });

          console.log(`Loaded TypeScript door: ${packageJson.name || entry} (${exists ? 'INSTALLED' : 'MISSING'})`);
        } catch (error) {
          console.error(`Error reading package.json for ${entry}:`, error);
        }
      } else {
        // Check for loose .ts/.js files
        const tsFiles = amigafs.readdirSync(doorPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
        if (tsFiles.length > 0) {
          doors.push({
            name: entry,
            displayName: entry,
            description: 'TypeScript door (no package.json)',
            version: '1.0.0',
            main: tsFiles[0],
            path: doorPath,
            installed: true,
            isTypeScriptDoor: true,
            accessLevel: 0,
          });

          console.log(`Loaded TypeScript door (no package.json): ${entry}`);
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
      let doorPackageJsonPath: string | undefined;

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

        if (!packageJson) {
          doorPackageJsonPath = files.find(f =>
            /(^|[/\\])Doors[/\\][^/\\]+[/\\]package\.json$/i.test(f)
          );
          if (doorPackageJsonPath) {
            const doorPackageEntry = zip.getEntry(doorPackageJsonPath);
            if (doorPackageEntry) {
              try {
                const content = doorPackageEntry.getData().toString('utf8');
                packageJson = JSON.parse(content);
              } catch (e) {
                console.error('Error parsing door package.json:', e);
              }
            }
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
        // Extract: "otl-ab10\\Doors\\Example\\..." or "otl-ab10/Doors/Example/..." -> "Doors/Example"
        const match = doorsPath.match(/^([^/\\]*Doors[/\\][^/\\]+)/i);
        if (match) {
          doorsDirectory = match[1];
          // Extract door name from "Doors\\Example" or "Doors/Example" -> "Example"
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
      const hasDoorPackageJson = files.some(f =>
        /(^|[/\\])Doors[/\\][^/\\]+[/\\]package\.json$/i.test(f)
      );
      const hasPackageJson = packageJson !== null || hasDoorPackageJson;
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

      const typeScriptIssues: string[] = [];
      if (isTypeScriptDoor) {
        if (!isStandardDoorStructure) {
          typeScriptIssues.push('Missing Commands/BBSCmd and Doors/ structure');
        }

        const hasCommandInfo = files.some(f => f.match(/Commands[/\\]BBSCmd[/\\][^/\\]+\.info$/i));
        if (!hasCommandInfo) {
          typeScriptIssues.push('Missing Commands/BBSCmd/*.info');
        }

        if (!hasDoorPackageJson) {
          typeScriptIssues.push('Missing Doors/<door>/package.json');
        }
      }

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
        typeScriptIssues: typeScriptIssues.length > 0 ? typeScriptIssues : undefined,
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
      const doorInstallPath = path.join(this.bbsRoot, 'Doors', doorName);

      console.log(`Installing TypeScript door: ${doorName}`);

      // Remove existing installation if present
      if (amigafs.existsSync(doorInstallPath)) {
        amigafs.rmSync(doorInstallPath, { recursive: true, force: true });
      }

      // Create door directory
      amigafs.mkdirSync(doorInstallPath, { recursive: true });

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
            this.copyRecursive(srcPath, destPath, { skipNames: new Set(['node_modules', '.git']) });
          } else {
            amigafs.copyFileSync(srcPath, destPath);
          }
        }

        // Cleanup temp directory
        this.cleanup(tempExtract);
      } else {
        return { success: false, message: 'TypeScript doors must be in ZIP format' };
      }

      // Verify package.json exists
      const packageJsonPath = path.join(doorInstallPath, 'package.json');
      if (!amigafs.existsSync(packageJsonPath)) {
        // Create a minimal package.json if it doesn't exist
        const minimalPackage = {
          name: doorName,
          version: '1.0.0',
          description: analysis.packageJson?.description || `${doorName} door`,
          main: 'index.ts',
          type: 'door'
        };
        amigafs.writeFileSync(packageJsonPath, JSON.stringify(minimalPackage, null, 2));
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

      if (analysis.isTypeScriptDoor && !analysis.isStandardDoorStructure) {
        const issueMessage = analysis.typeScriptIssues?.length
          ? `TypeScript door validation failed:\n- ${analysis.typeScriptIssues.join('\n- ')}`
          : 'TypeScript doors must include Commands/BBSCmd and Doors/ structure';
        return { success: false, message: issueMessage };
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

      const normalizedFiles = extractedFiles.map(f => path.relative(tempDir, f).split(path.sep).join('/'));
      const normalizedSet = new Set(normalizedFiles.map(f => f.toLowerCase()));

      const getDoorDirFromLocation = (location?: string): string | null => {
        if (!location) return null;
        let value = location.trim();
        if (!value) return null;
        value = value.replace(/^doors:/i, 'Doors/');
        value = value.replace(/^doors[\\/]/i, 'Doors/');
        const parts = value.split(/[\\/]/);
        if (parts.length < 2) return null;
        if (parts[0].toLowerCase() !== 'doors') return null;
        return parts[1];
      };

      const isTypeScriptInfo = (metadata: Partial<DoorInfo> | null): boolean => {
        const typeValue = metadata?.type?.toString().toUpperCase();
        return typeValue === 'TS';
      };

      const resolveDoorSourceDir = (doorName: string): string | undefined => {
        const doorPathMatch = extractedFiles.find(f =>
          new RegExp(`[/\\\\]Doors[/\\\\]${doorName}([/\\\\]|$)`, 'i').test(f)
        );
        if (!doorPathMatch) return undefined;

        const rel = path.relative(tempDir, doorPathMatch);
        const parts = rel.split(path.sep);
        const doorsIndex = parts.findIndex(part => part.toLowerCase() === 'doors');
        if (doorsIndex === -1) return undefined;

        const prefixParts = parts.slice(0, doorsIndex);
        return path.join(tempDir, ...prefixParts, 'Doors', doorName);
      };

      const tsIssues: string[] = [];
      for (const infoFile of infoFiles) {
        const metadata = this.parseInfoFile(infoFile);
        if (!isTypeScriptInfo(metadata)) continue;

        const doorDir = getDoorDirFromLocation(metadata?.location);
        if (!doorDir) {
          tsIssues.push(`${path.basename(infoFile)} missing or invalid LOCATION (expected Doors/<door>)`);
          continue;
        }

        const packageJsonRel = `Doors/${doorDir}/package.json`;
        if (!normalizedSet.has(packageJsonRel.toLowerCase())) {
          tsIssues.push(`Missing ${packageJsonRel}`);
          continue;
        }

        const packageJsonPath = path.join(tempDir, packageJsonRel);
        let packageJson: any = null;
        try {
          packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        } catch (error) {
          tsIssues.push(`Invalid package.json for Doors/${doorDir}`);
          continue;
        }

        const runtime = typeof packageJson.runtime === 'string' ? packageJson.runtime : 'server';
        const serverEntry = packageJson.server?.entry || packageJson.main || 'index.ts';
        const serverEntryValue = String(serverEntry);
        const serverEntryNormalized = serverEntryValue.startsWith('./')
          ? serverEntryValue.slice(2)
          : serverEntryValue;
        const serverEntryRel = `Doors/${doorDir}/${serverEntryNormalized}`;
        if (!normalizedSet.has(serverEntryRel.toLowerCase())) {
          tsIssues.push(`Missing server entry ${serverEntryRel}`);
        }

        if (runtime === 'hybrid') {
          const clientBundleRel = `Doors/${doorDir}/dist/client.bundle.js`;
          if (!normalizedSet.has(clientBundleRel.toLowerCase())) {
            tsIssues.push(`Missing client bundle ${clientBundleRel}`);
          }
        }
      }

      if (tsIssues.length > 0) {
        this.cleanup(tempDir);
        return { success: false, message: `TypeScript door validation failed:\n- ${tsIssues.join('\n- ')}` };
      }

      console.log(`Found ${infoFiles.length} .info files in extracted archive`);

      // Process each .info file
      let installedCount = 0;
      let firstDoor: DoorInfo | undefined;
      const installedTsDoors = new Set<string>();
      const dependencyWarnings: string[] = [];
      const copySkipNames = new Set(['node_modules', '.git']);

      for (const infoFile of infoFiles) {
        const relativePath = path.relative(tempDir, infoFile);
        const metadata = this.parseInfoFile(infoFile);

        // Detect archive structure patterns:
        // 1. Commands/BBSCmd/ (standard door structure)
        // 2. Archive-name/Commands/BBSCmd/ (archive root + standard structure)
        const hasCommandsDir = relativePath.match(/Commands[/\\]BBSCmd[/\\]/i);

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
        amigafs.mkdirSync(infoDestDir, { recursive: true });
        amigafs.copyFileSync(infoFile, infoDestPath);
        console.log(`Installed command: ${commandName} (${infoFileName} → Commands/BBSCmd/)`);

        // Find corresponding door in Doors/ directory
        const doorDirFromLocation = getDoorDirFromLocation(metadata?.location);
        let doorName: string | undefined = doorDirFromLocation ?? undefined;
        let doorSourceDir: string | undefined = doorName ? resolveDoorSourceDir(doorName) : undefined;

        if (!doorSourceDir) {
          const fallbackMatch = extractedFiles.find(f => f.match(/[/\\]Doors[/\\][^/\\]+[/\\]/i));
          if (fallbackMatch) {
            const rel = path.relative(tempDir, fallbackMatch);
            const match = rel.match(/Doors[/\\]([^/\\]+)/i);
            if (match) {
              doorName = match[1];
              doorSourceDir = resolveDoorSourceDir(doorName);
            }
          }
        }

        if (!doorName || !doorSourceDir || !fs.existsSync(doorSourceDir)) {
          console.log(`Warning: Could not find door directory for command ${commandName}`);
          continue;
        }

        // Copy door files
        const doorDestDir = path.join(this.assigns['Doors:'], doorName);
        amigafs.mkdirSync(doorDestDir, { recursive: true });
        console.log(`Installing door: ${doorName} → Doors/${doorName}/`);

        // Copy all door files
        if (fs.existsSync(doorSourceDir)) {
          console.log(`  Copying door files from ${doorSourceDir}`);
          this.copyRecursive(doorSourceDir, doorDestDir, { skipNames: copySkipNames });
        }

        // Install dependencies for TypeScript doors
        if (isTypeScriptInfo(metadata)) {
          const packageJsonPath = path.join(doorDestDir, 'package.json');
          if (amigafs.existsSync(packageJsonPath) && !installedTsDoors.has(doorDestDir)) {
            const installResult = this.installDoorDependencies(doorDestDir);
            if (!installResult.success) {
              dependencyWarnings.push(`${doorName}: ${installResult.message || 'npm install failed'}`);
            }
            installedTsDoors.add(doorDestDir);
          }
        }

        // Install Amiga library files (.library) to Libs/
        const libraryFiles = extractedFiles.filter(f => f.toLowerCase().endsWith('.library'));
        if (libraryFiles.length > 0) {
          const libsDir = this.assigns['Libs:'];
          amigafs.mkdirSync(libsDir, { recursive: true });

          console.log(`Installing ${libraryFiles.length} Amiga library file(s):`);
          for (const libraryFile of libraryFiles) {
            const libraryName = path.basename(libraryFile);
            const destPath = path.join(libsDir, libraryName);
            amigafs.copyFileSync(libraryFile, destPath);
            console.log(`  → Libs/${libraryName}`);
          }
        }

        // Re-parse installed door
        const installedDoor = this.parseInfoFile(infoDestPath);
        if (installedDoor) {
          const executableExists = amigafs.existsSync(installedDoor.resolvedPath || '');
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

      // Reload command cache so the new door(s) are immediately available
      // This ensures installed doors take priority over internal commands
      console.log('[installDoor] Reloading command cache to pick up new door(s)...');
      console.log('[installDoor] BBS root path:', this.bbsRoot);
      loadCommands(this.bbsRoot, 1, 0); // Conference 1, Node 0
      console.log('[installDoor] Command cache reloaded - door(s) now available');

      const baseMessage = `Installed ${installedCount} door command(s)`;
      const message = dependencyWarnings.length > 0
        ? `${baseMessage}\nDependency install issues:\n- ${dependencyWarnings.join('\n- ')}`
        : baseMessage;

      return {
        success: true,
        message,
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
  private copyRecursive(
    src: string,
    dest: string,
    options?: { skipNames?: Set<string> }
  ): void {
    const skipNames = options?.skipNames ?? new Set<string>();
    amigafs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (skipNames.has(entry.name)) {
        continue;
      }
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyRecursive(srcPath, destPath, options);
      } else {
        amigafs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private installDoorDependencies(doorDir: string): { success: boolean; message?: string } {
    try {
      const packageJsonPath = path.join(doorDir, 'package.json');
      if (!amigafs.existsSync(packageJsonPath)) {
        return { success: true };
      }

      const nodeModulesPath = path.join(doorDir, 'node_modules');
      if (amigafs.existsSync(nodeModulesPath)) {
        return { success: true, message: 'Dependencies already present' };
      }

      const result = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
        cwd: doorDir,
        encoding: 'utf8',
        timeout: 120000,
      });

      if (result.error) {
        return { success: false, message: result.error.message };
      }

      if (result.status !== 0) {
        const output = (result.stderr || result.stdout || '').toString().trim();
        return { success: false, message: output || `npm install exited with code ${result.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Calculate total size of a directory (for TypeScript doors)
   */
  private calculateDirectorySize(dirPath: string): number {
    let totalSize = 0;
    try {
      const files = amigafs.readdirSync(dirPath);
      for (const file of files) {
        // Skip node_modules and .git to avoid huge sizes
        if (file === 'node_modules' || file === '.git') continue;
        const filePath = path.join(dirPath, file);
        try {
          const stats = amigafs.statSync(filePath);
          if (stats.isDirectory()) {
            totalSize += this.calculateDirectorySize(filePath);
          } else {
            totalSize += stats.size;
          }
        } catch {
          // Ignore individual file errors
        }
      }
    } catch {
      // Ignore directory read errors
    }
    return totalSize;
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
      if (!amigafs.existsSync(infoPath)) {
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
      amigafs.unlinkSync(infoPath);
      console.log(`Deleted command file: ${infoPath}`);

      // Delete door directory if it exists
      if (amigafs.existsSync(doorPath)) {
        amigafs.rmSync(doorPath, { recursive: true, force: true });
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
   * Delete TypeScript door (removes door directory AND .info files)
   * @param doorName - The door name (directory name in Doors/)
   * @returns Result object with success status and message
   */
  async deleteTypeScriptDoor(doorName: string): Promise<{ success: boolean; message: string }> {
    try {
      const doorPath = path.join(this.bbsRoot, 'Doors', doorName);
      const commandsPath = path.join(this.bbsRoot, 'Commands', 'BBSCmd');
      const deletedFiles: string[] = [];

      // Check if door exists
      if (!amigafs.existsSync(doorPath)) {
        return {
          success: false,
          message: `TypeScript door '${doorName}' not found`
        };
      }

      // Verify it's a directory
      const stats = amigafs.statSync(doorPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          message: `'${doorName}' is not a valid door directory`
        };
      }

      // Try to get the command name from package.json or door's .info file
      let commandName: string | null = null;

      // Check package.json for bbsCommand
      const pkgPath = path.join(doorPath, 'package.json');
      if (amigafs.existsSync(pkgPath)) {
        try {
          const pkgContent = amigafs.readFileSync(pkgPath, 'utf8') as string;
          const pkg = JSON.parse(pkgContent);
          if (pkg.bbsCommand) {
            commandName = pkg.bbsCommand.toUpperCase();
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Check door's own .info file for CMDNAME
      const doorInfoPath = path.join(doorPath, `${doorName}.info`);
      if (!commandName && amigafs.existsSync(doorInfoPath)) {
        try {
          const infoContent = amigafs.readFileSync(doorInfoPath, 'utf8') as string;
          const cmdMatch = infoContent.match(/^CMDNAME=(.+)$/mi);
          if (cmdMatch) {
            commandName = cmdMatch[1].trim().toUpperCase();
          }
        } catch (e) {
          // Ignore read errors
        }
      }

      // Fallback to doorName as command
      if (!commandName) {
        commandName = doorName.toUpperCase();
      }

      // Delete .info file from Commands/BBSCmd/ (case-insensitive search)
      if (amigafs.existsSync(commandsPath)) {
        try {
          const files = amigafs.readdirSync(commandsPath);
          for (const file of files) {
            const lowerFile = file.toLowerCase();
            const lowerCmd = commandName.toLowerCase();
            if (lowerFile === `${lowerCmd}.info`) {
              const infoPath = path.join(commandsPath, file);
              amigafs.unlinkSync(infoPath);
              deletedFiles.push(infoPath);
              console.log(`Deleted command file: ${infoPath}`);
            }
          }
        } catch (e) {
          console.warn(`Could not clean up Commands/BBSCmd: ${(e as Error).message}`);
        }
      }

      // Also check SysCmd
      const sysCmdPath = path.join(this.bbsRoot, 'Commands', 'SysCmd');
      if (amigafs.existsSync(sysCmdPath)) {
        try {
          const files = amigafs.readdirSync(sysCmdPath);
          for (const file of files) {
            const lowerFile = file.toLowerCase();
            const lowerCmd = commandName.toLowerCase();
            if (lowerFile === `${lowerCmd}.info`) {
              const infoPath = path.join(sysCmdPath, file);
              amigafs.unlinkSync(infoPath);
              deletedFiles.push(infoPath);
              console.log(`Deleted command file: ${infoPath}`);
            }
          }
        } catch (e) {
          console.warn(`Could not clean up Commands/SysCmd: ${(e as Error).message}`);
        }
      }

      // Delete door directory
      amigafs.rmSync(doorPath, { recursive: true, force: true });
      deletedFiles.push(doorPath);
      console.log(`Deleted TypeScript door: ${doorPath}`);

      return {
        success: true,
        message: `Door '${doorName}' deleted successfully (${deletedFiles.length} items removed)`
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

    if (amigafs.existsSync(infoPath)) {
      return this.deleteAmigaDoor(identifier);
    }

    // Try TypeScript door
    const tsPath = path.join(this.bbsRoot, 'Doors', identifier);
    if (amigafs.existsSync(tsPath)) {
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
    // Directory structure mirrors classic AmiExpress layout
    // The data directory contains Doors/, Commands/, and other legacy directories
    // Use config's dataDir to support persistent disk storage
    const root = bbsRoot || config.get('dataDir');
    managerInstance = new AmigaDoorManager(root);
  }
  return managerInstance;
}

/**
 * Initialize door cache at BBS startup
 * Call this from server initialization to pre-populate the door cache
 */
export async function initializeDoorCache(): Promise<void> {
  const manager = getAmigaDoorManager();
  await manager.populateCache();
}

/**
 * Refresh door cache (call after installing/uninstalling doors)
 */
export async function refreshDoorCache(): Promise<void> {
  const manager = getAmigaDoorManager();
  await manager.refreshCache();
}
