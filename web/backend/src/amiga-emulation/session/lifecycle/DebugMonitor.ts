/**
 * DebugMonitor - Door execution debug monitoring and logging
 * Extracted from DoorLifecycleManager for modularity
 */

import { MoiraEmulator } from "../../cpu/MoiraEmulator.js";
import { LibraryManager } from "../../LibraryManager.js";

export class DebugMonitor {
  private emulator: MoiraEmulator;
  private libraryManager: LibraryManager;
  private lastPCs: number[] = [];
  private watchValueOffsets: number[] = [];
  private lastWatchedValues: Map<number, number> = new Map();
  private lastA6Logged: number = 0;
  private lastExecBasePointer: number = 0;
  private pcProbeRanges: Array<{ start: number; end: number; hits: number }> = [];
  private pcProbeMaxHits: number = 10;

  constructor(
    emulator: MoiraEmulator,
    libraryManager: LibraryManager,
    pcProbeRanges?: Array<{ start: number; end: number; hits: number }>,
    pcProbeMaxHits?: number
  ) {
    this.emulator = emulator;
    this.libraryManager = libraryManager;
    if (pcProbeRanges) this.pcProbeRanges = pcProbeRanges;
    if (pcProbeMaxHits) this.pcProbeMaxHits = pcProbeMaxHits;
  }

  setLastPCs(pcs: number[]): void {
    this.lastPCs = pcs;
  }

  setWatchValueOffsets(offsets: number[]): void {
    this.watchValueOffsets = offsets;
  }

  /**
   * Probe indirect control flow (JSR/JMP) to understand startup and critical code paths
   */
  probeIndirectFlow(pc: number): void {
    try {
      const instrWord = this.emulator.readMemory16(pc >>> 0);
      const opType = instrWord & 0xffc0;
      const isJsr = opType === 0x4e80;
      const isJmp = opType === 0x4ec0;
      const inStartupFlow = pc >= 0x3b00 && pc <= 0x3c00;
      const inPostFreeRange = pc >= 0x5c90 && pc <= 0x5d10;
      if (!isJsr && !isJmp && !inPostFreeRange && !inStartupFlow) {
        return;
      }

      const safeRead16 = (addr: number): number | null => {
        try {
          return this.emulator.readMemory16(addr >>> 0);
        } catch {
          return null;
        }
      };
      const safeRead32 = (addr: number): number | null => {
        try {
          return this.emulator.readMemory32(addr >>> 0);
        } catch {
          return null;
        }
      };
      const signExtend16 = (val: number): number =>
        val & 0x8000 ? val - 0x10000 : val;

      const mmm = (instrWord >> 3) & 0x7;
      const regField = instrWord & 0x7;
      const a0 = this.emulator.getRegister(8);
      const a1 = this.emulator.getRegister(9);
      const a2 = this.emulator.getRegister(10);
      const a4 = this.emulator.getRegister(12);
      const a5 = this.emulator.getRegister(13);
      const a6 = this.emulator.getRegister(14);
      const sp = this.emulator.getRegister(15);
      let target: number | null = null;
      let extWord: number | null = null;
      let extLong: number | null = null;

      if (isJsr || isJmp) {
        extWord = safeRead16(pc + 2);
        switch (mmm) {
          case 2: {
            target = this.emulator.getRegister(8 + regField);
            break;
          }
          case 5: {
            if (extWord !== null) {
              const base = this.emulator.getRegister(8 + regField);
              target = (base + signExtend16(extWord)) >>> 0;
            }
            break;
          }
          case 7: {
            if (regField === 0 && extWord !== null) {
              target = signExtend16(extWord) >>> 0;
            } else if (regField === 1) {
              extLong = safeRead32(pc + 2);
              if (extLong !== null) {
                target = extLong >>> 0;
              }
            }
            break;
          }
          default:
            break;
        }
      }

      const targetMem = target !== null ? safeRead32(target) : null;
      const memA5m58 = safeRead32(a5 - 0x58);
      const mem5cda = safeRead32(0x5cda);
      const mem5cfa = safeRead32(0x5cfa);
      const mem4b90 = safeRead32(0x4b90);
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
      const formatVal = (value: number | null): string =>
        value === null ? "<err>" : `0x${value.toString(16)}`;

      if (inStartupFlow || inPostFreeRange) {
        const targetBytes =
          target !== null
            ? [safeRead16(target), safeRead16(target + 2)]
                .map((v) => (v === null ? "<err>" : `0x${v.toString(16)}`))
                .join(",")
            : "<none>";
console.log(
          `[DebugMonitor] FLOW probe pc=0x${pc.toString(
            16
          )} instr=0x${instrWord.toString(
            16
          )} kind=${isJsr ? "JSR" : isJmp ? "JMP" : "PCWIN"} mode=${mmm}/${regField} target=${
            target !== null ? `0x${target.toString(16)}` : "<unk>"
          } ext=${
            extWord !== null ? `0x${extWord.toString(16)}` : "<none>"
          } extLong=${
            extLong !== null ? `0x${extLong.toString(16)}` : "<none>"
          } targetWords=${targetBytes} sp=0x${sp.toString(
            16
          )} A0=0x${a0.toString(16)} A1=0x${a1.toString(
            16
          )} A2=0x${a2.toString(16)} A4=0x${a4.toString(
            16
          )} A5=0x${a5.toString(16)} A6=0x${a6.toString(
            16
          )} [-0x58(A5)]=${formatVal(memA5m58)} [target]=${formatVal(
            targetMem
          )} [0x5cda]=${formatVal(mem5cda)} [0x5cfa]=${formatVal(
            mem5cfa
          )} [0x4b90]=${formatVal(mem4b90)} lastPCs=[${lastPcTrace}]`
        );
      }
    } catch {
      /* ignore probe errors */
    }
  }

