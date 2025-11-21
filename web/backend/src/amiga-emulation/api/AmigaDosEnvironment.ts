import { MoiraEmulator, CPURegister } from "../cpu/MoiraEmulator";
import { ExecLibrary } from "./ExecLibrary";
import { DosLibrary } from "./DosLibrary";
import { IntuitionLibrary } from "./IntuitionLibrary";
import { AmiExpressLibrary } from "./AmiExpressLibrary";
import { IconLibrary } from "./IconLibrary";
import { LibraryLoader } from "../loader/LibraryLoader";
import * as path from "path";

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
  private amiexpressLibrary: AmiExpressLibrary;
  private iconLibrary: IconLibrary;
  private libraryLoader: LibraryLoader;
  private useNativeLibraries: boolean;

  // Magic address to offset mapping for direct JSR calls
  // These are used when doors JSR directly to addresses like 0xFFFFFFC4 without calling OpenLibrary
  private magicAddressMap: Map<number, number> = new Map([
    // dos.library functions (standard offsets)
    [-30, -30], // Open
    [-36, -36], // Close
    [-42, -42], // Read
    [-48, -48], // Write
    [-54, -54], // Input
    [-60, -60], // Output
    [-132, -132], // IoErr
    [-192, -192], // DateStamp
    [-198, -198], // Delay
    [-204, -204], // WaitForChar

    // Magic addresses (0xFFFF0000 base + offset)
    [0xffffffc4, -60], // Output (0xFFFF0000 - 60)
    [0xffffffca, -54], // Input (0xFFFF0000 - 54)
    [0xffffffd0, -48], // Write (0xFFFF0000 - 48)
    [0xffffffd6, -42], // Read (0xFFFF0000 - 42)
    [0xffffffdc, -36], // Close (0xFFFF0000 - 36)
    [0xffffffe2, -30], // Open (0xFFFF0000 - 30)

    // Unsigned 32-bit representations
    [4294967236, -60], // 0xFFFFFFC4 as unsigned
    [4294967242, -54], // 0xFFFFFFCA as unsigned
    [4294967248, -48], // 0xFFFFFFD0 as unsigned
    [4294967254, -42], // 0xFFFFFFD6 as unsigned

    // CPU prefetch/instruction read offsets (offset + 2 bytes)
    // These occur when CPU reads next instruction word after RTS
    [-58, -60], // Output +2 → Output
    [-56, -54], // (unused)
    [-52, -54], // Input +2 → Input
    [-50, -48], // (unused)
    [-46, -48], // Write +2 → Write
    [-44, -42], // (unused)
    [-40, -42], // Read +2 → Read
    [-38, -36], // (unused)
    [-34, -30], // Open +2 → Open

    // Edge cases discovered during testing
    [-2, -60], // Sometimes calculations result in -2, map to Output as fallback
    [-4, -54], // Potential Input mapping
  ]);

  constructor(
    emulator: MoiraEmulator,
    optionsOrSession?:
      | {
          useNativeLibraries?: boolean;
          libraryPaths?: string[];
          user?: any;
          node?: number;
        }
      | any
  ) {
    this.emulator = emulator;

    // Handle both old-style options and new session data
    const options = optionsOrSession;
    // ✅ FIXED: Enable real library loading by default for better compatibility
    this.useNativeLibraries = options?.useNativeLibraries ?? true;
    const bbsSession = options?.user ? options : null; // If it has a user, it's a session

    console.log(
      `[AmigaDosEnvironment] 🔧 Constructor - native libraries default: ${
        options?.useNativeLibraries === undefined
          ? "ENABLED (default)"
          : this.useNativeLibraries
          ? "ENABLED"
          : "DISABLED"
      }`
    );

    // Initialize stub libraries
    this.execLibrary = new ExecLibrary(emulator);
    this.dosLibrary = new DosLibrary(emulator);
    this.intuitionLibrary = new IntuitionLibrary(emulator);
    this.amiexpressLibrary = new AmiExpressLibrary(emulator, bbsSession);
    this.iconLibrary = new IconLibrary(emulator);

    // Initialize library loader for native libraries
    this.libraryLoader = new LibraryLoader(emulator, options?.libraryPaths);
    this.libraryLoader.addSearchPath(path.join(process.cwd(), "Libs"));

    // Pass library loader to exec.library for OpenLibrary hybrid support
    (this.execLibrary as any).setLibraryLoader(
      this.libraryLoader,
      this.useNativeLibraries
    );

    // Create AEDoorPort for door communication (if we have session data)
    if (bbsSession?.user) {
      const nodeNumber = bbsSession.node || 1;
      const portName = `AEDoorPort${nodeNumber}`;
      console.log(`[AmigaDosEnvironment] Creating message port: ${portName}`);
      this.createAEDoorPort(portName, bbsSession);
    }

    // Set up trap handler
    this.setupTrapHandler();

    console.log(
      `[AmigaDosEnvironment] ✅ Initialized (native libraries: ${
        this.useNativeLibraries ? "enabled" : "disabled"
      })`
    );
  }

  /**
   * Create AEDoorPort for BBS door communication
   */
  private createAEDoorPort(portName: string, session: any): void {
    console.log(
      `[AmigaDosEnvironment] Creating AEDoorPort for user: ${session.user.username}`
    );

    // Create the port through ExecLibrary
    const portAddr = (this.execLibrary as any).createSystemPort(portName, 0);

    if (portAddr === 0) {
      console.error(`[AmigaDosEnvironment] Failed to create ${portName}!`);
      return;
    }

    console.log(
      `[AmigaDosEnvironment] ${portName} created at 0x${portAddr.toString(16)}`
    );
    console.log(
      `[AmigaDosEnvironment] Doors can now FindPort("${portName}") to communicate with BBS`
    );

    // Set up message handler for this port
    // When doors send messages to this port, we need to respond with user/system/node data
    this.setupAEDoorPortHandler(portName, session);
  }

  /**
   * Set up message handler for AEDoorPort
   * This handles incoming door messages and responds with BBS data
   */
  private setupAEDoorPortHandler(portName: string, session: any): void {
    console.log(
      `[AmigaDosEnvironment] Setting up message handler for ${portName}`
    );

    // For now, we'll handle messages in the execution loop
    // TODO: Implement proper message handling when PutMsg is called
    // The door will:
    // 1. FindPort(portName) - gets the port address
    // 2. CreatePort(replyPort) - creates its own reply port
    // 3. PutMsg(portName, message) - sends command
    // 4. WaitPort(replyPort) - waits for response
    // 5. GetMsg(replyPort) - gets our response

    console.log(
      `[AmigaDosEnvironment] Handler ready - waiting for door to send messages`
    );
  }

  /**
   * Initialize the trap handler to intercept library calls
   */
  private setupTrapHandler(): void {
    // The trap handler will be called when a JSR to negative address is detected
    console.log("[AmigaDosEnvironment] Setting up trap handler...");
    const setTrap = (this.emulator as any).setTrapHandler;
    if (typeof setTrap === 'function') {
      setTrap.call(this.emulator, (offset: number) => {
        console.log(
          `[AmigaDOS] *** TRAP HANDLER CALLED *** offset=${offset} (0x${offset.toString(
            16
          )})`
        );
        this.handleLibraryCall(offset);
      });
      console.log("[AmigaDosEnvironment] Trap handler configured successfully");
    } else {
      console.warn("[AmigaDosEnvironment] Emulator lacks setTrapHandler; skipping trap setup");
    }
  }

  /**
   * Handle a library call by routing to the appropriate library
   * This is called for STUB libraries only (when native code isn't available)
   */
  private handleLibraryCall(trapAddress: number): void {
    console.log(
      `[AmigaDOS] Stub library call: trapAddress=${trapAddress} (0x${trapAddress.toString(
        16
      )})`
    );

    // Get the library base from A6 register (standard Amiga convention)
    let libraryBase = this.emulator.getRegister(CPURegister.A6);
    console.log(`[AmigaDOS] Library base in A6: 0x${libraryBase.toString(16)}`);

    // XIM-DOOR FIX: When A6=0, default to DosBase
    // XIM doors overwrite A6 with ExecBase, then call dos.library functions with A6=0
    // We detect this and route to dos.library automatically
    if (libraryBase === 0) {
      libraryBase = 0xffff0000; // DosBase
      console.log(
        `[AmigaDOS] XIM-DOOR: A6=0 detected, defaulting to DosBase (0x${libraryBase.toString(
          16
        )})`
      );
    }

    // CRITICAL FIX: Calculate actual library offset from trap address
    // Moira passes the full trap address (e.g., 0xFEFEFFD0), not the offset
    // We need to subtract the library base to get the actual offset
    // For JSR -48(A6), the trap address will be (libraryBase - 48)
    let offset = trapAddress;

    // NOTE: We used to intercept ROM reads here (0xFF0000-0xFF00FF), but now that we have
    // real Kickstart ROM loaded into memory, we let the CPU read directly from it.
    // The ROM is mapped at 0xF80000-0xFFFFFF and contains all the OS functions.
    // Hardware registers are at different addresses:
    //   - Custom chips: 0xDFF000-0xDFFFFF
    //   - CIA-A: 0xBFE001
    //   - CIA-B: 0xBFD000

    // If trap address is in the HIGH address range (0xFE000000+), it's a library trap
    // This catches addresses like 0xFEFEFFD0 (Write), 0xFFFF0000 (DosBase), etc.
    // Low addresses like 0x00FF0000 are NOT library traps
    if (trapAddress >= 0xfe000000) {
      // Convert to signed 32-bit to handle negative offsets correctly
      offset = (trapAddress | 0) - (libraryBase | 0);
      console.log(
        `[AmigaDOS] Calculated offset from trap address: 0x${trapAddress.toString(
          16
        )} - 0x${libraryBase.toString(16)} = ${offset}`
      );
    }

    // Normalize offset using magic address mapping
    // This handles direct JSR calls to magic addresses like 0xFFFFFFC4
    let normalizedOffset = offset;
    if (this.magicAddressMap.has(trapAddress)) {
      normalizedOffset = this.magicAddressMap.get(trapAddress)!;
      console.log(
        `[AmigaDOS] Mapped magic address 0x${trapAddress.toString(
          16
        )} to offset ${normalizedOffset}`
      );
    } else if (this.magicAddressMap.has(offset)) {
      normalizedOffset = this.magicAddressMap.get(offset)!;
      console.log(
        `[AmigaDOS] Mapped calculated offset ${offset} to ${normalizedOffset}`
      );
    }

    // Route to appropriate library based on base address
    let handled = false;

    // ROUTE BY LIBRARY BASE ADDRESS
    // This allows multiple libraries to have functions at the same offset

    if (libraryBase === 0xff4000) {
      // AEDoor.library - BBS door I/O functions
      console.log(`[AmigaDOS] Routing to AEDoor.library (base=0xFF4000)`);
      handled = this.amiexpressLibrary.handleCall(offset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by AEDoor.library (AmiExpressLibrary)`);
      }
    } else if (libraryBase === 0xff8000) {
      // exec.library - System executive functions
      // NOTE: Some doors also call BBS functions from ExecBase (non-standard)
      console.log(`[AmigaDOS] Routing to exec.library (base=0xFF8000)`);
      handled = (this.execLibrary as any).handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by exec.library`);
      }

      // Fallback: Try AmiExpress BBS functions (some doors use ExecBase for BBS calls)
      if (!handled) {
        console.log(
          `[AmigaDOS] exec.library didn't handle offset ${normalizedOffset}, trying AEDoor functions...`
        );
        handled = this.amiexpressLibrary.handleCall(offset);
        if (handled) {
          console.log(
            `[AmigaDOS] Handled by AEDoor functions via ExecBase (non-standard but common)`
          );
        }
      }

      // Fallback 2: Try dos.library (some XIM doors call DOS functions via ExecBase)
      if (!handled) {
        console.log(
          `[AmigaDOS] ExecBase didn't handle offset ${normalizedOffset}, trying dos.library...`
        );
        handled = this.dosLibrary.handleCall(normalizedOffset);
        if (handled) {
          console.log(
            `[AmigaDOS] Handled by dos.library via ExecBase (XIM-door pattern)`
          );
        }
      }
    } else if (libraryBase === 0xffff0000) {
      // dos.library - DOS functions
      console.log(`[AmigaDOS] Routing to dos.library (base=0xFFFF0000)`);
      handled = this.dosLibrary.handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by dos.library`);
      }
    } else if (libraryBase === 0xffff1000) {
      // intuition.library - GUI functions
      handled = this.intuitionLibrary.handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by intuition.library`);
      }
    } else if (libraryBase === 0xffff9000) {
      // icon.library - Icon/tooltype functions
      console.log(`[AmigaDOS] Routing to icon.library (base=0xFFFF9000)`);
      handled = this.iconLibrary.handleCall(normalizedOffset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by icon.library`);
      }
    } else {
      // Unknown library base - try all libraries as fallback
      console.log(
        `[AmigaDOS] Unknown library base 0x${libraryBase.toString(
          16
        )}, trying all libraries...`
      );

      // Try in priority order
      handled = this.amiexpressLibrary.handleCall(offset);
      if (handled) {
        console.log(`[AmigaDOS] Handled by AmiExpress BBS library (fallback)`);
      }

      if (!handled) {
        handled = (this.execLibrary as any).handleCall(normalizedOffset);
        if (handled) {
          console.log(`[AmigaDOS] Handled by exec.library (fallback)`);
        }
      }

      if (!handled) {
        handled = this.dosLibrary.handleCall(normalizedOffset);
        if (handled) {
          console.log(`[AmigaDOS] Handled by dos.library (fallback)`);
        }
      }

      if (!handled) {
        handled = this.intuitionLibrary.handleCall(normalizedOffset);
        if (handled) {
          console.log(`[AmigaDOS] Handled by intuition.library (fallback)`);
        }
      }

      if (!handled) {
        handled = this.iconLibrary.handleCall(normalizedOffset);
        if (handled) {
          console.log(`[AmigaDOS] Handled by icon.library (fallback)`);
        }
      }
    }

    if (!handled) {
      console.warn(`[AmigaDOS] ⚠️ UNIMPLEMENTED FUNCTION CALL`);
      console.warn(
        `[AmigaDOS]   Offset: ${offset} (normalized: ${normalizedOffset})`
      );
      console.warn(`[AmigaDOS]   Library base: 0x${libraryBase.toString(16)}`);
      console.warn(`[AmigaDOS]   Trap address: 0x${trapAddress.toString(16)}`);

      // Get CPU state for debugging
      const pc = this.emulator.getRegister(16); // Program counter
      const a6 = this.emulator.getRegister(14); // A6 (library base)
      const d0 = this.emulator.getRegister(0); // D0 (often return value)
      const sp = this.emulator.getRegister(15); // Stack pointer

      console.warn(
        `[AmigaDOS]   PC: 0x${pc.toString(16)}, A6: 0x${a6.toString(
          16
        )}, D0: 0x${d0.toString(16)}, SP: 0x${sp.toString(16)}`
      );

      // DEFENSIVE STUBBING: Return safe default value
      // Most Amiga functions return 0 for success, -1 for error
      // We return 0 to let the door continue
      this.emulator.setRegister(0, 0); // D0 = 0 (success)

      console.warn(`[AmigaDOS]   Returning D0=0 (stubbed success)`);
    }

    // Note: We don't need to modify PC here!
    // The JSR will execute normally, jump to the library address,
    // then read16() will return an RTS instruction which returns execution.
  }

  /**
   * Handle ROM space reads
   * 0xFF0000-0xFFFFFF is Kickstart ROM space on Amiga
   * Doors may read from ROM for function pointers or data tables
   */
  private handleHardwareRegister(address: number): void {
    // This is ROM space (0xFF0000-0xFFFFFF), not hardware registers
    // Hardware registers are at:
    //   - Custom chips: 0xDFF000-0xDFFFFF
    //   - CIA-A: 0xBFE001
    //   - CIA-B: 0xBFD000

    // CRITICAL FIX: Return realistic ROM values instead of 0
    // Bulls door reads 0xFF0000 and 0xFF0002, gets zeros, then jumps to NULL (crash)
    // We need to return safe addresses that won't cause crashes

    if (address >= 0xff0000 && address <= 0xff00ff) {
      // Upper 256 bytes of ROM - contains vectors and function pointers
      // Return safe RTS addresses for common ROM functions

      switch (address) {
        case 0xff0000:
        case 0xff0002:
          // Bulls door specifically reads these addresses
          // Return a safe RTS address (0x4E75) instruction address
          this.emulator.setRegister(CPURegister.D0, 0xffff0004); // Safe RTS address
          console.log(
            `[ROM Read] Address 0x${address.toString(
              16
            )} (Bulls read): returning safe RTS address 0xFFFF0004`
          );
          break;

        case 0xff0004:
        case 0xff0006:
          // More Bulls reads - return safe values
          this.emulator.setRegister(CPURegister.D0, 0xffff0008);
          console.log(
            `[ROM Read] Address 0x${address.toString(16)}: returning 0xFFFF0008`
          );
          break;

        default:
          // For other ROM reads, return version info or safe values
          // 0xFF0008-0xFF0010: ROM version and revision
          this.emulator.setRegister(CPURegister.D0, 0x00000000);
          console.log(
            `[ROM Read] Address 0x${address.toString(
              16
            )} (ROM space): returning 0`
          );
          break;
      }
      return;
    }

    // For other ROM space reads (0xFF0100-0xFFFFFF)
    // Return 0 for version/checksum reads, safe values for potential pointers
    this.emulator.setRegister(CPURegister.D0, 0);
    console.log(
      `[ROM Read] Address 0x${address.toString(16)} (ROM space): returning 0`
    );
  }

  /**
   * Set callback for stdout/stderr output
   */
  setOutputCallback(callback: (data: string) => void): void {
    // Forward to AmiExpress BBS library (primary for door I/O)
    this.amiexpressLibrary.setOutputCallback(callback);
    // Also forward to dos.library (fallback for standard I/O)
    this.dosLibrary.setOutputCallback(callback);
  }

  /**
   * Queue input data from user
   */
  queueInput(data: string): void {
    // Forward to AmiExpress BBS library (primary for door I/O)
    this.amiexpressLibrary.queueInput(data);
    // Also forward to dos.library (fallback for standard I/O)
    this.dosLibrary.queueInput(data);
  }

  /**
   * Get exec.library instance
   */
  getExecLibrary(): ExecLibrary {
    return this.execLibrary;
  }

  /**
   * Check if Delay() is currently active
   */
  isDelayed(): boolean {
    return this.dosLibrary.isDelayed();
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
