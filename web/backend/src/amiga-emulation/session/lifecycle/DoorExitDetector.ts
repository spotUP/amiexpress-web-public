// DoorExitDetector.ts
// Exit-condition checks, PC formatting, and paused-state polling for
// DoorLifecycleManager. Extracted to keep the parent file under the
// 2000-line size budget. Behaviour unchanged — this is a straight lift
// of three private methods with their `this` references converted to
// dependency accesses.
//
// The detector holds a mutable state slice (codeLowerBound, codeUpperBound,
// lastA4ZeroLogged) that was previously stored on DoorLifecycleManager.
// Everything else flows through a deps bag passed at construction.

import * as path from "path";
import { Socket } from "socket.io";
import { MoiraEmulator } from "../../cpu/MoiraEmulator.js";
import { DoorConfig } from "../../DoorTypes.js";
import { LibraryManager } from "../../LibraryManager.js";
import { LibraryTraps } from "../../api/LibraryTraps.js";
import { DoorLoader } from "../../DoorLoader.js";
import { SysopDebugUtil } from "../../../utils/sysop-debug.util.js";
import { debugLog } from "../../../utils/debug-log";
import type { ExecutionState } from "../DoorLifecycleManager.js";

/**
 * Mutable code-region bounds shared by DoorLifecycleManager and
 * DoorExitDetector. Passed by reference so the first-iteration compute
 * done inside checkExitConditions is visible to code-region checks
 * elsewhere in the parent manager's execution loop.
 */
export interface CodeBoundsRef {
  lowerBound: number;
  upperBound: number;
}

export interface DoorExitDetectorDeps {
  emulator: MoiraEmulator;
  socket: Socket;
  config: DoorConfig;
  libraryManager: LibraryManager;
  doorLoader: DoorLoader;
  executionState: ExecutionState;
  /** Shared code-region bounds (mutated on first checkExitConditions). */
  codeBounds: CodeBoundsRef;
  /** Live getter — libraryTraps is assigned after construction. */
  getLibraryTraps: () => LibraryTraps | null;
  /** Ring of recent PCs for symbol-aware exit logs. Read-only here. */
  getLastPCs: () => number[];
  /** Longer PC history snapshot used by crash reports. */
  getPcHistory: () => number[];
  /** Callback — invoked when an exit condition fires. */
  terminate: () => void;
  /** Paused-state polling hooks (supplied by the parent manager). */
  pollXIMMessages: () => Promise<void>;
  pollTIMMessages: () => Promise<void>;
}

export class DoorExitDetector {
  // Dedupe flag for the "A4 became zero" critical-error trace so we only
  // log it once per run even if PC bounces repeatedly through the same
  // invalid region.
  private lastA4ZeroLogged = false;

  constructor(private readonly deps: DoorExitDetectorDeps) {}

