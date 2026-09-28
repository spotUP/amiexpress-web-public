/**
 * Every Amiga feature a door asked for that the emulator does not have.
 *
 * The sysop, 2026-09-28: "we need to log all unimplemented amiga stuff so we
 * can implement it." The library-call ledger (library-call-ledger.ts) already
 * ranked unimplemented LVOs, but only under LEDGER=1 in the corpus harness -
 * never on the live board, where the callers and the real doors are. This is
 * the always-on half: each gap is kept once, with how often it was hit, by
 * which doors and when, in `<board>/logs/amiga-gaps.json`, merged across
 * restarts and deploys (logs/ lives on the volume).
 *
 * A gap is something the door ASKED for and did not get: a library call with
 * no real implementation (an auto-stub, a handler's catch-all "unimplemented
 * function" branch, or no vector at all), an XIM/FIM command the board does
 * not handle, a DOS mode or object type it does not know, a hunk type the
 * loader cannot read. Deliberate refusals (CreateProc, LoadSeg, Execute -
 * security) and things express.e itself never implemented are NOT gaps and
 * are not recorded.
 *
 * Cheap on the hot path: a Map increment; the file is written at most once
 * every few seconds, off the emulator's back. A gap seen for the first time
 * is also said once in the log, so a new one is visible without opening the
 * file.
 */
import * as fs from 'fs';
import * as path from 'path';
import { boardRoot } from '../../utils/board-root.util';

export type AmigaGapKind =
  | 'library'   // an LVO with no real implementation
  | 'xim'       // an XIM (AEDoor) command the board does not handle
  | 'fim'       // a FAME/FIM command the board does not handle
  | 'dos'       // a dos.library mode, object type or call it does not support
  | 'icon'      // icon.library work it cannot do (e.g. writing a .info)
  | 'socket'    // bsdsocket.library domains/types it cannot open
  | 'exec'      // exec.library work it cannot do (e.g. a resident type)
  | 'loader';   // a hunk type the loader cannot read

export interface AmigaGap {
  kind: AmigaGapKind;
  /** What was asked for, e.g. "intuition.library OpenWindowTagList (-606)". */
  what: string;
  count: number;
  /** Door name -> times that door hit it. */
  doors: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
}

const FLUSH_DELAY_MS = 5_000;

class AmigaGapLog {
  private gaps: Map<string, AmigaGap> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Where the log lives: on the board's volume, beside its other logs. */
  file(): string {
    return path.join(boardRoot(), 'logs', 'amiga-gaps.json');
  }

  record(kind: AmigaGapKind, what: string, door?: string): void {
    const gaps = this.load();
    const key = `${kind}\u0000${what}`;
    const now = new Date().toISOString();
    const who = door && door.trim() ? door.trim() : '<unknown door>';
    let gap = gaps.get(key);
    if (!gap) {
      gap = { kind, what, count: 0, doors: {}, firstSeen: now, lastSeen: now };
      gaps.set(key, gap);
      console.warn(`[amiga-gaps] NEW: ${kind} ${what} (door ${who})`);
    }
    gap.count++;
    gap.doors[who] = (gap.doors[who] ?? 0) + 1;
    gap.lastSeen = now;
    this.schedule();
  }

  /** All gaps, most-hit first - the implement-me backlog. */
  snapshot(): AmigaGap[] {
    return [...this.load().values()].sort((a, b) => b.count - a.count);
  }

  /** Write now (a door exiting, a test). */
  flush(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.gaps) return;
    try {
      const target = this.file();
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.snapshot(), null, 2));
      fs.renameSync(tmp, target);
    } catch (err) {
      console.error('[amiga-gaps] could not write the gap log:', err);
    }
  }

  /** Forget the in-memory copy (tests point the board root elsewhere). */
  reset(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.gaps = null;
  }

  private load(): Map<string, AmigaGap> {
    if (this.gaps) return this.gaps;
    this.gaps = new Map();
    try {
      const saved = JSON.parse(fs.readFileSync(this.file(), 'utf8')) as AmigaGap[];
      for (const gap of Array.isArray(saved) ? saved : []) {
        if (gap && gap.kind && gap.what) this.gaps.set(`${gap.kind}\u0000${gap.what}`, { ...gap, doors: { ...gap.doors } });
      }
    } catch {
      /* no log yet, or unreadable - start a fresh one */
    }
    return this.gaps;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
    this.timer.unref?.();
  }
}

export const amigaGaps = new AmigaGapLog();

/** The door an emulator is running, as its session named it. */
export function doorOf(emulator: unknown): string | undefined {
  const name = (emulator as { doorName?: unknown } | null | undefined)?.doorName;
  return typeof name === 'string' && name ? name : undefined;
}
