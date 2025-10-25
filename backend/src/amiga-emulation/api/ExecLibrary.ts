import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import { LibraryLoader } from '../loader/LibraryLoader';

/**
 * exec.library - Amiga Executive Library
 * Provides core system functions: memory management, task management, library management
 *
 * Function offsets (negative values):
 * -198 = AllocMem
 * -204 = FreeMem
 * -408 = OpenLibrary
 * -414 = CloseLibrary
 */

interface MemoryBlock {
  address: number;
  size: number;
}

export class ExecLibrary {
  private emulator: MoiraEmulator;
  private allocatedMemory: Map<number, MemoryBlock> = new Map();
  private nextAllocAddress: number = 0x10000; // Start allocations at 64KB
  private openLibraries: Map<string, number> = new Map();
  private libraryLoader: LibraryLoader | null = null;
  private useNativeLibraries: boolean = false;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Set library loader for hybrid loading support
   */
  setLibraryLoader(libraryLoader: LibraryLoader, useNativeLibraries: boolean): void {
    this.libraryLoader = libraryLoader;
    this.useNativeLibraries = useNativeLibraries;
  }

  /**
   * AllocMem - Allocate memory
   * A1 = byte size
   * D0 = requirements (MEMF_* flags)
   * Returns: D0 = address (or 0 if failed)
   */
  AllocMem(): void {
    const size = this.emulator.getRegister(CPURegister.A1);
    const requirements = this.emulator.getRegister(CPURegister.D0);

    console.log(`[exec.library] AllocMem(size=${size}, requirements=0x${requirements.toString(16)})`);

    // Simple bump allocator
    const address = this.nextAllocAddress;
    this.nextAllocAddress += size + 16; // Add padding

    // Store allocation info
    this.allocatedMemory.set(address, { address, size });

    // Zero memory if MEMF_CLEAR flag is set (bit 16)
    if (requirements & 0x10000) {
      for (let i = 0; i < size; i++) {
        this.emulator.writeMemory(address + i, 0);
      }
    }

    // Return address in D0
    this.emulator.setRegister(CPURegister.D0, address);
    console.log(`[exec.library] AllocMem returned: 0x${address.toString(16)}`);
  }

  /**
   * FreeMem - Free allocated memory
   * A1 = memory address
   * D0 = byte size
   */
  FreeMem(): void {
    const address = this.emulator.getRegister(CPURegister.A1);
    const size = this.emulator.getRegister(CPURegister.D0);

    console.log(`[exec.library] FreeMem(address=0x${address.toString(16)}, size=${size})`);

    // Remove from allocation table
    this.allocatedMemory.delete(address);
  }

  /**
   * OpenLibrary - Open a system library (HYBRID MODE)
   * A1 = library name (pointer to string)
   * D0 = version
   * Returns: D0 = library base (or 0 if failed)
   *
   * Tries to load real library file first (if enabled),
   * falls back to stub library if loading fails or disabled.
   */
  OpenLibrary(): void {
    const namePtr = this.emulator.getRegister(CPURegister.A1);
    const version = this.emulator.getRegister(CPURegister.D0);

    // Read library name from memory
    const name = this.readString(namePtr);

    console.log(`📚 [exec.library] OpenLibrary(name="${name}", version=${version})`);

    let baseAddress = 0;

    // HYBRID APPROACH: Try native library first if enabled
    if (this.useNativeLibraries && this.libraryLoader) {
      console.log(`[exec.library] Attempting to load native library: ${name}`);

      try {
        const loadedLibrary = this.libraryLoader.loadLibrary(name, version);

        if (loadedLibrary) {
          baseAddress = loadedLibrary.baseAddress;
          this.openLibraries.set(name, baseAddress);
          console.log(`✅ [exec.library] Loaded NATIVE library at 0x${baseAddress.toString(16)}`);
          this.emulator.setRegister(CPURegister.D0, baseAddress);
          return;
        } else {
          console.log(`⚠️  [exec.library] Native library not found, falling back to stub`);
        }
      } catch (error) {
        console.warn(`⚠️  [exec.library] Error loading native library, falling back to stub:`, error);
      }
    }

    // FALLBACK: Use stub library bases
    const libraryBases: { [key: string]: number } = {
      'dos.library': 0xFFFF0000,
      'exec.library': 0xFFFF8000,
      'intuition.library': 0xFFFF1000,
      'graphics.library': 0xFFFF2000,
      'diskfont.library': 0xFFFF3000,
      'layers.library': 0xFFFF4000,
      'gadtools.library': 0xFFFF5000,
      'utility.library': 0xFFFF6000,
      'asl.library': 0xFFFF7000,
      'icon.library': 0xFFFF8000,      // Icon library (Workbench icons)
      // BBS door libraries
      'AEDoor.library': 0xFF4000,     // AmiExpress door library (custom BBS library)
      'aedoor.library': 0xFF4000,     // Case-insensitive alias
    };

    baseAddress = libraryBases[name] || 0;

    if (baseAddress) {
      this.openLibraries.set(name, baseAddress);
      console.log(`✅ [exec.library] OpenLibrary: Returning STUB base 0x${baseAddress.toString(16)}`);
    } else {
      console.warn(`⚠️  [exec.library] OpenLibrary: Unknown library "${name}" - returning NULL`);
      console.warn(`    Door may fail if this library is required!`);
      console.warn(`    Consider implementing stub for: ${name}`);
    }

    this.emulator.setRegister(CPURegister.D0, baseAddress);
  }

  /**
   * CloseLibrary - Close a system library
   * A1 = library base
   */
  CloseLibrary(): void {
    const base = this.emulator.getRegister(CPURegister.A1);
    console.log(`[exec.library] CloseLibrary(base=0x${base.toString(16)})`);

    // Find and remove library from open table
    for (const [name, addr] of this.openLibraries.entries()) {
      if (addr === base) {
        this.openLibraries.delete(name);
        console.log(`[exec.library] Closed library: ${name}`);
        break;
      }
    }
  }

  /**
   * Helper: Read null-terminated string from memory
   */
  private readString(address: number, maxLen: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = this.emulator.readMemory(address + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Handle library function call by offset
   */
  handleCall(offset: number): boolean {
    switch (offset) {
      case -198:
        this.AllocMem();
        return true;
      case -204:
        this.FreeMem();
        return true;
      case -408:
        this.OpenLibrary();
        return true;
      case -414:
        this.CloseLibrary();
        return true;
      default:
        return false; // Unknown function
    }
  }
}
