/**
 * exec.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/exec_lib.i
 */

import { LibraryVector } from "./types";
import { ExecLibrary } from "../ExecLibrary";
import * as fs from "fs";
import * as path from "path";
import { getSystemTime } from '../../../utils/date-time.util';

// PERFORMANCE: Debug logging disabled by default - synchronous file I/O is slow
const TRAP_DEBUG_ENABLED = process.env.DEBUG_TRAP === '1';

// File-based debug logging for trap handlers
function logTrap(message: string): void {
  if (!TRAP_DEBUG_ENABLED) return;

  try {
    const bbsRoot = process.env.BBS_DATA_DIR || '~/Code/amiexpress-web';
    const logFile = path.join(bbsRoot, "logs", "backend.log");
    const line = `[TrapDebug] ${getSystemTime().toISOString()} ${message}\n`;
    fs.appendFileSync(logFile, line, { encoding: "utf8" });
  } catch (e) {
console.error(`[TrapDebug] Failed to write log: ${e}`);
  }
}

export const EXEC_VECTORS: LibraryVector[] = [
  {
    offset: -552, // LVO -552 (0xFDD8)
    name: "OpenLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const version = emu.getRegister(0); // D0
      const name = emu.readString(nameAddr, 64);
      console.log(`[exec-vectors] OpenLibrary TRAP: name="${name}" version=${version}`);
      const result = lib.openLibrary(nameAddr, version);
      console.log(`[exec-vectors] OpenLibrary TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -414, // LVO -414 (0xFE62)
    name: "CloseLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const libAddr = emu.getRegister(9); // A1
      lib.closeLibrary(libAddr);
      return 0; // No return value
    },
  },
  {
    offset: -522, // RawDoFmt
    name: "RawDoFmt",
    handler: (emu, lib: ExecLibrary) => {
      return lib.rawDoFmt();
    },
  },
  {
    offset: -78, // LVO -78 (InitStruct)
    name: "InitStruct",
    handler: (emu, lib: ExecLibrary) => {
      const initTable = emu.getRegister(9); // A1
      const memory = emu.getRegister(10); // A2
      const size = emu.getRegister(0); // D0
      lib.initStructForTrap(initTable, memory, size);
      return 0;
    },
  },
  {
    offset: -84, // LVO -84 (MakeLibrary)
    name: "MakeLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const vectors = emu.getRegister(8); // A0
      const initStruct = emu.getRegister(9); // A1
      const initFunc = emu.getRegister(10); // A2
      const dataSize = emu.getRegister(0); // D0
      const segList = emu.getRegister(1); // D1
      return lib.makeLibrary(vectors, initStruct, initFunc, dataSize, segList);
    },
  },
  {
    offset: -90, // LVO -90 (MakeFunctions)
    name: "MakeFunctions",
    handler: (emu, lib: ExecLibrary) => {
      const target = emu.getRegister(8); // A0
      const functionArray = emu.getRegister(9); // A1
      const funcDispBase = emu.getRegister(10); // A2
      return lib.makeFunctions(target, functionArray, funcDispBase);
    },
  },
  {
    offset: -96, // LVO -96 (FindResident)
    name: "FindResident",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const name = nameAddr ? emu.readString(nameAddr, 128) : "";
      return name ? lib.findResidentByName(name) : 0;
    },
  },
  {
    offset: -102, // LVO -102 (InitResident)
    name: "InitResident",
    handler: (emu, lib: ExecLibrary) => {
      const residentAddr = emu.getRegister(9); // A1
      const segList = emu.getRegister(1); // D1
      return lib.initResidentTrap(residentAddr, segList);
    },
  },
  {
    offset: -108, // LVO -108 (Alert)
    name: "Alert",
    handler: (emu, lib: ExecLibrary) => {
      const code = emu.getRegister(0); // D0
console.warn(
        `[ExecLibrary] Alert() called (code=0x${code.toString(16)})`
      );
      return lib.handleRomInitAlert();
    },
  },
  {
    offset: -132, // LVO -132 (0xFF7C)
    name: "Forbid",
    handler: (emu, lib: ExecLibrary) => {
console.log("[ExecLibrary] Forbid() - stub (no-op)");
      // Preserve D0/condition flags; Forbid has no return value
      return emu.getRegister(0);
    },
  },
  {
    offset: -138, // LVO -138 (0xFF76)
    name: "Permit",
    handler: (emu, lib: ExecLibrary) => {
console.log("[ExecLibrary] Permit() - stub (no-op)");
      return emu.getRegister(0);
    },
  },
  {
    offset: -150, // LVO -150 (0xFF6A)
    name: "SuperState",
    handler: (emu, _lib: ExecLibrary) => {
      // SuperState: enter supervisor mode, return old user stack in D0
      // In emulation there's no privilege distinction; return current SP
      return emu.getRegister(15); // A7 (SP)
    },
  },
  {
    offset: -156, // LVO -156 (0xFF64)
    name: "UserState",
    handler: (emu, _lib: ExecLibrary) => {
      // UserState(sysStack): return to user mode, D0 = old supervisor stack
      // In emulation there's no privilege distinction; return current SP
      return emu.getRegister(15); // A7 (SP)
    },
  },
  {
    offset: -186, // LVO -186
    name: "Allocate",
    handler: (_emu, _lib: ExecLibrary) => {
      // Allocate(memHeader, byteSize) -> memBlock or NULL
      // SAS/C runtime calls this to sub-allocate from its own pools.
      // Return 0 (NULL) to force fallback to AllocMem which we handle properly.
      return 0;
    },
  },
  {
    offset: -234, // LVO -234
    name: "Insert",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8);  // A0
      const nodeAddr = emu.getRegister(9);  // A1
      const afterAddr = emu.getRegister(10); // A2
      lib.insert(listAddr, nodeAddr, afterAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -240, // LVO -240
    name: "AddHead",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8); // A0
      const nodeAddr = emu.getRegister(9); // A1
      lib.addHead(listAddr, nodeAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -246, // LVO -246
    name: "AddTail",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8); // A0
      const nodeAddr = emu.getRegister(9); // A1
      lib.addTail(listAddr, nodeAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -252, // LVO -252
    name: "Remove",
    handler: (emu, lib: ExecLibrary) => {
      const nodeAddr = emu.getRegister(9); // A1
      lib.remove(nodeAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -258, // LVO -258
    name: "RemHead",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8); // A0
      return lib.remHead(listAddr);
    },
  },
  {
    offset: -264, // LVO -264
    name: "RemTail",
    handler: (emu, _lib: ExecLibrary) => {
      // RemTail: remove last node from list, return it (or NULL if empty)
      // Rarely used by SAS/C runtime; stub as NULL for now
      return 0;
    },
  },
  {
    offset: -558, // LVO -558
    name: "InitSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // InitSemaphore(signalSemaphore) - no-op in single-threaded emulation
      return emu.getRegister(0);
    },
  },
  {
    offset: -564, // LVO -564
    name: "ObtainSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // ObtainSemaphore(signalSemaphore) - no-op in single-threaded emulation
      return emu.getRegister(0);
    },
  },
  {
    offset: -570, // LVO -570
    name: "ReleaseSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // ReleaseSemaphore(signalSemaphore) - no-op in single-threaded emulation
      return emu.getRegister(0);
    },
  },
  {
    offset: -594, // LVO -594
    name: "AttemptSemaphore",
    handler: (_emu, _lib: ExecLibrary) => {
      // AttemptSemaphore -> return TRUE (1) = semaphore obtained
      return 1;
    },
  },
  {
    offset: -198, // LVO -198 (0xFF3A)
    name: "AllocMem",
    handler: (emu, lib: ExecLibrary) => {
      const size = emu.getRegister(0); // D0
      const flags = emu.getRegister(1); // D1
      console.log(`[exec-vectors] AllocMem TRAP: size=${size} (0x${size.toString(16)}) flags=0x${flags.toString(16)}`);
      const result = lib.allocMem(size, flags);
      console.log(`[exec-vectors] AllocMem TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -210, // LVO -210 (0xFF2E)
    name: "FreeMem",
    handler: (emu, lib: ExecLibrary, returnAddr?: number) => {
      const memAddr = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
      lib.freeMem(memAddr, size);
      // When the door tears down its heap and returns to the CLI stub (PC around 0x119a),
      // make sure the stack top holds the original seglist return so the final RTS
      // does not jump into random data.
      if (returnAddr === 0x119a) {
        const spAfterPop = emu.getRegister(15);
        const exitTrapAddr = 0x1ff000;
        emu.writeMemory32(spAfterPop, exitTrapAddr);
console.log(
          `[ExecLibrary] FreeMem exit fix: seeded exit trap 0x${exitTrapAddr.toString(
            16
          )} at SP=0x${spAfterPop.toString(16)}`
        );
      }
      return 0;
    },
  },
  {
    offset: -294, // LVO -294 (0xFED6)
    name: "FindTask",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const name = nameAddr ? emu.readString(nameAddr, 64) : "(null - current task)";
      console.log(`[exec-vectors] FindTask TRAP: name="${name}"`);
      const result = lib.findTask(nameAddr);
      console.log(`[exec-vectors] FindTask TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -300, // LVO -300 (SetTaskPri - CORRECTED offset)
    name: "SetTaskPri",
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9); // A1
      const newPri = emu.getRegister(0); // D0
      return lib.setTaskPri(taskAddr, newPri);
    },
  },
  {
    offset: -306, // LVO -306 (SetSignal)
    name: "SetSignal",
    handler: (emu, lib: ExecLibrary) => {
      const newSignals = emu.getRegister(0); // D0
      const signalMask = emu.getRegister(1); // D1
      return lib.setSignal(newSignals, signalMask);
    },
  },
  {
    offset: -390, // LVO -390 (0xFFFFFE7A)
    name: "FindPort",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const result = lib.findPort(nameAddr);
      return result;
    },
  },
  {
    offset: -366, // LVO -366 (0xFFFFFE72)
    name: "PutMsg",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const msgAddr = emu.getRegister(9); // A1
      lib.putMsg(portAddr, msgAddr);
      return 0;
    },
  },
  {
    offset: -372, // LVO -372 (0xFFFFFE6C)
    name: "GetMsg",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const portName = portAddr ? lib.getPortName(portAddr) : "";
      logTrap(`GetMsg TRAP HIT! port=0x${portAddr.toString(16)} name=${portName}`);
console.log(
        `[ExecLibrary][Trap][GetMsg] port=0x${portAddr.toString(
          16
        )} name=${portName}`
      );
      const result = lib.getMsg(portAddr);
      logTrap(`GetMsg returning 0x${result.toString(16)}`);

      // Debug: dump reply message contents when door receives a message
      // jhMessage structure: Message(20) + String[200](20) + Data(220) + Command(224)
      if (result !== 0) {
        const msgType = emu.readMemory(result + 8); // ln_Type
        const command = emu.readMemory32(result + 0xE0); // Command at offset 224
        const data = emu.readMemory32(result + 0xDC); // Data at offset 220
        const strStart = result + 0x14; // String at offset 20
        let str = '';
        for (let i = 0; i < 32; i++) {
          const ch = emu.readMemory(strStart + i);
          if (ch === 0) break;
          str += String.fromCharCode(ch);
        }
console.log(`[ExecLibrary][GetMsg] Door received message:`);
console.log(`  msgAddr=0x${result.toString(16)} ln_Type=${msgType} (6=NT_REPLYMSG)`);
console.log(`  Command=${command} (at 0xE0)`);
console.log(`  Data=${data} (at 0xDC)`);
console.log(`  String="${str}" (at 0x14)`);
        // DEBUG dRE!WAll: dump raw bytes at offsets 0x00, 0x14, 0x100 to rule out field confusion
        if (process.env.DREWALL_TRACE === '1' && command === 100) {
          const dump = (off: number, len: number) => {
            const bs: number[] = [];
            for (let i = 0; i < len; i++) bs.push(emu.readMemory(result + off + i));
            return bs.map(b => b.toString(16).padStart(2, '0')).join(' ');
          };
          console.log(`  [DT_NAME_DEBUG] getMsg raw @msg+0x00..0x13: ${dump(0, 20)}`);
          console.log(`  [DT_NAME_DEBUG] getMsg raw @msg+0x14..0x27: ${dump(0x14, 20)}`);
          console.log(`  [DT_NAME_DEBUG] getMsg raw @msg+0x100..0x107: ${dump(0x100, 8)} (strPtr)`);
        }
      }

      return result;
    },
  },
  {
    offset: -318, // LVO -318 (0xFFFFFEC2)
    name: "Wait",
    handler: (emu, lib: ExecLibrary) => {
      const signalMask = emu.getRegister(0); // D0
console.log(`[ExecLibrary][Trap][Wait] signalMask=0x${signalMask.toString(16)}`);
      const result = lib.wait(signalMask);
console.log(`[ExecLibrary][Trap][Wait] returned 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -324, // LVO -324 (0xFFFFFEBC)
    name: "Signal",
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9); // A1
      const signals = emu.getRegister(0); // D0
      lib.signal(taskAddr, signals);
      return 0;
    },
  },
  {
    offset: -30, // LVO -30 (0xFFFFFFE2)
    name: "Supervisor",
    handler: (emu: any, lib: any, returnAddr: any) => {
      // Supervisor() - Execute a function in supervisor mode
      // Input: A5 = function pointer to execute
      // The function is called with return address on stack
      // Returns: D0 = result from supervisor function

      const a5 = emu.getRegister(13); // A5 - supervisor function pointer
console.log(
        `[LibraryTraps] Supervisor: calling function at 0x${a5.toString(
          16
        )}, returnAddr=0x${returnAddr.toString(16)}`
      );

      // Set PC to the supervisor function address
      // The function will execute and eventually RTS back to returnAddr
      emu.setRegister(16, a5); // PC = supervisor function
      emu.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC

      // CRITICAL: Do NOT push return address - it's already on stack from JSR to Supervisor
      // The supervisor function will RTS to returnAddr (which handleTrap already popped)
      // So we need to push returnAddr back for the supervisor function to RTS to
      const sp = emu.getRegister(15);
      emu.writeMemory32(sp - 4, returnAddr);
      emu.setRegister(15, sp - 4);

console.log(
        `[LibraryTraps] Supervisor: PC set to 0x${a5.toString(
          16
        )}, return will go to 0x${returnAddr.toString(16)}`
      );

      // Return 0 - actual return value will come from supervisor function via D0
      return 0;
    },
  },
  {
    offset: -330, // LVO -330 (0xFFFFFEB6)
    name: "AllocSignal",
    handler: (emu, lib: ExecLibrary) => {
      const signalNum = emu.getRegister(0); // D0 (signed byte, -1 = any free signal)
      const result = lib.AllocSignal(signalNum);
      return result; // Return signal number or -1 in D0
    },
  },
  {
    offset: -354, // LVO -354 (0xFFFFFE9E)
    name: "AddPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(9); // A1 - port pointer
      lib.addPort(portAddr);
      return 0; // AddPort has no return value
    },
  },
  {
    offset: -378, // LVO -378 (0xFFFFFE86)
    name: "ReplyMsg",
    handler: (emu, lib: ExecLibrary) => {
      const msgAddr = emu.getRegister(9); // A1
      lib.replyMsg(msgAddr);
      return 0;
    },
  },
  {
    offset: -384, // LVO -384 (0xFFFFFE80)
    name: "WaitPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const portName = portAddr ? lib.getPortName(portAddr) : "";
console.log(
        `[ExecLibrary][Trap][WaitPort] port=0x${portAddr.toString(
          16
        )} name=${portName}`
      );
      return lib.waitPort(portAddr);
    },
  },
  {
    offset: -114, // LVO -114 (0xFF8E) - amiga.lib CreatePort
    name: "CreatePort",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(8); // A0 = name pointer
      const priority = emu.getRegister(0); // D0 = priority
console.log(`[ExecLibrary][Trap][CreatePort] nameAddr=0x${nameAddr.toString(16)}, priority=${priority}`);
      return lib.createPort(nameAddr, priority);
    },
  },
  {
    offset: -666, // LVO -666 (0xFFFFFD66)
    name: "CreateMsgPort",
    handler: (emu, lib: ExecLibrary) => {
      return lib.createMsgPort();
    },
  },
  {
    offset: -672, // LVO -672 (0xFFFFFD60)
    name: "DeleteMsgPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      lib.deleteMsgPort(portAddr);
      return 0;
    },
  },
  {
    offset: -684, // LVO -684 (0xFFFFFD4C)
    name: "AllocVec",
    handler: (emu, lib: ExecLibrary) => {
      const byteSize = emu.getRegister(0); // D0
      const requirements = emu.getRegister(1); // D1
console.log(
        `[ExecLibrary] AllocVec(${byteSize}, ${requirements}) - using AllocMem`
      );
      return lib.allocMem(byteSize, requirements);
    },
  },
  {
    offset: -690, // LVO -690 (0xFFFFFD46)
    name: "FreeVec",
    handler: (emu, lib: ExecLibrary) => {
      const memPtr = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
console.log(`[ExecLibrary] FreeVec(0x${memPtr.toString(16)}, ${size})`);
      lib.freeMem(memPtr, size);
      return 0;
    },
  },
  {
    offset: -696, // LVO -696 (0xFFFFFD40)
    name: "CreatePool",
    handler: (emu, lib: ExecLibrary) => {
      const requirements = emu.getRegister(0); // D0
      const puddleSize = emu.getRegister(1); // D1
      const threshSize = emu.getRegister(2); // D2
console.log(
        `[ExecLibrary] CreatePool(${requirements}, ${puddleSize}, ${threshSize}) - REAL IMPLEMENTATION`
      );

      // Allocate PoolHeader structure (minimum 32 bytes)
      const poolSize = Math.max(puddleSize, 32);
      const poolAddr = lib.allocMem(poolSize, requirements);

      if (poolAddr !== 0) {
        // Initialize PoolHeader structure
        // This is a simplified AmigaOS PoolHeader structure
console.log(
          `[ExecLibrary] Created pool at 0x${poolAddr.toString(
            16
          )}, size ${puddleSize}`
        );

        // Store pool parameters for later use by AllocPooled/FreePooled
        // We'll use the emulator's memory to track pool info
        const poolInfoAddr = poolAddr + 0x20; // Use space after header for our data
        emu.writeMemory32(poolInfoAddr + 0, puddleSize); // puddleSize
        emu.writeMemory32(poolInfoAddr + 4, threshSize); // threshSize
        emu.writeMemory32(poolInfoAddr + 8, requirements); // requirements
        emu.writeMemory32(poolInfoAddr + 12, poolAddr + 32); // available memory start
        emu.writeMemory32(poolInfoAddr + 16, poolAddr + poolSize); // available memory end
      } else {
console.log(`[ExecLibrary] CreatePool FAILED - returned NULL`);
      }

      return poolAddr;
    },
  },
  {
    offset: -702, // LVO -702 (0xFFFFFD3A)
    name: "DeletePool",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
console.log(`[ExecLibrary] DeletePool(0x${pool.toString(16)})`);
      if (pool !== 0) {
        // For now, just log - actual implementation would free all pool allocations
console.log(
          `[ExecLibrary] Pool 0x${pool.toString(16)} marked for deletion`
        );
      }
      return 0;
    },
  },
  {
    offset: -708, // LVO -708 (0xFFFFFD34)
    name: "AllocPooled",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
console.log(
        `[ExecLibrary] AllocPooled(0x${pool.toString(
          16
        )}, ${size}) - REAL IMPLEMENTATION`
      );

      if (pool === 0) {
console.log(`[ExecLibrary] AllocPooled FAILED - NULL pool pointer`);
        return 0;
      }

      // Check if allocation size is reasonable
      if (size > 0x1000) {
console.log(
          `[ExecLibrary] AllocPooled - Large allocation ${size}, may fail`
        );
      }

      // Allocate memory using our pool management
      const allocation = lib.allocMem(size, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
console.log(
        `[ExecLibrary] AllocPooled allocated 0x${allocation.toString(
          16
        )} from pool 0x${pool.toString(16)}`
      );

      return allocation; // Return valid memory address, NOT NULL!
    },
  },
  {
    offset: -714, // LVO -714 (0xFFFFFD2E)
    name: "FreePooled",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      const mem = emu.getRegister(0); // D0
      const size = emu.getRegister(1); // D1
console.log(
        `[ExecLibrary] FreePooled(0x${pool.toString(16)}, 0x${mem.toString(
          16
        )}, ${size})`
      );

      if (mem !== 0) {
        lib.freeMem(mem, size);
console.log(
          `[ExecLibrary] Freed memory at 0x${mem.toString(
            16
          )} back to pool 0x${pool.toString(16)}`
        );
      }
      return 0;
    },
  },
  {
    // _LVOCopyMem — critical for any V36+ binary doing struct copies (memcpy semantics).
    // Previously missing from the vector list AND missing from LVOs.i stub fallback (wrong path).
    // Symptom: doors call `jsr -0x270(a6)` and the copy silently no-ops, leaving allocated
    // buffers zero-filled where they should contain the source data.
    offset: -624,
    name: "CopyMem",
    handler: (emu, lib: ExecLibrary) => {
      const src = emu.getRegister(8);  // A0 = source
      const dst = emu.getRegister(9);  // A1 = destination
      const size = emu.getRegister(0); // D0 = size in bytes
      lib.copyMem(src, dst, size);
      return 0; // CopyMem returns void
    },
  },
  {
    offset: -630,
    name: "CopyMemQuick",
    handler: (emu, lib: ExecLibrary) => {
      const src = emu.getRegister(8);
      const dst = emu.getRegister(9);
      const size = emu.getRegister(0);
      lib.copyMemQuick(src, dst, size);
      return 0;
    },
  },
  {
    offset: -732, // LVO -732 (0xFFFFFD28)
    name: "StackSwap",
    handler: (emu, lib: ExecLibrary) => {
      const structAddr = emu.getRegister(8); // A0
      try {
        const oldSP = emu.getRegister(15);
        const ln = emu.readMemory32(structAddr); // ln_Succ
        const stNew = emu.readMemory32(structAddr + 4); // stk_Lower
        const stUpper = emu.readMemory32(structAddr + 8); // stk_Upper
        const stSP = emu.readMemory32(structAddr + 12); // stk_Pointer
console.log(
          `[StackSwap] struct=0x${structAddr.toString(
            16
          )} ln=0x${ln.toString(16)} lower=0x${stNew.toString(
            16
          )} upper=0x${stUpper.toString(16)} newSP=0x${stSP.toString(
            16
          )} oldSP=0x${oldSP.toString(16)}`
        );
      } catch (err) {
console.log(`[StackSwap] failed to read struct at 0x${structAddr.toString(16)}`);
      }
      lib.stackSwap(structAddr);
      return 0;
    },
  },
];
