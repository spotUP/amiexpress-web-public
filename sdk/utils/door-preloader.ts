/**
 * Door Preloader Utility
 * Displays an animated, non-blocking preloader while a door module is being imported.
 * Uses neo-blessed for a clean, modern terminal UI.
 */

const ANSI = {
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  GREEN: '\x1b[32m',
  WHITE: '\x1b[37m',
  RESET: '\x1b[0m',
  BLUE_BG: '\x1b[44m',
};

/**
 * Creates the preloader frame with an animated marquee progress bar.
 * @param doorName - The name of the door being loaded.
 * @param progress - A value from 0 to 1 indicating the position of the marquee bar.
 * @returns The full ANSI string for the preloader frame.
 */
function createPreloaderFrame(doorName: string, progress: number): string {
  const width = 50;
  const barWidth = 10;
  const emptyChar = '░';
  const filledChar = '█';

  const position = Math.floor(progress * (width - barWidth));

  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i >= position && i < position + barWidth) {
      bar += filledChar;
    } else {
      bar += emptyChar;
    }
  }

  const name = doorName.length > 30 ? doorName.substring(0, 27) + '...' : doorName;

  const frame = [
    ANSI.CLEAR_SCREEN,
    `${ANSI.CYAN}  ┌────────────────────────────────────────────────────────────┐${ANSI.RESET}`,
    `${ANSI.CYAN}  │                                                            │${ANSI.RESET}`,
    `${ANSI.CYAN}  │  ${ANSI.WHITE}Loading application: ${ANSI.YELLOW}${name.padEnd(30)}${ANSI.WHITE}           ${ANSI.CYAN}│${ANSI.RESET}`,
    `${ANSI.CYAN}  │  ${ANSI.GREEN}Please wait while the environment initializes...          ${ANSI.CYAN}│${ANSI.RESET}`,
    `${ANSI.CYAN}  │                                                            │${ANSI.RESET}`,
    `${ANSI.CYAN}  │  [${ANSI.GREEN}${bar}${ANSI.CYAN}]  │${ANSI.RESET}`,
    `${ANSI.CYAN}  │                                                            │${ANSI.RESET}`,
    `${ANSI.CYAN}  └────────────────────────────────────────────────────────────┘${ANSI.RESET}`,
  ].join('\r\n');

  return frame;
}

/**
 * Displays an animated preloader while the provided async `loader` function executes.
 * The animation continues until the loader promise resolves.
 * @param socket - The socket.io socket for sending ANSI output.
 * @param doorName - The name of the door to display.
 * @param loader - An async function that returns the door module.
 * @returns The result from the loader function.
 */
export async function showPreloaderWhile<T>(
  socket: any,
  doorName: string,
  loader: () => Promise<T>
): Promise<T> {
  if (!socket || typeof socket.emit !== 'function') {
    // If no socket or invalid socket, just run the loader without animation
    return await loader();
  }

  let loaderFinished = false;
  let result: T | undefined;
  let error: Error | undefined;

  // Start the loader in the background
  loader().then(
    (res) => {
      result = res;
      loaderFinished = true;
    },
    (err) => {
      error = err;
      loaderFinished = true;
    }
  );

  // Animate the preloader
  let progress = 0;
  let direction = 1;
  const animationDelay = 60; // ms per frame

  socket.emit('ansi-output', ANSI.HIDE_CURSOR);

  while (!loaderFinished) {
    // Update progress for marquee effect
    progress += direction * 0.05;
    if (progress >= 1) {
      progress = 1;
      direction = -1;
    } else if (progress <= 0) {
      progress = 0;
      direction = 1;
    }

    const frame = createPreloaderFrame(doorName, progress);
    socket.emit('ansi-output', frame);

    await new Promise((resolve) => setTimeout(resolve, animationDelay));
  }

  socket.emit('ansi-output', ANSI.SHOW_CURSOR);

  if (error) {
    throw error;
  }

  return result as T;
}
