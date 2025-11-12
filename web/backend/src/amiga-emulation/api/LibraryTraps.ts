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
import { DosLibrary } from './DosLibrary';
import { IconLibrary } from './IconLibrary';

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
  {
    offset: -132,  // LVO -132 (0xFF7C)
    name: 'PreCreateComm',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.preCreateComm();
    }
  },
  {
    offset: -138,  // LVO -138 (0xFF76)
    name: 'PostDeleteComm',
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.postDeleteComm();
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
      return lib.Open();
    }
  },
  {
    offset: -36,
    name: 'Close',
    handler: (emu, lib: DosLibrary) => {
      return lib.Close();
    }
  },
  {
    offset: -42,
    name: 'Read',
    handler: (emu, lib: DosLibrary) => {
      return lib.Read();
    }
  },
  {
    offset: -48,
    name: 'Write',
    handler: (emu, lib: DosLibrary) => {
      return lib.Write();
    }
  },
  {
    offset: -54,
    name: 'Input',
    handler: (emu, lib: DosLibrary) => {
      return lib.Input();
    }
  },
  {
    offset: -60,
    name: 'Output',
    handler: (emu, lib: DosLibrary) => {
      return lib.Output();
    }
  },
  {
    offset: -66,
    name: 'Seek',
    handler: (emu, lib: DosLibrary) => {
      return lib.Seek();
    }
  },
  {
    offset: -90,  // LVO -90 - UnLock
    name: 'UnLock',
    handler: (emu, lib: DosLibrary) => {
      lib.UnLock();
      return 0;
    }
  },
  {
    offset: -132,
    name: 'IoErr',
    handler: (emu, lib: DosLibrary) => {
      return lib.IoErr();
    }
  },
  {
    offset: -150,  // LVO -150 - FreeLock (same as UnLock for our purposes)
    name: 'FreeLock',
    handler: (emu, lib: DosLibrary) => {
      lib.UnLock();  // FreeLock and UnLock do the same thing
      return 0;
    }
  },
  {
    offset: -192,
    name: 'DateStamp',
    handler: (emu, lib: DosLibrary) => {
      return lib.DateStamp();
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
      return emu.getRegister(0);  // Returns -1 if char available, 0 if timeout
    }
  },
  {
    offset: -144,
    name: 'Exit',
    handler: (emu, lib: DosLibrary) => {
      lib.Exit();
      return 0;  // Exit doesn't return in the normal sense
    }
  },
  {
    offset: -126,  // LVO -126 (0xFFFFFF82) - FindVar
    name: 'FindVar',
    handler: (emu, lib: DosLibrary) => {
      lib.FindVar();
      return emu.getRegister(0);  // Returns pointer to LocalVar structure in D0
    }
  },
  {
    offset: -534,  // LVO -534 (0xFDE6) - V36+
    name: 'GetArgStr',
    handler: (emu, lib: DosLibrary) => {
      lib.GetArgStr();
      return emu.getRegister(0);  // Returns pointer in D0
    }
  },
  {
    offset: -576,  // LVO -576 (0xFDC0) - V36+
    name: 'GetCliProgramName',
    handler: (emu, lib: DosLibrary) => {
      lib.GetCliProgramName();
      return emu.getRegister(0);  // Returns success/failure in D0
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
    offset: -384,  // LVO -384 (0xFFFFFE80) - CreatePort (AmigaOS 1.x)
    name: 'CreatePort',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(8);   // A0 = name pointer
      const priority = emu.getRegister(0);   // D0 = priority
      return lib.createPort(nameAddr, priority);
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
    offset: -594,  // LVO -594 (0xFFFFFDA6) - FindSemaphore
    name: 'FindSemaphore',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9);   // A1
      return lib.findSemaphore(nameAddr);
    }
  },
  {
    offset: -598,  // LVO -598 (0xFFFFFDA2) - AddSemaphore
    name: 'AddSemaphore',
    handler: (emu, lib: ExecLibrary) => {
      const semaphoreAddr = emu.getRegister(9);   // A1
      lib.addSemaphore(semaphoreAddr);
      return 0;
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
    name: 'CreatePort_or_GetMsg',  // B door calls CreatePort here!
    handler: (emu, lib: ExecLibrary) => {
      // CRITICAL: B door (and possibly other legacy doors) call CreatePort at -372
      // But standard AmigaOS has GetMsg at -372
      // Solution: Check if we're being called with typical CreatePort parameters
      const a0 = emu.getRegister(8);   // A0 could be name (CreatePort) or port (GetMsg)
      const d0 = emu.getRegister(0);   // D0 could be priority (CreatePort) or unused (GetMsg)

      // Heuristic: If A0 looks like a valid port address (high memory) it's GetMsg
      // If A0 is 0 or points to low memory (likely string), it's CreatePort
      if (a0 >= 0x20000 && a0 < 0x100000) {
        // Looks like a port address - call GetMsg
        console.log(`[LibraryTraps] LVO -372 called with A0=0x${a0.toString(16)} - routing to GetMsg`);
        return lib.getMsg(a0);
      } else {
        // Looks like CreatePort parameters - call CreatePort
        console.log(`[LibraryTraps] LVO -372 called with A0=0x${a0.toString(16)}, D0=${d0} - routing to CreatePort`);
        return lib.createPort(a0, d0);
      }
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
    offset: -30,  // LVO -30 (0xFFFFFFE2)
    name: 'Supervisor',
    handler: ((emu: any, lib: any, returnAddr: any) => {
      // Supervisor() - Execute a function in supervisor mode
      // Input: A5 = function pointer to execute
      // The function is called with return address on stack
      // Returns: D0 = result from supervisor function

      const a5 = emu.getRegister(13);  // A5 - supervisor function pointer

      // CRITICAL FIX: Check for invalid/NULL function pointers
      // WHO door passes A5=0x46f8 which contains zeros (uninitialized memory)
      // vamos skips/ignores such calls instead of crashing
      // See investigation: /tmp/SUPERVISOR_INVESTIGATION_FINAL.md

      // Check 1: NULL or very low address (< 0x1000 is in exception vectors)
      if (a5 === 0 || a5 < 0x1000) {
        console.log(`[LibraryTraps] Supervisor: NULL/invalid function pointer (0x${a5.toString(16)}), skipping execution`);
        console.log(`[LibraryTraps] Supervisor: Preserving all registers (per NDK specs)`);
        emu.setRegister(16, returnAddr);  // CRITICAL: Move PC past the JSR instruction
        // CRITICAL: Preserve D0! NDK says "does not modify or save registers"
        // Return current D0 value unchanged instead of 0
        const d0 = emu.getRegister(0);
        return d0;
      }

      // Check 2: Memory at function pointer contains valid code
      // Read first word - if it's 0x0000 or 0xFFFF, it's not valid code
      const firstWord = emu.readMemory16(a5);
      if (firstWord === 0x0000 || firstWord === 0xFFFF) {
        console.log(`[LibraryTraps] Supervisor: Function at 0x${a5.toString(16)} contains invalid code (0x${firstWord.toString(16)}), skipping execution`);
        console.log(`[LibraryTraps] Supervisor: Preserving all registers (per NDK specs)`);
        emu.setRegister(16, returnAddr);  // CRITICAL: Move PC past the JSR instruction
        // CRITICAL: Preserve D0! NDK says "does not modify or save registers"
        // Return current D0 value unchanged instead of 0
        const d0 = emu.getRegister(0);
        return d0;
      }

      // Valid function - execute normally
      console.log(`[LibraryTraps] Supervisor: calling VALID function at 0x${a5.toString(16)}, returnAddr=0x${returnAddr.toString(16)}`);

      // Set PC to the supervisor function address
      // The function will execute and eventually RTS back to returnAddr
      emu.setRegister(16, a5);  // PC = supervisor function

      // CRITICAL: DO NOT push return address - it's already on stack from JSR to Supervisor
      // The supervisor function will RTS to returnAddr (which handleTrap already popped)
      // So we need to push returnAddr back for the supervisor function to RTS to
      const sp = emu.getRegister(15);
      emu.writeMemory32(sp - 4, returnAddr);
      emu.setRegister(15, sp - 4);

      console.log(`[LibraryTraps] Supervisor: PC set to 0x${a5.toString(16)}, return will go to 0x${returnAddr.toString(16)}`);

      // Return 0 - actual return value will come from supervisor function via D0
      return 0;
    }) as any
  },
  {
    offset: -330,  // LVO -330 (0xFFFFFEB6)
    name: 'AllocSignal',
    handler: (emu, lib: ExecLibrary) => {
      const signalNum = emu.getRegister(0);  // D0 (signed byte, -1 = any free signal)
      const result = lib.AllocSignal(signalNum);
      return result;  // Return signal number or -1 in D0
    }
  },
  {
    offset: -354,  // LVO -354 (0xFFFFFE9E)
    name: 'AddPort',
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(9);  // A1 - port pointer
      lib.addPort(portAddr);
      return 0;  // AddPort has no return value
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
 * icon.library function vectors
 * Icon/Tooltype access for .info files
 */
const ICON_VECTORS: LibraryVector[] = [
  {
    offset: -30,  // LVO -30 (0xFFFFFFE2) - GetDiskObject
    name: 'GetDiskObject',
    handler: (emu, lib: IconLibrary) => {
      lib.GetDiskObject();
      return emu.getRegister(0);  // D0
    }
  },
  {
    offset: -36,  // LVO -36 (0xFFFFFFDC) - PutDiskObject
    name: 'PutDiskObject',
    handler: (emu, lib: IconLibrary) => {
      lib.PutDiskObject();
      return emu.getRegister(0);  // D0
    }
  },
  {
    offset: -42,  // LVO -42 (0xFFFFFFD6) - FreeDiskObject
    name: 'FreeDiskObject',
    handler: (emu, lib: IconLibrary) => {
      lib.FreeDiskObject();
      return 0;
    }
  },
  {
    offset: -48,  // LVO -48 (0xFFFFFFD0) - FindToolType
    name: 'FindToolType',
    handler: (emu, lib: IconLibrary) => {
      lib.FindToolType();
      return emu.getRegister(0);  // D0
    }
  },
  {
    offset: -54,  // LVO -54 (0xFFFFFFCA) - MatchToolValue
    name: 'MatchToolValue',
    handler: (emu, lib: IconLibrary) => {
      lib.MatchToolValue();
      return emu.getRegister(0);  // D0
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
  private iconLibrary: IconLibrary | null = null;

  // Map of trap address -> vector entry
  private trapMap: Map<number, LibraryVector> = new Map();

  // Map of trap address -> library instance
  private libraryMap: Map<number, any> = new Map();

  // NEW: Map of offset -> array of vector entries (for offset-based trap detection)
  // Multiple libraries can use the same offset (e.g., -30 for Supervisor in Exec, Open in DOS)
  private offsetMap: Map<number, LibraryVector[]> = new Map();

  // NEW: Map of offset -> array of library instances (parallel to offsetMap)
  private offsetLibraryMap: Map<number, any[]> = new Map();

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
   * Set the icon.library instance
   */
  setIconLibrary(lib: IconLibrary): void {
    this.iconLibrary = lib;
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

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.execLibrary);

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

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.dosLibrary);

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

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.aedoorLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${AEDOOR_VECTORS.length} AEDoor.library vectors`);
  }

  /**
   * Install icon.library vectors
   */
  installIconVectors(): void {
    if (!this.iconLibrary) {
      console.error('[LibraryTraps] Cannot install icon vectors: library not set');
      return;
    }

    const iconBase = this.execLibrary.getLibraryBase('icon.library');
    if (iconBase === 0) {
      console.error('[LibraryTraps] Cannot install icon vectors: library not opened');
      return;
    }

    console.log(`[LibraryTraps] Installing icon.library vectors at base 0x${iconBase.toString(16)}`);

    for (const vector of ICON_VECTORS) {
      const trapAddr = iconBase + vector.offset;

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.iconLibrary);

      // Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.iconLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${ICON_VECTORS.length} icon.library vectors`);
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

    console.log(`[LibraryTraps] *** INTERCEPTED: ${vector.name}() at PC=0x${pc.toString(16)} ***`);

    // Highlight output-related AEDoor functions
    if (vector.name === 'WriteStr' || vector.name === 'Prompt' || vector.name === 'SendCmd') {
      console.log(`[LibraryTraps] ⚠️  OUTPUT FUNCTION: ${vector.name}() - THIS SHOULD PRODUCE TERMINAL OUTPUT`);
    }

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, pc);
    }

    // CRITICAL: Save return address AND pop stack BEFORE calling handler!
    // Some handlers (like StackSwap) modify the stack pointer. We must read
    // and pop the return address from the ORIGINAL stack before the handler runs.
    const sp = this.emulator.getRegister(15);  // A7 (stack pointer)
    const a6 = this.emulator.getRegister(14);  // A6 (library base)
    const a6Before = a6;  // CRITICAL: Save A6 before trap handler
    console.log(`[LibraryTraps]   SP before pop: 0x${sp.toString(16)}, A6: 0x${a6.toString(16)}`);
    const returnAddr = this.emulator.readMemory32(sp);
    console.log(`[LibraryTraps]   Return address at SP: 0x${returnAddr.toString(16)}`);
    this.emulator.setRegister(15, sp + 4);     // Pop return address from ORIGINAL stack
    const spAfter = this.emulator.getRegister(15);
    console.log(`[LibraryTraps]   SP after pop: 0x${spAfter.toString(16)}`);

    // DEBUG: Dump stack contents where A6 should be saved
    // MOVEM.L (SP)+,D0-D7/A0-A6 reads A6 from SP+56
    // (D0-D7 = 8 regs = 32 bytes, A0-A5 = 6 regs = 24 bytes, total offset = 56)
    const a6OnStack = this.emulator.readMemory32(spAfter + 56);
    console.log(`[LibraryTraps]   A6 value saved on stack at SP+56 (0x${(spAfter + 56).toString(16)}): 0x${a6OnStack.toString(16)}`);

    // Also dump the surrounding stack to see the pattern
    console.log(`[LibraryTraps]   Stack dump (after return address pop):`);
    for (let i = 0; i < 15; i++) {
      const regValue = this.emulator.readMemory32(spAfter + (i * 4));
      const regName = i < 8 ? `D${i}` : `A${i - 8}`;
      console.log(`[LibraryTraps]     SP+${i * 4} (${regName}): 0x${regValue.toString(16)}`);
    }


    // Get the library instance for this trap
    const library = this.libraryMap.get(pc);

    // Call the handler with the correct library instance
    // Note: Handler may now modify SP (e.g., StackSwap), but we've already popped the return address
    // Pass returnAddr to handler for functions like Supervisor() that need it
    const result = (vector.handler as any)(this.emulator, library, returnAddr);

    // Set return value in D0
    this.emulator.setRegister(0, result);

    // CRITICAL FIX: Restore A6 register after trap handler
    // M68K calling convention requires A6 to be preserved across function calls
    // For library calls, A6 MUST contain the library base address
    // Determine which library this offset belongs to and restore A6 to that library's base
    // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
    let properA6 = a6Before;  // Default: restore to original value

    // Determine library base from the library instance
    if (library === this.execLibrary) {
      properA6 = this.execLibrary.getLibraryBase('exec.library') || 0x10000;
    } else if (library === this.dosLibrary) {
      properA6 = this.execLibrary.getLibraryBase('dos.library') || 0x20000;
    } else if (library === this.aedoorLibrary) {
      properA6 = this.execLibrary.getLibraryBase('AEDoor.library') || 0x30000;
    }

    this.emulator.setRegister(14, properA6);
    const a6AfterRestore = this.emulator.getRegister(14);
    console.log(`[LibraryTraps]   A6 restored: 0x${a6Before.toString(16)} -> 0x${properA6.toString(16)} (${vector.name} library base)`);
    if (a6AfterRestore !== properA6) {
      console.log(`[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x${properA6.toString(16)}, Got: 0x${a6AfterRestore.toString(16)}`);
    }

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
    // EXCEPTIONS: Supervisor() and Exit() set PC themselves, so check if it was changed
    const currentPC = this.emulator.getRegister(16);
    if (vector.name === 'Supervisor') {
      // Supervisor already set PC to the supervisor function, don't overwrite it
      console.log(`[LibraryTraps] Supervisor: PC already set to 0x${currentPC.toString(16)}, not setting return address`);
    } else if (vector.name === 'Exit') {
      // Exit() already set PC to exit trap address (0xFFFF00), don't overwrite it
      console.log(`[LibraryTraps] Exit: PC already set to 0x${currentPC.toString(16)} (exit trap), not setting return address`);
    } else {
      console.log(`[LibraryTraps] Setting PC to return address 0x${returnAddr.toString(16)}`);
      this.emulator.setRegister(16, returnAddr);
      const verifyPC = this.emulator.getRegister(16);
      console.log(`[LibraryTraps] Verified PC is now: 0x${verifyPC.toString(16)}`);

      // Also check what instruction is at return address
      const op0 = this.emulator.readMemory(returnAddr);
      const op1 = this.emulator.readMemory(returnAddr + 1);
      const opcode = (op0 << 8) | op1;
      console.log(`[LibraryTraps] Instruction at return address: 0x${opcode.toString(16).padStart(4, '0')}`);
    }

    // CRITICAL FIX: Refill instruction prefetch queue!
    // After setting PC, we MUST refill the prefetch queue to synchronize
    // queue.ird and queue.irc with the new PC location.
    // The fixed refillPrefetch() now properly sets IRD and IRC without executing.
    this.emulator.refillPrefetch();

    // Verify final register state and ENFORCE 4-byte SP alignment
    let finalSp = this.emulator.getRegister(15);
    const finalA6 = this.emulator.getRegister(14);

    // CRITICAL FIX: Ensure SP is 4-byte aligned (M68K requirement)
    // If SP is misaligned, round DOWN to nearest 4-byte boundary
    const misalignment = finalSp % 4;
    if (misalignment !== 0) {
      const originalSp = finalSp;
      finalSp = finalSp - misalignment;  // Round down to 4-byte boundary
      this.emulator.setRegister(15, finalSp);
      console.log(`[LibraryTraps] *** SP MISALIGNMENT DETECTED AND CORRECTED ***`);
      console.log(`[LibraryTraps]   Original SP: 0x${originalSp.toString(16)} (misaligned by ${misalignment} bytes)`);
      console.log(`[LibraryTraps]   Corrected SP: 0x${finalSp.toString(16)} (4-byte aligned)`);
    }

    console.log(`[LibraryTraps] Returning to 0x${returnAddr.toString(16)}`);
    console.log(`[LibraryTraps]   Final SP: 0x${finalSp.toString(16)}, Final A6: 0x${finalA6.toString(16)}`);

    return true;  // Trap handled
  }

  /**
   * Check if an address is a library trap
   */
  isTrapAddress(addr: number): boolean {
    return this.trapMap.has(addr);
  }

  /**
   * NEW: Check if an offset matches a known library vector
   */
  isTrapOffset(offset: number): boolean {
    return this.offsetMap.has(offset);
  }

  /**
   * NEW: Handle a trap by offset (when A6 is corrupted)
   * @param offset - Library vector offset (e.g., -30 for Supervisor)
   * @param baseAddr - The A6 value (library base address, may be corrupted)
   */
  handleTrapByOffset(offset: number, baseAddr: number): boolean {
    const vectors = this.offsetMap.get(offset);
    const libraries = this.offsetLibraryMap.get(offset);

    if (!vectors || vectors.length === 0) {
      console.error(`[LibraryTraps] *** NO HANDLER for offset ${offset} ***`);
      return false;
    }

    // Multiple vectors can share the same offset (collision)
    // For now, use the first one (Exec.library functions installed first)
    // TODO: More sophisticated collision resolution if needed
    const vector = vectors[0];
    const library = libraries![0];

    console.log(`[LibraryTraps] Intercepted: ${vector.name}() at offset ${offset} (A6=0x${baseAddr.toString(16)})`);

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, baseAddr + offset);
    }

    // Pop return address from stack (same as handleTrap)
    const sp = this.emulator.getRegister(15);  // A7 (stack pointer)
    const a6 = this.emulator.getRegister(14);  // A6 (library base)
    const a6Before = a6;  // CRITICAL: Save A6 before trap handler
    console.log(`[LibraryTraps]   SP before pop: 0x${sp.toString(16)}, A6: 0x${a6.toString(16)}`);
    const returnAddr = this.emulator.readMemory32(sp);
    console.log(`[LibraryTraps]   Return address at SP: 0x${returnAddr.toString(16)}`);
    this.emulator.setRegister(15, sp + 4);     // Pop return address
    const spAfter = this.emulator.getRegister(15);
    console.log(`[LibraryTraps]   SP after pop: 0x${spAfter.toString(16)}`);

    // Call the handler
    const result = (vector.handler as any)(this.emulator, library, returnAddr);

    // Set return value in D0
    this.emulator.setRegister(0, result);

    // CRITICAL FIX: Restore A6 register after trap handler
    // M68K calling convention requires A6 to be preserved across function calls
    // For library calls, A6 MUST contain the library base address
    // Determine which library this offset belongs to and restore A6 to that library's base
    // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
    let properA6 = a6Before;  // Default: restore to original value

    // Determine library base from the library instance
    if (library === this.execLibrary) {
      properA6 = this.execLibrary.getLibraryBase('exec.library') || 0x10000;
    } else if (library === this.dosLibrary) {
      properA6 = this.execLibrary.getLibraryBase('dos.library') || 0x20000;
    } else if (library === this.aedoorLibrary) {
      properA6 = this.execLibrary.getLibraryBase('AEDoor.library') || 0x30000;
    }

    this.emulator.setRegister(14, properA6);
    const a6After = this.emulator.getRegister(14);
    console.log(`[LibraryTraps]   A6 restored: 0x${a6Before.toString(16)} -> 0x${properA6.toString(16)} (${vector.name} library base)`);
    if (a6After !== properA6) {
      console.log(`[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x${properA6.toString(16)}, Got: 0x${a6After.toString(16)}`);
    }

    // Update Status Register condition codes
    const sr = this.emulator.getRegister(17);
    let newSr = sr & 0xFFF0;  // Clear N, Z, V, C flags

    // Set Z flag if result is zero
    if (result === 0) {
      newSr |= 0x04;  // Set Z flag (bit 2)
    }

    // Set N flag if result is negative (bit 31 set)
    if (result & 0x80000000) {
      newSr |= 0x08;  // Set N flag (bit 3)
    }

    this.emulator.setRegister(17, newSr);

    console.log(`[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`);
    console.log(`[LibraryTraps]   Set SR to: 0x${newSr.toString(16).padStart(4, '0')} (Z=${(newSr & 0x04) ? 1 : 0} N=${(newSr & 0x08) ? 1 : 0})`);

    // Set PC to return address
    // EXCEPTIONS: Supervisor() and Exit() set PC themselves
    const currentPC = this.emulator.getRegister(16);
    if (vector.name === 'Supervisor') {
      console.log(`[LibraryTraps] Supervisor: PC already set to 0x${currentPC.toString(16)}, not setting return address`);
    } else if (vector.name === 'Exit') {
      console.log(`[LibraryTraps] Exit: PC already set to 0x${currentPC.toString(16)} (exit trap), not setting return address`);
    } else {
      this.emulator.setRegister(16, returnAddr);
    }

    return true;
  }
}
