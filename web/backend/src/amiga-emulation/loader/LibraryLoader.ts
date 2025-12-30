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
  baseAddress: number;
  jumpTable: Map<number, number>;  // offset -> address
  codeSegments: Array<{ address: number; size: number }>;
  dataSegments: Array<{ address: number; size: number }>;
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

      // Create library structure
      const library: LoadedLibrary = {
        name: libraryName,
        version: minVersion, // TODO: Parse from library header
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
