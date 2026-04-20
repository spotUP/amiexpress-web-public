// DoorTrapDispatcher.ts
// Library-trap dispatch + Write/AEDoor call tracking + illegal-instruction
// handling for DoorLifecycleManager. Extracted to keep the parent file
// under the 2000-line size budget.
//
// handleTrapExecution is called once per library-trap-hit PC in the
// emulator's hot loop. It:
//   1. Classifies the trap by offset (DOS.Write, AEDoor.library, other).
//   2. Forwards Write/AEDoor calls to DoorExecutionLogger for call-trace.
//   3. Bumps iteration + tracks A4/A5 register changes for corruption diag.
//   4. Fires door-specific PC-range probes (MultiTop vtable, SAmiLog3
//      free-args return, JMP-A0 regions) — all gated on narrow PC ranges
//      so they're zero-cost outside those windows.
//
// checkAndHandleLibraryTrap is the pre-dispatch gate: dedup + handler
// invocation + progress-record on success.
//
// handleIllegalInstruction handles 0x4AFC ILLEGAL opcodes used for our
// library trap sentinels.

import { MoiraEmulator } from "../../cpu/MoiraEmulator.js";
import { LibraryManager } from "../../LibraryManager.js";
import { LibraryTraps } from "../../api/LibraryTraps.js";
import { debugLog } from "../../../utils/debug-log";
import type { ExecutionState } from "../DoorLifecycleManager.js";
import type { DoorExecutionLogger } from "./DoorExecutionLogger.js";

const DEBUG_68K = process.env.DEBUG_68K === "1";

export interface DoorTrapDispatcherDeps {
  emulator: MoiraEmulator;
  libraryManager: LibraryManager;
  executionState: ExecutionState;
  executionLogger: DoorExecutionLogger;
  /** Live getter — libraryTraps is assigned after construction. */
  getLibraryTraps: () => LibraryTraps | null;
  /** Recent-PC ring buffer — read-only here. */
  getLastPCs: () => number[];
}

export class DoorTrapDispatcher {
  // Dedupe flag for the "A5 out of stack range" native-debug trace so we
  // only log it once per distinct A5 value per run.
  private lastA5OutOfRangeLogged: number = 0;

  constructor(private readonly deps: DoorTrapDispatcherDeps) {}