  /**
   * Log when A6 changes to non-library base (helps track door library usage)
   */
  logA6Change(pc: number): void {
    const execBase = this.libraryManager.execLibrary?.getExecBaseAddress();
    const dosBase =
      this.libraryManager.execLibrary?.getLibraryBase("dos.library") ?? 0;
    const intuitionBase =
      this.libraryManager.execLibrary?.getLibraryBase("intuition.library") ?? 0;
    const graphicsBase =
      this.libraryManager.execLibrary?.getLibraryBase("graphics.library") ?? 0;
    const utilityBase =
      this.libraryManager.execLibrary?.getLibraryBase("utility.library") ?? 0;
    const allowedBases = [
      execBase,
      dosBase,
      intuitionBase,
      graphicsBase,
      utilityBase,
    ].filter((b) => b && b > 0) as number[];

    const a6 = this.emulator.getRegister(14);
    const isAllowed = allowedBases.includes(a6);
    if (a6 !== this.lastA6Logged && !isAllowed) {
      const sp = this.emulator.getRegister(15);
      const stackWords: string[] = [];
      for (let i = 0; i < 5; i++) {
        try {
          const word = this.emulator.readMemory32(sp + i * 4);
          stackWords.push(`SP+${i * 4}=0x${word.toString(16)}`);
        } catch {
          stackWords.push(`SP+${i * 4}=<err>`);
        }
      }
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
console.log(
        `[DebugMonitor] A6 change pc=0x${pc.toString(
          16
        )} newA6=0x${a6.toString(16)} allowed=${isAllowed} sp=0x${sp.toString(
          16
        )} stack=[${stackWords.join(" ")}] lastPCs=[${lastPcTrace}]`
      );
      const cpu = this.emulator['cpu'];
      if (process.env.DEBUG_68K_NATIVE === '1' && cpu?.nativeLoggedInstructions) {
        const logCount = cpu.nativeLoggedInstructions() || 0;
        if (logCount > 0) {
          const start = Math.max(0, logCount - 20);
console.log(`[DebugMonitor] A6 change: last ${Math.min(logCount, 20)} instructions:`);
          for (let i = start; i < logCount; i++) {
            const logPc = cpu.nativeGetLogEntryPC?.(i) || 0;
            const disasm = cpu.nativeDisassemble?.(logPc) || '???';
console.log(`[DebugMonitor]   0x${logPc.toString(16)}: ${disasm}`);
          }
        }
      }
      this.lastA6Logged = a6;
    }
  }

