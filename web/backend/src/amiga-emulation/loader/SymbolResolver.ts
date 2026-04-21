import type { HunkFile, HunkSymbol } from "./HunkLoader";

/**
 * Resolve 68K program counter values to the nearest preceding symbol.
 *
 * Built from HUNK_SYMBOL entries produced by HunkLoader.parse().
 * Only ~16% of door binaries ship with symbols, but for those that do
 * (WAROLM, WarKick'Em, AquaWho, BossNuke, Count, GetAnswer, ...) this
 * turns "PC 0x3272" debug logs into "PC 0x3272 (main+0x42)".
 */
export class SymbolResolver {
  /**
   * Symbols sorted by absolute address (ascending). Stable sort so that
   * multiple symbols at the same address keep insertion order — first wins.
   */
  private readonly sorted: HunkSymbol[];

  /**
   * Farthest we'll look *backward* from a PC to find a preceding symbol.
   * 64 KB is comfortably larger than any reasonable function; beyond that
   * the nearest symbol is almost certainly unrelated and the annotation
   * would be misleading.
   */
  private static readonly MAX_DELTA = 0x10000;

  constructor(hunkFile: HunkFile) {
    const flat: HunkSymbol[] = [];
    for (const segSyms of hunkFile.symbols) {
      for (const s of segSyms) {
        if (s.name.length > 0) flat.push(s);
      }
    }
    flat.sort((a, b) => a.address - b.address);
    this.sorted = flat;
  }

  /**
   * True if this resolver has any symbols at all.
   */
  hasSymbols(): boolean {
    return this.sorted.length > 0;
  }

  /**
   * Find the closest symbol whose address is ≤ pc, within MAX_DELTA.
   * Returns null if no symbol is close enough (or none are loaded).
   */
  resolve(pc: number): { name: string; delta: number } | null {
    if (this.sorted.length === 0) return null;
    const target = pc >>> 0;

    // Binary search for largest sorted[i].address ≤ target
    let lo = 0;
    let hi = this.sorted.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const addr = this.sorted[mid].address;
      if (addr <= target) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx < 0) return null;

    const sym = this.sorted[idx];
    const delta = target - sym.address;
    if (delta > SymbolResolver.MAX_DELTA) return null;
    return { name: sym.name, delta };
  }

  /**
   * Render a PC as "0xADDR" or "0xADDR (symbol+0xDELTA)" when possible.
   */
  format(pc: number): string {
    const hex = `0x${(pc >>> 0).toString(16)}`;
    const hit = this.resolve(pc);
    if (!hit) return hex;
    if (hit.delta === 0) return `${hex} (${hit.name})`;
    return `${hex} (${hit.name}+0x${hit.delta.toString(16)})`;
  }

  /**
   * For diagnostics: total number of symbols indexed.
   */
  get size(): number {
    return this.sorted.length;
  }
}
