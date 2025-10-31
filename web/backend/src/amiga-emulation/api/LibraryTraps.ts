/**
 * Library Call Trapping for Amiga Door Execution
 *
 * Amiga libraries use JSR to negative offsets from the library base.
 * Example: JSR -30(A6) calls OpenLibrary
 *
 * We intercept these calls by placing ILLEGAL instructions at the
 * vector addresses, which trigger exceptions that we can handle.
 *
 * This allows doors to call library functions without needing the
 * actual library code in memory.
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { ExecLibrary } from './ExecLibrary';
import { AEDoorLibrary } from './AEDoorLibrary';
import { DosLibrary } from './DOSLibrary';

/**
 * Library function vector entry
 */
interface LibraryVector {
  offset: number;      // Negative offset from library base
  name: string;        // Function name (for logging)
  handler: (emulator: MoiraEmulator, library: any) => number; // Returns D0
}

/**
 * AEDoor.library function vectors
 * Reference: AEDOOR_FUNCTION_OFFSETS.md & CRITICAL_AEDOOR_DISCOVERY.md
 * LVO = Library Vector Offset (in bytes from library base)
 */
const AEDOOR_VECTORS: LibraryVector[] = [
  {
    offset: -30,  // LVO -30 (0xFFE2)
    name: 'CreateComm',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.createComm();
    }
  },
  {
    offset: -36,  // LVO -36 (0xFFDC)
    name: 'DeleteComm',
    handler: (emu, lib: AEDoorLibrary) => {
      lib.deleteComm();
      return 0;
    }
  },
  {
    offset: -42,  // LVO -42 (0xFFD6)
    name: 'SendCmd',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendCmd();
    }
  },
  {
    offset: -48,  // LVO -48 (0xFFD0)
    name: 'SendStrCmd',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendStrCmd();
    }
  },
  {
    offset: -54,  // LVO -54 (0xFFCA)
    name: 'SendDataCmd',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendDataCmd();
    }
  },
  {
    offset: -60,  // LVO -60 (0xFFC4)
    name: 'SendStrDataCmd',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.sendStrDataCmd();
    }
  },
  {
    offset: -66,  // LVO -66 (0xFFBE)
    name: 'GetData',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getData();
    }
  },
  {
    offset: -72,  // LVO -72 (0xFFB8)
    name: 'GetString',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getString();
    }
  },
  {
    offset: -78,  // LVO -78 (0xFFB2)
    name: 'Prompt',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.prompt();
    }
  },
  {
    offset: -84,  // LVO -84 (0xFFAC)
    name: 'WriteStr',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.writeStr();
    }
  },
  {
    offset: -90,  // LVO -90 (0xFFA6)
    name: 'ShowGFile',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.showGFile();
    }
  },
  {
    offset: -96,  // LVO -96 (0xFFA0)
    name: 'ShowFile',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.showFile();
    }
  },
  {
    offset: -102,  // LVO -102 (0xFF9A)
    name: 'SetDT',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.setDT();
    }
  },
  {
    offset: -108,  // LVO -108 (0xFF94)
    name: 'GetDT',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getDT();
    }
  },
  {
    offset: -114,  // LVO -114 (0xFF8E)
    name: 'GetStr',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.getStr();
    }
  },
  {
    offset: -120,  // LVO -120 (0xFF88)
    name: 'CopyStr',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.copyStr();
    }
  },
  {
    offset: -126,  // LVO -126 (0xFF82)
    name: 'HotKey',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.hotKey();
    }
  },
];

/**
 * DOS.library function vectors
 * Reference: AROS dos.library & AmigaOS LVO tables
 * LVO = Library Vector Offset (in bytes from library base)
 */
