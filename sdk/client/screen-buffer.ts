/**
 * AmiExpress SDK - ScreenBuffer (Client Runtime)
 *
 * A cell-addressed back buffer for terminal doors that redraw continuously.
 *
 * WHY THIS EXISTS
 * ---------------
 * Client doors render in the browser and ship their output back through the
 * BBS: door -> `door:client:message` -> backend -> `ansi-output` -> xterm.js.
 * A game that repaints its whole screen every frame pays that round trip with
 * the full screen's worth of bytes. Measured on ARKANOID (2026-08-24): 4669
 * bytes per frame at 25-62 fps, i.e. 117-288 KB/s. xterm.js parses writes
 * asynchronously while its renderer paints on its own animation frame, so at
 * that volume it regularly paints a half-parsed frame - the playfield has been
 * erased but the bricks are not back yet. That reads as flicker, and the
 * backlog also delays input.
 *
 * A door draws into this buffer instead of emitting ANSI directly. `flush()`
 * compares the new frame against the last one that was actually sent and emits
 * only the cells that changed. A frame where one ball moved costs tens of
 * bytes, not thousands.
 *
 * COORDINATES
 * -----------
 * The public API is 1-indexed (x = 1..cols, y = 1..rows) to match ANSI cursor
 * addressing and the drawing code doors already have. Writes outside the grid
 * are clipped, never wrapped.
 *
 * ATTRIBUTES
 * ----------
 * A cell's attribute is whatever SGR prefix the caller passes (for example
 * `\x1b[1;33m\x1b[44m`), stored verbatim and compared as a string. The buffer
 * emits `\x1b[0m` before switching to a different attribute, so callers do not
 * append their own reset - that is what made every drawn block cost an extra
 * four bytes in the pre-buffer renderers.
 */

/** One terminal cell: a single character plus the SGR prefix it is drawn with. */
interface Cell {
  ch: string;
  sgr: string;
}

export interface ScreenBufferOptions {
  /** Terminal width in cells. Default 80. */
  cols?: number;
  /** Terminal height in cells. Default 24. */
  rows?: number;
}

/**
 * Unchanged cells shorter than this are written through rather than jumped
 * over: a cursor reposition costs ~6-8 bytes, so bridging a short gap is
 * cheaper than ending the run and starting a new one.
 */
const MAX_BRIDGED_GAP = 4;

export class ScreenBuffer {
  public readonly cols: number;
  public readonly rows: number;

  /** The frame being drawn right now. */
  private cur: Cell[];
  /** The frame the terminal is currently showing (what was last flushed). */
  private prev: Cell[];

  /** Emit a full-screen erase before the next diff. */
  private pendingHardClear: boolean = true;
  /** Ignore `prev` on the next flush and emit every non-blank cell. */
  private pendingFullRedraw: boolean = false;

  /** Desired cursor visibility, and what the terminal was last told. */
  private cursorHidden: boolean = false;
  private cursorHiddenSent: boolean | null = null;

  constructor(options: ScreenBufferOptions = {}) {
    this.cols = Math.max(1, options.cols ?? 80);
    this.rows = Math.max(1, options.rows ?? 24);

    this.cur = this.blankGrid();
    this.prev = this.blankGrid();
  }

  /**
   * Reset every cell of the frame being drawn to a blank.
   *
   * This is the buffer's equivalent of `\x1b[2J` - but it does not emit an
   * erase. Cells that were occupied and are now blank simply show up as
   * changes in the next `flush()`, which is both smaller and free of the
   * erase-then-repaint flash a real clear-screen causes.
   */
  clear(): void {
    for (let i = 0; i < this.cur.length; i++) {
      this.cur[i].ch = ' ';
      this.cur[i].sgr = '';
    }
  }

  /** Draw `width` cells of solid background at (x, y). */
  drawBlock(x: number, y: number, sgr: string, width: number = 1): void {
    for (let i = 0; i < width; i++) {
      this.setCell(x + i, y, ' ', sgr);
    }
  }

  /** Draw `text` starting at (x, y), clipped to the row. */
  drawText(x: number, y: number, text: string, fg: string = '', bg: string = ''): void {
    const sgr = fg + bg;
    for (let i = 0; i < text.length; i++) {
      this.setCell(x + i, y, text[i], sgr);
    }
  }

  /** Fill a rectangle with solid background. */
  drawBox(x: number, y: number, width: number, height: number, sgr: string): void {
    for (let row = 0; row < height; row++) {
      this.drawBlock(x, y + row, sgr, width);
    }
  }