  /**
   * While the emulator is paused (blocking Wait()/getStr/etc.), keep the
   * XIM/TIM message pumps running so the door's reply eventually arrives.
   * Without this, XIM doors deadlock: emulator paused → no polling →
   * reply never sent → Signal() never called → door stays paused forever
   * until timeout.
   */
  async handlePausedState(): Promise<void> {
    const effectiveDoorType = (this.deps.config.doorType || "SIM").toUpperCase();

    if (effectiveDoorType === "XIM") {
      await this.deps.pollXIMMessages();
    } else {
      // TIM, SIM, IIM, SUP doors all use DoorControl port (express.e:4316-4320)
      const usesDoorControl =
        effectiveDoorType === "TIM" ||
        effectiveDoorType === "SIM" ||
        effectiveDoorType === "IIM" ||
        effectiveDoorType === "SUP";
      if (usesDoorControl) {
        await this.deps.pollTIMMessages();
      }
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  /**
   * Format a PC value for logging. If the door binary had HUNK_SYMBOL
   * entries, annotate with the nearest preceding symbol
   * (e.g. "0x3272 (main+0x42)").
   */
  formatPC(pc: number): string {
    const resolver = this.deps.doorLoader.getSymbolResolver();
    if (resolver) return resolver.format(pc);
    return `0x${(pc >>> 0).toString(16)}`;
  }

  /**
   * Check whether the current PC is an exit sentinel, crashed into low
   * memory, or wandered outside every valid code region. Returns true if
   * the lifecycle was terminated by this call (caller must stop looping).
   */
  checkExitConditions(pc: number): boolean {
    const { emulator, socket, config, libraryManager, executionState } = this.deps;
    const lastPCs = this.deps.getLastPCs();
    const libraryTraps = this.deps.getLibraryTraps();

    // Exit trap: Door returned to our sentinel address
    if (pc === 0xffff00 || pc === 0x1ff000) {
      const returnCode = emulator.getRegister(0);
      // Pull the most recent non-trap PC from the recent-PC ring buffer (if any)
      let lastRealPc = -1;
      for (let i = lastPCs.length - 1; i >= 0; i--) {
        const candidate = lastPCs[i];
        if (candidate !== 0xffff00 && candidate !== 0x1ff000) {
          lastRealPc = candidate;
          break;
        }
      }
      debugLog(`[DoorLifecycleManager] === DOOR EXITED CLEANLY ===`);
      debugLog(`[DoorLifecycleManager] Return code (D0): ${returnCode}`);
      if (lastRealPc >= 0) {
        debugLog(
          `[DoorLifecycleManager] Last PC before exit: ${this.formatPC(lastRealPc)}`,
        );
      }
      debugLog(
        `[DoorLifecycleManager] Total iterations: ${executionState.iterationCount}`,
      );

      // Emit non-zero exit codes to sysop terminal for visibility
      if (returnCode !== 0) {
        const doorName = config.doorId || "Unknown";
        // AmigaDOS return codes: 0=OK, 5=WARN, 10=ERROR, 20=FAIL
        const codeDesc =
          returnCode === 5
            ? "WARN"
            : returnCode === 10
              ? "ERROR"
              : returnCode === 20
                ? "FAIL"
                : `code ${returnCode}`;
        socket.emit(
          "ansi-output",
          `\x1b[33m[68K] ${doorName} exited with ${codeDesc}\x1b[0m\r\n`,
        );
      }

      this.deps.terminate();
      return true;
    }

    // Low memory PC (crash/corruption)
    if (pc < 0x100 && executionState.iterationCount > 100) {
      const a4 = emulator.getRegister(12);
      const a5 = emulator.getRegister(13);
      const sp = emulator.getRegister(15);
      let lastRealPc = -1;
      for (let i = lastPCs.length - 1; i >= 0; i--) {
        const candidate = lastPCs[i];
        if (candidate >= 0x100) {
          lastRealPc = candidate;
          break;
        }
      }
      const lastFormatted = lastRealPc >= 0 ? this.formatPC(lastRealPc) : "unknown";
      debugLog(
        `[DoorLifecycleManager] PC in low memory (0x${pc.toString(16)}) - likely stack corruption; last-PC=${lastFormatted} SP=0x${sp.toString(16)} A4=0x${a4.toString(16)} A5=0x${a5.toString(16)}`,
      );
      this.deps.terminate();
      return true;
    }

    const execLib = libraryManager.execLibrary;
    if (!execLib) {
      return false;
    }

    if (libraryTraps?.isTrapAddress(pc)) {
      // Allow transitions through AEDoor/Exec trap stubs used for GetMsg/PutMsg
      return false;
    }

    // Compute code bounds once from the seglist header so we can spot runaway PCs
    if (this.deps.codeBounds.lowerBound === 0 || this.deps.codeBounds.upperBound === 0) {
      try {
        const taskAddr = execLib.getCurrentTaskAddress();
        if (taskAddr !== null) {
          const segListBptr = emulator.readMemory32(taskAddr + 0x80);
          if (segListBptr) {
            const headerAddr = segListBptr << 2;
            const sizeLongs = emulator.readMemory32(headerAddr);
            this.deps.codeBounds.lowerBound = headerAddr + 8;
            this.deps.codeBounds.upperBound = this.deps.codeBounds.lowerBound + sizeLongs * 4;
          }
        }
      } catch {
        /* ignore */
      }
    }

    const romStart = 0xf80000;
    const trapRegion = this.deps.codeBounds.upperBound + 0x2000; // allow a little headroom for stubs
    const a5 = emulator.getRegister(13);
    const execBase = execLib.getExecBaseAddress() ?? 0;
    const dosBase = execLib.getLibraryBase("dos.library") ?? 0;
    const intuitionBase = execLib.getLibraryBase("intuition.library") ?? 0;
    const graphicsBase = execLib.getLibraryBase("graphics.library") ?? 0;
    const utilityBase = execLib.getLibraryBase("utility.library") ?? 0;
    const aedoorBase = execLib.getLibraryBase("AEDoor.library") ?? 0;
    const iconBase = execLib.getLibraryBase("icon.library") ?? 0;
    const execWindowLow = execBase ? execBase - 0x800 : 0;
    const execWindowHigh = execBase ? execBase + 0x2000 : 0;
    const dosWindowLow = dosBase ? dosBase - 0x800 : 0;
    const dosWindowHigh = dosBase ? dosBase + 0x2000 : 0;
    const stubBases = [
      intuitionBase,
      graphicsBase,
      utilityBase,
      aedoorBase,
      iconBase,
    ].filter((b) => b && b > 0) as number[];
    // Broadly allow stubs: any PC within base-0x1000 .. base+0x400000 is allowed
    const stubWindows = stubBases.map((b) => ({
      low: b - 0x1000,
      high: b + 0x400000,
    }));
    const inStubByA5 = stubBases.includes(a5);
    const safeRead32 = (addr: number): number | null => {
      try {
        return emulator.readMemory32(addr >>> 0);
      } catch {
        return null;
      }
    };

    if (
      this.deps.codeBounds.lowerBound &&
      this.deps.codeBounds.upperBound &&
      !inStubByA5 &&
      pc > trapRegion &&
      pc < romStart &&
      !(pc >= execWindowLow && pc <= execWindowHigh) &&
      !(pc >= dosWindowLow && pc <= dosWindowHigh) &&
      !stubWindows.some((w) => pc >= w.low && pc <= w.high)
    ) {
      // If the PC landed inside the current stack bounds, assume a post-exit RTS into the stack
      // and treat it as a clean termination rather than a crash.
      const stackLower =
        (libraryManager as any)?.execLibrary?.getStackLower?.() ?? null;
      const stackUpper =
        (libraryManager as any)?.execLibrary?.getStackUpper?.() ?? null;
      if (
        stackLower !== null &&
        stackUpper !== null &&
        pc >= stackLower &&
        pc <= stackUpper + 0x100
      ) {
        debugLog(
          `[DoorLifecycleManager] PC reached stack region after exit (pc=0x${pc.toString(16)} stack=[0x${stackLower.toString(16)}-0x${stackUpper.toString(16)}]) - treating as clean termination`,
        );
        this.deps.terminate();
        return true;
      }

      const sp = emulator.getRegister(15);
      const d0 = emulator.getRegister(0);
      const d1 = emulator.getRegister(1);
      const a4 = emulator.getRegister(12);
      const a0 = emulator.getRegister(8);
      const a1 = emulator.getRegister(9);
      const stackWords: string[] = [];
      for (let i = 0; i < 5; i++) {
        try {
          const word = emulator.readMemory32(sp + i * 4);
          stackWords.push(`SP+${i * 4}=0x${word.toString(16)}`);
        } catch {
          stackWords.push(`SP+${i * 4}=<err>`);
        }
      }
      const memA5m58 = safeRead32(a5 - 0x58);
      const memA0 = safeRead32(a0);
      const memA1p28 = safeRead32(a1 + 0x28);
      const memA4p8 = safeRead32(a4 + 0x8);
      const lastPcTrace = lastPCs.map((p) => `0x${p.toString(16)}`).join(",");
      const lastPcBytes = lastPCs
        .map((p) => {
          try {
            const w = emulator.readMemory16(p >>> 0);
            return `0x${p.toString(16)}:${w.toString(16)}`;
          } catch {
            return `0x${p.toString(16)}:<err>`;
          }
        })
        .join(",");
      if (a4 === 0 && !this.lastA4ZeroLogged) {
        this.lastA4ZeroLogged = true;
        console.error(
          `[DoorLifecycleManager] CRITICAL: A4 became 0 pc=0x${pc.toString(16)} sp=0x${sp.toString(16)} a5=0x${a5.toString(16)} a6=0x${emulator.getRegister(14).toString(16)} stack=[${stackWords.join(" ")}] lastPCs=[${lastPcTrace}]`,
        );
      }
      debugLog(
        `[DoorLifecycleManager] WARNING: PC out of code region: pc=0x${pc.toString(16)} code=[0x${this.deps.codeBounds.lowerBound.toString(16)}-0x${this.deps.codeBounds.upperBound.toString(16)}] sp=0x${sp.toString(16)} d0=0x${d0.toString(16)} d1=0x${d1.toString(16)} a0=0x${a0.toString(16)} a1=0x${a1.toString(16)} a4=0x${a4.toString(16)} a5=0x${a5.toString(16)} stack=[${stackWords.join(" ")}] lastPCs=[${lastPcTrace}] [-0x58(A5)]=0x${(memA5m58 ?? 0).toString(16)} [A0]=0x${(memA0 ?? 0).toString(16)} [A1+0x28]=0x${(memA1p28 ?? 0).toString(16)} [A4+0x8]=0x${(memA4p8 ?? 0).toString(16)} lastPCbytes=[${lastPcBytes}]`,
      );
      // Smart PC bounds check: only terminate for definitely invalid addresses.
      // High memory execution (0x4fxxxx etc) is legitimate for dynamically
      // loaded code. But we should catch truly corrupted PCs:
      // - PC = 0 (null pointer execution)
      // - PC at odd address (68K requires even addresses)
      // - PC in very low memory (below 0x400 is vectors/system area)
      const isCriticallyInvalid =
        pc === 0 ||
        (pc & 1) !== 0 ||
        pc < 0x400;

      if (isCriticallyInvalid) {
        console.error(
          `[DoorLifecycleManager] CRITICAL: PC at invalid address 0x${pc.toString(16)} - terminating`,
        );
        this.deps.terminate();
        return true;
      }
      if (emulator.isCallTrackingEnabled?.() && emulator.dumpCallStack) {
        emulator.dumpCallStack();
      }
      // Otherwise just log warning but continue (legitimate high-memory code)
    }

    return false;
  }

  /**
   * Handle a thrown error from the execution loop — assemble a crash dump
   * (registers, stack, memory probes, PC history) and hand it to
   * SysopDebugUtil.debugDoorCrash for sysop-visible reporting, then emit
   * door:error on the socket and terminate the lifecycle.
   */
  async handleExecutionError(error: unknown): Promise<void> {
    const { emulator, socket, config, executionState } = this.deps;
    const pc = emulator.getRegister(16);
    const sp = emulator.getRegister(15);
    const doorName = path.basename(config.executablePath);

    console.error("[DoorLifecycleManager] ERROR in execution loop:", error);
    console.error(
      `[DoorLifecycleManager] Iteration: ${executionState.iterationCount}`,
    );
    console.error(`[DoorLifecycleManager] PC: 0x${pc.toString(16)}`);
    console.error(`[DoorLifecycleManager] SP: 0x${sp.toString(16)}`);
    console.error(
      `[DoorLifecycleManager] Stack: ${
        error instanceof Error ? error.stack : "No stack"
      }`,
    );

    // Gather all registers for the crash dump
    const registers = {
      d0: emulator.getRegister(0),
      d1: emulator.getRegister(1),
      d2: emulator.getRegister(2),
      d3: emulator.getRegister(3),
      d4: emulator.getRegister(4),
      d5: emulator.getRegister(5),
      d6: emulator.getRegister(6),
      d7: emulator.getRegister(7),
      a0: emulator.getRegister(8),
      a1: emulator.getRegister(9),
      a2: emulator.getRegister(10),
      a3: emulator.getRegister(11),
      a4: emulator.getRegister(12),
      a5: emulator.getRegister(13),
      a6: emulator.getRegister(14),
    };

    // Read stack contents (8 longwords starting at SP)
    const stackContents: number[] = [];
    try {
      for (let i = 0; i < 8; i++) {
        const addr = sp + i * 4;
        if (addr >= 0 && addr < 0x1000000) {
          stackContents.push(emulator.readMemory32(addr));
        }
      }
    } catch {
      // Ignore memory read errors during crash dump
    }

    // Gather memory at key locations
    const memoryDump: { address: number; value: number; label?: string }[] = [];
    try {
      // A4-relative data (small data model)
      const a4 = registers.a4;
      if (a4 >= 0x7ffe) {
        memoryDump.push({
          address: a4 - 0x40,
          value: emulator.readMemory32(a4 - 0x40),
          label: "A4-0x40",
        });
        memoryDump.push({
          address: a4 - 0x1c,
          value: emulator.readMemory32(a4 - 0x1c),
          label: "A4-0x1c",
        });
      }
      // A5-relative frame (Amiga E runtime)
      const a5 = registers.a5;
      if (a5 > 0) {
        memoryDump.push({
          address: a5 - 0x28,
          value: emulator.readMemory32(a5 - 0x28),
          label: "A5-0x28 execbase",
        });
        memoryDump.push({
          address: a5 - 0x2c,
          value: emulator.readMemory32(a5 - 0x2c),
          label: "A5-0x2c dosbase",
        });
      }
      // Memory at PC (what instruction caused the crash)
      if (pc > 0 && pc < 0x1000000) {
        memoryDump.push({
          address: pc,
          value: emulator.readMemory32(pc),
          label: "at PC",
        });
      }
    } catch {
      // Ignore memory read errors during crash dump
    }

    SysopDebugUtil.debugDoorCrash(socket, config.bbsSession, doorName, {
      pc,
      sp,
      iteration: executionState.iterationCount,
      error: error instanceof Error ? error.message : String(error),
      registers,
      pcHistory: [...this.deps.getPcHistory()],
      stackContents,
      memoryDump,
      lastSignificantPC: executionState.lastSignificantPC,
      writeCallCount: executionState.writeCallCount,
      aedoorCallCount: executionState.aedoorCallCount,
      stackBase: 0x6e74, // From DoorLoader
      stackSize: config.stack || 8192,
      stack: error instanceof Error ? error.stack : undefined,
    });

    socket.emit("door:error", {
      message: error instanceof Error ? error.message : "Execution error",
    });
    this.deps.terminate();
  }
}
