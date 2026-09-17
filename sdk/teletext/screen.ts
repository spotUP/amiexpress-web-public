/**
 * The two things every teletext door needs: a screen to paint a page onto,
 * and a reader that turns bytes off the wire into keys.
 *
 * Both of these were written once inside the browser door and would have
 * been copied into the next one. The key reader in particular is not
 * obvious: a terminal is free to deliver ESC [ C as three separate chunks,
 * and reading a chunk boundary as a sequence boundary turns an arrow key
 * into the letter C - which on a teletext door is the cyan fastext key. One
 * copy, one fix.
 *
 * The screen paints with absolute cursor motion, because a teletext page is
 * an exact grid and because the board's terminal filter drops a DECDHL line
 * attribute the moment the cursor leaves the line it was set on - so the
 * move has to come first and the attribute second, which is exactly what
 * renderSubpageLines produces.
 */
import type { TeletextSubpage } from './marco/model/types';
import {
  renderSubpageLines,
  TELETEXT_ROWS,
  TELETEXT_COLS,
  type TeletextRenderMode,
  type MosaicStyle,
} from './render-session';

export interface TeletextScreenOptions {
  /** How bytes reach the caller. Usually socket.emit('ansi-output', data). */
  write(data: string): void;
  /** The session's height. The bottom line is kept for the status bar. */
  rows?: number;
  /** 'teletext' for a session that answered T at the graphics prompt. */
  mode?: TeletextRenderMode;
  mosaicStyle?: MosaicStyle;
}

export interface PaintOptions {
  reveal?: boolean;
  flashPhase?: boolean;
}

export class TeletextScreen {
  readonly rows: number;
  /** How many of the page's 24 rows fit above the status bar. */
  readonly pageRows: number;
  readonly mode: TeletextRenderMode;

  private readonly writeOut: (data: string) => void;
  private readonly mosaicStyle: MosaicStyle;

  constructor(options: TeletextScreenOptions) {
    this.writeOut = options.write;
    this.mode = options.mode ?? 'teletext';
    this.mosaicStyle =
      options.mosaicStyle ?? (this.mode === 'teletext' ? 'sextant' : 'ascii');
    const declared = Number(options.rows);
    this.rows = Number.isFinite(declared) && declared >= 10 ? declared : 24;
    // A teletext session is 25 rows, so all 24 page rows fit with a bar
    // below them. A 24-row ANSI session gives up row 24 - which on air was
    // the fastext colour bar anyway, and the status bar IS our fastext bar.
    this.pageRows = Math.min(TELETEXT_ROWS, this.rows - 1);
  }

  /** Clear and hide the cursor, ready to paint. */
  begin(): void {
    this.writeOut('\x1b[2J\x1b[H\x1b[?25l');
  }

  /** Put the terminal back the way the board expects it. */
  end(): void {
    this.writeOut('\x1b[?25h\x1b[0m\x1b[2J\x1b[H');
  }

  clear(): void {
    this.writeOut('\x1b[2J\x1b[H');
  }

  /** Paint one subpage. One write, so a page never appears in pieces. */
  paint(subpage: TeletextSubpage, options: PaintOptions = {}): void {
    const lines = renderSubpageLines(subpage, {
      mode: this.mode,
      reveal: options.reveal ?? false,
      flashPhase: options.flashPhase ?? true,
      mosaicStyle: this.mosaicStyle,
    });

    let out = '';
    for (let row = 0; row < this.pageRows; row++) {
      out += `\x1b[${row + 1};1H${lines[row]}\x1b[K`;
    }
    this.writeOut(out);
  }

  /** Paint the bottom line. Blue on white is the teletext convention. */
  status(text: string): void {
    const bar = fit(text, TELETEXT_COLS).padEnd(TELETEXT_COLS);
    this.writeOut(`\x1b[${this.rows};1H\x1b[0;44;37m${bar}\x1b[0m\x1b[K`);
  }

  /** One line of plain text, for a menu or a message. */
  line(row: number, text: string, sgr = '\x1b[0;37m'): void {
    this.writeOut(`\x1b[${row};1H${sgr}${fit(text, TELETEXT_COLS)}\x1b[0m\x1b[K`);
  }

  write(data: string): void {
    this.writeOut(data);
  }
}

/** Cut a string to a width, marking that it was cut. */
export function fit(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '.';
}

export type ArrowKey = 'up' | 'down' | 'left' | 'right';

export interface KeyStreamHandlers {
  /** A printable key, one character at a time. */
  key(ch: string): void;
  /** ESC on its own, once it is clear nothing is following it. */
  escape(): void;
  arrow?(direction: ArrowKey): void;
  /** Any other complete escape sequence, if a door wants them. */
  sequence?(sequence: string): void;
}

/** How long a lone ESC waits to see whether it is really an arrow key. */
export const ESCAPE_GRACE_MS = 60;

/**
 * Bytes off the wire, turned into keys.
 *
 * An escape sequence is accumulated until its final byte arrives rather
 * than parsed out of whatever chunk turned up first. A bare ESC is
 * ambiguous for the same reason, so it is only reported once the grace
 * period passes with nothing following it.
 */
export class KeyStream {
  private readonly handlers: KeyStreamHandlers;
  private readonly graceMs: number;
  private pending = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(handlers: KeyStreamHandlers, options: { graceMs?: number } = {}) {
    this.handlers = handlers;
    this.graceMs = options.graceMs ?? ESCAPE_GRACE_MS;
  }

  feed(data: string): void {
    if (this.disposed || !data) return;
    for (const ch of data) this.feedChar(ch);
  }

  /** Drop any half-arrived sequence and stop the timer. */
  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.pending = '';
  }

  private feedChar(ch: string): void {
    if (this.pending) {
      this.cancel();
      this.pending += ch;

      const second = this.pending[1];
      if (second === '[' || second === 'O') {
        // CSI and SS3 both end on a byte in @-~.
        if (this.pending.length > 2 && /[@-~]/.test(ch)) {
          const sequence = this.pending;
          this.pending = '';
          this.dispatchSequence(sequence);
          return;
        }
        if (this.pending.length > 12) {
          // Nothing legitimate is this long. Drop it rather than grow.
          this.pending = '';
          return;
        }
        // A sequence that stops half way must not swallow the next real
        // keypress, so the buffer has a deadline of its own.
        this.arm();
        return;
      }

      // ESC followed by something that does not open a sequence: the escape
      // was a keypress of its own, and this character is the next one.
      this.pending = '';
      this.handlers.escape();
      if (!this.disposed) this.handlers.key(ch);
      return;
    }

    if (ch === '\x1b') {
      this.pending = ch;
      this.arm();
      return;
    }

    this.handlers.key(ch);
  }

  private dispatchSequence(sequence: string): void {
    const final = sequence.slice(-1);
    const arrow: Record<string, ArrowKey> = { A: 'up', B: 'down', C: 'right', D: 'left' };
    if (arrow[final] && this.handlers.arrow) {
      this.handlers.arrow(arrow[final]);
      return;
    }
    this.handlers.sequence?.(sequence);
  }

  private arm(): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      // A bare ESC that nothing followed is the key itself. An abandoned
      // half-sequence is just noise, and dropping it is the whole point.
      const wasBareEscape = this.pending === '\x1b';
      this.pending = '';
      if (wasBareEscape && !this.disposed) this.handlers.escape();
    }, this.graceMs);
  }

  private cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