  /** Write one cell. Out-of-range coordinates are dropped, never wrapped. */
  setCell(x: number, y: number, ch: string, sgr: string): void {
    if (x < 1 || x > this.cols || y < 1 || y > this.rows) return;
    const cell = this.cur[(y - 1) * this.cols + (x - 1)];
    cell.ch = ch;
    cell.sgr = sgr;
  }

  /** Read a cell (1-indexed). Returns a blank for out-of-range coordinates. */
  getCell(x: number, y: number): { ch: string; sgr: string } {
    if (x < 1 || x > this.cols || y < 1 || y > this.rows) return { ch: ' ', sgr: '' };
    const cell = this.cur[(y - 1) * this.cols + (x - 1)];
    return { ch: cell.ch, sgr: cell.sgr };
  }

  /** Request the cursor be hidden or shown. Emitted only when it changes. */
  setCursorHidden(hidden: boolean): void {
    this.cursorHidden = hidden;
  }

  /**
   * Emit every non-blank cell on the next flush, ignoring what the terminal
   * is believed to be showing. Use after something else has written to the
   * screen behind the buffer's back.
   */
  forceRedraw(): void {
    this.pendingFullRedraw = true;
  }

  /**
   * Erase the terminal on the next flush before drawing.
   *
   * Needed once when a door starts, because the screen still holds whatever
   * the BBS drew before it.
   */
  hardClear(): void {
    this.pendingHardClear = true;
  }

  /**
   * Produce the ANSI needed to turn the terminal's current contents into the
   * frame that has been drawn, then adopt that frame as the new baseline.
   *
   * Returns '' when nothing changed - callers should skip sending empty
   * output rather than paying a round trip for it.
   */
  flush(): string {
    let out = '';

    if (this.cursorHiddenSent !== this.cursorHidden) {
      out += this.cursorHidden ? '\x1b[?25l' : '\x1b[?25h';
      this.cursorHiddenSent = this.cursorHidden;
    }

    let assumeBlank = false;
    if (this.pendingHardClear) {
      out += '\x1b[2J\x1b[H';
      this.pendingHardClear = false;
      assumeBlank = true;
    }
    if (this.pendingFullRedraw) {
      this.pendingFullRedraw = false;
      assumeBlank = true;
    }
    if (assumeBlank) {
      for (let i = 0; i < this.prev.length; i++) {
        this.prev[i].ch = ' ';
        this.prev[i].sgr = '';
      }
    }

    let sgrActive = '';
    // Column the terminal cursor sits at, 1-indexed, or 0 when unknown.
    let cursorRow = 0;
    let cursorCol = 0;

    for (let y = 1; y <= this.rows; y++) {
      const rowStart = (y - 1) * this.cols;
      let x = 1;

      while (x <= this.cols) {
        if (!this.cellChanged(rowStart + x - 1)) {
          x++;
          continue;
        }

        // Extend the run while cells keep changing, bridging short unchanged
        // gaps so we do not pay for a cursor move to skip three cells.
        let runEnd = x;
        let probe = x;
        while (probe <= this.cols) {
          if (this.cellChanged(rowStart + probe - 1)) {
            runEnd = probe;
            probe++;
            continue;
          }
          let gap = 0;
          while (probe + gap <= this.cols && !this.cellChanged(rowStart + probe + gap - 1)) {
            gap++;
          }
          if (gap <= MAX_BRIDGED_GAP && probe + gap <= this.cols) {
            probe += gap;
            continue;
          }
          break;
        }

        if (cursorRow !== y || cursorCol !== x) {
          out += `\x1b[${y};${x}H`;
          cursorRow = y;
          cursorCol = x;
        }

        for (let col = x; col <= runEnd; col++) {
          const cell = this.cur[rowStart + col - 1];
          if (cell.sgr !== sgrActive) {
            out += '\x1b[0m';
            if (cell.sgr) out += cell.sgr;
            sgrActive = cell.sgr;
          }
          out += cell.ch;
          cursorCol++;
        }

        // A write that reaches the last column leaves the cursor in a state
        // that depends on the terminal's wrap mode - do not assume it.
        if (cursorCol > this.cols) {
          cursorRow = 0;
          cursorCol = 0;
        }

        x = runEnd + 1;
      }
    }

    if (sgrActive !== '') out += '\x1b[0m';

    for (let i = 0; i < this.cur.length; i++) {
      this.prev[i].ch = this.cur[i].ch;
      this.prev[i].sgr = this.cur[i].sgr;
    }

    return out;
  }

  private cellChanged(index: number): boolean {
    return this.cur[index].ch !== this.prev[index].ch || this.cur[index].sgr !== this.prev[index].sgr;
  }

  private blankGrid(): Cell[] {
    const grid: Cell[] = new Array(this.cols * this.rows);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = { ch: ' ', sgr: '' };
    }
    return grid;
  }
}

export default ScreenBuffer;
