/**
 * Door Preloader Utility
 * Displays an animated, non-blocking preloader while a door module is being imported.
 * Uses simplified ANSI output to match LiveChat's cleaner style.
 */

const ANSI = {
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  WHITE: '\x1b[37m',
  RESET: '\x1b[0m',
};

function createPreloaderFrame(doorName: string, tick: number): string {
  const spinnerChars = ['|', '/', '-', '\\'];
  const spinner = spinnerChars[tick % 4];
  const name = doorName.length > 40 ? doorName.substring(0, 37) + '...' : doorName;
  
  const width = 60;
  const startCol = Math.floor((80 - width) / 2);
  const startRow = 10;

  // Use absolute positioning for every line to ensure perfect alignment
  const pos = (row: number, col: number) => `\x1b[${row};${col}H`;
  
  let out = ANSI.CLEAR_SCREEN;
  
  // Draw the box
  out += `${pos(startRow, startCol)}${ANSI.CYAN}┌${'─'.repeat(width - 2)}┐`;
  out += `${pos(startRow + 1, startCol)}│${' '.repeat(width - 2)}│`;
  
  const msgText = ` Loading ${name}... `;
  const msgPadding = width - 2 - msgText.length;
  const msgLeft = Math.floor(msgPadding / 2);
  const msgRight = msgPadding - msgLeft;
  out += `${pos(startRow + 2, startCol)}│${' '.repeat(msgLeft)}${ANSI.WHITE}${msgText}${ANSI.CYAN}${' '.repeat(msgRight)}│`;

  const spinPadding = width - 2 - 1;
  const spinLeft = Math.floor(spinPadding / 2);
  const spinRight = spinPadding - spinLeft;
  out += `${pos(startRow + 3, startCol)}│${' '.repeat(spinLeft)}${ANSI.CYAN}${spinner}${ANSI.CYAN}${' '.repeat(spinRight)}│`;

  out += `${pos(startRow + 4, startCol)}│${' '.repeat(width - 2)}│`;
  out += `${pos(startRow + 5, startCol)}└${'─'.repeat(width - 2)}┘${ANSI.RESET}`;

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