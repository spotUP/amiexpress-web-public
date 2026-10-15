/**
 * ART THAT RELIES ON THE TERMINAL WRAPPING IT.
 *
 * Plenty of ANSI art carries no line terminators at all. It is drawn 80
 * columns wide and simply runs on, trusting the terminal to fold it at the
 * right margin - which a real caller's 80-column terminal always did.
 *
 * A web terminal is whatever width the browser window is. The sysop's was
 * about 125 columns, so his logoff logo folded in the wrong places and came
 * out as a smear; he reported it twice as "cut off" (2026-09-14). The file
 * was not damaged and the bytes all arrived: they were folded by a terminal
 * that was not the one the art was drawn for.
 *
 * So the board gives such art the line structure it was drawn with, instead
 * of leaving the fold to a terminal whose width the artist never saw.
 *
 * WHAT THIS MUST NOT TOUCH. Art that carries its own line breaks already says
 * where it folds, and that includes this board's 200-column BBSTITLE - 68
 * lines of roughly 200 columns each. Breaking those at 80 would destroy it.
 * The trigger is therefore "the art body is a single line", not "a line is
 * wider than 80": a file with no line structure of its own is the only kind
 * that is asking the terminal to supply one.
 */
import { isCodeOnlyLine } from './mci-carry';

/** The width a screen is drawn for when it does not say. AmiExpress's own. */
export const AUTHORED_WIDTH = 80;

/**
 * How many columns a terminal's cursor would be at after this text.
 *
 * Colour codes are zero width; `ESC[<n>C` moves the cursor right by n and so
 * does occupy columns, which is how much of this board's art does its
 * spacing. Counting it as zero would fold the line in the wrong place.
 */
const ANSI_SEQUENCE = /\x1b\[[0-9;?]*[A-Za-z]/;

/** Split into ANSI sequences and the runs of text between them. */
function tokenize(line: string): string[] {
  return line.split(/(\x1b\[[0-9;?]*[A-Za-z])/).filter(t => t !== '');
}

/** The columns a single ANSI sequence advances the cursor by. */
function columnsAdvanced(sequence: string): number {
  const forward = /^\x1b\[([0-9]*)C$/.exec(sequence);
  if (!forward) return 0;
  return forward[1] === '' ? 1 : parseInt(forward[1], 10);
}

/**
 * Fold one line the way a terminal of `width` columns would, and keep the
 * fold: every `width` columns become a real line.
 *
 * This is a HARD fold at the column, not a word wrap. Art is a grid - moving
 * a glyph to keep a word whole would shift the drawing.
 */
export function foldAtColumns(line: string, width: number): string[] {
  const out: string[] = [];
  let current = '';
  let column = 0;

  for (const token of tokenize(line)) {
    if (ANSI_SEQUENCE.test(token) && token.startsWith('\x1b')) {
      const advance = columnsAdvanced(token);
      // A cursor-forward that would cross the margin folds like text does.
      if (advance > 0 && column + advance > width) {
        const fits = width - column;
        if (fits > 0) current += ' '.repeat(fits);
        out.push(current);
        current = '';
        column = advance - fits;
        if (column > 0) current += ' '.repeat(column);
        continue;
      }
      current += token;
      column += advance;
      continue;
    }

    for (const char of token) {
      if (column >= width) { out.push(current); current = ''; column = 0; }
      current += char;
      column += 1;
    }
  }

  if (current !== '') out.push(current);
  return out;
}

/**
 * Whether this screen is art with no line structure of its own.
 *
 * One art line - codes and blanks do not count, a screen's `~f` or `~SR_`
 * head is not its drawing - and that line runs past the margin.
 */
export function needsAuthoredWrap(content: string, width = AUTHORED_WIDTH): boolean {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const art = lines.filter(l => l.trim() !== '' && !isCodeOnlyLine(l));
  if (art.length !== 1) return false;
  return foldAtColumns(art[0], width).length > 1;
}

/**
 * The same screen, folded where it was drawn to fold.
 *
 * Inert for every screen that carries its own line breaks: the content comes
 * back byte for byte.
 */
export function applyAuthoredWrap(content: string, width = AUTHORED_WIDTH): string {
  if (!needsAuthoredWrap(content, width)) return content;

  const ending = content.includes('\r\n') ? '\r\n' : '\n';
  return content
    .split('\n')
    .map(raw => {
      const line = raw.replace(/\r$/, '');
      if (line.trim() === '' || isCodeOnlyLine(line)) return raw;
      return foldAtColumns(line, width).join(ending);
    })
    .join('\n');
}