  /**
   * Pre-dispatch gate for library traps. Returns true when the trap was
   * handled (caller should skip normal instruction execution for this PC).
   * Also provides duplicate-trap suppression — if the same PC fires twice
   * within 2 iterations we skip the second dispatch to avoid re-entering
   * the same library stub.
   */
  checkAndHandleLibraryTrap(pc: number): boolean {
    const libraryTraps = this.deps.getLibraryTraps();
    if (!libraryTraps) {
      return false;
    }
    const { executionState } = this.deps;

    // Duplicate-trap suppression
    if (
      executionState.lastInterceptedTrap === pc &&
      executionState.iterationCount - executionState.lastInterceptedIteration <= 2
    ) {
      executionState.lastInterceptedTrap = 0;
      executionState.lastInterceptedIteration = 0;
      return true;
    }

    const handled = libraryTraps.handleTrap(pc);
    if (handled) {
      executionState.lastInterceptedTrap = pc;
      executionState.lastInterceptedIteration = executionState.iterationCount;
      // Record progress when library calls are made
      executionState.lastProgressIteration = executionState.iterationCount;
      executionState.lastProgressTime = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Process a library-trap hit: classify by offset, feed call-trace
   * logger, bump iteration, diagnose register changes, and run per-door
   * PC-range probes. Called on every library trap in the hot loop — the
   * probes are gated to narrow PC ranges so the non-firing path is cheap.
   */
  handleTrapExecution(pc: number): void {
    const { emulator, libraryManager, executionState, executionLogger } = this.deps;
    const lastPCs = this.deps.getLastPCs();

    // Track library trap calls for debugging
    const a6 = emulator.getRegister(14);
    let offset = pc - a6;

    // Handle 16-bit signed offset wrapping
    if (a6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
      const low16 = offset & 0xffff;
      offset = low16 >= 0x8000 ? low16 - 0x10000 : low16;
    } else if (offset > 0x7fffffff) {
      offset = offset - 0x100000000;
    }

    const execLib = libraryManager.execLibrary;
    if (!execLib) {
      return;
    }

    const safeRead32 = (addr: number): number | null => {
      try {
        return emulator.readMemory32(addr >>> 0);
      } catch {
        return null;
      }
    };

    // Track DOS.Write() calls
    if (offset === -48 || pc === 0xfffffed0) {
      executionState.writeCallCount++;
      executionLogger.logWriteCall(pc);
    }

    // Track AEDoor.library calls
    if (a6 === 0xff4000 || (a6 >= 0xff4000 && a6 <= 0xff4fff)) {
      executionState.aedoorCallCount++;
      executionLogger.logAEDoorCall(pc, offset);
    }

    executionState.iterationCount++;
    // DO NOT update lastProgressIteration here — that defeats the loop guard!
    // It should only be updated when actual progress is made (XIM messages,
    // file I/O, etc.)
    // Track A4/A5 changes to catch early corruption; log nearby frame slots
    const a4 = emulator.getRegister(12);
    const a5 = emulator.getRegister(13);
    const instrWord = emulator.readMemory16(pc);
    if (
      (a4 !== 0 && a4 !== executionState.lastSignificantPC) ||
      a5 !== executionState.lastInterceptedTrap
    ) {
      if (DEBUG_68K) {
        const memA4m40 =
          a4 !== 0 ? emulator.readMemory32((a4 - 0x40) >>> 0) : 0;
        const memA4m1c =
          a4 !== 0 ? emulator.readMemory32((a4 - 0x1c) >>> 0) : 0;
        debugLog(
          `[DoorLifecycleManager] A4/A5 change iter=${executionState.iterationCount} PC=0x${pc.toString(16)} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)} [-0x40]=0x${memA4m40.toString(16)} [-0x1c]=0x${memA4m1c.toString(16)}`,
        );
      }
      if (process.env.DEBUG_68K_NATIVE === "1") {
        const stackLower = execLib?.getStackLower?.() || 0;
        const stackUpper = execLib?.getStackUpper?.() || 0;
        if (
          stackLower !== 0 &&
          stackUpper !== 0 &&
          (a5 < stackLower || a5 > stackUpper) &&
          a5 !== this.lastA5OutOfRangeLogged
        ) {
          this.lastA5OutOfRangeLogged = a5;
          const cpu = (emulator as any)["cpu"];
          debugLog(
            `[DoorLifecycleManager] A5 out of stack range: A5=0x${a5.toString(16)} stack=[0x${stackLower.toString(16)}-0x${stackUpper.toString(16)}] PC=0x${pc.toString(16)}`,
          );
          const logCount = cpu ? cpu.nativeLoggedInstructions?.() || 0 : 0;
          if (cpu && logCount > 0) {
            debugLog(
              `[DoorLifecycleManager] Last ${Math.min(logCount, 20)} native instructions before A5 change:`,
            );
            const start = Math.max(0, logCount - 20);
            for (let i = start; i < logCount; i++) {
              const logPc = cpu.nativeGetLogEntryPC?.(i) || 0;
              const disasm = cpu.nativeDisassemble?.(logPc) || "???";
              debugLog(
                `[DoorLifecycleManager]   0x${logPc.toString(16)}: ${disasm}`,
              );
            }
          }
        }
      }
      executionState.lastSignificantPC = a4;
      executionState.lastInterceptedTrap = a5;
    }

    // Generic probe for indirect jsr/jmp through A0/A1/A2 to catch runaway targets
    const isIndirectJump =
      instrWord === 0x4ed0 ||
      instrWord === 0x4ed1 ||
      instrWord === 0x4ed2 ||
      instrWord === 0x4e90 ||
      instrWord === 0x4e91 ||
      instrWord === 0x4e92;
    if (isIndirectJump) {
      const targetRegIndex = 8 + (instrWord & 0x7);
      const targetRegValue = emulator.getRegister(targetRegIndex);
      const memTarget = safeRead32(targetRegValue);
      const memA4m4c = a4 !== 0 ? emulator.readMemory32((a4 - 0x4c) >>> 0) : 0;
      const memA4m50 = a4 !== 0 ? emulator.readMemory32((a4 - 0x50) >>> 0) : 0;
      const memA4m58 = a4 !== 0 ? emulator.readMemory32((a4 - 0x58) >>> 0) : 0;
      const memA5m58 = safeRead32(a5 - 0x58);
      const mem5cda = safeRead32(0x5cda);
      const mem5cfa = safeRead32(0x5cfa);
      const mem4b90 = safeRead32(0x4b90);
      const sp = emulator.getRegister(15);
      const lastPcTrace = lastPCs.map((p) => `0x${p.toString(16)}`).join(",");
      const formatVal = (value: number | null): string =>
        value === null ? "<err>" : `0x${value.toString(16)}`;
      debugLog(
        `[DoorLifecycleManager] INDIRECT-${instrWord >= 0x4ed0 ? "JMP" : "JSR"} pc=0x${pc.toString(16)} iter=${executionState.iterationCount} sp=0x${sp.toString(16)} targetReg=a${(instrWord & 0x7).toString(16)} target=0x${targetRegValue.toString(16)} [target]=${formatVal(memTarget)} A4=0x${a4.toString(16)} [-0x4c(A4)]=0x${memA4m4c.toString(16)} [-0x50(A4)]=0x${memA4m50.toString(16)} [-0x58(A4)]=0x${memA4m58.toString(16)} A5=0x${a5.toString(16)} [-0x58(A5)]=${formatVal(memA5m58)} [0x5cda]=${formatVal(mem5cda)} [0x5cfa]=${formatVal(mem5cfa)} [0x4b90]=${formatVal(mem4b90)} lastPCs=[${lastPcTrace}]`,
      );
    }

    // Focused trace for MultiTop vtable call region (offset ~0x3bb0 -> PC ~0x4bb0)
    if (pc >= 0x4b20 && pc <= 0x4c30) {
      const sp = emulator.getRegister(15);
      const a0 = emulator.getRegister(8);
      const a1 = emulator.getRegister(9);
      const memA5m58 = emulator.readMemory32((a5 - 0x58) >>> 0);
      const memA0 = emulator.readMemory32(a0 >>> 0);
      const memA1p28 = emulator.readMemory32((a1 + 0x28) >>> 0);
      const memA4p8 = a4 !== 0 ? emulator.readMemory32((a4 + 0x8) >>> 0) : 0;
      const lastPcTrace = lastPCs.map((p) => `0x${p.toString(16)}`).join(",");
      debugLog(
        `[DoorLifecycleManager] VTABLE probe PC=0x${pc.toString(16)} iter=${executionState.iterationCount} SP=0x${sp.toString(16)} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} [-0x58(A5)]=0x${memA5m58.toString(16)} [A0]=0x${memA0.toString(16)} [A1+0x28]=0x${memA1p28.toString(16)} [A4+0x8]=0x${memA4p8.toString(16)} lastPCs=[${lastPcTrace}]`,
      );
    }

    // Probe near the post-FreeArgs jump site (observed PCs ~0x5c90-0x5cfa before runaway)
    if (pc >= 0x5c90 && pc <= 0x5d10) {
      const sp = emulator.getRegister(15);
      const a0 = emulator.getRegister(8);
      const a1 = emulator.getRegister(9);
      const memA5m58 = emulator.readMemory32((a5 - 0x58) >>> 0);
      const memA0 = emulator.readMemory32(a0 >>> 0);
      const memA1p28 = emulator.readMemory32((a1 + 0x28) >>> 0);
      const memA4p8 = a4 !== 0 ? emulator.readMemory32((a4 + 0x8) >>> 0) : 0;
      const lastPcTrace = lastPCs.map((p) => `0x${p.toString(16)}`).join(",");
      debugLog(
        `[DoorLifecycleManager] POST-FREEARGS probe PC=0x${pc.toString(16)} iter=${executionState.iterationCount} SP=0x${sp.toString(16)} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} [-0x58(A5)]=0x${memA5m58.toString(16)} [A0]=0x${memA0.toString(16)} [A1+0x28]=0x${memA1p28.toString(16)} [A4+0x8]=0x${memA4p8.toString(16)} lastPCs=[${lastPcTrace}] SP=0x${sp.toString(16)}`,
      );
    }

    // Probe jmp return blocks around 0x4c52/0x4c54 that may jump via A0
    if (pc >= 0x4c40 && pc <= 0x4c60) {
      const sp = emulator.getRegister(15);
      const a0 = emulator.getRegister(8);
      const a1 = emulator.getRegister(9);
      const a2 = emulator.getRegister(10);
      const memA4m4c = a4 !== 0 ? emulator.readMemory32((a4 - 0x4c) >>> 0) : 0;
      const memA4m50 = a4 !== 0 ? emulator.readMemory32((a4 - 0x50) >>> 0) : 0;
      const memA4m58 = a4 !== 0 ? emulator.readMemory32((a4 - 0x58) >>> 0) : 0;
      const memA5m58 = emulator.readMemory32((a5 - 0x58) >>> 0);
      const memA0 = emulator.readMemory32(a0 >>> 0);
      const memA1 = emulator.readMemory32(a1 >>> 0);
      const memA2 = emulator.readMemory32(a2 >>> 0);
      const lastPcTrace = lastPCs.map((p) => `0x${p.toString(16)}`).join(",");
      debugLog(
        `[DoorLifecycleManager] JMP-A0 probe PC=0x${pc.toString(16)} iter=${executionState.iterationCount} SP=0x${sp.toString(16)} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} A2=0x${a2.toString(16)} [-0x4c(A4)]=0x${memA4m4c.toString(16)} [-0x50(A4)]=0x${memA4m50.toString(16)} [-0x58(A4)]=0x${memA4m58.toString(16)} [-0x58(A5)]=0x${memA5m58.toString(16)} [A0]=0x${memA0.toString(16)} [A1]=0x${memA1.toString(16)} [A2]=0x${memA2.toString(16)} lastPCs=[${lastPcTrace}]`,
      );
    }
    // REMOVED: Per-trap setImmediate was causing severe slowdown for 68K doors.
    // This method is called on EVERY library trap (every character printed, every API call).
    // Yielding here causes "slow motion" output. The time-based yield at top of execution
    // loop (every YIELD_INTERVAL_MS) is sufficient for event loop responsiveness.
  }

  /**
   * Handle ILLEGAL (0x4AFC) — our library-trap sentinel opcode. Returns
   * true if the emulator recognised this address as a known trap and
   * dispatched it (caller should advance iteration).
   */
  handleIllegalInstruction(pc: number): boolean {
    const { emulator, executionState } = this.deps;
    const instrAtPC = emulator.readMemory16(pc);
    if (instrAtPC === 0x4afc) {
      debugLog(
        `[DoorLifecycleManager] ILLEGAL DETECTED at PC=0x${pc.toString(16)}`,
      );
      const handled = emulator.handleIllegal(pc);
      if (handled) {
        executionState.iterationCount++;
        // Note: no yield here — illegal instructions are rare and
        // shouldn't block.
        return true;
      }
    }
    return false;
  }
}
