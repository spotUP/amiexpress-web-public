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
export interface MouseEvent { kind: 'P' | 'R' | 'M' | 'U' | 'D'; col: number; row: number }
const REPORT = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const PARTIAL = /^\x1b(\[(<(\d+(;(\d+(;\d*)?)?)?)?)?)?$/;
const MAX_BUTTONS = 8;

export class MouseAbsorber {
  private carry = '';
  private motion: MouseEvent | null = null;
  private buttons: MouseEvent[] = [];
  private woken = false;

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
      if (PARTIAL.test(s) && s.startsWith('\x1b[<')) { this.carry = s; break; }
      out += '\x1b'; s = s.slice(1);
    }
    return out;
  }

  /** A typed 0x1E must never pose as a wake byte. */
  private typed(text: string): string { return text.split(MOUSE_WAKE).join(''); }

  next(): MouseEvent | null {
    const e = this.motion ?? this.buttons.shift() ?? null;
    if (e === this.motion) this.motion = null;
    if (!this.motion && this.buttons.length === 0) this.woken = false;
    return e;
  }

  reset(): void { this.carry = ''; this.motion = null; this.buttons = []; this.woken = false; }

  private store(b: number, col: number, row: number, release: boolean): void {
    if (b === 64 || b === 65) { this.push({ kind: b === 64 ? 'U' : 'D', col, row }); return; }
    if (b & 32) { this.motion = { kind: 'M', col, row }; return; }
    this.push({ kind: release ? 'R' : 'P', col, row });
  }
  private push(e: MouseEvent): void { if (this.buttons.length < MAX_BUTTONS) this.buttons.push(e); }
}
