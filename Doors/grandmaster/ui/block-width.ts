/**
 * How many characters wide one board block is, and how to fit a block into it.
 *
 * A block is meant to look SQUARE, and how many characters that takes depends
 * on the shape of a character. An xterm cell is about half as wide as it is
 * tall, so two of them make a square - which is why every board in this door
 * draws blocks as two glyphs. A PETSCII cell is square already (a real C64
 * stretches it slightly taller than wide, which is nearer square still), so
 * two of them make a 2:1 rectangle: "its just the tetris games that have
 * stretched blocks" (2026-09-06).
 *
 * The width is applied at the SINK - where a row is assembled - rather than in
 * the eight things that produce a block (the piece, the ghost, the bone block,
 * the credit-roll fade, the shine, the glow, the line-clear fade, the
 * placement and back-to-back effects). They all agree on one canonical form:
 * two identical glyphs inside blessed colour tags. Projecting that form once,
 * where characters first become a row, is one rule in one place instead of
 * eight copies of it that can drift.
 */

/** The tier test the rest of this door uses, and no second one. */
export function blockCols(screenWidth: number): 1 | 2 {
  return screenWidth < 80 ? 1 : 2;
}

/**
 * A block cell, in `cols` characters.
 *
 * Tags are kept exactly as they are - they carry no width - and the visible
 * run is halved, so `{red-fg}██{/red-fg}` becomes `{red-fg}█{/red-fg}` and the
 * two blanks of an empty cell become one. A run whose glyphs DIFFER keeps its
 * first half, which is what the bone block (`[]`) and any future two-glyph
 * pattern needs: half of it, not a mangled pair.
 */
export function fitCell(cell: string, cols: number): string {
  if (cols >= 2) return cell;

  let out = '';
  let visible = '';
  const flush = () => {
    if (!visible) return;
    out += visible.slice(0, Math.ceil(visible.length / 2));
    visible = '';
  };

  for (let i = 0; i < cell.length; i++) {
    if (cell[i] === '{') {
      const end = cell.indexOf('}', i);
      if (end !== -1) {
        flush();
        out += cell.substring(i, end + 1);
        i = end;
        continue;
      }
    }
    visible += cell[i];
  }
  flush();
  return out;
}

/**
 * The seven pieces, as CELLS - one character per cell, `X` where a block is.
 *
 * There were three copies of this art: one in the game screen and two in the
 * versus screen (next and hold), each written as literal `██` pairs, which is
 * both a duplicate and a 2-character assumption baked into a string. One
 * table, drawn at whatever width the screen's block is.
 */
export const PIECE_CELLS: Record<string, readonly string[]> = {
  I: ['XXXX'],
  O: [' XX ', ' XX '],
  T: ['XXX', ' X '],
  S: [' XX', 'XX '],
  Z: ['XX ', ' XX'],
  J: ['X  ', 'XXX'],
  L: ['  X', 'XXX'],
};

/**
 * A piece preview, `cols` characters per cell, in one colour.
 *
 * The glyph is the same solid block the boards use; a gap is spaces, so the
 * rows stay aligned with each other whatever the width.
 */
export function pieceArt(type: string, cols: number, colour: string): string[] {
  const rows = PIECE_CELLS[type] ?? ['XX'];
  return rows.map((row) => {
    const drawn = [...row].map((c) => (c === 'X' ? '█'.repeat(cols) : ' '.repeat(cols))).join('');
    return `{${colour}-fg}${drawn}{/${colour}-fg}`;
  });
}

/**
 * Whether a cell on this screen can carry its own BACKGROUND colour.
 *
 * PETSCII cannot: the C64 has one screen background and no per-cell one, so
 * a `{x-bg}` tag is dropped on the way to the glass. Anything that put its
 * ink in `{black-fg}` and its colour in the background therefore rendered
 * black on black - invisible, while still occupying the cell. That is what
 * ate the TetriNET specials and the item cells: "some random pieces
 * disappeared when i played in petscii mode" (2026-09-06).
 *
 * The rule the C64 sprite sheets have followed since they were written -
 * "never set a background other than 0" - as a question a screen can answer.
 */
export function cellsCanCarryBackground(screen: unknown): boolean {
  return (screen as { petscii?: boolean })?.petscii !== true;
}
