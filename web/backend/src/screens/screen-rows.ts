/**
 * How many rows a screen occupies, and whether the board will paginate it.
 *
 * ONE definition, because the arithmetic has a trap in it and the board now
 * has more than one thing that must fit: the Last Callers bulletin trims its
 * caller list to the screen, and the SVT news bulletins trim their headlines.
 * A second copy of an off-by-one is two bugs.
 *
 * THE TRAP. `content.split('\n').length` is what `screen.handler`'s
 * `needsPaging` compares against the caller's height - and a file ending in a
 * newline, which every one of these does, yields a final empty element that
 * is not a row. SamiLogService's fit compared that number against its budget,
 * so a bulletin it believed was 24 rows was 25, and a screen built
 * specifically to avoid a page break got one (2026-09-15).
 *
 * So a screen escapes pagination when its REAL rows are at most one less than
 * the caller's height, and `fitsScreen` is the question asked in the loader's
 * own terms rather than in rows - which is the form that cannot be got wrong.
 */

/**
 * The shortest terminal a GENERATED screen has to fit.
 *
 * A bulletin is written at LOGOFF, with nobody on the board - there is no
 * caller to ask how tall their terminal is, so it must fit the shortest one
 * it might later be shown on. That is 24: the ANSI standard is 80x24, and
 * this board's own default says so in three places (config.ts,
 * session-manager, index.ts all fall back to `screenHeight: 24`).
 *
 * I built the first fit against 25 - the Amiga and C64 convention - and the
 * sysop met `(Pause)...More(y/n/ns)?` on a bulletin the suite called fitted
 * (2026-09-15). Fitting the shorter terminal fits the taller one too; the
 * reverse is what shipped.
 */
export const SHORTEST_TERMINAL_ROWS = 24;

/** The rows a caller sees - the trailing newline does not make one. */
export function renderedRows(text: string): number {
  const parts = text.split('\n');
  return text.endsWith('\n') ? parts.length - 1 : parts.length;
}

/**
 * Would `screen.handler` paginate this on a `height`-row terminal?
 *
 * Mirrors `needsPaging`: it compares the SPLIT length, phantom element and
 * all, so this does too rather than reasoning about the difference.
 */
export function paginatesAt(text: string, height: number): boolean {
  return text.split('\n').length > height;
}

/**
 * The tallest a generated screen may be and still arrive whole on a
 * `height`-row terminal.
 *
 * One less than the height, for the reason above. Generators take a budget in
 * ROWS, so this is where the -1 lives instead of in each of them.
 */
export function rowBudgetFor(height: number = SHORTEST_TERMINAL_ROWS): number {
  return Math.max(1, height - 1);
}

/**
 * The budget every generated screen on this board is written to.
 *
 * Named rather than passed, so the next generator that has to fit a screen
 * cannot pick its own number - which is how the last two came to disagree.
 */
export const GENERATED_SCREEN_ROWS = rowBudgetFor(SHORTEST_TERMINAL_ROWS);
