/**
 * Door Preloader Utility
 * Displays an animated, non-blocking preloader while a door module is being imported.
 * Uses simplified ANSI output to match LiveChat's cleaner style.
 */

// Use String.fromCharCode(27) for ESC to survive Terser minification
// Terser strips literal \x1b from string constants
const ESC = String.fromCharCode(27);

const ANSI = {
  CLEAR_SCREEN: ESC + '[2J' + ESC + '[H',
  HIDE_CURSOR: ESC + '[?25l',
  SHOW_CURSOR: ESC + '[?25h',
  CYAN: ESC + '[36m',
  YELLOW: ESC + '[33m',
  WHITE: ESC + '[37m',
  RESET: ESC + '[0m',
};

/**
 * The box, sized to the caller's screen.
 *
 * This was a 60-column box centred inside a hardcoded 80, drawn from row 8.
 * A PETSCII caller has 40 columns and 25 rows, a phone in portrait fewer
 * still, and a wide xterm more - so the one thing a caller saw before a slow
 * door opened was a frame off the edge of their screen. "all our typescript
 * doors have a broken preloader" (sysop, 2026-09-13).
 *
 * Everything below is derived from `cols`; the only literal left is the
 * caller of this function defaulting an unknown width to 80.
 */
function preloaderBox(cols: number, rows: number) {
  // Leave a column either side at 40; a share of the screen above that.
  const width = Math.max(20, Math.min(cols - 2, Math.max(34, Math.floor(cols * 0.6))));
  const startCol = Math.max(1, Math.floor((cols - width) / 2) + 1);
  // A third of the way down reads as centred without needing the height to
  // be 25, and keeps the box on screen when a terminal is short.
  const startRow = Math.max(1, Math.min(rows - 6, Math.floor(rows / 3)));
  return { width, startCol, startRow };
}

/**
 * The frame's corners and rules.
 *
 * Box-drawing ONLY for a caller that renders it. A telnet or Amiga terminal
 * gets the ASCII frame, exactly as the achievements toast decides it
 * (achievements/notices.ts): `=== true` keeps an unknown terminal on ASCII,
 * because the alternative is mojibake - which is what a caller sees as
 * "some other crap on the screen" (sysop, 2026-09-13).
 */
function frameGlyphs(unicode: boolean) {
  return unicode
    ? { tl: '\u250c', tr: '\u2510', bl: '\u2514', br: '\u2518', h: '\u2500', v: '\u2502' }
    : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };
}

function createPreloaderFrame(
  doorName: string, tick: number, cols: number, rows: number, unicode: boolean,
): string {
  const spinnerChars = ['|', '/', '-', '\\'];
  const spinner = spinnerChars[tick % 4];
  const { width, startCol, startRow } = preloaderBox(cols, rows);
  // The name has to fit INSIDE the box, not inside an assumed 40.
  const room = Math.max(8, width - 12);
  const name = doorName.length > room ? doorName.substring(0, room - 3) + '...' : doorName;

  // Use absolute positioning for every line to ensure perfect alignment
  // ESC[row;colH
  const pos = (r: number, c: number) => ESC + `[${r};${c}H`;

  let out = ANSI.CLEAR_SCREEN; // Clear screen and home
  
  // Draw the box using absolute positions
  const g = frameGlyphs(unicode);
  out += `${pos(startRow, startCol)}${ANSI.CYAN}${g.tl}${g.h.repeat(width - 2)}${g.tr}`;
  for (let r = 1; r <= 4; r++) {
    out += `${pos(startRow + r, startCol)}${g.v}${' '.repeat(width - 2)}${g.v}`;
  }
  out += `${pos(startRow + 5, startCol)}${g.bl}${g.h.repeat(width - 2)}${g.br}`;

  // Draw content inside the box
  const msgText = `Loading ${name}...`;
  const msgCol = startCol + Math.floor((width - msgText.length) / 2);
  out += `${pos(startRow + 2, msgCol)}${ANSI.WHITE}${msgText}`;

  const spinCol = startCol + Math.floor(width / 2);
  out += `${pos(startRow + 3, spinCol)}${ANSI.YELLOW}${spinner}`;

  out += ANSI.RESET;
  return out;
}

export interface PreloaderGeometry {
  /** The caller's real terminal width; 80 when nothing has reported one. */
  cols?: number;
  rows?: number;
  /** True only for a terminal that renders box-drawing; ASCII otherwise. */
  unicode?: boolean;
}

export async function showPreloaderWhile<T>(
  socket: any,
  doorName: string,
  loader: () => Promise<T>,
  geometry: PreloaderGeometry = {}
): Promise<T> {
  if (!socket || typeof socket.emit !== 'function') {
    return await loader();
  }
  const cols = Math.max(20, geometry.cols || 80);
  const rows = Math.max(8, geometry.rows || 25);
  const unicode = geometry.unicode === true;

  let loaderFinished = false;
  let result: T | undefined;
  let error: Error | undefined;

  loader().then(
    (res) => { result = res; loaderFinished = true; },
    (err) => { error = err; loaderFinished = true; }
  );

  let tick = 0;
  const animationDelay = 100;

  socket.emit('ansi-output', ANSI.HIDE_CURSOR);

  /**
   * DRAWN ONCE, then one cell per tick.
   *
   * This used to send CLEAR_SCREEN and repaint the whole box ten times a
   * second - roughly 700 bytes a frame, 7 KB a second, at the exact moment
   * the board is busy importing a door. The door rules are explicit: an
   * animation tick touches ONE row, never the frame. The spinner is one
   * character, so it costs the cursor move plus a colour plus that.
   */
  const { width, startCol, startRow } = preloaderBox(cols, rows);
  const spinRow = startRow + 3;
  const spinCol = startCol + Math.floor(width / 2);
  socket.emit('ansi-output', createPreloaderFrame(doorName, tick, cols, rows, unicode));

  while (!loaderFinished) {
    await new Promise((resolve) => setTimeout(resolve, animationDelay));
    if (loaderFinished) break;
    tick += 1;
    const spinner = ['|', '/', '-', '\\'][tick % 4];
    socket.emit(
      'ansi-output',
      ESC + `[${spinRow};${spinCol}H` + ANSI.YELLOW + spinner + ANSI.RESET,
    );
  }

  socket.emit('ansi-output', ANSI.SHOW_CURSOR);

  if (error) throw error;
  return result as T;
}