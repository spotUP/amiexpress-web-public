/**
 * BBS Path Utilities - Centralized Path Management
 *
 * Consolidates all duplicate path construction logic for AmiExpress BBS directory structure.
 * This eliminates 80-120 lines of duplicate path.join() calls across the codebase.
 *
 * AmiExpress directory layout (from express.e):
 *
 *   Screens/              - Display screens (MENU.TXT, LOGON.TXT, etc.)
 *   Commands/             - Command definitions
 *     BBSCmd/             - BBS commands (door .info files)
 *     SysCmd/             - System commands
 *   Conf1/                - Conference 1 (General)
 *     Bulletins/          - Conference bulletins
 *     Files/              - Conference file areas
 *     Messages/           - Conference messages
 *   Conf2/                - Conference 2
 *   ...
 * Doors/                  - External door programs
 *   DoorName/             - Individual door directory
 * Node0/                  - Node 0 working directory
 *   Screens/              - Node-specific screens
 *   Playpen/              - Temporary upload area
 *   WorkDir/              - Working directory for file processing
 * Node1/                  - Node 1 (multinode systems)
 * Node2/                  - Node 2
 * ...
 * S/                      - System files (Count.dat, etc.)
 */

import * as path from 'path';

/**
 * BBSPaths - Centralized path manager for AmiExpress directory structure
 *
 * Usage:
 *   const paths = new BBSPaths('/path/to/bbs');
 *   const menu = paths.screen('MENU.TXT');
 *   const conf01 = paths.conference(1);
 *   const node0 = paths.node(0).playpen();
 */
export class BBSPaths {
  constructor(private bbsRoot: string) {}

  /**
   * Get base directory
   */
  root(): string {
    return this.bbsRoot;
  }

  /**
   * Get base directory
   */
  bbs(): string {
    return this.root();
  }

  /**
   * Get Screens/ directory or specific screen file
   * @param filename Optional screen filename (e.g., 'MENU.TXT', 'LOGON.TXT')
   */
  screen(filename?: string): string {
    const screensDir = path.join(this.root(), 'Screens');
    return filename ? path.join(screensDir, filename) : screensDir;
  }

  /**
   * Get Commands/ directory or specific subdirectory
   * @param subdir Optional subdirectory ('BBSCmd', 'SysCmd')
   */
  commands(subdir?: string): string {
    const commandsDir = path.join(this.root(), 'Commands');
    return subdir ? path.join(commandsDir, subdir) : commandsDir;
  }

  /**
   * Get Commands/BBSCmd/ directory (door command definitions)
   */
  bbsCommands(): string {
    return this.commands('BBSCmd');
  }

  /**
   * Get Commands/SysCmd/ directory (system command definitions)
   */
  sysCommands(): string {
    return this.commands('SysCmd');
  }

  /**
   * Get conference directory (Conf#/)
   * @param confNum Conference number (1-99)
   * @returns Path to conference directory
   */
  conference(confNum: number): string {
    const confName = `Conf${confNum}`;
    return path.join(this.root(), confName);
  }

  /**
   * Get conference bulletins directory (Conf##/Bulletins/)
   * @param confNum Conference number
   */
  conferenceBulletins(confNum: number): string {
    return path.join(this.conference(confNum), 'Bulletins');
  }

  /**
   * Get conference files directory (Conf##/Files/)
   * @param confNum Conference number
   */
  conferenceFiles(confNum: number): string {
    return path.join(this.conference(confNum), 'Files');
  }

  /**
   * Get conference messages directory (Conf##/Messages/)
   * @param confNum Conference number
   */
  conferenceMessages(confNum: number): string {
    return path.join(this.conference(confNum), 'Messages');
  }

  /**
   * Get Doors/ directory or specific door subdirectory
   * @param doorName Optional door name (e.g., 'AquaDoor', 'WhatIs')
   */
  doors(doorName?: string): string {
    const doorsDir = path.join(this.root(), 'Doors');
    return doorName ? path.join(doorsDir, doorName) : doorsDir;
  }

  /**
   * Get Node#/ directory builder
   * @param nodeNum Node number (0-99)
   * @returns NodePaths builder for node-specific paths
   */
  node(nodeNum: number): NodePaths {
    return new NodePaths(this.bbsRoot, nodeNum);
  }

  /**
   * Get S/ directory (system files)
   * @param filename Optional system filename (e.g., 'Count.dat')
   */
  system(filename?: string): string {
    const systemDir = path.join(this.bbsRoot, 'S');
    return filename ? path.join(systemDir, filename) : systemDir;
  }

