/**
 * THE SETTINGS MENU ON A SCREEN THAT DOES NOT SCROLL.
 *
 * "scrollback doesnt work in petscii mode so i cant see all options in w"
 * (the sysop, 2026-09-23). It does not, and it should not: a C64 has 25 rows
 * and no scrollback, which is the machine, not a defect. The menu is what has
 * to fit.
 *
 * Measured before it was changed - the real `W` menu, driven on a 40x25
 * session: 28 rows, of which five are longer than 40 columns and so wrap to
 * two. Thirty-three rows on a screen that holds twenty-five, and the caller
 * loses the top third of his own settings.
 *
 * Two rules, in this order:
 *
 *   SQUEEZE - a row is made to fit by eating its DOT LEADER, which is padding
 *   and nothing else. `[ 17] MODEM EMULATION SPEED.. MAX (No Throttle)` keeps
 *   its number, its name and its value; it loses dots. Only when the dots run
 *   out is the value cut, and then it is cut, never wrapped: a wrapped row
 *   costs a whole screen row and reads as a second option.
 *
 *   PAGE - what is left is handed out a screenful at a time, and the prompt
 *   says so. The caller still types the number he wants from any page; the
 *   page is only what he can SEE.
 *
 * Eighty columns never reaches this file: every row already fits, and the
 * board's own screen is untouched.
 */

/** Visible width, with the SGR the row is coloured with taken out. */
export function visibleLength(line: string): number {
  return line.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').length;
}

/** The shortest a label may be cut to before the value is touched. */
const LABEL_FLOOR = 12;

/**
 * One row, made to fit `cols`, giving up the least useful part first.
 *
 * The order is deliberate, because the three parts of a settings row are not
 * worth the same:
 *
 *   1. THE DOT LEADER. Padding by construction - `LABEL...... value` - so it
 *      is the one part that carries nothing. One dot is kept, or the label
 *      runs into its value.
 *   2. THE LABEL, down to `LABEL_FLOOR`. `MODEM EMULATI` still names the row,
 *      and the number in front of it is what the caller actually types.
 *   3. THE VALUE, last and only if the row is still too wide. It is the part
 *      the caller opened the menu to READ - "is my character set Swedish?" -
 *      so it is the last thing to go.
 *
 * A row that is not a settings row (the heading, a blank) is simply cut.
 */
export function squeezeRow(line: string, cols: number): string {
  if (visibleLength(line) <= cols) return line;

  const parts = /^([\s\S]*?\]\s*(?:\x1b\[[0-9;?]*[a-zA-Z])*)([^.\x1b]*?)(\.{2,})([\s\S]*)$/.exec(line);
  if (!parts) return cutToWidth(line, cols);

  const [, head, label, leader, tail] = parts;
  const fixed = visibleLength(head) + visibleLength(tail);

  // What the label may have once the value and one dot are paid for.
  const room = cols - fixed - 1;

  if (room >= label.length) {
    // The whole label fits: the leader takes what is left, one dot minimum.
    const dots = Math.max(1, Math.min(leader.length, cols - fixed - label.length));
    return head + label + '.'.repeat(dots) + tail;
  }

  if (room >= LABEL_FLOOR) return head + label.slice(0, room) + '.' + tail;

  // Even a floor-length label does not fit beside the value, so the VALUE is
  // what gives now - cut, never wrapped, because a wrapped row costs a whole
  // screen row and reads as a second option.
  const kept = head + label.slice(0, LABEL_FLOOR) + '. ' + tail.trimStart();
  return cutToWidth(kept, cols);
}

/**
 * Cut a coloured row to `cols` VISIBLE columns, keeping its escapes.
 *
 * The escapes are kept because the row's colour is closed by a later one -
 * dropping a reset would leak the colour into the rest of the screen.
 */
function cutToWidth(line: string, cols: number): string {
  let out = '';
  let width = 0;
  let i = 0;
  while (i < line.length) {
    const escape = /^\x1b\[[0-9;?]*[a-zA-Z]/.exec(line.slice(i));
    if (escape) {
      out += escape[0];
      i += escape[0].length;
      continue;
    }
    if (width >= cols) {
      // Past the edge: keep only what is left of the escapes.
      i++;
      continue;
    }
    out += line[i];
    width++;
    i++;
  }
  return out;
}

export interface WMenuPage {
  /** The rows to paint, already squeezed to the caller's width. */
  rows: string[];
  /** Which page this is, from 1. */
  page: number;
  /** How many there are. */
  pages: number;
}

/**
 * The menu, squeezed and cut into pages of `rows` painted rows.
 *
 * `page` is clamped rather than rejected: a caller who asks for the page
 * after the last one gets the last one, which is what `+` on the final page
 * should do.
 */
export function wMenuPage(lines: string[], cols: number, rows: number, page: number): WMenuPage {
  const squeezed = lines.map((line) => squeezeRow(line, cols));
  const perPage = Math.max(1, rows);
  const pages = Math.max(1, Math.ceil(squeezed.length / perPage));
  const wanted = Math.min(Math.max(1, page), pages);
  return {
    rows: squeezed.slice((wanted - 1) * perPage, wanted * perPage),
    page: wanted,
    pages,
  };
}

/** The prompt, which says how to reach the rest of the menu when there is one. */
export function wMenuPrompt(page: WMenuPage): string {
  if (page.pages <= 1) return 'Which to change <CR>=QUIT ? ';
  return `Which to change <CR>=QUIT, +=page ${page.page}/${page.pages} ? `;
}

/** Did the caller ask for another page rather than an option? */
export function wMenuPageStep(input: string): number | null {
  const trimmed = input.trim().toUpperCase();
  if (trimmed === '+' || trimmed === 'N') return 1;
  if (trimmed === '-' || trimmed === 'P') return -1;
  return null;
}
