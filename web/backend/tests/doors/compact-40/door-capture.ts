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
