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
  
  // Center roughly (assuming 80 columns)
  const width = 60;
  const padding = Math.floor((80 - width) / 2);
  const leftPad = ' '.repeat(padding);
  
  const borderTop = `┌${'─'.repeat(width - 2)}┐`;
  const borderBot = `└${'─'.repeat(width - 2)}┘`;
  
  const msgText = ` Loading ${name}... `;
  const msgPadding = width - 2 - msgText.length;
  const msgLeft = Math.floor(msgPadding / 2);
  const msgRight = msgPadding - msgLeft;
  const msgLine = `│${' '.repeat(msgLeft)}${ANSI.WHITE}${msgText}${ANSI.CYAN}${' '.repeat(msgRight)}│`;

  const spinPadding = width - 2 - 1; // 1 char for spinner
  const spinLeft = Math.floor(spinPadding / 2);
  const spinRight = spinPadding - spinLeft;
  const spinLine = `│${' '.repeat(spinLeft)}${ANSI.CYAN}${spinner}${ANSI.CYAN}${' '.repeat(spinRight)}│`;
  
  const emptyLine = `│${' '.repeat(width - 2)}│`;
  
  const vPad = '\n'.repeat(10); // Push down to center vertically

  return [
    ANSI.CLEAR_SCREEN,
    vPad,
    `${leftPad}${ANSI.CYAN}${borderTop}${ANSI.RESET}`,
    `\n${leftPad}${ANSI.CYAN}${emptyLine}${ANSI.RESET}`,
    `\n${leftPad}${ANSI.CYAN}${msgLine}${ANSI.RESET}`,
    `\n${leftPad}${ANSI.CYAN}${spinLine}${ANSI.RESET}`,
    `\n${leftPad}${ANSI.CYAN}${emptyLine}${ANSI.RESET}`,
    `\n${leftPad}${ANSI.CYAN}${borderBot}${ANSI.RESET}`
  ].join('');
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