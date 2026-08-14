/**
 * Library Call Ledger — Tier 2 measurement instrumentation.
 *
 * Records every 68K library call a door makes and how the emulator resolved
 * it, so we can rank what to implement next instead of guessing:
 *
 *   - 'real'    : a genuine handler ran (implemented).
 *   - 'stub'    : a pass-through stub ran (named in LVOs.i but does nothing
 *                 useful — installStubVectorsForLibrary's `return D0`).
 *   - 'missing' : the call trapped at an address with no vector at all
 *                 (unmapped LVO / library with no vectors installed).
 *
 * The point of the exercise: 'stub' and 'missing' together are the
 * implement-me backlog, ranked by call frequency and the doors that hit them.
 *
 * Enabled only when process.env.LEDGER === '1' so normal runs pay nothing.
 * Off by default: record() is a cheap no-op.
 *
 * The emulator layer records; the corpus runner stamps the current door name
 * via setCurrentDoor() and dumps the aggregate via snapshot() at the end.
 */

export type CallResolution = 'real' | 'stub' | 'missing';

export interface LedgerEntry {
  library: string;
  offset: number;
  name: string;
  resolution: CallResolution;
  count: number;
  doors: string[];
}

interface InternalEntry {
  library: string;
  offset: number;
  name: string;
  resolution: CallResolution;
  count: number;
  doors: Set<string>;
}

// 'real' outranks 'stub' outranks 'missing' — if the same LVO is ever seen at
// more than one resolution (e.g. a real handler installed after a stub), the
// most-implemented wins so the backlog doesn't double-count it.
const RANK: Record<CallResolution, number> = { missing: 0, stub: 1, real: 2 };

class LibraryCallLedger {
  readonly enabled: boolean = process.env.LEDGER === '1';
  private entries = new Map<string, InternalEntry>();
  private currentDoor = '<unknown>';

  setCurrentDoor(name: string): void {
    this.currentDoor = name || '<unknown>';
  }

  reset(): void {
    this.entries.clear();
  }

  record(library: string, offset: number, name: string, resolution: CallResolution): void {
    if (!this.enabled) return;
    const lib = (library || 'unknown').toLowerCase();
    const key = `${lib}:${offset}`;
    let e = this.entries.get(key);
    if (!e) {
      e = { library: lib, offset, name: name || `offset ${offset}`, resolution, count: 0, doors: new Set() };
      this.entries.set(key, e);
    }
    e.count++;
    e.doors.add(this.currentDoor);
    // Keep the most-implemented resolution seen for this LVO.
    if (RANK[resolution] > RANK[e.resolution]) {
      e.resolution = resolution;
    }
    // Prefer a real function name over a placeholder.
    if ((e.name.startsWith('offset ') || e.name.startsWith('unknown')) && name && !name.startsWith('offset ') && !name.startsWith('unknown')) {
      e.name = name;
    }
  }

  /** Sorted snapshot: missing+stub first (the backlog), then by call count. */
  snapshot(): LedgerEntry[] {
    const out: LedgerEntry[] = [];
    for (const e of this.entries.values()) {
      out.push({
        library: e.library,
        offset: e.offset,
        name: e.name,
        resolution: e.resolution,
        count: e.count,
        doors: [...e.doors].sort(),
      });
    }
    out.sort((a, b) => {
      if (RANK[a.resolution] !== RANK[b.resolution]) return RANK[a.resolution] - RANK[b.resolution]; // missing/stub first
      return b.count - a.count; // then most-called first
    });
    return out;
  }

  /** Aggregate counts by resolution — quick headline for a report. */
  summary(): Record<CallResolution, number> {
    const s: Record<CallResolution, number> = { real: 0, stub: 0, missing: 0 };
    for (const e of this.entries.values()) s[e.resolution]++;
    return s;
  }
}

export const libraryCallLedger = new LibraryCallLedger();