  /**
   * Convert Amiga-style assign path to absolute path
   * Handles: NODE0:, NODE1:, DOORS:, BBS:, PROGDIR:
   *
   * @param amigaPath Amiga-style path (e.g., 'NODE0:Playpen/file.zip')
   * @param nodeNum Current node number (for PROGDIR: resolution)
   * @param doorName Current door name (for PROGDIR: resolution)
   * @returns Absolute filesystem path
   */
  resolveAmigaPath(amigaPath: string, nodeNum?: number, doorName?: string): string {
    // NODE#: assigns
    const nodeMatch = amigaPath.match(/^NODE(\d+):(.*)$/i);
    if (nodeMatch) {
      const num = parseInt(nodeMatch[1], 10);
      const subpath = nodeMatch[2].replace(/\//g, path.sep);
      return path.join(this.node(num).root(), subpath);
    }

    // DOORS: assign
    const doorsMatch = amigaPath.match(/^DOORS:(.*)$/i);
    if (doorsMatch) {
      const subpath = doorsMatch[1].replace(/\//g, path.sep);
      return path.join(this.doors(), subpath);
    }

    // BBS: assign
    const bbsMatch = amigaPath.match(/^BBS:(.*)$/i);
    if (bbsMatch) {
      const subpath = bbsMatch[1].replace(/\//g, path.sep);
      return path.join(this.bbs(), subpath);
    }

    // PROGDIR: assign (door's own directory)
    const progMatch = amigaPath.match(/^PROGDIR:(.*)$/i);
    if (progMatch && doorName) {
      const subpath = progMatch[1].replace(/\//g, path.sep);
      return path.join(this.doors(doorName), subpath);
    }

    // S: assign (system directory)
    const sysMatch = amigaPath.match(/^S:(.*)$/i);
    if (sysMatch) {
      const subpath = sysMatch[1].replace(/\//g, path.sep);
      return path.join(this.system(), subpath);
    }

    // RAM: assign (RAM disk - temp directory)
    const ramMatch = amigaPath.match(/^RAM:(.*)$/i);
    if (ramMatch) {
      const subpath = ramMatch[1].replace(/\//g, path.sep);
      return path.join(process.env.RAM_DIR || '/tmp/ram', subpath);
    }

    // T: assign (temp directory - usually RAM:T)
    const tempMatch = amigaPath.match(/^T:(.*)$/i);
    if (tempMatch) {
      const subpath = tempMatch[1].replace(/\//g, path.sep);
      return path.join(process.env.RAM_DIR || '/tmp/ram', 'T', subpath);
    }

    // WORK: assign (BBS root directory)
    const workMatch = amigaPath.match(/^WORK:(.*)$/i);
    if (workMatch) {
      const subpath = workMatch[1].replace(/\//g, path.sep);
      return path.join(this.root(), subpath);
    }

    // No assign - return as-is (relative or absolute)
    return amigaPath;
  }

  /**
   * Create all standard BBS directories if they don't exist
   * Used during BBS initialization
   */
  async ensureDirectories(): Promise<void> {
    const fs = require('fs/promises');

    const dirs = [
      this.bbs(),
      this.screen(),
      this.bbsCommands(),
      this.sysCommands(),
      this.conference(1), // Default conference
      this.conferenceBulletins(1),
      this.conferenceFiles(1),
      this.conferenceMessages(1),
      this.doors(),
      this.node(0).root(),
      this.node(0).screens(),
      this.node(0).playpen(),
      this.node(0).workDir(),
      this.system(),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

/**
 * NodePaths - Builder for node-specific paths
 *
 * Usage:
 *   const node0 = paths.node(0);
 *   const playpen = node0.playpen();
 *   const workdir = node0.workDir();
 */
export class NodePaths {
  constructor(
    private bbsRoot: string,
    private nodeNum: number
  ) {}

  /**
   * Get Node#/ directory
   */
  root(): string {
    return path.join(this.bbsRoot, `Node${this.nodeNum}`);
  }

  /**
   * Get Node#/Screens/ directory or specific screen file
   * @param filename Optional screen filename
   */
  screens(filename?: string): string {
    const screensDir = path.join(this.root(), 'Screens');
    return filename ? path.join(screensDir, filename) : screensDir;
  }

  /**
   * Get Node#/Playpen/ directory (upload staging area)
   * Falls back to ramPen if provided (express.e behavior)
   *
   * @param ramPen Optional RAM disk path (express.e ramPen variable)
   */
  playpen(ramPen?: string): string {
    if (ramPen && ramPen.length > 0) {
      return ramPen;
    }
    return path.join(this.root(), 'Playpen');
  }

  /**
   * Get Node#/WorkDir/ directory (temp file processing)
   */
  workDir(): string {
    return path.join(this.root(), 'WorkDir');
  }

  /**
   * Create all node directories if they don't exist
   */
  async ensureDirectories(): Promise<void> {
    const fs = require('fs/promises');

    const dirs = [
      this.root(),
      this.screens(),
      this.playpen(),
      this.workDir(),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

/**
 * Legacy compatibility exports - match file-diz.util.ts API
 * These are maintained for backward compatibility with existing code.
 */

export function getNodeWorkDir(nodeNumber: number, bbsDataPath: string): string {
  const paths = new BBSPaths(bbsDataPath);
  return paths.node(nodeNumber).workDir();
}

export function getPlaypenDir(nodeNumber: number, bbsDataPath: string, ramPen?: string): string {
  const paths = new BBSPaths(bbsDataPath);
  return paths.node(nodeNumber).playpen(ramPen);
}

/**
 * Create BBSPaths instance from config
 * Common pattern used throughout the codebase
 */
export function createBBSPaths(config: any): BBSPaths {
  const dataDir = typeof config.get === 'function' ? config.get('dataDir') : config.dataDir;
  return new BBSPaths(dataDir);
}

/**
 * Get standard Amiga assign paths for a node
 * Used by door execution and AmigaDOS emulation
 *
 * @param bbsRoot BBS root directory
 * @param nodeNum Node number
 * @param doorName Optional current door name (for PROGDIR:)
 * @returns Map of assign names to absolute paths
 */
export function getAmigaAssignPaths(
  bbsRoot: string,
  nodeNum: number,
  doorName?: string
): Record<string, string> {
  const paths = new BBSPaths(bbsRoot);

  const assigns: Record<string, string> = {
    [`NODE${nodeNum}:`]: paths.node(nodeNum).root(),
    'DOORS:': paths.doors(),
    'BBS:': paths.bbs(),
    'S:': paths.system(),
  };

  // Add PROGDIR: if door name provided
  if (doorName) {
    assigns['PROGDIR:'] = paths.doors(doorName);
  }

  // Add all node assigns (NODE0: through NODE9:)
  for (let i = 0; i <= 9; i++) {
    assigns[`NODE${i}:`] = paths.node(i).root();
  }

  return assigns;
}
