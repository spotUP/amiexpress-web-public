import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { HunkLoader } from './HunkLoader';
import { KickstartRom } from '../KickstartRom';
import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';

/**
 * Amiga Library File Loader
 *
 * Loads real Amiga shared library files (.library) and installs them into memory.
 * Supports hybrid approach: tries to load real libraries, falls back to stubs.
 */

export interface LibraryJumpTable {
  offset: number;      // Negative offset from base (e.g., -30, -36)
  address: number;     // Absolute address of function in memory
}

export interface LoadedLibrary {
  name: string;
  version: number;
  revision: number;
  baseAddress: number;
  jumpTable: Map<number, number>;  // offset -> address
  codeSegments: Array<{ address: number; size: number }>;
  dataSegments: Array<{ address: number; size: number }>;
}

/**
 * Parsed Amiga version string information
 * Format: \0$VER: programname version.revision (dd.mm.yyyy) comment\0
 *
 * Per Amiga Style Guide:
 * - version and revision are separate integers (NOT a decimal)
 * - The dot separates them: 1.36 is higher than 1.4
 * - Date is dd.mm.yyyy in parentheses
 * - Program name cannot contain spaces
 */
export interface AmigaVersionInfo {
  programName: string;
  version: number;
  revision: number;
  date?: {
    day: number;
    month: number;
    year: number;
  };
  comment?: string;
  rawString: string;
}

export class LibraryLoader {
  private emulator: MoiraEmulator;
  private hunkLoader: HunkLoader;
  private kickstartRom: KickstartRom | null;
  private librarySearchPaths: string[];
  // Place real libraries safely within 24-bit address space but above door code.
  // Door code lives below ~0x200000; use 0x00200000 and step downward to avoid collisions.
  private nextLibraryBase: number = 0x00200000;
  private loadedLibraries = new Map<string, LoadedLibrary>();

  // Libraries that are ROM-resident in Kickstart 3.1
  private readonly ROM_LIBRARIES = new Set([
    'exec.library',
    'dos.library',
    'intuition.library',
    'graphics.library',
    'layers.library',
    'icon.library',
    'mathieeedoubbas.library',
    'mathieeedoubtrans.library',
    'mathieeesingbas.library',
    'mathieeesingtrans.library',
    'mathffp.library',
    'mathtrans.library',
    'utility.library',
    'expansion.library',
    'gadtools.library',
    'keymap.library',
    'console.library',
    'diskfont.library',
    'iffparse.library',
    'commodities.library',
  ]);

  constructor(emulator: MoiraEmulator, searchPaths?: string[], kickstartRom?: KickstartRom | null) {
    this.emulator = emulator;
    this.hunkLoader = new HunkLoader();
    this.kickstartRom = kickstartRom || null;

    // Default search paths for Amiga libraries
    this.librarySearchPaths = searchPaths || [
      path.join(__dirname, '../../../amiga-libs'),  // Local libs directory
      path.join(__dirname, '../../../LIBS'),         // Amiga-style LIBS:
      '/usr/local/amiga/libs',                       // System-wide location
    ];
  }

  /**
   * Add a directory to library search path
   */
  addSearchPath(searchPath: string): void {
    const existingIndex = this.librarySearchPaths.indexOf(searchPath);
    if (existingIndex !== -1) {
      this.librarySearchPaths.splice(existingIndex, 1);
    }
    this.librarySearchPaths.unshift(searchPath);
console.log(`[LibraryLoader] Added search path: ${searchPath}`);
  }

  /**
   * Find a library file in search paths
   */
  private findLibraryFile(libraryName: string): string | null {
    for (const searchPath of this.librarySearchPaths) {
      const libraryPath = path.join(searchPath, libraryName);

      if (amigafs.existsSync(libraryPath)) {
console.log(`[LibraryLoader] Found library: ${libraryPath}`);
        return libraryPath;
      }
    }

console.log(`[LibraryLoader] Library file not found: ${libraryName}`);
    return null;
  }

  /**
   * Check if library is already loaded
   */
  isLoaded(libraryName: string): boolean {
    return this.loadedLibraries.has(libraryName);
  }

