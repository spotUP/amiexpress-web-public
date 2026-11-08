/**
 * Mouse reports out of a 68K door's key stream (Decision 28).
 *
 * A door reads one key per XIM round trip (~45 ms, JH_HK in
 * sdk/c/src/ae_transport_amiga.c:407). An SGR report is ~12 bytes, so a hover
 * read key by key costs half a second, and terminals send dozens a second.
 * The board therefore takes the reports out, keeps what matters - the latest
 * position, and every press/release up to 8 - and puts ONE wake byte (0x1E)
 * in the queue when there is something to ask for. The door then asks once
 * (AEW_SCREEN MOUSE?).
 */
export const MOUSE_WAKE = '\x1e';
/**
 * `button` is the SGR button number's low bits: 0 left, 1 middle, 2 right (3 on a
 * motion report = no button held). It reaches the door only when the door armed
 * with `MOUSE ON B`; a door armed with plain `MOUSE ON` gets the three-field reply
 * its strict parser expects (sdk/c ae_bs_parse_mouse before 2026-11-08).
 */
export interface MouseEvent { kind: 'P' | 'R' | 'M' | 'U' | 'D'; col: number; row: number; button: number }
const REPORT = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const PARTIAL = /^\x1b(\[(<(\d+(;(\d+(;\d*)?)?)?)?)?)?$/;
const MAX_BUTTONS = 8;
/**
 * How long a chunk tail that COULD be the start of a report (ESC, ESC[, ESC[<..)
 * is held for the rest to arrive. A TCP chunk can end anywhere inside a report;
 * a real Esc key is a lone ESC and must still reach the door, so after this
 * window the held bytes are handed on as keys. (No lone-ESC settle exists
 * elsewhere in the backend; this is the same setTimeout pattern as io.ts's
 * hotkey timer.)
 */
export const CARRY_SETTLE_MS = 50;

export class MouseAbsorber {
  private carry = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Arrival order; consecutive motion reports coalesce into the latest. */
  private events: MouseEvent[] = [];
  private woken = false;

  /** @param onSettle receives held bytes that turned out not to be a report. */
  /** @param reportButtons the door armed with `MOUSE ON B` and reads the four-field MOUSE? reply. */
  constructor(private readonly onSettle: (keys: string) => void = () => {}, private readonly settleMs = CARRY_SETTLE_MS, readonly reportButtons = false) {}

  absorb(data: string): string {
    let s = this.carry + data;
    this.carry = '';
    let out = '';
    while (s.length) {
      const esc = s.indexOf('\x1b');
      if (esc < 0) { out += this.typed(s); break; }
      out += this.typed(s.slice(0, esc));
      s = s.slice(esc);
      const m = REPORT.exec(s);
      if (m) {
        this.store(Number(m[1]), Number(m[2]), Number(m[3]), m[4] === 'm');
        s = s.slice(m[0].length);
        // One wake byte, where the report was, while events are unread.
        if (!this.woken) { this.woken = true; out += MOUSE_WAKE; }
        continue;
      }
      if (PARTIAL.test(s)) { this.carry = s; break; }
      out += '\x1b'; s = s.slice(1);
    }
    // The bound runs from the FIRST held byte: a drip of partial chunks must not keep restarting it.
    if (!this.carry) this.clearTimer(); else if (!this.timer) this.startTimer();
    return out;
  }

  private startTimer(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      const keys = this.carry;
      this.carry = '';
      if (keys) this.onSettle(keys);
    }, this.settleMs);
    this.timer.unref?.();
  }
  private clearTimer(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  /** A typed 0x1E must never pose as a wake byte. */
  private typed(text: string): string { return text.split(MOUSE_WAKE).join(''); }

  next(): MouseEvent | null {
    const e = this.events.shift() ?? null;
    if (this.events.length === 0) this.woken = false;
    return e;
  }

  /** Hand on what is held (a lone Esc the caller pressed) and stop the timer; for MOUSE OFF / re-arm. */
  flush(): string { this.clearTimer(); const keys = this.carry; this.carry = ''; return keys; }

  /** Discard everything, held bytes included; for door exit and carrier loss. */
  reset(): void { this.clearTimer(); this.carry = ''; this.events = []; this.woken = false; }

  private store(b: number, col: number, row: number, release: boolean): void {
    const button = b & 3;
    if (b === 64 || b === 65) { this.push({ kind: b === 64 ? 'U' : 'D', col, row, button: 0 }); return; }
    if (b & 32) {
      const last = this.events[this.events.length - 1];
      if (last && last.kind === 'M') { last.col = col; last.row = row; last.button = button; } else this.events.push({ kind: 'M', col, row, button });
      return;
    }
    this.push({ kind: release ? 'R' : 'P', col, row, button });
  }
  private push(e: MouseEvent): void {
    if (this.events.filter((x) => x.kind !== 'M').length < MAX_BUTTONS) this.events.push(e);
  }
}
