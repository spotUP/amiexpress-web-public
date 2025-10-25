import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import { ExecLibrary } from './ExecLibrary';
import { DosLibrary } from './DosLibrary';
import { IntuitionLibrary } from './IntuitionLibrary';
import { LibraryLoader } from '../loader/LibraryLoader';

/**
 * AmigaDOS Environment
 * Manages the complete AmigaDOS emulation including all system libraries
 * Supports HYBRID loading: real library files + JavaScript stubs
 */

export class AmigaDosEnvironment {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private dosLibrary: DosLibrary;
  private intuitionLibrary: IntuitionLibrary;
  private libraryLoader: LibraryLoader;
  private useNativeLibraries: boolean;

  // Magic address to offset mapping for direct JSR calls
  // These are used when doors JSR directly to addresses like 0xFFFFFFC4 without calling OpenLibrary
  private magicAddressMap: Map<number, number> = new Map([
    // dos.library functions (standard offsets)
    [-30, -30],   // Open
    [-36, -36],   // Close
    [-42, -42],   // Read
    [-48, -48],   // Write
    [-54, -54],   // Input
    [-60, -60],   // Output
    [-132, -132], // IoErr
    [-192, -192], // DateStamp
    [-198, -198], // Delay
    [-204, -204], // WaitForChar

    // Magic addresses (0xFFFF0000 base + offset)
    [0xFFFFFFC4, -60],  // Output (0xFFFF0000 - 60)
    [0xFFFFFFCA, -54],  // Input (0xFFFF0000 - 54)
    [0xFFFFFFD0, -48],  // Write (0xFFFF0000 - 48)
    [0xFFFFFFD6, -42],  // Read (0xFFFF0000 - 42)
    [0xFFFFFFDC, -36],  // Close (0xFFFF0000 - 36)
    [0xFFFFFFE2, -30],  // Open (0xFFFF0000 - 30)

    // Unsigned 32-bit representations
    [4294967236, -60],  // 0xFFFFFFC4 as unsigned
    [4294967242, -54],  // 0xFFFFFFCA as unsigned
    [4294967248, -48],  // 0xFFFFFFD0 as unsigned
    [4294967254, -42],  // 0xFFFFFFD6 as unsigned

    // CPU prefetch/instruction read offsets (offset + 2 bytes)
    // These occur when CPU reads next instruction word after RTS
    [-58, -60],   // Output +2 → Output
    [-56, -54],   // (unused)
    [-52, -54],   // Input +2 → Input
    [-50, -48],   // (unused)
    [-46, -48],   // Write +2 → Write
    [-44, -42],   // (unused)
    [-40, -42],   // Read +2 → Read
    [-38, -36],   // (unused)
    [-34, -30],   // Open +2 → Open

    // Edge cases discovered during testing
    [-2, -60],    // Sometimes calculations result in -2, map to Output as fallback
    [-4, -54],    // Potential Input mapping
  ]);

  constructor(emulator: MoiraEmulator, options?: { useNativeLibraries?: boolean; libraryPaths?: string[] }) {
    this.emulator = emulator;
    this.useNativeLibraries = options?.useNativeLibraries ?? false;

    // Initialize stub libraries
    this.execLibrary = new ExecLibrary(emulator);
    this.dosLibrary = new DosLibrary(emulator);
    this.intuitionLibrary = new IntuitionLibrary(emulator);

    // Initialize library loader for native libraries
    this.libraryLoader = new LibraryLoader(emulator, options?.libraryPaths);

    // Pass library loader to exec.library for OpenLibrary hybrid support
    this.execLibrary.setLibraryLoader(this.libraryLoader, this.useNativeLibraries);

    // Set up trap handler
    this.setupTrapHandler();

    console.log(`[AmigaDosEnvironment] Initialized (native libraries: ${this.useNativeLibraries ? 'enabled' : 'disabled'})`);
  }

  /**
   * Initialize the trap handler to intercept library calls
   */
  private setupTrapHandler(): void {
    // The trap handler will be called when a JSR to negative address is detected
    this.emulator.setTrapHandler((offset: number) => {
      this.handleLibraryCall(offset);
    });
  }

  /**
   * Handle a library call by routing to the appropriate library
   * This is called for STUB libraries only (when native code isn't available)
   */
  private handleLibraryCall(offset: number): void {
    console.log(`[AmigaDOS] Stub library call: offset=${offset} (0x${offset.toString(16)})`);

    // Get the library base from A6 register (standard Amiga convention)
    const libraryBase = this.emulator.getRegister(CPURegister.A6);
    console.log(`[AmigaDOS] Library base in A6: 0x${libraryBase.toString(16)}`);

    // Normalize offset using magic address mapping
    // This handles direct JSR calls to magic addresses like 0xFFFFFFC4
    let normalizedOffset = offset;
    if (this.magicAddressMap.has(offset)) {
      normalizedOffset = this.magicAddressMap.get(offset)!;
      if (normalizedOffset !== offset) {
        console.log(`[AmigaDOS] Mapped magic address 0x${offset.toString(16)} to offset ${normalizedOffset}`);
      }
    }

    // Route to appropriate library based on base address or offset ranges
    let handled = false;

    // Try exec.library functions
    if (!handled) {
      handled = this.execLibrary.handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by exec.library stub`);
      }
    }

    // Try dos.library functions
    if (!handled) {
      handled = this.dosLibrary.handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by dos.library stub`);
      }
    }

    // Try intuition.library functions
    if (!handled) {
      handled = this.intuitionLibrary.handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by intuition.library stub`);
      }
    }

    if (!handled) {
      console.warn(`[AmigaDOS] Unknown library call: offset=${offset} (normalized: ${normalizedOffset}), base=0x${libraryBase.toString(16)}`);
      console.warn(`[AmigaDOS] This function is not yet implemented - door may fail`);
    }

    // Note: We don't need to modify PC here!
    // The JSR will execute normally, jump to the library address,
    // then read16() will return an RTS instruction which returns execution.
  }

  /**
   * Set callback for stdout/stderr output
   */
  setOutputCallback(callback: (data: string) => void): void {
    this.dosLibrary.setOutputCallback(callback);
  }

  /**
   * Queue input data from user
   */
  queueInput(data: string): void {
    this.dosLibrary.queueInput(data);
  }

  /**
   * Get exec.library instance
   */
  getExecLibrary(): ExecLibrary {
    return this.execLibrary;
  }

  /**
   * Get dos.library instance
   */
  getDosLibrary(): DosLibrary {
    return this.dosLibrary;
  }

  /**
   * Get library loader instance
   */
  getLibraryLoader(): LibraryLoader {
    return this.libraryLoader;
  }

  /**
   * Check if native libraries are enabled
   */
  isUsingNativeLibraries(): boolean {
    return this.useNativeLibraries;
  }
}