const DOS_VECTORS: LibraryVector[] = [
  {
    offset: -30,
    name: 'Open',
    handler: (emu, lib: DosLibrary) => {
      lib.Open();
      return emu.getRegister(0);  // D0 already set by Open()
    }
  },
  {
    offset: -36,
    name: 'Close',
    handler: (emu, lib: DosLibrary) => {
      lib.Close();
      return 0;
    }
  },
  {
    offset: -42,
    name: 'Read',
    handler: (emu, lib: DosLibrary) => {
      lib.Read();
      return emu.getRegister(0);  // D0 already set by Read()
    }
  },
  {
    offset: -48,
    name: 'Write',
    handler: (emu, lib: DosLibrary) => {
      lib.Write();
      return emu.getRegister(0);  // D0 already set by Write()
    }
  },
  {
    offset: -54,
    name: 'Input',
    handler: (emu, lib: DosLibrary) => {
      lib.Input();
      return emu.getRegister(0);
    }
  },
  {
    offset: -60,
    name: 'Output',
    handler: (emu, lib: DosLibrary) => {
      lib.Output();
      return emu.getRegister(0);
    }
  },
  {
    offset: -66,
    name: 'Seek',
    handler: (emu, lib: DosLibrary) => {
      lib.Seek();
      return emu.getRegister(0);
    }
  },
  {
    offset: -132,
    name: 'IoErr',
    handler: (emu, lib: DosLibrary) => {
      lib.IoErr();
      return emu.getRegister(0);
    }
  },
  {
    offset: -192,
    name: 'DateStamp',
    handler: (emu, lib: DosLibrary) => {
      lib.DateStamp();
      return emu.getRegister(0);
    }
  },
  {
    offset: -198,
    name: 'Delay',
    handler: (emu, lib: DosLibrary) => {
      lib.Delay();
      return 0;
    }
  },
  {
    offset: -204,
    name: 'WaitForChar',
    handler: (emu, lib: DosLibrary) => {
      lib.WaitForChar();
      return emu.getRegister(0);
    }
  },
];

/**
 * Exec.library function vectors
 * Reference: Amiga ROM Kernel Reference Manual & exec.library FD file
 * LVO = Library Vector Offset (in bytes from library base)
 */
const EXEC_VECTORS: LibraryVector[] = [
  {
    offset: -552,  // LVO -552 (0xFDD8)
    name: 'OpenLibrary',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9);   // A1
      const version = emu.getRegister(0);    // D0
      return lib.openLibrary(nameAddr, version);
    }
  },
  {
    offset: -414,  // LVO -414 (0xFE62)
    name: 'CloseLibrary',
    handler: (emu, lib: ExecLibrary) => {
      const libAddr = emu.getRegister(9);    // A1
      lib.closeLibrary(libAddr);
      return 0;  // No return value
    }
  },
  {
    offset: -132,  // LVO -132 (0xFF7C)
    name: 'Forbid',
    handler: (emu, lib: ExecLibrary) => {
      console.log('[ExecLibrary] Forbid() - stub (no-op)');
      return 0;
    }
  },
  {
    offset: -138,  // LVO -138 (0xFF76)
    name: 'Permit',
    handler: (emu, lib: ExecLibrary) => {
      console.log('[ExecLibrary] Permit() - stub (no-op)');
      return 0;
    }
  },
  {
    offset: -198,  // LVO -198 (0xFF3A)
    name: 'AllocMem',
    handler: (emu, lib: ExecLibrary) => {
      const size = emu.getRegister(0);       // D0
      const flags = emu.getRegister(1);      // D1
      return lib.allocMem(size, flags);
    }
  },
  {
    offset: -210,  // LVO -210 (0xFF2E)
    name: 'FreeMem',
    handler: (emu, lib: ExecLibrary) => {
      const memAddr = emu.getRegister(9);    // A1
      const size = emu.getRegister(0);       // D0
      lib.freeMem(memAddr, size);
      return 0;
    }
  },
  {
    offset: -294,  // LVO -294 (0xFED6)
    name: 'FindTask',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9);   // A1
      return lib.findTask(nameAddr);
    }
  },
  {
    offset: -306,  // LVO -306 (0xFECE)
    name: 'SetTaskPri',
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9);   // A1
      const newPri = emu.getRegister(0);     // D0
      return lib.setTaskPri(taskAddr, newPri);
    }
  },
  {
    offset: -390,  // LVO -390 (0xFFFFFE7A)
    name: 'FindPort',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9);   // A1
      return lib.findPort(nameAddr);
    }
  },
  {
    offset: -366,  // LVO -366 (0xFFFFFE72)
    name: 'PutMsg',
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8);   // A0
      const msgAddr = emu.getRegister(9);    // A1
      lib.putMsg(portAddr, msgAddr);
      return 0;
    }
  },
  {
    offset: -372,  // LVO -372 (0xFFFFFE6C)
    name: 'GetMsg',
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8);   // A0
      return lib.getMsg(portAddr);
    }
  },
  {
    offset: -318,  // LVO -318 (0xFFFFFEC2)
    name: 'Wait',
    handler: (emu, lib: ExecLibrary) => {
      const signalMask = emu.getRegister(0);   // D0
      return lib.wait(signalMask);
    }
  },
  {
    offset: -324,  // LVO -324 (0xFFFFFEBC)
    name: 'Signal',
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9);   // A1
      const signals = emu.getRegister(0);    // D0
      lib.signal(taskAddr, signals);
      return 0;
    }
  },
  {
    offset: -378,  // LVO -378 (0xFFFFFE86)
    name: 'ReplyMsg',
    handler: (emu, lib: ExecLibrary) => {
      const msgAddr = emu.getRegister(9);   // A1
      lib.replyMsg(msgAddr);
      return 0;
    }
  },
  {
    offset: -384,  // LVO -384 (0xFFFFFE80)
    name: 'WaitPort',
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8);   // A0
      return lib.waitPort(portAddr);
    }
  },
  {
    offset: -666,  // LVO -666 (0xFFFFFD66)
    name: 'CreateMsgPort',
    handler: (emu, lib: ExecLibrary) => {
      return lib.createMsgPort();
    }
  },
  {
    offset: -672,  // LVO -672 (0xFFFFFD60)
    name: 'DeleteMsgPort',
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8);   // A0
      lib.deleteMsgPort(portAddr);
      return 0;
    }
  },
  {
    offset: -732,  // LVO -732 (0xFFFFFD28)
    name: 'StackSwap',
    handler: (emu, lib: ExecLibrary) => {
      const structAddr = emu.getRegister(8);   // A0
      lib.stackSwap(structAddr);
      return 0;
    }
  },
];