  /**
   * Monitor ExecBase pointer (at 0x4) for corruption detection
   */
  monitorExecBasePointer(pc: number): void {
    const execBasePtr = this.safeRead32Global(0x4);
    if (execBasePtr === null) {
      return;
    }
    if (this.lastExecBasePointer === 0) {
      this.lastExecBasePointer = execBasePtr;
      return;
    }
    if (execBasePtr !== this.lastExecBasePointer) {
      const lastPcTrace = this.lastPCs
        .map((p) => `0x${p.toString(16)}`)
        .join(",");
console.log(
        `[DebugMonitor] ExecBase pointer changed at pc=0x${pc.toString(
          16
        )}: 0x${this.lastExecBasePointer.toString(
          16
        )} -> 0x${execBasePtr.toString(16)} lastPCs=[${lastPcTrace}]`
      );
      this.lastExecBasePointer = execBasePtr;
    }
  }

  /**
   * PC probe helper: logs when the PC enters configured ranges (driven by env).
   */
  checkPcProbes(pc: number, iterationCount: number): void {
    if (!this.pcProbeRanges.length) {
      return;
    }
    for (const range of this.pcProbeRanges) {
      if (range.hits >= this.pcProbeMaxHits) {
        continue;
      }
      if (pc >= range.start && pc <= range.end) {
        range.hits++;
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const a0 = this.emulator.getRegister(8);
        const a4 = this.emulator.getRegister(12);
        const a5 = this.emulator.getRegister(13);
        const a6 = this.emulator.getRegister(14);
        const sp = this.emulator.getRegister(15);
        const memA4_8b8 = this.safeRead32Global(a4 + 0x8b8);
        const memA4_8bc = this.safeRead32Global(a4 + 0x8bc);
        const memA4_6c88 = this.safeRead32Global(a4 + 0x6c88);
console.log(
          `[DebugMonitor] PC probe hit range 0x${range.start.toString(
            16
          )}-0x${range.end.toString(16)} pc=0x${pc.toString(
            16
          )} iter=${iterationCount} d0=0x${d0.toString(
            16
          )} d1=0x${d1.toString(16)} a0=0x${a0.toString(
            16
          )} a4=0x${a4.toString(16)} a5=0x${a5.toString(
            16
          )} a6=0x${a6.toString(16)} sp=0x${sp.toString(
            16
          )} [a4+0x8b8]=0x${(memA4_8b8 ?? 0).toString(
            16
          )} [a4+0x8bc]=0x${(memA4_8bc ?? 0).toString(
            16
          )} [a4+0x6c88]=0x${(memA4_6c88 ?? 0).toString(16)}`
        );
      }
    }
  }

  /**
   * Watch specific offsets relative to A4 and log when they change.
   * Enables debugging when list counters or pointers are mutated by the door.
   */
  checkWatchedValues(): void {
    if (this.watchValueOffsets.length === 0) {
      return;
    }
    const a4 = this.emulator.getRegister(12);
    for (const off of this.watchValueOffsets) {
      const addr = a4 + off;
      const val = this.emulator.readMemory32(addr);
      const prev = this.lastWatchedValues.get(off);
      if (prev === undefined || prev !== val) {
console.log(
          `[DebugMonitor][WATCH] A4+0x${off.toString(
            16
          )} (0x${addr.toString(16)}) changed: 0x${(prev ?? 0).toString(
            16
          )} -> 0x${val.toString(16)} at PC=0x${this.emulator
            .getRegister(16)
            .toString(16)}`
        );
        this.lastWatchedValues.set(off, val);
      }
    }
  }

  /**
   * Parse ranges like "0x1200-0x1300,0x3aa0-0x3c30" for PC probes.
   */
  static parsePcProbeRanges(envValue: string): Array<{
    start: number;
    end: number;
    hits: number;
  }> {
    if (!envValue.trim()) {
      return [];
    }
    return envValue
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => {
        const parts = segment.split("-");
        const start = parseInt(parts[0], 0);
        const end = parts[1] ? parseInt(parts[1], 0) : start;
        return { start, end, hits: 0 };
      })
      .filter(
        (range) =>
          Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          range.start <= range.end
      );
  }

  private safeRead32Global(addr: number): number | null {
    try {
      return this.emulator.readMemory32(addr >>> 0);
    } catch {
      return null;
    }
  }
}
