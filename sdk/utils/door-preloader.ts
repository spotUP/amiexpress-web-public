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

function createPreloaderFrame(doorName: string, tick: number): string {
  const spinnerChars = ['|', '/', '-', '\\'];
  const spinner = spinnerChars[tick % 4];
  const name = doorName.length > 40 ? doorName.substring(0, 37) + '...' : doorName;
  
  const width = 60;
  const startCol = Math.floor((80 - width) / 2) + 1; // 1-indexed for ANSI
  const startRow = 8;

  // Use absolute positioning for every line to ensure perfect alignment
  // ESC[row;colH
  const pos = (r: number, c: number) => ESC + `[${r};${c}H`;

  let out = ANSI.CLEAR_SCREEN; // Clear screen and home
  
  // Draw the box using absolute positions
  out += `${pos(startRow, startCol)}${ANSI.CYAN}┌${'─'.repeat(width - 2)}┐`;
  out += `${pos(startRow + 1, startCol)}│${' '.repeat(width - 2)}│`;
  out += `${pos(startRow + 2, startCol)}│${' '.repeat(width - 2)}│`;
  out += `${pos(startRow + 3, startCol)}│${' '.repeat(width - 2)}│`;
  out += `${pos(startRow + 4, startCol)}│${' '.repeat(width - 2)}│`;
  out += `${pos(startRow + 5, startCol)}└${'─'.repeat(width - 2)}┘`;

  // Draw content inside the box
  const msgText = `Loading ${name}...`;
  const msgCol = startCol + Math.floor((width - msgText.length) / 2);
  out += `${pos(startRow + 2, msgCol)}${ANSI.WHITE}${msgText}`;

  const spinCol = startCol + Math.floor(width / 2);
  out += `${pos(startRow + 3, spinCol)}${ANSI.YELLOW}${spinner}`;

  out += ANSI.RESET;
  return out;
}

export async function showPreloaderWhile<T>(
  socket: any,
  doorName: string,
  loader: () => Promise<T>
): Promise<T> {
  if (!socket || typeof socket.emit !== 'function') {
    return await loader();
  }

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

  while (!loaderFinished) {
    const frame = createPreloaderFrame(doorName, tick++);
    socket.emit('ansi-output', frame);
    await new Promise((resolve) => setTimeout(resolve, animationDelay));
  }

  socket.emit('ansi-output', ANSI.SHOW_CURSOR);

  if (error) throw error;
  return result as T;
}