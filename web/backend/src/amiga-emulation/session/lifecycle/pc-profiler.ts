/**
 * Per-function 68K instruction profiler (dev only).
 *
 * AEDOOR_PC_PROFILE=<file> makes the lifecycle loop run one instruction per
 * batch and count each executed instruction against the PC it started at.
 * Instructions, not cycles: the wrapper's sync() override never advances
 * Moira's clock, so getCycles() stays 0 (moira-wrapper.cpp, sync()).
 * Every 2 s the totals are aggregated by HUNK_SYMBOL name (the door's own
 * symbol table via DoorLoader.getSymbolResolver) and written to <file> as
 * JSON, so a run killed from outside still leaves a profile behind. Library
 * calls trapped as ILLEGAL are host work and are not counted.
 */
import * as fs from 'fs';

interface Resolver { resolve(pc: number): { name: string; delta: number } | null }

export class PcProfiler {
  private readonly countByPc = new Map<number, number>();
  private lastFlush = Date.now();
  constructor(private readonly file: string, private readonly resolver: () => Resolver | null) {}

  static fromEnv(resolver: () => Resolver | null): PcProfiler | null {
    const file = process.env.AEDOOR_PC_PROFILE;
    return file ? new PcProfiler(file, resolver) : null;
  }

  record(pc: number): void {
    this.countByPc.set(pc, (this.countByPc.get(pc) ?? 0) + 1);
    if (Date.now() - this.lastFlush >= 2000) this.flush();
  }

  /** Nearest symbol that is not a compiler-local label (vbcc emits l<N> for basic blocks). */
  private functionAt(r: Resolver | null, pc: number): string {
    let at = pc;
    for (let i = 0; r && i < 64; i++) {
      const hit = r.resolve(at);
      if (!hit) break;
      if (!/^l\d+$/.test(hit.name)) return hit.name;
      at = at - hit.delta - 1;
    }
    return `?0x${(pc & 0xfff000).toString(16)}`;
  }

  flush(): void {
    this.lastFlush = Date.now();
    const r = this.resolver();
    const byFn = new Map<string, number>();
    let total = 0;
    for (const [pc, c] of this.countByPc) {
      const name = this.functionAt(r, pc);
      byFn.set(name, (byFn.get(name) ?? 0) + c);
      total += c;
    }
    const functions = [...byFn.entries()].sort((a, b) => b[1] - a[1]).map(([name, cycles]) => ({ name, instructions: cycles }));
    fs.writeFileSync(this.file, JSON.stringify({ total, functions }, null, 1));
  }
}