  /**
   * Get loaded library info
   */
  getLoadedLibrary(libraryName: string): LoadedLibrary | null {
    return this.loadedLibraries.get(libraryName) || null;
  }

  /**
   * Load a library from file (synchronous)
   * Returns library base address or null if failed
   */
  loadLibrary(libraryName: string, minVersion: number = 0): LoadedLibrary | null {
    try {
console.log(`[LibraryLoader] Loading ${libraryName} (version >= ${minVersion})`);

      // Check if already loaded
      if (this.loadedLibraries.has(libraryName)) {
console.log(`[LibraryLoader] Library already loaded: ${libraryName}`);
        return this.loadedLibraries.get(libraryName)!;
      }

      // CRITICAL: Check if library is ROM-resident (like a real Amiga!)
      if (this.ROM_LIBRARIES.has(libraryName)) {
        if (this.kickstartRom) {
console.log(`[LibraryLoader] ✅ ${libraryName} is ROM-resident (using Kickstart ROM)`);
console.log(`[LibraryLoader]   ROM libraries are native code in ROM, not loaded from disk`);
          // Return null to indicate library should use ROM/trap hybrid approach
          // The actual library implementation is already in the ROM or uses our traps
          return null;
        } else {
console.log(`[LibraryLoader] ⚠️  ${libraryName} should be in ROM, but no ROM loaded - will try disk`);
        }
      }

      // Find library file on disk (for non-ROM libraries like AEDoor.library)
      const libraryPath = this.findLibraryFile(libraryName);
      if (!libraryPath) {
        return null;
      }

      // Read library file
      const libraryData = amigafs.readFileSync(libraryPath) as Buffer;
console.log(`[LibraryLoader] Read ${libraryData.length} bytes from ${libraryPath}`);

      // Parse as Hunk file
      const hunkFile = this.hunkLoader.parse(Buffer.from(libraryData));
console.log(`[LibraryLoader] Parsed ${hunkFile.segments.length} segments`);

      // Allocate base address for this library
      const baseAddress = this.allocateLibraryBase();
console.log(`[LibraryLoader] Allocated base address: 0x${baseAddress.toString(16)}`);

      // Load segments into memory
      // Note: We need to load at the base address, not at segment addresses
      const codeSegments: Array<{ address: number; size: number }> = [];
      const dataSegments: Array<{ address: number; size: number }> = [];

      let currentAddress = baseAddress;

      for (const segment of hunkFile.segments) {
console.log(`[LibraryLoader] Loading ${segment.type} segment (${segment.size} bytes) at 0x${currentAddress.toString(16)}`);

        // Copy segment data to memory
        for (let i = 0; i < segment.data.length; i++) {
          this.emulator.writeMemory(currentAddress + i, segment.data[i]);
        }

        if (segment.type === 'code') {
          codeSegments.push({ address: currentAddress, size: segment.size });
        } else if (segment.type === 'data') {
          dataSegments.push({ address: currentAddress, size: segment.size });
        }

        currentAddress += segment.size;
        // Align to 4-byte boundary
        currentAddress = (currentAddress + 3) & ~3;
      }

      // Apply relocations
      this.applyRelocations(hunkFile, baseAddress);

      // Store ExecBase pointer at library+0x22 for native code that uses it
      // Native AEDoor.library code does: movea.l 0x22(a6), a6 to load ExecBase
      // then calls Exec functions via jsr -$16e(a6) (PutMsg) etc.
      const EXECBASE_OFFSET = 0x22;  // 34 decimal
      const execBase = 0x80000;  // ExecBase address in our memory map
      this.emulator.writeMemory32(baseAddress + EXECBASE_OFFSET, execBase);
console.log(`[LibraryLoader] Stored ExecBase (0x${execBase.toString(16)}) at library+0x${EXECBASE_OFFSET.toString(16)}`);

      // Parse jump table from first code segment
      const jumpTable = this.parseJumpTable(baseAddress, codeSegments[0]);

      // Parse version from $VER string in library data
      // Format: \0$VER: programname version.revision (dd.mm.yyyy) comment\0
      const versionInfo = this.parseVersionString(libraryData);
      let version = minVersion;
      let revision = 0;
      if (versionInfo) {
        version = versionInfo.version;
        revision = versionInfo.revision;
        const dateStr = versionInfo.date
          ? `(${versionInfo.date.day}.${versionInfo.date.month}.${versionInfo.date.year})`
          : '';
console.log(`[LibraryLoader] Parsed $VER: ${versionInfo.programName} ${version}.${revision} ${dateStr}`);
        if (versionInfo.comment) {
console.log(`[LibraryLoader]   Comment: ${versionInfo.comment}`);
        }
      }

      // Create library structure
      const library: LoadedLibrary = {
        name: libraryName,
        version,
        revision,
        baseAddress,
        jumpTable,
        codeSegments,
        dataSegments
      };

      this.loadedLibraries.set(libraryName, library);
console.log(`✅ [LibraryLoader] Successfully loaded ${libraryName} at 0x${baseAddress.toString(16)}`);
console.log(`   Jump table entries: ${jumpTable.size}`);

      return library;

    } catch (error) {
console.error(`❌ [LibraryLoader] Failed to load ${libraryName}:`, error);
      return null;
    }
  }

