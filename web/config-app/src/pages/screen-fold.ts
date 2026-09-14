/**
 * Where the caller's screen ends, and what falls past it.
 *
 * "if i remove lines i need to see how big the actual screen is, and what is
 * outside the screen" - and "this is true for all our editors" (sysop,
 * 2026-09-14). An editor shows a file; a caller sees a SCREENFUL at a time,
 * and nothing in any editor said where one ended. Art trimmed to "about
 * right" was guesswork.
 *
 * THE RULE IS THE BOARD'S, not a guess: `displayScreen` paginates at
 * `pageHeight - 1` where `pageHeight` is `session.screenHeight || 25`
 * (screen.handler.ts:2673-2675). The lost row is the More prompt's - the
 * board keeps one line to ask.
 */

/** A caller's terminal, unless their own setting says otherwise. */
export const DEFAULT_SCREEN_ROWS = 25;

/**
 * Lines a caller is shown before the board stops to ask.
 *
 * One less than the terminal's height: the More prompt needs a row of its
 * own. A 25-row terminal therefore shows 24 lines of art.
 */
export function screenfulRows(screenRows: number = DEFAULT_SCREEN_ROWS): number {
  return Math.max(1, screenRows - 1);
}

/** The row indexes (0-based) AFTER which the caller meets a More prompt. */
export function foldRows(totalRows: number, screenRows: number = DEFAULT_SCREEN_ROWS): number[] {
  const perScreen = screenfulRows(screenRows);
  const folds: number[] = [];
  for (let after = perScreen; after < totalRows; after += perScreen) folds.push(after);
  return folds;
}

/** How many screenfuls the caller walks through to see all of it. */
export function screenfuls(totalRows: number, screenRows: number = DEFAULT_SCREEN_ROWS): number {
  return Math.max(1, Math.ceil(totalRows / screenfulRows(screenRows)));
}

/**
 * The sentence the editor shows, in the artist's terms rather than the
 * board's: how much of this is on the first screen, and how much is not.
 */
export function describeFold(totalRows: number, screenRows: number = DEFAULT_SCREEN_ROWS): string {
  const perScreen = screenfulRows(screenRows);
  const pages = screenfuls(totalRows, screenRows);
  if (pages === 1) {
    const left = perScreen - totalRows;
    if (left <= 0) return `${totalRows} lines - fills the caller's screen exactly`;
    return `${totalRows} lines - fits, ${left} to spare before the caller has to press a key`;
  }
  const past = totalRows - perScreen;
  return `${totalRows} lines - ${pages} screenfuls; ${past} past the first, so the caller presses a key to see ${past === 1 ? 'it' : 'them'}`;
}