/**
 * Library trap handler
 *
 * Manages interception of library calls via ILLEGAL instructions
 * placed at library vector addresses.
 */
export class LibraryTraps {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private aedoorLibrary: AEDoorLibrary | null = null;
  private dosLibrary: DosLibrary | null = null;

  // Map of trap address -> vector entry
  private trapMap: Map<number, LibraryVector> = new Map();

  // Map of trap address -> library instance
  private libraryMap: Map<number, any> = new Map();

  // Optional callback for monitoring library calls
  private onLibraryCall?: (functionName: string, pc: number) => void;

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
  }

  /**
   * Set callback for monitoring library calls
   */
  setLibraryCallMonitor(callback: (functionName: string, pc: number) => void): void {
    this.onLibraryCall = callback;
  }

  /**
   * Set the AEDoor.library instance
   */
  setAEDoorLibrary(lib: AEDoorLibrary): void {
    this.aedoorLibrary = lib;
  }

  /**
   * Set the DOS.library instance
   */
  setDOSLibrary(lib: DosLibrary): void {
    this.dosLibrary = lib;
  }

  /**
   * Install trap vectors for a library
   *
   * Builds a map of vector addresses to handlers.
   * No memory modification needed - we intercept at execution time.
   */
  installExecVectors(): void {
    const execBase = this.execLibrary.getExecBaseAddress();
    console.log(`[LibraryTraps] Installing Exec.library vectors at base 0x${execBase.toString(16)}`);

    for (const vector of EXEC_VECTORS) {
      const trapAddr = execBase + vector.offset;

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.execLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${EXEC_VECTORS.length} Exec.library vectors`);
  }

  /**
   * Install DOS.library vectors
   */
  installDOSVectors(): void {
    if (!this.dosLibrary) {
      console.error('[LibraryTraps] Cannot install DOS vectors: library not set');
      return;
    }

    const dosBase = this.execLibrary.getLibraryBase('dos.library');
    if (dosBase === 0) {
      console.error('[LibraryTraps] Cannot install DOS vectors: library not opened');
      return;
    }

    console.log(`[LibraryTraps] Installing dos.library vectors at base 0x${dosBase.toString(16)}`);

    for (const vector of DOS_VECTORS) {
      const trapAddr = dosBase + vector.offset;

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.dosLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${DOS_VECTORS.length} dos.library vectors`);
  }

  /**
   * Install AEDoor.library vectors
   */
  installAEDoorVectors(): void {
    if (!this.aedoorLibrary) {
      console.error('[LibraryTraps] Cannot install AEDoor vectors: library not set');
      return;
    }

    const aedoorBase = this.execLibrary.getLibraryBase('AEDoor.library');
    if (aedoorBase === 0) {
      console.error('[LibraryTraps] Cannot install AEDoor vectors: library not opened');
      return;
    }

    console.log(`[LibraryTraps] Installing AEDoor.library vectors at base 0x${aedoorBase.toString(16)}`);

    for (const vector of AEDOOR_VECTORS) {
      const trapAddr = aedoorBase + vector.offset;

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.aedoorLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${AEDOOR_VECTORS.length} AEDoor.library vectors`);
  }

  /**
   * Handle a trapped library call
   *
   * Called when PC is at a library vector address BEFORE execution.
   * We execute our handler instead of the (nonexistent) library code.
   *
   * @param pc - Current program counter
   * @returns true if this is a library call and was handled
   */
  handleTrap(pc: number): boolean {
    const vector = this.trapMap.get(pc);

    if (!vector) {
      // Check if this looks like a library vector (near a known library base)
      const execBase = this.emulator.readMemory32(0x4);
      const dosBase = this.execLibrary.getLibraryBase('dos.library');

      if (pc >= execBase - 1000 && pc < execBase) {
        const offset = pc - execBase;
        console.error(`[LibraryTraps] *** UNIMPLEMENTED EXEC FUNCTION ***`);
        console.error(`[LibraryTraps]   PC: 0x${pc.toString(16)}`);
        console.error(`[LibraryTraps]   ExecBase: 0x${execBase.toString(16)}`);
        console.error(`[LibraryTraps]   LVO offset: ${offset}`);
        console.error(`[LibraryTraps]   This is likely a missing Exec.library function!`);
        // Continue execution anyway (simulate RTS with D0=0)
        this.emulator.setRegister(0, 0);  // D0 = 0 (failure)
        const sp = this.emulator.getRegister(15);
        const returnAddr = this.emulator.readMemory32(sp);
        this.emulator.setRegister(15, sp + 4);
        this.emulator.setRegister(16, returnAddr);
        console.error(`[LibraryTraps]   Simulated RTS with D0=0, returning to 0x${returnAddr.toString(16)}`);
        return true;
      }

      if (dosBase && pc >= dosBase - 500 && pc < dosBase) {
        const offset = pc - dosBase;
        console.error(`[LibraryTraps] *** UNIMPLEMENTED DOS FUNCTION ***`);
        console.error(`[LibraryTraps]   PC: 0x${pc.toString(16)}, LVO: ${offset}`);
        // Simulate RTS with D0=0
        this.emulator.setRegister(0, 0);
        const sp = this.emulator.getRegister(15);
        const returnAddr = this.emulator.readMemory32(sp);
        this.emulator.setRegister(15, sp + 4);
        this.emulator.setRegister(16, returnAddr);
        return true;
      }

      return false;  // Not a library trap
    }

    console.log(`[LibraryTraps] Intercepted: ${vector.name}() at PC=0x${pc.toString(16)}`);

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, pc);
    }

    // CRITICAL: Save return address AND pop stack BEFORE calling handler!
    // Some handlers (like StackSwap) modify the stack pointer. We must read
    // and pop the return address from the ORIGINAL stack before the handler runs.
    const sp = this.emulator.getRegister(15);  // A7 (stack pointer)
    const returnAddr = this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4);     // Pop return address from ORIGINAL stack

    // Get the library instance for this trap
    const library = this.libraryMap.get(pc);

    // Call the handler with the correct library instance
    // Note: Handler may now modify SP (e.g., StackSwap), but we've already popped the return address
    const result = vector.handler(this.emulator, library);

    // Set return value in D0
    this.emulator.setRegister(0, result);

    // CRITICAL FIX: Update Status Register condition codes after setting D0
    // Library functions return values in D0, and the calling code expects
    // the Z and N flags to be set based on the return value (like TST.L D0 would do)
    //
    // M68K SR format: Bits 15-8 = system byte, Bits 4-0 = CCR (X N Z V C)
    const sr = this.emulator.getRegister(17);  // Get current SR
    let newSr = sr & 0xFFF0;  // Clear N, Z, V, C flags (bits 0-3), preserve X flag (bit 4)

    // Set Z flag if result is zero
    if (result === 0) {
      newSr |= 0x04;  // Set Z flag (bit 2)
    }

    // Set N flag if result is negative (bit 31 set for 32-bit value)
    if (result & 0x80000000) {
      newSr |= 0x08;  // Set N flag (bit 3)
    }

    // V (overflow) and C (carry) are cleared for library returns

    this.emulator.setRegister(17, newSr);  // Update SR

    // Verify SR was actually set
    const verifySr = this.emulator.getRegister(17);
    console.log(`[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`);
    console.log(`[LibraryTraps]   Set SR to: 0x${newSr.toString(16).padStart(4, '0')} (Z=${(newSr & 0x04) ? 1 : 0} N=${(newSr & 0x08) ? 1 : 0})`);
    console.log(`[LibraryTraps]   Verified SR: 0x${verifySr.toString(16).padStart(4, '0')} (Z=${(verifySr & 0x04) ? 1 : 0})`);

    // Set PC to return address
    this.emulator.setRegister(16, returnAddr);

    // CRITICAL FIX: Refill instruction prefetch queue!
    // After changing PC, Moira's IRC/IRD registers still contain the old JSR instruction.
    // We must refill them with the instruction at the new PC.
    this.emulator.refillPrefetch();

    console.log(`[LibraryTraps] Returning to 0x${returnAddr.toString(16)}`);

    return true;  // Trap handled
  }

  /**
   * Check if an address is a library trap
   */
  isTrapAddress(addr: number): boolean {
    return this.trapMap.has(addr);
  }
}
