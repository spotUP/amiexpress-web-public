/**
 * The shared pieces of a "real binary, real emulator, three screens" door test:
 * the socket that records what a door paints, the cut at the exit clear, and
 * the C64 model the 40-column frames are replayed into.
 *
 * themec-40, subs-40 and usersettings-40 each carried a copy of these; new
 * door tests import them from here.
 */
import { EventEmitter } from 'events';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

/** The socket a door is handed: everything it paints, in order. */
export class CaptureSocket extends EventEmitter {
  readonly ansi: string[] = [];
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output') this.ansi.push(typeof data === 'string' ? data : String(data ?? ''));
    return super.emit(event, data);
  }
}

/** A C64 screen code (bit 7 = reverse) back to the character it shows. */
export function screenCodeToChar(sc: number): string {
  const c = sc & 0x7f;
  if (c === 0) return '@';
  if (c <= 0x1f) return String.fromCharCode(64 + c);
  if (c <= 0x3f) return String.fromCharCode(c);
  if (c >= 0x41 && c <= 0x5a) return String.fromCharCode(c);
  return '·'; // a PETSCII graphic glyph
}

/**
 * The screen the CALLER saw: a door clears on the way out, so transducing the
 * whole capture models an empty terminal however well it painted. Only a final
 * clear followed by nothing but the teardown tail is cut.
 */
export function beforeTeardown(ansi: string): string {
  const clear = ansi.lastIndexOf('\x1b[2J');
  if (clear <= 0) return ansi;
  const tail = ansi.slice(clear);
  return /^\x1b\[2J(\x1b\[H)?(\x1b\[\?25[hl])?\s*$/.test(tail) ? ansi.slice(0, clear) : ansi;
}

/** What a real C64 is showing after eating `ansi`, row by row (reverse video is not shown). */
export function c64Rows(ansi: string): string[] {
  const transducer = new AnsiToPetsciiTransducer();
  transducer.transduce(ansi);
  const { screen, cols, rows } = transducer.machine.state;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) row += screenCodeToChar(screen[y * cols + x]!);
    out.push(row);
  }
  return out;
}

export type Cell = { ch: string; bg: string };

const NAMED = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** Replay a CSI/text stream into a width x height grid of {ch, bg}. */
export function replay(stream: string, width: number, height: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ch: ' ', bg: 'unpainted' })));
  let x = 0, y = 0, bg = 'default';
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|([^\x1b])/g;
  let m: RegExpExecArray | null;
  const color = (n: number): string => (n < 8 ? NAMED[n] : n < 16 ? 'bright' + NAMED[n - 8] : 'idx' + n);
  while ((m = re.exec(stream))) {
    if (m[3] !== undefined) {
      const c = m[3];
      if (c === '\r') x = 0;
      else if (c === '\n') y = Math.min(height - 1, y + 1);
      else if (y < height && x < width) { grid[y][x] = { ch: c, bg }; x++; }
      continue;
    }
    const args = m[1].split(';').filter(a => a !== '' && a[0] !== '?').map(Number);
    switch (m[2]) {
      case 'H': case 'f': y = (args[0] || 1) - 1; x = (args[1] || 1) - 1; break;
      case 'C': x += args[0] || 1; break;
      case 'D': x = Math.max(0, x - (args[0] || 1)); break;
      case 'A': y = Math.max(0, y - (args[0] || 1)); break;
      case 'B': y = Math.min(height - 1, y + (args[0] || 1)); break;
      case 'G': x = (args[0] || 1) - 1; break;
      case 'J': if (args[0] === 2 || args.length === 0) for (const r of grid) for (let i = 0; i < width; i++) r[i] = { ch: ' ', bg }; break;
      case 'K': for (let i = x; i < width; i++) grid[y][i] = { ch: ' ', bg }; break;
      case 'm': {
        const a = args.length ? args : [0];
        for (let i = 0; i < a.length; i++) {
          const v = a[i];
          if (v === 0 || v === 49) bg = v === 0 ? 'default' : 'black';
          else if (v >= 40 && v <= 47) bg = NAMED[v - 40];
          else if (v >= 100 && v <= 107) bg = 'bright' + NAMED[v - 100];
          else if (v === 48 && a[i + 1] === 5) { bg = color(a[i + 2]); i += 2; }
          else if (v === 48 && a[i + 1] === 2) { bg = `rgb${a[i + 2]},${a[i + 3]},${a[i + 4]}`; i += 4; }
          else if (v === 38 && a[i + 1] === 5) i += 2;
          else if (v === 38 && a[i + 1] === 2) i += 4;
        }
        break;
      }
    }
  }
  return grid;
}