  /**
   * Allocate a base address for a new library
   * Libraries are placed high in 24-bit address space
   */
  private allocateLibraryBase(): number {
    const base = this.nextLibraryBase;
    this.nextLibraryBase -= 0x10000; // Space libraries 64KB apart
    return base;
  }

  /**
   * Apply relocations from Hunk file
   */
  private applyRelocations(hunkFile: any, baseAddress: number): void {
    if (!hunkFile.relocations || hunkFile.relocations.size === 0) {
      return;
    }

console.log(`[LibraryLoader] Applying ${hunkFile.relocations.size} relocation groups`);

    for (const [segmentIndex, relocs] of hunkFile.relocations.entries()) {
      const segment = hunkFile.segments[segmentIndex];

      for (const reloc of relocs) {
        const targetSegment = hunkFile.segments[reloc.targetSegment];
        const relocAddress = baseAddress + reloc.offset;

        // Read current value (big-endian 32-bit)
        const byte0 = this.emulator.readMemory(relocAddress);
        const byte1 = this.emulator.readMemory(relocAddress + 1);
        const byte2 = this.emulator.readMemory(relocAddress + 2);
        const byte3 = this.emulator.readMemory(relocAddress + 3);
        const currentValue = (byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3;

        // Add base address
        const newValue = currentValue + baseAddress;

        // Write back (big-endian)
        this.emulator.writeMemory(relocAddress, (newValue >> 24) & 0xFF);
        this.emulator.writeMemory(relocAddress + 1, (newValue >> 16) & 0xFF);
        this.emulator.writeMemory(relocAddress + 2, (newValue >> 8) & 0xFF);
        this.emulator.writeMemory(relocAddress + 3, newValue & 0xFF);
      }
    }
  }

  /**
   * Parse jump table from library code
   *
   * Amiga libraries have a jump table with negative offsets:
   * - Offset -6 is typically Open function
   * - Offset -12 is Close
   * - Negative offsets continue downward
   *
   * Each entry is usually a JMP instruction (0x4EF9) followed by the target address
   */
  private parseJumpTable(baseAddress: number, codeSegment: { address: number; size: number }): Map<number, number> {
    const jumpTable = new Map<number, number>();

    // Jump table entries are at negative offsets from base
    // We'll scan backwards from base looking for JMP instructions

    // Standard library offsets (these are conventional)
    const standardOffsets = [
      -6, -12, -18, -24, -30, -36, -42, -48, -54, -60,
      -66, -72, -78, -84, -90, -96, -102, -108, -114, -120,
      -126, -132, -138, -144, -150, -156, -162, -168, -174, -180,
      -186, -192, -198, -204, -210, -216, -222, -228, -234, -240,
      -246, -252, -258, -264, -270, -276, -282, -288, -294, -300
    ];

    // For each standard offset, check if there's a JMP instruction
    for (const offset of standardOffsets) {
      const address = baseAddress + offset;

      // Check if this is in our loaded code
      if (address < codeSegment.address || address >= codeSegment.address + codeSegment.size) {
        continue;
      }

      // Read potential JMP instruction (0x4EF9 = JMP absolute.long)
      const byte0 = this.emulator.readMemory(address);
      const byte1 = this.emulator.readMemory(address + 1);
      const opcode = (byte0 << 8) | byte1;

      if (opcode === 0x4EF9) {
        // Read target address (next 4 bytes)
        const addr0 = this.emulator.readMemory(address + 2);
        const addr1 = this.emulator.readMemory(address + 3);
        const addr2 = this.emulator.readMemory(address + 4);
        const addr3 = this.emulator.readMemory(address + 5);
        const targetAddress = (addr0 << 24) | (addr1 << 16) | (addr2 << 8) | addr3;

        jumpTable.set(offset, targetAddress);
console.log(`[LibraryLoader] Jump table entry: offset ${offset} -> 0x${targetAddress.toString(16)}`);
      }
    }

    return jumpTable;
  }

  /**
   * Parse Amiga version string from binary data
   *
   * Amiga version string format (per Amiga Style Guide):
   *   \0$VER: programname version.revision (dd.mm.yyyy) comment\0
   *
   * Key rules:
   * - version and revision are separate integers (NOT decimal)
   * - The dot separates them: 1.36 is numerically higher than 1.4
   * - Date is dd.mm.yyyy enclosed in parentheses
   * - Program name cannot contain spaces (use underscores)
   * - Leading null byte before $VER helps version scanner locate string
   *
   * @see https://wiki.amigaos.net/wiki/Version_Strings
   */
  parseVersionString(data: Buffer): AmigaVersionInfo | null {
    // Search for "$VER:" marker in the binary
    // Can be preceded by null byte: \0$VER:
    const verMarker = Buffer.from('$VER:');
    let pos = data.indexOf(verMarker);

    if (pos === -1) {
      return null;
    }

    // Extract the raw string for logging (up to null terminator or reasonable length)
    let rawEnd = pos + 5;
    while (rawEnd < data.length && rawEnd < pos + 128 && data[rawEnd] !== 0) {
      rawEnd++;
    }
    const rawString = data.slice(pos, rawEnd).toString('ascii');

    // Skip past "$VER:" and any whitespace
    pos += 5;
    while (pos < data.length && (data[pos] === 0x20 || data[pos] === 0x09)) {
      pos++;
    }

    // Parse program name (until space - names cannot contain spaces)
    let programName = '';
    while (pos < data.length && data[pos] !== 0x20 && data[pos] !== 0x00) {
      programName += String.fromCharCode(data[pos]);
      pos++;
    }

    if (programName.length === 0) {
      return null;
    }

    // Skip whitespace before version number
    while (pos < data.length && data[pos] === 0x20) {
      pos++;
    }

    // Parse version number (integer before the dot)
    let versionStr = '';
    while (pos < data.length && data[pos] >= 0x30 && data[pos] <= 0x39) {
      versionStr += String.fromCharCode(data[pos]);
      pos++;
    }

    if (versionStr.length === 0) {
      return null;
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version)) {
      return null;
    }

    // Parse revision number (after the dot)
    let revision = 0;
    if (pos < data.length && data[pos] === 0x2e) { // '.'
      pos++; // Skip the dot
      let revisionStr = '';
      while (pos < data.length && data[pos] >= 0x30 && data[pos] <= 0x39) {
        revisionStr += String.fromCharCode(data[pos]);
        pos++;
      }
      if (revisionStr.length > 0) {
        revision = parseInt(revisionStr, 10);
        if (isNaN(revision)) {
          revision = 0;
        }
      }
    }

    // Skip whitespace before date
    while (pos < data.length && data[pos] === 0x20) {
      pos++;
    }

    // Parse date if present: (dd.mm.yyyy) or (dd.mm.yy) or (dd Mon yyyy)
    let date: { day: number; month: number; year: number } | undefined;
    if (pos < data.length && data[pos] === 0x28) { // '('
      pos++; // Skip opening paren
      let dateStr = '';
      while (pos < data.length && data[pos] !== 0x29 && data[pos] !== 0x00) {
        dateStr += String.fromCharCode(data[pos]);
        pos++;
      }
      if (pos < data.length && data[pos] === 0x29) {
        pos++; // Skip closing paren
      }

      // Try standard format first: dd.mm.yyyy or dd.mm.yy
      let dateMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10);
        let year = parseInt(dateMatch[3], 10);
        // Convert 2-digit year to 4-digit (pre-OS4 format)
        if (year < 100) {
          year = year >= 70 ? 1900 + year : 2000 + year;
        }
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          date = { day, month, year };
        }
      } else {
        // Try text month format: "dd Mon yyyy" or "dd-Mon-yy"
        const monthNames: { [key: string]: number } = {
          'jan': 1, 'january': 1,
          'feb': 2, 'february': 2,
          'mar': 3, 'march': 3,
          'apr': 4, 'april': 4,
          'may': 5,
          'jun': 6, 'june': 6,
          'jul': 7, 'july': 7,
          'aug': 8, 'august': 8,
          'sep': 9, 'sept': 9, 'september': 9,
          'oct': 10, 'october': 10,
          'nov': 11, 'november': 11,
          'dec': 12, 'december': 12
        };
        const textDateMatch = dateStr.match(/(\d{1,2})[\s\-]+([A-Za-z]+)[\s\-]+(\d{2,4})/);
        if (textDateMatch) {
          const day = parseInt(textDateMatch[1], 10);
          const monthStr = textDateMatch[2].toLowerCase();
          let year = parseInt(textDateMatch[3], 10);
          const month = monthNames[monthStr];
          if (year < 100) {
            year = year >= 70 ? 1900 + year : 2000 + year;
          }
          if (!isNaN(day) && month && !isNaN(year)) {
            date = { day, month, year };
          }
        }
      }
    }

    // Skip whitespace before comment
    while (pos < data.length && data[pos] === 0x20) {
      pos++;
    }

    // Parse optional comment (until null terminator)
    let comment: string | undefined;
    if (pos < data.length && data[pos] !== 0x00) {
      let commentStr = '';
      while (pos < data.length && data[pos] !== 0x00 && data[pos] !== 0x0d && data[pos] !== 0x0a) {
        commentStr += String.fromCharCode(data[pos]);
        pos++;
      }
      if (commentStr.trim().length > 0) {
        comment = commentStr.trim();
      }
    }

    return {
      programName,
      version,
      revision,
      date,
      comment,
      rawString
    };
  }

  /**
   * Legacy method for backward compatibility
   * Returns just the major version number
   */
  private parseVersionFromData(data: Buffer): number {
    const info = this.parseVersionString(data);
    return info ? info.version : 0;
  }

  /**
   * Get full version info from data
   * Returns version and revision as separate values
   */
  private parseFullVersionFromData(data: Buffer): { version: number; revision: number } {
    const info = this.parseVersionString(data);
    return info ? { version: info.version, revision: info.revision } : { version: 0, revision: 0 };
  }

  /**
   * Get function address for a library call
   * Returns null if function not found
   */
  getFunctionAddress(libraryName: string, offset: number): number | null {
    const library = this.loadedLibraries.get(libraryName);
    if (!library) {
      return null;
    }

    return library.jumpTable.get(offset) || null;
  }

  /**
   * Unload a library (if not in use)
   */
  unloadLibrary(libraryName: string): boolean {
    if (!this.loadedLibraries.has(libraryName)) {
      return false;
    }

    // TODO: Check reference count
    // For now, just remove from map (memory remains)
    this.loadedLibraries.delete(libraryName);
console.log(`[LibraryLoader] Unloaded library: ${libraryName}`);
    return true;
  }

  /**
   * Get list of loaded libraries
   */
  getLoadedLibraries(): string[] {
    return Array.from(this.loadedLibraries.keys());
  }
}
