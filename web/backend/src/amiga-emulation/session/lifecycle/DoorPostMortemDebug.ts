// DoorPostMortemDebug.ts
// Env-gated diagnostic helpers used during 68K door post-mortems.
// Extracted from DoorLifecycleManager to keep that file under 2000 lines.
//
// All helpers are no-ops unless their env var is set:
//
//   DOOR_TRACE_RING=N
//     Maintains a ring of the last N PCs (one entry per outer-loop
//     iteration). Dump it on first OOB PC via dumpPcRing().
//
//   DOOR_DUMP_AT_PC=0xHHHH[,addr,bytes]
//     One-shot memory snapshot when PC first hits the named address.
//     Defaults: addr=A3, bytes=512. Output path overridden via
//     DOOR_DUMP_AT_PC_LOG (default /tmp/door-dump-<ms>.log).

import * as fs from "fs";
import type { MoiraEmulator } from "../../cpu/MoiraEmulator.js";

export class DoorPostMortemDebug {
  private pcRing: number[] = [];
  private pcRingSize: number = Number(process.env.DOOR_TRACE_RING ?? 0);
  private dumpAtPcFired: boolean = false;

  constructor(private emulator: MoiraEmulator) {}

  /** Push a PC onto the ring (no-op unless DOOR_TRACE_RING is set). */
  pushPc(pc: number): void {
    if (this.pcRingSize <= 0) return;
    this.pcRing.push(pc);
    if (this.pcRing.length > this.pcRingSize) {
      this.pcRing.shift();
    }
  }

  /** Read-only view of the ring; empty array when tracing is off. */
  getPcRing(): number[] {
    return this.pcRing;
  }

  ringSize(): number {
    return this.pcRingSize;
  }

  /**
   * On the first iteration where PC matches DOOR_DUMP_AT_PC, snapshot
   * a window of memory and write it to a log file. Idempotent.
   */
  maybeDumpAtPc(pc: number): void {
    if (!process.env.DOOR_DUMP_AT_PC || this.dumpAtPcFired) return;
    const parts = process.env.DOOR_DUMP_AT_PC.split(",");
    const targetPc = parseInt(parts[0], 0);
    if (pc !== targetPc) return;
    this.dumpAtPcFired = true;
    const addr = parts[1] ? parseInt(parts[1], 0) : this.emulator.getRegister(11);
    const nBytes = parts[2] ? parseInt(parts[2], 0) : 512;
    const lines: string[] = [
      `# DUMP @ PC=0x${pc.toString(16)} center=0x${addr.toString(16)} bytes=${nBytes}`,
    ];
    for (let i = -nBytes / 2; i < nBytes / 2; i += 16) {
      const row = [`0x${(addr + i).toString(16).padStart(8, "0")}:`];
      for (let j = 0; j < 16; j += 4) {
        try {
          row.push(this.emulator.readMemory32(addr + i + j).toString(16).padStart(8, "0"));
        } catch {
          row.push("????????");
        }
      }
      lines.push(row.join(" "));
    }
    const outPath = process.env.DOOR_DUMP_AT_PC_LOG || `/tmp/door-dump-${Date.now()}.log`;
    try {
      fs.writeFileSync(outPath, lines.join("\n") + "\n", { encoding: "utf8" });
      console.error(`[DoorPostMortemDebug] PC dump (${lines.length - 1} rows) -> ${outPath}`);
    } catch (e) {
      console.error(`[DoorPostMortemDebug] dump write failed: ${(e as Error).message}`);
    }
  }

  /**
   * Dump the PC ring with disassembly and current opcode to
   * DOOR_TRACE_RING_LOG. Caller passes the cpu instance for
   * nativeDisassemble plus context fields for the header.
   */
  dumpPcRing(
    cpu: { nativeDisassemble?: (addr: number) => string } | null,
    ctx: { pc: number; prevPC: number; codeLow: number; codeHigh: number },
  ): void {
    if (this.pcRingSize <= 0 || this.pcRing.length === 0) return;
    const outPath =
      process.env.DOOR_TRACE_RING_LOG || `/tmp/door-pc-ring-${Date.now()}.log`;
    try {
      const lines: string[] = [];
      lines.push(
        `# PC ring dump @ first OOB. pc=0x${ctx.pc.toString(16)} prevPC=0x${ctx.prevPC.toString(16)}`,
      );
      lines.push(
        `# codeBounds=[0x${ctx.codeLow.toString(16)}-0x${ctx.codeHigh.toString(16)}]`,
      );
      for (let i = 0; i < this.pcRing.length; i++) {
        const p = this.pcRing[i];
        let dis = "???";
        if (cpu && cpu.nativeDisassemble) {
          try {
            dis = cpu.nativeDisassemble(p);
          } catch {
            /* ignore */
          }
        }
        let bytes = "";
        try {
          const op = this.emulator.readMemory16(p);
          bytes = ` op=0x${op.toString(16).padStart(4, "0")}`;
        } catch {
          /* ignore */
        }
        lines.push(
          `[${i.toString().padStart(4, "0")}] PC=0x${p.toString(16)}${bytes}  ${dis}`,
        );
      }
      fs.writeFileSync(outPath, lines.join("\n") + "\n", { encoding: "utf8" });
      console.error(
        `[DoorPostMortemDebug] PC ring (${this.pcRing.length} entries) written to ${outPath}`,
      );
    } catch (e) {
      console.error(
        `[DoorPostMortemDebug] Failed to write PC ring: ${(e as Error).message}`,
      );
    }
  }
}
